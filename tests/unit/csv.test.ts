import { describe, expect, it } from "vitest";
import {
  isBinaryTarget,
  isNullToken,
  parseCsvWithLimits,
  parseNumber,
  parseRows,
  profileColumn,
  targetClasses,
} from "@/lib/ds/csv";

describe("parseRows", () => {
  it("parsea filas simples", () => {
    expect(parseRows("a,b\n1,2\n3,4\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("respeta comas dentro de comillas", () => {
    expect(parseRows('nombre,nota\n"Pérez, Ana",10\n')).toEqual([
      ["nombre", "nota"],
      ["Pérez, Ana", "10"],
    ]);
  });

  it("respeta saltos de línea y comillas escapadas dentro de comillas", () => {
    const rows = parseRows('c\n"línea1\nlínea2"\n"dijo ""hola"""\n');
    expect(rows).toEqual([["c"], ["línea1\nlínea2"], ['dijo "hola"']]);
  });

  it("tolera CRLF y la última fila sin salto final", () => {
    expect(parseRows("a,b\r\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseCsvWithLimits", () => {
  it("separa cabecera de filas de datos", () => {
    const result = parseCsvWithLimits("a,b\n1,2\n3,4\n");
    expect(result).toEqual({
      ok: true,
      table: {
        headers: ["a", "b"],
        rows: [
          ["1", "2"],
          ["3", "4"],
        ],
      },
    });
  });

  it("rechaza un archivo vacío o solo con cabecera", () => {
    expect(parseCsvWithLimits("").ok).toBe(false);
    expect(parseCsvWithLimits("a,b\n")).toMatchObject({
      ok: false,
      error: { kind: "empty" },
    });
  });

  it("rechaza por exceso de bytes con mensaje honesto", () => {
    const result = parseCsvWithLimits("a,b\n1,2\n", { maxBytes: 4 });
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "too-large", maxBytes: 4 },
    });
  });

  it("rechaza por exceso de filas", () => {
    const text = "a\n" + "1\n".repeat(5);
    const result = parseCsvWithLimits(text, { maxRows: 3 });
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "too-many-rows", rows: 5, maxRows: 3 },
    });
  });

  it("detecta filas con número de columnas inconsistente", () => {
    const result = parseCsvWithLimits("a,b,c\n1,2,3\n4,5\n");
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "ragged", row: 3, expected: 3, found: 2 },
    });
  });
});

describe("primitivas de tipo", () => {
  it("isNullToken reconoce tokens nulos comunes", () => {
    for (const token of ["", " ", "NA", "n/a", "null", "NaN", "-"]) {
      expect(isNullToken(token)).toBe(true);
    }
    expect(isNullToken("0")).toBe(false);
  });

  it("parseNumber devuelve número o null", () => {
    expect(parseNumber(" 3.5 ")).toBe(3.5);
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("")).toBeNull();
  });
});

describe("profileColumn", () => {
  it("clasifica una columna numérica y cuenta nulos", () => {
    const p = profileColumn("edad", ["30", "", "45", "NA", "50"]);
    expect(p).toMatchObject({ kind: "numeric", nulls: 2, cardinality: 3 });
  });

  it("clasifica una columna categórica", () => {
    const p = profileColumn("region", ["norte", "sur", "norte"]);
    expect(p).toMatchObject({
      kind: "categorical",
      cardinality: 2,
      looksLikeDate: false,
    });
  });

  it("detecta columnas que parecen fecha", () => {
    const p = profileColumn("alta", ["2024-01-01", "2024-03-15", "2024-06-30"]);
    expect(p.looksLikeDate).toBe(true);
    expect(p.kind).toBe("categorical");
  });
});

describe("objetivo binario", () => {
  it("targetClasses ignora nulos", () => {
    expect(targetClasses(["si", "no", "", "si"]).sort()).toEqual(["no", "si"]);
  });

  it("isBinaryTarget exige exactamente dos clases", () => {
    expect(isBinaryTarget(["0", "1", "0"])).toBe(true);
    expect(isBinaryTarget(["a", "b", "c"])).toBe(false);
  });
});
