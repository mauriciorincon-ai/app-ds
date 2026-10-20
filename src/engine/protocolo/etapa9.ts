// Protocolo DS (S14), etapa 9 — ¿SIRVE PARA LA DECISIÓN? (VISION v2.0.0 § 8, «Leer y decidir»: «con este
// umbral, tantas falsas alarmas por cada cien, tanto costo, tanto mejor que lo de hoy. Eliges desplegar,
// iterar o no usarlo, y "no usarlo" es un resultado válido que queda escrito»). La etapa NO abre la prueba:
// lee lo que la 8 dejó en el cuaderno (la medida en la prueba y, con dos clases, la tabla agregada de
// umbrales) y los costos de la etapa 1. No llama al worker.
//  · Dos clases: el umbral sale de tus costos (c_FP / (c_FP + c_FN), etapa 1), sin mirar la prueba. Moverlo
//    leyendo la curva exige una razón escrita y queda rotulado «elegido mirando la prueba: optimista»
//    (G-Plan 1a). Con el umbral: alertas por cada 100 casos, falsas alarmas por cada 100 alertas, costo por
//    cada 100 decisiones frente a no hacer nada, actuar con todos y la regla de hoy, y el beneficio neto
//    (análisis de curva de decisión: Vickers y Elkin, Medical Decision Making, 2006). La capacidad de tu
//    equipo (de cada 100 casos, cuántos atiende) marca el límite: si el umbral da más alertas, la etapa lo
//    dice y muestra el umbral de la capacidad con su costo. Sin probabilidades decide la clase que predice
//    el modelo, y lo dice. Si la 8 vio la calibración corrida, el umbral de tus costos se rotula poco fiable.
//  · Varias clases y estimar un número: el costo por decisión del ganador en la prueba (etapa 8), con su
//    intervalo, frente a lo de hoy (la regla de la etapa 5 o, sin ella, decidir sin modelo).
// La decisión es tuya: usarlo, iterar o no usarlo, con tu razón. «No usarlo» pasa la compuerta.
import { byTask, matchByTask } from "@/engine/despacho";
import type { SupervisedTask } from "@/engine/tarea";
import { costosDe, type Costos } from "./comparacion";
import {
  REJILLA,
  UMBRAL_CLASE,
  UMBRAL_E1,
  claveUmbral,
  tramosDe,
  type Conteo,
} from "./etapa8";
import type {
  DatosEtapa,
  EtapaConstruida,
  Lectura,
  Previas,
  Trampa,
  Valor,
  Veredicto,
} from "./etapas";
import { claveExtra, mapa, numero, texto, type Registro } from "./valores";

export const DECISIONES_9 = ["usar", "iterar", "no-usar"] as const;
export type Decision9 = (typeof DECISIONES_9)[number];
/** Tus razones (la del umbral y la de la decisión). */
export const RAZON_MAX = 500;
/**
 * Convención: si en el tramo con soporte más desajustado de la calibración (etapa 8) lo que dijo el modelo y
 * lo que pasó se separan 10 puntos o más, el umbral de tus costos (que supone probabilidades calibradas) se
 * rotula poco fiable. No es una prueba estadística.
 */
export const BRECHA_POCO_FIABLE = 0.1;
/** Con menos filas de prueba que estas, las cifras se mueven con pocos casos (la misma convención de la 8). */
export const PRUEBA_CHICA_9 = 100;

const FORMAS = ["binaria", "multiclase", "numerica"] as const;
/** Cómo decide la etapa: con la curva de umbrales, con la clase predicha, o con el costo (varias clases, número). */
const MODOS = ["curva", "clase", "costo"] as const;
export type Modo9 = (typeof MODOS)[number];

export const RESPUESTAS_9 = [
  "umbral",
  "razon_umbral",
  "capacidad",
  "decision",
  "razon",
] as const;

const TEXTOS = ["forma", "ganador", "modo", "hoy_id", "base_id"] as const;
const ENTEROS = ["aperturas", "n", "pos", "vp", "fp"] as const;
/** Por decisión (la pantalla los dice por cada 100). */
const COSTOS = [
  "costo_modelo",
  "modelo_bajo",
  "modelo_alto",
  "costo_base",
  "costo_regla",
  "costo_hoy",
  "costo_nada",
  "costo_todos",
  "cap_costo",
] as const;
const UMBRALES = [
  "umbral_e1",
  "umbral_usado",
  "cap_umbral",
  "cuantil",
] as const;
const POR_CIEN = ["alertas100", "falsas100", "cap_alertas100"] as const;
/** Pueden ser negativos: el ahorro (lo de hoy menos el modelo) y el beneficio neto. */
const CON_SIGNO = [
  "ahorro",
  "beneficio",
  "beneficio_todos",
  "beneficio_regla",
] as const;
const NUMEROS = [
  ...ENTEROS,
  ...COSTOS,
  ...UMBRALES,
  ...POR_CIEN,
  ...CON_SIGNO,
  "brecha",
] as const;

export const CHEQUEOS_9 = [...TEXTOS, ...NUMEROS] as const;

export const CLAVES_9 = {
  respuestas: RESPUESTAS_9,
  chequeos: CHEQUEOS_9,
} as const;

/** Las faltas del criterio (`protocol.stage.9.missing.<id>`). */
export const FALTAS_9 = [
  "etapas-previas",
  "tabla-8",
  "umbral",
  "razon-umbral",
  "capacidad",
  "decision",
  "razon",
] as const;

/** Las trampas de la etapa (`protocol.stage.9.trap.<clave>`). */
export const TRAMPAS_9 = [
  "reabierta",
  "prueba-chica",
  "sin-probabilidades",
  "umbral-movido",
  "poco-fiable",
  "capacidad",
  "capacidad-sin-umbral",
  "no-mejora",
  "usar-sin-mejora",
] as const;

// --- lo que la etapa lee de la 1 y de la 8 --------------------------------------------------------

type Binaria = Extract<Costos, { task: "binaria" }>;
type Numerica = Extract<Costos, { task: "numerica" }>;

/** ¿La decisión es de dos clases? (por el despacho: ninguna tarea cae en una rama ajena) */
export const esBinaria = (t: SupervisedTask): boolean =>
  byTask(t, { binaria: true, multiclase: false, numerica: false });

/** Los costos de dos clases, o `null` con otra forma. */
export const costosBinarios = (c: Costos): Binaria | null =>
  matchByTask(c, {
    binaria: (b) => b,
    multiclase: () => null,
    numerica: () => null,
  });

/** Los costos de estimar un número, o `null` con otra forma. */
export const costosNumericos = (c: Costos): Numerica | null =>
  matchByTask(c, {
    binaria: () => null,
    multiclase: () => null,
    numerica: (x) => x,
  });

export type Base9 = {
  readonly forma: SupervisedTask;
  /** Lo que registró la etapa 8. */
  readonly c8: Registro;
  readonly costos: Costos;
  /** Con dos clases: la tabla agregada de umbrales de la 8 (`null` si se registró antes del S14). */
  readonly tabla: Readonly<Record<string, number>> | null;
  /** Filas de la prueba y, con dos clases, cuántas son positivas. */
  readonly n: number | null;
  readonly pos: number | null;
};

export function base9(previas: Previas): Base9 | null {
  const e8 = previas[8];
  const costos = costosDe(previas);
  if (!e8 || !costos) return null;
  const c8 = e8.chequeos;
  return {
    forma: costos.task,
    c8,
    costos,
    tabla: esBinaria(costos.task) ? mapa(c8, "tabla_umbrales") : null,
    n: numero(c8, "n_prueba"),
    pos: numero(c8, "prueba_pos"),
  };
}

/** Los umbrales que se pueden elegir con la tabla: el de tus costos y la rejilla, o la clase predicha. */
export function opcionesUmbral(
  tabla: Readonly<Record<string, number>> | null,
): readonly string[] {
  if (!tabla) return [];
  if (Object.hasOwn(tabla, `vp:${UMBRAL_CLASE}`)) return [UMBRAL_CLASE];
  return [UMBRAL_E1, ...REJILLA.map(claveUmbral)].filter((k) =>
    Object.hasOwn(tabla, `vp:${k}`),
  );
}

/** Lo que decide el modelo en un umbral de la tabla (alertas acertadas y falsas). */
export function puntoEn(
  tabla: Readonly<Record<string, number>>,
  clave: string,
): Conteo | null {
  const [vp, fp] = [tabla[`vp:${clave}`], tabla[`fp:${clave}`]];
  return vp === undefined || fp === undefined ? null : { vp, fp };
}

/** El umbral como número (`null` para la clase predicha). */
export function valorUmbral(clave: string, e1: number): number | null {
  if (clave === UMBRAL_E1) return e1;
  if (clave === UMBRAL_CLASE) return null;
  return Number(clave);
}

/** Costo por decisión con dos clases: las falsas alarmas cuestan c_FP, los casos que se escapan c_FN. */
export const costoBinario = (
  costos: Binaria,
  n: number,
  pos: number,
  c: Conteo,
): number => (c.fp * costos.fp + (pos - c.vp) * costos.fn) / n;

/** El beneficio neto con un peso u/(1−u): alertas acertadas menos falsas por el peso, por caso. */
export const beneficioNeto = (n: number, c: Conteo, peso: number): number =>
  (c.vp - c.fp * peso) / n;

/** Alertas por cada 100 casos y falsas alarmas por cada 100 alertas. */
export const alertas100 = (n: number, c: Conteo) => ((c.vp + c.fp) / n) * 100;
export const falsas100 = (c: Conteo) =>
  c.vp + c.fp === 0 ? null : (c.fp / (c.vp + c.fp)) * 100;

/**
 * El umbral más bajo de la rejilla cuyas alertas caben en la capacidad (de cada 100 casos, cuántos atiende
 * tu equipo): las alertas bajan al subir el umbral, así que es el que más casos atiende sin pasarse.
 */
export function umbralCapacidad(
  tabla: Readonly<Record<string, number>>,
  n: number,
  capacidad: number,
): { readonly u: number; readonly punto: Conteo } | null {
  for (const u of REJILLA) {
    const p = puntoEn(tabla, claveUmbral(u));
    if (p && alertas100(n, p) <= capacidad) return { u, punto: p };
  }
  return null;
}

/** Un punto de la curva de decisión: en el umbral u, el beneficio neto con el peso u/(1−u). */
export type PuntoCurva = {
  readonly u: number;
  readonly modelo: number;
  readonly todos: number;
  readonly regla: number | null;
};

/** La curva de beneficio neto sobre la rejilla, frente a actuar con todos y la regla de hoy («nada» es 0). */
export function curvaDecision(b: Base9): PuntoCurva[] {
  if (!b.tabla || b.n === null || b.pos === null || b.n === 0) return [];
  const [n, pos] = [b.n, b.pos];
  const regla = reglaConteo(b.c8);
  const curva: PuntoCurva[] = [];
  for (const u of REJILLA) {
    const p = puntoEn(b.tabla, claveUmbral(u));
    if (!p) continue;
    const peso = u / (1 - u);
    curva.push({
      u,
      modelo: beneficioNeto(n, p, peso),
      todos: beneficioNeto(n, { vp: pos, fp: n - pos }, peso),
      regla: regla ? beneficioNeto(n, regla, peso) : null,
    });
  }
  return curva;
}

function reglaConteo(c8: Registro): Conteo | null {
  const [vp, fp] = [numero(c8, "regla_vp"), numero(c8, "regla_fp")];
  return vp === null || fp === null ? null : { vp, fp };
}

/** Lo que la 8 vio de la calibración: cuánto se separan lo dicho y lo que pasó en su tramo de lectura. */
export function brechaCalibracion(c8: Registro): number | null {
  if (c8.calibracion !== "medida") return null;
  const t = numero(c8, "cal_lectura");
  const tramos = tramosDe(c8);
  const tramo = t !== null && tramos ? tramos[t - 1] : undefined;
  return tramo ? Math.abs(tramo.predicho - tramo.observado) : null;
}

// --- lo que se registra ------------------------------------------------------------------------

/** Lo que escribes en la pantalla (la capacidad, como texto: se lee al registrar). */
export type EntradaEtapa9 = {
  readonly umbral: string;
  readonly razonUmbral: string;
  readonly capacidad: string;
  readonly decision: string;
  readonly razon: string;
};

export const ENTRADA_9_VACIA: EntradaEtapa9 = {
  umbral: UMBRAL_E1,
  razonUmbral: "",
  capacidad: "",
  decision: "",
  razon: "",
};

/** «0» a «100», enteros: de cada 100 casos, cuántos atiende tu equipo. */
export function capacidadDe(texto: string): number | null {
  const t = texto.trim();
  if (!/^\d{1,3}$/.test(t)) return null;
  const n = Number(t);
  return n <= 100 ? n : null;
}

const nulos = (claves: readonly string[]): Record<string, Valor> =>
  Object.fromEntries(claves.map((k) => [k, null]));

/** Lo que la etapa calcula con lo que registraron la 1 y la 8, y con tus respuestas. */
export function calcular9(
  previas: Previas,
  r: Registro,
): Record<string, Valor> {
  const c = nulos(CHEQUEOS_9);
  const b = base9(previas);
  if (!b) return c;
  const c8 = b.c8;
  const [base, regla] = [numero(c8, "base_costo"), numero(c8, "regla_costo")];
  const baseId = texto(c8, "base_id");
  Object.assign(c, {
    forma: b.forma,
    ganador: texto(c8, "ganador"),
    aperturas: numero(c8, "aperturas"),
    n: b.n,
    base_id: baseId,
    costo_base: base,
    costo_regla: regla,
    hoy_id: regla !== null ? "regla" : baseId,
    costo_hoy: regla ?? base,
  });
  const costos = costosBinarios(b.costos);
  if (!costos) {
    const num = costosNumericos(b.costos);
    Object.assign(c, {
      modo: "costo",
      costo_modelo: numero(c8, "ganador_costo"),
      modelo_bajo: numero(c8, "ganador_bajo"),
      modelo_alto: numero(c8, "ganador_alto"),
      cuantil: num ? num.sub / (num.sub + num.sobre) : null,
    });
  } else if (b.tabla && b.n !== null && b.pos !== null && b.n > 0) {
    const [tabla, n, pos] = [b.tabla, b.n, b.pos];
    const opciones = opcionesUmbral(tabla);
    const peso = costos.fp / costos.fn;
    Object.assign(c, {
      modo: opciones[0] === UMBRAL_CLASE ? "clase" : "curva",
      pos,
      umbral_e1: costos.umbral,
      costo_nada: costoBinario(costos, n, pos, { vp: 0, fp: 0 }),
      costo_todos: costoBinario(costos, n, pos, { vp: pos, fp: n - pos }),
      beneficio_todos: beneficioNeto(n, { vp: pos, fp: n - pos }, peso),
      brecha: brechaCalibracion(c8),
    });
    const rc = reglaConteo(c8);
    if (rc) c.beneficio_regla = beneficioNeto(n, rc, peso);
    const clave = texto(r, "umbral");
    const punto =
      clave !== null && opciones.includes(clave) ? puntoEn(tabla, clave) : null;
    if (clave !== null && punto) {
      // el intervalo de la etapa 8 es el del umbral de tus costos (o el de la clase predicha)
      const comoLa8 = clave === UMBRAL_E1 || clave === UMBRAL_CLASE;
      Object.assign(c, {
        umbral_usado: valorUmbral(clave, costos.umbral),
        vp: punto.vp,
        fp: punto.fp,
        alertas100: alertas100(n, punto),
        falsas100: falsas100(punto),
        costo_modelo: costoBinario(costos, n, pos, punto),
        modelo_bajo: comoLa8 ? numero(c8, "ganador_bajo") : null,
        modelo_alto: comoLa8 ? numero(c8, "ganador_alto") : null,
        beneficio: beneficioNeto(n, punto, peso),
      });
      const capacidad = numero(r, "capacidad");
      if (
        capacidad !== null &&
        alertas100(n, punto) > capacidad &&
        clave !== UMBRAL_CLASE
      ) {
        const cap = umbralCapacidad(tabla, n, capacidad);
        if (cap)
          Object.assign(c, {
            cap_umbral: cap.u,
            cap_costo: costoBinario(costos, n, pos, cap.punto),
            cap_alertas100: alertas100(n, cap.punto),
          });
      }
    }
  }
  const [modelo, hoy] = [numero(c, "costo_modelo"), numero(c, "costo_hoy")];
  c.ahorro = modelo !== null && hoy !== null ? hoy - modelo : null;
  return c;
}

/** Tus respuestas, ya leídas (la capacidad como número, `null` si no es un entero de 0 a 100). */
export function respuestasDe(
  entrada: EntradaEtapa9,
  forma: SupervisedTask | null,
): Record<string, Valor> {
  const binaria = forma !== null && esBinaria(forma);
  return {
    umbral: binaria && entrada.umbral !== "" ? entrada.umbral : null,
    razon_umbral: binaria ? entrada.razonUmbral : "",
    capacidad: binaria ? capacidadDe(entrada.capacidad) : null,
    decision: entrada.decision === "" ? null : entrada.decision,
    razon: entrada.razon,
  };
}

/** Lo que la etapa registra: tus respuestas y lo calculado con ellas sobre lo que dejaron la 1 y la 8. */
export function datosEtapa9(
  previas: Previas,
  entrada: EntradaEtapa9,
): DatosEtapa {
  const forma = costosDe(previas)?.task ?? null;
  const respuestas = respuestasDe(entrada, forma);
  return { respuestas, chequeos: calcular9(previas, respuestas) };
}

function recalcular(datos: DatosEtapa, previas: Previas): DatosEtapa {
  return {
    respuestas: datos.respuestas,
    chequeos: calcular9(previas, datos.respuestas),
  };
}

// --- leer, criterio, trampas -------------------------------------------------------------------

const esEntero = (v: Valor, minimo = 0) =>
  Number.isInteger(v) && (v as number) >= minimo;

const umbralValido = (u: string) =>
  u === UMBRAL_E1 || u === UMBRAL_CLASE || REJILLA.map(claveUmbral).includes(u);

/** ¿El umbral elegido es uno de la rejilla, es decir, uno que se movió mirando la curva? */
const movido = (u: Valor) =>
  typeof u === "string" && u !== UMBRAL_E1 && u !== UMBRAL_CLASE;

function leer(datos: DatosEtapa): Lectura {
  const r = datos.respuestas;
  const extraR = claveExtra(r, RESPUESTAS_9);
  if (extraR !== null) return { ok: false, campo: `respuestas.${extraR}` };
  const maloR = (k: string) => ({
    ok: false as const,
    campo: `respuestas.${k}`,
  });
  for (const k of RESPUESTAS_9) if (!Object.hasOwn(r, k)) return maloR(k);
  if (
    r.umbral !== null &&
    (typeof r.umbral !== "string" || !umbralValido(r.umbral))
  )
    return maloR("umbral");
  for (const k of ["razon_umbral", "razon"] as const)
    if (typeof r[k] !== "string" || (r[k] as string).length > RAZON_MAX)
      return maloR(k);
  if (
    r.capacidad !== null &&
    (!esEntero(r.capacidad!) || (r.capacidad as number) > 100)
  )
    return maloR("capacidad");
  if (
    r.decision !== null &&
    !(DECISIONES_9 as readonly unknown[]).includes(r.decision)
  )
    return maloR("decision");
  const c = datos.chequeos;
  const extra = claveExtra(c, CHEQUEOS_9);
  if (extra !== null) return { ok: false, campo: `chequeos.${extra}` };
  const malo = (k: string) => ({ ok: false as const, campo: `chequeos.${k}` });
  for (const k of CHEQUEOS_9) if (!Object.hasOwn(c, k)) return malo(k);
  for (const k of TEXTOS)
    if (c[k] !== null && typeof c[k] !== "string") return malo(k);
  for (const k of NUMEROS)
    if (c[k] !== null && numero(c, k) === null) return malo(k);
  if (c.forma !== null && !(FORMAS as readonly unknown[]).includes(c.forma))
    return malo("forma");
  if (c.modo !== null && !(MODOS as readonly unknown[]).includes(c.modo))
    return malo("modo");
  for (const k of ENTEROS)
    if (c[k] !== null && !esEntero(c[k]!)) return malo(k);
  for (const k of COSTOS) {
    const v = numero(c, k);
    if (v !== null && v < 0) return malo(k);
  }
  for (const k of UMBRALES) {
    const v = numero(c, k);
    if (v !== null && !(v > 0 && v < 1)) return malo(k);
  }
  for (const k of POR_CIEN) {
    const v = numero(c, k);
    if (v !== null && !(v >= 0 && v <= 100)) return malo(k);
  }
  const brecha = numero(c, "brecha");
  if (brecha !== null && !(brecha >= 0 && brecha <= 1)) return malo("brecha");
  const [n, pos, vp, fp] = [
    numero(c, "n"),
    numero(c, "pos"),
    numero(c, "vp"),
    numero(c, "fp"),
  ];
  if (n !== null && pos !== null && pos > n) return malo("pos");
  if (vp !== null && pos !== null && vp > pos) return malo("vp");
  if (fp !== null && n !== null && pos !== null && fp > n - pos)
    return malo("fp");
  return { ok: true };
}

function criterio(datos: DatosEtapa, previas: Previas): Veredicto {
  if (([1, 2, 3, 4, 5, 6, 7, 8] as const).some((n) => !previas[n]))
    return { tipo: "falta", faltan: ["etapas-previas"] };
  const b = base9(previas);
  if (!b) return { tipo: "falta", faltan: ["etapas-previas"] };
  // con dos clases, sin la tabla de umbrales de la 8 no hay números: la 8 se registra otra vez (no aquí)
  const binaria = esBinaria(b.forma);
  if (binaria && !b.tabla) return { tipo: "falta", faltan: ["tabla-8"] };
  const r = datos.respuestas;
  const faltan: string[] = [];
  if (binaria) {
    const u = texto(r, "umbral");
    if (u === null || !opcionesUmbral(b.tabla).includes(u))
      faltan.push("umbral");
    else if (movido(u) && (texto(r, "razon_umbral") ?? "").trim() === "")
      faltan.push("razon-umbral");
    if (numero(r, "capacidad") === null) faltan.push("capacidad");
  }
  if (!(DECISIONES_9 as readonly unknown[]).includes(r.decision))
    faltan.push("decision");
  if ((texto(r, "razon") ?? "").trim() === "") faltan.push("razon");
  return faltan.length > 0 ? { tipo: "falta", faltan } : { tipo: "cumple" };
}

/** Por decisión → por cada 100 decisiones, para los textos. */
const cada100 = (x: number) => Number((x * 100).toPrecision(12));

function trampas(datos: DatosEtapa): readonly Trampa[] {
  const c = datos.chequeos;
  const r = datos.respuestas;
  const salida: Trampa[] = [];
  if (c.ganador === null) return salida;
  const aperturas = numero(c, "aperturas");
  if (aperturas !== null && aperturas >= 2)
    salida.push({ clave: "reabierta", params: { n: aperturas } });
  const n = numero(c, "n");
  if (n !== null && n < PRUEBA_CHICA_9)
    salida.push({ clave: "prueba-chica", params: { n } });
  if (c.modo === "clase")
    salida.push({ clave: "sin-probabilidades", params: {} });
  const [usado, e1] = [numero(c, "umbral_usado"), numero(c, "umbral_e1")];
  if (movido(r.umbral) && usado !== null && e1 !== null)
    salida.push({
      clave: "umbral-movido",
      params: { umbralPct: usado, e1Pct: e1 },
    });
  const brecha = numero(c, "brecha");
  if (c.modo === "curva" && brecha !== null && brecha >= BRECHA_POCO_FIABLE)
    salida.push({ clave: "poco-fiable", params: { brechaPct: brecha } });
  const [capacidad, alertas] = [
    numero(r, "capacidad"),
    numero(c, "alertas100"),
  ];
  if (capacidad !== null && alertas !== null && alertas > capacidad) {
    const [cu, cc, ca] = [
      numero(c, "cap_umbral"),
      numero(c, "cap_costo"),
      numero(c, "cap_alertas100"),
    ];
    if (cu !== null && cc !== null && ca !== null)
      salida.push({
        clave: "capacidad",
        params: {
          alertas,
          capacidad,
          umbral: cu,
          capAlertas: ca,
          costo: cada100(cc),
        },
      });
    else
      salida.push({
        clave: "capacidad-sin-umbral",
        params: { alertas, capacidad },
      });
  }
  const [ahorro, modelo, hoy] = [
    numero(c, "ahorro"),
    numero(c, "costo_modelo"),
    numero(c, "costo_hoy"),
  ];
  if (ahorro !== null && modelo !== null && hoy !== null && ahorro <= 0) {
    salida.push({
      clave: "no-mejora",
      params: { modelo: cada100(modelo), hoy: cada100(hoy) },
    });
    if (r.decision === "usar")
      salida.push({ clave: "usar-sin-mejora", params: {} });
  }
  return salida;
}

// --- el resumen para el cuaderno ---------------------------------------------------------------

export type ResumenEtapa9 = {
  readonly forma: string | null;
  readonly modo: string | null;
  readonly decision: string | null;
  readonly razon: string | null;
  readonly costoModelo: number | null;
  readonly costoHoy: number | null;
  readonly hoyId: string | null;
  readonly umbral: number | null;
  readonly movido: boolean;
  readonly alertas: number | null;
  readonly falsas: number | null;
  readonly capacidad: number | null;
};

export function resumenEtapa9(datos: DatosEtapa): ResumenEtapa9 {
  const [r, c] = [datos.respuestas, datos.chequeos];
  return {
    forma: texto(c, "forma"),
    modo: texto(c, "modo"),
    decision: texto(r, "decision"),
    razon: texto(r, "razon"),
    costoModelo: numero(c, "costo_modelo"),
    costoHoy: numero(c, "costo_hoy"),
    hoyId: texto(c, "hoy_id"),
    umbral: numero(c, "umbral_usado"),
    movido: movido(r.umbral),
    alertas: numero(c, "alertas100"),
    falsas: numero(c, "falsas100"),
    capacidad: numero(r, "capacidad"),
  };
}

export const ETAPA_9: EtapaConstruida = {
  id: 9,
  construida: true,
  dependeDeDatos: true,
  terminos: [
    "umbral",
    "costo-de-error",
    "beneficio-neto",
    "falsas-alarmas",
    "capacidad-de-atencion",
  ],
  preguntas: ["umbral", "capacidad", "decision"],
  chequeos: ["costo", "alertas", "beneficio"],
  leer,
  criterio,
  recalcular,
  trampas,
};
