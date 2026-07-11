// @vitest-environment node
//
// Integración S3 (Pyodide/WASM): puntuar datos nuevos + export/import.
// Garantías que la DoD exige y que estos tests hacen FALLAR si se rompen:
//  - el training_profile proviene SOLO de train (un valor que solo está en
//    test ES novedad);
//  - la novedad se cuenta por columna (categorías nuevas / fuera de rango);
//  - las predicciones llevan la etiqueta ORIGINAL de la clase;
//  - export → import ⇒ predicciones y probabilidades IDÉNTICAS;
//  - las versiones que declara model-file.ts (RUNTIME_VERSIONS) son las del
//    runtime real (si actualizas Pyodide/sklearn y no la constante, esto falla).
// pipeline.test.ts (S1/S2) no se modifica: sus garantías siguen aparte.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadPyodide, type PyodideInterface } from "pyodide";
import { assembleResult } from "@/lib/experiment";
import {
  RUNTIME_VERSIONS,
  packModelFile,
  validateModelFile,
} from "@/lib/model-file";
import type {
  ExportResult,
  PipelineResult,
  ScoreResult,
} from "@/workers/protocol";

let pyodide: PyodideInterface;
type PyFn = (payloadJson: string) => string;
let fns: Record<
  | "run_experiment"
  | "score_new_data"
  | "export_model"
  | "import_model"
  | "reset_model",
  PyFn
>;

beforeAll(async () => {
  pyodide = await loadPyodide();
  await pyodide.loadPackage(["pandas", "scikit-learn"]);
  pyodide.runPython(
    readFileSync(resolve(process.cwd(), "src/lib/ds/pipeline.py"), "utf8"),
  );
  const grab = (name: string) => pyodide.globals.get(name) as unknown as PyFn;
  fns = {
    run_experiment: grab("run_experiment"),
    score_new_data: grab("score_new_data"),
    export_model: grab("export_model"),
    import_model: grab("import_model"),
    reset_model: grab("reset_model"),
  };
}, 180_000);

const call = <T>(fn: PyFn, payload: unknown = {}): T =>
  JSON.parse(fn(JSON.stringify(payload))) as T;

// Dataset de entrenamiento plantado:
//  - x en TRAIN cubre [1, 10]; en TEST hay x=100 (fuera del rango de train).
//  - c en TRAIN ∈ {a, b}; en TEST aparece "solo-test".
//  - y: "si" (minoritaria ⇒ clase positiva) para x ≥ 8.
const TRAIN_PAYLOAD = {
  headers: ["x", "c", "y"],
  rows: [
    ["1", "a", "no"],
    ["2", "b", "no"],
    ["3", "a", "no"],
    ["4", "b", "no"],
    ["5", "a", "no"],
    ["6", "b", "no"],
    ["7", "a", "no"],
    ["8", "b", "si"],
    ["9", "a", "si"],
    ["10", "b", "si"],
    ["100", "solo-test", "no"],
    ["9", "a", "si"],
  ],
  target: "y",
  numeric: ["x"],
  categorical: ["c"],
  train_idx: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  test_idx: [10, 11],
  seed: 42,
};

function train(): PipelineResult {
  return call<PipelineResult>(fns.run_experiment, TRAIN_PAYLOAD);
}

describe("score_new_data (integración Pyodide)", () => {
  it("cuenta la novedad plantada por columna, con filas afectadas", () => {
    train();
    const score = call<ScoreResult>(fns.score_new_data, {
      headers: ["x", "c"],
      rows: [
        ["5", "z"], // categoría nueva
        ["5", "z"], // categoría nueva
        ["5", "z"], // categoría nueva
        ["99", "a"], // fuera de rango
        ["99", "z"], // ambas novedades en la MISMA fila (cuenta 1 vez)
        ["5", "a"], // sin novedad
      ],
    });

    expect(score.novelty.columns).toEqual([
      { column: "x", kind: "numeric", count: 2 },
      { column: "c", kind: "categorical", count: 4 },
    ]);
    expect(score.novelty.affected_rows).toBe(5);
    expect(score.novelty.n_rows).toBe(6);
  });

  it("el perfil es SOLO de train: lo que solo está en test ES novedad", () => {
    train();
    // x=50 está dentro de [1,100] (dataset completo) pero fuera de [1,10]
    // (train); "solo-test" solo existe en la fila de test. Ambas deben contar.
    const score = call<ScoreResult>(fns.score_new_data, {
      headers: ["x", "c"],
      rows: [["50", "solo-test"]],
    });

    expect(score.novelty.columns).toEqual([
      { column: "x", kind: "numeric", count: 1 },
      { column: "c", kind: "categorical", count: 1 },
    ]);
    expect(score.novelty.affected_rows).toBe(1);
  });

  it("predice con la etiqueta ORIGINAL de la clase y probabilidad en [0,1]", () => {
    train();
    const score = call<ScoreResult>(fns.score_new_data, {
      headers: ["x", "c"],
      rows: [
        ["9", "a"],
        ["1", "b"],
      ],
    });

    expect(score.positive_class).toBe("si");
    expect(score.predictions).toHaveLength(2);
    for (const label of score.predictions) {
      expect(["si", "no"]).toContain(label); // jamás 0/1
    }
    for (const p of score.probabilities) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    // El modelo aprendió y=si para x alto: sanity de que puntúa de verdad.
    expect(score.predictions[0]).toBe("si");
    expect(score.predictions[1]).toBe("no");
  });

  it("los nulos NO son novedad (los imputa el pipeline, como en train)", () => {
    train();
    const score = call<ScoreResult>(fns.score_new_data, {
      headers: ["x", "c"],
      rows: [["", "NA"]],
    });
    expect(score.novelty.columns).toEqual([]);
    expect(score.novelty.affected_rows).toBe(0);
    expect(score.predictions).toHaveLength(1);
  });
});

describe("export_model / import_model (integración Pyodide)", () => {
  const NEW_ROWS = {
    headers: ["x", "c"],
    rows: [
      ["2", "a"],
      ["9", "b"],
      ["5", "a"],
      ["99", "z"],
    ],
  };

  it("export → reset → import ⇒ predicciones y probabilidades IDÉNTICAS", () => {
    train();
    const before = call<ScoreResult>(fns.score_new_data, NEW_ROWS);
    const exported = call<ExportResult>(fns.export_model);

    call(fns.reset_model);
    expect(() => call(fns.score_new_data, NEW_ROWS)).toThrow(/no-model/);

    call(fns.import_model, { payload_b64: exported.payload_b64 });
    const after = call<ScoreResult>(fns.score_new_data, NEW_ROWS);

    expect(after.predictions).toEqual(before.predictions);
    expect(after.probabilities).toEqual(before.probabilities); // floats exactos
    expect(after.novelty).toEqual(before.novelty);
  });

  it("el export declara esquema y perfil de train honestos", () => {
    train();
    const exported = call<ExportResult>(fns.export_model);

    expect(exported.schema).toEqual({
      numeric: ["x"],
      categorical: ["c"],
      target: "y",
      classes: ["no", "si"],
      positive_class: "si",
    });
    expect(exported.training_profile.numeric.x).toEqual({ min: 1, max: 10 });
    expect(exported.training_profile.categorical.c).toEqual(["a", "b"]);
    expect(exported.payload_b64.length).toBeGreaterThan(0);
  });

  it("RUNTIME_VERSIONS (TS) coincide con el runtime real — constante honesta", () => {
    train();
    const exported = call<ExportResult>(fns.export_model);
    expect(exported.versions.pyodide).toBe(RUNTIME_VERSIONS.pyodide);
    expect(exported.versions.sklearn).toBe(RUNTIME_VERSIONS.sklearn);
  });

  it("payload manipulado ⇒ import_model falla (defensa Python, tras la TS)", () => {
    train();
    const exported = call<ExportResult>(fns.export_model);
    const corrupted = exported.payload_b64.slice(0, -8);
    expect(() => call(fns.import_model, { payload_b64: corrupted })).toThrow();
  });

  it("el payload real empaqueta y valida en TS (manifiesto + SHA-256)", async () => {
    const result = assembleResult(train(), []);
    const exported = call<ExportResult>(fns.export_model);
    const file = await packModelFile({
      datasetName: "plantado.csv",
      result,
      exported,
    });
    const validation = await validateModelFile(JSON.stringify(file));
    expect(validation.ok).toBe(true);
    if (validation.ok) expect(validation.warnings).toEqual([]);
  });
});

describe("score sin modelo (integración Pyodide)", () => {
  it("puntuar sin entrenar/importar ⇒ error claro no-model", () => {
    call(fns.reset_model);
    expect(() =>
      call(fns.score_new_data, { headers: ["x", "c"], rows: [["1", "a"]] }),
    ).toThrow(/no-model/);
  });
});
