// @vitest-environment node
//
// Verificación de supuestos del Sprint 004 (orden § Verificación de supuestos 2):
// que las APIs de sklearn que el sprint PROMETE existan y se comporten como se
// diseñó ANTES de construir sobre ellas — en el Pyodide/WASM real, no de memoria.
//
//   (a) HistGradientBoosting{Classifier,Regressor} importan (boosting sin fallback).
//   (b) OneHotEncoder(min_frequency=2) agrupa categorías raras, y la agrupación se
//       APRENDE SOLO DE FIT (base del saneamiento anti-fuga in-pipeline del ADR-002
//       extendido: la extensión estadística nunca mira el test).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadPyodide, type PyodideInterface } from "pyodide";

let pyodide: PyodideInterface;

beforeAll(async () => {
  pyodide = await loadPyodide();
  await pyodide.loadPackage(["pandas", "scikit-learn"]);
}, 180_000);

type Supuestos = {
  hgb_classifier: boolean;
  hgb_regressor: boolean;
  infrequent_categories: string[];
  feature_names: string[];
  transform_c: number[];
  transform_unseen: number[];
};

function checkSupuestos(): Supuestos {
  const code = readFileSync(
    resolve(process.cwd(), "tests/integration/fixtures/f0-supuestos.py"),
    "utf8",
  );
  return JSON.parse(pyodide.runPython(code) as string) as Supuestos;
}

describe("supuestos del sprint en el Pyodide real", () => {
  it("HistGradientBoosting{Classifier,Regressor} están disponibles", () => {
    const r = checkSupuestos();
    expect(r.hgb_classifier).toBe(true);
    expect(r.hgb_regressor).toBe(true);
  });

  it("OneHotEncoder(min_frequency=2) agrupa la categoría rara (aprendida de fit)", () => {
    const r = checkSupuestos();
    // Fit sobre a×3, b×2, c×1 ⇒ solo "c" cae por debajo de min_frequency=2.
    expect(r.infrequent_categories).toEqual(["c"]);
    // El encoder expone una columna infrecuente distinta de las categorías retenidas.
    const infrequentCol = r.feature_names.find((n) => n.includes("infrequent"));
    expect(infrequentCol).toBeDefined();
  });

  it("la agrupación viene SOLO de fit: 'c' rara y una categoría nunca vista caen al mismo bucket", () => {
    const r = checkSupuestos();
    const idx = r.feature_names.findIndex((n) => n.includes("infrequent"));
    expect(idx).toBeGreaterThanOrEqual(0);
    // "c" abunda en transform pero fue rara en fit ⇒ sigue en el bucket infrecuente.
    expect(r.transform_c[idx]).toBe(1);
    // Una categoría jamás vista en fit ("z") también cae al bucket infrecuente.
    expect(r.transform_unseen[idx]).toBe(1);
  });
});
