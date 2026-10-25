// S18: el resumen escrito de la exploración, y su comprobación contra los números. El texto se arma de lo que `explorar` calculó;
// la comprobación NO usa ese cálculo: recomputa desde la tabla con cuentas directas (otra implementación de Pearson y de V de
// Cramér) y exige que el texto diga esas cifras y ninguna otra. Si no cuadra, el panel no enseña el resumen y deja las tablas.
import { isNullToken, columnValues, parseNumber, profileTable, type CsvTable } from "@/lib/ds/csv";
import { skewness } from "@/engine/eda";
import {
  CATEGORIAS_CRAMER_MAX,
  COLUMNAS_CRAMER_MAX,
  COLUMNAS_MATRIZ_MAX,
  PARES_MINIMOS,
  type Exploracion,
} from "@/engine/exploracion";
import type { Locale } from "@/i18n/config";
import { textoPropio } from "@/i18n/textos-etapa";
import { thousands } from "@/lib/quantity";
import { verificarTexto, type Esperado, type Fallo } from "./cifras";
import { TEXTOS_EXPLORACION } from "./textos-exploracion";

/** Una columna numérica está «muy sesgada» con |sesgo| ≥ 1. */
export const SESGO_MUCHO = 1;
/** «Muchos vacíos»: más del 20 % de las filas. */
export const VACIAS_MUCHAS = 0.2;
/** Una pareja «se mueve junta» con |r| ≥ 0.5; una asociación entre categorías es notable con V ≥ 0.3. */
export const PAREJA_FUERTE = 0.5;
export const CRAMER_FUERTE = 0.3;
/** Cuántas columnas se nombran en cada lista del resumen. */
export const LISTA_MAX = 3;

const tr = (locale: Locale, clave: string, params?: Record<string, string | number>) =>
  textoPropio(TEXTOS_EXPLORACION, locale, clave, params) ?? clave;

/** Lo que el resumen dice, en cifras: lo comparten el que lo arma (desde `explorar`) y el que lo comprueba (desde la tabla). */
export type Hechos = {
  filas: number;
  numericas: number;
  categoricas: number;
  sesgadas: { column: string; sesgo: number }[];
  vacias: { column: string; pct: number }[];
  pareja: { a: string; b: string; r: number } | null;
  cramer: { a: string; b: string; v: number } | null;
};

const dec = (v: number, d: number) => v.toFixed(d);

/** Los hechos, desde lo que calculó `explorar`. */
export function hechosDe(e: Exploracion, nulosPorColumna: ReadonlyMap<string, number>): Hechos {
  const sesgadas = e.distribuciones
    .flatMap((d) => (d.kind === "numeric" && Math.abs(d.sesgo) >= SESGO_MUCHO ? [{ column: d.column, sesgo: d.sesgo }] : []))
    .sort((p, q) => Math.abs(q.sesgo) - Math.abs(p.sesgo) || (p.column < q.column ? -1 : 1))
    .slice(0, LISTA_MAX);
  const vacias = [...nulosPorColumna.entries()]
    .map(([column, nulos]) => ({ column, pct: nulos / e.filas }))
    .filter((c) => c.pct > VACIAS_MUCHAS)
    .sort((p, q) => q.pct - p.pct || (p.column < q.column ? -1 : 1))
    .slice(0, LISTA_MAX)
    .map((c) => ({ column: c.column, pct: Math.round(c.pct * 100) }));
  let pareja: Hechos["pareja"] = null;
  for (let i = 0; i < e.numericas.length; i++)
    for (let j = i + 1; j < e.numericas.length; j++) {
      const r = e.matriz[i]![j];
      if (r === null || r === undefined || Math.abs(r) < PAREJA_FUERTE) continue;
      if (!pareja || Math.abs(r) > Math.abs(pareja.r)) pareja = { a: e.numericas[i]!, b: e.numericas[j]!, r };
    }
  const mejorCramer = e.cramer.find((c) => c.v >= CRAMER_FUERTE);
  return {
    filas: e.filas,
    numericas: e.totalNumericas,
    categoricas: e.totalCategoricas,
    sesgadas,
    vacias,
    pareja,
    cramer: mejorCramer ? { a: mejorCramer.a, b: mejorCramer.b, v: mejorCramer.v } : null,
  };
}

/** El texto del resumen, de los hechos. */
export function resumenDe(h: Hechos, locale: Locale): string {
  const partes = [
    tr(locale, "exploracion.resumen.columnas", {
      filas: thousands(h.filas),
      numericas: h.numericas,
      categoricas: h.categoricas,
    }),
    h.sesgadas.length > 0
      ? tr(locale, "exploracion.resumen.sesgadas", {
          lista: h.sesgadas
            .map((s) => tr(locale, "exploracion.resumen.sesgada", { column: s.column, sesgo: dec(s.sesgo, 1) }))
            .join(", "),
        })
      : tr(locale, "exploracion.resumen.sin_sesgadas"),
  ];
  if (h.vacias.length > 0)
    partes.push(
      tr(locale, "exploracion.resumen.vacias", {
        lista: h.vacias
          .map((v) => tr(locale, "exploracion.resumen.vacia", { column: v.column, pct: v.pct }))
          .join(", "),
      }),
    );
  partes.push(
    h.pareja
      ? tr(locale, "exploracion.resumen.pareja", {
          par: tr(locale, "exploracion.resumen.par", { a: h.pareja.a, b: h.pareja.b }),
          r: dec(h.pareja.r, 2),
          sentido: tr(locale, `exploracion.resumen.sentido.${h.pareja.r > 0 ? "junto" : "contrario"}`),
        })
      : tr(locale, "exploracion.resumen.sin_pareja"),
  );
  if (h.cramer)
    partes.push(
      tr(locale, "exploracion.resumen.cramer", {
        par: tr(locale, "exploracion.resumen.par_cramer", { a: h.cramer.a, b: h.cramer.b }),
        v: dec(h.cramer.v, 2),
      }),
    );
  partes.push(tr(locale, "exploracion.resumen.aviso"));
  return partes.join(" ");
}

// ---------- la comprobación: otras cuentas, desde la tabla ----------

/** Pearson por la fórmula directa (dos pasadas), con las filas que tienen las dos. */
function pearsonDirecto(x: readonly number[], y: readonly number[]): number | null {
  const pares = x.flatMap((a, i) => (Number.isNaN(a) || Number.isNaN(y[i]!) ? [] : [[a, y[i]!] as const]));
  if (pares.length < PARES_MINIMOS) return null;
  const mx = pares.reduce((s, [a]) => s + a, 0) / pares.length;
  const my = pares.reduce((s, [, b]) => s + b, 0) / pares.length;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (const [a, b] of pares) {
    num += (a - mx) * (b - my);
    dx += (a - mx) ** 2;
    dy += (b - my) ** 2;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : null;
}

/** V de Cramér por la forma algebraica V² = (Σ nᵢⱼ² / (nᵢ· n·ⱼ) − 1) / min(r−1, c−1). */
function cramerDirecto(a: readonly (string | null)[], b: readonly (string | null)[]): number | null {
  const filas = new Map<string, number>();
  const cols = new Map<string, number>();
  const celdas = new Map<string, number>();
  let n = 0;
  a.forEach((p, i) => {
    const q = b[i]!;
    if (p === null || q === null) return;
    n += 1;
    filas.set(p, (filas.get(p) ?? 0) + 1);
    cols.set(q, (cols.get(q) ?? 0) + 1);
    celdas.set(`${p}\u0001${q}`, (celdas.get(`${p}\u0001${q}`) ?? 0) + 1);
  });
  const grado = Math.min(filas.size, cols.size) - 1;
  if (n < PARES_MINIMOS || grado < 1) return null;
  let suma = 0;
  for (const [llave, nij] of celdas) {
    const [p, q] = llave.split("\u0001") as [string, string];
    suma += (nij * nij) / (filas.get(p)! * cols.get(q)!);
  }
  return Math.sqrt(Math.max(0, (suma - 1) / grado));
}

/** Los hechos, recomputados desde la tabla con otras cuentas que `explorar`. */
export function hechosDirectos(table: CsvTable): Hechos {
  const filas = table.rows.length;
  const perfiles = profileTable(table);
  const columnas = perfiles.map((perfil, i) => ({ perfil, celdas: columnValues(table, i) }));
  const conDatos = columnas.filter(({ celdas }) => celdas.some((c) => !isNullToken(c)));
  const numericas = conDatos.filter(({ perfil }) => perfil.kind === "numeric");
  const categoricas = conDatos.filter(({ perfil }) => perfil.kind === "categorical");

  const sesgadas = numericas
    .map(({ perfil, celdas }) => ({
      column: perfil.name,
      sesgo: skewness(celdas.filter((c) => !isNullToken(c)).map((c) => parseNumber(c)!)),
    }))
    .filter((s) => Math.abs(s.sesgo) >= SESGO_MUCHO)
    .sort((p, q) => Math.abs(q.sesgo) - Math.abs(p.sesgo) || (p.column < q.column ? -1 : 1))
    .slice(0, LISTA_MAX);

  const vacias = columnas
    .map(({ perfil, celdas }) => ({ column: perfil.name, pct: celdas.filter((c) => isNullToken(c)).length / filas }))
    .filter((c) => c.pct > VACIAS_MUCHAS)
    .sort((p, q) => q.pct - p.pct || (p.column < q.column ? -1 : 1))
    .slice(0, LISTA_MAX)
    .map((c) => ({ column: c.column, pct: Math.round(c.pct * 100) }));

  const dentro = numericas.slice(0, COLUMNAS_MATRIZ_MAX);
  const vectores = dentro.map(({ celdas }) => celdas.map((c) => (isNullToken(c) ? NaN : parseNumber(c)!)));
  let pareja: Hechos["pareja"] = null;
  for (let i = 0; i < dentro.length; i++)
    for (let j = i + 1; j < dentro.length; j++) {
      const r = pearsonDirecto(vectores[i]!, vectores[j]!);
      if (r === null || Math.abs(r) < PAREJA_FUERTE) continue;
      if (!pareja || Math.abs(r) > Math.abs(pareja.r))
        pareja = { a: dentro[i]!.perfil.name, b: dentro[j]!.perfil.name, r };
    }

  const aptas = categoricas
    .filter(({ perfil }) => perfil.cardinality >= 2 && perfil.cardinality <= CATEGORIAS_CRAMER_MAX)
    .slice(0, COLUMNAS_CRAMER_MAX);
  const textos = aptas.map(({ celdas }) => celdas.map((c) => (isNullToken(c) ? null : c.trim())));
  let cramer: Hechos["cramer"] = null;
  const candidatos: { a: string; b: string; v: number }[] = [];
  for (let i = 0; i < aptas.length; i++)
    for (let j = i + 1; j < aptas.length; j++) {
      const v = cramerDirecto(textos[i]!, textos[j]!);
      if (v !== null) candidatos.push({ a: aptas[i]!.perfil.name, b: aptas[j]!.perfil.name, v });
    }
  candidatos.sort((p, q) => q.v - p.v || (p.a + p.b < q.a + q.b ? -1 : 1));
  const mejor = candidatos.find((c) => c.v >= CRAMER_FUERTE);
  if (mejor) cramer = mejor;

  return {
    filas,
    numericas: numericas.length,
    categoricas: categoricas.length,
    sesgadas,
    vacias,
    pareja,
    cramer,
  };
}

/** Lo que el texto debe decir, de los hechos (las cifras con los decimales con que se escriben). */
export function esperadoDeHechos(h: Hechos, locale: Locale): Esperado {
  const nombres = [
    ...h.sesgadas.map((s) => s.column),
    ...h.vacias.map((v) => v.column),
    ...(h.pareja ? [h.pareja.a, h.pareja.b] : []),
    ...(h.cramer ? [h.cramer.a, h.cramer.b] : []),
  ];
  return {
    requeridas: [
      { clave: "filas", valor: h.filas, decimales: 0 },
      { clave: "numericas", valor: h.numericas, decimales: 0 },
      { clave: "categoricas", valor: h.categoricas, decimales: 0 },
      ...h.sesgadas.map((s) => ({ clave: `sesgo:${s.column}`, valor: Number(dec(Math.abs(s.sesgo), 1)), decimales: 1 })),
      ...h.vacias.map((v) => ({ clave: `vacias:${v.column}`, valor: v.pct, decimales: 0 })),
      ...(h.pareja ? [{ clave: "pareja", valor: Number(dec(Math.abs(h.pareja.r), 2)), decimales: 2 }] : []),
      ...(h.cramer ? [{ clave: "cramer", valor: Number(dec(h.cramer.v, 2)), decimales: 2 }] : []),
    ],
    nombres,
    // los dos nombres de cada pareja, tal como el texto los junta (en el idioma del texto)
    frases: [
      ...(h.pareja
        ? [{ clave: "pareja:columnas", texto: tr(locale, "exploracion.resumen.par", { a: h.pareja.a, b: h.pareja.b }) }]
        : []),
      ...(h.cramer
        ? [{ clave: "cramer:columnas", texto: tr(locale, "exploracion.resumen.par_cramer", { a: h.cramer.a, b: h.cramer.b }) }]
        : []),
    ],
  };
}

export type Resumen = { texto: string | null; verificado: boolean; fallos: readonly Fallo[] };

/**
 * El resumen listo para mostrar: se arma con lo que calculó `explorar` y se comprueba contra una recomputación directa de
 * la tabla. Si no cuadra, `texto` es `null` y el panel enseña solo las tablas.
 */
export function resumenVerificado(
  e: Exploracion,
  table: CsvTable,
  locale: Locale,
  candidata?: string,
): Resumen {
  const nulos = new Map(e.distribuciones.map((d) => [d.column, d.nulos] as const));
  // las columnas totalmente vacías no tienen distribución: cuentan sus vacíos igual
  table.headers.forEach((h, i) => {
    if (!nulos.has(h)) nulos.set(h, columnValues(table, i).filter((c) => isNullToken(c)).length);
  });
  const texto = candidata ?? resumenDe(hechosDe(e, nulos), locale);
  const esperado = esperadoDeHechos(hechosDirectos(table), locale);
  const fallos = verificarTexto(texto, esperado);
  return fallos.length === 0
    ? { texto, verificado: true, fallos }
    : { texto: null, verificado: false, fallos };
}
