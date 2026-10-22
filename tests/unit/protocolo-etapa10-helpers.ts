// Ayuda compartida de las pruebas de la etapa 10 (no es una prueba): crédito con las etapas 1–9 registradas
// por la compuerta real (la 8 con la prueba que abrió el emisor real en Pyodide), y el Protocolo con la etapa
// 10 construida (en el S15 entra a `PROTOCOLO_DS` en la F2, con su pantalla).
import { registrar, type ResultadoRegistro } from "@/engine/protocolo/compuerta";
import { UMBRAL_E1 } from "@/engine/protocolo/etapa8";
import { datosEtapa9, type Decision9 } from "@/engine/protocolo/etapa9";
import {
  ENTRADA_10_VACIA,
  ETAPA_10,
  datosEtapa10,
  type EntradaEtapa10,
} from "@/engine/protocolo/etapa10";
import type { DatosEtapa, DefinicionProtocolo } from "@/engine/protocolo/etapas";
import { PROTOCOLO_DS } from "@/engine/protocolo/protocolo-ds";
import type { Armado } from "./protocolo-etapa4-helpers";
import { AHORA, HUELLA, armarCredito8 } from "./protocolo-etapa9-helpers";

/** El Protocolo con la etapa 10 construida. */
export const PROTOCOLO10: DefinicionProtocolo = PROTOCOLO_DS.map((e) =>
  e.id === 10 ? ETAPA_10 : e,
);

const RAZON_9: Record<Decision9, string> = {
  usar: "Ahorra frente a lo de hoy y el equipo alcanza",
  iterar: "Falla con quienes trabajan en la informalidad: sumo esa señal",
  "no-usar": "Con 40 filas de prueba no me fío: junto más datos antes",
};

/** Registra la etapa 9 con esa decisión, con la compuerta real; falla si la rechaza. */
export function registrar9(a: Armado, decision: Decision9): Armado {
  const datos = datosEtapa9(a.previas, {
    umbral: UMBRAL_E1,
    razonUmbral: "",
    capacidad: "100",
    decision,
    razon: RAZON_9[decision],
  });
  const r = registrar(PROTOCOLO_DS, a.cuaderno, 9, datos, {
    huella: HUELLA,
    tabla: a.tabla,
    ahora: AHORA,
  });
  if (!r.ok) throw new Error(`etapa 9: ${JSON.stringify(r.rechazo)}`);
  return { tabla: a.tabla, cuaderno: r.cuaderno, previas: { ...a.previas, 9: datos } };
}

/** Crédito con las etapas 1–9 cumplidas y esa decisión. */
export const armarCredito9 = (decision: Decision9 = "usar") =>
  registrar9(armarCredito8(), decision);

export const ENTRADA_USAR: EntradaEtapa10 = {
  ...ENTRADA_10_VACIA,
  dueno: "Jefa de retención",
  cadencia: "6",
};

export const ENTRADA_NO_USAR: EntradaEtapa10 = {
  ...ENTRADA_10_VACIA,
  dueno: "Jefa de retención",
  cambiar: "Juntar un año más de datos y medir el ingreso declarado contra el real",
};

/** Lo que la pantalla registraría con esa entrada. */
export const datos10 = (a: Armado, entrada: EntradaEtapa10): DatosEtapa =>
  datosEtapa10(a.previas, a.tabla, HUELLA, entrada);

/** Registra la etapa 10 con la compuerta real (devuelve el resultado tal cual). */
export const registrar10 = (a: Armado, datos: DatosEtapa): ResultadoRegistro =>
  registrar(PROTOCOLO10, a.cuaderno, 10, datos, {
    huella: HUELLA,
    tabla: a.tabla,
    ahora: AHORA,
  });

export { AHORA, HUELLA };
