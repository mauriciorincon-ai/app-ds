// Protocolo DS (S8), etapa 2 — EL OBJETIVO Y LA UNIDAD, CON SU MOMENTO. Qué es una fila, qué se
// predice y en qué momento se conoce. La app lo verifica en TUS datos: que el objetivo exista y
// tenga la forma de la decisión de la etapa 1, cuántas filas tiene cada unidad (una unidad
// repetida queda escrita para la partición por grupo de la etapa 6), cuántas fechas se leen,
// y cuánto cuesta no hacer nada con la tasa base de tus datos.
//
// Lo que el código no puede saber —cuál columna es la unidad, cuándo se conoce el objetivo,
// qué valor significa «hay que actuar»— se pregunta. Sin columna objetivo, el Protocolo se
// detiene y lleva a «agrupar» de Probeta (G-Plan 3a: el modo cubre las tres tareas con objetivo).
import { byTask, matchTask } from "@/engine/despacho";
import type { CsvTable } from "@/lib/ds/csv";
import type { SupervisedTask } from "@/engine/tarea";
import type {
  DatosEtapa,
  EtapaConstruida,
  Lectura,
  Previas,
  Trampa,
  Valor,
  Veredicto,
} from "./etapas";
import { formaDe } from "./etapa1";
import { leerFechas, type LecturaFechas, type OrdenFecha } from "./fechas";
import {
  costoConstante,
  numerosDe,
  perfilObjetivo,
  perfilUnidad,
  valoresDe,
} from "./tabla";
import {
  booleano,
  claveExtra,
  lista,
  mapa,
  numero,
  positivo,
  texto,
  textoLleno,
} from "./valores";

const RESPUESTAS = [
  "objetivo",
  "positivo",
  "unidad",
  "unidad_columna",
  "momento",
  "momento_columna",
  "momento_texto",
  "orden_fecha",
] as const;

const CHEQUEOS = [
  "filas",
  "filas_utiles",
  "objetivo_vacios",
  "tarea_detectada",
  "tarea_motivo",
  "clases",
  "objetivo_media",
  "objetivo_desv",
  "tasa_base",
  "mayoritaria",
  "clase_mayoritaria",
  "unidades",
  "filas_por_unidad_max",
  "unidad_repetida",
  "unidad_vacios",
  "fecha_estado",
  "fecha_min",
  "fecha_max",
  "fecha_vacios",
  "fecha_sin_leer",
  "clases_sin_costo",
  "costo_nunca_actuar",
  "costo_siempre_actuar",
  "costo_mayoria",
  "costo_constante",
] as const;

/** Todas las claves que esta etapa puede registrar. */
export const CLAVES_2 = { respuestas: RESPUESTAS, chequeos: CHEQUEOS } as const;

/** Lo que el usuario responde en el formulario de la etapa 2. */
export type EntradaEtapa2 = {
  /** `null`: «no tengo una columna objetivo». */
  readonly objetivo: string | null;
  /** Dos clases: el valor que significa «hay que actuar». */
  readonly positivo: string;
  /** `null`: cada fila es una unidad. */
  readonly unidadColumna: string | null;
  /** `null`: no hay columna de fecha; el momento se escribe. */
  readonly momentoColumna: string | null;
  readonly momentoTexto: string;
  /** La respuesta cuando el código no puede deducir día-mes o mes-día. */
  readonly ordenFecha: Exclude<OrdenFecha, "iso"> | null;
};

/** Qué detecciones de E1 son compatibles con la forma de la decisión (etapa 1). */
export function compatible(forma: SupervisedTask, detectada: string): boolean {
  const aceptadas: readonly string[] = byTask(forma, {
    binaria: ["binaria"],
    multiclase: ["multiclase", "ambigua"],
    numerica: ["numerica", "ambigua"],
  });
  return aceptadas.includes(detectada);
}

function estadoFecha(lectura: LecturaFechas): string {
  return lectura.tipo;
}

/**
 * Arma lo que la etapa 2 registra: las respuestas del usuario y todo lo que el código calcula
 * sobre su tabla. Con `objetivo` nulo, solo la respuesta (la etapa detiene el Protocolo).
 */
export function datosEtapa2(
  tabla: CsvTable,
  entrada: EntradaEtapa2,
  etapa1: DatosEtapa,
): DatosEtapa {
  const respuestas: Record<string, Valor> = {
    objetivo: entrada.objetivo,
    positivo: entrada.positivo,
    unidad: entrada.unidadColumna === null ? "fila" : "columna",
    unidad_columna: entrada.unidadColumna,
    momento: entrada.momentoColumna === null ? "texto" : "columna",
    momento_columna: entrada.momentoColumna,
    momento_texto: entrada.momentoTexto,
    orden_fecha: entrada.ordenFecha,
  };
  if (entrada.objetivo === null) return { respuestas, chequeos: {} };

  const forma = formaDe(etapa1.respuestas);
  const perfil = perfilObjetivo(tabla, entrada.objetivo);
  const unidad = perfilUnidad(tabla, entrada.unidadColumna);
  const fechas =
    entrada.momentoColumna === null
      ? null
      : leerFechas(
          valoresDe(tabla, entrada.momentoColumna),
          entrada.ordenFecha,
        );

  const chequeos: Record<string, Valor> = {
    filas: tabla.rows.length,
    filas_utiles: perfil?.utiles ?? 0,
    objetivo_vacios: perfil?.vacios ?? 0,
    tarea_detectada: perfil?.deteccion.task ?? "sin-objetivo",
    tarea_motivo: perfil?.deteccion.reason ?? "empty",
    clases: perfil?.clases ?? null,
    objetivo_media: perfil?.media ?? null,
    objetivo_desv: perfil?.desviacion ?? null,
    tasa_base: null,
    mayoritaria: null,
    clase_mayoritaria: null,
    unidades: unidad.unidades,
    filas_por_unidad_max: unidad.maximo,
    unidad_repetida: unidad.repetida,
    unidad_vacios: unidad.vacios,
    fecha_estado: fechas ? estadoFecha(fechas) : null,
    fecha_min: fechas?.tipo === "leida" ? fechas.minimo : null,
    fecha_max: fechas?.tipo === "leida" ? fechas.maximo : null,
    fecha_vacios: fechas ? fechas.vacias : null,
    fecha_sin_leer: fechas ? fechas.sinLeer : null,
    clases_sin_costo: [],
    costo_nunca_actuar: null,
    costo_siempre_actuar: null,
    costo_mayoria: null,
    costo_constante: null,
  };

  if (perfil && forma && perfil.utiles > 0) {
    const clases = perfil.clases;
    const r = etapa1.respuestas;
    matchTask(forma, {
      binaria: () => {
        const cuenta =
          clases && Object.hasOwn(clases, entrada.positivo)
            ? clases[entrada.positivo]
            : undefined;
        if (cuenta === undefined) return;
        const pi = cuenta / perfil.utiles;
        chequeos.tasa_base = pi;
        const [fp, fn] = [positivo(r, "c_fp"), positivo(r, "c_fn")];
        if (fp !== null && fn !== null) {
          chequeos.costo_nunca_actuar = pi * fn;
          chequeos.costo_siempre_actuar = (1 - pi) * fp;
        }
      },
      multiclase: () => {
        if (!clases) return;
        const costos = mapa(r, "costos") ?? {};
        const opciones = lista(r, "opciones") ?? [];
        const [mayor] = Object.entries(clases).sort(
          ([, a], [, b]) => b - a,
        )[0] ?? [""];
        chequeos.clase_mayoritaria = mayor;
        chequeos.mayoritaria = (clases[mayor] ?? 0) / perfil.utiles;
        const sinCosto = Object.keys(clases).filter(
          (k) => !opciones.includes(k),
        );
        chequeos.clases_sin_costo = sinCosto;
        if (sinCosto.length === 0)
          chequeos.costo_mayoria = Object.entries(clases)
            .filter(([k]) => k !== mayor)
            .reduce(
              (suma, [k, n]) => suma + (n / perfil.utiles) * (costos[k] ?? 0),
              0,
            );
      },
      numerica: () => {
        if (perfil.media === null) return;
        const [sub, sobre] = [positivo(r, "c_sub"), positivo(r, "c_sobre")];
        if (sub === null || sobre === null) return;
        chequeos.costo_constante = costoConstante(
          numerosDe(tabla, entrada.objetivo!),
          sub,
          sobre,
        );
      },
    });
  }
  return { respuestas, chequeos };
}

function leer(datos: DatosEtapa): Lectura {
  const r = datos.respuestas;
  const extra = claveExtra(r, RESPUESTAS);
  if (extra) return { ok: false, campo: `respuestas.${extra}` };
  const objetivo = r.objetivo;
  if (objetivo !== null && typeof objetivo !== "string")
    return { ok: false, campo: "respuestas.objetivo" };
  for (const clave of ["positivo", "momento_texto"] as const)
    if (texto(r, clave) === null)
      return { ok: false, campo: `respuestas.${clave}` };
  if (r.unidad !== "fila" && r.unidad !== "columna")
    return { ok: false, campo: "respuestas.unidad" };
  if (r.momento !== "texto" && r.momento !== "columna")
    return { ok: false, campo: "respuestas.momento" };
  for (const clave of [
    "unidad_columna",
    "momento_columna",
    "orden_fecha",
  ] as const)
    if (r[clave] !== null && typeof r[clave] !== "string")
      return { ok: false, campo: `respuestas.${clave}` };
  if (
    r.orden_fecha !== null &&
    r.orden_fecha !== "dia-mes" &&
    r.orden_fecha !== "mes-dia"
  )
    return { ok: false, campo: "respuestas.orden_fecha" };
  if (objetivo === null) {
    const sobra = Object.keys(datos.chequeos)[0];
    return sobra ? { ok: false, campo: `chequeos.${sobra}` } : { ok: true };
  }
  const sobra = claveExtra(datos.chequeos, CHEQUEOS);
  if (sobra) return { ok: false, campo: `chequeos.${sobra}` };
  const falta = CHEQUEOS.find((clave) => !(clave in datos.chequeos));
  if (falta) return { ok: false, campo: `chequeos.${falta}` };
  const c = datos.chequeos;
  for (const clave of [
    "filas",
    "filas_utiles",
    "objetivo_vacios",
    "unidades",
    "filas_por_unidad_max",
    "unidad_vacios",
  ] as const)
    if (numero(c, clave) === null)
      return { ok: false, campo: `chequeos.${clave}` };
  if (texto(c, "tarea_detectada") === null)
    return { ok: false, campo: "chequeos.tarea_detectada" };
  if (texto(c, "tarea_motivo") === null)
    return { ok: false, campo: "chequeos.tarea_motivo" };
  if (booleano(c, "unidad_repetida") === null)
    return { ok: false, campo: "chequeos.unidad_repetida" };
  if (c.clases !== null && mapa(c, "clases") === null)
    return { ok: false, campo: "chequeos.clases" };
  if (lista(c, "clases_sin_costo") === null)
    return { ok: false, campo: "chequeos.clases_sin_costo" };
  for (const clave of [
    "objetivo_media",
    "objetivo_desv",
    "tasa_base",
    "mayoritaria",
    "costo_nunca_actuar",
    "costo_siempre_actuar",
    "costo_mayoria",
    "costo_constante",
    "fecha_vacios",
    "fecha_sin_leer",
  ] as const)
    if (c[clave] !== null && numero(c, clave) === null)
      return { ok: false, campo: `chequeos.${clave}` };
  for (const clave of [
    "clase_mayoritaria",
    "fecha_estado",
    "fecha_min",
    "fecha_max",
  ] as const)
    if (c[clave] !== null && typeof c[clave] !== "string")
      return { ok: false, campo: `chequeos.${clave}` };
  return { ok: true };
}

function criterio(datos: DatosEtapa, previas: Previas): Veredicto {
  const r = datos.respuestas;
  if (r.objetivo === null) return { tipo: "detenida", razon: "sin-objetivo" };
  const etapa1 = previas[1];
  const forma = etapa1 ? formaDe(etapa1.respuestas) : null;
  if (!etapa1 || !forma) return { tipo: "falta", faltan: ["etapa1"] };
  const c = datos.chequeos;
  const faltan: string[] = [];
  if (textoLleno(r, "objetivo") === null) faltan.push("objetivo");
  else if (!compatible(forma, texto(c, "tarea_detectada") ?? ""))
    faltan.push("tarea");
  else {
    matchTask(forma, {
      binaria: () => {
        const clases = mapa(c, "clases");
        const valor = textoLleno(r, "positivo");
        if (!clases || valor === null || !Object.hasOwn(clases, valor))
          faltan.push("positivo");
      },
      multiclase: () => {
        if ((lista(c, "clases_sin_costo") ?? []).length > 0)
          faltan.push("costos");
      },
      numerica: () => undefined,
    });
  }
  if (r.unidad === "columna" && textoLleno(r, "unidad_columna") === null)
    faltan.push("unidad");
  if (r.momento === "columna") {
    if (textoLleno(r, "momento_columna") === null) faltan.push("momento");
    else if (
      texto(c, "fecha_estado") !== "leida" ||
      (numero(c, "fecha_sin_leer") ?? 0) > 0
    )
      faltan.push("fecha");
  } else if (textoLleno(r, "momento_texto") === null) faltan.push("momento");
  return faltan.length > 0 ? { tipo: "falta", faltan } : { tipo: "cumple" };
}

function trampas(datos: DatosEtapa, previas: Previas): readonly Trampa[] {
  const c = datos.chequeos;
  const etapa1 = previas[1];
  const forma = etapa1 ? formaDe(etapa1.respuestas) : null;
  const salida: Trampa[] = [];
  if (datos.respuestas.objetivo === null) return salida;
  if (datos.respuestas.unidad === "fila")
    salida.push({ clave: "unidad-fila", params: {} });
  else if (c.unidad_repetida === true)
    salida.push({
      clave: "unidad-repetida",
      params: {
        filas: (numero(c, "filas") ?? 0) - (numero(c, "unidad_vacios") ?? 0),
        unidades: numero(c, "unidades") ?? 0,
        maximo: numero(c, "filas_por_unidad_max") ?? 0,
      },
    });
  else
    salida.push({
      clave: "unidad-unica",
      params: { unidades: numero(c, "unidades") ?? 0 },
    });
  if (!forma) return salida;
  matchTask(forma, {
    binaria: () => {
      const pi = numero(c, "tasa_base");
      const [nunca, siempre] = [
        numero(c, "costo_nunca_actuar"),
        numero(c, "costo_siempre_actuar"),
      ];
      if (pi !== null)
        salida.push({
          clave: "tasa-base",
          params: { tasaPct: pi, restoPct: 1 - pi },
        });
      if (nunca !== null && siempre !== null)
        salida.push({
          clave: "costo-binaria",
          params: { nunca, siempre, menor: Math.min(nunca, siempre) },
        });
    },
    multiclase: () => {
      const mayoritaria = numero(c, "mayoritaria");
      const costo = numero(c, "costo_mayoria");
      if (mayoritaria !== null)
        salida.push({
          clave: "mayoria",
          params: {
            clase: texto(c, "clase_mayoritaria") ?? "",
            tasaPct: mayoritaria,
          },
        });
      if (costo !== null)
        salida.push({ clave: "costo-mayoria", params: { costo } });
    },
    numerica: () => {
      const costo = numero(c, "costo_constante");
      if (costo !== null)
        salida.push({ clave: "costo-constante", params: { costo } });
    },
  });
  return salida;
}

export const ETAPA_2: EtapaConstruida = {
  id: 2,
  construida: true,
  dependeDeDatos: true,
  terminos: [
    "objetivo",
    "unidad-de-analisis",
    "momento-de-prediccion",
    "tasa-base",
    "desbalance",
  ],
  preguntas: ["objetivo", "positivo", "unidad", "momento"],
  chequeos: [
    "filas_por_unidad",
    "vacios",
    "fecha",
    "tasa_base",
    "costo_de_no_hacer_nada",
  ],
  leer,
  criterio,
  trampas,
};

