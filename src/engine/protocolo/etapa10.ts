// Protocolo DS (S15), etapa 10 — LA FICHA QUE SE ESCRIBE SOLA (VISION v2.0.0 § 8, «Dejar constancia»: «la ficha
// sale del cuaderno (datos, periodo, exclusiones, métricas por segmento, límites, para qué NO usarlo) más qué
// deriva lo invalida, cuándo reentrenar y quién responde. Compuerta: ficha completa y dueño nombrado»).
//  · La ficha (ficha.ts, que carga diferida) se arma SOLO con lo que el cuaderno ya registró en las etapas 1
//    a 9, cada línea con su etapa, su fecha y su huella: nada se recalcula y la prueba no se vuelve a abrir.
//    Lo derivado no se edita; lo que escribe el dueño va rotulado.
//  · Lo único que esta etapa calcula sobre la tabla es la REFERENCIA DE DERIVA (referencia-deriva.ts): con
//    «usar», cómo se reparten en el entrenamiento sellado las columnas que usa el modelo, en agregados.
//  · Plan de vigilancia (con «usar»): la deriva por columna con los umbrales de la etapa 4, el piso de la
//    decisión (lo de hoy, etapa 9), cada cuánto reentrenar y quién responde. La cadencia SUGERIDA es lo que
//    respalda la prueba: con una partición por tiempo, los meses entre el corte (etapa 6) y la última fecha
//    (etapa 2). El dueño la puede acortar; alargarla exige su razón escrita. Sin partición por tiempo la
//    prueba no dice por cuánto tiempo vale el modelo, y la cadencia la escribe el dueño.
//  · «No usar» e «iterar» (G-Plan 1a) también cierran con ficha y dueño, sin plan de vigilancia: qué
//    tendría que cambiar (o qué cambiar), en palabras del dueño.
// Compuerta: las etapas 1 a 9 cumplidas, el dueño nombrado y la ficha completa (con «usar», la cadencia y
// la referencia; si no, qué cambiar). No llama al worker.
import type { CsvTable } from "@/lib/ds/csv";
import { plan7 } from "./etapa7";
import { DECISIONES_9, RAZON_MAX, type Decision9 } from "./etapa9";
import type {
  DatosEtapa,
  EtapaConstruida,
  Lectura,
  Previas,
  Trampa,
  Valor,
  Veredicto,
} from "./etapas";
import {
  codificarReferencia,
  leerReferencia,
  referenciasDeriva,
} from "./referencia-deriva";
import { claveExtra, numero, texto } from "./valores";

export const RESPUESTAS_10 = [
  "dueno",
  "no_usar_para",
  "cadencia",
  "razon_cadencia",
  "cambiar",
] as const;
/** El nombre del dueño (una persona o un rol). */
export const DUENO_MAX = 120;
/** La cadencia de reentreno se escribe en meses enteros, de 1 a esto. */
export const CADENCIA_MAX = 60;

const BASES_CADENCIA = ["prueba", "sin-tiempo"] as const;
export type BaseCadencia = (typeof BASES_CADENCIA)[number];
const FORMAS = ["binaria", "multiclase", "numerica"] as const;

const TEXTOS = ["decision", "forma", "base_cadencia"] as const;
const ENTEROS = ["cadencia_sugerida", "n_referencia"] as const;
const LISTAS = ["vig_columnas", "vig_referencia"] as const;
export const CHEQUEOS_10 = [...TEXTOS, ...ENTEROS, ...LISTAS] as const;

export const FALTAS_10 = [
  "etapas-previas",
  "dueno",
  "cadencia",
  "razon-cadencia",
  "referencia",
  "cambiar",
] as const;

export const TRAMPAS_10 = [
  "sin-memoria",
  "solo-entradas",
  "sin-tiempo",
  "cadencia-alargada",
  "reabierta",
  "prueba-gastada",
] as const;

/** Lo que el usuario escribe en la pantalla (textos crudos; `respuestasDe` los lee). */
export type EntradaEtapa10 = {
  readonly dueno: string;
  readonly noUsarPara: string;
  readonly cadencia: string;
  readonly razonCadencia: string;
  readonly cambiar: string;
};

export const ENTRADA_10_VACIA: EntradaEtapa10 = {
  dueno: "",
  noUsarPara: "",
  cadencia: "",
  razonCadencia: "",
  cambiar: "",
};

/** Meses enteros entre dos fechas `AAAA-MM-DD` (`null` si alguna no lo es). */
export function mesesEntre(desde: string, hasta: string): number | null {
  const fecha = /^(\d{4})-(\d{2})-(\d{2})/;
  const [a, b] = [fecha.exec(desde), fecha.exec(hasta)];
  if (!a || !b) return null;
  const [y1, m1, d1] = [Number(a[1]), Number(a[2]), Number(a[3])];
  const [y2, m2, d2] = [Number(b[1]), Number(b[2]), Number(b[3])];
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
}

/**
 * La cadencia que respalda la prueba: con una partición por tiempo (la etapa 6 registró su corte), los meses
 * entre ese corte y la última fecha de los datos (etapa 2), de 1 a CADENCIA_MAX. Sin ella, ninguna.
 */
export function cadenciaSugerida(previas: Previas): {
  readonly sugerida: number | null;
  readonly base: BaseCadencia;
} {
  const corte = previas[6] ? texto(previas[6].chequeos, "corte") : null;
  const fin = previas[2] ? texto(previas[2].chequeos, "fecha_max") : null;
  const meses = corte && fin ? mesesEntre(corte, fin) : null;
  if (meses === null) return { sugerida: null, base: "sin-tiempo" };
  return {
    sugerida: Math.min(CADENCIA_MAX, Math.max(1, meses)),
    base: "prueba",
  };
}

/** La decisión de la etapa 9 (o `null` si la 9 no está o no dice una válida). */
export function decisionDe(previas: Previas): Decision9 | null {
  const d = previas[9] ? texto(previas[9].respuestas, "decision") : null;
  return DECISIONES_9.find((x) => x === d) ?? null;
}

const nulos = (claves: readonly string[]): Record<string, Valor> =>
  Object.fromEntries(claves.map((k) => [k, null]));

/** Lo que la etapa registra de la tabla y de las etapas previas (con «usar», la referencia de deriva). */
export function calcular10(
  previas: Previas,
  tabla: CsvTable | null,
  huella: string | null,
): Record<string, Valor> {
  const c = nulos(CHEQUEOS_10);
  const decision = decisionDe(previas);
  if (!decision) return c;
  Object.assign(c, { decision, forma: texto(previas[9]!.chequeos, "forma") });
  if (decision !== "usar") return c;
  const { sugerida, base } = cadenciaSugerida(previas);
  Object.assign(c, { cadencia_sugerida: sugerida, base_cadencia: base });
  const plan = tabla ? plan7(tabla, previas, huella) : null;
  if (!tabla || !plan) return c;
  const columnas = [...plan.numericas, ...plan.categoricas];
  const entrenamiento = plan.particion.entrenamiento;
  Object.assign(c, {
    vig_columnas: columnas,
    vig_referencia: referenciasDeriva(tabla, columnas, entrenamiento).map(
      codificarReferencia,
    ),
    n_referencia: entrenamiento.length,
  });
  return c;
}

/** Meses escritos como «1» a «60» (enteros, sin signo). */
export function cadenciaDe(escrito: string): number | null {
  const t = escrito.trim();
  if (!/^\d{1,2}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= CADENCIA_MAX ? n : null;
}

export function respuestasDe(
  entrada: EntradaEtapa10,
  decision: Decision9 | null,
): Record<string, Valor> {
  const usar = decision === "usar";
  return {
    dueno: entrada.dueno,
    no_usar_para: entrada.noUsarPara,
    cadencia: usar ? cadenciaDe(entrada.cadencia) : null,
    razon_cadencia: usar ? entrada.razonCadencia : "",
    cambiar: usar ? "" : entrada.cambiar,
  };
}

/** Lo que la etapa registra: tus respuestas y lo que calcula sobre la tabla y lo que dejaron la 1 a la 9. */
export function datosEtapa10(
  previas: Previas,
  tabla: CsvTable | null,
  huella: string | null,
  entrada: EntradaEtapa10,
): DatosEtapa {
  return {
    respuestas: respuestasDe(entrada, decisionDe(previas)),
    chequeos: calcular10(previas, tabla, huella),
  };
}

function recalcular(
  datos: DatosEtapa,
  previas: Previas,
  tabla: CsvTable,
  huella?: string | null,
): DatosEtapa {
  return {
    respuestas: datos.respuestas,
    chequeos: calcular10(previas, tabla, huella ?? null),
  };
}

// --- leer, criterio, trampas -------------------------------------------------------------------

const textoHasta = (v: Valor | undefined, max: number) =>
  typeof v === "string" && v.length <= max;
const enteroEn = (v: Valor | undefined, min: number, max: number) =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const unoDe = (v: Valor | undefined, opciones: readonly string[]) =>
  v === null || (typeof v === "string" && opciones.includes(v));
const textos = (v: Valor | undefined): v is readonly string[] =>
  Array.isArray(v) && v.every((s) => typeof s === "string");

function leer(datos: DatosEtapa): Lectura {
  const [r, c] = [datos.respuestas, datos.chequeos];
  const malo = (campo: string): Lectura => ({ ok: false, campo });
  const extraR = claveExtra(r, RESPUESTAS_10);
  if (extraR !== null) return malo(`respuestas.${extraR}`);
  const extraC = claveExtra(c, CHEQUEOS_10);
  if (extraC !== null) return malo(`chequeos.${extraC}`);

  if (!textoHasta(r.dueno, DUENO_MAX)) return malo("respuestas.dueno");
  for (const k of ["no_usar_para", "razon_cadencia", "cambiar"])
    if (!textoHasta(r[k], RAZON_MAX)) return malo(`respuestas.${k}`);
  if (r.cadencia !== null && !enteroEn(r.cadencia, 1, CADENCIA_MAX))
    return malo("respuestas.cadencia");

  if (!unoDe(c.decision, DECISIONES_9)) return malo("chequeos.decision");
  if (!unoDe(c.forma, FORMAS)) return malo("chequeos.forma");
  if (!unoDe(c.base_cadencia, BASES_CADENCIA))
    return malo("chequeos.base_cadencia");
  if (
    c.cadencia_sugerida !== null &&
    !enteroEn(c.cadencia_sugerida, 1, CADENCIA_MAX)
  )
    return malo("chequeos.cadencia_sugerida");
  if (
    c.n_referencia !== null &&
    !enteroEn(c.n_referencia, 0, Number.MAX_SAFE_INTEGER)
  )
    return malo("chequeos.n_referencia");

  const [columnas, referencias] = [c.vig_columnas, c.vig_referencia];
  if (columnas === null && referencias === null && c.n_referencia === null)
    return { ok: true };
  if (!textos(columnas)) return malo("chequeos.vig_columnas");
  if (!textos(referencias) || referencias.length !== columnas.length)
    return malo("chequeos.vig_referencia");
  for (const [i, guardada] of referencias.entries()) {
    const ref = leerReferencia(guardada);
    const total = ref ? ref.cuentas.reduce((s, n) => s + n, 0) : -1;
    if (!ref || ref.columna !== columnas[i] || total !== c.n_referencia)
      return malo("chequeos.vig_referencia");
  }
  return { ok: true };
}

function criterio(datos: DatosEtapa, previas: Previas): Veredicto {
  if (([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).some((n) => !previas[n]))
    return { tipo: "falta", faltan: ["etapas-previas"] };
  const decision = decisionDe(previas);
  if (!decision) return { tipo: "falta", faltan: ["etapas-previas"] };
  const [r, c] = [datos.respuestas, datos.chequeos];
  const lleno = (k: string) => (texto(r, k) ?? "").trim() !== "";
  const faltan: string[] = [];
  if (!lleno("dueno")) faltan.push("dueno");
  if (decision === "usar") {
    const cadencia = numero(r, "cadencia");
    const { sugerida } = cadenciaSugerida(previas);
    if (cadencia === null) faltan.push("cadencia");
    else if (sugerida !== null && cadencia > sugerida && !lleno("razon_cadencia"))
      faltan.push("razon-cadencia");
    if (!Array.isArray(c.vig_columnas)) faltan.push("referencia");
  } else if (!lleno("cambiar")) faltan.push("cambiar");
  return faltan.length > 0 ? { tipo: "falta", faltan } : { tipo: "cumple" };
}

function trampas(datos: DatosEtapa, previas: Previas): readonly Trampa[] {
  const decision = decisionDe(previas);
  if (!decision) return [];
  const salida: Trampa[] = [{ clave: "sin-memoria", params: { etapas: 9 } }];
  const aperturas = previas[8] ? numero(previas[8].chequeos, "aperturas") : null;
  if (aperturas !== null && aperturas > 1)
    salida.push({ clave: "reabierta", params: { aperturas } });
  if (decision === "usar") {
    const columnas = datos.chequeos.vig_columnas;
    salida.push({
      clave: "solo-entradas",
      params: { columnas: Array.isArray(columnas) ? columnas.length : 0 },
    });
    const { sugerida } = cadenciaSugerida(previas);
    const cadencia = numero(datos.respuestas, "cadencia");
    if (sugerida === null) salida.push({ clave: "sin-tiempo", params: {} });
    else if (cadencia !== null && cadencia > sugerida)
      salida.push({ clave: "cadencia-alargada", params: { cadencia, sugerida } });
  }
  if (decision === "iterar")
    salida.push({ clave: "prueba-gastada", params: { aperturas: aperturas ?? 1 } });
  return salida;
}

export type ResumenEtapa10 = {
  readonly decision: string | null;
  readonly dueno: string | null;
  readonly cadencia: number | null;
  readonly sugerida: number | null;
  readonly columnas: number | null;
};

/** Lo esencial de una evidencia de la etapa 10, para el cuaderno. */
export function resumenEtapa10(datos: DatosEtapa): ResumenEtapa10 {
  const [r, c] = [datos.respuestas, datos.chequeos];
  const columnas = c.vig_columnas;
  return {
    decision: texto(c, "decision"),
    dueno: texto(r, "dueno"),
    cadencia: numero(r, "cadencia"),
    sugerida: numero(c, "cadencia_sugerida"),
    columnas: Array.isArray(columnas) ? columnas.length : null,
  };
}

export const ETAPA_10: EtapaConstruida = {
  id: 10,
  construida: true,
  dependeDeDatos: true,
  terminos: ["cuaderno", "deriva"],
  preguntas: ["dueno", "cadencia", "cambiar"],
  chequeos: ["referencia", "cadencia"],
  leer,
  criterio,
  recalcular,
  trampas,
};
