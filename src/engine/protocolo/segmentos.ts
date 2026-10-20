// Protocolo DS (S13), etapa 8 — EL PROMEDIO ESCONDE A QUIEN PEOR LE VA. La prueba se corta en segmentos
// que se leen solos: el periodo (por mes, o por trimestre si la prueba pasa de 12 meses) cuando la etapa 2
// registró una fecha; cada columna de categorías en «usar» que en la prueba tenga de 2 a 8 valores; y cada
// columna numérica en «usar» por cuartiles, con los cortes del ENTRENAMIENTO (los segmentos se definen sin
// mirar la prueba). Un segmento chico miente: se exige un soporte mínimo (filas y, con dos clases, casos de
// la clase menos frecuente). Lo que no alcanza se marca «sin soporte», no se esconde, y nunca es el peor.
// Los umbrales son una convención del programa, no una prueba estadística.
import { byCodePoint } from "@/engine/tarea";
import type { CsvTable } from "@/lib/ds/csv";
import { vistaDe } from "./etapa5";
import type { Diseno } from "./particion";
import { cuantilEmpirico } from "./tabla";

export const SOPORTE_FILAS = 10;
export const SOPORTE_CASOS = 3;
export const NIVELES_MIN = 2;
export const NIVELES_MAX = 8;
export const MESES_MAX = 12;

export type TipoSegmento = "periodo" | "categoria" | "tramo";

export type Segmento = {
  /** «p:2025-09», «c:<columna>=<valor>» o «q:<columna>#<tramo>»: la clave del cuaderno. */
  readonly id: string;
  readonly tipo: TipoSegmento;
  readonly columna: string | null;
  /** El periodo o el valor de la categoría. */
  readonly valor: string | null;
  /** Numérica: el tramo (1, 2…) y sus cortes del entrenamiento (`null` en el extremo abierto). */
  readonly tramo: number | null;
  readonly desde: number | null;
  readonly hasta: number | null;
  /** Las filas de la prueba que caen en el segmento (índices de la tabla). */
  readonly filas: readonly number[];
};

function periodos(d: Diseno, prueba: readonly number[]): Segmento[] {
  if (!d.fechas) return [];
  const mes = (f: number) => d.fechas![f]?.slice(0, 7) ?? null;
  const meses = new Set(prueba.map(mes).filter((m): m is string => m !== null));
  const etiqueta =
    meses.size > MESES_MAX
      ? (f: number) => {
          const m = mes(f);
          return m === null
            ? null
            : `${m.slice(0, 4)}-T${Math.ceil(Number(m.slice(5, 7)) / 3)}`;
        }
      : mes;
  return agrupar(prueba, etiqueta).map(([valor, filas]) => ({
    id: `p:${valor}`,
    tipo: "periodo",
    columna: null,
    valor,
    tramo: null,
    desde: null,
    hasta: null,
    filas,
  }));
}

/** Las filas por clave, en orden de clave; las filas sin clave no entran a ningún segmento. */
function agrupar(
  filas: readonly number[],
  clave: (f: number) => string | null,
): [string, number[]][] {
  const grupos = new Map<string, number[]>();
  for (const f of filas) {
    const k = clave(f);
    if (k === null) continue;
    const g = grupos.get(k);
    if (g) g.push(f);
    else grupos.set(k, [f]);
  }
  return [...grupos].sort(([a], [b]) => byCodePoint(a, b));
}

function categorias(
  tabla: CsvTable,
  prueba: readonly number[],
  columna: string,
): Segmento[] {
  const vista = vistaDe(tabla, columna);
  if (!vista || vista.tipo !== "texto") return [];
  const grupos = agrupar(prueba, (f) => vista.valores[f] ?? null);
  if (grupos.length < NIVELES_MIN || grupos.length > NIVELES_MAX) return [];
  return grupos.map(([valor, filas]) => ({
    id: `c:${columna}=${valor}`,
    tipo: "categoria",
    columna,
    valor,
    tramo: null,
    desde: null,
    hasta: null,
    filas,
  }));
}

function cuartiles(
  tabla: CsvTable,
  entrenamiento: readonly number[],
  prueba: readonly number[],
  columna: string,
): Segmento[] {
  const vista = vistaDe(tabla, columna);
  if (!vista || vista.tipo !== "numero") return [];
  const valores = vista.valores;
  const ordenados = entrenamiento
    .map((f) => valores[f])
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
  if (ordenados.length < 4) return [];
  const cortes = [
    ...new Set([0.25, 0.5, 0.75].map((q) => cuantilEmpirico(ordenados, q))),
  ];
  const tramoDe = (v: number) => 1 + cortes.filter((c) => v > c).length;
  const grupos = agrupar(prueba, (f) => {
    const v = valores[f];
    return v == null ? null : String(tramoDe(v));
  }).sort(([a], [b]) => Number(a) - Number(b));
  if (grupos.length < 2) return [];
  return grupos.map(([t, filas]) => {
    const tramo = Number(t);
    return {
      id: `q:${columna}#${tramo}`,
      tipo: "tramo",
      columna,
      valor: null,
      tramo,
      desde: tramo === 1 ? null : cortes[tramo - 2]!,
      hasta: tramo > cortes.length ? null : cortes[tramo - 1]!,
      filas,
    };
  });
}

/** Los segmentos de la prueba, en un orden fijo: periodo, categorías y numéricas, cada una en su orden. */
export function segmentosDe(
  tabla: CsvTable,
  d: Diseno,
  entrenamiento: readonly number[],
  prueba: readonly number[],
  numericas: readonly string[],
  categoricas: readonly string[],
): Segmento[] {
  return [
    ...periodos(d, prueba),
    ...categoricas.flatMap((c) => categorias(tabla, prueba, c)),
    ...numericas.flatMap((c) => cuartiles(tabla, entrenamiento, prueba, c)),
  ];
}

/** Dos clases: la menos frecuente en la prueba (en un empate, la de «hay que actuar»). */
export function claseRaraDe(
  d: Diseno,
  prueba: readonly number[],
): string | null {
  if (!d.clases || d.positivo === null) return null;
  let positivos = 0;
  for (const f of prueba) if (d.clases[f] === d.positivo) positivos++;
  const otra = prueba
    .map((f) => d.clases![f])
    .find((c): c is string => c != null && c !== d.positivo);
  if (otra === undefined || positivos <= prueba.length - positivos)
    return d.positivo;
  return otra;
}

/** Cuántos casos de la clase rara caen en el segmento (`null` si no hay clase rara: no es binaria). */
export function casosDe(
  seg: Segmento,
  d: Diseno,
  claseRara: string | null,
): number | null {
  if (claseRara === null || !d.clases) return null;
  return seg.filas.filter((f) => d.clases![f] === claseRara).length;
}

export const conSoporte = (n: number, casos: number | null) =>
  n >= SOPORTE_FILAS && (casos === null || casos >= SOPORTE_CASOS);
