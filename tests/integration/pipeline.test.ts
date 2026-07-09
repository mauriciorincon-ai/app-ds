// @vitest-environment node
//
// Test de integración (Pyodide/WASM) del pipeline anti-fuga. Es el test que la
// DoD exige: FALLA si alguien ajusta el preprocesador sobre todo el dataset en
// vez de solo sobre train. Corre en su propia config (vitest.integration.config)
// con entorno node y timeout amplio (carga Pyodide + pandas + scikit-learn).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadPyodide, type PyodideInterface } from "pyodide";

let pyodide: PyodideInterface;
// PyProxy invocable: run_experiment(payload_json) -> result_json
let runExperiment: (payloadJson: string) => string;

beforeAll(async () => {
  pyodide = await loadPyodide();
  await pyodide.loadPackage(["pandas", "scikit-learn"]);
  pyodide.runPython(
    readFileSync(resolve(process.cwd(), "src/lib/ds/pipeline.py"), "utf8"),
  );
  runExperiment = pyodide.globals.get("run_experiment") as unknown as (
    payloadJson: string,
  ) => string;
}, 180_000);

function run(payload: unknown): Record<string, unknown> {
  return JSON.parse(runExperiment(JSON.stringify(payload)));
}

describe("pipeline anti-fuga (integración Pyodide)", () => {
  it("el preprocesador se ajusta SOLO en train (falla si usa todo el dataset)", () => {
    // La columna x en train=[1,2,3,4] tiene mediana 2.5; si el imputer se
    // ajustara sobre todo el dataset (incluyendo test 100,100) sería 3.5.
    const result = run({
      headers: ["x", "y"],
      rows: [
        ["1", "0"],
        ["2", "0"],
        ["3", "1"],
        ["4", "1"],
        ["100", "0"],
        ["100", "1"],
      ],
      target: "y",
      numeric: ["x"],
      categorical: [],
      train_idx: [0, 1, 2, 3],
      test_idx: [4, 5],
      seed: 1,
    });

    const preprocessing = result.preprocessing as {
      numeric_medians: Record<string, number>;
    };
    expect(preprocessing.numeric_medians.x).toBe(2.5);
  });

  it("calcula métricas sobre test y devuelve la forma esperada", () => {
    const result = run({
      headers: ["x", "y"],
      rows: Array.from({ length: 40 }, (_, i) => [
        String(i),
        i % 2 === 0 ? "0" : "1",
      ]),
      target: "y",
      numeric: ["x"],
      categorical: [],
      train_idx: Array.from({ length: 30 }, (_, i) => i),
      test_idx: Array.from({ length: 10 }, (_, i) => i + 30),
      seed: 42,
    });

    expect(result.n_test).toBe(10);
    const model = result.model as { auc: number; f1: number };
    expect(model.auc).toBeGreaterThanOrEqual(0);
    expect(model.auc).toBeLessThanOrEqual(1);
    expect(result.confusion_matrix).toHaveLength(2);
  });
});
