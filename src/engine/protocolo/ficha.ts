// Protocolo DS (S15, etapa 10): LA FICHA DEL MODELO, armada con lo que el cuaderno ya registró (★ 5 de la
// VISION: «el cuaderno se escribe solo»). Carga diferida con la pantalla de la etapa 10 y el Markdown.
//  · Cada línea es una clave del diccionario, sus parámetros y su FUENTE: la etapa, la fecha y la huella de
//    la evidencia de donde sale, o «escrito por el dueño». Nada se recalcula y la prueba no se reabre: solo
//    se leen los registros (y sus resúmenes) de las etapas 1 a 10. Lo derivado no se edita.
//  · Una línea a la que le falta un dato no se inventa: no se escribe.
//  · Ninguna fila ni valor individual (regla dura 2): lo que viaja son conteos, costos, nombres de columna,
//    las categorías con soporte de los segmentos de la etapa 8 y lo que escribiste tú.
// Secciones: los datos · población y periodo · lo medido en la prueba · la decisión · límites y para qué NO
// usarlo · «Lo que este modelo cumplió» · el plan de vigilancia (con «usar») o qué cambiar (con «no usar» e
// «iterar») · quién responde.
import { robustnessOf } from "@/engine/estres";
import { METRIC_RULES, type PrimaryMetric } from "@/engine/verdict";
import type { EtapaEvaluada } from "./compuerta";
import type { Carga, Cuaderno } from "./cuaderno";
import { PSI_ALERTA, PSI_MODERADA } from "./deriva";
import { decisionDe } from "./etapa10";
import { resumenEtapa4 } from "./etapa4";
import { resumenEtapa5, type ReferenciaId } from "./etapa5";
import { resumenEtapa6 } from "./etapa6";
import { resumenEtapa7 } from "./etapa7";
import { resumenEtapa8 } from "./etapa8";
import {
  BRECHA_POCO_FIABLE,
  PRUEBA_CHICA_9,
  resumenEtapa9,
  type Decision9,
} from "./etapa9";
import type { DatosEtapa, EtapaId, Previas } from "./etapas";
import { lista, mapa, numero, texto, textoLleno } from "./valores";

export type Fuente =
  | {
      readonly tipo: "etapa";
      readonly etapa: EtapaId;
      /** `null` si la evidencia todavía no se registró (la etapa 10, antes de registrarla). */
      readonly fecha: string | null;
      readonly huella: string | null;
    }
  | { readonly tipo: "dueno"; readonly fecha: string | null };

export type Parametros = Readonly<Record<string, string | number>>;

export type LineaFicha = {
  /** `protocol.stage.10.sheet.<sección>.<clave>` en el diccionario de la etapa. */
  readonly clave: string;
  readonly params: Parametros;
  readonly fuente: Fuente;
};

export const SECCIONES_FICHA = [
  "datos",
  "poblacion",
  "metricas",
  "decision",
  "limites",
  "cumplio",
  "vigilancia",
  "variante",
  "responde",
] as const;
export type IdSeccion = (typeof SECCIONES_FICHA)[number];

/**
 * Todas las líneas que la ficha puede escribir, por sección: el contrato con sus textos
 * (`messages/etapas/etapa10.{es,en}.json`, `protocol.stage.10.sheet.<sección>.<línea>`). Un test lo cruza con lo que
 * arma `armarFicha` y con los textos, para que ninguna línea llegue a pantalla como clave cruda.
 */
export const LINEAS_FICHA = {
  datos: ["archivo", "objetivo", "modelo", "columnas"],
  poblacion: [
    "poblacion",
    "exclusiones",
    "sin-exclusiones",
    "periodo",
    "sin-periodo",
    "fuera",
  ],
  metricas: [
    "costo",
    "base",
    "regla",
    "metrica",
    "segmentos",
    "peor",
    "peor-sin-soporte",
    "peor-ninguno",
  ],
  decision: [
    "decision-usar",
    "decision-iterar",
    "decision-no-usar",
    "costo",
    "umbral",
    "umbral-movido",
    "clase",
    "capacidad",
  ],
  limites: [
    "predice",
    "poblacion",
    "periodo",
    "peor-segmento",
    "sin-soporte",
    "prueba-chica",
    "reabierta",
    "patron",
    "poco-fiable",
    "umbral-optimista",
    "dueno",
  ],
  cumplio: [
    "fuga",
    "particion",
    "linea-base",
    "supera",
    "no-supera",
    "senal",
    "sin-senal",
    "incertidumbre",
    "calibracion",
    "calibracion-sin-probabilidades",
    "calibracion-no-aplica",
    // S17 (ADR 023): la robustez, de la prueba de estrés de la etapa 8
    "robustez",
    "robustez-cae",
    "robustez-ya-perdia",
    "robustez-sin-medir",
  ],
  vigilancia: [
    "columnas",
    "sin-vigilar",
    "umbrales",
    "solo-entradas",
    "piso",
    "piso-beneficio",
    "cadencia-sin-tiempo",
    "cadencia-alargada",
    "cadencia-acortada",
    "cadencia",
  ],
  variante: ["que-cambiaria", "que-cambiar", "prueba-gastada"],
  responde: ["dueno", "decisor"],
} as const satisfies Record<IdSeccion, readonly string[]>;

export type SeccionFicha = {
  readonly id: IdSeccion;
  readonly lineas: readonly LineaFicha[];
};

export type Ficha = {
  readonly decision: Decision9;
  readonly secciones: readonly SeccionFicha[];
};

/** Lo que la ficha lee de cada etapa: lo registrado, con su fecha y su huella. */
export type EvidenciaFicha = {
  readonly datos: DatosEtapa;
  readonly fecha: string | null;
  readonly huella: string | null;
};

export type EntradaFicha = {
  readonly evidencias: Readonly<Partial<Record<EtapaId, EvidenciaFicha>>>;
  /** La carga de los datos con que se verificó, si el cuaderno la tiene (nombre, filas, columnas). */
  readonly carga: Carga | null;
};

const TODAS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** Las evidencias con que está cumplida cada etapa, según la compuerta (las demás no entran). */
export function evidenciasCumplidas(
  evaluadas: readonly EtapaEvaluada[],
): Partial<Record<EtapaId, EvidenciaFicha>> {
  const salida: Partial<Record<EtapaId, EvidenciaFicha>> = {};
  for (const { etapa, estado } of evaluadas)
    if (estado.tipo === "cumplida")
      salida[etapa.id] = {
        datos: estado.evidencia.datos,
        fecha: estado.evidencia.fecha,
        huella: estado.evidencia.huella,
      };
  return salida;
}

/** La última carga del cuaderno con esa huella (la de los datos con que se verificó la ficha). */
export function cargaDe(
  cuaderno: Cuaderno,
  huella: string | null,
): Carga | null {
  if (!huella) return null;
  // sin `findLast` (ES2023): el target del proyecto es ES2017 (S16, S15 B4)
  for (let i = cuaderno.cargas.length - 1; i >= 0; i--)
    if (cuaderno.cargas[i]!.sha256 === huella) return cuaderno.cargas[i]!;
  return null;
}

/** Por decisión → por cada 100 (decisiones o casos), para los textos. */
const c100 = (x: number | null) =>
  x === null ? null : Number((x * 100).toPrecision(12));

type Crudos = Readonly<Record<string, string | number | null>>;

/**
 * La ficha, o `null` si falta alguna de las diez evidencias o la decisión de la 9 no es válida. La etapa 10
 * puede ir sin registrar todavía (fecha `null`): así la pantalla la muestra antes de registrar.
 */
export function armarFicha(entrada: EntradaFicha): Ficha | null {
  const ev = entrada.evidencias;
  if (TODAS.some((n) => !ev[n])) return null;
  const datosDe = (n: EtapaId) => ev[n]!.datos;
  const previas: Previas = Object.fromEntries(
    TODAS.map((n) => [n, datosDe(n)]),
  );
  const decision = decisionDe(previas);
  if (!decision) return null;

  const fuenteDe = (n: EtapaId | "dueno"): Fuente =>
    n === "dueno"
      ? { tipo: "dueno", fecha: ev[10]!.fecha }
      : { tipo: "etapa", etapa: n, fecha: ev[n]!.fecha, huella: ev[n]!.huella };
  /** Una línea, solo si no le falta ningún dato. */
  const linea = (
    destino: LineaFicha[],
    n: EtapaId | "dueno",
    clave: string,
    crudos: Crudos = {},
  ) => {
    if (Object.values(crudos).some((v) => v === null)) return;
    destino.push({ clave, params: crudos as Parametros, fuente: fuenteDe(n) });
  };

  const [r1, r2, c2, r3] = [
    datosDe(1).respuestas,
    datosDe(2).respuestas,
    datosDe(2).chequeos,
    datosDe(3).respuestas,
  ];
  const [c8, c9] = [datosDe(8).chequeos, datosDe(9).chequeos];
  const [r10, c10] = [datosDe(10).respuestas, datosDe(10).chequeos];
  const [r4, r5, r6, r7, r8, r9] = [
    resumenEtapa4(datosDe(4)),
    resumenEtapa5(datosDe(5)),
    resumenEtapa6(datosDe(6)),
    resumenEtapa7(datosDe(7)),
    resumenEtapa8(datosDe(8)),
    resumenEtapa9(datosDe(9)),
  ];
  const [desde, hasta] = [texto(c2, "fecha_min"), texto(c2, "fecha_max")];
  const poblacion = textoLleno(r3, "poblacion");
  const segmentos = Object.keys(mapa(c8, "seg_n") ?? {}).length;

  const datos: LineaFicha[] = [];
  const carga = entrada.carga;
  if (carga)
    linea(datos, 2, "archivo", {
      nombre: carga.nombre,
      filas: carga.filas,
      columnas: carga.columnas,
    });
  linea(datos, 2, "objetivo", { objetivo: textoLleno(r2, "objetivo") });
  linea(datos, 7, "modelo", { ganador: r7.ganador });
  linea(datos, 4, "columnas", { usar: r4.usar, excluir: r4.excluir });

  const pob: LineaFicha[] = [];
  linea(pob, 3, "poblacion", { poblacion });
  const exclusiones = textoLleno(r3, "exclusiones");
  if (exclusiones) linea(pob, 3, "exclusiones", { exclusiones });
  else linea(pob, 3, "sin-exclusiones");
  if (desde && hasta) linea(pob, 2, "periodo", { desde, hasta });
  else linea(pob, 2, "sin-periodo");
  linea(pob, 6, "fuera", { fuera: r6.fuera });

  const met: LineaFicha[] = [];
  linea(met, 8, "costo", {
    costo100: c100(r8.costo),
    bajo100: c100(r8.bajo),
    alto100: c100(r8.alto),
  });
  if (r8.base !== null)
    linea(met, 8, "base", { base100: c100(r8.base), baseId: r8.baseId });
  if (r8.regla !== null) linea(met, 8, "regla", { regla100: c100(r8.regla) });
  linea(met, 8, "metrica", {
    metrica: r8.metrica,
    enPrueba: r8.enPrueba,
    seleccion: r8.seleccion,
  });
  linea(met, 8, "segmentos", { conSoporte: r8.conSoporte, total: segmentos });
  // «ninguno» no es un segmento: o ninguno tiene soporte, o ninguno de los que lo tienen está peor que el total
  const peor = r8.peor !== null && r8.peor !== "ninguno" ? r8.peor : null;
  if (peor) linea(met, 8, "peor", { segmento: peor });
  else if (r8.peor === "ninguno")
    linea(met, 8, r8.conSoporte === 0 ? "peor-sin-soporte" : "peor-ninguno");

  const dec: LineaFicha[] = [];
  linea(dec, 9, `decision-${decision}`, { razon: r9.razon });
  linea(dec, 9, "costo", {
    modelo100: c100(r9.costoModelo),
    hoy100: c100(r9.costoHoy),
    hoyId: r9.hoyId,
  });
  if (r9.modo === "curva")
    linea(dec, 9, r9.movido ? "umbral-movido" : "umbral", {
      umbral: r9.umbral,
      alertas100: r9.alertas,
      falsas100: r9.falsas,
    });
  if (r9.modo === "clase")
    linea(dec, 9, "clase", { alertas100: r9.alertas, falsas100: r9.falsas });
  if (r9.capacidad !== null)
    linea(dec, 9, "capacidad", { capacidad: r9.capacidad });

  const lim: LineaFicha[] = [];
  linea(lim, 3, "predice");
  linea(lim, 3, "poblacion", { poblacion });
  if (desde && hasta) linea(lim, 2, "periodo", { desde, hasta });
  if (peor) linea(lim, 8, "peor-segmento", { segmento: peor });
  if (r8.conSoporte !== null && segmentos > r8.conSoporte)
    linea(lim, 8, "sin-soporte", { segmentos: segmentos - r8.conSoporte });
  const nPrueba = numero(c8, "n_prueba");
  if (nPrueba !== null && nPrueba < PRUEBA_CHICA_9)
    linea(lim, 8, "prueba-chica", { filas: nPrueba });
  if (r8.aperturas !== null && r8.aperturas > 1)
    linea(lim, 8, "reabierta", { aperturas: r8.aperturas });
  // S15 (auditoría A1): el patrón de fallo que escribiste en la etapa 8, «Queda en el cuaderno para la ficha de la etapa 10»
  const patron = textoLleno(datosDe(8).respuestas, "patron");
  if (patron) linea(lim, 8, "patron", { texto: patron });
  const brecha = numero(c9, "brecha");
  if (r9.modo === "curva" && brecha !== null && brecha >= BRECHA_POCO_FIABLE)
    linea(lim, 9, "poco-fiable", { brechaPct: brecha });
  if (r9.movido) linea(lim, 9, "umbral-optimista", { umbral: r9.umbral });
  const noUsarPara = textoLleno(r10, "no_usar_para");
  if (noUsarPara) linea(lim, "dueno", "dueno", { texto: noUsarPara });

  const cum: LineaFicha[] = [];
  linea(cum, 4, "fuga", {
    alertas: r4.alertas,
    excluir: r4.excluir,
    usar: r4.usar,
  });
  linea(cum, 6, "particion", {
    esquema: r6.esquema,
    sello: r6.sello?.slice(0, 12) ?? null,
    entrenamiento: r6.entrenamiento,
    prueba: r6.prueba,
  });
  if (r5.mejor)
    linea(cum, 5, "linea-base", {
      baseId: r5.mejor.id,
      base100: r5.mejor.costo100,
    });
  if (r7.veredicto)
    linea(cum, 7, r7.veredicto === "supera" ? "supera" : "no-supera", {
      media100: c100(r7.media),
      bajo100: c100(r7.icBajo),
      alto100: c100(r7.icAlto),
    });
  if (r7.senal)
    linea(cum, 7, r7.senal === "senal" ? "senal" : "sin-senal", {
      p: r7.p,
      n: r7.n,
    });
  linea(cum, 8, "incertidumbre", {
    bajo100: c100(r8.bajo),
    alto100: c100(r8.alto),
  });
  if (r8.calibracion === "medida")
    linea(cum, 8, "calibracion", { brier: r8.brier, brierBase: r8.brierBase });
  else if (r8.calibracion) linea(cum, 8, `calibracion-${r8.calibracion}`);
  // S17: la robustez es opcional (no hay compuerta): sin lectura, «no se midió» es una línea honesta, no un hueco
  const rob =
    r8.estresRuido !== null &&
    r8.estresRival !== null &&
    r8.enPrueba !== null &&
    r8.metrica !== null &&
    Object.hasOwn(METRIC_RULES, r8.metrica)
      ? robustnessOf(
          r8.metrica as PrimaryMetric,
          r8.enPrueba,
          r8.estresRuido,
          r8.estresRival,
        )
      : null;
  if (rob === null || rob.kind === "no-noise") linea(cum, 8, "robustez-sin-medir");
  else
    linea(
      cum,
      8,
      rob.kind === "holds"
        ? "robustez"
        : rob.alreadyLost
          ? "robustez-ya-perdia"
          : "robustez-cae",
      {
        nivel: rob.level * 100,
        metrica: rob.metric,
        de: rob.base,
        a: rob.value,
        rivalId: r8.estresRivalId ?? "",
        rival: rob.rival,
      },
    );

  const vig: LineaFicha[] = [];
  const vari: LineaFicha[] = [];
  if (decision === "usar") {
    const columnas = lista(c10, "vig_columnas");
    if (columnas)
      linea(vig, 10, "columnas", {
        columnas: columnas.length,
        lista: columnas.join(", "),
      });
    const sinVigilar = lista(c10, "vig_omitidas");
    if (sinVigilar && sinVigilar.length > 0)
      linea(vig, 10, "sin-vigilar", {
        columnas: sinVigilar.length,
        lista: sinVigilar.join(", "),
      });
    linea(vig, 10, "umbrales", { moderada: PSI_MODERADA, alerta: PSI_ALERTA });
    linea(vig, 10, "solo-entradas");
    linea(vig, 9, "piso", {
      modelo100: c100(r9.costoModelo),
      hoy100: c100(r9.costoHoy),
      hoyId: r9.hoyId,
    });
    // lo de hoy, en beneficio neto: tu regla, actuar con todos, o no hacer nada (que vale 0)
    const [siempre, nunca]: ReferenciaId[] = ["siempre-actuar", "nunca-actuar"];
    const hoyBeneficio =
      r9.hoyId === "regla"
        ? numero(c9, "beneficio_regla")
        : r9.hoyId === siempre
          ? numero(c9, "beneficio_todos")
          : r9.hoyId === nunca
            ? 0
            : null;
    // el beneficio neto existe solo si la 9 decidió con la curva o con la clase predicha (dos clases)
    if (r9.modo === "curva" || r9.modo === "clase")
      linea(vig, 9, "piso-beneficio", {
        beneficio100: c100(numero(c9, "beneficio")),
        hoy100: c100(hoyBeneficio),
      });
    const cadencia = numero(r10, "cadencia");
    const sugerida = numero(c10, "cadencia_sugerida");
    if (sugerida === null)
      linea(vig, "dueno", "cadencia-sin-tiempo", { cadencia });
    else if (cadencia !== null && cadencia > sugerida)
      linea(vig, "dueno", "cadencia-alargada", {
        cadencia,
        sugerida,
        // S16 (S15 B5): sin razón escrita la línea sigue (con la razón vacía) en vez de desaparecer: `linea` descarta
        // cualquier parámetro nulo y la vista previa callaba que la cadencia alargada aún no tiene su razón
        razon: textoLleno(r10, "razon_cadencia") ?? "",
      });
    else if (cadencia !== null && cadencia < sugerida)
      linea(vig, "dueno", "cadencia-acortada", { cadencia, sugerida });
    else linea(vig, 10, "cadencia", { cadencia });
  } else {
    linea(
      vari,
      "dueno",
      decision === "no-usar" ? "que-cambiaria" : "que-cambiar",
      {
        texto: textoLleno(r10, "cambiar"),
      },
    );
    if (decision === "iterar")
      linea(vari, 8, "prueba-gastada", { aperturas: r8.aperturas ?? 1 });
  }

  const resp: LineaFicha[] = [];
  linea(resp, "dueno", "dueno", { dueno: textoLleno(r10, "dueno") });
  linea(resp, 1, "decisor", {
    decisor: textoLleno(r1, "decisor"),
    decision: textoLleno(r1, "decision"),
  });

  const porSeccion: Record<IdSeccion, readonly LineaFicha[]> = {
    datos,
    poblacion: pob,
    metricas: met,
    decision: dec,
    limites: lim,
    cumplio: cum,
    vigilancia: vig,
    variante: vari,
    responde: resp,
  };
  return {
    decision,
    secciones: SECCIONES_FICHA.filter((id) => porSeccion[id].length > 0).map(
      (id) => ({ id, lineas: porSeccion[id] }),
    ),
  };
}
