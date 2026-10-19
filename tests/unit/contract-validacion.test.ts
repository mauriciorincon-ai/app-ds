// S12 (regla 19, el lado que LEE): el resultado de `run_validation` pasa por validateValidationResult antes de
// usarse. Los fixtures los escribió pipeline.py en Pyodide (tests/integration/validacion.test.ts); aquí cada
// carnada rompe UNA cosa y el lector la nombra («detectó k de n»).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  validateValidationResult,
  type ValidationSent,
} from "@/workers/contract";
import type { ValidationPayload } from "@/workers/protocol";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixtures JSON que las carnadas mutan a propósito
type Json = Record<string, any>;
const fixture = <T = Json>(name: string): T =>
  JSON.parse(
    readFileSync(
      resolve(__dirname, `../fixtures/contrato/${name}.json`),
      "utf8",
    ),
  ) as T;

const PAYLOAD = fixture<ValidationPayload>("payload-validacion");
const SENT: ValidationSent = {
  task: PAYLOAD.task,
  roster: PAYLOAD.roster,
  primary_metric: PAYLOAD.primary_metric,
  folds: PAYLOAD.folds,
  positive: PAYLOAD.positive,
  permutations: {
    min: PAYLOAD.permutations.min,
    max: PAYLOAD.permutations.max,
  },
};

describe("el lector del resultado de la etapa 7", () => {
  it("acepta lo que pipeline.py escribió", () => {
    expect(
      validateValidationResult(fixture("validation-result"), SENT).ok,
    ).toBe(true);
  });

  const carnadas: [string, (r: Json) => void, string][] = [
    ["otra tarea", (r) => (r.task = "numerica"), "task"],
    ["la liga en otro orden", (r) => r.league.reverse(), "league"],
    [
      "un miembro de más",
      (r) => r.league.push({ ...r.league[0], name: "knn" }),
      "league",
    ],
    [
      "una fila con prueba",
      (r) => (r.league[0].test = { auc: 0.9 }),
      "league[0].test",
    ],
    [
      "una fila con error y puntaje",
      (r) => (r.league[0].error_type = "ValueError"),
      "league[0].error_type",
    ],
    ["otro k", (r) => (r.cv.k = r.cv.k + 1), "cv.k"],
    ["otra métrica en la CV", (r) => (r.cv.scoring = "accuracy"), "cv.scoring"],
    [
      "otro ganador",
      (r) => (r.winner = r.league.find((x: Json) => x.name !== r.winner).name),
      "winner",
    ],
    [
      "un error estándar maquillado",
      (r) => (r.cv.se = r.cv.se + 0.01),
      "cv.se",
    ],
    ["predicciones de menos", (r) => r.oof[0].pred.pop(), "oof[0].pred"],
    ["un pliegue de menos", (r) => r.oof.pop(), "oof"],
    [
      "una probabilidad fuera de [0, 1]",
      (r) => r.oof[0].proba && (r.oof[0].proba[0] = 1.5),
      "oof[0].proba[0]",
    ],
    [
      "otra clase «hay que actuar»",
      (r) => (r.positive_class = "0"),
      "positive_class",
    ],
    [
      "permutaciones de más",
      (r) => (r.permutation.n = SENT.permutations.max + 1),
      "permutation.n",
    ],
    [
      "permutaciones mal contadas",
      (r) => r.permutation.scores.pop(),
      "permutation.scores",
    ],
    [
      "otro puntaje observado",
      (r) => (r.permutation.observed = -1),
      "permutation.observed",
    ],
  ];
  it.each(carnadas)("rechaza %s nombrando el campo", (_, cambiar, campo) => {
    const r = fixture("validation-result");
    cambiar(r);
    expect(validateValidationResult(r, SENT)).toEqual({
      ok: false,
      field: campo,
    });
  });

  it("varias clases: las predicciones son clases enviadas y sin probabilidad", () => {
    const sent: ValidationSent = {
      task: "multiclase",
      roster: ["logistic", "decision_tree"],
      primary_metric: "balanced_accuracy",
      folds: [0, 1, 2].map((j) => ({
        val: Array.from({ length: 60 }, (_, i) => i).filter((i) => i % 3 === j),
      })),
      classes: ["a", "b", "c"],
      permutations: { min: 5, max: 5 },
    };
    expect(
      validateValidationResult(fixture("validation-result-multiclase"), sent)
        .ok,
    ).toBe(true);
    const otraClase = fixture("validation-result-multiclase");
    otraClase.oof[0].pred[0] = "z";
    expect(validateValidationResult(otraClase, sent)).toEqual({
      ok: false,
      field: "oof[0].pred[0]",
    });
    const conProba = fixture("validation-result-multiclase");
    conProba.oof[0].proba = conProba.oof[0].pred.map(() => 0.5);
    expect(validateValidationResult(conProba, sent)).toEqual({
      ok: false,
      field: "oof[0].proba",
    });
  });

  it("un número: un error medio negativo es el signo perdido, y se nombra", () => {
    const sent: ValidationSent = {
      task: "numerica",
      roster: ["linear", "decision_tree"],
      primary_metric: "mae",
      folds: [0, 1, 2].map((j) => ({
        val: Array.from({ length: 60 }, (_, i) => i).filter((i) => i % 3 === j),
      })),
      permutations: { min: 5, max: 5 },
    };
    expect(
      validateValidationResult(fixture("validation-result-regresion"), sent).ok,
    ).toBe(true);
    const negativo = fixture("validation-result-regresion");
    negativo.league[0].cv.mean = -1;
    expect(validateValidationResult(negativo, sent)).toEqual({
      ok: false,
      field: "league[0].cv.mean",
    });
  });
});
