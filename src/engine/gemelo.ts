// S20 (ADR 029): lo que decide TypeScript del gemelo sintético. Qué columnas viajan al worker (lo marcado como dato personal, el texto
// libre, los identificadores, las fechas, lo constante y lo vacío se quedan fuera y se NOMBRAN), el piso «real contra real» de las
// relaciones y el veredicto «se puede compartir · revisar · no compartir». Las medidas de las relaciones son las de la exploración
// (`relaciones`, S18): Pearson entre numéricas y V de Cramér entre categóricas. El veredicto se juzga contra lo que se parecen DOS
// MITADES REALES entre sí (una muestra ya difiere de otra muestra real por azar), con pisos fijos para que los datos grandes no pidan
// lo imposible. Los umbrales y su fuente están en el ADR 029.
import { relaciones } from "@/engine/exploracion";
import {
  columnValues,
  isNullToken,
  parseNumber,
  profileTable,
  type CsvTable,
} from "@/lib/ds/csv";
import { buildCsv } from "@/lib/scored-csv";
import type { SynthesizePayload, SynthesizeResult } from "@/workers/protocol";

export const SEMILLA_GEMELO = 42;
/** Filas mínimas de los datos reales (el worker las comprueba) y tope de filas (reales y sintéticas). */
export const GEMELO_FILAS_MIN = 20;
export const GEMELO_FILAS_MAX = 50_000;
export const GEMELO_SALIDA_MIN = 10;

export type MotivoFuera =
  | "personal"
  | "texto_libre"
  | "identificador"
  | "fecha"
  | "constante"
  | "vacia";
export type TipoColumna = "numeric" | "categorical";

export type PlanGemelo = {
  readonly incluidas: readonly {
    readonly name: string;
    readonly kind: TipoColumna;
  }[];
  readonly fuera: readonly {
    readonly name: string;
    readonly motivo: MotivoFuera;
  }[];
};

/** Una categórica con más categorías distintas que esto, y que son más de la mitad de las filas, es texto libre o un código. */
const TEXTO_LIBRE_DISTINTAS = 50;
const TEXTO_LIBRE_CUOTA = 0.5;
/** Un texto de más de este largo medio es texto libre aunque se repita. */
const TEXTO_LIBRE_LARGO = 40;
/** Una numérica entera con casi un valor distinto por fila, y que además cuenta (su rango cabe en ~1,2 veces las filas) o se llama como un id. */
const IDENTIFICADOR_CUOTA = 0.95;
const IDENTIFICADOR_RANGO = 1.2;
const NOMBRE_DE_ID = /(^|[_\s-])(id|uuid|folio|codigo|código|code|numero|número|dni|cedula|cédula)([_\s-]|$)/i;

/**
 * Qué columnas viajan. `personales` son los nombres que el aviso de datos personales (S18) marcó en la tabla cruda. Nada viaja «con
 * reservas»: lo que no es seguro para compartir se queda fuera y la pantalla lo dice.
 */
export function planGemelo(
  table: CsvTable,
  personales: readonly string[],
): PlanGemelo {
  const marcadas = new Set(personales);
  const perfiles = profileTable(table);
  const incluidas: { name: string; kind: TipoColumna }[] = [];
  const fuera: { name: string; motivo: MotivoFuera }[] = [];
  perfiles.forEach((perfil, i) => {
    const celdas = columnValues(table, i);
    const presentes = celdas
      .filter((c) => !isNullToken(c))
      .map((c) => c.trim());
    const quitar = (motivo: MotivoFuera) =>
      fuera.push({ name: perfil.name, motivo });
    if (marcadas.has(perfil.name)) return quitar("personal");
    if (presentes.length < 2) return quitar("vacia");
    if (perfil.looksLikeDate) return quitar("fecha");
    if (perfil.cardinality <= 1) return quitar("constante");
    if (perfil.kind === "numeric") {
      // un identificador numérico es un contador (1000, 1001, …) o se llama «id»/«código»: un monto o una edad con todos los valores
      // distintos NO lo es (el saneamiento de la app dice lo mismo: una numérica con valores distintos es una feature continua)
      const valores = presentes.map((c) => parseNumber(c));
      const enteros = valores.every((v) => v !== null && Number.isInteger(v));
      const rango = enteros
        ? Math.max(...(valores as number[])) - Math.min(...(valores as number[])) + 1
        : Infinity;
      if (
        enteros &&
        perfil.cardinality / presentes.length >= IDENTIFICADOR_CUOTA &&
        presentes.length >= GEMELO_FILAS_MIN &&
        (rango <= IDENTIFICADOR_RANGO * presentes.length || NOMBRE_DE_ID.test(perfil.name))
      )
        return quitar("identificador");
      return void incluidas.push({ name: perfil.name, kind: "numeric" });
    }
    // un texto largo es texto libre aunque cada fila sea distinta; uno corto y todo distinto es un identificador
    const largo =
      presentes.reduce((a, c) => a + c.length, 0) / presentes.length;
    if (largo <= TEXTO_LIBRE_LARGO && perfil.cardinality === presentes.length)
      return quitar("identificador");
    if (
      largo > TEXTO_LIBRE_LARGO ||
      (perfil.cardinality > TEXTO_LIBRE_DISTINTAS &&
        perfil.cardinality / presentes.length > TEXTO_LIBRE_CUOTA)
    )
      return quitar("texto_libre");
    incluidas.push({ name: perfil.name, kind: "categorical" });
  });
  return { incluidas, fuera };
}

/** Lo que viaja al worker: solo las columnas del plan, con su tipo. */
export function envioGemelo(
  table: CsvTable,
  plan: PlanGemelo,
  nRows: number,
): SynthesizePayload {
  const indices = plan.incluidas.map((c) => table.headers.indexOf(c.name));
  return {
    headers: plan.incluidas.map((c) => c.name),
    kinds: plan.incluidas.map((c) => c.kind),
    rows: table.rows.map((fila) => indices.map((i) => fila[i] ?? "")),
    n_rows: nRows,
    seed: SEMILLA_GEMELO,
  };
}

/** El CSV del gemelo (con la protección contra fórmulas de toda descarga de la app). */
export const csvDelGemelo = (
  r: Pick<SynthesizeResult, "headers" | "rows">,
): string => buildCsv(r.headers, r.rows);

// --- los niveles ----------------------------------------------------------------------------------------------------------

export type Nivel = "bien" | "revisar" | "mal";

/** Pisos fijos: con datos grandes dos mitades reales casi no difieren, y exigir menos que esto sería pedir lo imposible. */
export const COLUMNAS_PISO_MIN = 0.03;
export const RELACIONES_PISO_MIN = 0.05;
/** Hasta cuántas veces el piso se llama «bien» y «revisar». */
export const RAZON_BIEN = 1.25;
export const RAZON_REVISAR = 2;
/** La cercanía: la mediana sintética frente a la real (menos que esto es copiar) y la parte de filas más cerca que el 5 % más cercano de las reales. */
export const CERCANIA_RAZON_BIEN = 0.8;
export const CERCANIA_RAZON_MAL = 0.5;
export const CERCANIA_BAJO_BIEN = 0.15;
export const CERCANIA_BAJO_MAL = 0.25;
/** El piso de las relaciones se promedia en esta cantidad de particiones sembradas, con a lo más estas filas por partición. */
export const PISO_PARTICIONES = 6;
export const PISO_FILAS_MAX = 4000;

export function nivelPorRazon(
  valor: number,
  piso: number,
  pisoMinimo: number,
): Nivel {
  const razon = valor / Math.max(piso, pisoMinimo);
  return razon <= RAZON_BIEN
    ? "bien"
    : razon <= RAZON_REVISAR
      ? "revisar"
      : "mal";
}

const peor = (...niveles: Nivel[]): Nivel =>
  niveles.includes("mal")
    ? "mal"
    : niveles.includes("revisar")
      ? "revisar"
      : "bien";

const media = (v: readonly number[]): number =>
  v.length === 0 ? 0 : v.reduce((a, b) => a + b, 0) / v.length;

export type ResumenColumnas = {
  readonly media: number;
  readonly piso: number;
  readonly maxima: number;
  readonly peorColumna: string;
  readonly nivel: Nivel;
};

export function resumenColumnas(
  columns: SynthesizeResult["columns"],
): ResumenColumnas {
  const m = media(columns.map((c) => c.value));
  const piso = media(columns.map((c) => c.floor));
  const peorCol = columns.reduce((a, b) => (b.value > a.value ? b : a));
  return {
    media: m,
    piso,
    maxima: peorCol.value,
    peorColumna: peorCol.name,
    nivel: nivelPorRazon(m, piso, COLUMNAS_PISO_MIN),
  };
}

export type Cercania = {
  readonly razon: number;
  readonly bajoP5: number;
  readonly nivel: Nivel;
};

export function nivelCercania(p: SynthesizeResult["proximity"]): Cercania {
  // con una mediana real de 0 (muchas filas repetidas) la razón no dice nada: se toma como 1 si la sintética tampoco se acerca más
  const razon = p.median_real > 0 ? p.median_syn / p.median_real : 1;
  const nivel: Nivel =
    razon < CERCANIA_RAZON_MAL || p.share_below > CERCANIA_BAJO_MAL
      ? "mal"
      : razon < CERCANIA_RAZON_BIEN || p.share_below > CERCANIA_BAJO_BIEN
        ? "revisar"
        : "bien";
  return { razon, bajoP5: p.share_below, nivel };
}

// --- las relaciones ---------------------------------------------------------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Una permutación sembrada de 0..n−1 (Fisher–Yates). */
export function permutacion(n: number, semilla: number): number[] {
  const orden = Array.from({ length: n }, (_, i) => i);
  const azar = mulberry32(semilla);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [orden[i], orden[j]] = [orden[j]!, orden[i]!];
  }
  return orden;
}

type Rel = ReturnType<typeof relaciones>;

/** Las diferencias absolutas entre dos lecturas de las relaciones, pareja por pareja (la que una lectura no puede medir cuenta como 0). */
function diferencias(a: Rel, b: Rel): { pearson: number[]; cramer: number[] } {
  const pearson: number[] = [];
  const indiceB = new Map(b.numericas.map((n, i) => [n, i]));
  for (let i = 0; i < a.numericas.length; i++)
    for (let j = i + 1; j < a.numericas.length; j++) {
      const bi = indiceB.get(a.numericas[i]!);
      const bj = indiceB.get(a.numericas[j]!);
      const ra = a.matriz[i]![j] ?? 0;
      const rb =
        bi === undefined || bj === undefined ? 0 : (b.matriz[bi]![bj] ?? 0);
      pearson.push(Math.abs(ra - rb));
    }
  const vb = new Map(b.cramer.map((p) => [`${p.a}\u0000${p.b}`, p.v]));
  const cramer = a.cramer.map((p) =>
    Math.abs(p.v - (vb.get(`${p.a}\u0000${p.b}`) ?? 0)),
  );
  return { pearson, cramer };
}

export type LecturaRelaciones = {
  /** Cuántas parejas se compararon (numéricas, categóricas). */
  readonly pares: { readonly pearson: number; readonly cramer: number };
  /** La diferencia media entre las relaciones de los datos y las del gemelo, y lo que difieren dos mitades reales. */
  readonly pearson: { readonly delta: number; readonly piso: number } | null;
  readonly cramer: { readonly delta: number; readonly piso: number } | null;
  readonly nivel: Nivel;
};

/** Compara las relaciones de los datos con las de su gemelo, contra el piso de dos mitades reales (promedio de varias particiones sembradas). */
export function leerRelaciones(
  real: CsvTable,
  sintetico: CsvTable,
): LecturaRelaciones {
  const relReal = relaciones(real);
  const d = diferencias(relReal, relaciones(sintetico));
  // el piso: dos mitades reales
  const n = real.rows.length;
  const muestra =
    n > PISO_FILAS_MAX
      ? permutacion(n, 1).slice(0, PISO_FILAS_MAX)
      : Array.from({ length: n }, (_, i) => i);
  const pisosP: number[] = [];
  const pisosC: number[] = [];
  for (let k = 0; k < PISO_PARTICIONES; k++) {
    const orden = permutacion(muestra.length, 100 + k).map((i) => muestra[i]!);
    const mitad = orden.length >> 1;
    const tabla = (idx: number[]): CsvTable => ({
      headers: real.headers,
      rows: idx.map((i) => real.rows[i]!),
    });
    const f = diferencias(
      relaciones(tabla(orden.slice(0, mitad))),
      relaciones(tabla(orden.slice(mitad))),
    );
    if (f.pearson.length) pisosP.push(media(f.pearson));
    if (f.cramer.length) pisosC.push(media(f.cramer));
  }
  const pearson = d.pearson.length
    ? { delta: media(d.pearson), piso: media(pisosP) }
    : null;
  const cramer = d.cramer.length
    ? { delta: media(d.cramer), piso: media(pisosC) }
    : null;
  const niveles = [pearson, cramer].flatMap((x) =>
    x ? [nivelPorRazon(x.delta, x.piso, RELACIONES_PISO_MIN)] : [],
  );
  return {
    pares: { pearson: d.pearson.length, cramer: d.cramer.length },
    pearson,
    cramer,
    nivel: peor(...niveles),
  };
}

// --- el veredicto -----------------------------------------------------------------------------------------------------------

export type VeredictoGemelo = "compartir" | "revisar" | "no_compartir";
export type RazonGemelo = "copias" | "cercania" | "columnas" | "relaciones";

export type InformeGemelo = {
  readonly veredicto: VeredictoGemelo;
  /** Qué lo explica: lo que no está «bien». Vacío si se puede compartir. */
  readonly razones: readonly RazonGemelo[];
  readonly columnas: ResumenColumnas;
  readonly relaciones: LecturaRelaciones;
  readonly cercania: Cercania;
  readonly copias: number;
};

/**
 * «No compartir» es una cuestión de privacidad: quedó una copia exacta, o las filas sintéticas están más cerca de las reales de lo que las
 * reales lo están entre sí. «Revisar» es de fidelidad (o de una cercanía dudosa): el gemelo no se parece lo bastante. Lo demás, «se puede
 * compartir».
 */
export function veredictoGemelo(
  r: Pick<SynthesizeResult, "columns" | "proximity" | "copies">,
  rel: LecturaRelaciones,
): InformeGemelo {
  const columnas = resumenColumnas(r.columns);
  const cercania = nivelCercania(r.proximity);
  const razones: RazonGemelo[] = [];
  if (r.copies > 0) razones.push("copias");
  if (cercania.nivel !== "bien") razones.push("cercania");
  if (columnas.nivel !== "bien") razones.push("columnas");
  if (rel.nivel !== "bien") razones.push("relaciones");
  const veredicto: VeredictoGemelo =
    r.copies > 0 || cercania.nivel === "mal"
      ? "no_compartir"
      : razones.length > 0
        ? "revisar"
        : "compartir";
  return {
    veredicto,
    razones,
    columnas,
    relaciones: rel,
    cercania,
    copias: r.copies,
  };
}
