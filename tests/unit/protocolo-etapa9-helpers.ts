// Ayuda compartida de las pruebas de la etapa 9 (no es una prueba): crédito con la etapa 8 registrada por la
// compuerta real (con la prueba que abrió el emisor real en Pyodide, tests/fixtures/contrato/test-result.json),
// y la 8 armada sin la compuerta para las tareas cuya etapa 7 es «de mentira» (protocolo-etapa8-helpers.ts).
import { registrar } from "@/engine/protocolo/compuerta";
import { datosEtapa8, type Corrida8 } from "@/engine/protocolo/etapa8";
import { PROTOCOLO_DS } from "@/engine/protocolo/protocolo-ds";
import type { Armado } from "./protocolo-etapa4-helpers";
import {
  AHORA,
  HUELLA,
  armarCredito7,
  corridaFixture,
} from "./protocolo-etapa8-helpers";

export const PATRON_8 = {
  patron: "Falla con quienes trabajan en la informalidad",
};

/** Registra la etapa 8 con la compuerta real; falla si la compuerta la rechaza. */
export function registrar8(a: Armado, corrida: Corrida8): Armado {
  const datos = datosEtapa8(a.tabla, a.previas, HUELLA, corrida, PATRON_8, 1);
  const r = registrar(PROTOCOLO_DS, a.cuaderno, 8, datos, {
    huella: HUELLA,
    tabla: a.tabla,
    ahora: AHORA,
  });
  if (!r.ok) throw new Error(`etapa 8: ${JSON.stringify(r.rechazo)}`);
  return {
    tabla: a.tabla,
    cuaderno: r.cuaderno,
    previas: { ...a.previas, 8: datos },
  };
}

/** Solo lo que la 9 lee de la 8, SIN la compuerta (para las tareas con la 7 armada a mano). */
export function con8(a: Armado, corrida: Corrida8): Armado {
  const datos = datosEtapa8(a.tabla, a.previas, HUELLA, corrida, PATRON_8, 1);
  return { ...a, previas: { ...a.previas, 8: datos } };
}

/** Crédito con las etapas 1–8 cumplidas: la 8 con la prueba que abrió el emisor real. */
export function armarCredito8(): Armado {
  const a = armarCredito7();
  return registrar8(a, corridaFixture("test-result", a));
}

export { AHORA, HUELLA };
