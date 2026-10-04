// EDA mínima con alertas honestas — pura, determinista.
//
// Corre al ELEGIR el objetivo (necesita el target para fuga y desbalance). Emite
// tres clases de alerta, cada una con su umbral documentado:
//
//   • possible-leak  — una feature con relación univariada casi perfecta con el
//     objetivo. Es un AVISO EXPLORATORIO PRE-SPLIT (misma heurística que
//     engine/leakage pero sobre TODO el dataset); la GARANTÍA anti-fuga sigue
//     siendo el pipeline train-only + detectLeakage(train) de prepareRun.
//   • id-like        — columna casi-única (parece identificador). Se reporta como
//     ID, NO como fuga (un identificador no "filtra el objetivo").
//   • class-imbalance — la clase minoritaria es rara; el veredicto lo tendrá en
//     cuenta (métrica primaria AUC), pero el usuario merece saberlo de frente.
//
// S6 — con un objetivo NUMÉRICO (estimar una cantidad) el bloque de id-like corre
// igual; la fuga es la continua (|Spearman| y η²) y en lugar del desbalance hay
// dos avisos INFORMATIVOS sobre la forma del objetivo (umbrales fijados por el
// usuario en el STOP de la F0, contrastados con el spike):
//   • target-skewed   — |sesgo| ≥ 1 (Bulmer: «muy sesgado»): el MAE pesa cada
//     error igual, pero los valores grandes dominan el RMSE.
//   • target-outliers — ≥ 1 % de las filas fuera de 3·IQR (Tukey: «lejanos»).
//
// `EdaAlert` es un tipo DISTINTO de `LeakageFinding`: no toca el array `leakage`
// del manifiesto ni la validación `isLeakage` del archivo exportado.

import {
  DEFAULT_LEAKAGE_THRESHOLD,
  detectLeakage,
  detectLeakageContinuous,
  type LeakageColumn,
} from "@/engine/leakage";
import { matchTask } from "@/engine/despacho";
import type { SupervisedTask } from "@/engine/tarea";
import {
  isNullToken,
  parseNumber,
  profileColumn,
  targetClasses,
  type CsvTable,
} from "@/lib/ds/csv";

export type EdaAlert =
  | { kind: "possible-leak"; column: string; score: number }
  | { kind: "id-like"; column: string; score: number }
  | { kind: "class-imbalance"; minorityRate: number }
  | { kind: "target-skewed"; skew: number }
  | { kind: "target-outliers"; share: number };

// Casi-ID: al menos este 95% de las filas con un valor distinto. La exclusión
// DURA de sanitize exige unicidad exacta (=1); este umbral atrapa la casi-ID que
// sanitize conserva.
export const EDA_ID_RATIO_THRESHOLD = 0.95;
// Desbalance: clase minoritaria por debajo del 15% (mismo corte que la elección
// de métrica primaria en verdict.ts — coherencia de una sola frontera).
export const EDA_IMBALANCE_THRESHOLD = 0.15;
/** S6: |sesgo| desde el que el objetivo se nombra «muy sesgado» (Bulmer, 1979). */
export const TARGET_SKEW_THRESHOLD = 1;
/** S6: «lejano» = fuera de Q1 − 3·IQR … Q3 + 3·IQR (Tukey). */
export const TARGET_OUTLIER_IQR = 3;
/** S6: fracción de filas lejanas desde la que se avisa (el spike midió ≤ 0,3 %). */
export const TARGET_OUTLIER_SHARE = 0.01;

/**
 * Alertas EDA para un objetivo dado y la tarea con que se va a entrenar. Binaria:
 * fuga → id-like → desbalance (vacío si el objetivo no tiene dos clases).
 * Numérica (S6): fuga continua → id-like → objetivo muy sesgado → atípicos
 * extremos. La tarea es obligatoria y el despacho es exhaustivo: una tarea nueva
 * no compila hasta tener su rama (AU-S6-03).
 */
export function computeEdaAlerts(
  table: CsvTable,
  targetColumn: string,
  task: SupervisedTask,
): EdaAlert[] {
  const targetIndex = table.headers.indexOf(targetColumn);
  if (targetIndex < 0) return [];

  const rowsWithTarget = table.rows.filter(
    (row) => !isNullToken(row[targetIndex]),
  );
  const labels = rowsWithTarget.map((row) => row[targetIndex]);
  const n = rowsWithTarget.length;
  if (n === 0) return [];
  return matchTask(task, {
    binaria: () => binaryAlerts(table, targetIndex, rowsWithTarget, labels),
    numerica: () =>
      regressionAlerts(table, targetIndex, rowsWithTarget, labels),
  });
}

/**
 * Las alertas que no dependen de la tarea: las columnas con pinta de
 * identificador. Para un objetivo cuya tarea no se entrena (una ambigua sin
 * responder, una multiclase, una columna que no sirve como objetivo): ninguna
 * tarea se supone por descarte.
 */
export function idLikeAlerts(
  table: CsvTable,
  targetColumn: string,
): EdaAlert[] {
  const targetIndex = table.headers.indexOf(targetColumn);
  if (targetIndex < 0) return [];
  const rowsWithTarget = table.rows.filter(
    (row) => !isNullToken(row[targetIndex]),
  );
  if (rowsWithTarget.length === 0) return [];
  return idLikeColumns(table, targetIndex, rowsWithTarget).idAlerts;
}

function binaryAlerts(
  table: CsvTable,
  targetIndex: number,
  rowsWithTarget: readonly string[][],
  labels: readonly string[],
): EdaAlert[] {
  const n = rowsWithTarget.length;
  const classes = targetClasses(labels).sort();
  if (classes.length !== 2) return [];

  const leakAlerts: EdaAlert[] = [];
  const { idLike, idAlerts } = idLikeColumns(
    table,
    targetIndex,
    rowsWithTarget,
  );

  // 2) Fuga exploratoria (pre-split, sobre todo el dataset).
  const target01 = labels.map((v) => (v.trim() === classes[1] ? 1 : 0)) as (
    0 | 1
  )[];

  for (const finding of detectLeakage(
    candidateColumns(table, targetIndex, rowsWithTarget, idLike),
    target01,
    DEFAULT_LEAKAGE_THRESHOLD,
  )) {
    leakAlerts.push({
      kind: "possible-leak",
      column: finding.column,
      score: finding.score,
    });
  }

  // 3) Desbalance de clases.
  const minorityCount = Math.min(
    target01.filter((t) => t === 1).length,
    target01.filter((t) => t === 0).length,
  );
  const minorityRate = minorityCount / n;
  const imbalanceAlerts: EdaAlert[] =
    minorityRate < EDA_IMBALANCE_THRESHOLD
      ? [{ kind: "class-imbalance", minorityRate }]
      : [];

  return [...leakAlerts, ...idAlerts, ...imbalanceAlerts];
}

/**
 * 1) Columnas casi-únicas (id-like) — target-independiente; se excluyen del
 *    escaneo de fuga para no confundir "identificador" con "proxy del objetivo".
 *    Solo NO numéricas: una feature continua tiene alta cardinalidad natural y
 *    NO es un identificador (coherente con la exclusión de sanitize). Corre en
 *    las dos tareas (S6, R5).
 */
function idLikeColumns(
  table: CsvTable,
  targetIndex: number,
  rowsWithTarget: readonly string[][],
): { idLike: Set<string>; idAlerts: EdaAlert[] } {
  const n = rowsWithTarget.length;
  const idAlerts: EdaAlert[] = [];
  const idLike = new Set<string>();
  table.headers.forEach((name, index) => {
    if (index === targetIndex) return;
    const cells = rowsWithTarget.map((row) => row[index]);
    if (profileColumn(name, cells).kind === "numeric") return;
    const distinct = new Set<string>();
    let nonNull = 0;
    for (const cell of cells) {
      if (isNullToken(cell)) continue;
      nonNull += 1;
      distinct.add(cell.trim());
    }
    if (nonNull === 0) return;
    const ratio = distinct.size / n;
    if (ratio >= EDA_ID_RATIO_THRESHOLD) {
      idLike.add(name);
      idAlerts.push({ kind: "id-like", column: name, score: ratio });
    }
  });
  return { idLike, idAlerts };
}

/** Columnas candidatas (no objetivo, no id-like, no fecha) con TODAS sus filas. */
function candidateColumns(
  table: CsvTable,
  targetIndex: number,
  rowsWithTarget: readonly string[][],
  idLike: ReadonlySet<string>,
): LeakageColumn[] {
  const columns: LeakageColumn[] = [];
  table.headers.forEach((name, index) => {
    if (index === targetIndex || idLike.has(name)) return;
    const cells = rowsWithTarget.map((row) => row[index]);
    const profile = profileColumn(name, cells);
    if (profile.looksLikeDate) return; // las fechas no son features (S1)
    if (profile.kind === "numeric") {
      columns.push({
        name,
        kind: "numeric",
        values: cells.map((c) => parseNumber(c)),
      });
    } else {
      columns.push({
        name,
        kind: "categorical",
        values: cells.map((c) => (isNullToken(c) ? null : c.trim())),
      });
    }
  });
  return columns;
}

/** Sesgo de Fisher-Pearson (momento estandarizado de orden 3). 0 si es constante. */
export function skewness(values: readonly number[]): number {
  const n = values.length;
  if (n < 3) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  let m2 = 0;
  let m3 = 0;
  for (const v of values) {
    const d = v - mean;
    m2 += d * d;
    m3 += d * d * d;
  }
  m2 /= n;
  m3 /= n;
  return m2 === 0 ? 0 : m3 / m2 ** 1.5;
}

/** Cuantil por interpolación lineal (el de numpy por defecto) sobre una lista ORDENADA. */
function quantile(sorted: readonly number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Fracción de valores fuera de Q1 − k·IQR … Q3 + k·IQR. */
export function farOutShare(
  values: readonly number[],
  k: number = TARGET_OUTLIER_IQR,
): number {
  if (values.length < 4) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const out = sorted.filter((v) => v < q1 - k * iqr || v > q3 + k * iqr);
  return out.length / sorted.length;
}

/** S6: alertas con objetivo numérico (pre-split, exploratorias, como las binarias). */
function regressionAlerts(
  table: CsvTable,
  targetIndex: number,
  rowsWithTarget: readonly string[][],
  labels: readonly string[],
): EdaAlert[] {
  const target = labels.map((v) => parseNumber(v.trim()));
  if (target.some((v) => v === null)) return [];
  const y = target as number[];
  const { idLike, idAlerts } = idLikeColumns(
    table,
    targetIndex,
    rowsWithTarget,
  );
  const leakAlerts: EdaAlert[] = detectLeakageContinuous(
    candidateColumns(table, targetIndex, rowsWithTarget, idLike),
    y,
  ).map((finding) => ({
    kind: "possible-leak",
    column: finding.column,
    score: finding.score,
  }));
  const shapeAlerts: EdaAlert[] = [];
  const skew = skewness(y);
  if (Math.abs(skew) >= TARGET_SKEW_THRESHOLD) {
    shapeAlerts.push({ kind: "target-skewed", skew });
  }
  const share = farOutShare(y);
  if (share >= TARGET_OUTLIER_SHARE) {
    shapeAlerts.push({ kind: "target-outliers", share });
  }
  return [...leakAlerts, ...idAlerts, ...shapeAlerts];
}
