// S21 (ADR 030): el lector de «Pregúntale a tus datos». Código determinista, sin LLM, sin red y sin reloj: lee una pregunta en español
// o en inglés contra los NOMBRES de las columnas y los VALORES de las categóricas de la tabla, y devuelve una de tres cosas:
//  · una CONSULTA (`QueryPlan`): qué medir, por qué agrupar, qué filtrar, qué ventana de tiempo y cuántos mostrar. Lo que el código tuvo
//    que proponer (la agregación o el periodo que la pregunta no dice) viene marcado «propuesto» y se ve antes de correr;
//  · una PREGUNTA ABIERTA con opciones, cuando una palabra calza con dos columnas, un valor está en dos columnas, un número es
//    ambiguo (1,500) o falta elegir de qué columna: no adivina, y re-leer la pregunta con la respuesta cierra la duda;
//  · «no entendí», con lo que sí leyó.
// Lo que no cabe en la gramática (tres condiciones, dos agrupaciones, «contiene») no se pierde en silencio: queda en `noLeidas` o en
// los avisos, y la consulta que se muestra es exactamente la que corre.
import {
  CONDICIONES_MAX,
  numeroCanonico,
  type Condicion,
} from "@/engine/protocolo/regla";
import { proponerAgregado, proponerPeriodo } from "@/engine/serie";
import {
  rangoDeMes,
  rangoDelPeriodo,
  rangoUltimos,
  TOP_LIMITE,
  type Agrupar,
  type Catalogo,
  type ColumnaCat,
  type DescripcionVentana,
  type QueryPlan,
  type VentanaConsulta,
} from "./consulta";
import {
  ADVERBIOS_PERIODO,
  AGREGACIONES,
  ARTICULOS,
  claves,
  COMPARADORES,
  CONECTORES_Y,
  CUANTIFICADORES,
  MARCAS_AGRUPAR,
  MESES,
  NEGADORES,
  normalizar,
  OBJETO_DE_CONTEO,
  PERIODOS,
  PREGUNTA_MAX,
  PREPOSICIONES_DE_VALOR,
  RELLENO,
  TOP_CON_MAS,
  TOP_CON_MENOS,
  TOP_MAYORES,
  TOP_MENORES,
  tokenizar,
  VENTANA_DESDE,
  VENTANA_ENTRE,
  VENTANA_HASTA,
  VENTANA_PASADO,
  VENTANA_PLURAL,
  VENTANA_ULTIMO,
  type Agregacion,
  type OperadorConsulta,
  type PeriodoConsulta,
  type Token,
} from "./pregunta-lexico";

/** Las respuestas del usuario a las preguntas abiertas (y sus cambios de lo propuesto), por id. */
export type Respuestas = Readonly<Record<string, string>>;

export type OpcionPregunta = {
  readonly valor: string;
  readonly etiqueta: string;
};

export type PreguntaAbierta = {
  readonly id: string;
  readonly tipo:
    "medida" | "agrupar" | "fecha" | "valor" | "columna" | "numero" | "anio";
  readonly params: Readonly<Record<string, string | number>>;
  readonly opciones: readonly OpcionPregunta[];
};

export type Propuesto = "agregacion" | "periodo";

export type Aviso = {
  readonly clave:
    | "condiciones-max"
    | "dos-grupos"
    | "dos-agregaciones"
    | "dos-ventanas"
    | "top-grande"
    | "union-y"
    | "ventana-grande";
  readonly params: Readonly<Record<string, string | number>>;
};

export type Lectura =
  | {
      readonly tipo: "consulta";
      readonly plan: QueryPlan;
      readonly propuestos: readonly Propuesto[];
      readonly noLeidas: readonly string[];
      readonly avisos: readonly Aviso[];
    }
  | {
      readonly tipo: "pregunta";
      readonly abiertas: readonly PreguntaAbierta[];
      readonly noLeidas: readonly string[];
    }
  | {
      readonly tipo: "no-entendi";
      readonly motivo:
        "vacia" | "muy-larga" | "nada" | "sin-medida" | "sin-fecha";
      readonly noLeidas: readonly string[];
    };

// --- números ----------------------------------------------------------------------------------------------------------------

/**
 * Un número tal como se escribió en la pregunta. «1,5» y «1.5» son 1.5; «1.234,56» y «1,234.56» son 1234.56; «1.500.000» es
 * 1500000; «1,500» y «1.500» son ambiguos (¿uno y medio o mil quinientos?) y se preguntan; «0,500» es 0.5.
 */
export function leerNumero(
  t: string,
):
  | { readonly valor: string }
  | { readonly ambiguo: readonly [string, string] }
  | null {
  const c = (x: string): string | null => numeroCanonico(x);
  const ok = (x: string) => {
    const v = c(x);
    return v === null ? null : { valor: v };
  };
  // el signo se lee aparte y se vuelve a poner: «-5» es menos cinco, no cinco (S21, auditoría A-04)
  if (/^[-−]/.test(t)) {
    const r = leerNumero(t.slice(1));
    if (r === null) return null;
    const neg = (x: string) => (Number(x) === 0 ? x : `-${x}`);
    return "valor" in r
      ? { valor: neg(r.valor) }
      : { ambiguo: [neg(r.ambiguo[0]), neg(r.ambiguo[1])] };
  }
  if (/^\d+$/.test(t)) return ok(t);
  // dos años seguidos, «2023,2024», no son un decimal: se deja sin leer
  if (/^(19|20)\d{2}[.,](19|20)\d{2}$/.test(t)) return null;
  // los separadores mezclados dicen cuál es el decimal (el último): «1.234,567» es 1234.567, no 1 234 567 (auditoría A-11)
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(t))
    return ok(t.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(,\d{3})+\.\d+$/.test(t)) return ok(t.replace(/,/g, ""));
  // miles con UN solo separador repetido
  if (/^\d{1,3}([.,])\d{3}(\1\d{3})+$/.test(t)) return ok(t.replace(/[.,]/g, ""));
  if (/^0[.,]\d+$/.test(t)) return ok(t.replace(",", "."));
  if (/^\d{1,3}[.,]\d{3}$/.test(t)) {
    const dec = c(t.replace(",", "."));
    const mil = c(t.replace(/[.,]/, ""));
    return dec !== null && mil !== null ? { ambiguo: [dec, mil] } : null;
  }
  if (/^\d+[.,]\d+$/.test(t)) return ok(t.replace(",", "."));
  return null;
}

// --- el catálogo en palabras ------------------------------------------------------------------------------------------------

type Info = {
  readonly col: ColumnaCat;
  readonly idx: number;
  readonly tokens: readonly string[];
};

function tokensDeNombre(nombre: string): string[] {
  const partes = nombre.replace(/([a-zà-ÿ])([A-Z])/g, "$1 $2");
  return normalizar(partes)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

const compartenClave = (a: string, b: string): boolean => {
  const kb = new Set(claves(b));
  return claves(a).some((k) => kb.has(k));
};

type Mencion = {
  readonly inicio: number;
  readonly fin: number;
  /** Las columnas que mejor calzan (más de una = ambiguo). */
  readonly mejores: readonly Info[];
};

// --- la lectura -------------------------------------------------------------------------------------------------------------

type Punto =
  | { readonly tipo: "dia"; readonly iso: string }
  | { readonly tipo: "mes"; readonly y: number | null; readonly m: number }
  | { readonly tipo: "anio"; readonly y: number };

type VentanaPend =
  | {
      readonly tipo: "relativa";
      readonly unidad: PeriodoConsulta;
      readonly n: number;
      readonly desfase: number;
    }
  | {
      readonly tipo: "puntos";
      readonly desde: Punto | null;
      readonly hasta: Punto | null;
    };

// sin prototipo (auditoría A-08): «constructor» no es una unidad ni un periodo
const NOMBRES_UNIDAD: Record<string, PeriodoConsulta> = Object.create(null);
for (const [periodo, palabras] of Object.entries(PERIODOS))
  for (const p of palabras)
    if (!ADVERBIOS_PERIODO.has(p))
      NOMBRES_UNIDAD[p] = periodo as PeriodoConsulta;
const CUALQUIER_PERIODO: Record<string, PeriodoConsulta> = Object.create(null);
for (const [periodo, palabras] of Object.entries(PERIODOS))
  for (const p of palabras) CUALQUIER_PERIODO[p] = periodo as PeriodoConsulta;

/** Cuántas unidades admite «los últimos N …»: lo que cabe en dos siglos de calendario (auditoría A-14). */
const UNIDADES_MAX: Record<PeriodoConsulta, number> = {
  dia: 36500,
  semana: 5200,
  mes: 1200,
  trimestre: 400,
  anio: 100,
};

const esAnio = (t: Token): boolean =>
  t.tipo === "numero" && /^(19|20)\d{2}$/.test(t.t);

export function leerPregunta(
  texto: string,
  cat: Catalogo,
  respuestas: Respuestas = {},
): Lectura {
  if (texto.trim() === "")
    return { tipo: "no-entendi", motivo: "vacia", noLeidas: [] };
  if (texto.length > PREGUNTA_MAX)
    return { tipo: "no-entendi", motivo: "muy-larga", noLeidas: [] };

  const toks = tokenizar(texto);
  const usado: boolean[] = toks.map(() => false);
  const abiertas: PreguntaAbierta[] = [];
  const avisos: Aviso[] = [];
  const propuestos: Propuesto[] = [];
  const marcar = (desde: number, hasta: number) => {
    for (let k = desde; k < hasta; k++) usado[k] = true;
  };
  const libre = (i: number): boolean => i >= 0 && i < toks.length && !usado[i];

  const infos: Info[] = cat.columnas.map((col, idx) => ({
    col,
    idx,
    tokens: tokensDeNombre(col.nombre),
  }));
  const porClave = new Map<string, Set<number>>();
  for (const info of infos)
    for (const t of info.tokens)
      for (const k of claves(t)) {
        const set = porClave.get(k) ?? new Set<number>();
        set.add(info.idx);
        porClave.set(k, set);
      }
  const columnasConPalabra = (p: string): Set<number> => {
    const salida = new Set<number>();
    for (const k of claves(p))
      for (const i of porClave.get(k) ?? []) salida.add(i);
    return salida;
  };
  /** Una palabra de la gramática que además es parte del nombre de una columna es de la columna. */
  const esDeColumna = (p: string): boolean => columnasConPalabra(p).size > 0;

  const coincideFrase = (i: number, frase: readonly string[]): boolean => {
    if (i + frase.length > toks.length) return false;
    for (let k = 0; k < frase.length; k++) {
      const t = toks[i + k]!;
      if (usado[i + k] || t.tipo !== "palabra" || t.t !== frase[k])
        return false;
    }
    return true;
  };
  const fraseMasLarga = (
    i: number,
    lista: readonly (readonly string[])[],
  ): readonly string[] | null => {
    let mejor: readonly string[] | null = null;
    for (const f of lista)
      if (coincideFrase(i, f) && (!mejor || f.length > mejor.length)) mejor = f;
    return mejor;
  };
  const palabraEn = (i: number): string | null => {
    const t = toks[i];
    return t && !usado[i] && t.tipo === "palabra" ? t.t : null;
  };

  // --- 1. comparadores numéricos («más de 100», «at least 5») ---------------------------------------------------------------
  type Comp = {
    op: OperadorConsulta;
    inicio: number;
    fin: number;
    numero: string;
  };
  const comparadores: Comp[] = [];
  /** Las palabras de «distinto de», «diferente de», «≠»…: sin número detrás, niegan el valor que sigue (auditoría A-01). */
  const negadoresComparador = new Set<number>();
  for (let i = 0; i < toks.length; i++) {
    let mejor: { op: OperadorConsulta; len: number } | null = null;
    for (const op of Object.keys(COMPARADORES) as OperadorConsulta[]) {
      const f = fraseMasLarga(i, COMPARADORES[op]);
      if (f && (!mejor || f.length > mejor.len)) mejor = { op, len: f.length };
    }
    if (!mejor) continue;
    const j = i + mejor.len;
    const num = toks[j];
    if (num && !usado[j] && num.tipo === "numero") {
      comparadores.push({ op: mejor.op, inicio: i, fin: j + 1, numero: num.t });
      marcar(i, j + 1);
      i = j;
    } else if (mejor.op === "=" || mejor.op === "!=") {
      if (mejor.op === "!=") for (let k = i; k < j; k++) negadoresComparador.add(k);
      marcar(i, j);
    }
  }

  // --- 2. «los 5 mayores», «top 3», «bottom 10» ----------------------------------------------------------------------------
  let top: { n: number; orden: "desc" | "asc" } | null = null;
  const marcasTop: number[] = [];
  const entero = (i: number): number | null => {
    const t = toks[i];
    return t && !usado[i] && t.tipo === "numero" && /^\d+$/.test(t.t)
      ? Number(t.t)
      : null;
  };
  for (let i = 0; i < toks.length && top === null; i++) {
    const p = palabraEn(i);
    let orden: "desc" | "asc" | null = null;
    let largo = 1;
    if (p !== null && TOP_MAYORES.has(p)) orden = "desc";
    else if (p !== null && TOP_MENORES.has(p)) orden = "asc";
    else {
      const fm = fraseMasLarga(i, TOP_CON_MAS);
      const fn = fraseMasLarga(i, TOP_CON_MENOS);
      if (fm) {
        orden = "desc";
        largo = fm.length;
      } else if (fn) {
        orden = "asc";
        largo = fn.length;
      }
    }
    if (orden === null) continue;
    const despues = entero(i + largo);
    const antes = entero(i - 1);
    // «las 3 regiones con más ventas»: el número va antes de la palabra que nombra el grupo, y esa palabra es una marca de «por»
    const nombrado =
      despues === null && antes === null && largo > 1 && i >= 2
        ? { n: entero(i - 2), palabra: palabraEn(i - 1) }
        : null;
    const n = despues ?? antes ?? (nombrado?.palabra != null ? nombrado.n : null);
    if (n === null) continue;
    if (n < 1 || n > TOP_LIMITE) {
      avisos.push({ clave: "top-grande", params: { n, max: TOP_LIMITE } });
      continue;
    }
    top = { n, orden };
    marcar(i, i + largo);
    if (nombrado?.palabra != null && nombrado.n === n) {
      marcar(i - 2, i - 1);
      marcasTop.push(i - 1);
    } else
      marcar(
        despues !== null ? i + largo : i - 1,
        despues !== null ? i + largo + 1 : i,
      );
  }

  // --- 3. la ventana de tiempo ---------------------------------------------------------------------------------------------
  const valoresNormalizados = new Map<string, Set<number>>();
  for (const info of infos)
    if (info.col.tipo === "categoria")
      for (const v of info.col.distintos) {
        const k = normalizar(v);
        const set = valoresNormalizados.get(k) ?? new Set<number>();
        set.add(info.idx);
        valoresNormalizados.set(k, set);
      }

  let ventana: VentanaPend | null = null;
  const fijarVentana = (v: VentanaPend) => {
    if (ventana) avisos.push({ clave: "dos-ventanas", params: {} });
    else ventana = v;
  };

  /** Un punto en el tiempo que empieza en `i`: una fecha ISO, un mes ISO, un año, o «marzo [de] [2025]». */
  const leerPunto = (i: number): { punto: Punto; fin: number } | null => {
    const t = toks[i];
    if (!t || usado[i]) return null;
    if (t.tipo === "iso") {
      // una fecha que no existe («2025-13», «2024-02-30») no se lee: queda en «No leí», no salta al mes que sigue (auditoría A-14)
      const [y, m, d] = t.t.split("-").map(Number) as [number, number, number | undefined];
      if (m < 1 || m > 12) return null;
      if (t.t.length === 10 && new Date(Date.UTC(y, m - 1, d!)).getUTCDate() !== d) return null;
      if (t.t.length === 10)
        return { punto: { tipo: "dia", iso: t.t }, fin: i + 1 };
      return {
        punto: {
          tipo: "mes",
          y: Number(t.t.slice(0, 4)),
          m: Number(t.t.slice(5, 7)),
        },
        fin: i + 1,
      };
    }
    if (esAnio(t))
      return { punto: { tipo: "anio", y: Number(t.t) }, fin: i + 1 };
    if (
      t.tipo === "palabra" &&
      MESES[t.t] !== undefined &&
      !valoresNormalizados.has(t.t)
    ) {
      let j = i + 1;
      const conector = palabraEn(j);
      if (conector === "de" || conector === "of") j += 1;
      const anio = toks[j];
      if (anio && !usado[j] && esAnio(anio))
        return {
          punto: { tipo: "mes", y: Number(anio.t), m: MESES[t.t]! },
          fin: j + 1,
        };
      return { punto: { tipo: "mes", y: null, m: MESES[t.t]! }, fin: i + 1 };
    }
    return null;
  };

  // 3a. «último trimestre», «últimos 3 meses», «this year», «trimestre pasado», «previous quarter»
  for (let i = 0; i < toks.length && ventana === null; i++) {
    const p = palabraEn(i);
    if (p === null) continue;
    if (VENTANA_ULTIMO.has(p) || VENTANA_PLURAL.has(p)) {
      let j = i + 1;
      let n: number | null = null;
      const num = entero(j);
      if (num !== null && num >= 1) {
        n = num;
        j += 1;
      }
      const u = palabraEn(j);
      const unidad = u !== null ? NOMBRES_UNIDAD[u] : undefined;
      if (!unidad) continue;
      if (n === null && VENTANA_PLURAL.has(p)) continue;
      if (n !== null && n > UNIDADES_MAX[unidad]) {
        avisos.push({ clave: "ventana-grande", params: { max: UNIDADES_MAX[unidad] } });
        marcar(i, j + 1);
        continue;
      }
      fijarVentana({ tipo: "relativa", unidad, n: n ?? 1, desfase: 0 });
      marcar(i, j + 1);
    } else if (VENTANA_PASADO.has(p)) {
      const antes = palabraEn(i - 1);
      const despues = palabraEn(i + 1);
      const uAntes = antes !== null ? NOMBRES_UNIDAD[antes] : undefined;
      const uDespues = despues !== null ? NOMBRES_UNIDAD[despues] : undefined;
      if (uAntes) {
        fijarVentana({ tipo: "relativa", unidad: uAntes, n: 1, desfase: 1 });
        marcar(i - 1, i + 1);
      } else if (uDespues) {
        fijarVentana({ tipo: "relativa", unidad: uDespues, n: 1, desfase: 1 });
        marcar(i, i + 2);
      }
    }
  }

  // 3b. «desde X», «hasta Y», «entre X y Y»
  if (ventana === null) {
    let desde: Punto | null = null;
    let hasta: Punto | null = null;
    for (let i = 0; i < toks.length; i++) {
      const fEntre = fraseMasLarga(i, VENTANA_ENTRE);
      if (fEntre) {
        const a = leerPunto(i + fEntre.length);
        if (a) {
          const y = palabraEn(a.fin);
          const b =
            y !== null && CONECTORES_Y.has(y) ? leerPunto(a.fin + 1) : null;
          if (b) {
            desde = a.punto;
            hasta = b.punto;
            marcar(i, b.fin);
            i = b.fin - 1;
          }
        }
        continue;
      }
      const fDesde = fraseMasLarga(i, VENTANA_DESDE);
      if (fDesde) {
        const a = leerPunto(i + fDesde.length);
        if (a) {
          desde = a.punto;
          marcar(i, a.fin);
          i = a.fin - 1;
        }
        continue;
      }
      const fHasta = fraseMasLarga(i, VENTANA_HASTA);
      if (fHasta) {
        const a = leerPunto(i + fHasta.length);
        if (a) {
          hasta = a.punto;
          marcar(i, a.fin);
          i = a.fin - 1;
        }
      }
    }
    if (desde || hasta) fijarVentana({ tipo: "puntos", desde, hasta });
  }

  // 3c. un año o un mes suelto: «en 2025», «in March», «ventas de marzo de 2025»
  if (ventana === null) {
    for (let i = 0; i < toks.length; i++) {
      const r = leerPunto(i);
      if (!r) continue;
      fijarVentana({ tipo: "puntos", desde: r.punto, hasta: r.punto });
      marcar(i, r.fin);
      break;
    }
  }

  // --- 4. agrupar: «por región», «by month», «por mes», «mensual» ----------------------------------------------------------
  let periodoGrupo: PeriodoConsulta | null = null;
  const marcas: number[] = [];
  /** Lo que sigue a una marca de «por» (o a «las 3 … con más»): un periodo de la fecha, o el mensaje de una columna. */
  const alMarcar = (j: number) => {
    const sig = palabraEn(j);
    // «por mes» agrupa por el mes de la fecha, aunque «mes» sea parte del nombre de otra columna (`mes_observado`, `antiguedad_meses`);
    // solo una columna que se llame justo así (y no sea una fecha) gana la palabra
    if (
      sig !== null &&
      CUALQUIER_PERIODO[sig] !== undefined &&
      !infos.some(
        (info) =>
          info.col.tipo !== "fecha" &&
          info.tokens.length === 1 &&
          compartenClave(info.tokens[0]!, sig),
      )
    ) {
      if (periodoGrupo === null) periodoGrupo = CUALQUIER_PERIODO[sig]!;
      else avisos.push({ clave: "dos-grupos", params: {} });
      marcar(j, j + 1);
    } else marcas.push(j);
  };
  for (let i = 0; i < toks.length; i++) {
    const f = fraseMasLarga(i, MARCAS_AGRUPAR);
    if (!f) continue;
    const j = i + f.length;
    marcar(i, j);
    alMarcar(j);
    i = j - 1;
  }
  marcasTop.forEach(alMarcar);
  if (periodoGrupo === null) {
    for (let i = 0; i < toks.length; i++) {
      const p = palabraEn(i);
      if (p !== null && ADVERBIOS_PERIODO.has(p) && !esDeColumna(p)) {
        periodoGrupo = CUALQUIER_PERIODO[p]!;
        marcar(i, i + 1);
        break;
      }
    }
  }

  // --- 5. la agregación ----------------------------------------------------------------------------------------------------
  let agregacion: Agregacion | null = null;
  const listaAgg = (
    Object.entries(AGREGACIONES) as [Agregacion, string[][]][]
  ).flatMap(([a, fs]) => fs.map((f) => ({ a, f })));
  for (let i = 0; i < toks.length; i++) {
    let mejor: { a: Agregacion; len: number } | null = null;
    for (const { a, f } of listaAgg)
      if (coincideFrase(i, f) && (!mejor || f.length > mejor.len))
        mejor = { a, len: f.length };
    if (!mejor) continue;
    if (mejor.len === 1 && esDeColumna(toks[i]!.t)) continue;
    if (agregacion === null) {
      agregacion = mejor.a;
      marcar(i, i + mejor.len);
      // «cuántas filas hay»: «filas» es lo que se cuenta, salvo que sea parte del nombre de una columna
      const objeto = palabraEn(i + mejor.len);
      if (
        mejor.a === "conteo" &&
        objeto !== null &&
        OBJETO_DE_CONTEO.has(objeto) &&
        !esDeColumna(objeto)
      )
        marcar(i + mejor.len, i + mejor.len + 1);
    } else if (agregacion !== mejor.a) {
      avisos.push({ clave: "dos-agregaciones", params: {} });
    }
  }
  /** ¿La pregunta dijo el cálculo con palabras? Si no, sigue siendo «propuesto» aunque el usuario lo cambie (auditoría A-16). */
  const agregacionEnTexto = agregacion !== null;
  const agregacionRespondida = respuestas["agregacion"] as
    Agregacion | undefined;
  if (agregacionRespondida && agregacionRespondida in AGREGACIONES)
    agregacion = agregacionRespondida;
  const agregacionDicha = agregacion !== null;

  // --- 6. los valores de las categóricas («norte», «sin norte») --------------------------------------------------------------
  type Valor = {
    col: Info;
    valor: string;
    inicio: number;
    fin: number;
    negado: boolean;
  };
  const valores: Valor[] = [];
  /** Dónde estuvo cada valor y de qué columnas podía ser: la mención de la columna pegada al valor («región norte») es su etiqueta. */
  const huellas: { columnas: number[]; inicio: number; fin: number }[] = [];
  type EntradaValor = { info: Info; valor: string; tokens: string[] };
  const indiceValores = new Map<string, EntradaValor[]>();
  /** Los valores que además son palabras de relleno («este», «A», «todos»): solo se leen con contexto (auditoría A-02). */
  const indiceRelleno = new Map<string, EntradaValor[]>();
  for (const info of infos) {
    if (info.col.tipo !== "categoria") continue;
    for (const v of info.col.distintos) {
      const normal = normalizar(v).trim();
      if (/^\d+([.,]\d+)?$/.test(normal)) continue;
      if (listaAgg.some(({ f }) => f.length === 1 && f[0] === normal)) continue;
      const destino = RELLENO.has(normal) ? indiceRelleno : indiceValores;
      // «ciudad_07» se reconoce escrito así y escrito «ciudad 07» (el tokenizador ya las vuelve la misma lista)
      const vistas = new Set<string>();
      for (const forma of new Set([v, v.replace(/_/g, " ")])) {
        const tokensValor = tokenizar(forma).map((t) => t.t);
        if (tokensValor.length === 0 || vistas.has(tokensValor.join(" "))) continue;
        vistas.add(tokensValor.join(" "));
        const lista = destino.get(tokensValor[0]!) ?? [];
        lista.push({ info, valor: v, tokens: tokensValor });
        destino.set(tokensValor[0]!, lista);
      }
    }
  }
  /** ¿La palabra de antes nombra la columna de este valor («grupo A»)? */
  const pegadoALaColumna = (c: EntradaValor, i: number): boolean => {
    const p = palabraEn(i - 1);
    return p !== null && c.info.tokens.some((tn) => compartenClave(tn, p));
  };
  /** Un valor que es palabra de relleno cuenta como valor tras una preposición («del este», «sin el este») o pegado a su columna. */
  const candidatosDeRelleno = (i: number, w: string): EntradaValor[] | undefined => {
    const lista = indiceRelleno.get(w);
    if (!lista || CUANTIFICADORES.has(w)) return undefined;
    const prev = palabraEn(i - 1);
    const trasPreposicion =
      w.length > 1 &&
      prev !== null &&
      (PREPOSICIONES_DE_VALOR.has(prev) ||
        (ARTICULOS.has(prev) && (palabraEn(i - 2) ?? "") !== "" && PREPOSICIONES_DE_VALOR.has(palabraEn(i - 2)!)));
    const buenas = lista.filter((c) => trasPreposicion || pegadoALaColumna(c, i));
    return buenas.length > 0 ? buenas : undefined;
  };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!;
    if (usado[i] || t.tipo === "iso") continue;
    const candidatos = indiceValores.get(t.t) ?? candidatosDeRelleno(i, t.t);
    if (!candidatos) continue;
    let mejorLargo = 0;
    let aciertos: { info: Info; valor: string }[] = [];
    for (const c of candidatos) {
      let ok = i + c.tokens.length <= toks.length;
      for (let k = 0; ok && k < c.tokens.length; k++)
        ok = libre(i + k) && toks[i + k]!.t === c.tokens[k];
      if (!ok) continue;
      if (c.tokens.length > mejorLargo) {
        mejorLargo = c.tokens.length;
        aciertos = [];
      }
      if (c.tokens.length === mejorLargo)
        aciertos.push({ info: c.info, valor: c.valor });
    }
    if (aciertos.length === 0) continue;
    let elegido = aciertos[0]!;
    if (aciertos.length > 1) {
      const id = `valor:${normalizar(aciertos[0]!.valor)}`;
      const respuesta = respuestas[id];
      const hallado = aciertos.find((a) => a.info.col.nombre === respuesta);
      huellas.push({
        columnas: aciertos.map((a) => a.info.idx),
        inicio: i,
        fin: i + mejorLargo,
      });
      if (!hallado) {
        abiertas.push({
          id,
          tipo: "valor",
          params: { valor: aciertos[0]!.valor },
          opciones: aciertos.map((a) => ({
            valor: a.info.col.nombre,
            etiqueta: a.info.col.nombre,
          })),
        });
        marcar(i, i + mejorLargo);
        i += mejorLargo - 1;
        continue;
      }
      elegido = hallado;
    }
    // un negador justo antes («sin norte», «except north»)
    let negado = false;
    for (let b = i - 1; b >= Math.max(0, i - 3); b--) {
      if (negadoresComparador.has(b)) {
        negado = true;
        break;
      }
      const w = palabraEn(b);
      if (w === null) continue;
      if (NEGADORES.has(w)) {
        negado = true;
        marcar(b, b + 1);
        break;
      }
      if (!RELLENO.has(w)) break;
    }
    valores.push({
      col: elegido.info,
      valor: elegido.valor,
      inicio: i,
      fin: i + mejorLargo,
      negado,
    });
    if (aciertos.length === 1)
      huellas.push({
        columnas: [elegido.info.idx],
        inicio: i,
        fin: i + mejorLargo,
      });
    marcar(i, i + mejorLargo);
    i += mejorLargo - 1;
  }

  // --- 7. las menciones de columnas ----------------------------------------------------------------------------------------
  const menciones: Mencion[] = [];
  for (let i = 0; i < toks.length;) {
    const t = toks[i]!;
    if (usado[i] || t.tipo !== "palabra" || RELLENO.has(t.t)) {
      i += 1;
      continue;
    }
    let candidatas = columnasConPalabra(t.t);
    if (candidatas.size === 0) {
      i += 1;
      continue;
    }
    let fin = i + 1;
    while (
      fin < toks.length &&
      !usado[fin] &&
      toks[fin]!.tipo === "palabra" &&
      !RELLENO.has(toks[fin]!.t)
    ) {
      const sig = columnasConPalabra(toks[fin]!.t);
      const inter = new Set([...candidatas].filter((x) => sig.has(x)));
      if (inter.size === 0) break;
      candidatas = inter;
      fin += 1;
    }
    const palabras = toks.slice(i, fin).map((x) => x.t);
    const puntaje = [...candidatas].map((idx) => {
      const info = infos[idx]!;
      const aciertos = info.tokens.filter((tn) =>
        palabras.some((w) => compartenClave(tn, w)),
      ).length;
      return { info, aciertos, cobertura: aciertos / info.tokens.length };
    });
    const maxCob = Math.max(...puntaje.map((p) => p.cobertura));
    const conMaxCob = puntaje.filter((p) => p.cobertura === maxCob);
    const maxAc = Math.max(...conMaxCob.map((p) => p.aciertos));
    menciones.push({
      inicio: i,
      fin,
      mejores: conMaxCob.filter((p) => p.aciertos === maxAc).map((p) => p.info),
    });
    i = fin;
  }
  const idMencion = (m: Mencion): string =>
    toks
      .slice(m.inicio, m.fin)
      .map((x) => x.t)
      .join(" ");
  const entreVacio = (a: number, b: number): boolean => {
    for (let k = a; k < b; k++) {
      const t = toks[k]!;
      if (!(usado[k] || (t.tipo === "palabra" && RELLENO.has(t.t))))
        return false;
    }
    return true;
  };

  // --- 8. quién es quién ---------------------------------------------------------------------------------------------------
  const enRol = new Set<number>(); // índices de menciones que ya tienen un papel
  const elegir = (
    m: Mencion,
    id: string,
    tipo: PreguntaAbierta["tipo"],
    extra: PreguntaAbierta["params"] = {},
  ): Info | null => {
    if (m.mejores.length === 1) return m.mejores[0]!;
    const respuesta = respuestas[id];
    const hallado = m.mejores.find((i) => i.col.nombre === respuesta);
    if (hallado) return hallado;
    abiertas.push({
      id,
      tipo,
      params: { palabra: idMencion(m), ...extra },
      opciones: m.mejores.map((i) => ({
        valor: i.col.nombre,
        etiqueta: i.col.nombre,
      })),
    });
    return null;
  };

  // el grupo
  let grupoInfo: Info | null = null;
  let grupoPendiente = false;
  let gruposDichos = 0;
  for (const marca of marcas) {
    const k = menciones.findIndex(
      (m, idx) =>
        !enRol.has(idx) && m.inicio >= marca && entreVacio(marca, m.inicio),
    );
    if (k < 0) continue;
    gruposDichos += 1;
    if (gruposDichos > 1) {
      avisos.push({ clave: "dos-grupos", params: {} });
      continue;
    }
    const candidata = elegir(menciones[k]!, "agrupar", "agrupar");
    if (candidata === null) {
      enRol.add(k);
      marcar(menciones[k]!.inicio, menciones[k]!.fin);
      grupoPendiente = true;
      continue;
    }
    // «regiones por ventas», «top 3 regions by sales»: lo que sigue a «por» es una cifra, así que el grupo es la categoría de antes
    const antes =
      candidata.col.tipo === "numero"
        ? menciones
            .map((m, idx) => ({ m, idx }))
            .filter(
              ({ m, idx }) =>
                !enRol.has(idx) &&
                m.fin <= marca &&
                m.mejores.length === 1 &&
                m.mejores[0]!.col.tipo === "categoria",
            )
            .pop()
        : undefined;
    if (antes) {
      enRol.add(antes.idx);
      marcar(antes.m.inicio, antes.m.fin);
      grupoInfo = antes.m.mejores[0]!;
    } else {
      enRol.add(k);
      marcar(menciones[k]!.inicio, menciones[k]!.fin);
      grupoInfo = candidata;
    }
  }

  // las condiciones de comparación
  const condiciones: Condicion[] = [];
  const objetivosComparador = new Set<number>();
  comparadores.forEach((cmp, ci) => {
    const numero = leerNumero(cmp.numero);
    let valor: string | null = null;
    if (numero && "valor" in numero) valor = numero.valor;
    else if (numero && "ambiguo" in numero) {
      const id = `numero:${cmp.numero}`;
      const r = respuestas[id];
      if (r !== undefined && numero.ambiguo.includes(r)) valor = r;
      else
        abiertas.push({
          id,
          tipo: "numero",
          params: { texto: cmp.numero },
          opciones: numero.ambiguo.map((v) => ({ valor: v, etiqueta: v })),
        });
    }
    // la columna: la mención numérica más cercana, justo antes o justo después del número
    const candidatas = menciones
      .map((m, idx) => ({ m, idx }))
      .filter(
        ({ m, idx }) =>
          m.mejores.some((i) => i.col.tipo === "numero") && !enRol.has(idx),
      )
      .map(({ m, idx }) => {
        const antes =
          m.fin <= cmp.inicio && entreVacio(m.fin, cmp.inicio)
            ? cmp.inicio - m.fin
            : null;
        const despues =
          m.inicio >= cmp.fin && entreVacio(cmp.fin, m.inicio)
            ? m.inicio - cmp.fin
            : null;
        const d =
          antes !== null && despues !== null
            ? Math.min(antes, despues)
            : (antes ?? despues);
        return d === null
          ? null
          : {
              m,
              idx,
              d,
              antes: antes !== null && (despues === null || antes <= despues),
            };
      })
      .filter(
        (x): x is { m: Mencion; idx: number; d: number; antes: boolean } =>
          x !== null,
      )
      .sort(
        (a, b) => a.d - b.d || (a.antes === b.antes ? 0 : a.antes ? -1 : 1),
      );
    const elegida = candidatas[0];
    let info: Info | null = null;
    if (elegida) {
      const numericas = elegida.m.mejores.filter(
        (i) => i.col.tipo === "numero",
      );
      const sub: Mencion = { ...elegida.m, mejores: numericas };
      info = elegir(sub, `columna:${ci}`, "columna", { numero: cmp.numero });
      objetivosComparador.add(elegida.idx);
      marcar(elegida.m.inicio, elegida.m.fin);
    } else {
      const numericas = infos.filter((i) => i.col.tipo === "numero");
      const respuesta = respuestas[`columna:${ci}`];
      const hallado = numericas.find((i) => i.col.nombre === respuesta);
      if (hallado) info = hallado;
      else if (numericas.length > 0)
        abiertas.push({
          id: `columna:${ci}`,
          tipo: "columna",
          params: { numero: cmp.numero },
          opciones: numericas.map((i) => ({
            valor: i.col.nombre,
            etiqueta: i.col.nombre,
          })),
        });
    }
    if (info && valor !== null)
      condiciones.push({ columna: info.col.nombre, operador: cmp.op, valor });
  });
  // los valores de las categóricas
  for (const v of valores)
    condiciones.push({
      columna: v.col.col.nombre,
      operador: v.negado ? "!=" : "=",
      valor: v.valor,
    });
  for (const h of huellas)
    menciones.forEach((m, idx) => {
      if (
        m.mejores.some((i) => h.columnas.includes(i.idx)) &&
        (entreVacio(m.fin, h.inicio) || entreVacio(h.fin, m.inicio))
      ) {
        enRol.add(idx);
        marcar(m.inicio, m.fin);
      }
    });
  let condicionesFinales = condiciones;
  if (condiciones.length > CONDICIONES_MAX) {
    avisos.push({ clave: "condiciones-max", params: { max: CONDICIONES_MAX } });
    condicionesFinales = condiciones.slice(0, CONDICIONES_MAX);
  }
  const union: "" | "y" | "o" =
    condicionesFinales.length < 2
      ? ""
      : condicionesFinales.every((c) => c.operador === "=") &&
          condicionesFinales[0]!.columna === condicionesFinales[1]!.columna
        ? "o"
        : "y";
  // «unidades mayor a 30 o ventas mayor a 100»: entre columnas distintas solo se lee «y», y se dice (auditoría A-10)
  if (
    union === "y" &&
    toks.some((t, i) => !usado[i] && t.tipo === "palabra" && (t.t === "o" || t.t === "u" || t.t === "or"))
  )
    avisos.push({ clave: "union-y", params: {} });

  // la medida
  let medidaColumna: string | null = null;
  let medidaPendiente = false;
  const candidatasMedida = menciones
    .map((m, idx) => ({ m, idx }))
    .filter(({ idx }) => !enRol.has(idx))
    .filter(({ m }) =>
      agregacion === "conteo"
        ? true
        : m.mejores.some((i) => i.col.tipo === "numero"),
    );
  const preferidas = candidatasMedida.filter(
    ({ idx }) => !objetivosComparador.has(idx),
  );
  const unicas =
    preferidas.length > 0
      ? preferidas
      : candidatasMedida.filter(({ idx }) => objetivosComparador.has(idx));
  const respuestaMedida = respuestas["medida"];
  if (unicas.length > 0) {
    const nombres = new Map<string, Info>();
    for (const { m } of unicas) {
      const buenas =
        agregacion === "conteo"
          ? m.mejores
          : m.mejores.filter((i) => i.col.tipo === "numero");
      for (const i of buenas) nombres.set(i.col.nombre, i);
    }
    const elegidaPorElUsuario =
      respuestaMedida !== undefined ? nombres.get(respuestaMedida) : undefined;
    if (elegidaPorElUsuario) medidaColumna = elegidaPorElUsuario.col.nombre;
    else if (nombres.size === 1) medidaColumna = [...nombres.keys()][0]!;
    else {
      medidaPendiente = true;
      abiertas.push({
        id: "medida",
        tipo: "medida",
        params: {},
        opciones: [...nombres.values()].map((i) => ({
          valor: i.col.nombre,
          etiqueta: i.col.nombre,
        })),
      });
    }
    for (const { idx, m } of unicas) {
      enRol.add(idx);
      marcar(m.inicio, m.fin);
    }
  }

  // la columna de fechas
  const fechas = infos.filter((i) => i.col.tipo === "fecha");
  const grupoEsFecha =
    grupoInfo !== null && (grupoInfo as Info).col.tipo === "fecha";
  const necesitaFecha =
    ventana !== null || periodoGrupo !== null || grupoEsFecha;
  let fechaInfo: Info | null = null;
  if (necesitaFecha) {
    if (grupoEsFecha) fechaInfo = grupoInfo;
    else if (fechas.length === 1) fechaInfo = fechas[0]!;
    else if (fechas.length > 1) {
      const r = respuestas["fecha"];
      const hallada = fechas.find((i) => i.col.nombre === r);
      if (hallada) fechaInfo = hallada;
      else
        abiertas.push({
          id: "fecha",
          tipo: "fecha",
          params: {},
          opciones: fechas.map((i) => ({
            valor: i.col.nombre,
            etiqueta: i.col.nombre,
          })),
        });
    } else {
      return {
        tipo: "no-entendi",
        motivo: "sin-fecha",
        noLeidas: sinLeer(toks, usado),
      };
    }
  }

  // la ventana, ya con la columna de fechas
  let ventanaFinal: VentanaConsulta | null = null;
  if (ventana !== null && fechaInfo !== null) {
    const v = resolverVentana(ventana, fechaInfo, respuestas, abiertas);
    if (v) ventanaFinal = v;
  }

  // el grupo: categoría o tiempo
  let agrupar: Agrupar | null = null;
  const propuestosTiempo = (): PeriodoConsulta => {
    const col = fechaInfo!.col;
    const p =
      col.tipo === "fecha" && col.fechas ? proponerPeriodo(col.fechas) : null;
    return p ?? "mes";
  };
  if (periodoGrupo !== null && fechaInfo !== null) {
    const periodo =
      (respuestas["periodo"] as PeriodoConsulta | undefined) ?? periodoGrupo;
    agrupar = { tipo: "tiempo", columna: fechaInfo.col.nombre, periodo };
  } else if (grupoInfo !== null) {
    const g = grupoInfo as Info;
    if (g.col.tipo === "fecha") {
      const elegido = respuestas["periodo"] as PeriodoConsulta | undefined;
      agrupar = {
        tipo: "tiempo",
        columna: g.col.nombre,
        periodo: elegido ?? propuestosTiempo(),
      };
      propuestos.push("periodo");
    } else agrupar = { tipo: "categoria", columna: g.col.nombre };
  }

  // lo que todavía hay que preguntar
  if (abiertas.length > 0 || grupoPendiente || medidaPendiente)
    return { tipo: "pregunta", abiertas, noLeidas: sinLeer(toks, usado) };

  // la agregación y la medida
  let agg: Agregacion;
  if (agregacion !== null) {
    agg = agregacion;
    if (!agregacionEnTexto) propuestos.push("agregacion");
  } else if (medidaColumna !== null) {
    agg = proponerAgregado(medidaColumna);
    propuestos.push("agregacion");
  } else {
    agg = "conteo";
    propuestos.push("agregacion");
  }
  if (medidaColumna === null && agregacion !== null && agg !== "conteo") {
    const numericas = infos.filter((i) => i.col.tipo === "numero");
    if (numericas.length === 0)
      return {
        tipo: "no-entendi",
        motivo: "sin-medida",
        noLeidas: sinLeer(toks, usado),
      };
    return {
      tipo: "pregunta",
      abiertas: [
        {
          id: "medida",
          tipo: "medida",
          params: {},
          opciones: numericas.map((i) => ({
            valor: i.col.nombre,
            etiqueta: i.col.nombre,
          })),
        },
      ],
      noLeidas: sinLeer(toks, usado),
    };
  }

  const algoLeido =
    agrupar !== null ||
    condicionesFinales.length > 0 ||
    ventanaFinal !== null ||
    medidaColumna !== null ||
    agregacionDicha ||
    top !== null;
  if (!algoLeido)
    return {
      tipo: "no-entendi",
      motivo: "nada",
      noLeidas: sinLeer(toks, usado),
    };

  const topFinal = top as { n: number; orden: "desc" | "asc" } | null;
  const plan: QueryPlan = {
    medida: {
      agregacion: agg,
      columna:
        agg === "conteo" && medidaColumna === null ? null : medidaColumna,
    },
    agrupar,
    condiciones: condicionesFinales,
    union,
    ventana: ventanaFinal,
    orden: topFinal ? topFinal.orden : null,
    top: topFinal ? topFinal.n : null,
  };
  return {
    tipo: "consulta",
    plan,
    propuestos: [...new Set(propuestos)],
    noLeidas: sinLeer(toks, usado),
    avisos,
  };
}

/** Las palabras y los números de la pregunta que ninguna regla de la gramática leyó (el relleno no cuenta). */
function sinLeer(toks: readonly Token[], usado: readonly boolean[]): string[] {
  const salida: string[] = [];
  toks.forEach((t, i) => {
    if (usado[i]) return;
    if (t.tipo === "palabra" && RELLENO.has(t.t)) return;
    if (!salida.includes(t.t)) salida.push(t.t);
  });
  return salida.slice(0, 8);
}

// --- la ventana en fechas ---------------------------------------------------------------------------------------------------

function resolverVentana(
  pend: VentanaPend,
  fecha: Info,
  respuestas: Respuestas,
  abiertas: PreguntaAbierta[],
): VentanaConsulta | null {
  const col = fecha.col;
  if (col.tipo !== "fecha") return null;
  const columna = col.nombre;
  if (col.maximo === null || col.fechas === null)
    return {
      columna,
      desde: null,
      hasta: null,
      descripcion: { clave: "rango", params: {} },
    };

  if (pend.tipo === "relativa") {
    const r =
      pend.n > 1
        ? rangoUltimos(col.maximo, pend.unidad, pend.n)
        : rangoDelPeriodo(col.maximo, pend.unidad, pend.desfase);
    const clave: DescripcionVentana["clave"] =
      pend.desfase > 0 ? "pasado" : pend.n > 1 ? "ultimos" : "ultimo";
    return {
      columna,
      desde: r.desde,
      hasta: r.hasta,
      descripcion: { clave, params: { unidad: pend.unidad, n: pend.n } },
    };
  }

  const aniosDelMes = (m: number): number[] => {
    const set = new Set<number>();
    for (const f of col.fechas!)
      if (f !== null && Number(f.slice(5, 7)) === m)
        set.add(Number(f.slice(0, 4)));
    return [...set].sort((a, b) => a - b);
  };
  const yMax = Number(col.maximo.slice(0, 4));
  const completar = (p: Punto): Punto => {
    if (p.tipo !== "mes" || p.y !== null) return p;
    const anios = aniosDelMes(p.m);
    if (anios.length === 1) return { tipo: "mes", y: anios[0]!, m: p.m };
    if (anios.length === 0) return { tipo: "mes", y: yMax, m: p.m };
    const id = `anio:${p.m}`;
    const r = respuestas[id];
    if (r !== undefined && anios.includes(Number(r)))
      return { tipo: "mes", y: Number(r), m: p.m };
    if (!abiertas.some((a) => a.id === id))
      abiertas.push({
        id,
        tipo: "anio",
        params: { mes: p.m },
        opciones: anios.map((a) => ({ valor: String(a), etiqueta: String(a) })),
      });
    return { tipo: "mes", y: yMax, m: p.m };
  };
  const inicio = (p: Punto): string =>
    p.tipo === "dia"
      ? p.iso
      : p.tipo === "anio"
        ? `${p.y}-01-01`
        : rangoDeMes(p.y!, p.m).desde;
  const fin = (p: Punto): string =>
    p.tipo === "dia"
      ? p.iso
      : p.tipo === "anio"
        ? `${p.y}-12-31`
        : rangoDeMes(p.y!, p.m).hasta;
  const d = pend.desde ? completar(pend.desde) : null;
  const h = pend.hasta ? completar(pend.hasta) : null;
  const desde = d ? inicio(d) : null;
  const hasta = h ? fin(h) : null;
  const en =
    pend.desde !== null && pend.hasta !== null && pend.desde === pend.hasta;
  const clave: DescripcionVentana["clave"] = en
    ? d!.tipo === "anio"
      ? "anio"
      : "mes"
    : desde !== null && hasta !== null
      ? "rango"
      : desde !== null
        ? "desde"
        : "hasta";
  return {
    columna,
    desde,
    hasta,
    descripcion: { clave, params: { desde: desde ?? "", hasta: hasta ?? "" } },
  };
}

// --- ejemplos con las columnas de la tabla ----------------------------------------------------------------------------------

/** Hasta tres preguntas de ejemplo armadas con los nombres de la tabla, que este mismo lector entiende. */
export function ejemplosDe(cat: Catalogo, idioma: "es" | "en"): string[] {
  const numericas = cat.columnas.filter((c) => c.tipo === "numero");
  const categoricas = cat.columnas.filter(
    (c): c is Extract<ColumnaCat, { tipo: "categoria" }> =>
      c.tipo === "categoria" &&
      !c.personal &&
      c.nDistintos >= 2 &&
      c.nDistintos <= 50,
  );
  const fecha = cat.columnas.find(
    (c) => c.tipo === "fecha" && c.fechas !== null && !c.ambigua,
  );
  const nombre = (c: ColumnaCat | undefined): string =>
    c ? c.nombre.replace(/_/g, " ") : "";
  const salida: string[] = [];
  const m = numericas[0];
  const g = categoricas[0];
  if (m && g)
    salida.push(
      idioma === "es"
        ? `${nombre(m)} por ${nombre(g)}`
        : `${nombre(m)} by ${nombre(g)}`,
    );
  if (m && fecha)
    salida.push(
      idioma === "es" ? `${nombre(m)} por mes` : `${nombre(m)} by month`,
    );
  if (g)
    salida.push(
      idioma === "es" ? `cuántos por ${nombre(g)}` : `how many by ${nombre(g)}`,
    );
  return salida.slice(0, 3);
}
