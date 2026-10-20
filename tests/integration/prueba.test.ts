// @vitest-environment node
//
// S13 (Protocolo DS, etapa 8): la prueba sellada, abierta una vez, en el Pyodide REAL. Garantías que estos
// tests hacen FALLAR si se rompen:
//  - el EMISOR real (envio8 sobre el kit, con las etapas 1–7 cumplidas con la compuerta) y el lector
//    (validateTestResult) se entienden; este test escribe los fixtures del contrato (CONTRATO_ACTUALIZAR=1
//    los regenera) y tests/unit/contract-prueba.test.ts corre sus carnadas;
//  - el envío lleva solo las columnas en «usar» y el objetivo, y las filas de entrenamiento y prueba selladas;
//  - `run_test` acepta un conjunto CERRADO de claves: los pliegues, el roster o cualquier extra se rechazan
//    nombrándolos; y `run_validation` rechaza la prueba (la prueba sale solo por este comando);
//  - lo que vuelve se registra con la compuerta real: la 8 queda cumplida y la 9 se ve sin construir;
//  - un ganador sin probabilidades vuelve sin ellas, y la calibración dice «no se puede medir»;
//  - el mismo envío da las mismas predicciones;
//  - varias clases y un número también cruzan el contrato (la calibración, «medida» y «no aplica»).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PyodideInterface } from "pyodide";
import { evaluar, registrar } from "@/engine/protocolo/compuerta";
import { plan7 } from "@/engine/protocolo/etapa7";
import {
  ETAPA_8,
  datosEtapa8,
  plan8,
  type Corrida8,
} from "@/engine/protocolo/etapa8";
import {
  ETAPA_9,
  base9,
  datosEtapa9,
  opcionesUmbral,
} from "@/engine/protocolo/etapa9";
import type { Previas } from "@/engine/protocolo/etapas";
import { envio7 } from "@/lib/protocolo/liga7";
import { PROTOCOLO_DS } from "@/engine/protocolo/protocolo-ds";
import { envio8, type Envio8 } from "@/lib/protocolo/prueba8";
import {
  pythonContractField,
  validateValidationResult,
} from "@/workers/contract";
import { validateTestResult, type TestSent } from "@/workers/contrato-prueba";
import type { TestResult } from "@/workers/protocol";
import type { Armado } from "../unit/protocolo-etapa4-helpers";
import {
  AHORA,
  HUELLA,
  armarCredito7,
  armarPlanes6,
  armarPrecio6,
  registrar7,
} from "../unit/protocolo-etapa8-helpers";
import { loadRuntime, pyFunction } from "./runtime";

let py: PyodideInterface;
beforeAll(async () => {
  py = await loadRuntime();
}, 300_000);

const correr = (fn: string, payload: unknown): unknown =>
  JSON.parse(pyFunction(py, fn)(JSON.stringify(payload)));

function campoRechazado(fn: string, payload: unknown): string | null {
  try {
    correr(fn, payload);
  } catch (error) {
    return pythonContractField(String((error as Error).message));
  }
  return null;
}

function valido(raw: unknown, sent: TestSent): TestResult {
  const r = validateTestResult(raw, sent);
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

/** La etapa 7 corrida de verdad en Pyodide (pocas permutaciones) y registrada con la compuerta. */
function conLiga(a: Armado): Armado {
  const e = envio7(a.tabla, plan7(a.tabla, a.previas, HUELLA)!)!;
  const payload = {
    ...e.payload,
    permutations: { budget_ms: 0, min: 5, max: 5 },
  };
  const r = validateValidationResult(correr("run_validation", payload), {
    ...e.sent,
    permutations: { min: 5, max: 5 },
  });
  if (!r.ok) throw new Error(`la liga no pasa el lector: ${r.field}`);
  return registrar7(a, {
    metrica: e.metrica,
    roster: e.roster,
    resultado: r.value,
  });
}

const envioDe = (a: Armado): Envio8 =>
  envio8(a.tabla, plan8(a.tabla, a.previas, HUELLA)!, HUELLA)!;

/** Registra la 8 con la compuerta real y devuelve los estados de 7 a 9. */
function registrar8(a: Armado, corrida: Corrida8) {
  const datos = datosEtapa8(
    a.tabla,
    a.previas,
    HUELLA,
    corrida,
    { patron: "Falla más con los clientes nuevos" },
    1,
  );
  const r = registrar(PROTOCOLO_DS, a.cuaderno, 8, datos, {
    huella: HUELLA,
    tabla: a.tabla,
    ahora: AHORA,
  });
  if (!r.ok) throw new Error(JSON.stringify(r.rechazo));
  const estados = evaluar(PROTOCOLO_DS, r.cuaderno, HUELLA, a.tabla)
    .map((x) => x.estado.tipo)
    .slice(6, 10);
  // S14: con la prueba que abrió el worker de verdad, la 9 llega a una decisión con números (y no lo abre otra vez)
  const previas = { ...a.previas, 8: datos };
  const b = base9(previas)!;
  const nueve = datosEtapa9(previas, {
    umbral: opcionesUmbral(b.tabla)[0] ?? "",
    razonUmbral: "",
    capacidad: "100",
    decision: "no-usar",
    razon: "Prueba de integración",
  });
  return {
    datos,
    estados,
    decision9: ETAPA_9.criterio(nueve, previas),
    costo9: nueve.chequeos.costo_modelo,
  };
}

describe("la etapa 8 con el kit de crédito (estratificada), en Pyodide", () => {
  const CREDITO = armarCredito7();

  it("el emisor real y el lector se entienden, y lo que vuelve se registra con la compuerta", () => {
    const e = envioDe(CREDITO);
    const p7 = plan7(CREDITO.tabla, CREDITO.previas, HUELLA)!;
    // solo las columnas en «usar» y el objetivo, con las filas selladas de cada lado
    expect(e.payload.headers).toEqual([
      ...p7.numericas,
      ...p7.categoricas,
      p7.objetivo,
    ]);
    expect(e.payload.headers).not.toContain("monto_recuperado");
    expect(e.payload.train).toHaveLength(p7.particion.entrenamiento.length);
    expect(e.payload.test).toHaveLength(p7.particion.prueba.length);
    expect(Object.keys(e.payload)).not.toContain("folds");
    const raw = correr("run_test", e.payload);
    const r = valido(raw, e.sent);
    expect(r.winner).toBe(CREDITO.previas[7]!.chequeos.ganador);
    expect(r.pred).toHaveLength(p7.particion.prueba.length);
    emit("payload-prueba", e.payload);
    emit("test-result", raw);

    const { datos, estados, decision9, costo9 } = registrar8(CREDITO, {
      resultado: r,
    });
    expect(estados).toEqual([
      "cumplida",
      "cumplida",
      "abierta",
      "no-construida",
    ]);
    expect(decision9).toEqual({ tipo: "cumple" });
    expect(costo9).toBeTypeOf("number");
    expect(datos.chequeos.calibracion).toBe(
      r.proba ? "medida" : "sin-probabilidades",
    );
    expect(datos.chequeos.peor_segmento).not.toBeNull();
  });

  it("acepta un conjunto cerrado de claves: pliegues, roster o un extra se rechazan nombrándolos", () => {
    const { payload } = envioDe(CREDITO);
    for (const extra of ["folds", "roster", "cv_k", "permutations", "rows"])
      expect(campoRechazado("run_test", { ...payload, [extra]: [] })).toBe(
        extra,
      );
    expect(campoRechazado("run_test", { ...payload, sello: "no" })).toBe(
      "sello",
    );
    expect(campoRechazado("run_test", { ...payload, winner: "kmeans" })).toBe(
      "winner",
    );
    // la prueba no entra por el comando de la etapa 7
    const e7 = envio7(
      CREDITO.tabla,
      plan7(CREDITO.tabla, CREDITO.previas, HUELLA)!,
    )!;
    expect(campoRechazado("run_validation", { ...e7.payload, test: [] })).toBe(
      "test",
    );
    expect(campoRechazado("run_validation", { ...e7.payload, train: [] })).toBe(
      "train",
    );
  });

  it("un ganador sin probabilidades vuelve sin ellas: la calibración dice «no se puede medir» y la compuerta acepta", () => {
    const e = envioDe(CREDITO);
    const r = valido(correr("run_test", { ...e.payload, winner: "ridge" }), {
      ...e.sent,
      winner: "ridge",
    });
    expect(r.proba).toBeNull();
    const previas: Previas = {
      ...CREDITO.previas,
      7: {
        ...CREDITO.previas[7]!,
        chequeos: { ...CREDITO.previas[7]!.chequeos, ganador: "ridge" },
      },
    };
    const datos = datosEtapa8(
      CREDITO.tabla,
      previas,
      HUELLA,
      { resultado: r },
      { patron: "Se equivoca con montos altos" },
      1,
    );
    expect(datos.chequeos.calibracion).toBe("sin-probabilidades");
    expect(ETAPA_8.criterio(datos, previas)).toEqual({ tipo: "cumple" });
  });

  it("el mismo envío da las mismas predicciones", () => {
    const e = envioDe(CREDITO);
    const [a, b] = [
      valido(correr("run_test", e.payload), e.sent),
      valido(correr("run_test", e.payload), e.sent),
    ];
    expect(b.pred).toEqual(a.pred);
    expect(b.proba).toEqual(a.proba);
    expect(b.metric).toEqual(a.metric);
  });
});

describe("varias clases y un número también cruzan el contrato", () => {
  it("varias clases (planes): las predicciones son nombres de clase y la confianza se calibra", () => {
    const a = conLiga(armarPlanes6());
    const e = envioDe(a);
    expect(e.payload.classes).toEqual(e.sent.classes);
    const raw = correr("run_test", e.payload);
    const r = valido(raw, e.sent);
    expect(
      r.pred.every((p) => (e.sent.classes ?? []).includes(p as string)),
    ).toBe(true);
    emit("test-result-multiclase", raw);
    const { datos, estados, decision9, costo9 } = registrar8(a, {
      resultado: r,
    });
    expect(estados).toEqual([
      "cumplida",
      "cumplida",
      "abierta",
      "no-construida",
    ]);
    expect(decision9).toEqual({ tipo: "cumple" });
    expect(costo9).toBeTypeOf("number");
    expect(datos.chequeos.calibracion).toBe(
      r.proba ? "medida" : "sin-probabilidades",
    );
  });

  it("un número (precio): el error en sus unidades, y la calibración no aplica", () => {
    const a = conLiga(armarPrecio6());
    const e = envioDe(a);
    const raw = correr("run_test", e.payload);
    const r = valido(raw, e.sent);
    expect(r.proba).toBeNull();
    expect(r.metric.value).toBeGreaterThanOrEqual(0);
    emit("test-result-regresion", raw);
    const { datos, estados, decision9, costo9 } = registrar8(a, {
      resultado: r,
    });
    expect(estados).toEqual([
      "cumplida",
      "cumplida",
      "abierta",
      "no-construida",
    ]);
    expect(decision9).toEqual({ tipo: "cumple" });
    expect(costo9).toBeTypeOf("number");
    expect(datos.chequeos.calibracion).toBe("no-aplica");
  });
});
