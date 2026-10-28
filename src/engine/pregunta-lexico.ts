// S21 (ADR 030): el léxico de «Pregúntale a tus datos», en español e inglés, como DATOS. Cambiar una palabra de la gramática es
// cambiar una fila de aquí, no una rama del lector. Todo está normalizado (minúsculas, sin tildes) y los plurales se comparan por su
// forma (`claves`). Ninguna palabra de aquí sale del navegador: el lector es código puro.
//
// Una palabra de la gramática que además es parte del nombre de una columna es de la columna (`ingreso_mensual` no es «por mes»):
// eso lo decide el lector con el catálogo, no este archivo.

export type Agregacion =
  "suma" | "promedio" | "conteo" | "minimo" | "maximo" | "mediana";
export type PeriodoConsulta = "dia" | "semana" | "mes" | "trimestre" | "anio";
export type OperadorConsulta = ">" | ">=" | "<" | "<=" | "=" | "!=";

/** Minúsculas y sin tildes («Región» → «region», «Año» → «ano»). */
export function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Las formas con que una palabra se puede comparar con otra: ella misma y sin su plural (regiones → region, ventas → venta,
 * unidades → unidad, clientes → cliente, categories → category). Dos palabras «son la misma» si comparten alguna forma, así que no
 * hace falta saber cuál de las dos está en plural.
 */
export function claves(palabra: string): string[] {
  const k = new Set([palabra]);
  if (palabra.length > 3 && palabra.endsWith("s")) k.add(palabra.slice(0, -1));
  if (palabra.length > 4 && palabra.endsWith("es")) k.add(palabra.slice(0, -2));
  if (palabra.length > 4 && palabra.endsWith("ies")) k.add(`${palabra.slice(0, -3)}y`);
  return [...k];
}

/** Las palabras de un texto (letras, dígitos y guion bajo), ya normalizadas. Los números se leen aparte (`tokenizar`). */
export const palabrasDe = (texto: string): string[] =>
  normalizar(texto).match(/[\p{L}_]+[\p{L}\p{N}_]*|\p{N}+/gu) ?? [];

export type Token = {
  readonly t: string;
  readonly tipo: "palabra" | "numero" | "iso";
};

const ISO_COMPLETA = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MES = /^\d{4}-\d{2}$/;
const NUMERO = /^\d+(?:[.,]\d+)*$/;

/**
 * La pregunta como lista de tokens: palabras, números (con su separador tal cual: «1,5», «1.500») y fechas ISO (`2025-03-01`,
 * `2025-03`). Los símbolos de comparación pasan a sus palabras («>=» → «al menos») para que una sola gramática los lea.
 */
export function tokenizar(pregunta: string): Token[] {
  const texto = normalizar(pregunta)
    .replace(/>=|≥/g, " al menos ")
    .replace(/<=|≤/g, " como maximo ")
    .replace(/!=|≠/g, " distinto de ")
    .replace(/>/g, " mas de ")
    .replace(/</g, " menos de ")
    .replace(/=/g, " igual a ");
  const crudos =
    texto.match(
      /\d{4}-\d{2}(?:-\d{2})?|\d+(?:[.,]\d+)*|[\p{L}_][\p{L}\p{N}_]*/gu,
    ) ?? [];
  return crudos.map((t): Token => {
    if (ISO_COMPLETA.test(t) || ISO_MES.test(t)) return { t, tipo: "iso" };
    if (NUMERO.test(t)) return { t, tipo: "numero" };
    return { t, tipo: "palabra" };
  });
}

const frases = (lista: readonly string[]): string[][] =>
  lista.map((f) => normalizar(f).split(/\s+/).filter(Boolean));

export const AGREGACIONES: Record<Agregacion, string[][]> = {
  suma: frases([
    "suma",
    "sumar",
    "sumatoria",
    "total",
    "totales",
    "sum",
    "add up",
  ]),
  promedio: frases([
    "promedio",
    "promedios",
    "media",
    "medio",
    "average",
    "avg",
    "mean",
  ]),
  conteo: frases([
    "cuantos",
    "cuantas",
    "cantidad de",
    "numero de",
    "conteo",
    "contar",
    "count",
    "how many",
    "number of",
  ]),
  minimo: frases([
    "minimo",
    "minima",
    "minimos",
    "menor valor",
    "min",
    "minimum",
    "lowest value",
    "smallest value",
  ]),
  maximo: frases([
    "maximo",
    "maxima",
    "maximos",
    "mayor valor",
    "max",
    "maximum",
    "highest value",
    "largest value",
  ]),
  mediana: frases(["mediana", "medianas", "median"]),
};

export const COMPARADORES: Record<OperadorConsulta, string[][]> = {
  ">": frases([
    "mayor a",
    "mayor que",
    "mayor de",
    "mayores a",
    "mayores que",
    "mas de",
    "mas que",
    "superior a",
    "superiores a",
    "por encima de",
    "over",
    "above",
    "more than",
    "greater than",
    "bigger than",
    "higher than",
    "exceeding",
  ]),
  ">=": frases([
    "al menos",
    "como minimo",
    "mayor o igual a",
    "mayor o igual que",
    "no menos de",
    "at least",
    "no less than",
    "greater than or equal to",
  ]),
  "<": frases([
    "menor a",
    "menor que",
    "menor de",
    "menores a",
    "menores que",
    "menos de",
    "menos que",
    "inferior a",
    "inferiores a",
    "por debajo de",
    "under",
    "below",
    "less than",
    "smaller than",
    "lower than",
    "fewer than",
  ]),
  "<=": frases([
    "como maximo",
    "a lo sumo",
    "menor o igual a",
    "menor o igual que",
    "no mas de",
    "at most",
    "no more than",
    "less than or equal to",
  ]),
  "=": frases([
    "igual a",
    "igual que",
    "exactamente",
    "equal to",
    "equals",
    "exactly",
  ]),
  "!=": frases([
    "distinto de",
    "distinto a",
    "diferente de",
    "diferente a",
    "different from",
    "not equal to",
  ]),
};

/** Las marcas de «agrupar por». «por» a secas va al final: las frases más largas («por encima de») se leen antes. */
export const MARCAS_AGRUPAR = frases([
  "por cada",
  "para cada",
  "de cada",
  "agrupado por",
  "agrupada por",
  "desglosado por",
  "segun",
  "por",
  "for each",
  "grouped by",
  "broken down by",
  "split by",
  "per",
  "by",
]);

export const PERIODOS: Record<PeriodoConsulta, string[]> = {
  dia: [
    "dia",
    "dias",
    "diario",
    "diaria",
    "diarios",
    "diarias",
    "day",
    "days",
    "daily",
  ],
  semana: [
    "semana",
    "semanas",
    "semanal",
    "semanales",
    "week",
    "weeks",
    "weekly",
  ],
  mes: ["mes", "meses", "mensual", "mensuales", "month", "months", "monthly"],
  trimestre: [
    "trimestre",
    "trimestres",
    "trimestral",
    "trimestrales",
    "quarter",
    "quarters",
    "quarterly",
  ],
  anio: [
    "anio",
    "anios",
    "ano",
    "anos",
    "anual",
    "anuales",
    "year",
    "years",
    "yearly",
    "annual",
  ],
};

/** Los periodos dichos como adverbio («ventas mensuales») agrupan solos, sin «por». */
export const ADVERBIOS_PERIODO: ReadonlySet<string> = new Set([
  "diario",
  "diaria",
  "diarios",
  "diarias",
  "daily",
  "semanal",
  "semanales",
  "weekly",
  "mensual",
  "mensuales",
  "monthly",
  "trimestral",
  "trimestrales",
  "quarterly",
  "anual",
  "anuales",
  "yearly",
  "annual",
]);

/** «último trimestre», «este mes», «last quarter», «this year»: el periodo que contiene la fecha más reciente de la tabla. */
export const VENTANA_ULTIMO: ReadonlySet<string> = new Set([
  "ultimo",
  "ultima",
  "ultimos",
  "ultimas",
  "last",
  "latest",
  "este",
  "esta",
  "this",
  "current",
  "actual",
]);
/** «trimestre pasado», «previous quarter»: el periodo anterior al de la fecha más reciente. */
export const VENTANA_PASADO: ReadonlySet<string> = new Set([
  "pasado",
  "pasada",
  "anterior",
  "previous",
  "prior",
]);
export const VENTANA_PLURAL: ReadonlySet<string> = new Set([
  "ultimos",
  "ultimas",
  "past",
]);

export const MESES: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

export const VENTANA_DESDE = frases([
  "desde",
  "a partir de",
  "since",
  "from",
  "starting",
]);
export const VENTANA_HASTA = frases(["hasta", "until", "through", "up to"]);
export const VENTANA_ENTRE = frases(["entre", "between"]);
export const CONECTORES_Y: ReadonlySet<string> = new Set(["y", "e", "and"]);

export const TOP_MAYORES: ReadonlySet<string> = new Set([
  "mayores",
  "mejores",
  "principales",
  "primeros",
  "primeras",
  "top",
  "best",
  "highest",
  "largest",
  "biggest",
]);
export const TOP_MENORES: ReadonlySet<string> = new Set([
  "menores",
  "peores",
  "bottom",
  "lowest",
  "smallest",
  "worst",
]);
export const TOP_CON_MAS = frases([
  "con mas",
  "con mayor",
  "with the most",
  "with most",
  "with highest",
]);
export const TOP_CON_MENOS = frases([
  "con menos",
  "con menor",
  "with the least",
  "with least",
  "with lowest",
]);
/** Cuántos «mayores» o «menores» admite una pregunta. */
export const TOP_MAX = 50;

export const NEGADORES: ReadonlySet<string> = new Set([
  "sin",
  "excepto",
  "except",
  "excluding",
  "without",
  "not",
  "menos",
]);

/** Lo que se cuenta cuando la pregunta dice «cuántas filas hay» o «how many rows»: es el objeto de «contar», no una palabra sin leer. */
export const OBJETO_DE_CONTEO: ReadonlySet<string> = new Set([
  "fila",
  "filas",
  "registro",
  "registros",
  "row",
  "rows",
  "record",
  "records",
  "entry",
  "entries",
]);

/** Palabras de relleno que no son «palabras que no leí»: artículos, preposiciones, verbos de pedir. */
export const RELLENO: ReadonlySet<string> = new Set([
  // español
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "un",
  "una",
  "unos",
  "unas",
  "en",
  "con",
  "para",
  "que",
  "y",
  "o",
  "u",
  "e",
  "a",
  "al",
  "me",
  "mi",
  "mis",
  "tu",
  "tus",
  "su",
  "sus",
  "se",
  "es",
  "son",
  "fue",
  "fueron",
  "ha",
  "han",
  "hay",
  "ser",
  "esta",
  "este",
  "cual",
  "cuales",
  "cuanto",
  "cuanta",
  "como",
  "donde",
  "quiero",
  "dame",
  "dime",
  "muestra",
  "muestrame",
  "mostrar",
  "ver",
  "calcula",
  "calcular",
  "dar",
  "entre",
  "solo",
  "solamente",
  "todos",
  "todas",
  "todo",
  "toda",
  "ni",
  "lo",
  "le",
  "les",
  "ya",
  "igual",
  "i",
  // inglés
  "the",
  "of",
  "in",
  "for",
  "with",
  "and",
  "or",
  "to",
  "is",
  "are",
  "was",
  "were",
  "be",
  "me",
  "my",
  "what",
  "which",
  "show",
  "give",
  "tell",
  "get",
  "find",
  "list",
  "all",
  "each",
  "every",
  "only",
  "an",
  "on",
  "at",
  "from",
  "do",
  "does",
  "how",
  "much",
  "many",
  "equal",
  "than",
  "that",
  "it",
  "its",
  "their",
  "our",
  "your",
  "there",
]);

/** El tope de caracteres de una pregunta. */
export const PREGUNTA_MAX = 300;
