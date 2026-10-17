// Protocolo DS (S8, ADR 020): el cuaderno del proyecto. Es una lista de evidencias que SOLO
// CRECE: corregir una etapa añade una evidencia nueva, nunca reescribe ni borra la anterior
// (la anterior queda como historia). Cada evidencia de una etapa que depende de los datos
// lleva la huella (SHA-256) del archivo con el que se verificó, y cada evidencia anota sobre
// qué evidencias de las etapas previas se construyó (`base`): si una previa cambió después,
// la compuerta la manda a «por verificar».
//
// Lo que hay aquí vive solo en el navegador del usuario (IndexedDB) o en el archivo que él
// baja; jamás viaja a logs, Sentry ni la narración (regla dura 2).
import type { DatosEtapa, EtapaId } from "./etapas";

export const CUADERNO_VERSION = 1;

/** Un archivo cargado: con qué datos se trabajó (el archivo mismo no se guarda). */
export type Carga = {
  readonly fecha: string;
  readonly sha256: string;
  readonly nombre: string;
  readonly filas: number;
  readonly columnas: number;
};

export type Evidencia = {
  /** 1, 2, 3… en el orden en que se registraron. */
  readonly seq: number;
  readonly etapa: EtapaId;
  /** ISO 8601. */
  readonly fecha: string;
  /** Huella de los datos con que se verificó; `null` si la etapa no depende de ellos. */
  readonly huella: string | null;
  /** Sobre qué evidencia de cada etapa previa se construyó (su `seq`). */
  readonly base: Readonly<Partial<Record<EtapaId, number>>>;
  readonly datos: DatosEtapa;
};

export type Cuaderno = {
  readonly version: typeof CUADERNO_VERSION;
  readonly creado: string;
  readonly cargas: readonly Carga[];
  readonly evidencias: readonly Evidencia[];
};

export function cuadernoVacio(ahora: Date): Cuaderno {
  return {
    version: CUADERNO_VERSION,
    creado: ahora.toISOString(),
    cargas: [],
    evidencias: [],
  };
}

/** La última evidencia de una etapa (la vigente), si hay. */
export function ultimaEvidencia(
  cuaderno: Cuaderno,
  etapa: EtapaId,
): Evidencia | undefined {
  for (let i = cuaderno.evidencias.length - 1; i >= 0; i--) {
    const evidencia = cuaderno.evidencias[i]!;
    if (evidencia.etapa === etapa) return evidencia;
  }
  return undefined;
}

export function ultimaCarga(cuaderno: Cuaderno): Carga | undefined {
  return cuaderno.cargas.at(-1);
}

/** ¿El archivo que se acaba de cargar es el del cuaderno? */
export type ComparacionCarga = "primera" | "misma" | "distinta";

export function compararCarga(
  cuaderno: Cuaderno,
  sha256: string,
): ComparacionCarga {
  const ultima = ultimaCarga(cuaderno);
  if (!ultima) return "primera";
  return ultima.sha256 === sha256 ? "misma" : "distinta";
}

/** Anota una carga (otra versión de los datos también queda en la historia). */
export function agregarCarga(cuaderno: Cuaderno, carga: Carga): Cuaderno {
  const ultima = ultimaCarga(cuaderno);
  if (ultima && ultima.sha256 === carga.sha256) return cuaderno;
  return { ...cuaderno, cargas: [...cuaderno.cargas, carga] };
}

/** ¿Alguna etapa ya registró algo con datos? (Cambiar de datos la afecta.) */
export function tieneEvidenciasConDatos(cuaderno: Cuaderno): boolean {
  return cuaderno.evidencias.some((evidencia) => evidencia.huella !== null);
}
