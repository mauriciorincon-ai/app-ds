// S18 (regla 19, el lado que LEE): lo que `run_interval` entrega pasa por validateIntervalData antes de usarse. Los fixtures
// los escribió pipeline.py en Pyodide (tests/integration/intervalo.test.ts); aquí cada carnada rompe UNA cosa y el lector
// la nombra, jamás con un valor.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  validateIntervalData,
  type IntervaloSent,
} from "@/workers/contrato-intervalo";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixtures JSON que las carnadas mutan a propósito
type Json = Record<string, any>;
const fixture = (name: string): Json =>
  JSON.parse(
    readFileSync(resolve(__dirname, `../fixtures/contrato/${name}.json`), "utf8"),
  ) as Json;

const enviadoDe = (r: Json, clases: number | null = null): IntervaloSent => ({
  task: r.task,
  primary_metric: r.metric,
  n_test: r.n,
  n_classes: clases,
  seed: r.seed,
});

const NOMBRES = ["interval-result", "interval-result-multiclase", "interval-result-numerica"];
const clasesDe = (r: Json) => (r.task === "multiclase" ? Math.max(...r.y) + 1 : null);

describe("el lector del intervalo", () => {
  it.each(NOMBRES)("acepta lo que pipeline.py escribió: %s", (nombre) => {
    const r = fixture(nombre);
    expect(validateIntervalData(r, enviadoDe(r, clasesDe(r))).ok).toBe(true);
  });

  it("la semilla que vuelve tiene que ser la del experimento (S21, lote 18-11)", () => {
    const r = fixture("interval-result");
    expect(validateIntervalData({ ...r, seed: r.seed + 1 }, enviadoDe(r)).ok).toBe(false);
    expect(validateIntervalData(r, { ...enviadoDe(r), seed: r.seed + 1 }).ok).toBe(false);
  });

  it("dos clases trae el puntaje por fila; las otras dos tareas, no", () => {
    expect(Array.isArray(fixture("interval-result").score)).toBe(true);
    expect(fixture("interval-result-multiclase").score).toBeNull();
    expect(fixture("interval-result-numerica").score).toBeNull();
  });

  const rompe = (nombre: string, cambio: (r: Json) => void, campo: string, clases?: number | null) => {
    const r = JSON.parse(JSON.stringify(fixture(nombre))) as Json;
    cambio(r);
    const v = validateIntervalData(r, enviadoDe(fixture(nombre), clases ?? clasesDe(fixture(nombre))));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.field.split(/[.[]/)[0]).toBe(campo);
  };

  it("otra tarea, otra métrica o un número de filas que no es el enviado se rechazan nombrando el campo", () => {
    rompe("interval-result", (r) => (r.task = "numerica"), "task");
    rompe("interval-result", (r) => (r.metric = "mae"), "metric");
    rompe("interval-result", (r) => (r.n = r.n + 1), "n");
  });

  it("la longitud de lo real, lo predicho y el puntaje tiene que ser la de la prueba", () => {
    rompe("interval-result", (r) => r.y.pop(), "y");
    rompe("interval-result", (r) => r.pred.push(1), "pred");
    rompe("interval-result", (r) => r.score.pop(), "score");
  });

  it("dos clases: etiquetas 0 o 1 y puntaje presente; varias: enteros dentro de 0..K−1 y sin puntaje", () => {
    rompe("interval-result", (r) => (r.y[0] = 2), "y");
    rompe("interval-result", (r) => (r.pred[0] = 0.5), "pred");
    rompe("interval-result", (r) => (r.score = null), "score");
    rompe("interval-result-multiclase", (r) => (r.y[0] = 99), "y");
    rompe("interval-result-multiclase", (r) => (r.pred[0] = -1), "pred");
    rompe("interval-result-multiclase", (r) => (r.score = r.y.map(() => 0)), "score");
    rompe("interval-result-numerica", (r) => (r.score = r.y.map(() => 0)), "score");
  });

  it("un valor que no es un número finito se rechaza", () => {
    rompe("interval-result-numerica", (r) => (r.pred[0] = "x"), "pred");
    rompe("interval-result-numerica", (r) => (r.y[1] = null), "y");
  });

  it("el resultado no trae más que números y las palabras del contrato", () => {
    const r = fixture("interval-result");
    expect(Object.keys(r).sort()).toEqual(["metric", "n", "pred", "score", "seed", "task", "y"]);
  });
});
