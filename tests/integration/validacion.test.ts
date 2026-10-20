// @vitest-environment node
//
// S12 (Protocolo DS, etapa 7): la liga SIN PRUEBA en el Pyodide REAL, cargado como en el navegador. Garantías
// que estos tests hacen FALLAR si se rompen:
//  - el EMISOR real (envio7 sobre el kit, con las etapas 1–6 cumplidas con la compuerta) y el lector
//    (validateValidationResult) se entienden; este test escribe los fixtures del contrato
//    (CONTRATO_ACTUALIZAR=1 los regenera) y tests/unit/contract-validacion.test.ts corre sus carnadas;
//  - el modo no tiene con qué abrir la prueba: un payload con test_idx o train_idx se rechaza nombrándolos;
//  - lo que vuelve se registra con la compuerta real: la 7 queda cumplida y la 8 abre (S13);
//  - con la fuga plantada del kit hay señal; con las etiquetas barajadas, no;
//  - la misma semilla da la misma liga y las mismas permutaciones;
//  - varias clases y un número también cruzan el contrato (sus ramas de Python).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PyodideInterface } from "pyodide";
import { evaluar, registrar } from "@/engine/protocolo/compuerta";
import { datosEtapa7, plan7 } from "@/engine/protocolo/etapa7";
import { PROTOCOLO_DS } from "@/engine/protocolo/protocolo-ds";
import { mulberry32, shuffle } from "@/engine/split";
import { envio7, type Envio7 } from "@/lib/protocolo/liga7";
import {
  pythonContractField,
  validateValidationResult,
  type ValidationSent,
} from "@/workers/contract";
import type { ValidationPayload, ValidationResult } from "@/workers/protocol";
import {
  AHORA,
  ENTRADA_6_CREDITO,
  ENTRADA_CREDITO,
  HUELLA,
  armar6,
} from "../unit/protocolo-etapa4-helpers";
import { loadRuntime, pyFunction } from "./runtime";

let py: PyodideInterface;
beforeAll(async () => {
  py = await loadRuntime();
}, 300_000);

const CREDITO = armar6(
  "credito-fuga-plantada.csv",
  "binaria",
  ENTRADA_CREDITO,
  ENTRADA_6_CREDITO,
);

/** El envío real, con un número fijo de permutaciones (la prueba no espera el presupuesto de 20 s). */
function envio(n = 20): Envio7 {
  const plan = plan7(CREDITO.tabla, CREDITO.previas, HUELLA)!;
  const e = envio7(CREDITO.tabla, plan)!;
  return {
    ...e,
    payload: { ...e.payload, permutations: { budget_ms: 0, min: n, max: n } },
    sent: { ...e.sent, permutations: { min: n, max: n } },
  };
}

const correr = (payload: unknown): unknown =>
  JSON.parse(pyFunction(py, "run_validation")(JSON.stringify(payload)));

function campoRechazado(payload: unknown): string | null {
  try {
    correr(payload);
  } catch (error) {
    return pythonContractField(String((error as Error).message));
  }
  return null;
}

function valido(raw: unknown, sent: ValidationSent): ValidationResult {
  const r = validateValidationResult(raw, sent);
  if (!r.ok) throw new Error(`el lector rechazó el resultado: ${r.field}`);
  return r.value;
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

describe("la etapa 7 con el kit de crédito (estratificada), en Pyodide", () => {
  it("el emisor real y el lector se entienden, y lo que vuelve se registra con la compuerta", () => {
    const e = envio();
    // el payload no trae la prueba: ni índices ni sus filas
    expect(Object.keys(e.payload)).not.toContain("test_idx");
    expect(Object.keys(e.payload)).not.toContain("train_idx");
    const plan = plan7(CREDITO.tabla, CREDITO.previas, HUELLA)!;
    expect(e.payload.rows).toHaveLength(plan.particion.entrenamiento.length);
    const raw = correr(e.payload);
    const r = valido(raw, e.sent);
    expect(r.league.map((x) => x.name)).toEqual(e.sent.roster);
    expect(r.oof).toHaveLength(e.payload.folds.length);
    emit("payload-validacion", e.payload);
    emit("validation-result", raw);

    const datos = datosEtapa7(CREDITO.tabla, CREDITO.previas, HUELLA, {
      metrica: e.metrica,
      roster: e.roster,
      resultado: r,
    });
    const reg = registrar(PROTOCOLO_DS, CREDITO.cuaderno, 7, datos, {
      huella: HUELLA,
      tabla: CREDITO.tabla,
      ahora: AHORA,
    });
    if (!reg.ok) throw new Error(JSON.stringify(reg.rechazo));
    const estados = evaluar(
      PROTOCOLO_DS,
      reg.cuaderno,
      HUELLA,
      CREDITO.tabla,
    ).map((x) => x.estado.tipo);
    expect(estados.slice(5, 8)).toEqual(["cumplida", "cumplida", "abierta"]);
    // con la fuga plantada del kit, el ganador encuentra algo que el azar no encuentra
    expect(datos.chequeos.senal).toBe("senal");
    expect(datos.chequeos.veredicto).toMatch(/^(supera|no-supera)$/);
  });

  it("no tiene con qué abrir la prueba: test_idx o train_idx se rechazan nombrándolos", () => {
    const { payload } = envio();
    expect(campoRechazado({ ...payload, test_idx: [0, 1] })).toBe("test_idx");
    expect(campoRechazado({ ...payload, train_idx: [0, 1] })).toBe("train_idx");
    // y un pliegue con una fila que entrena y valida a la vez tampoco entra
    const [primero, ...resto] = payload.folds;
    const solapado = {
      ...payload,
      folds: [
        { train: primero!.train, val: [...primero!.val, primero!.train[0]!] },
        ...resto,
      ],
    };
    expect(campoRechazado(solapado)).toBe("folds");
    expect(
      campoRechazado({
        ...payload,
        permutations: { budget_ms: 0, min: 5, max: 2 },
      }),
    ).toBe("permutations");
  });

  it("con las etiquetas barajadas no hay señal", () => {
    const e = envio();
    const objetivo = e.payload.headers.indexOf(e.payload.target);
    const etiquetas = e.payload.rows.map((fila) => fila[objetivo]!);
    const orden = shuffle(
      etiquetas.map((_, i) => i),
      mulberry32(7),
    );
    const barajado: ValidationPayload = {
      ...e.payload,
      rows: e.payload.rows.map((fila, i) => {
        const copia = [...fila];
        copia[objetivo] = etiquetas[orden[i]!]!;
        return copia;
      }),
    };
    const r = valido(correr(barajado), e.sent);
    const mejores = r.permutation.scores.filter(
      (x) => x >= r.permutation.observed,
    ).length;
    const p = (1 + mejores) / (r.permutation.scores.length + 1);
    expect(p).toBeGreaterThan(0.05);
  });

  it("la misma semilla da la misma liga y las mismas permutaciones", () => {
    const e = envio(10);
    const [a, b] = [
      valido(correr(e.payload), e.sent),
      valido(correr(e.payload), e.sent),
    ];
    expect(b.league.map((x) => x.cv)).toEqual(a.league.map((x) => x.cv));
    expect(b.permutation.scores).toEqual(a.permutation.scores);
    expect(b.oof).toEqual(a.oof);
  });
});

describe("varias clases y un número también cruzan el contrato", () => {
  // tablas chicas a mano: lo que se prueba es la rama de Python y su lector, no el Protocolo
  const filas = 60;
  const folds = [0, 1, 2].map((j) => ({
    train: Array.from({ length: filas }, (_, i) => i).filter(
      (i) => i % 3 !== j,
    ),
    val: Array.from({ length: filas }, (_, i) => i).filter((i) => i % 3 === j),
  }));
  const base = {
    headers: ["x", "z", "y"],
    numeric: ["x", "z"],
    categorical: [],
    target: "y",
    seed: 20261025,
    folds,
    permutations: { budget_ms: 0, min: 5, max: 5 },
  };

  it("varias clases: las predicciones son nombres de clase y no hay probabilidad", () => {
    const clases = ["a", "b", "c"];
    const payload = {
      ...base,
      task: "multiclase",
      rows: Array.from({ length: filas }, (_, i) => [
        String(i % 3),
        String((i * 7) % 11),
        clases[i % 3]!,
      ]),
      primary_metric: "balanced_accuracy",
      roster: ["logistic", "decision_tree"],
      classes: clases,
    };
    const sent: ValidationSent = {
      task: "multiclase",
      roster: ["logistic", "decision_tree"],
      primary_metric: "balanced_accuracy",
      folds,
      classes: clases,
      permutations: { min: 5, max: 5 },
    };
    const r = valido(correr(payload), sent);
    expect(r.oof.every((f) => f.proba === null)).toBe(true);
    expect(
      r.oof.flatMap((f) => f.pred).every((p) => clases.includes(p as string)),
    ).toBe(true);
    emit("validation-result-multiclase", correr(payload));
  });

  it("un número: el puntaje es el error medio, en sus unidades", () => {
    const payload = {
      ...base,
      task: "numerica",
      rows: Array.from({ length: filas }, (_, i) => [
        String(i),
        String((i * 7) % 11),
        String(2 * i + ((i * 7) % 11)),
      ]),
      primary_metric: "mae",
      roster: ["linear", "decision_tree"],
    };
    const sent: ValidationSent = {
      task: "numerica",
      roster: ["linear", "decision_tree"],
      primary_metric: "mae",
      folds,
      permutations: { min: 5, max: 5 },
    };
    const r = valido(correr(payload), sent);
    expect(r.league.every((x) => (x.cv?.mean ?? 0) >= 0)).toBe(true);
    emit("validation-result-regresion", correr(payload));
  });
});
