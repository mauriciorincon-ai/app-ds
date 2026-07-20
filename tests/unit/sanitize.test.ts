import { describe, expect, it } from "vitest";
import type { CsvTable } from "@/lib/ds/csv";
import { sanitizeTable } from "@/engine/sanitize";

function table(headers: string[], rows: string[][]): CsvTable {
  return { headers, rows };
}

describe("sanitizeTable — dataset limpio", () => {
  it("no toca nada y reporta clean:true", () => {
    const t = table(
      ["edad", "region", "y"],
      [
        ["30", "norte", "0"],
        ["45", "sur", "1"],
        ["50", "norte", "0"],
        ["28", "sur", "1"],
      ],
    );
    const { table: out, report } = sanitizeTable(t);
    expect(report.clean).toBe(true);
    expect(report.duplicateRowsRemoved).toBe(0);
    expect(report.exclusions).toEqual([]);
    expect(report.coercions).toEqual([]);
    expect(report.usable).toBe(true);
    // La tabla sale idéntica (mismas columnas y filas).
    expect(out).toEqual(t);
  });
});

describe("sanitizeTable — exclusión de columnas", () => {
  it("excluye una columna-ID exacta (todos distintos, sin nulos)", () => {
    const t = table(
      ["id", "edad", "y"],
      [
        ["a1", "30", "0"],
        ["a2", "45", "1"],
        ["a3", "50", "0"],
        ["a4", "28", "1"],
      ],
    );
    const { table: out, report } = sanitizeTable(t);
    expect(report.exclusions).toEqual([{ column: "id", reason: "id-column" }]);
    expect(out.headers).toEqual(["edad", "y"]);
    expect(out.rows[0]).toEqual(["30", "0"]);
    expect(report.clean).toBe(false);
  });

  it("NO excluye una columna casi-ID (una repetición ⇒ no es unicidad exacta)", () => {
    const t = table(
      ["casi_id", "y"],
      [
        ["a1", "0"],
        ["a2", "1"],
        ["a3", "0"],
        ["a3", "1"], // repetido ⇒ cardinalidad 3 < 4 filas
      ],
    );
    const { report } = sanitizeTable(t);
    expect(report.exclusions).toEqual([]);
  });

  it("excluye una columna constante (un solo valor)", () => {
    const t = table(
      ["pais", "edad", "y"],
      [
        ["MX", "30", "0"],
        ["MX", "45", "1"],
        ["MX", "50", "0"],
        ["MX", "28", "1"],
      ],
    );
    const { table: out, report } = sanitizeTable(t);
    expect(report.exclusions).toEqual([
      { column: "pais", reason: "constant-column" },
    ]);
    expect(out.headers).toEqual(["edad", "y"]);
  });
});

describe("sanitizeTable — dedup de filas exactas (previene fuga por duplicación)", () => {
  it("elimina filas idénticas conservando la primera", () => {
    const t = table(
      ["edad", "region", "y"],
      [
        ["30", "norte", "0"],
        ["45", "sur", "1"],
        ["30", "norte", "0"], // duplicado exacto
        ["50", "norte", "0"],
        ["45", "sur", "1"], // duplicado exacto
      ],
    );
    const { table: out, report } = sanitizeTable(t);
    expect(report.duplicateRowsRemoved).toBe(2);
    expect(report.rowsBefore).toBe(5);
    expect(report.rowsAfter).toBe(3);
    expect(out.rows).toEqual([
      ["30", "norte", "0"],
      ["45", "sur", "1"],
      ["50", "norte", "0"],
    ]);
  });

  it("un ID con filas duplicadas se vuelve exacto tras el dedup y se excluye", () => {
    // id repetido en 2 filas idénticas: pre-dedup cardinalidad 3/4; post-dedup 3/3.
    const t = table(
      ["id", "edad", "y"],
      [
        ["x1", "30", "0"],
        ["x2", "45", "1"],
        ["x3", "50", "0"],
        ["x1", "30", "0"], // fila idéntica completa
      ],
    );
    const { table: out, report } = sanitizeTable(t);
    expect(report.duplicateRowsRemoved).toBe(1);
    expect(report.exclusions).toEqual([{ column: "id", reason: "id-column" }]);
    expect(out.headers).toEqual(["edad", "y"]);
  });
});

describe("sanitizeTable — coerción de numéricas mixtas", () => {
  it("convierte basura a nulo cuando ≥90% de la columna es numérica", () => {
    // 11 numéricos + 1 "error" = 12 no nulos ⇒ 11/12 ≈ 0.917 ≥ 0.9.
    const rows = Array.from({ length: 12 }, (_, i) => [
      i === 5 ? "error" : String(20 + i),
      i % 2 === 0 ? "0" : "1",
    ]);
    const t = table(["edad", "y"], rows);
    const { table: out, report } = sanitizeTable(t);
    expect(report.coercions).toEqual([{ column: "edad", cellsNulled: 1 }]);
    // La celda basura quedó en nulo (token vacío); las numéricas intactas.
    expect(out.rows[5][0]).toBe("");
    expect(out.rows[0][0]).toBe("20");
  });

  it("NO coacciona una columna genuinamente categórica (mayoría no numérica)", () => {
    const t = table(
      ["region", "y"],
      [
        ["norte", "0"],
        ["sur", "1"],
        ["norte", "0"],
        ["este", "1"],
        ["sur", "0"],
        ["norte", "1"],
        ["12", "0"], // un número suelto (1/8) no la vuelve numérica
        ["este", "1"],
      ],
    );
    const { table: out, report } = sanitizeTable(t);
    expect(report.coercions).toEqual([]);
    // Y tampoco se excluye: repite categorías ⇒ no es identificador.
    expect(report.exclusions).toEqual([]);
    expect(out.headers).toEqual(["region", "y"]);
  });
});

describe("sanitizeTable — irrecuperable", () => {
  it("marca usable:false cuando no queda estructura (todo constante/ID)", () => {
    const t = table(
      ["id", "pais"],
      [
        ["a1", "MX"],
        ["a2", "MX"],
        ["a3", "MX"],
      ],
    );
    const { report } = sanitizeTable(t);
    // id excluido (ID exacta) + pais excluido (constante) ⇒ 0 columnas.
    expect(report.exclusions).toHaveLength(2);
    expect(report.colsAfter).toBe(0);
    expect(report.usable).toBe(false);
  });
});
