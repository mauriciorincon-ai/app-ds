// S13 (regla 19, el lado que LEE): el resultado de `run_test` pasa por validateTestResult antes de usarse. Los
// fixtures los escribió pipeline.py en Pyodide (tests/integration/prueba.test.ts); aquí cada carnada rompe UNA
// cosa y el lector la nombra. Es el único resultado que habla de la prueba: el eco del sello y de la huella
// es lo que confirma que el worker midió LA prueba sellada y no otra.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateTestResult, type TestSent } from "@/workers/contrato-prueba";
import type { TestPayload } from "@/workers/protocol";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixtures JSON que las carnadas mutan a propósito
type Json = Record<string, any>;
const fixture = <T = Json>(name: string): T =>
  JSON.parse(
    readFileSync(
      resolve(__dirname, `../fixtures/contrato/${name}.json`),
      "utf8",
    ),
  ) as T;

const PAYLOAD = fixture<TestPayload>("payload-prueba");
const SENT: TestSent = {
  task: PAYLOAD.task,
  winner: PAYLOAD.winner,
  primary_metric: PAYLOAD.primary_metric,
  n_train: PAYLOAD.train.length,
  n_test: PAYLOAD.test.length,
  huella: PAYLOAD.huella,
  sello: PAYLOAD.sello,
  positive: PAYLOAD.positive,
};

/** Lo enviado, leído del propio resultado (los fixtures de varias clases y de un número no traen su payload). */
const enviadoDe = (r: Json): TestSent => ({
  task: r.task,
  winner: r.winner,
  primary_metric: r.metric.name,
  n_train: r.n_train,
  n_test: r.n_test,
  huella: r.huella,
  sello: r.sello,
  ...(r.classes && r.task === "multiclase" ? { classes: r.classes } : {}),
});

describe("el lector del resultado de la etapa 8", () => {
  it("acepta lo que pipeline.py escribió, y el resultado no trae ningún valor de la tabla", () => {
    const r = fixture("test-result");
    expect(validateTestResult(r, SENT).ok).toBe(true);
    expect(Object.keys(r).sort()).toEqual(
      [
        "task",
        "classes",
        "positive_class",
        "winner",
        "n_train",
        "n_test",
        "pred",
        "proba",
        "metric",
        "huella",
        "sello",
        "elapsed_ms",
      ].sort(),
    );
  });

  const carnadas: [string, (r: Json) => void, string][] = [
    ["otra tarea", (r) => (r.task = "multiclase"), "task"],
    ["otro ganador", (r) => (r.winner = "knn"), "winner"],
    ["un ganador de otra tarea", (r) => (r.winner = "kmeans"), "winner"],
    ["otro tamaño de entrenamiento", (r) => (r.n_train += 1), "n_train"],
    ["otro tamaño de prueba", (r) => (r.n_test += 1), "n_test"],
    ["una predicción de menos", (r) => r.pred.pop(), "pred"],
    ["una predicción que no es 0 ni 1", (r) => (r.pred[0] = 2), "pred[0]"],
    ["una probabilidad fuera de [0, 1]", (r) => (r.proba[0] = 1.5), "proba[0]"],
    ["una probabilidad de menos", (r) => r.proba.pop(), "proba"],
    ["otra métrica", (r) => (r.metric.name = "auc"), "metric.name"],
    [
      "una métrica fuera de [0, 1]",
      (r) => (r.metric.value = 2),
      "metric.value",
    ],
    ["otra huella", (r) => (r.huella = "0".repeat(64)), "huella"],
    ["otro sello", (r) => (r.sello = "0".repeat(64)), "sello"],
    [
      "otra clase «hay que actuar»",
      (r) => (r.positive_class = "0"),
      "positive_class",
    ],
    ["un tiempo negativo", (r) => (r.elapsed_ms = -1), "elapsed_ms"],
  ];
  it.each(carnadas)("rechaza %s nombrando el campo", (_, cambiar, campo) => {
    const r = fixture("test-result");
    cambiar(r);
    expect(validateTestResult(r, SENT)).toEqual({ ok: false, field: campo });
  });

  it("un ganador sin probabilidades entra: la calibración dirá que no se puede medir", () => {
    const r = fixture("test-result");
    r.proba = null;
    expect(validateTestResult(r, SENT).ok).toBe(true);
  });

  it("varias clases: las predicciones son clases enviadas, la confianza va de 0 a 1 y las clases en su orden", () => {
    const r = fixture("test-result-multiclase");
    const sent = enviadoDe(r);
    expect(validateTestResult(r, sent).ok).toBe(true);
    const otraClase = fixture("test-result-multiclase");
    otraClase.pred[0] = "z";
    expect(validateTestResult(otraClase, sent)).toEqual({
      ok: false,
      field: "pred[0]",
    });
    const desordenadas = fixture("test-result-multiclase");
    desordenadas.classes.reverse();
    expect(validateTestResult(desordenadas, sent)).toEqual({
      ok: false,
      field: "classes",
    });
  });

  it("un número: sin probabilidades, y un error medio negativo es el signo perdido", () => {
    const r = fixture("test-result-regresion");
    const sent = enviadoDe(r);
    expect(validateTestResult(r, sent).ok).toBe(true);
    const conProba = fixture("test-result-regresion");
    conProba.proba = conProba.pred.map(() => 0.5);
    expect(validateTestResult(conProba, sent)).toEqual({
      ok: false,
      field: "proba",
    });
    const negativo = fixture("test-result-regresion");
    negativo.metric.value = -1;
    expect(validateTestResult(negativo, sent)).toEqual({
      ok: false,
      field: "metric.value",
    });
  });

  it("lo que no es un objeto, o es de otra tarea, se rechaza en «task»", () => {
    expect(validateTestResult(null, SENT)).toEqual({
      ok: false,
      field: "task",
    });
    expect(validateTestResult([], SENT)).toEqual({ ok: false, field: "task" });
  });
});
