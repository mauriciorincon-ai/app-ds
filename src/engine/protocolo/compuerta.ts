// Protocolo DS (S8, ADR 020): la COMPUERTA. Regla dura 5: ninguna etapa se abre sin el
// criterio de salida de la anterior, verificado por código o por una respuesta escrita del
// usuario; no existe botón «saltar» ni salto con justificación. Aquí eso es estructural:
//
//  - `evaluar` deriva el estado de cada etapa SOLO del cuaderno y de la huella de los datos
//    cargados: la N+1 está «cerrada» mientras la N no esté «cumplida».
//  - `registrar` es la única forma de que algo entre al cuaderno, y rechaza (nombrando la
//    etapa que bloquea) cualquier registro en una etapa cerrada o sin construir, cualquier
//    dato que no tenga la forma de su etapa y cualquier respuesta que no cumpla su criterio.
//    No hay otra API: no se puede marcar cumplida una etapa sin su evidencia.
//
// Motor puro y determinista: el reloj llega como argumento.
import type { CsvTable } from "@/lib/ds/csv";
import { ultimaEvidencia, type Cuaderno, type Evidencia } from "./cuaderno";
import type {
  DatosEtapa,
  DefinicionEtapa,
  DefinicionProtocolo,
  EtapaId,
  Previas,
} from "./etapas";
import { mismoRegistro } from "./valores";

export type MotivoReverificar =
  /** La etapa usa los datos y todavía no se cargó el archivo en esta sesión. */
  | "sin-datos"
  /** El archivo cargado no es el que verificó esta etapa (otra huella). */
  | "datos-distintos"
  /** Una etapa anterior se corrigió después de registrar esta. */
  | "anterior-cambio"
  /** Lo registrado no es lo que dan los datos cargados con esas respuestas (cuaderno editado). */
  | "no-cuadra";

export type EstadoEtapa =
  /** La anterior no está cumplida: no se abre. */
  | { readonly tipo: "cerrada"; readonly bloquea: EtapaId }
  /** Se puede trabajar en ella; si ya hay evidencia, todavía le falta algo. */
  | {
      readonly tipo: "abierta";
      readonly evidencia: Evidencia | null;
      readonly faltan: readonly string[];
    }
  | { readonly tipo: "cumplida"; readonly evidencia: Evidencia }
  | {
      readonly tipo: "por-verificar";
      readonly evidencia: Evidencia;
      readonly motivo: MotivoReverificar;
    }
  /** El criterio paró el protocolo (p. ej. la pregunta es causal); se puede reformular. */
  | {
      readonly tipo: "detenida";
      readonly evidencia: Evidencia;
      readonly razon: string;
    }
  /** Se ve con su criterio, pero en esta versión de la app no abre. */
  | { readonly tipo: "no-construida" };

export type EtapaEvaluada = {
  readonly etapa: DefinicionEtapa;
  readonly estado: EstadoEtapa;
};

/** ¿Alguna etapa previa construida se registró de nuevo después de esta evidencia? */
function anteriorCambio(
  protocolo: DefinicionProtocolo,
  cuaderno: Cuaderno,
  evidencia: Evidencia,
): boolean {
  for (const previa of protocolo) {
    if (previa.id >= evidencia.etapa) break;
    if (!previa.construida) continue;
    if (evidencia.base[previa.id] !== ultimaEvidencia(cuaderno, previa.id)?.seq)
      return true;
  }
  return false;
}

type Construida = Extract<DefinicionEtapa, { construida: true }>;

/** ¿Lo registrado es lo que la tabla cargada da hoy para esas respuestas? */
function cuadraConLaTabla(
  etapa: Construida,
  datos: DatosEtapa,
  previas: Previas,
  tabla: CsvTable,
  huella: string | null,
): boolean {
  if (!etapa.recalcular) return true;
  const hoy = etapa.recalcular(datos, previas, tabla, huella);
  return (
    mismoRegistro(datos.respuestas, hoy.respuestas) &&
    mismoRegistro(datos.chequeos, hoy.chequeos)
  );
}

/** El estado de una etapa que la compuerta deja abrir (la anterior está cumplida). */
function estadoAbrible(
  etapa: Construida,
  protocolo: DefinicionProtocolo,
  cuaderno: Cuaderno,
  huella: string | null,
  tabla: CsvTable | null,
  previas: Previas,
): EstadoEtapa {
  const evidencia = ultimaEvidencia(cuaderno, etapa.id);
  if (!evidencia) return { tipo: "abierta", evidencia: null, faltan: [] };
  if (anteriorCambio(protocolo, cuaderno, evidencia))
    return { tipo: "por-verificar", evidencia, motivo: "anterior-cambio" };
  if (etapa.dependeDeDatos && evidencia.huella !== huella)
    return {
      tipo: "por-verificar",
      evidencia,
      motivo: huella === null ? "sin-datos" : "datos-distintos",
    };
  const lectura = etapa.leer(evidencia.datos);
  if (!lectura.ok)
    return { tipo: "abierta", evidencia, faltan: [lectura.campo] };
  if (etapa.recalcular) {
    if (tabla === null)
      return { tipo: "por-verificar", evidencia, motivo: "sin-datos" };
    if (!cuadraConLaTabla(etapa, evidencia.datos, previas, tabla, huella))
      return { tipo: "por-verificar", evidencia, motivo: "no-cuadra" };
  }
  const veredicto = etapa.criterio(evidencia.datos, previas);
  if (veredicto.tipo === "cumple") return { tipo: "cumplida", evidencia };
  if (veredicto.tipo === "detenida")
    return { tipo: "detenida", evidencia, razon: veredicto.razon };
  return { tipo: "abierta", evidencia, faltan: veredicto.faltan };
}

/**
 * El estado de cada etapa, en orden. Solo la PRIMERA etapa que no está cumplida puede estar
 * abierta (o por verificar, o detenida); todas las que vienen después están cerradas por
 * ella, y las que no están construidas lo dicen. `tabla` es la tabla cuya huella es `huella`:
 * las etapas que calculan sobre ella (`recalcular`) se comparan contra lo que da hoy.
 */
export function evaluar(
  protocolo: DefinicionProtocolo,
  cuaderno: Cuaderno,
  huella: string | null,
  tabla: CsvTable | null = null,
): readonly EtapaEvaluada[] {
  const previas: Partial<Record<EtapaId, DatosEtapa>> = {};
  let bloquea: EtapaId | null = null;
  return protocolo.map((etapa): EtapaEvaluada => {
    if (!etapa.construida) {
      bloquea ??= etapa.id;
      return { etapa, estado: { tipo: "no-construida" } };
    }
    if (bloquea !== null)
      return { etapa, estado: { tipo: "cerrada", bloquea } };
    const estado = estadoAbrible(
      etapa,
      protocolo,
      cuaderno,
      huella,
      tabla,
      previas,
    );
    if (estado.tipo === "cumplida") previas[etapa.id] = estado.evidencia.datos;
    else bloquea = etapa.id;
    return { etapa, estado };
  });
}

export type RechazoRegistro =
  | { readonly tipo: "etapa-desconocida"; readonly etapa: EtapaId }
  | { readonly tipo: "no-construida"; readonly etapa: EtapaId }
  /** «La etapa N no abre sin la M»: la M es la primera que no está cumplida. */
  | {
      readonly tipo: "etapa-cerrada";
      readonly etapa: EtapaId;
      readonly bloquea: EtapaId;
    }
  | { readonly tipo: "sin-datos"; readonly etapa: EtapaId }
  | {
      readonly tipo: "datos-invalidos";
      readonly etapa: EtapaId;
      readonly campo: string;
    }
  | {
      readonly tipo: "criterio-no-cumplido";
      readonly etapa: EtapaId;
      readonly faltan: readonly string[];
    };

export type ResultadoRegistro =
  | {
      readonly ok: true;
      readonly cuaderno: Cuaderno;
      readonly evidencia: Evidencia;
    }
  | { readonly ok: false; readonly rechazo: RechazoRegistro };

/**
 * Registra lo que una etapa respondió y calculó. Es la ÚNICA puerta de entrada al cuaderno:
 * con la anterior sin cumplir, sin construir, sin los datos que la etapa necesita, con una
 * forma que no es la suya o sin cumplir su criterio, devuelve el rechazo y el cuaderno no
 * cambia. Una etapa que ya estaba cumplida, por verificar o detenida se puede registrar de
 * nuevo (corregir): la evidencia vieja queda, y las etapas siguientes vuelven a verificarse.
 */
export function registrar(
  protocolo: DefinicionProtocolo,
  cuaderno: Cuaderno,
  id: EtapaId,
  datos: DatosEtapa,
  contexto: {
    readonly huella: string | null;
    readonly ahora: Date;
    /** La tabla de esa huella: las etapas que calculan sobre ella la necesitan. */
    readonly tabla?: CsvTable | null;
  },
): ResultadoRegistro {
  const tabla = contexto.tabla ?? null;
  const evaluadas = evaluar(protocolo, cuaderno, contexto.huella, tabla);
  const actual = evaluadas.find((e) => e.etapa.id === id);
  if (!actual)
    return { ok: false, rechazo: { tipo: "etapa-desconocida", etapa: id } };
  const { etapa, estado } = actual;
  if (!etapa.construida || estado.tipo === "no-construida")
    return { ok: false, rechazo: { tipo: "no-construida", etapa: id } };
  if (estado.tipo === "cerrada")
    return {
      ok: false,
      rechazo: { tipo: "etapa-cerrada", etapa: id, bloquea: estado.bloquea },
    };
  if (
    etapa.dependeDeDatos &&
    (contexto.huella === null || (etapa.recalcular && tabla === null))
  )
    return { ok: false, rechazo: { tipo: "sin-datos", etapa: id } };
  const lectura = etapa.leer(datos);
  if (!lectura.ok)
    return {
      ok: false,
      rechazo: { tipo: "datos-invalidos", etapa: id, campo: lectura.campo },
    };

  const previas: Partial<Record<EtapaId, DatosEtapa>> = {};
  const base: Partial<Record<EtapaId, number>> = {};
  for (const anterior of evaluadas) {
    if (anterior.etapa.id >= id) break;
    if (anterior.estado.tipo !== "cumplida") continue;
    previas[anterior.etapa.id] = anterior.estado.evidencia.datos;
    base[anterior.etapa.id] = anterior.estado.evidencia.seq;
  }
  // Lo que la etapa trae calculado sobre la tabla tiene que ser lo que la tabla da: la compuerta
  // no confía en los chequeos que le llegan, los vuelve a calcular.
  if (
    etapa.recalcular &&
    tabla &&
    !cuadraConLaTabla(etapa, datos, previas, tabla, contexto.huella)
  )
    return {
      ok: false,
      rechazo: { tipo: "datos-invalidos", etapa: id, campo: "chequeos" },
    };
  const veredicto = etapa.criterio(datos, previas);
  if (veredicto.tipo === "falta")
    return {
      ok: false,
      rechazo: {
        tipo: "criterio-no-cumplido",
        etapa: id,
        faltan: veredicto.faltan,
      },
    };

  const evidencia: Evidencia = {
    seq: (cuaderno.evidencias.at(-1)?.seq ?? 0) + 1,
    etapa: id,
    fecha: contexto.ahora.toISOString(),
    huella: etapa.dependeDeDatos ? contexto.huella : null,
    base,
    datos,
  };
  return {
    ok: true,
    cuaderno: { ...cuaderno, evidencias: [...cuaderno.evidencias, evidencia] },
    evidencia,
  };
}
