// Protocolo DS (S8, etapas 2 y 3): lo que el código calcula sobre la tabla del usuario. Puro y
// sobre la tabla tal cual se cargó (sin sanear: una unidad que se repite en filas idénticas es
// evidencia, no basura que quitar). Nada de lo que sale de aquí viaja a logs ni a Sentry.
import {
  columnValues,
  isNullToken,
  parseNumber,
  profileColumn,
  type CsvTable,
} from "@/lib/ds/csv";
import { EDA_ID_RATIO_THRESHOLD } from "@/engine/eda";
import { NUMERIC_COERCION_THRESHOLD, sanitizeTable } from "@/engine/sanitize";
import {
  MULTICLASS_MAX_CLASSES,
  detectTask,
  type TaskDetection,
} from "@/engine/tarea";

export function indiceDe(tabla: CsvTable, columna: string): number {
  return tabla.headers.indexOf(columna);
}

export type PerfilObjetivo = {
  readonly filas: number;
  /** Filas con objetivo no vacío. */
  readonly utiles: number;
  readonly vacios: number;
  readonly deteccion: TaskDetection;
  /** Cuántas filas tiene cada valor, si son pocos (dos clases o varias). */
  readonly clases: Readonly<Record<string, number>> | null;
  /** Solo si todos los valores son números. */
  readonly media: number | null;
  readonly desviacion: number | null;
};

/** Cómo se llama una clase: el texto limpio; en una columna numérica, el número normalizado. */
export function nombreClase(valor: string, numerica: boolean): string {
  if (!numerica) return valor.trim();
  const n = parseNumber(valor);
  return n === null ? valor.trim() : String(n);
}

export function perfilObjetivo(
  tabla: CsvTable,
  columna: string,
): PerfilObjetivo | null {
  const indice = indiceDe(tabla, columna);
  if (indice < 0) return null;
  const valores = columnValues(tabla, indice);
  const llenos = valores.filter((v) => !isNullToken(v));
  const numeros = llenos.map(parseNumber);
  const numerica = llenos.length > 0 && numeros.every((n) => n !== null);
  // Un Map, no un objeto: una clase puede llamarse «constructor» o «__proto__» (S12).
  const cuenta = new Map<string, number>();
  const nombres = new Set<string>();
  for (const v of llenos) nombres.add(nombreClase(v, numerica));
  if (nombres.size <= MULTICLASS_MAX_CLASSES)
    for (const v of llenos) {
      const nombre = nombreClase(v, numerica);
      cuenta.set(nombre, (cuenta.get(nombre) ?? 0) + 1);
    }
  const clases: Record<string, number> = Object.fromEntries(cuenta);
  let media: number | null = null;
  let desviacion: number | null = null;
  if (numerica) {
    const xs = numeros as number[];
    media = xs.reduce((a, b) => a + b, 0) / xs.length;
    desviacion =
      xs.length > 1
        ? Math.sqrt(
            xs.reduce((a, x) => a + (x - media!) ** 2, 0) / (xs.length - 1),
          )
        : 0;
  }
  return {
    filas: valores.length,
    utiles: llenos.length,
    vacios: valores.length - llenos.length,
    deteccion: detectTask(valores),
    clases: nombres.size <= MULTICLASS_MAX_CLASSES ? clases : null,
    media,
    desviacion,
  };
}

export type PerfilUnidad = {
  readonly unidades: number;
  readonly maximo: number;
  /** Alguna unidad aparece en más de una fila. */
  readonly repetida: boolean;
  /** Filas sin valor en la columna de la unidad (no se cuentan). */
  readonly vacios: number;
};

/** Cuántas filas tiene cada unidad. Sin columna, cada fila es su unidad. */
export function perfilUnidad(
  tabla: CsvTable,
  columna: string | null,
): PerfilUnidad {
  if (columna === null)
    return {
      unidades: tabla.rows.length,
      maximo: tabla.rows.length > 0 ? 1 : 0,
      repetida: false,
      vacios: 0,
    };
  const cuenta = new Map<string, number>();
  let vacios = 0;
  // Una columna que este archivo no tiene (se cargó otra versión de los datos) cuenta como vacía.
  for (const valor of valoresDe(tabla, columna)) {
    if (isNullToken(valor)) {
      vacios += 1;
      continue;
    }
    const clave = valor.trim();
    cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1);
  }
  const conUnidad = tabla.rows.length - vacios;
  return {
    unidades: cuenta.size,
    maximo: Math.max(0, ...cuenta.values()),
    repetida: conUnidad > cuenta.size,
    vacios,
  };
}

/** Los valores de una columna, para leer sus fechas. */
export function valoresDe(tabla: CsvTable, columna: string): string[] {
  const indice = indiceDe(tabla, columna);
  return indice < 0 ? tabla.rows.map(() => "") : columnValues(tabla, indice);
}

/**
 * Cuántos parámetros candidatos trae la tabla: uno por columna numérica y uno menos que las
 * categorías por columna de texto (la codificación una-caliente). Salen las columnas que el
 * saneamiento de Probeta aparta (identificadores y constantes) y las que se pasan en `excluir`
 * (el objetivo, la unidad, la fecha).
 */
export function contarParametros(
  tabla: CsvTable,
  excluir: readonly string[],
): number {
  const apartadas = new Set([
    ...sanitizeTable(tabla).report.exclusions.map((e) => e.column),
    ...excluir,
  ]);
  let total = 0;
  tabla.headers.forEach((nombre, indice) => {
    if (apartadas.has(nombre)) return;
    const perfil = profileColumn(nombre, columnValues(tabla, indice));
    if (perfil.cardinality <= 1) return;
    total += perfil.kind === "numeric" ? 1 : perfil.cardinality - 1;
  });
  return Math.max(1, total);
}

/** El cuantil de rango más cercano (el que minimiza la pérdida asimétrica). */
export function cuantilEmpirico(
  ordenados: readonly number[],
  nivel: number,
): number {
  const indice = Math.min(
    ordenados.length - 1,
    Math.max(0, Math.ceil(nivel * ordenados.length) - 1),
  );
  return ordenados[indice]!;
}

/** Costo medio por fila de estimar siempre el cuantil `nivel` con la pérdida asimétrica. */
export function costoConstante(
  valores: readonly number[],
  costoSub: number,
  costoSobre: number,
): number {
  const ordenados = [...valores].sort((a, b) => a - b);
  const q = cuantilEmpirico(ordenados, costoSub / (costoSub + costoSobre));
  const total = valores.reduce(
    (suma, y) =>
      suma + costoSub * Math.max(y - q, 0) + costoSobre * Math.max(q - y, 0),
    0,
  );
  return total / valores.length;
}

/** Los valores numéricos no vacíos de una columna (para el costo de la constante). */
export function numerosDe(tabla: CsvTable, columna: string): number[] {
  return valoresDe(tabla, columna)
    .filter((v) => !isNullToken(v))
    .map(parseNumber)
    .filter((n): n is number => n !== null);
}

/**
 * Una columna tal como la lee el Protocolo para la etapa 4: con la regla de coerción del
 * saneamiento de Probeta (si al menos el 90 % de lo que tiene se lee como número, es numérica
 * y la basura pasa a vacío, contada) pero SIN quitar filas ni columnas. Así el mismo CSV da
 * la misma lectura que en Probeta, y una celda «error» no vuelve «categórica» una columna de edades.
 */
export type VistaColumna =
  | {
      readonly tipo: "numero";
      readonly valores: readonly (number | null)[];
      /** Celdas con texto que no es número, tratadas como vacías. */
      readonly basura: number;
    }
  | {
      readonly tipo: "texto";
      readonly valores: readonly (string | null)[];
      /** Parece una fecha (la regla de Probeta): no es una variable para el modelo. */
      readonly fecha: boolean;
    };

export function vistaColumna(
  nombre: string,
  crudos: readonly string[],
): VistaColumna {
  const llenos = crudos.filter((c) => !isNullToken(c)).length;
  const numeros = crudos.map((c) => (isNullToken(c) ? null : parseNumber(c)));
  const buenos = numeros.filter((n) => n !== null).length;
  if (llenos > 0 && buenos / llenos >= NUMERIC_COERCION_THRESHOLD)
    return { tipo: "numero", valores: numeros, basura: llenos - buenos };
  return {
    tipo: "texto",
    valores: crudos.map((c) => (isNullToken(c) ? null : c.trim())),
    fecha: profileColumn(nombre, crudos).looksLikeDate,
  };
}

/**
 * Cuánto del rango de una columna entera cubren sus valores para llamarla «en secuencia».
 * Un identificador numérico (1..N, o un autoincremental con huecos) llena casi todo su rango;
 * una medida entera (ingreso, visitas) con tantos valores distintos como filas queda dispersa.
 * Convención del Protocolo, no un teorema: el límite se declara en el manual.
 */
export const ID_NUMERICO_SECUENCIA_MIN = 0.9;

/**
 * S10 (M1 del S9): ¿es una columna numérica un identificador? Enteros, casi todos distintos
 * (el mismo umbral que Probeta usa para el texto) Y en secuencia. Con «tantos valores distintos
 * como filas» solo, ocho columnas de medida del kit de prueba (ingreso, monto, precio…) se
 * marcarían como identificador: por eso se exige también la secuencia. Un id numérico al azar y
 * disperso no se detecta (se declara). Devuelve la proporción de distintos, o null si no lo es.
 */
export function identificadorNumerico(
  valores: readonly (number | null)[],
): number | null {
  const distintos = new Set<number>();
  let minimo = Infinity;
  let maximo = -Infinity;
  for (const v of valores) {
    if (v === null) continue;
    if (!Number.isInteger(v)) return null;
    distintos.add(v);
    if (v < minimo) minimo = v;
    if (v > maximo) maximo = v;
  }
  if (distintos.size === 0 || valores.length === 0) return null;
  const proporcion = distintos.size / valores.length;
  if (proporcion < EDA_ID_RATIO_THRESHOLD) return null;
  const densidad = distintos.size / (maximo - minimo + 1);
  return densidad >= ID_NUMERICO_SECUENCIA_MIN ? proporcion : null;
}
