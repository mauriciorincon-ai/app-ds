// @vitest-environment node
//
// S18: el intervalo de la métrica en Probeta, en el Pyodide REAL. Garantías que estos tests hacen FALLAR si se rompen:
//  - el EMISOR real (`run_interval` tras entrenar por el camino de la app) y el lector (`validateIntervalData`) se entienden; este
//    test escribe los fixtures del contrato (CONTRATO_ACTUALIZAR=1 los regenera) y tests/unit/contract-intervalo.test.ts corre
//    sus carnadas;
//  - el punto del intervalo es EXACTAMENTE la métrica del veredicto (la misma cuenta que scikit-learn en la liga), en las tres
//    tareas con objetivo: si el AUC por orden de TypeScript se desviara de roc_auc_score, esto lo nombra;
//  - con la semilla del experimento es DETERMINISTA: la misma cifra dos veces;
//  - lo que sale son números: ningún nombre de columna ni valor de una columna;
//  - un modelo importado dice «no-eval» y agrupar «not-applicable» en vez de inventar una prueba.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PyodideInterface } from "pyodide";
import { calcularIntervalo } from "@/engine/intervalo";
import { sanitizeTable } from "@/engine/sanitize";
import { parseCsvWithLimits } from "@/lib/ds/csv";
import { prepareClusterRun, prepareRun } from "@/lib/experiment";
import {
  validateIntervalData,
  type IntervaloSent,
} from "@/workers/contrato-intervalo";
import { loadRuntime, pyFunction } from "./runtime";

let py: PyodideInterface;
beforeAll(async () => {
  py = await loadRuntime();
}, 300_000);

const call = (fn: string, payload: unknown = {}): unknown =>
  JSON.parse(pyFunction(py, fn)(JSON.stringify(payload)));
function failure(fn: string, payload: unknown = {}): string {
  try {
    call(fn, payload);
  } catch (error) {
    return String((error as Error).message);
  }
  return "";
}

const FIXTURES = resolve(process.cwd(), "tests/fixtures/contrato");
const UPDATE = process.env.CONTRATO_ACTUALIZAR === "1";
function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.length ? ["array", shape(value[0])] : ["array"];
  if (value === null) return "null";
  if (typeof value === "object")
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((k) => [k, shape((value as Record<string, unknown>)[k])]),
    );
  return typeof value;
}
function emit(name: string, value: unknown) {
  const file = resolve(FIXTURES, `${name}.json`);
  if (UPDATE) {
    mkdirSync(FIXTURES, { recursive: true });
    writeFileSync(file, JSON.stringify(value) + "\n");
    return;
  }
  expect(existsSync(file), `falta el fixture ${name}.json (CONTRATO_ACTUALIZAR=1)`).toBe(true);
  expect(shape(value), `la forma de ${name} cambió: regenera con CONTRATO_ACTUALIZAR=1`).toEqual(
    shape(JSON.parse(readFileSync(file, "utf8"))),
  );
}

const csv = (file: string) =>
  readFileSync(resolve(process.cwd(), "public/datasets", file), "utf8");
const LIGA = ["logistic", "forest", "hgb"] as const;
const LIGA_NUMERICA = ["linear", "forest", "hgb"] as const;

function entrenar(file: string, target: string) {
  const parsed = parseCsvWithLimits(csv(file));
  if (!parsed.ok) throw new Error(`parse: ${file}`);
  const prepared = prepareRun(sanitizeTable(parsed.table).table, target, 42);
  if (!prepared.ok) throw new Error(`prepare: ${file}`);
  const p = prepared.payload;
  const result = call("run_experiment", {
    ...p,
    roster: p.task === "numerica" ? LIGA_NUMERICA : LIGA,
  }) as { model: Record<string, number> };
  const sent: IntervaloSent = {
    task: p.task,
    primary_metric: p.primary_metric,
    n_test: p.test_idx.length,
    n_classes: p.classes?.length ?? null,
    seed: p.seed,
  };
  return { sent, model: result.model, clases: p.classes?.length, seed: p.seed };
}

function leer(sent: IntervaloSent) {
  const raw = call("run_interval");
  const r = validateIntervalData(raw, sent);
  if (!r.ok) throw new Error(`el lector rechazó el resultado: ${r.field}`);
  return { raw, datos: r.value };
}

describe.each([
  ["dos clases", "marketing-campania.csv", "convirtio", "interval-result"],
  ["varias categorías", "planes-suscripcion.csv", "plan", "interval-result-multiclase"],
  ["estimar un número", "consumo-energia.csv", "consumo_kwh", "interval-result-numerica"],
])("el intervalo en %s", (_nombre, archivo, objetivo, fixture) => {
  it("el punto es la métrica del veredicto, el emisor y el lector se entienden y sale determinista", () => {
    const t = entrenar(archivo, objetivo);
    const { raw, datos } = leer(t.sent);
    emit(fixture, raw);
    const a = calcularIntervalo({
      task: datos.task,
      metric: datos.metric,
      y: datos.y,
      pred: datos.pred,
      score: datos.score,
      clases: t.clases,
      semilla: datos.seed,
    });
    // el punto del intervalo es lo que muestra el veredicto, cifra por cifra
    expect(a.valor).toBeCloseTo(t.model[datos.metric]!, 9);
    expect(a.bajo).toBeLessThanOrEqual(a.alto);
    // con la semilla del experimento, dos corridas dan lo mismo
    const b = calcularIntervalo({
      task: datos.task,
      metric: datos.metric,
      y: datos.y,
      pred: datos.pred,
      score: datos.score,
      clases: t.clases,
      semilla: datos.seed,
    });
    expect(b).toEqual(a);
    expect(a.semilla).toBe(t.seed);
    expect(a.n).toBe(t.sent.n_test);
  }, 300_000);
});

describe("lo que sale y lo que no", () => {
  it("solo números: ni un nombre de columna ni un valor del dataset", () => {
    const t = entrenar("marketing-campania.csv", "convirtio");
    const { raw } = leer(t.sent);
    const llaves = Object.keys(raw as object).sort();
    expect(llaves).toEqual(["metric", "n", "pred", "score", "seed", "task", "y"]);
    const crudo = JSON.stringify(raw);
    for (const palabra of ["movil", "escritorio", "norte", "sur", "edad", "ingreso_mensual", "region"])
      expect(crudo).not.toContain(palabra);
  }, 300_000);

  it("un modelo importado dice «no-eval» y agrupar dice «not-applicable»", () => {
    entrenar("marketing-campania.csv", "convirtio");
    const exportado = call("export_model") as { payload_b64: string; schema: unknown };
    call("reset_model");
    expect(failure("run_interval")).toContain("no-model");
    call("import_model", { payload_b64: exportado.payload_b64, expected_schema: exportado.schema });
    expect(failure("run_interval")).toContain("no-eval");

    const parsed = parseCsvWithLimits(csv("segmentos-clientes.csv"));
    if (!parsed.ok) throw new Error("parse");
    const run = prepareClusterRun(sanitizeTable(parsed.table).table, 42);
    if (!run.ok) throw new Error("prepare");
    call("run_experiment", run.payload);
    expect(failure("run_interval")).toContain("not-applicable");
  }, 300_000);
});
