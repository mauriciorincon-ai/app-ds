// Ensamblador del CSV puntuado (motor puro, sin i18n): toma la tabla original
// del usuario y le añade dos columnas — predicción (etiqueta original de la
// clase) y probabilidad de la clase positiva. S6: al estimar, una sola columna
// (`<objetivo>_estimado`, ya formateada con formatEstimates) y sin probabilidad. Los NOMBRES de esas columnas
// llegan localizados por parámetro (el CSV descargado sale en el idioma
// activo); si colisionan con columnas del usuario se les añade un sufijo
// determinista (_2, _3, …) — jamás se pisa una columna existente.
import type { CsvTable } from "@/lib/ds/csv";
import { datasetSlug } from "@/lib/files";
import { TARGET_DECIMALS_MAX } from "@/workers/contract";

export type ScoredColumnNames = {
  prediction: string;
  probability: string;
};

const PROBABILITY_DECIMALS = 4;

function deduplicate(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name;
  let n = 2;
  while (taken.has(`${name}_${n}`)) n += 1;
  return `${name}_${n}`;
}

/** Resuelve los nombres finales de las columnas nuevas contra los headers del
 *  usuario (sufijo determinista si colisionan). */
export function resolveScoredColumnNames(
  headers: readonly string[],
  desired: ScoredColumnNames,
): ScoredColumnNames {
  const taken = new Set(headers);
  const prediction = deduplicate(desired.prediction, taken);
  taken.add(prediction);
  const probability = deduplicate(desired.probability, taken);
  return { prediction, probability };
}

// Escape RFC-4180: comillas dobles alrededor si el campo contiene coma,
// comillas o salto de línea; las comillas internas se doblan.
function escapeField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Serializa la tabla original + predicción + probabilidad como CSV RFC-4180.
 * Preserva TODAS las columnas y filas del usuario (incluidas las que el modelo
 * ignoró: el archivo descargado es su tabla completa, puntuada). S5: si el modelo
 * no da probabilidad (`null`), la columna no se agrega — no se inventa.
 */
export function buildScoredCsv(
  table: CsvTable,
  predictions: readonly string[],
  probabilities: readonly number[] | null,
  names: ScoredColumnNames,
): string {
  const { rows } = table;
  if (predictions.length !== rows.length) {
    throw new Error(
      `buildScoredCsv: ${predictions.length} predicciones para ${rows.length} filas`,
    );
  }
  if (probabilities && probabilities.length !== rows.length) {
    throw new Error(
      `buildScoredCsv: ${probabilities.length} probabilidades para ${rows.length} filas`,
    );
  }

  const resolved = resolveScoredColumnNames(table.headers, names);
  const header = [
    ...table.headers,
    resolved.prediction,
    ...(probabilities ? [resolved.probability] : []),
  ]
    .map(escapeField)
    .join(",");
  const lines = rows.map((row, i) =>
    [
      ...row,
      predictions[i]!,
      ...(probabilities
        ? [probabilities[i]!.toFixed(PROBABILITY_DECIMALS)]
        : []),
    ]
      .map(escapeField)
      .join(","),
  );
  return [header, ...lines].join("\n") + "\n";
}

/** `<slug>-puntuado.csv` — el sufijo llega localizado (es: puntuado / en: scored). */
export function scoredCsvFileName(
  datasetName: string,
  localizedSuffix: string,
): string {
  const slug = datasetSlug(datasetName) || "datos";
  return `${slug}-${localizedSuffix}.csv`;
}

/**
 * S6: las cantidades estimadas, escritas con los decimales con que el usuario
 * anotó su objetivo (TargetStats.decimals): un consumo anotado con 1 decimal se
 * estima con 1, un precio entero sale entero. No se inventa precisión.
 */
export function formatEstimates(
  predictions: readonly number[],
  decimals: number,
): string[] {
  const d = Math.min(Math.max(Math.trunc(decimals), 0), TARGET_DECIMALS_MAX);
  return predictions.map((value) => value.toFixed(d));
}
