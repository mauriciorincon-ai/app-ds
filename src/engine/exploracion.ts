// S18: la exploración de la tabla cargada — cómo se reparte cada columna y qué columnas se mueven juntas. Pura y determinista:
// la misma tabla da lo mismo. Distribuciones (casillas de igual ancho en las numéricas, conteo en las categóricas), correlación
// de Pearson entre numéricas y V de Cramér entre categóricas. No elige ni cambia nada: el resumen escrito que la acompaña
// (src/lib/narration/exploracion.ts) se comprueba contra estos números antes de mostrarse.
import { columnValues, isNullToken, parseNumber, profileTable, type CsvTable } from "@/lib/ds/csv";
import { skewness } from "./eda";

/** Hasta cuántas columnas numéricas entran a la matriz (15 × 15 se lee; 40 × 40 no). La pantalla dice cuántas hay. */
export const COLUMNAS_MATRIZ_MAX = 15;
export const CASILLAS_MAX = 20;
export const CASILLAS_MIN = 5;
export const CATEGORIAS_MOSTRADAS = 8;
/** Una categórica entra a la asociación si tiene entre 2 y 20 categorías (con más, la tabla de contingencia no dice nada). */
export const CATEGORIAS_CRAMER_MAX = 20;
export const PARES_MINIMOS = 10;
export const PARES_CRAMER_MOSTRADOS = 10;
export const COLUMNAS_CRAMER_MAX = 15;

export type Casilla = { desde: number; hasta: number; cuenta: number };

export type DistribucionNumerica = {
  column: string;
  kind: "numeric";
  nulos: number;
  min: number;
  max: number;
  media: number;
  mediana: number;
  sesgo: number;
  casillas: Casilla[];
};

export type DistribucionCategorica = {
  column: string;
  kind: "categorical";
  nulos: number;
  distintas: number;
  mas: { valor: string; cuenta: number }[];
  otras: number;
};

export type Distribucion = DistribucionNumerica | DistribucionCategorica;

export type ParCramer = { a: string; b: string; v: number; n: number };

export type Exploracion = {
  filas: number;
  distribuciones: Distribucion[];
  totalNumericas: number;
  totalCategoricas: number;
  /** Las numéricas de la matriz (las primeras COLUMNAS_MATRIZ_MAX, en el orden de la tabla). */
  numericas: string[];
  /** Pearson entre ellas; `null` si hay menos de PARES_MINIMOS filas con las dos, o si una es constante. */
  matriz: (number | null)[][];
  /** Las asociaciones más fuertes entre categóricas, de mayor a menor. */
  cramer: ParCramer[];
};

const mediana = (ordenados: readonly number[]): number => {
  const m = ordenados.length >> 1;
  return ordenados.length % 2 === 1 ? ordenados[m]! : (ordenados[m - 1]! + ordenados[m]!) / 2;
};

function distribucionNumerica(column: string, celdas: readonly string[]): DistribucionNumerica {
  const valores = celdas.filter((c) => !isNullToken(c)).map((c) => parseNumber(c)!);
  const ordenados = [...valores].sort((a, b) => a - b);
  const min = ordenados[0]!;
  const max = ordenados[ordenados.length - 1]!;
  const n = valores.length;
  const casillas = Math.min(CASILLAS_MAX, Math.max(CASILLAS_MIN, Math.ceil(Math.log2(n) + 1)));
  const ancho = max > min ? (max - min) / casillas : 0;
  const lista: Casilla[] =
    ancho === 0
      ? [{ desde: min, hasta: max, cuenta: n }]
      : Array.from({ length: casillas }, (_, i) => ({
          desde: min + i * ancho,
          hasta: i === casillas - 1 ? max : min + (i + 1) * ancho,
          cuenta: 0,
        }));
  if (ancho > 0) for (const v of valores) lista[Math.min(casillas - 1, Math.floor((v - min) / ancho))]!.cuenta += 1;
  return {
    column,
    kind: "numeric",
    nulos: celdas.length - n,
    min,
    max,
    media: valores.reduce((a, b) => a + b, 0) / n,
    mediana: mediana(ordenados),
    sesgo: skewness(valores),
    casillas: lista,
  };
}

function distribucionCategorica(column: string, celdas: readonly string[]): DistribucionCategorica {
  const cuentas = new Map<string, number>();
  let presentes = 0;
  for (const c of celdas) {
    if (isNullToken(c)) continue;
    presentes += 1;
    const v = c.trim();
    cuentas.set(v, (cuentas.get(v) ?? 0) + 1);
  }
  // más frecuentes primero; los empates, por orden alfabético (determinista)
  const orden = [...cuentas.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const mas = orden.slice(0, CATEGORIAS_MOSTRADAS).map(([valor, cuenta]) => ({ valor, cuenta }));
  return {
    column,
    kind: "categorical",
    nulos: celdas.length - presentes,
    distintas: cuentas.size,
    mas,
    otras: presentes - mas.reduce((a, m) => a + m.cuenta, 0),
  };
}

/** Pearson entre dos columnas de números (NaN = vacío), con las filas que tienen las dos. Sumas desplazadas: estables. */
function pearson(x: readonly number[], y: readonly number[]): number | null {
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  let ox = 0;
  let oy = 0;
  for (let i = 0; i < x.length; i++) {
    const a = x[i]!;
    const b = y[i]!;
    if (Number.isNaN(a) || Number.isNaN(b)) continue;
    if (n === 0) {
      ox = a;
      oy = b;
    }
    const da = a - ox;
    const db = b - oy;
    n += 1;
    sx += da;
    sy += db;
    sxx += da * da;
    syy += db * db;
    sxy += da * db;
  }
  if (n < PARES_MINIMOS) return null;
  const vx = sxx - (sx * sx) / n;
  const vy = syy - (sy * sy) / n;
  if (vx <= 0 || vy <= 0) return null;
  return Math.max(-1, Math.min(1, (sxy - (sx * sy) / n) / Math.sqrt(vx * vy)));
}

/** V de Cramér entre dos columnas de texto, con las filas que tienen las dos. */
function cramer(a: readonly (string | null)[], b: readonly (string | null)[]): { v: number; n: number } | null {
  const filas = new Map<string, number>();
  const cols = new Map<string, number>();
  const celdas = new Map<string, number>();
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    const p = a[i];
    const q = b[i];
    if (p === null || q === null) continue;
    n += 1;
    filas.set(p!, (filas.get(p!) ?? 0) + 1);
    cols.set(q!, (cols.get(q!) ?? 0) + 1);
    const k = `${p}\u0000${q}`;
    celdas.set(k, (celdas.get(k) ?? 0) + 1);
  }
  const grado = Math.min(filas.size, cols.size) - 1;
  if (n < PARES_MINIMOS || grado < 1) return null;
  let chi2 = 0;
  for (const [p, fp] of filas)
    for (const [q, fq] of cols) {
      const esperado = (fp * fq) / n;
      const observado = celdas.get(`${p}\u0000${q}`) ?? 0;
      chi2 += (observado - esperado) ** 2 / esperado;
    }
  return { v: Math.min(1, Math.sqrt(chi2 / (n * grado))), n };
}

export function explorar(table: CsvTable): Exploracion {
  const perfiles = profileTable(table);
  const columnas = perfiles.map((perfil, i) => ({ perfil, celdas: columnValues(table, i) }));
  const distribuciones: Distribucion[] = [];
  for (const { perfil, celdas } of columnas) {
    if (perfil.kind === "numeric") {
      if (celdas.some((c) => !isNullToken(c))) distribuciones.push(distribucionNumerica(perfil.name, celdas));
    } else if (celdas.some((c) => !isNullToken(c))) {
      distribuciones.push(distribucionCategorica(perfil.name, celdas));
    }
  }

  const numericas = columnas.filter(({ perfil, celdas }) => perfil.kind === "numeric" && celdas.some((c) => !isNullToken(c)));
  const dentro = numericas.slice(0, COLUMNAS_MATRIZ_MAX);
  const vectores = dentro.map(({ celdas }) => celdas.map((c) => (isNullToken(c) ? NaN : parseNumber(c)!)));
  const matriz = vectores.map((x, i) => vectores.map((y, j) => (i === j ? 1 : pearson(x, y))));

  const categoricas = columnas
    .filter(({ perfil }) => perfil.kind === "categorical" && perfil.cardinality >= 2 && perfil.cardinality <= CATEGORIAS_CRAMER_MAX)
    .slice(0, COLUMNAS_CRAMER_MAX);
  const textos = categoricas.map(({ celdas }) => celdas.map((c) => (isNullToken(c) ? null : c.trim())));
  const pares: ParCramer[] = [];
  for (let i = 0; i < categoricas.length; i++)
    for (let j = i + 1; j < categoricas.length; j++) {
      const r = cramer(textos[i]!, textos[j]!);
      if (r) pares.push({ a: categoricas[i]!.perfil.name, b: categoricas[j]!.perfil.name, ...r });
    }
  pares.sort((p, q) => q.v - p.v || (p.a + p.b < q.a + q.b ? -1 : 1));

  return {
    filas: table.rows.length,
    distribuciones,
    totalNumericas: numericas.length,
    totalCategoricas: columnas.filter(({ perfil, celdas }) => perfil.kind === "categorical" && celdas.some((c) => !isNullToken(c))).length,
    numericas: dentro.map(({ perfil }) => perfil.name),
    matriz,
    cramer: pares.slice(0, PARES_CRAMER_MOSTRADOS),
  };
}
