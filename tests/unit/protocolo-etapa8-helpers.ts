// Ayuda compartida de las pruebas de la etapa 8 (no es una prueba): crédito con la etapa 7 registrada por la
// compuerta real (con la corrida que escribió tests/integration/validacion.test.ts), el resultado de abrir la
// prueba que escribió tests/integration/prueba.test.ts, y dos cosas armadas a mano y rotuladas como tales: una
// etapa 7 «de mentira» (solo lo que la 8 lee de ella) para las tareas que no tienen la liga en un fixture, y
// un resultado sintético de la prueba con las predicciones que el caso necesita.
import { readFileSync } from "node:fs";
import { registrar } from "@/engine/protocolo/compuerta";
import { datosEtapa7, plan7, type Corrida7 } from "@/engine/protocolo/etapa7";
import {
  ETAPA_8,
  plan8,
  type Corrida8,
  type Plan8,
} from "@/engine/protocolo/etapa8";
import type {
  DatosEtapa,
  DefinicionProtocolo,
} from "@/engine/protocolo/etapas";
import { PROTOCOLO_DS } from "@/engine/protocolo/protocolo-ds";
import { envio7 } from "@/lib/protocolo/liga7";
import { envio8 } from "@/lib/protocolo/prueba8";
import { validateValidationResult } from "@/workers/contract";
import { validateTestResult } from "@/workers/contrato-prueba";
import type { TestResult } from "@/workers/protocol";
import {
  AHORA,
  ENTRADA_6_BAJAS,
  ENTRADA_6_CREDITO,
  ENTRADA_BAJAS,
  ENTRADA_CREDITO,
  HUELLA,
  armar6,
  type Armado,
} from "./protocolo-etapa4-helpers";

/** El Protocolo con la etapa 8 construida (en el S13 se registra en `PROTOCOLO_DS` al final de la F2). */
export const PROTOCOLO8: DefinicionProtocolo = PROTOCOLO_DS.map((e) =>
  e.id === 8 ? ETAPA_8 : e,
);

export const armarCredito6 = () =>
  armar6(
    "credito-fuga-plantada.csv",
    "binaria",
    ENTRADA_CREDITO,
    ENTRADA_6_CREDITO,
  );
export const armarBajas6 = () =>
  armar6("bajas-con-fuga.csv", "binaria", ENTRADA_BAJAS, ENTRADA_6_BAJAS);
export const armarPlanes6 = () =>
  armar6(
    "planes-fuga-plantada.csv",
    "multiclase",
    { ...ENTRADA_CREDITO, objetivo: "plan", positivo: "" },
    ENTRADA_6_CREDITO,
  );
export const armarPrecio6 = () =>
  armar6(
    "precio-fuga-plantada.csv",
    "numerica",
    { ...ENTRADA_CREDITO, objetivo: "precio_usd", positivo: "" },
    ENTRADA_6_CREDITO,
  );

/** Registra la etapa 7 con la compuerta real; falla si la compuerta la rechaza. */
export function registrar7(a: Armado, corrida: Corrida7): Armado {
  const datos = datosEtapa7(a.tabla, a.previas, HUELLA, corrida);
  const r = registrar(PROTOCOLO_DS, a.cuaderno, 7, datos, {
    huella: HUELLA,
    tabla: a.tabla,
    ahora: AHORA,
  });
  if (!r.ok) throw new Error(`etapa 7: ${JSON.stringify(r.rechazo)}`);
  return {
    tabla: a.tabla,
    cuaderno: r.cuaderno,
    previas: { ...a.previas, 7: datos },
  };
}

/** Crédito con las etapas 1–7 cumplidas: la 7 con la liga que escribió el emisor real (validation-result.json). */
export function armarCredito7(): Armado {
  const a = armarCredito6();
  const raw = JSON.parse(
    readFileSync("tests/fixtures/contrato/validation-result.json", "utf8"),
  ) as unknown;
  const e = envio7(a.tabla, plan7(a.tabla, a.previas, HUELLA)!)!;
  const r = validateValidationResult(raw, {
    ...e.sent,
    permutations: { min: 20, max: 20 },
  });
  if (!r.ok) throw new Error(`el fixture no pasa el lector: ${r.field}`);
  return registrar7(a, {
    metrica: e.metrica,
    roster: e.roster,
    resultado: r.value,
  });
}

/**
 * Una etapa 7 armada a mano, SIN la compuerta: solo lo que la 8 lee de ella (el ganador, la métrica, la medida
 * de selección y la huella de los pliegues). Sirve para probar el motor de la 8 en las tareas sin liga en un
 * fixture; la compuerta de la 8 exige la 7 cumplida, así que aquí `criterio` se llama directo.
 */
export function con7(
  a: Armado,
  ganador: string,
  metrica: string,
  seleccion: number,
): Armado {
  const p7 = plan7(a.tabla, a.previas, HUELLA)!;
  const siete: DatosEtapa = {
    respuestas: {},
    chequeos: {
      ganador,
      metrica,
      liga_cv: { [ganador]: seleccion },
      huella_pliegues: p7.huellaPliegues,
    },
  };
  return { ...a, previas: { ...a.previas, 7: siete } };
}

/** El resultado de abrir la prueba que escribió el emisor real, validado con el envío de hoy. */
export function corridaFixture(nombre: string, a: Armado): Corrida8 {
  const raw = JSON.parse(
    readFileSync(`tests/fixtures/contrato/${nombre}.json`, "utf8"),
  ) as unknown;
  const plan = plan8(a.tabla, a.previas, HUELLA)!;
  const e = envio8(a.tabla, plan, HUELLA)!;
  const r = validateTestResult(raw, e.sent);
  if (!r.ok) throw new Error(`${nombre} no pasa el lector: ${r.field}`);
  return { resultado: r.value };
}

/** Un resultado de la prueba armado a mano: `pred(f, i)` y `proba(f, i)` por fila de la tabla y posición. */
export function sintetico(
  plan: Plan8,
  pred: (f: number, i: number) => number | string,
  proba: ((f: number, i: number) => number) | null,
  valor = 0.5,
): Corrida8 {
  const p7 = plan.plan7;
  const prueba = p7.particion.prueba;
  const d = p7.diseno;
  const extra: Partial<TestResult> =
    p7.forma === "binaria"
      ? {
          classes: [...new Set(prueba.map((f) => d.clases![f]!))].sort(),
          positive_class: d.positivo!,
        }
      : p7.forma === "multiclase"
        ? {
            classes: [
              ...new Set(p7.particion.entrenamiento.map((f) => d.clases![f]!)),
            ].sort(),
          }
        : {};
  const resultado = {
    task: p7.forma,
    ...extra,
    winner: plan.ganador!,
    n_train: p7.particion.entrenamiento.length,
    n_test: prueba.length,
    pred: prueba.map((f, i) => pred(f, i)),
    proba: proba ? prueba.map((f, i) => proba(f, i)) : null,
    metric: { name: plan.metrica!, value: valor },
    huella: HUELLA,
    sello: p7.sello6,
    elapsed_ms: 1,
  } as TestResult;
  return { resultado };
}

export { AHORA, HUELLA };
