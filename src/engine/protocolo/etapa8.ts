// Protocolo DS (S13), etapa 8 — LA PRUEBA, ABIERTA UNA VEZ (VISION v2.0.0 § 8: «Lectura del error por
// segmento y calibración»). La prueba que la etapa 6 selló se abre para el ganador de la etapa 7: el worker
// lo ajusta con TODO el entrenamiento y predice la prueba (src/lib/protocolo/prueba8.ts manda el envío solo
// si el sello que da la tabla hoy es el sellado). Con eso se mide, sin el sesgo de la selección:
//  · el ganador, la línea base sin modelo y la regla de hoy, en costo por decisión (los costos y el umbral
//    de la etapa 1, como la 5 y la 7: la etapa 9 es la que decide con ellos), con un intervalo bootstrap
//    sobre los conglomerados del esquema;
//  · el optimismo de la selección: la medida de la etapa 7 menos la misma métrica en la prueba;
//  · el error por segmento, con soporte mínimo, y el peor segmento;
//  · la calibración (curva y Brier) cuando el modelo da probabilidades;
//  · los peores casos, que se ven SOLO en pantalla: al cuaderno va cuántos y tu patrón de fallo, nunca filas;
//  · S14, con dos clases: la tabla agregada de umbrales (cuántas alertas acertadas y cuántas falsas en cada
//    umbral de 0,01 a 0,99 y en el de tus costos; ninguna fila), para que la etapa 9 decida sin volver a abrir
//    la prueba.
// Abrir otra vez la prueba con otra configuración se cuenta y se rotula; no se bloquea (F0 #13).
//
// Lo que la compuerta puede rehacer con la tabla, lo rehace (`recalcular`): la partición y su sello, los
// segmentos y su soporte, la línea base y la regla con su intervalo. Lo que sale del worker (la predicción
// del ganador, y con ella su costo, su costo por segmento, la calibración) se COPIA, rotulado; lo que se
// deriva de los dos (el optimismo, el peor segmento, la lectura de la calibración) se vuelve a calcular.
import { byTask, matchByTask } from "@/engine/despacho";
import type { SupervisedTask } from "@/engine/tarea";
import type { CsvTable } from "@/lib/ds/csv";
import type { TestResult } from "@/workers/protocol";
import {
  REMUESTREOS,
  SEMILLA_8,
  conglomeradosDe,
  intervaloBootstrap,
  type Intervalo,
} from "./bootstrap";
import { SOPORTE_TRAMO, calibrar, lecturaDe, type Tramo } from "./calibracion";
import {
  costosPorFila,
  decisionGanador,
  lineaBaseSinModelo,
  prediccionRegla,
  reglaDe,
} from "./comparacion";
import { direccionDe, plan7, type Plan7 } from "./etapa7";
import type {
  DatosEtapa,
  EtapaConstruida,
  Lectura,
  Previas,
  Trampa,
  Valor,
  Veredicto,
} from "./etapas";
import { esEsquema, type Esquema } from "./particion";
import {
  casosDe,
  claseRaraDe,
  conSoporte,
  segmentosDe,
  type Segmento,
} from "./segmentos";
import { sha256TextoSync } from "./sha256";
import {
  claveExtra,
  lista,
  mapa,
  numero,
  texto,
  type Registro,
} from "./valores";

const HEX64 = /^[0-9a-f]{64}$/;
/** Cuántos peores casos se muestran en pantalla. */
export const PEORES = 10;
/** Con menos filas de prueba que estas, la pantalla avisa que los intervalos son anchos. Convención. */
export const PRUEBA_CHICA = 100;
/** El patrón de fallo que escribes (G-Plan 2a). */
export const PATRON_MAX = 500;

/** S14: los umbrales en que la etapa cuenta las alertas de la prueba, de 0,01 a 0,99. */
export const REJILLA = Array.from({ length: 99 }, (_, i) => (i + 1) / 100);
/** La clave de un umbral de la rejilla en la tabla («0.35»). */
export const claveUmbral = (u: number) => u.toFixed(2);
/** El umbral de tus costos (etapa 1), en la tabla: no tiene por qué caer en la rejilla. */
export const UMBRAL_E1 = "e1";
/** Sin probabilidades no hay umbral: la tabla trae lo que decide la clase que predice el modelo. */
export const UMBRAL_CLASE = "clase";

export type Conglomerado = "fila" | "unidad" | "fecha";
const CONGLOMERADO: Readonly<Record<Esquema, Conglomerado>> = {
  estratificada: "fila",
  grupo: "unidad",
  tiempo: "fecha",
  "tiempo-grupo": "unidad",
};

// Lo que la compuerta rehace sobre la tabla (y sobre lo que registró la etapa 7).
const TEXTOS_TABLA = [
  "sello_6",
  "esquema",
  "conglomerado",
  "huella_pliegues",
  "base_id",
  "clase_rara",
] as const;
const NUMEROS_TABLA = [
  "semilla",
  "remuestreos",
  "n_entrenamiento",
  "n_prueba",
  "seleccion",
  "base_costo",
  "base_bajo",
  "base_alto",
  "regla_costo",
  "regla_bajo",
  "regla_alto",
  // S14, con dos clases: los positivos de la prueba y lo que decide la regla de hoy (cuántas alertas acierta y
  // cuántas son falsas)
  "prueba_pos",
  "regla_vp",
  "regla_fp",
] as const;
const LISTAS_TABLA = ["columnas_numericas", "columnas_categoricas"] as const;
const MAPAS_TABLA = ["seg_n", "seg_casos"] as const;

/** Dato del worker: lo que solo se sabe con la predicción del ganador. La compuerta lo copia, rotulado. */
export const DEL_WORKER_8 = [
  "ganador",
  "metrica",
  "prueba_metrica",
  "ganador_costo",
  "ganador_bajo",
  "ganador_alto",
  "seg_costo",
  "calibracion",
  "cal_n",
  "cal_pred",
  "cal_obs",
  "brier",
  "brier_base",
  "peores_n",
  // del cuaderno, no del worker: las aperturas distintas de la prueba cuando se registró
  "aperturas",
  // S14: la tabla agregada de umbrales (con dos clases)
  "tabla_umbrales",
] as const;

/**
 * S14: lo que la etapa guarda desde el S14. Un cuaderno de antes no lo trae y se sigue leyendo (y cuadrando):
 * la etapa 9 lo pide, y registrar la 8 otra vez lo calcula (la prueba se vuelve a abrir: cuenta como apertura solo si cambió la configuración).
 */
export const NUEVOS_S14 = [
  "prueba_pos",
  "regla_vp",
  "regla_fp",
  "tabla_umbrales",
] as const;

// Lo que sale de los dos (el optimismo, el peor segmento, la lectura) se vuelve a calcular: `derivados`.

const TEXTOS = [
  ...TEXTOS_TABLA,
  "ganador",
  "metrica",
  "calibracion",
  "peor_segmento",
] as const;
const NUMEROS = [
  ...NUMEROS_TABLA,
  "prueba_metrica",
  "ganador_costo",
  "ganador_bajo",
  "ganador_alto",
  "brier",
  "brier_base",
  "peores_n",
  "aperturas",
  "optimismo",
  "peor_exceso",
  "seg_con_soporte",
  "cal_lectura",
] as const;
const LISTAS = [...LISTAS_TABLA] as const;
const MAPAS = [
  ...MAPAS_TABLA,
  "seg_costo",
  "cal_n",
  "cal_pred",
  "cal_obs",
  "tabla_umbrales",
] as const;

export const CHEQUEOS_8 = [...TEXTOS, ...NUMEROS, ...LISTAS, ...MAPAS] as const;
export const RESPUESTAS_8 = ["patron"] as const;

/** La etapa pregunta una cosa: tu patrón de fallo sobre los peores casos (G-Plan 2a). */
export const CLAVES_8 = {
  respuestas: RESPUESTAS_8,
  chequeos: CHEQUEOS_8,
} as const;

/** Las faltas del criterio (`protocol.stage.8.missing.<id>`). */
export const FALTAS_8 = [
  "etapas-previas",
  "sello",
  "prueba",
  "ganador",
  "segmento",
  "calibracion",
  "patron",
] as const;

/** Las trampas de la etapa (`protocol.stage.8.trap.<clave>`). */
export const TRAMPAS_8 = [
  "reabierta",
  "prueba-chica",
  "optimismo",
  "peor-periodo",
  "peor-categoria",
  "peor-tramo",
  "ningun-segmento",
  "ninguno-peor",
  "sin-soporte",
  "sin-probabilidades",
] as const;

const CALIBRACIONES = ["medida", "sin-probabilidades", "no-aplica"] as const;
const CONGLOMERADOS = ["fila", "unidad", "fecha"] as const;

// --- el plan: lo que la etapa calcula sobre la tabla, sin abrir la prueba en el worker -------------

type MedidaTabla = {
  readonly referencia: string;
  readonly costos: readonly number[];
  readonly intervalo: Intervalo;
};

export type Plan8 = {
  readonly plan7: Plan7;
  /** El sello que da la tabla hoy es el que registró la etapa 6: solo así se abre la prueba. */
  readonly selloOk: boolean;
  /** Lo que registró la etapa 7: el ganador, su métrica, su medida de selección y sus pliegues. */
  readonly ganador: string | null;
  readonly metrica: string | null;
  readonly seleccion: number | null;
  readonly huellaPliegues: string | null;
  readonly conglomerado: Conglomerado;
  /** El conglomerado de cada fila de la prueba (en el orden de la prueba). */
  readonly grupos: readonly number[];
  readonly base: MedidaTabla | null;
  readonly regla: MedidaTabla | null;
  readonly segmentos: readonly Segmento[];
  readonly claseRara: string | null;
  /** S14, con dos clases: cuántas filas de la prueba son positivas. */
  readonly positivos: number | null;
  /** S14, con dos clases: lo que decide la regla de hoy en la prueba. */
  readonly reglaConteo: Conteo | null;
};

/** Con dos clases, en la prueba: alertas que aciertan (vp) y alertas falsas (fp). */
export type Conteo = { readonly vp: number; readonly fp: number };

function contar(
  d: Plan7["diseno"],
  prueba: readonly number[],
  actua: (f: number, i: number) => boolean,
): Conteo {
  let [vp, fp] = [0, 0];
  prueba.forEach((f, i) => {
    if (!actua(f, i)) return;
    if (d.clases![f] === d.positivo) vp++;
    else fp++;
  });
  return { vp, fp };
}

function calcularPlan(
  tabla: CsvTable,
  previas: Previas,
  huella: string,
): Plan8 | null {
  const p7 = plan7(tabla, previas, huella);
  const [e6, e7] = [previas[6], previas[7]];
  if (!p7 || !e6) return null;
  const { diseno: d, particion } = p7;
  const { entrenamiento, prueba } = particion;
  const conglomerado = CONGLOMERADO[particion.esquema];
  const clave = (f: number): string =>
    conglomerado === "unidad"
      ? (d.unidades?.[f] ?? `#${f}`)
      : conglomerado === "fecha"
        ? (d.fechas?.[f] ?? `#${f}`)
        : `#${f}`;
  const grupos = conglomeradosDe(prueba.map(clave));
  const medir = (
    referencia: string,
    predecir: (f: number) => boolean | string | number,
  ): MedidaTabla => {
    const costos = costosPorFila(p7.costos!, d, prueba, predecir);
    return {
      referencia,
      costos,
      intervalo: intervaloBootstrap(costos, grupos),
    };
  };
  let base: MedidaTabla | null = null;
  let regla: MedidaTabla | null = null;
  let reglaConteo: Conteo | null = null;
  const binaria = byTask(p7.forma, {
    binaria: true,
    multiclase: false,
    numerica: false,
  });
  if (p7.costos && prueba.length > 0 && entrenamiento.length > 0) {
    const b = lineaBaseSinModelo(p7.costos, d, entrenamiento);
    base = medir(b.referencia, b.predecir);
    const r = reglaDe(tabla, previas, p7.costos, prueba);
    if (r) {
      const predecir = prediccionRegla(r);
      regla = medir("regla", predecir);
      if (binaria) reglaConteo = contar(d, prueba, (f) => predecir(f) === true);
    }
  }
  const ganador = e7 ? texto(e7.chequeos, "ganador") : null;
  const cv = e7 ? mapa(e7.chequeos, "liga_cv") : null;
  return {
    plan7: p7,
    selloOk: p7.sello6 === e6.chequeos.sello,
    ganador,
    metrica: e7 ? texto(e7.chequeos, "metrica") : null,
    seleccion:
      ganador && cv && Object.hasOwn(cv, ganador) ? cv[ganador]! : null,
    huellaPliegues: e7 ? texto(e7.chequeos, "huella_pliegues") : null,
    conglomerado,
    grupos,
    base,
    regla,
    segmentos: segmentosDe(
      tabla,
      d,
      entrenamiento,
      prueba,
      p7.numericas,
      p7.categoricas,
    ),
    claseRara: claseRaraDe(d, prueba),
    positivos: binaria
      ? prueba.filter((f) => d.clases![f] === d.positivo).length
      : null,
    reglaConteo,
  };
}

const PLANES = new WeakMap<CsvTable, Map<string, Plan8 | null>>();

/** El plan de la etapa sobre la tabla cargada, guardado por tabla y por lo registrado en las etapas 1–7. */
export function plan8(
  tabla: CsvTable,
  previas: Previas,
  huella: string | null,
): Plan8 | null {
  if (!huella) return null;
  const clave = JSON.stringify([
    huella,
    previas[1] ?? null,
    previas[2] ?? null,
    previas[4]?.respuestas ?? null,
    previas[5]?.respuestas ?? null,
    previas[6]?.respuestas ?? null,
    previas[6]?.chequeos.sello ?? null,
    previas[7]?.chequeos ?? null,
  ]);
  let porClave = PLANES.get(tabla);
  if (!porClave) PLANES.set(tabla, (porClave = new Map()));
  if (!porClave.has(clave))
    porClave.set(clave, calcularPlan(tabla, previas, huella));
  return porClave.get(clave) ?? null;
}

/** La clave de una apertura: lo que se evalúa. Abrir de nuevo lo mismo no suma; otra configuración, sí. */
export function claveApertura(huella: string, plan: Plan8): string | null {
  if (!plan.ganador) return null;
  return sha256TextoSync(
    [
      "PROTOCOLO-DS/APERTURA/1",
      `huella=${huella}`,
      `sello=${plan.plan7.sello6}`,
      `ganador=${plan.ganador}`,
      `pliegues=${plan.huellaPliegues ?? ""}`,
      `numericas=${plan.plan7.numericas.join(",")}`,
      `categoricas=${plan.plan7.categoricas.join(",")}`,
    ].join("\n"),
  );
}

// --- lo que se registra ------------------------------------------------------------------------

/** Lo que devolvió el worker al abrir la prueba, ya validado (contrato-prueba.ts). */
export type Corrida8 = { readonly resultado: TestResult };

export type EntradaEtapa8 = { readonly patron: string };
export const ENTRADA_8_VACIA: EntradaEtapa8 = { patron: "" };

const nulos = (claves: readonly string[]): Record<string, Valor> =>
  Object.fromEntries(claves.map((k) => [k, null]));

const promedio = (xs: readonly number[]) =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

function deLaTabla(plan: Plan8 | null): Record<string, Valor> {
  const c = nulos(CHEQUEOS_8);
  if (!plan) return c;
  const p7 = plan.plan7;
  const { d, prueba } = { d: p7.diseno, prueba: p7.particion.prueba };
  const n = new Map<string, number>();
  const casos = new Map<string, number>();
  for (const seg of plan.segmentos) {
    n.set(seg.id, seg.filas.length);
    const k = casosDe(seg, d, plan.claseRara);
    if (k !== null) casos.set(seg.id, k);
  }
  Object.assign(c, {
    sello_6: p7.sello6,
    esquema: p7.particion.esquema,
    conglomerado: plan.conglomerado,
    huella_pliegues: plan.huellaPliegues,
    clase_rara: plan.claseRara,
    semilla: SEMILLA_8,
    remuestreos: REMUESTREOS,
    n_entrenamiento: p7.particion.entrenamiento.length,
    n_prueba: prueba.length,
    seleccion: plan.seleccion,
    columnas_numericas: [...p7.numericas],
    columnas_categoricas: [...p7.categoricas],
    seg_n: Object.fromEntries(n),
    seg_casos: plan.claseRara === null ? null : Object.fromEntries(casos),
  });
  if (plan.base)
    Object.assign(c, {
      base_id: plan.base.referencia,
      base_costo: plan.base.intervalo.media,
      base_bajo: plan.base.intervalo.bajo,
      base_alto: plan.base.intervalo.alto,
    });
  if (plan.regla)
    Object.assign(c, {
      regla_costo: plan.regla.intervalo.media,
      regla_bajo: plan.regla.intervalo.bajo,
      regla_alto: plan.regla.intervalo.alto,
    });
  Object.assign(c, {
    prueba_pos: plan.positivos,
    regla_vp: plan.reglaConteo?.vp ?? null,
    regla_fp: plan.reglaConteo?.fp ?? null,
  });
  return c;
}

/**
 * S14, con dos clases: la tabla agregada de umbrales. En cada umbral u de la rejilla, cuántas alertas
 * (probabilidad ≥ u) aciertan y cuántas son falsas; lo mismo en el umbral de tus costos (`e1`), que es el que
 * usa la etapa 8. Sin probabilidades, lo que decide la clase predicha (`clase`). Conteos, ninguna fila.
 */
export function tablaUmbrales(
  plan: Plan8,
  r: TestResult,
): Record<string, number> | null {
  const p7 = plan.plan7;
  // el umbral de tus costos, solo con dos clases
  const u1 = p7.costos
    ? matchByTask(p7.costos, {
        binaria: (b) => b.umbral,
        multiclase: () => null,
        numerica: () => null,
      })
    : null;
  if (u1 === null) return null;
  const { diseno: d, particion } = p7;
  const tabla: Record<string, number> = {};
  const anotar = (clave: string, c: Conteo) => {
    tabla[`vp:${clave}`] = c.vp;
    tabla[`fp:${clave}`] = c.fp;
  };
  const proba = r.proba;
  if (!proba) {
    anotar(
      UMBRAL_CLASE,
      contar(d, particion.prueba, (_, i) => r.pred[i] === 1),
    );
    return tabla;
  }
  anotar(
    UMBRAL_E1,
    contar(d, particion.prueba, (_, i) => proba[i]! >= u1),
  );
  for (const u of REJILLA)
    anotar(
      claveUmbral(u),
      contar(d, particion.prueba, (_, i) => proba[i]! >= u),
    );
  return tabla;
}

/** Por fila de la prueba, lo que cuesta lo que decidió el ganador (para el intervalo y los segmentos). */
export function costosGanador(plan: Plan8, corrida: Corrida8): number[] | null {
  const p7 = plan.plan7;
  if (!p7.costos) return null;
  const decide = decisionGanador(p7.costos, corrida.resultado);
  return costosPorFila(p7.costos, p7.diseno, p7.particion.prueba, (_, i) =>
    decide(i),
  );
}

/** Lo que se calibra, por fila de la prueba: lo que dijo el modelo y si pasó (o si acertó). */
function aCalibrar(
  plan: Plan8,
  r: TestResult,
): { probas: number[]; pasa: (0 | 1)[] } | null {
  const { diseno: d, particion } = plan.plan7;
  const proba = r.proba;
  return byTask(plan.plan7.forma, {
    binaria: () =>
      proba
        ? {
            probas: [...proba],
            pasa: particion.prueba.map((f) =>
              d.clases![f] === d.positivo ? (1 as const) : (0 as const),
            ),
          }
        : null,
    multiclase: () =>
      proba
        ? {
            probas: [...proba],
            pasa: particion.prueba.map((f, i) =>
              r.pred[i] === d.clases![f] ? (1 as const) : (0 as const),
            ),
          }
        : null,
    numerica: () => null,
  })();
}

const porTramo = (tramos: readonly Tramo[], campo: keyof Tramo) =>
  Object.fromEntries(tramos.map((t, i) => [String(i + 1), t[campo]]));

function delWorker(
  plan: Plan8,
  corrida: Corrida8,
  aperturas: number | null,
): Record<string, Valor> {
  const r = corrida.resultado;
  const costos = costosGanador(plan, corrida);
  const intervalo = costos ? intervaloBootstrap(costos, plan.grupos) : null;
  const posicion = new Map(plan.plan7.particion.prueba.map((f, i) => [f, i]));
  const segCosto = new Map<string, number>();
  if (costos)
    for (const seg of plan.segmentos)
      segCosto.set(
        seg.id,
        promedio(seg.filas.map((f) => costos[posicion.get(f)!]!)),
      );
  const calibrable = aCalibrar(plan, r);
  const cal = calibrable ? calibrar(calibrable.probas, calibrable.pasa) : null;
  return {
    ganador: r.winner,
    metrica: r.metric.name,
    prueba_metrica: r.metric.value,
    ganador_costo: intervalo?.media ?? null,
    ganador_bajo: intervalo?.bajo ?? null,
    ganador_alto: intervalo?.alto ?? null,
    seg_costo: costos ? Object.fromEntries(segCosto) : null,
    calibracion: byTask(plan.plan7.forma, {
      binaria: cal ? "medida" : "sin-probabilidades",
      multiclase: cal ? "medida" : "sin-probabilidades",
      numerica: "no-aplica",
    }),
    cal_n: cal ? porTramo(cal.tramos, "n") : null,
    cal_pred: cal ? porTramo(cal.tramos, "predicho") : null,
    cal_obs: cal ? porTramo(cal.tramos, "observado") : null,
    brier: cal?.brier ?? null,
    brier_base: cal?.brierBase ?? null,
    peores_n: Math.min(PEORES, plan.plan7.particion.prueba.length),
    aperturas,
    tabla_umbrales: tablaUmbrales(plan, r),
  };
}

/** Lo que se deriva de lo de la tabla y lo del worker: el optimismo, el peor segmento, la lectura. */
function derivados(
  c: Registro,
  forma: SupervisedTask | null,
): Record<string, Valor> {
  const [seleccion, enPrueba] = [
    numero(c, "seleccion"),
    numero(c, "prueba_metrica"),
  ];
  const optimismo =
    seleccion === null || enPrueba === null || forma === null
      ? null
      : direccionDe(forma) === "higher"
        ? seleccion - enPrueba
        : enPrueba - seleccion;
  // el peor segmento: el de mayor exceso de costo sobre el global, solo entre los que tienen soporte y a los que
  // les va PEOR que a toda la prueba (exceso > 0): si ninguno lo está, no se marca ninguno (S14, M1)
  const [segN, segCasos, segCosto] = [
    mapa(c, "seg_n"),
    mapa(c, "seg_casos"),
    mapa(c, "seg_costo"),
  ];
  const global = numero(c, "ganador_costo");
  let peor: { id: string; exceso: number } | null = null;
  let soportados = 0;
  if (segN && segCosto && global !== null) {
    for (const id of Object.keys(segN)) {
      const casos =
        segCasos && Object.hasOwn(segCasos, id) ? segCasos[id]! : null;
      if (!conSoporte(segN[id]!, segCasos ? (casos ?? 0) : null)) continue;
      if (!Object.hasOwn(segCosto, id)) continue;
      soportados++;
      const exceso = segCosto[id]! - global;
      if (exceso > 0 && (!peor || exceso > peor.exceso)) peor = { id, exceso };
    }
  }
  const tramos = tramosDe(c);
  const lectura =
    c.calibracion === "medida" && tramos ? lecturaDe(tramos) : null;
  return {
    optimismo,
    peor_segmento: global === null || !segN ? null : peor ? peor.id : "ninguno",
    peor_exceso: peor ? peor.exceso : null,
    seg_con_soporte: global === null || !segN ? null : soportados,
    cal_lectura: lectura ? lectura.tramo : null,
  };
}

/** Los tramos de la calibración desde el cuaderno (`null` si no se midió o están incompletos). */
export function tramosDe(c: Registro): Tramo[] | null {
  const [n, pred, obs] = [
    mapa(c, "cal_n"),
    mapa(c, "cal_pred"),
    mapa(c, "cal_obs"),
  ];
  if (!n || !pred || !obs) return null;
  const k = Object.keys(n).length;
  const tramos: Tramo[] = [];
  for (let t = 1; t <= k; t++) {
    const id = String(t);
    if (![n, pred, obs].every((m) => Object.hasOwn(m, id))) return null;
    tramos.push({ n: n[id]!, predicho: pred[id]!, observado: obs[id]! });
  }
  return tramos;
}

/**
 * Lo que la etapa registra con la tabla cargada y lo que dejó el worker al abrir la prueba. Sin corrida,
 * lo de la prueba queda vacío. `aperturas` son las aperturas distintas del cuaderno hasta hoy.
 */
export function datosEtapa8(
  tabla: CsvTable,
  previas: Previas,
  huella: string | null,
  corrida: Corrida8 | null,
  entrada: EntradaEtapa8,
  aperturas: number | null,
): DatosEtapa {
  const plan = plan8(tabla, previas, huella);
  const c = deLaTabla(plan);
  if (plan && corrida) Object.assign(c, delWorker(plan, corrida, aperturas));
  Object.assign(c, derivados(c, plan?.plan7.forma ?? null));
  return { respuestas: { patron: entrada.patron }, chequeos: c };
}

function recalcular(
  datos: DatosEtapa,
  previas: Previas,
  tabla: CsvTable,
  huella?: string | null,
): DatosEtapa {
  const plan = plan8(tabla, previas, huella ?? null);
  const c = deLaTabla(plan);
  // dato del worker (y del cuaderno): no se puede rehacer sin volver a abrir la prueba
  for (const k of DEL_WORKER_8) c[k] = datos.chequeos[k] ?? null;
  Object.assign(c, derivados(c, plan?.plan7.forma ?? null));
  // un registro de antes del S14 no trae la tabla de umbrales: se compara con lo que tenía
  for (const k of NUEVOS_S14)
    if (!Object.hasOwn(datos.chequeos, k)) delete c[k];
  return { respuestas: datos.respuestas, chequeos: c };
}

// --- los peores casos (solo en pantalla) -------------------------------------------------------

export type CasoPeor = {
  /** La fila de la tabla. */
  readonly fila: number;
  /** La posición en la prueba (para leer la predicción del worker). */
  readonly posicion: number;
  readonly costo: number;
};

/**
 * Los errores más caros de la prueba; en un empate, el más seguro y equivocado. Se calculan en pantalla
 * con la corrida en memoria y JAMÁS se registran: al cuaderno va cuántos se mostraron.
 */
export function peoresCasos(
  plan: Plan8,
  corrida: Corrida8,
  n = PEORES,
): CasoPeor[] {
  const costos = costosGanador(plan, corrida);
  if (!costos) return [];
  const { diseno: d, particion } = plan.plan7;
  const r = corrida.resultado;
  const seguridad = (f: number, i: number): number =>
    byTask(plan.plan7.forma, {
      binaria: () =>
        r.proba
          ? Math.abs(r.proba[i]! - (d.clases![f] === d.positivo ? 1 : 0))
          : 0,
      multiclase: () =>
        r.proba && r.pred[i] !== d.clases![f] ? r.proba[i]! : 0,
      numerica: () => Math.abs((r.pred[i] as number) - d.valores![f]!),
    })();
  return particion.prueba
    .map((f, i) => ({
      fila: f,
      posicion: i,
      costo: costos[i]!,
      s: seguridad(f, i),
    }))
    .filter((x) => x.costo > 0)
    .sort((a, b) => b.costo - a.costo || b.s - a.s || a.fila - b.fila)
    .slice(0, n)
    .map(({ fila, posicion, costo }) => ({ fila, posicion, costo }));
}

// --- leer, criterio, trampas -----------------------------------------------------------------

const ENTEROS = [
  "semilla",
  "remuestreos",
  "n_entrenamiento",
  "n_prueba",
  "peores_n",
  "seg_con_soporte",
  "prueba_pos",
  "regla_vp",
  "regla_fp",
] as const;

const CLAVES_TABLA = new Set(
  [UMBRAL_E1, UMBRAL_CLASE, ...REJILLA.map(claveUmbral)].flatMap((u) => [
    `vp:${u}`,
    `fp:${u}`,
  ]),
);
const NO_NEGATIVOS = [
  "base_costo",
  "base_bajo",
  "base_alto",
  "regla_costo",
  "regla_bajo",
  "regla_alto",
  "ganador_costo",
  "ganador_bajo",
  "ganador_alto",
] as const;

const esEntero = (v: Valor, minimo = 0) =>
  Number.isInteger(v) && (v as number) >= minimo;
const enUnidad = (v: number) => v >= 0 && v <= 1;

function leer(datos: DatosEtapa): Lectura {
  const r = datos.respuestas;
  const extraR = claveExtra(r, RESPUESTAS_8);
  if (extraR !== null) return { ok: false, campo: `respuestas.${extraR}` };
  if (
    !Object.hasOwn(r, "patron") ||
    typeof r.patron !== "string" ||
    r.patron.length > PATRON_MAX
  )
    return { ok: false, campo: "respuestas.patron" };
  // un registro de antes del S14 no trae lo nuevo: se lee como vacío
  const c: Registro = { ...nulos(NUEVOS_S14), ...datos.chequeos };
  const extra = claveExtra(c, CHEQUEOS_8);
  if (extra !== null) return { ok: false, campo: `chequeos.${extra}` };
  const malo = (k: string) => ({ ok: false as const, campo: `chequeos.${k}` });
  for (const k of CHEQUEOS_8)
    if (!Object.hasOwn(c, k) && !(NUEVOS_S14 as readonly string[]).includes(k))
      return malo(k);
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
  if (
    c.conglomerado !== null &&
    !(CONGLOMERADOS as readonly string[]).includes(c.conglomerado as string)
  )
    return malo("conglomerado");
  if (
    c.calibracion !== null &&
    !(CALIBRACIONES as readonly string[]).includes(c.calibracion as string)
  )
    return malo("calibracion");
  for (const k of ENTEROS)
    if (c[k] !== null && !esEntero(c[k]!)) return malo(k);
  if (c.aperturas !== null && !esEntero(c.aperturas!, 1))
    return malo("aperturas");
  if (c.cal_lectura !== null && !esEntero(c.cal_lectura!, 1))
    return malo("cal_lectura");
  for (const k of NO_NEGATIVOS) {
    const v = numero(c, k);
    if (v !== null && v < 0) return malo(k);
  }
  for (const k of ["brier", "brier_base"] as const) {
    const v = numero(c, k);
    if (v !== null && !enUnidad(v)) return malo(k);
  }
  // los segmentos: conteos enteros, y el costo y los casos solo de segmentos que existen
  const segN = mapa(c, "seg_n");
  if (segN && Object.values(segN).some((v) => !esEntero(v)))
    return malo("seg_n");
  for (const k of ["seg_casos", "seg_costo"] as const) {
    const m = mapa(c, k);
    if (!m) continue;
    if (!segN || Object.keys(m).some((id) => !Object.hasOwn(segN, id)))
      return malo(k);
    if (Object.values(m).some((v) => v < 0)) return malo(k);
  }
  const segCasos = mapa(c, "seg_casos");
  if (segCasos && Object.values(segCasos).some((v) => !esEntero(v)))
    return malo("seg_casos");
  // la calibración: tramos 1..K con conteos enteros y tasas entre 0 y 1
  const tramosN = mapa(c, "cal_n");
  if (tramosN && Object.values(tramosN).some((v) => !esEntero(v)))
    return malo("cal_n");
  for (const k of ["cal_pred", "cal_obs"] as const) {
    const m = mapa(c, k);
    if (m && Object.values(m).some((v) => !enUnidad(v))) return malo(k);
  }
  if ((tramosN || mapa(c, "cal_pred") || mapa(c, "cal_obs")) && !tramosDe(c))
    return malo("cal_n");
  // S14, la tabla de umbrales: claves de la rejilla, conteos enteros que caben en la prueba
  const pos = numero(c, "prueba_pos");
  const n = numero(c, "n_prueba");
  if (pos !== null && n !== null && pos > n) return malo("prueba_pos");
  const cabe = (vp: number, fp: number) =>
    pos === null || n === null || (vp <= pos && fp <= n - pos);
  const [rvp, rfp] = [numero(c, "regla_vp"), numero(c, "regla_fp")];
  if ((rvp === null) !== (rfp === null)) return malo("regla_vp");
  if (rvp !== null && rfp !== null && !cabe(rvp, rfp)) return malo("regla_vp");
  const tabla = mapa(c, "tabla_umbrales");
  if (tabla) {
    for (const [k, v] of Object.entries(tabla))
      if (!CLAVES_TABLA.has(k) || !esEntero(v)) return malo("tabla_umbrales");
    for (const k of Object.keys(tabla)) {
      const u = k.slice(3);
      if (!Object.hasOwn(tabla, `vp:${u}`) || !Object.hasOwn(tabla, `fp:${u}`))
        return malo("tabla_umbrales");
      if (!cabe(tabla[`vp:${u}`]!, tabla[`fp:${u}`]!))
        return malo("tabla_umbrales");
    }
  }
  return { ok: true };
}

function criterio(datos: DatosEtapa, previas: Previas): Veredicto {
  if (([1, 2, 3, 4, 5, 6, 7] as const).some((n) => !previas[n]))
    return { tipo: "falta", faltan: ["etapas-previas"] };
  const c = datos.chequeos;
  const faltan: string[] = [];
  if (c.sello_6 === null || c.sello_6 !== previas[6]!.chequeos.sello)
    faltan.push("sello");
  if (c.ganador === null || c.ganador_costo === null) faltan.push("prueba");
  else {
    if (c.ganador !== previas[7]!.chequeos.ganador) faltan.push("ganador");
    if (c.peor_segmento === null) faltan.push("segmento");
    if (c.calibracion === null) faltan.push("calibracion");
  }
  const patron = datos.respuestas.patron;
  if (typeof patron !== "string" || patron.trim() === "") faltan.push("patron");
  return faltan.length > 0 ? { tipo: "falta", faltan } : { tipo: "cumple" };
}

/** «c:<columna>=<valor>», «q:<columna>#<tramo>» o «p:<periodo>», leído de vuelta. */
export function leerSegmento(
  id: string,
):
  | { tipo: "periodo"; valor: string }
  | { tipo: "categoria"; columna: string; valor: string }
  | { tipo: "tramo"; columna: string; tramo: number }
  | null {
  if (id.startsWith("p:")) return { tipo: "periodo", valor: id.slice(2) };
  if (id.startsWith("c:")) {
    const resto = id.slice(2);
    const i = resto.indexOf("=");
    return i < 0
      ? null
      : {
          tipo: "categoria",
          columna: resto.slice(0, i),
          valor: resto.slice(i + 1),
        };
  }
  if (id.startsWith("q:")) {
    const resto = id.slice(2);
    const i = resto.lastIndexOf("#");
    const tramo = Number(resto.slice(i + 1));
    return i < 0 || !Number.isInteger(tramo)
      ? null
      : { tipo: "tramo", columna: resto.slice(0, i), tramo };
  }
  return null;
}

/** Costo por decisión → por cada 100 decisiones, para los textos. */
const cada100 = (x: number) => Number((x * 100).toPrecision(12));

function trampas(datos: DatosEtapa): readonly Trampa[] {
  const c = datos.chequeos;
  const salida: Trampa[] = [];
  if (c.ganador === null) return salida;
  const aperturas = numero(c, "aperturas");
  if (aperturas !== null && aperturas >= 2)
    salida.push({ clave: "reabierta", params: { n: aperturas } });
  const n = numero(c, "n_prueba");
  if (n !== null && n < PRUEBA_CHICA)
    salida.push({ clave: "prueba-chica", params: { n } });
  const [optimismo, seleccion, enPrueba] = [
    numero(c, "optimismo"),
    numero(c, "seleccion"),
    numero(c, "prueba_metrica"),
  ];
  if (
    optimismo !== null &&
    optimismo > 0 &&
    seleccion !== null &&
    enPrueba !== null
  )
    salida.push({
      clave: "optimismo",
      params: { seleccion, prueba: enPrueba },
    });
  const peor = texto(c, "peor_segmento");
  const exceso = numero(c, "peor_exceso");
  const seg = peor && peor !== "ninguno" ? leerSegmento(peor) : null;
  if (seg && exceso !== null) {
    const e = cada100(exceso);
    if (seg.tipo === "periodo")
      salida.push({
        clave: "peor-periodo",
        params: { valor: seg.valor, exceso: e },
      });
    else if (seg.tipo === "categoria")
      salida.push({
        clave: "peor-categoria",
        params: { columna: seg.columna, valor: seg.valor, exceso: e },
      });
    else
      salida.push({
        clave: "peor-tramo",
        params: { columna: seg.columna, tramo: seg.tramo, exceso: e },
      });
  }
  const segN = mapa(c, "seg_n");
  const soportados = numero(c, "seg_con_soporte");
  // «ninguno» son dos cosas distintas: ninguno tiene soporte, o ninguno de los que lo tienen está peor que el total
  if (peor === "ninguno")
    salida.push({
      clave: soportados === 0 ? "ningun-segmento" : "ninguno-peor",
      params: {},
    });
  if (segN && soportados !== null) {
    const total = Object.keys(segN).length;
    if (total > soportados)
      salida.push({
        clave: "sin-soporte",
        params: { n: total - soportados, total },
      });
  }
  if (c.calibracion === "sin-probabilidades")
    salida.push({ clave: "sin-probabilidades", params: {} });
  return salida;
}

// --- el resumen para el cuaderno ---------------------------------------------------------------

export type ResumenEtapa8 = {
  readonly ganador: string | null;
  readonly costo: number | null;
  readonly bajo: number | null;
  readonly alto: number | null;
  readonly base: number | null;
  readonly baseId: string | null;
  readonly regla: number | null;
  readonly seleccion: number | null;
  readonly enPrueba: number | null;
  readonly metrica: string | null;
  readonly peor: string | null;
  readonly conSoporte: number | null;
  readonly calibracion: string | null;
  readonly brier: number | null;
  readonly brierBase: number | null;
  readonly aperturas: number | null;
  readonly patron: string | null;
};

export function resumenEtapa8(datos: DatosEtapa): ResumenEtapa8 {
  const c = datos.chequeos;
  return {
    ganador: texto(c, "ganador"),
    costo: numero(c, "ganador_costo"),
    bajo: numero(c, "ganador_bajo"),
    alto: numero(c, "ganador_alto"),
    base: numero(c, "base_costo"),
    baseId: texto(c, "base_id"),
    regla: numero(c, "regla_costo"),
    seleccion: numero(c, "seleccion"),
    enPrueba: numero(c, "prueba_metrica"),
    metrica: texto(c, "metrica"),
    peor: texto(c, "peor_segmento"),
    conSoporte: numero(c, "seg_con_soporte"),
    calibracion: texto(c, "calibracion"),
    brier: numero(c, "brier"),
    brierBase: numero(c, "brier_base"),
    aperturas: numero(c, "aperturas"),
    patron: texto(datos.respuestas, "patron"),
  };
}

export { SOPORTE_TRAMO };

export const ETAPA_8: EtapaConstruida = {
  id: 8,
  construida: true,
  dependeDeDatos: true,
  terminos: [
    "conjunto-de-prueba",
    "optimismo-de-la-seleccion",
    "segmento-con-soporte",
    "calibracion",
    "brier",
  ],
  preguntas: ["patron"],
  chequeos: ["prueba", "segmentos", "calibracion"],
  leer,
  criterio,
  recalcular,
  trampas,
};
