// @vitest-environment node
//
// S17 (ADR 023): la prueba de estrés en el Pyodide REAL. Garantías que estos tests hacen FALLAR si se rompen:
//  - el EMISOR real (`run_stress` tras entrenar por el camino de la app, `run_stress_test` con el envío que abrió la
//    prueba de la etapa 8) y el lector (`validateStressResult`) se entienden; este test escribe los fixtures del
//    contrato (CONTRATO_ACTUALIZAR=1 los regenera) y tests/unit/contract-estres.test.ts corre sus carnadas;
//  - la cifra sin perturbar es la del veredicto (la misma métrica sobre la misma prueba), en las tres tareas con
//    objetivo, y en la etapa 8 es la que mide `run_test`;
//  - con semilla es DETERMINISTA: dos corridas dan las mismas cifras; otra semilla da otro ruido; el nivel 0 es la base;
//  - jamás sale un valor del dataset: todo texto del resultado es un nombre de columna o una palabra del contrato;
//  - la prueba retenida NO entra al pickle ni al export, y un modelo importado dice `no-eval` en vez de inventar;
//  - agrupar dice `not-applicable`; la etapa 8 acepta un conjunto cerrado de claves como `run_test`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PyodideInterface } from "pyodide";
import { plan8 } from "@/engine/protocolo/etapa8";
import { sanitizeTable } from "@/engine/sanitize";
import { METRIC_RULES } from "@/engine/verdict";
import { parseCsvWithLimits } from "@/lib/ds/csv";
import { prepareClusterRun, prepareRun } from "@/lib/experiment";
import { envio8 } from "@/lib/protocolo/prueba8";
import { pythonContractField } from "@/workers/contract";
import {
  validateStressResult,
  type StressSent,
} from "@/workers/contrato-estres";
import type { StressResult } from "@/workers/protocol";
import { HUELLA, armarCredito7 } from "../unit/protocolo-etapa8-helpers";
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

// --- el EMISOR escribe los fixtures del contrato Python → TS -------------------------------------

const FIXTURES = resolve(process.cwd(), "tests/fixtures/contrato");
const UPDATE = process.env.CONTRATO_ACTUALIZAR === "1";

/** Firma de forma: claves y tipos (los valores —tiempos, floats— no cuentan). */
function shape(value: unknown): unknown {
  if (Array.isArray(value))
    return value.length ? ["array", shape(value[0])] : ["array"];
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
    writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
    return;
  }
  expect(
    existsSync(file),
    `falta el fixture ${name}.json (CONTRATO_ACTUALIZAR=1)`,
  ).toBe(true);
  expect(
    shape(value),
    `la forma de ${name} cambió: regenera con CONTRATO_ACTUALIZAR=1 y revisa las carnadas`,
  ).toEqual(shape(JSON.parse(readFileSync(file, "utf8"))));
}

// --- Probeta: entrenar por el camino real de la app y estresar el modelo retenido ----------------

const csv = (file: string) =>
  readFileSync(resolve(process.cwd(), "public/datasets", file), "utf8");

type Entrenado = {
  readonly sent: StressSent;
  readonly model: Record<string, number>;
  readonly metric: keyof typeof METRIC_RULES;
};

const LIGA_CHICA = ["logistic", "forest", "hgb"] as const;
const LIGA_NUMERICA = ["linear", "forest", "hgb"] as const;

function entrenar(file: string, target: string, seed = 42): Entrenado {
  const parsed = parseCsvWithLimits(csv(file));
  if (!parsed.ok) throw new Error(`parse failed: ${file}`);
  const prepared = prepareRun(parsed.table, target, seed);
  if (!prepared.ok) throw new Error(`prepare failed: ${file}`);
  const p = prepared.payload;
  // una liga chica: este test mide el estrés, no la liga
  const roster = p.task === "numerica" ? LIGA_NUMERICA : LIGA_CHICA;
  const result = call("run_experiment", { ...p, roster }) as {
    model: Record<string, number>;
  };
  return {
    sent: {
      task: p.task,
      primary_metric: p.primary_metric,
      n_test: p.test_idx.length,
      numeric: p.numeric,
      categorical: p.categorical,
    },
    model: result.model,
    metric: p.primary_metric,
  };
}

function estresar(sent: StressSent): StressResult {
  const raw = call("run_stress");
  const r = validateStressResult(raw, sent);
  if (!r.ok) throw new Error(`el lector rechazó el resultado: ${r.field}`);
  return r.value;
}

/** Todo texto del resultado: nombres de columna y palabras del contrato, nada más. */
function textos(value: unknown, into = new Set<string>()): Set<string> {
  if (typeof value === "string") into.add(value);
  else if (Array.isArray(value)) value.forEach((v) => textos(v, into));
  else if (value && typeof value === "object")
    Object.entries(value).forEach(([k, v]) => {
      into.add(k);
      textos(v, into);
    });
  return into;
}

const PALABRAS = new Set([
  "binaria",
  "multiclase",
  "numerica",
  "higher",
  "lower",
  "numeric",
  "categorical",
  "task",
  "metric",
  "name",
  "direction",
  "base",
  "n_test",
  "seed",
  "noise",
  "level",
  "value",
  "shuffle",
  "column",
  "kind",
  "shift",
  "columns",
  "elapsed_ms",
]);

describe("la prueba de estrés en Probeta (Pyodide)", () => {
  it("dos clases: la base es la del veredicto, el emisor y el lector se entienden, y ningún valor del dataset sale", () => {
    const t = entrenar("marketing-campania.csv", "convirtio");
    const raw = call("run_stress");
    const r = estresar(t.sent);
    expect(r.base).toBe(t.model[t.metric]);
    expect(r.noise.map((n) => n.level)).toEqual([0.05, 0.1, 0.2]);
    expect(r.shuffle).toHaveLength(
      t.sent.numeric.length + t.sent.categorical.length,
    );
    expect(r.shift.map((s) => s.level)).toEqual([0.5, 1]);
    emit("estres-result", raw);

    const columnas = new Set([...t.sent.numeric, ...t.sent.categorical]);
    const ajenos = [...textos(raw)].filter(
      (s) => !columnas.has(s) && !PALABRAS.has(s) && s !== t.metric,
    );
    expect(ajenos).toEqual([]);
    // los valores de las categóricas (p. ej. «movil», «norte») no aparecen en ninguna parte
    const crudo = JSON.stringify(raw);
    for (const valor of ["movil", "desktop", "norte", "sur"])
      expect(crudo).not.toContain(`"${valor}"`);
  }, 300_000);

  it("es DETERMINISTA con semilla; otra semilla da otro ruido; el nivel 0 es la base", () => {
    const t = entrenar("marketing-campania.csv", "convirtio");
    const sinTiempo = (r: StressResult) => ({ ...r, elapsed_ms: 0 });
    const a = estresar(t.sent);
    const b = estresar(t.sent);
    expect(sinTiempo(b)).toEqual(sinTiempo(a));

    const originalSeed = py.runPython('_MODEL["eval"]["seed"]') as number;
    py.runPython('_MODEL["eval"]["seed"] = 99');
    const c = estresar(t.sent);
    py.runPython(`_MODEL["eval"]["seed"] = ${originalSeed}`);
    expect(c.base).toBe(a.base);
    expect(c.noise.map((n) => n.value)).not.toEqual(
      a.noise.map((n) => n.value),
    );

    // el nivel 0 no perturba nada: es exactamente la base
    py.runPython("STRESS_NOISE_LEVELS = (0.0, 0.1, 0.2)");
    try {
      const raw = call("run_stress") as StressResult;
      expect(raw.noise[0]!.level).toBe(0);
      expect(raw.noise[0]!.value).toBe(raw.base);
    } finally {
      py.runPython("STRESS_NOISE_LEVELS = (0.05, 0.10, 0.20)");
    }
  }, 300_000);

  it("estimar un número: el error medio en sus unidades y la dirección «menor es mejor»", () => {
    const t = entrenar("consumo-energia.csv", "consumo_kwh");
    const r = estresar(t.sent);
    expect(t.metric).toBe("mae");
    expect(r.metric.direction).toBe("lower");
    expect(r.base).toBe(t.model.mae);
    // ordenado de lo que más duele a lo que menos: el error sube (o no baja) al barajar la columna
    const duele = r.shuffle.map((e) => e.value - r.base);
    expect(duele).toEqual([...duele].sort((x, y) => y - x));
    emit("estres-result-numerica", call("run_stress"));
  }, 300_000);

  it("varias categorías: la exactitud balanceada", () => {
    const t = entrenar("planes-suscripcion.csv", "plan");
    const r = estresar(t.sent);
    expect(t.metric).toBe("balanced_accuracy");
    expect(r.base).toBe(t.model.balanced_accuracy);
    expect(r.shuffle.length).toBeGreaterThan(0);
  }, 300_000);

  it("la prueba retenida NO entra al pickle ni al export; un modelo importado dice «no-eval»", () => {
    entrenar("marketing-campania.csv", "convirtio");
    const exportado = call("export_model") as {
      payload_b64: string;
      schema: unknown;
    };
    // las claves del pickle, descifrado con el mismo camino que el import
    py.globals.set("PAYLOAD_B64", exportado.payload_b64);
    const claves = py.runPython(
      `import base64, pickle, zlib\nsorted(pickle.loads(zlib.decompress(base64.b64decode(PAYLOAD_B64))).keys())`,
    ) as { toJs: () => string[] };
    expect(claves.toJs()).toEqual(["pipe", "schema", "training_profile"]);
    expect(Object.keys(exportado).sort()).toEqual([
      "payload_b64",
      "schema",
      "training_profile",
      "versions",
    ]);

    // importar el archivo: el modelo puntúa pero no trae la prueba
    call("reset_model");
    expect(failure("run_stress")).toContain("no-model");
    call("import_model", {
      payload_b64: exportado.payload_b64,
      expected_schema: exportado.schema,
    });
    expect(failure("run_stress")).toContain("no-eval");
  }, 300_000);

  it("agrupar no tiene objetivo ni prueba: «not-applicable»", () => {
    const parsed = parseCsvWithLimits(csv("segmentos-clientes.csv"));
    if (!parsed.ok) throw new Error("parse failed");
    const run = prepareClusterRun(sanitizeTable(parsed.table).table, 42);
    if (!run.ok) throw new Error("prepare failed");
    call("run_experiment", run.payload);
    expect(failure("run_stress")).toContain("not-applicable");
  }, 300_000);
});

// --- Protocolo, etapa 8: la MISMA prueba ya abierta, con el envío que la abrió --------------------

describe("la prueba de estrés en la etapa 8 (Pyodide)", () => {
  const CREDITO = armarCredito7();
  const envio = envio8(
    CREDITO.tabla,
    plan8(CREDITO.tabla, CREDITO.previas, HUELLA)!,
    HUELLA,
  )!;
  const p = envio.payload;
  const sent: StressSent = {
    task: p.task,
    primary_metric: p.primary_metric,
    n_test: p.test.length,
    numeric: p.numeric,
    categorical: p.categorical,
    echo: { winner: p.winner, huella: p.huella, sello: p.sello },
  };

  it("lo que mide es la prueba que mide `run_test`: la misma base, el mismo ganador, y el eco del sello", () => {
    const test = call("run_test", p) as { metric: { value: number } };
    const raw = call("run_stress_test", p);
    const r = validateStressResult(raw, sent);
    if (!r.ok) throw new Error(`el lector rechazó el resultado: ${r.field}`);
    expect(r.value.base).toBe(test.metric.value);
    expect(r.value.winner).toBe(p.winner);
    expect(r.value.baseline!.value).toBeGreaterThanOrEqual(0);
    emit("estres-test-result", raw);
    // determinista, también aquí
    const otra = validateStressResult(call("run_stress_test", p), sent);
    expect(otra.ok && { ...otra.value, elapsed_ms: 0 }).toEqual({
      ...r.value,
      elapsed_ms: 0,
    });
  }, 300_000);

  it("acepta el conjunto CERRADO de claves de `run_test`: un extra o un sello roto se rechazan nombrándolos", () => {
    for (const extra of ["folds", "roster", "cv_k", "rows"])
      expect(
        pythonContractField(failure("run_stress_test", { ...p, [extra]: [] })),
      ).toBe(extra);
    expect(
      pythonContractField(failure("run_stress_test", { ...p, sello: "no" })),
    ).toBe("sello");
    expect(
      pythonContractField(
        failure("run_stress_test", { ...p, winner: "kmeans" }),
      ),
    ).toBe("winner");
  }, 300_000);
});
