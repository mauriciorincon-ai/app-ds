// Protocolo DS (S15, etapa 10): la REFERENCIA DE DERIVA del plan de vigilancia. Para cada columna que usa
// el modelo (las de la liga de la etapa 7), cómo se reparten sus valores en el ENTRENAMIENTO de la
// partición sellada (etapa 6), en las mismas casillas que mide la deriva de la etapa 4 (deriva.ts):
// quintiles en una numérica; sus categorías más frecuentes, «otras» y «vacío» en una de texto. Un CSV
// nuevo se compara contra ella con el PSI (chequeo-deriva.ts).
//  · Solo agregados (regla dura 2): los cortes van redondeados a REF_CIFRAS cifras significativas y las
//    cuentas se hacen con esos cortes ya redondeados (así un CSV nuevo cae en las mismas casillas). Una
//    categoría se nombra solo si junta al menos REF_SOPORTE_MIN filas; la que no, va a «otras». Ninguna
//    fila y ningún valor individual.
//  · La prueba no entra: solo las filas de entrenamiento.
// Puro y determinista. Cada referencia se guarda en el cuaderno como un JSON canónico (un `Valor` es un
// texto, una lista de textos o un mapa de números; una referencia no cabe en un mapa plano sin inventar
// separadores dentro de nombres de columna).
import type { CsvTable } from "@/lib/ds/csv";
import { byCodePoint } from "@/engine/tarea";
import { DERIVA_CATEGORIAS, DERIVA_CUANTILES, cortesCuantiles } from "./deriva";
import { valoresDe, vistaColumna } from "./tabla";

/** Cifras significativas de un corte guardado: lo bastante para la casilla, no para reconocer una fila. */
export const REF_CIFRAS = 3;
/** Una categoría se nombra en la referencia solo con al menos estas filas (la misma convención que la fuga). */
export const REF_SOPORTE_MIN = 5;

export type RefColumna =
  | {
      readonly columna: string;
      readonly tipo: "numero";
      /** Estrictamente crecientes; a lo más DERIVA_CUANTILES − 1. */
      readonly cortes: readonly number[];
      /** Una por casilla: cortes.length + 1 de valores y la última, «vacío». */
      readonly cuentas: readonly number[];
    }
  | {
      readonly columna: string;
      readonly tipo: "texto";
      /** Las más frecuentes con soporte, a lo más DERIVA_CATEGORIAS. */
      readonly categorias: readonly string[];
      /** Una por categoría, luego «otras» y «vacío». */
      readonly cuentas: readonly number[];
    };

const redondear = (x: number) => Number(x.toPrecision(REF_CIFRAS));

/** Los cortes de los quintiles, redondeados y sin repetidos (estrictamente crecientes). */
export function cortesRedondeados(ordenados: readonly number[]): number[] {
  const cortes: number[] = [];
  for (const c of cortesCuantiles(ordenados).map(redondear))
    if (cortes.length === 0 || c > cortes[cortes.length - 1]!) cortes.push(c);
  return cortes;
}

/** Las cuentas de una numérica en sus casillas: cuántos cortes supera cada valor; el vacío, al final. */
export function contarNumeros(
  cortes: readonly number[],
  valores: readonly (number | null)[],
): number[] {
  const cuenta = new Array<number>(cortes.length + 2).fill(0);
  for (const v of valores)
    cuenta[v === null ? cortes.length + 1 : cortes.filter((c) => v > c).length]! += 1;
  return cuenta;
}

/** Las cuentas de una columna de texto: cada categoría nombrada, luego «otras» y «vacío». */
export function contarTextos(
  categorias: readonly string[],
  valores: readonly (string | null)[],
): number[] {
  const posicion = new Map(categorias.map((c, k) => [c, k]));
  const cuenta = new Array<number>(categorias.length + 2).fill(0);
  for (const v of valores)
    cuenta[
      v === null ? categorias.length + 1 : (posicion.get(v) ?? categorias.length)
    ]! += 1;
  return cuenta;
}

/** La referencia de una columna con sus valores crudos (todas las filas) y las filas de entrenamiento. */
export function referenciaColumna(
  columna: string,
  crudos: readonly string[],
  filas: readonly number[],
): RefColumna {
  const vista = vistaColumna(columna, crudos);
  if (vista.tipo === "numero") {
    const valores = filas.map((i) => vista.valores[i] ?? null);
    const cortes = cortesRedondeados(
      valores.filter((v): v is number => v !== null).sort((a, b) => a - b),
    );
    return { columna, tipo: "numero", cortes, cuentas: contarNumeros(cortes, valores) };
  }
  const valores = filas.map((i) => vista.valores[i] ?? null);
  const frecuencia = new Map<string, number>();
  for (const v of valores)
    if (v !== null) frecuencia.set(v, (frecuencia.get(v) ?? 0) + 1);
  const categorias = [...frecuencia.entries()]
    .filter(([, n]) => n >= REF_SOPORTE_MIN)
    .sort(([ca, na], [cb, nb]) => nb - na || byCodePoint(ca, cb))
    .slice(0, DERIVA_CATEGORIAS)
    .map(([categoria]) => categoria);
  return { columna, tipo: "texto", categorias, cuentas: contarTextos(categorias, valores) };
}

/** Las referencias de las columnas que usa el modelo, sobre las filas de entrenamiento. */
export function referenciasDeriva(
  tabla: CsvTable,
  columnas: readonly string[],
  entrenamiento: readonly number[],
): RefColumna[] {
  return columnas.map((c) => referenciaColumna(c, valoresDe(tabla, c), entrenamiento));
}

/** Las filas con valor que cuenta una referencia (sin el vacío): con eso se mide el ruido. */
export const llenas = (r: RefColumna) =>
  r.cuentas.slice(0, -1).reduce((s, n) => s + n, 0);

/** El JSON canónico que guarda el cuaderno (siempre las mismas claves, en el mismo orden). */
export function codificarReferencia(r: RefColumna): string {
  return r.tipo === "numero"
    ? JSON.stringify({ columna: r.columna, tipo: r.tipo, cortes: r.cortes, cuentas: r.cuentas })
    : JSON.stringify({
        columna: r.columna,
        tipo: r.tipo,
        categorias: r.categorias,
        cuentas: r.cuentas,
      });
}

const esCuenta = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;

/**
 * Lee una referencia guardada (también de un cuaderno importado). Exige la forma exacta: un corte que no
 * crece, una cuenta negativa, una categoría sin soporte o una clave de más la rechazan (`null`).
 */
export function leerReferencia(guardada: string): RefColumna | null {
  let x: unknown;
  try {
    x = JSON.parse(guardada);
  } catch {
    return null;
  }
  if (typeof x !== "object" || x === null || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const claves = Object.keys(o).sort().join(",");
  if (typeof o.columna !== "string" || o.columna === "") return null;
  const cuentas = o.cuentas;
  if (!Array.isArray(cuentas) || !cuentas.every(esCuenta)) return null;
  if (o.tipo === "numero") {
    const cortes = o.cortes;
    if (claves !== "columna,cortes,cuentas,tipo" || !Array.isArray(cortes)) return null;
    if (cortes.length > DERIVA_CUANTILES - 1 || cuentas.length !== cortes.length + 2)
      return null;
    const crecen = cortes.every(
      (c, k) =>
        typeof c === "number" &&
        Number.isFinite(c) &&
        (k === 0 || c > (cortes[k - 1] as number)),
    );
    if (!crecen) return null;
    return {
      columna: o.columna,
      tipo: "numero",
      cortes: cortes as number[],
      cuentas: cuentas as number[],
    };
  }
  if (o.tipo !== "texto" || claves !== "categorias,columna,cuentas,tipo") return null;
  const categorias = o.categorias;
  if (
    !Array.isArray(categorias) ||
    categorias.length > DERIVA_CATEGORIAS ||
    cuentas.length !== categorias.length + 2 ||
    !categorias.every((c) => typeof c === "string" && c !== "") ||
    new Set(categorias).size !== categorias.length ||
    categorias.some((_, k) => (cuentas[k] as number) < REF_SOPORTE_MIN)
  )
    return null;
  return {
    columna: o.columna,
    tipo: "texto",
    categorias: categorias as string[],
    cuentas: cuentas as number[],
  };
}
