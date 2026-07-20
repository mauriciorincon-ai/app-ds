// @vitest-environment node
//
// Integración S4 (Pyodide/WASM) — el saneamiento ESTADÍSTICO vive dentro del
// pipeline retenido y se ajusta SOLO en train (extensión del ADR-002). Este es el
// test que la DoD exige: FALLA si la agrupación de categorías raras (min_frequency)
// se aprende de algo que no sea train. Más: HGB entrena y compite; el ganador es
// el argmax de la métrica primaria.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadPyodide, type PyodideInterface } from "pyodide";
import type { PipelineResult } from "@/workers/protocol";

let pyodide: PyodideInterface;
type PyFn = (payloadJson: string) => string;
let runExperiment: PyFn;

beforeAll(async () => {
  pyodide = await loadPyodide();
  await pyodide.loadPackage(["pandas", "scikit-learn"]);
  pyodide.runPython(
    readFileSync(resolve(process.cwd(), "src/lib/ds/pipeline.py"), "utf8"),
  );
  runExperiment = pyodide.globals.get("run_experiment") as unknown as PyFn;
}, 180_000);

const run = (payload: unknown): PipelineResult =>
  JSON.parse(runExperiment(JSON.stringify(payload))) as PipelineResult;

describe("saneamiento estadístico dentro del pipeline (integración Pyodide)", () => {
  it("agrupa categorías raras aprendiendo SOLO de train (min_frequency)", () => {
    // TRAIN: "rara" aparece 1 sola vez ⇒ infrecuente (min_frequency=2). "comun"
    // abunda. TEST tiene "rara" muchas veces — pero eso NO debe cambiar la
    // decisión: la infrecuencia se decide con la frecuencia de TRAIN, no de test.
    const trainRows = [
      ["10", "comun", "0"],
      ["12", "comun", "0"],
      ["14", "comun", "0"],
      ["16", "comun", "1"],
      ["18", "comun", "1"],
      ["20", "comun", "1"],
      ["22", "comun", "1"],
      ["24", "rara", "0"], // única aparición de "rara" en train
    ];
    // Filas de test: "rara" repetida (abundante en test) — no debe "des-rarificarla".
    const testRows = [
      ["30", "rara", "1"],
      ["32", "rara", "1"],
      ["34", "rara", "1"],
      ["36", "comun", "0"],
    ];
    const rows = [...trainRows, ...testRows];
    const result = run({
      headers: ["x", "cat", "y"],
      rows,
      target: "y",
      numeric: ["x"],
      categorical: ["cat"],
      train_idx: [0, 1, 2, 3, 4, 5, 6, 7],
      test_idx: [8, 9, 10, 11],
      seed: 42,
      primary_metric: "f1",
    });

    // "rara" (1 vez en train) queda agrupada; "comun" no. Si la agrupación mirara
    // TODO el dataset, "rara" (4 veces en total) NO sería infrecuente y esto fallaría.
    expect(result.preprocessing?.rare_categories).toEqual({ cat: ["rara"] });
  });

  it("no reporta categorías raras cuando todas son frecuentes", () => {
    const rows = Array.from({ length: 20 }, (_, i) => [
      String(i),
      i % 2 === 0 ? "a" : "b", // a y b abundantes ⇒ ninguna rara
      i % 2 === 0 ? "0" : "1",
    ]);
    const result = run({
      headers: ["x", "cat", "y"],
      rows,
      target: "y",
      numeric: ["x"],
      categorical: ["cat"],
      train_idx: Array.from({ length: 15 }, (_, i) => i),
      test_idx: [15, 16, 17, 18, 19],
      seed: 1,
      primary_metric: "f1",
    });
    expect(result.preprocessing?.rare_categories).toEqual({});
  });
});

describe("multi-candidato con boosting (integración Pyodide)", () => {
  function balancedRun(primaryMetric: "auc" | "f1"): PipelineResult {
    // Señal aprendible (x alto ⇒ clase 1) para que ambos candidatos entrenen bien.
    const rows = Array.from({ length: 40 }, (_, i) => [
      String(i),
      i >= 20 ? "1" : "0",
    ]);
    return run({
      headers: ["x", "y"],
      rows,
      target: "y",
      numeric: ["x"],
      categorical: [],
      train_idx: Array.from({ length: 30 }, (_, i) => i),
      test_idx: Array.from({ length: 10 }, (_, i) => i + 30),
      seed: 42,
      primary_metric: primaryMetric,
    });
  }

  it("entrena forest y hgb como candidatos y retorna ambos", () => {
    const result = balancedRun("f1");
    expect(result.candidates.map((c) => c.name).sort()).toEqual([
      "forest",
      "hgb",
    ]);
    for (const c of result.candidates) {
      expect(c.metrics.auc).toBeGreaterThanOrEqual(0);
      expect(c.metrics.auc).toBeLessThanOrEqual(1);
    }
  });

  it("el ganador (model_name) es el argmax de la métrica primaria; model = sus métricas", () => {
    const result = balancedRun("auc");
    const byName = Object.fromEntries(
      result.candidates.map((c) => [c.name, c.metrics.auc]),
    );
    const expectedWinner = byName.hgb > byName.forest ? "hgb" : "forest"; // empate → forest
    expect(result.model_name).toBe(expectedWinner);
    expect(result.model.auc).toBe(byName[expectedWinner]);
  });
});
