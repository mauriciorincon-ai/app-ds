// Protocolo DS (S15, etapa 10, G-Plan 2a): el CHEQUEO DE DERIVA de un CSV nuevo contra la referencia de la
// ficha (referencia-deriva.ts). Dice si las ENTRADAS de hoy se parecen a las del entrenamiento; no mide el
// desempeño (desde el S19 eso se vigila en Probeta con el ganador guardado y filas nuevas que traen el resultado real), y la pantalla lo dice.
//  · Por columna: el PSI sobre las casillas de la referencia (los mismos cortes y categorías), con la
//    guarda de ruido de la etapa 4: si con esas filas el azar solo ya puede dar una alerta, «pocas filas».
//    Estable < PSI_MODERADA ≤ moderada < PSI_ALERTA ≤ alerta (convenciones de deriva.ts, no una prueba).
//  · El veredicto del plan: alguna alerta → reentrenar; alguna moderada, sin filas o de otro tipo →
//    revisar; todas estables → sigue.
// El CSV nuevo no se guarda: esto es puro y devuelve solo conteos y PSI, nunca un valor de celda.
import type { CsvTable } from "@/lib/ds/csv";
import { PSI_ALERTA, PSI_MODERADA, psiDeConteos, ruidoEsperado } from "./deriva";
import {
  contarNumeros,
  contarTextos,
  llenas,
  type RefColumna,
} from "./referencia-deriva";
import { valoresDe, vistaColumna } from "./tabla";

export const ESTADOS_CHEQUEO = [
  "estable",
  "moderada",
  "alerta",
  "pocas-filas",
  "sin-referencia",
  "otro-tipo",
] as const;
export type EstadoChequeo = (typeof ESTADOS_CHEQUEO)[number];

export const VEREDICTOS_CHEQUEO = ["sigue", "revisar", "reentrenar"] as const;
export type VeredictoChequeo = (typeof VEREDICTOS_CHEQUEO)[number];

export type ChequeoColumna = {
  readonly columna: string;
  readonly estado: EstadoChequeo;
  /** `null` si no se pudo medir (pocas filas u otro tipo). */
  readonly psi: number | null;
  /** Filas con valor en el CSV nuevo. */
  readonly filas: number;
};

export type ResultadoChequeo =
  | { readonly tipo: "faltan-columnas"; readonly faltan: readonly string[] }
  | {
      readonly tipo: "medido";
      readonly filas: number;
      readonly columnas: readonly ChequeoColumna[];
      readonly veredicto: VeredictoChequeo;
    };

/** La banda de un PSI con las convenciones de la etapa 4. */
export function estadoDePsi(psi: number): "estable" | "moderada" | "alerta" {
  if (psi >= PSI_ALERTA) return "alerta";
  return psi >= PSI_MODERADA ? "moderada" : "estable";
}

/** Una columna del CSV nuevo contra su referencia. */
export function chequearColumna(
  ref: RefColumna,
  crudos: readonly string[],
): ChequeoColumna {
  const vista = vistaColumna(ref.columna, crudos);
  const filas = vista.valores.filter((v) => v !== null).length;
  if (vista.tipo !== ref.tipo)
    return { columna: ref.columna, estado: "otro-tipo", psi: null, filas };
  // S16 (S15 M2, B1): un texto sin categorías con soporte, o una numérica sin cortes, no tiene con qué comparar:
  // mediría «estable» pase lo que pase. Se dice, y el veredicto pasa a «revisa».
  if (
    (ref.tipo === "texto" && ref.categorias.length === 0) ||
    (ref.tipo === "numero" && ref.cortes.length === 0)
  )
    return { columna: ref.columna, estado: "sin-referencia", psi: null, filas };
  const nRef = llenas(ref);
  if (nRef === 0 || filas === 0 || ruidoEsperado(nRef, filas) >= PSI_ALERTA)
    return { columna: ref.columna, estado: "pocas-filas", psi: null, filas };
  const cuentas =
    ref.tipo === "numero"
      ? contarNumeros(ref.cortes, vista.valores as readonly (number | null)[])
      : contarTextos(ref.categorias, vista.valores as readonly (string | null)[]);
  const psi = psiDeConteos(ref.cuentas, cuentas);
  return { columna: ref.columna, estado: estadoDePsi(psi), psi, filas };
}

/** El veredicto del plan con los estados de cada columna. */
export function veredictoDe(
  columnas: readonly ChequeoColumna[],
): VeredictoChequeo {
  if (columnas.some((c) => c.estado === "alerta")) return "reentrenar";
  return columnas.every((c) => c.estado === "estable") ? "sigue" : "revisar";
}

/** El CSV nuevo contra la referencia de la ficha. Sin alguna columna del modelo, no se mide. */
export function chequearDeriva(
  referencias: readonly RefColumna[],
  nueva: CsvTable,
): ResultadoChequeo {
  const faltan = referencias
    .map((r) => r.columna)
    .filter((c) => !nueva.headers.includes(c));
  if (faltan.length > 0) return { tipo: "faltan-columnas", faltan };
  const columnas = referencias.map((r) =>
    chequearColumna(r, valoresDe(nueva, r.columna)),
  );
  return {
    tipo: "medido",
    filas: nueva.rows.length,
    columnas,
    veredicto: veredictoDe(columnas),
  };
}
