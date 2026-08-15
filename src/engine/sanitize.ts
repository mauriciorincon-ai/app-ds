// Saneamiento ESTRUCTURAL pre-split — puro, determinista, honesto.
//
// Corre en `loadCsv` sobre TODO el dataset (antes de elegir objetivo y antes del
// split). Su parte estructural puede correr pre-split porque no ajusta ningún
// estadístico sobre el objetivo: excluir columnas-ID (un valor por fila, sin
// señal generalizable), excluir constantes (cero información) y **deduplicar
// filas exactas** — esto ÚLTIMO previene fuga por duplicación (la misma fila
// cayendo en train y test). La parte ESTADÍSTICA del saneamiento (imputación,
// agrupar categorías raras) vive DENTRO del pipeline retenido y se ajusta SOLO
// en train (ADR-002 extendido) — aquí no se toca.
//
// Todo lo que hace se DECLARA en el reporte (conteos exactos); nada silencioso.

import {
  columnValues,
  isNullToken,
  parseNumber,
  type CsvTable,
} from "@/lib/ds/csv";

// Una columna numérica ensuciada por celdas basura ("error", "s/d") se rescata si
// al menos esta fracción de sus valores no nulos parsea como número; el resto se
// convierte a nulo (contado) para que el perfil la lea como numérica.
export const NUMERIC_COERCION_THRESHOLD = 0.9;

export type SanitationExclusionReason = "id-column" | "constant-column";

export type SanitationExclusion = {
  column: string;
  reason: SanitationExclusionReason;
};

export type SanitationCoercion = {
  column: string;
  /** Celdas no numéricas convertidas a nulo (basura en una columna numérica). */
  cellsNulled: number;
};

export type SanitationReport = {
  /** true ⇒ el dataset ya venía limpio: no se tocó nada ("nada que sanear"). */
  clean: boolean;
  duplicateRowsRemoved: number;
  exclusions: SanitationExclusion[];
  coercions: SanitationCoercion[];
  rowsBefore: number;
  rowsAfter: number;
  colsBefore: number;
  colsAfter: number;
  /** false ⇒ no queda estructura modelable (csv-unusable). */
  usable: boolean;
};

export type SanitationResult = {
  table: CsvTable;
  report: SanitationReport;
};

/** Firma canónica de una fila para deduplicar filas EXACTAS (sin ambigüedad). */
function rowKey(row: readonly string[]): string {
  return JSON.stringify(row);
}

/** Elimina filas exactamente iguales conservando la primera aparición (orden estable). */
function dedupeRows(rows: string[][]): { rows: string[][]; removed: number } {
  const seen = new Set<string>();
  const kept: string[][] = [];
  for (const row of rows) {
    const key = rowKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(row);
  }
  return { rows: kept, removed: rows.length - kept.length };
}

/**
 * Saneamiento estructural. Devuelve la tabla saneada + un reporte con conteos
 * exactos de todo lo que se hizo. No conoce el objetivo (corre antes de elegirlo);
 * un ID/constante nunca es objetivo binario, así que excluirlos es seguro.
 */
export function sanitizeTable(table: CsvTable): SanitationResult {
  const rowsBefore = table.rows.length;
  const colsBefore = table.headers.length;

  // 1) Dedup de filas exactas (pre-split ⇒ previene fuga por duplicación).
  const { rows: dedupedRows, removed: duplicateRowsRemoved } = dedupeRows(
    table.rows,
  );
  let working: CsvTable = { headers: [...table.headers], rows: dedupedRows };

  // 2) Detectar exclusiones por columna (ID exacta / constante) sobre la tabla
  //    ya deduplicada (un ID con filas repetidas se vuelve exacto tras el dedup).
  const nRows = working.rows.length;
  const exclusions: SanitationExclusion[] = [];
  const excluded = new Set<string>();
  working.headers.forEach((name, index) => {
    const values = columnValues(working, index);
    const distinct = new Set<string>();
    let nonNull = 0;
    let numeric = 0;
    for (const raw of values) {
      if (isNullToken(raw)) continue;
      nonNull += 1;
      distinct.add(raw.trim());
      if (parseNumber(raw) !== null) numeric += 1;
    }
    // Constante: 0 o 1 valor distinto ⇒ sin información.
    if (distinct.size <= 1) {
      exclusions.push({ column: name, reason: "constant-column" });
      excluded.add(name);
      return;
    }
    // ID exacta: cada fila con un valor distinto y sin nulos (unicidad EXACTA).
    // Solo columnas NO numéricas: una numérica (o casi, que se coacciona) con
    // valores todos distintos es una feature continua legítima, no un
    // identificador — JAMÁS se descarta en silencio (la casi-ID numérica la
    // señala la EDA como aviso id-like). La "casi-ID" (0.95 ≤ ratio < 1) tampoco
    // se excluye aquí.
    const mostlyNumeric =
      nonNull > 0 && numeric / nonNull >= NUMERIC_COERCION_THRESHOLD;
    if (
      !mostlyNumeric &&
      nRows >= 2 &&
      nonNull === nRows &&
      distinct.size === nRows
    ) {
      exclusions.push({ column: name, reason: "id-column" });
      excluded.add(name);
    }
  });

  // 3) Coerción de numéricas mixtas en las columnas que SÍ se conservan.
  const coercions: SanitationCoercion[] = [];
  const keptIndexes = working.headers
    .map((name, index) => ({ name, index }))
    .filter(({ name }) => !excluded.has(name));

  for (const { name, index } of keptIndexes) {
    let nonNull = 0;
    let numeric = 0;
    for (const raw of working.rows) {
      const cell = raw[index];
      if (isNullToken(cell)) continue;
      nonNull += 1;
      if (parseNumber(cell) !== null) numeric += 1;
    }
    const mostlyNumeric =
      nonNull > 0 &&
      numeric < nonNull && // hay basura que limpiar
      numeric / nonNull >= NUMERIC_COERCION_THRESHOLD;
    if (!mostlyNumeric) continue;

    let cellsNulled = 0;
    for (const raw of working.rows) {
      const cell = raw[index];
      if (isNullToken(cell)) continue;
      if (parseNumber(cell) === null) {
        raw[index] = ""; // basura → nulo (token vacío)
        cellsNulled += 1;
      }
    }
    if (cellsNulled > 0) coercions.push({ column: name, cellsNulled });
  }

  // 4) Materializar la tabla saneada: soltar las columnas excluidas.
  if (excluded.size > 0) {
    const keep = working.headers
      .map((name, index) => ({ name, index }))
      .filter(({ name }) => !excluded.has(name));
    working = {
      headers: keep.map((k) => k.name),
      rows: working.rows.map((row) => keep.map((k) => row[k.index])),
    };
  }

  const clean =
    duplicateRowsRemoved === 0 &&
    exclusions.length === 0 &&
    coercions.length === 0;

  // Irrecuperable: sin ≥2 columnas (una para objetivo, otra feature) o sin filas.
  const usable = working.headers.length >= 2 && working.rows.length >= 2;

  return {
    table: working,
    report: {
      clean,
      duplicateRowsRemoved,
      exclusions,
      coercions,
      rowsBefore,
      rowsAfter: working.rows.length,
      colsBefore,
      colsAfter: working.headers.length,
      usable,
    },
  };
}
