import { describe, expect, it } from "vitest";
import { parseRows, type CsvTable } from "@/lib/ds/csv";
import {
  buildScoredCsv,
  estimateSummary,
  neutralizeFormula,
  resolveScoredColumnNames,
  scoredCsvFileName,
} from "@/lib/scored-csv";

const NAMES = { prediction: "prediccion", probability: "probabilidad_si" };

const TABLE: CsvTable = {
  headers: ["edad", "region"],
  rows: [
    ["34", "norte"],
    ["51", "sur"],
  ],
};

describe("resolveScoredColumnNames", () => {
  it("sin colisión devuelve los nombres deseados", () => {
    expect(resolveScoredColumnNames(TABLE.headers, NAMES)).toEqual(NAMES);
  });

  it("colisión ⇒ sufijo determinista _2", () => {
    const resolved = resolveScoredColumnNames(
      ["edad", "prediccion", "probabilidad_si"],
      NAMES,
    );
    expect(resolved).toEqual({
      prediction: "prediccion_2",
      probability: "probabilidad_si_2",
    });
  });

  it("colisión encadenada ⇒ _3 (nunca pisa una columna del usuario)", () => {
    const resolved = resolveScoredColumnNames(
      ["prediccion", "prediccion_2"],
      NAMES,
    );
    expect(resolved.prediction).toBe("prediccion_3");
  });

  it("las dos columnas nuevas no colisionan entre sí", () => {
    const resolved = resolveScoredColumnNames(["x"], {
      prediction: "resultado",
      probability: "resultado",
    });
    expect(resolved).toEqual({
      prediction: "resultado",
      probability: "resultado_2",
    });
  });
});

describe("buildScoredCsv", () => {
  it("añade predicción (etiqueta original) y probabilidad a CADA fila", () => {
    const csv = buildScoredCsv(TABLE, ["si", "no"], [0.91234, 0.2], NAMES);
    const rows = parseRows(csv);
    expect(rows).toEqual([
      ["edad", "region", "prediccion", "probabilidad_si"],
      ["34", "norte", "si", "0.9123"],
      ["51", "sur", "no", "0.2000"],
    ]);
  });

  it("preserva todas las columnas del usuario (también las ignoradas)", () => {
    const table: CsvTable = {
      headers: ["edad", "notas_libres"],
      rows: [["34", "cliente vip"]],
    };
    const csv = buildScoredCsv(table, ["si"], [0.5], NAMES);
    expect(parseRows(csv)[1]).toEqual(["34", "cliente vip", "si", "0.5000"]);
  });

  it("escapa RFC-4180: comas, comillas y saltos de línea (roundtrip)", () => {
    const table: CsvTable = {
      headers: ["nombre, apellido", "nota"],
      rows: [['dijo "hola"', "línea1\nlínea2"]],
    };
    const csv = buildScoredCsv(table, ["si"], [1], NAMES);
    // El parser RFC-4180 del repo debe recuperar los valores EXACTOS.
    expect(parseRows(csv)).toEqual([
      ["nombre, apellido", "nota", "prediccion", "probabilidad_si"],
      ['dijo "hola"', "línea1\nlínea2", "si", "1.0000"],
    ]);
  });

  it("usa los nombres resueltos cuando hay colisión", () => {
    const table: CsvTable = { headers: ["prediccion"], rows: [["x"]] };
    const csv = buildScoredCsv(table, ["no"], [0.1], NAMES);
    expect(parseRows(csv)[0]).toEqual([
      "prediccion",
      "prediccion_2",
      "probabilidad_si",
    ]);
  });

  it("S5: modelo sin probabilidad (null) ⇒ la columna no se agrega (no se inventa)", () => {
    const csv = buildScoredCsv(TABLE, ["si", "no"], null, NAMES);
    const [header, ...rows] = parseRows(csv);
    expect(header).toEqual(["edad", "region", "prediccion"]);
    expect(rows).toEqual([
      ["34", "norte", "si"],
      ["51", "sur", "no"],
    ]);
  });

  it("una celda que una hoja de cálculo ejecutaría como fórmula sale como texto (AU-S6-33)", () => {
    expect(neutralizeFormula("=1+1")).toBe("'=1+1");
    expect(neutralizeFormula('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(neutralizeFormula("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(neutralizeFormula("+cmd")).toBe("'+cmd");
    expect(neutralizeFormula("\tx")).toBe("'\tx");
    // Un número no es una fórmula: la tabla del usuario no se toca.
    expect(neutralizeFormula("-12.5")).toBe("-12.5");
    expect(neutralizeFormula("+3")).toBe("+3");
    expect(neutralizeFormula("norte")).toBe("norte");
    const table: CsvTable = {
      headers: ["@x", "nota"],
      rows: [["1", "=1+1"]],
    };
    const [header, row] = parseRows(
      buildScoredCsv(table, ["-si"], null, NAMES),
    );
    expect(header).toEqual(["'@x", "nota", "prediccion"]);
    expect(row).toEqual(["1", "'=1+1", "'-si"]);
  });

  it("longitudes inconsistentes ⇒ error (jamás puntúa a medias)", () => {
    expect(() => buildScoredCsv(TABLE, ["si"], [0.5, 0.5], NAMES)).toThrow();
    expect(() => buildScoredCsv(TABLE, ["si", "no"], [0.5], NAMES)).toThrow();
  });
});

describe("scoredCsvFileName", () => {
  it("slug + sufijo localizado", () => {
    expect(scoredCsvFileName("Ventas Q1.csv", "puntuado")).toBe(
      "ventas-q1-puntuado.csv",
    );
    expect(scoredCsvFileName("Ventas Q1.csv", "scored")).toBe(
      "ventas-q1-scored.csv",
    );
  });

  it("nombre vacío ⇒ fallback 'datos'", () => {
    expect(scoredCsvFileName("···", "puntuado")).toBe("datos-puntuado.csv");
  });
});

describe("estimateSummary (S6, AU-S6-41)", () => {
  it("mínimo, mediana y máximo; mediana par = promedio de las dos centrales; vacío = null", () => {
    expect(estimateSummary([3, 1, 2])).toEqual({ min: 1, median: 2, max: 3 });
    expect(estimateSummary([4, 1, 3, 2])).toEqual({
      min: 1,
      median: 2.5,
      max: 4,
    });
    expect(estimateSummary([])).toBeNull();
  });
});
