// Protocolo DS (S12), etapa 7 — EL GANADOR, CON LA PRUEBA CERRADA (VISION v2.0.0 § 8: «Probeta como
// instrumento» y «¿Hay señal real?»). La liga de Probeta corre heredando las decisiones del Protocolo
// —las columnas que la etapa 4 dejó en «usar», la forma y los costos de la etapa 1, la línea base de la
// 5— en pliegues que siguen el esquema sellado en la etapa 6, SOLO con las filas de entrenamiento: la
// prueba sigue cerrada hasta la etapa 8, que la abre una sola vez.
//
// Lo que la compuerta puede rehacer, lo rehace (`recalcular`): los pliegues y su huella, su verificación,
// el sello de la etapa 6, las columnas y la línea base por pliegue. Lo que sale del worker —los puntajes de
// la liga, el ganador, su costo por pliegue y la permutación— es DATO DEL WORKER: la compuerta es síncrona
// y no puede volver a entrenar, así que lo copia; pero el veredicto contra la línea base y el valor p se
// vuelven a calcular con esos números, y un cuaderno con uno de ellos cambiado no cuadra. Al cuaderno no
// va ninguna predicción por fila: solo conteos y agregados por pliegue.
import { byTask } from "@/engine/despacho";
import type { SupervisedTask } from "@/engine/tarea";
import { profileTable, type CsvTable } from "@/lib/ds/csv";
import type { ValidationResult } from "@/workers/protocol";
import {
  comparar,
  costoGanadorPorPliegue,
  costosDe,
  lineaBasePorPliegue,
  reglaDe,
  type BasePliegue,
  type Costos,
} from "./comparacion";
import { formaDe } from "./etapa1";
import { columnasParaEntrenar } from "./etapa4";
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
  esEsquema,
  esTemporal,
  esUnidadHorizonte,
  partir,
  type Diseno,
  disenoDe,
  type Particion,
  type UnidadHorizonte,
} from "./particion";
import { igualOMejor, senalDe, valorP } from "./permutacion";
import {
  K_MIN,
  SEMILLA_7,
  huellaPliegues,
  kPedidoPara,
  repartirPliegues,
  verificarPliegues,
  type ParametrosPliegues,
  type ResultadoPliegues,
  type VerificacionPliegues,
} from "./pliegues";
import {
  claveExtra,
  lista,
  mapa,
  numero,
  texto,
  type Registro,
} from "./valores";

const HEX64 = /^[0-9a-f]{64}$/;

// Lo que la compuerta rehace sobre la tabla.
const TEXTOS_TABLA = [
  "sello_6",
  "esquema",
  "razon_k",
  "huella_pliegues",
] as const;
const NUMEROS_TABLA = [
  "semilla",
  "n_entrenamiento",
  "k_pedido",
  "k",
  "solape_filas",
  "solape_unidades",
  "validacion_antes",
  "fuera_entrenamiento",
] as const;
const LISTAS_TABLA = [
  "columnas_numericas",
  "columnas_categoricas",
  "base_ids",
] as const;
const MAPAS_TABLA = [
  "pliegue_entrenamiento",
  "pliegue_validacion",
  "base_costo",
] as const;

/** Dato del worker: lo que solo se sabe entrenando. La compuerta lo copia, rotulado. */
export const DEL_WORKER = [
  "metrica",
  "roster",
  "liga_estados",
  "liga_cv",
  "ganador",
  "mejor",
  "ee",
  "ganador_pliegues",
  "ganador_costo",
  "perm_n",
  "perm_fallidas",
  "perm_mejores",
  "perm_observado",
] as const;

// Lo que sale de los dos: se vuelve a calcular con lo de la tabla y lo del worker.
const DERIVADOS = [
  "diferencia_media",
  "diferencia_ee",
  "ic_bajo",
  "ic_alto",
  "veredicto",
  "perm_p",
  "senal",
] as const;

const TEXTOS = [
  ...TEXTOS_TABLA,
  "metrica",
  "ganador",
  "mejor",
  "veredicto",
  "senal",
] as const;
const NUMEROS = [
  ...NUMEROS_TABLA,
  "ee",
  "perm_n",
  "perm_fallidas",
  "perm_mejores",
  "perm_observado",
  "diferencia_media",
  "diferencia_ee",
  "ic_bajo",
  "ic_alto",
  "perm_p",
] as const;
const LISTAS = [...LISTAS_TABLA, "roster", "liga_estados"] as const;
const MAPAS = [
  ...MAPAS_TABLA,
  "liga_cv",
  "ganador_pliegues",
  "ganador_costo",
] as const;

export const CHEQUEOS_7 = [...TEXTOS, ...NUMEROS, ...LISTAS, ...MAPAS] as const;

/** Las claves de la etapa: no pregunta nada (es el código el que verifica); calcula todo esto. */
export const CLAVES_7 = { respuestas: [], chequeos: CHEQUEOS_7 } as const;

/** Las faltas del criterio (`protocol.stage.7.missing.<id>`). */
export const FALTAS_7 = [
  "etapas-previas",
  "sello",
  "columnas",
  "pliegues",
  "solape",
  "liga",
  "veredicto",
  "permutacion",
] as const;

/** Las frases de «lo que esta etapa evitó» (`protocol.stage.7.trap.<id>`). */
export const TRAMPAS_7 = [
  "sin-mirar",
  "k-pocos-periodos",
  "k-pocas-unidades",
  "k-pocos-casos",
  "pocos-pliegues",
  "no-supera",
  "sin-senal",
  "perm-fallidas",
] as const;

const RAZONES_K = ["pedido", "pocos-periodos", "pocas-unidades", "pocos-casos"];

// --- el plan: lo que la etapa calcula sobre la tabla, sin entrenar ------------------------------

export type Plan7 = {
  readonly forma: SupervisedTask;
  /** La columna objetivo (etapa 2). */
  readonly objetivo: string;
  readonly diseno: Diseno;
  readonly particion: Particion;
  readonly sello6: string;
  readonly parametros: ParametrosPliegues;
  readonly pliegues: ResultadoPliegues;
  readonly verificacion: VerificacionPliegues | null;
  readonly huellaPliegues: string | null;
  readonly numericas: readonly string[];
  readonly categoricas: readonly string[];
  readonly costos: Costos | null;
  readonly base: readonly BasePliegue[] | null;
};

function calcularPlan(
  tabla: CsvTable,
  previas: Previas,
  huella: string,
): Plan7 | null {
  const [e1, e2, e4, e6] = [previas[1], previas[2], previas[4], previas[6]];
  if (!e1 || !e2 || !e4 || !e6) return null;
  const forma = formaDe(e1.respuestas);
  const d = forma ? disenoDe(tabla, forma, e2.respuestas) : null;
  if (!forma || !d) return null;
  // la partición sellada, rehecha exactamente como la registró la etapa 6
  const r6 = e6.respuestas;
  const esquema = r6.esquema;
  const tamano = numero(r6, "tamano");
  if (!esEsquema(esquema) || tamano === null) return null;
  const temporal = esTemporal(esquema);
  const horizonte = temporal ? numero(r6, "horizonte") : 0;
  if (
    horizonte === null ||
    (temporal && !esUnidadHorizonte(r6.horizonte_unidad))
  )
    return null;
  const unidad: UnidadHorizonte = temporal
    ? (r6.horizonte_unidad as UnidadHorizonte)
    : "dias";
  const sellada = partir(
    tabla,
    d,
    { esquema, tamano, horizonte, unidad },
    huella,
  );
  if (!sellada) return null;
  const entrenamiento = sellada.particion.entrenamiento;
  const parametros: ParametrosPliegues = {
    esquema,
    k: kPedidoPara(entrenamiento.length),
    horizonte,
    unidad,
  };
  const pliegues = repartirPliegues(d, entrenamiento, parametros);
  // las columnas que la etapa 4 dejó en «usar», con el tipo que les da Probeta (sin el objetivo ni fechas)
  const usar = new Set(columnasParaEntrenar(e4));
  const objetivo = texto(e2.respuestas, "objetivo");
  if (objetivo === null) return null;
  const [numericas, categoricas]: [string[], string[]] = [[], []];
  for (const perfil of profileTable(tabla)) {
    if (
      !usar.has(perfil.name) ||
      perfil.name === objetivo ||
      perfil.looksLikeDate
    )
      continue;
    (perfil.kind === "numeric" ? numericas : categoricas).push(perfil.name);
  }
  const costos = costosDe(previas);
  const regla =
    costos && pliegues.ok
      ? reglaDe(tabla, previas, costos, entrenamiento)
      : null;
  return {
    forma,
    objetivo,
    diseno: d,
    particion: sellada.particion,
    sello6: sellada.sello,
    parametros,
    pliegues,
    verificacion: pliegues.ok
      ? verificarPliegues(d, entrenamiento, parametros, pliegues)
      : null,
    huellaPliegues: pliegues.ok ? huellaPliegues(pliegues) : null,
    numericas,
    categoricas,
    costos,
    base:
      costos && pliegues.ok
        ? lineaBasePorPliegue(costos, d, pliegues.pliegues, regla)
        : null,
  };
}

const PLANES = new WeakMap<CsvTable, Map<string, Plan7 | null>>();

/**
 * El plan de la etapa sobre la tabla cargada: la partición sellada, los pliegues, su verificación, las
 * columnas y la línea base por pliegue. Guardado por tabla y por lo registrado en las etapas previas:
 * `evaluar`, `registrar` y la pantalla lo piden varias veces por clic.
 */
export function plan7(
  tabla: CsvTable,
  previas: Previas,
  huella: string | null,
): Plan7 | null {
  if (!huella) return null;
  const clave = JSON.stringify([
    huella,
    previas[1] ?? null,
    previas[2] ?? null,
    previas[4]?.respuestas ?? null,
    previas[5]?.respuestas ?? null,
    previas[6]?.respuestas ?? null,
  ]);
  let porClave = PLANES.get(tabla);
  if (!porClave) PLANES.set(tabla, (porClave = new Map()));
  if (!porClave.has(clave))
    porClave.set(clave, calcularPlan(tabla, previas, huella));
  return porClave.get(clave) ?? null;
}

/** «Mayor es mejor» en la métrica de la liga, salvo al estimar un número (el MAE). */
export const direccionDe = (forma: SupervisedTask) =>
  byTask(forma, {
    binaria: "higher" as const,
    multiclase: "higher" as const,
    numerica: "lower" as const,
  });

// --- lo que se registra ------------------------------------------------------------------------

/** Lo que corrió el worker: la configuración enviada y su resultado ya validado (contract.ts). */
export type Corrida7 = {
  readonly metrica: string;
  readonly roster: readonly string[];
  readonly resultado: ValidationResult;
};

const nulos = (claves: readonly string[]): Record<string, Valor> =>
  Object.fromEntries(claves.map((k) => [k, null]));

/** Una lista por pliegue como mapa «1», «2»…: el cuaderno no guarda listas de números. */
const porPliegue = (xs: readonly number[]): Record<string, number> =>
  Object.fromEntries(xs.map((x, j) => [String(j + 1), x]));

function dePliegues(
  m: Readonly<Record<string, number>>,
  k: number,
): number[] | null {
  const xs: number[] = [];
  for (let j = 1; j <= k; j++) {
    if (!Object.hasOwn(m, String(j))) return null;
    xs.push(m[String(j)]!);
  }
  return Object.keys(m).length === k ? xs : null;
}

function deLaTabla(plan: Plan7 | null): Record<string, Valor> {
  const c = nulos(CHEQUEOS_7);
  if (!plan) return c;
  Object.assign(c, {
    sello_6: plan.sello6,
    esquema: plan.parametros.esquema,
    semilla: SEMILLA_7,
    n_entrenamiento: plan.particion.entrenamiento.length,
    k_pedido: plan.parametros.k,
    razon_k: plan.pliegues.razon,
    columnas_numericas: [...plan.numericas],
    columnas_categoricas: [...plan.categoricas],
  });
  if (plan.pliegues.ok) {
    const v = plan.verificacion!;
    Object.assign(c, {
      k: plan.pliegues.k,
      huella_pliegues: plan.huellaPliegues,
      pliegue_entrenamiento: porPliegue(
        plan.pliegues.pliegues.map((p) => p.entrenamiento.length),
      ),
      pliegue_validacion: porPliegue(
        plan.pliegues.pliegues.map((p) => p.validacion.length),
      ),
      solape_filas: v.solapeFilas,
      solape_unidades: v.solapeUnidades,
      validacion_antes: v.validacionAntes,
      fuera_entrenamiento: v.fueraDelEntrenamiento,
      base_ids: plan.base ? plan.base.map((b) => b.referencia) : null,
      base_costo: plan.base ? porPliegue(plan.base.map((b) => b.costo)) : null,
    });
  }
  return c;
}

function delWorker(plan: Plan7, corrida: Corrida7): Record<string, Valor> {
  const r = corrida.resultado;
  const ganador = r.league.find((x) => x.name === r.winner)!.cv!;
  const costoGanador =
    plan.costos && plan.pliegues.ok
      ? costoGanadorPorPliegue(
          plan.costos,
          plan.diseno,
          plan.pliegues.pliegues,
          r.oof,
        )
      : null;
  return {
    metrica: corrida.metrica,
    roster: [...corrida.roster],
    liga_estados: r.league.map((x) => `${x.name}:${x.status}`),
    liga_cv: Object.fromEntries(
      r.league.flatMap((x) => (x.cv ? [[x.name, x.cv.mean] as const] : [])),
    ),
    ganador: r.winner,
    mejor: r.cv.best,
    ee: r.cv.se,
    ganador_pliegues: porPliegue(ganador.folds),
    ganador_costo: costoGanador ? porPliegue(costoGanador) : null,
    perm_n: r.permutation.n,
    perm_fallidas: r.permutation.failed,
    perm_mejores: igualOMejor(
      r.permutation.observed,
      r.permutation.scores,
      direccionDe(plan.forma),
    ),
    perm_observado: r.permutation.observed,
  };
}

/** El veredicto contra la línea base y el valor p, rehechos con lo de la tabla y lo del worker. */
function derivados(c: Registro): Record<string, Valor> {
  const out = nulos(DERIVADOS);
  const k = numero(c, "k");
  const [base, ganador] = [mapa(c, "base_costo"), mapa(c, "ganador_costo")];
  const b = k !== null && base ? dePliegues(base, k) : null;
  const g = k !== null && ganador ? dePliegues(ganador, k) : null;
  if (b && g) {
    const r = comparar(b, g);
    Object.assign(out, {
      diferencia_media: r.media,
      diferencia_ee: r.ee,
      ic_bajo: r.icBajo,
      ic_alto: r.icAlto,
      veredicto: r.veredicto,
    });
  }
  const [n, fallidas, mejores] = [
    numero(c, "perm_n"),
    numero(c, "perm_fallidas"),
    numero(c, "perm_mejores"),
  ];
  if (
    n !== null &&
    fallidas !== null &&
    mejores !== null &&
    n - fallidas >= 1
  ) {
    const p = valorP(mejores, n - fallidas);
    Object.assign(out, { perm_p: p, senal: senalDe(p) });
  }
  return out;
}

/**
 * Arma lo que la etapa 7 registra: lo que se calcula sobre la tabla y, si ya corrió, lo que devolvió el
 * worker (validado) con el veredicto y la permutación. Sin corrida, la liga y el veredicto quedan vacíos.
 */
export function datosEtapa7(
  tabla: CsvTable,
  previas: Previas,
  huella: string | null,
  corrida: Corrida7 | null,
): DatosEtapa {
  const plan = plan7(tabla, previas, huella);
  const c = deLaTabla(plan);
  if (plan && corrida && plan.pliegues.ok)
    Object.assign(c, delWorker(plan, corrida));
  Object.assign(c, derivados(c));
  return { respuestas: {}, chequeos: c };
}

function recalcular(
  datos: DatosEtapa,
  previas: Previas,
  tabla: CsvTable,
  huella?: string | null,
): DatosEtapa {
  const c = deLaTabla(plan7(tabla, previas, huella ?? null));
  // dato del worker: no se puede rehacer sin volver a entrenar
  for (const k of DEL_WORKER) c[k] = datos.chequeos[k] ?? null;
  Object.assign(c, derivados(c));
  return { respuestas: {}, chequeos: c };
}

// --- leer, criterio, trampas -----------------------------------------------------------------

function leer(datos: DatosEtapa): Lectura {
  const extraR = claveExtra(datos.respuestas, []);
  if (extraR !== null) return { ok: false, campo: `respuestas.${extraR}` };
  const c = datos.chequeos;
  const extra = claveExtra(c, CHEQUEOS_7);
  if (extra !== null) return { ok: false, campo: `chequeos.${extra}` };
  const malo = (k: string) => ({ ok: false as const, campo: `chequeos.${k}` });
  for (const k of CHEQUEOS_7) if (!Object.hasOwn(c, k)) return malo(k);
  for (const k of TEXTOS)
    if (c[k] !== null && typeof c[k] !== "string") return malo(k);
  for (const k of NUMEROS)
    if (c[k] !== null && numero(c, k) === null) return malo(k);
  for (const k of LISTAS)
    if (c[k] !== null && lista(c, k) === null) return malo(k);
  for (const k of MAPAS)
    if (c[k] !== null && mapa(c, k) === null) return malo(k);
  for (const k of ["sello_6", "huella_pliegues"] as const)
    if (c[k] !== null && !HEX64.test(c[k] as string)) return malo(k);
  if (c.esquema !== null && !esEsquema(c.esquema)) return malo("esquema");
  if (c.razon_k !== null && !RAZONES_K.includes(c.razon_k as string))
    return malo("razon_k");
  if (
    c.veredicto !== null &&
    !["supera", "no-supera"].includes(c.veredicto as string)
  )
    return malo("veredicto");
  if (c.senal !== null && !["senal", "sin-senal"].includes(c.senal as string))
    return malo("senal");
  return { ok: true };
}

const SOLAPES = [
  "solape_filas",
  "solape_unidades",
  "validacion_antes",
  "fuera_entrenamiento",
] as const;

function criterio(datos: DatosEtapa, previas: Previas): Veredicto {
  if (([1, 2, 3, 4, 5, 6] as const).some((n) => !previas[n]))
    return { tipo: "falta", faltan: ["etapas-previas"] };
  const c = datos.chequeos;
  const faltan: string[] = [];
  if (c.sello_6 === null || c.sello_6 !== previas[6]!.chequeos.sello)
    faltan.push("sello");
  const columnas =
    (lista(c, "columnas_numericas")?.length ?? 0) +
    (lista(c, "columnas_categoricas")?.length ?? 0);
  if (columnas === 0) faltan.push("columnas");
  const k = numero(c, "k");
  if (k === null || k < K_MIN) faltan.push("pliegues");
  else if (SOLAPES.some((x) => (numero(c, x) ?? 1) > 0)) faltan.push("solape");
  if (c.ganador === null) faltan.push("liga");
  else {
    // «no supera» es una respuesta válida (G-Plan 2a): lo que falta es que esté escrito
    if (c.veredicto === null) faltan.push("veredicto");
    if (c.perm_p === null) faltan.push("permutacion");
  }
  return faltan.length > 0 ? { tipo: "falta", faltan } : { tipo: "cumple" };
}

function trampas(datos: DatosEtapa): readonly Trampa[] {
  const c = datos.chequeos;
  const salida: Trampa[] = [];
  const [k, pedido] = [numero(c, "k"), numero(c, "k_pedido")];
  const razon = texto(c, "razon_k");
  if (k !== null && pedido !== null && razon !== null && razon !== "pedido")
    salida.push({ clave: `k-${razon}`, params: { k, pedido } });
  const roster = lista(c, "roster");
  if (c.ganador === null || k === null || !roster) return salida;
  salida.push({ clave: "sin-mirar", params: { n: roster.length, k } });
  if (k <= 3) salida.push({ clave: "pocos-pliegues", params: { k } });
  if (c.veredicto === "no-supera")
    salida.push({ clave: "no-supera", params: {} });
  const [p, n, fallidas] = [
    numero(c, "perm_p"),
    numero(c, "perm_n"),
    numero(c, "perm_fallidas"),
  ];
  if (c.senal === "sin-senal" && p !== null && n !== null && fallidas !== null)
    salida.push({ clave: "sin-senal", params: { p, n: n - fallidas } });
  if (fallidas !== null && fallidas > 0)
    salida.push({ clave: "perm-fallidas", params: { n: fallidas } });
  return salida;
}

// --- el resumen para el cuaderno ---------------------------------------------------------------

export type ResumenEtapa7 = {
  readonly esquema: string | null;
  readonly k: number | null;
  readonly ganador: string | null;
  readonly metrica: string | null;
  /** La «medida de selección»: el puntaje de CV del ganador. */
  readonly seleccion: number | null;
  readonly veredicto: string | null;
  readonly media: number | null;
  readonly icBajo: number | null;
  readonly icAlto: number | null;
  readonly senal: string | null;
  readonly p: number | null;
  readonly n: number | null;
};

export function resumenEtapa7(datos: DatosEtapa): ResumenEtapa7 {
  const c = datos.chequeos;
  const ganador = texto(c, "ganador");
  const cv = mapa(c, "liga_cv");
  const [n, fallidas] = [numero(c, "perm_n"), numero(c, "perm_fallidas")];
  return {
    esquema: texto(c, "esquema"),
    k: numero(c, "k"),
    ganador,
    metrica: texto(c, "metrica"),
    seleccion:
      ganador && cv && Object.hasOwn(cv, ganador) ? cv[ganador]! : null,
    veredicto: texto(c, "veredicto"),
    media: numero(c, "diferencia_media"),
    icBajo: numero(c, "ic_bajo"),
    icAlto: numero(c, "ic_alto"),
    senal: texto(c, "senal"),
    p: numero(c, "perm_p"),
    n: n !== null && fallidas !== null ? n - fallidas : null,
  };
}

export const ETAPA_7: EtapaConstruida = {
  id: 7,
  construida: true,
  dependeDeDatos: true,
  terminos: [
    "validacion-cruzada",
    "pliegue",
    "regla-un-error-estandar",
    "medida-de-seleccion",
    "linea-base",
    "prueba-de-permutacion",
  ],
  preguntas: [],
  chequeos: ["pliegues", "liga", "veredicto", "permutacion"],
  leer,
  criterio,
  recalcular,
  trampas,
};
