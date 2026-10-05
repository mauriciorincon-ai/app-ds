// Veredicto franco: ¿el modelo supera a un baseline simple, y por cuánto?
//
// El motor devuelve un veredicto ESTRUCTURADO (nivel + deltas + puntajes); el
// texto franco bilingüe lo arma la UI vía i18n con estos números. Así el motor
// queda separado de la UI y el mensaje existe en ES y EN sin duplicar lógica.
// Todas las métricas se calculan sobre TEST (garantía del pipeline), nunca train.

export type Metrics = {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  auc: number;
};

export type MetricName = keyof Metrics;

/** S6: métricas de regresión sobre TEST, en las unidades del objetivo (salvo R²).
 *  `mape` es null si el objetivo tiene ceros (con un cero es infinita). */
export type RegressionMetrics = {
  mae: number;
  rmse: number;
  r2: number;
  medae: number;
  mape: number | null;
};

/** S7: métricas de clasificación en varias categorías sobre TEST. `log_loss` y
 *  `auc_ovr` son null sin probabilidades (Ridge, SVM lineal) — y el AUC, también si
 *  la prueba no tiene filas de todas las clases. */
export type MulticlassMetrics = {
  balanced_accuracy: number;
  f1_macro: number;
  accuracy: number;
  log_loss: number | null;
  auc_ovr: number | null;
};

/** La métrica que decide (liga y veredicto): de clasificación binaria, la
 *  exactitud balanceada de varias categorías (S7) o el MAE (S6). */
export type PrimaryMetric = MetricName | "balanced_accuracy" | "mae";

/** S7 (decisión del usuario en el STOP de la F0): con varias categorías decide la
 *  EXACTITUD BALANCEADA — de cada categoría, qué parte acierta, en promedio; adivinar
 *  da 1/K. En el spike, el ganador saltó entre 2 modelos en 5 particiones (F1 macro,
 *  entre 3). F1 macro queda a la vista. */
export const MULTICLASS_PRIMARY_METRIC = "balanced_accuracy" as const;

export type Direction = "higher" | "lower";

export type MetricRule = {
  direction: Direction;
  /** Margen de empate: absoluto (en la métrica) o relativo (al puntaje del baseline). */
  tolerance: { kind: "absolute" | "relative"; value: number };
};

export type VerdictLevel = "beats" | "ties" | "loses";

export type Verdict<M extends PrimaryMetric = MetricName> = {
  level: VerdictLevel;
  primaryMetric: M;
  modelScore: number;
  baselineScore: number;
  /** modelScore − baselineScore, crudo (con MAE, negativo = el modelo se equivoca menos). */
  delta: number;
};

// Margen dentro del cual modelo ≈ baseline → empate honesto (no inflar una
// mejora marginal como victoria).
export const TIE_EPSILON = 0.01;

/** S6 (fijada por el usuario en el STOP de la F0, medida en el spike): un modelo
 *  de regresión empata si su MAE queda a menos del 1 % del MAE del mejor baseline. */
export const REGRESSION_TIE_TOLERANCE = 0.01;

const CLASSIFICATION_RULE: MetricRule = {
  direction: "higher",
  tolerance: { kind: "absolute", value: TIE_EPSILON },
};

/**
 * LA regla de cada métrica primaria, en UN solo sitio (S6, R3): la dirección
 * gobierna la selección por un error estándar (roster.ts), el mejor baseline y el
 * veredicto; la tolerancia, el empate. Espejo de dirección en pipeline.py
 * (METRIC_DIRECTION), con paridad vigilada en tests/unit/roster.test.ts.
 */
export const METRIC_RULES: Record<PrimaryMetric, MetricRule> = {
  auc: CLASSIFICATION_RULE,
  f1: CLASSIFICATION_RULE,
  accuracy: CLASSIFICATION_RULE,
  precision: CLASSIFICATION_RULE,
  recall: CLASSIFICATION_RULE,
  // S7: el mismo empate de la binaria, 0,01 absoluto (decisión 2 del STOP de la F0).
  balanced_accuracy: CLASSIFICATION_RULE,
  mae: {
    direction: "lower",
    tolerance: { kind: "relative", value: REGRESSION_TIE_TOLERANCE },
  },
};

/**
 * Con clases desbalanceadas, AUC (independiente del umbral; el baseline de clase
 * mayoritaria vale 0.5) es más honesto que F1. Con clases balanceadas, F1
 * resume bien el equilibrio precisión/recall.
 */
export function pickPrimaryMetric(positiveRate: number): MetricName {
  const imbalance = Math.abs(positiveRate - 0.5);
  return imbalance >= 0.15 ? "auc" : "f1";
}

type Scored<M extends PrimaryMetric> = Record<M, number>;

/** El baseline más fuerte en la métrica primaria: el rival honesto a batir. */
export function pickBestBaseline<M extends PrimaryMetric, B extends Scored<M>>(
  baselines: readonly B[],
  metric: M,
): B {
  if (baselines.length === 0) {
    throw new Error("pickBestBaseline: se requiere al menos un baseline");
  }
  const lower = METRIC_RULES[metric].direction === "lower";
  return baselines.reduce((best, candidate) =>
    (
      lower
        ? candidate[metric] < best[metric]
        : candidate[metric] > best[metric]
    )
      ? candidate
      : best,
  );
}

/**
 * Compara el modelo contra el baseline en la métrica primaria y emite el
 * veredicto con la regla de esa métrica (METRIC_RULES). Clasificación: `delta >
 * TIE_EPSILON` ⇒ supera; `delta < -TIE_EPSILON` ⇒ no supera; en medio ⇒ empate.
 * Regresión (MAE, menor es mejor): la mejora es lo que el modelo se equivoca
 * MENOS, relativa al MAE del baseline; ± 1 % es empate.
 */
export function computeVerdict<M extends PrimaryMetric>(
  model: Scored<M>,
  baseline: Scored<M>,
  primaryMetric: M,
): Verdict<M> {
  const modelScore = model[primaryMetric];
  const baselineScore = baseline[primaryMetric];
  const delta = modelScore - baselineScore;
  const rule = METRIC_RULES[primaryMetric];
  const gain = rule.direction === "higher" ? delta : -delta;
  // Relativa a un baseline de error 0 (proxy perfecto) no hay margen que medir:
  // solo empata quien también es exacto.
  const improvement =
    rule.tolerance.kind === "relative"
      ? baselineScore === 0
        ? gain === 0
          ? 0
          : Math.sign(gain) * Infinity
        : gain / Math.abs(baselineScore)
      : gain;

  let level: VerdictLevel;
  if (improvement > rule.tolerance.value) {
    level = "beats";
  } else if (improvement < -rule.tolerance.value) {
    level = "loses";
  } else {
    level = "ties";
  }

  return { level, primaryMetric, modelScore, baselineScore, delta };
}

// --- S7: agrupar sin objetivo (ADR 016) --------------------------------------
//
// Sin objetivo no hay baseline que batir ni prueba que abrir: la vara es la
// REFERENCIA NULA (el mismo agrupador sobre datos sin estructura) y la ESTABILIDAD
// por re-muestreo (decisión 5 del STOP de la F0, medida en el spike: 8 de 8). Las
// reglas viven aquí, en UN sitio, con su espejo en pipeline.py (`_reading_level`,
// `select_consensus`): el lector del contrato las recalcula y rechaza el resultado
// si no coinciden. Paridad de constantes en tests/unit/roster.test.ts.

/** k candidatos de K-Means, Agglomerative y GMM: 2..10 (spike: con el tope en 12,
 *  el one-hot fabricaba 11 y 12 grupos). */
export const CLUSTER_K_MIN = 2;
export const CLUSTER_K_MAX = 10;
/** Con al menos tantas numéricas, la distancia usa SOLO las numéricas (el one-hot
 *  de las categóricas fabricaba grupos); las categóricas describen los perfiles. */
export const CLUSTER_MIN_NUMERIC = 2;
/** Filas de la muestra sembrada con que se mide la silueta (compartida por todos). */
export const SILHOUETTE_SAMPLE = 2000;
/** Por encima, Agglomerative se ajusta sobre una muestra de este tamaño, con nota
 *  en la app (decisión 8 del STOP de la F0). */
export const AGGLO_MAX_ROWS = 8000;
/** Cuántas columnas «que más separan» se nombran. */
export const SEPARATING_TOP = 3;
/** HDBSCAN: un grupo necesita al menos max(5, n/50) filas (spike: 3 de 3 plantados). */
export const HDBSCAN_MIN_CLUSTER_SIZE = 5;
export const HDBSCAN_ROWS_PER_MIN_CLUSTER = 50;

/** Diferencia mínima de puntaje contra la referencia nula para que haya estructura. */
export const CLUSTER_GAP_MIN = 0.1;
/** ARI medio mínimo entre re-muestreos para que los grupos sean estables. */
export const CLUSTER_STABILITY_MIN = 0.7;
/** Re-muestreos de la estabilidad y la fracción de filas de cada uno. */
export const STABILITY_RUNS = 10;
export const STABILITY_FRACTION = 0.8;

/** El k más alto que la estabilidad puede medir: cada re-muestreo (f·n filas)
 *  necesita al menos k + 1 filas. Menos que CLUSTER_K_MIN ⇒ no se puede agrupar. */
export function clusterKCap(rows: number): number {
  return Math.min(CLUSTER_K_MAX, Math.floor(STABILITY_FRACTION * rows) - 1);
}

export type ClusterReadingLevel = "exist" | "fragile" | "none";

/** «Los grupos existen» (gap y estabilidad alcanzan) · «son frágiles» (hay
 *  estructura, pero cambian al re-muestrear) · «no hay estructura» (no superan lo
 *  que el mismo agrupador encuentra en datos sin estructura). */
export function computeClusterReading(
  gap: number,
  ariMean: number,
): ClusterReadingLevel {
  if (gap >= CLUSTER_GAP_MIN && ariMean >= CLUSTER_STABILITY_MIN) return "exist";
  if (gap >= CLUSTER_GAP_MIN) return "fragile";
  return "none";
}

export type ClusterRowLike<Id extends string = string> = {
  name: Id;
  status: string;
  k: number | null;
  score: number | null;
};

export type ClusterConsensus<Id extends string = string> = {
  k: number;
  votes: number;
  voters: number;
  winner: Id;
};

/**
 * El ganador entre agrupadores, POR CONSENSO (decisión 4 del STOP de la F0; en el
 * spike recuperó el k plantado en 3 de 3): votan los `ok`; gana el k en que
 * coinciden más (empate → el k cuyo mejor miembro tiene más puntaje; luego el k
 * menor) y, entre los que lo eligieron, el de mayor puntaje (empate → el primero
 * del orden). null si nadie vota. Espejo EXACTO de `select_consensus`.
 */
export function selectClusterWinner<Id extends string>(
  league: readonly ClusterRowLike<Id>[],
): ClusterConsensus<Id> | null {
  const eligible = league.filter(
    (row): row is ClusterRowLike<Id> & { k: number; score: number } =>
      row.status === "ok" && row.k !== null && row.score !== null,
  );
  if (eligible.length === 0) return null;
  const byK = new Map<number, (typeof eligible)[number][]>();
  for (const row of eligible) byK.set(row.k, [...(byK.get(row.k) ?? []), row]);
  const rank = (k: number) => {
    const rows = byK.get(k)!;
    return [rows.length, Math.max(...rows.map((r) => r.score)), -k] as const;
  };
  const k = [...byK.keys()].reduce((a, b) => {
    const [ra, rb] = [rank(a), rank(b)];
    for (let i = 0; i < ra.length; i++) {
      if (rb[i]! > ra[i]!) return b;
      if (rb[i]! < ra[i]!) return a;
    }
    return a;
  });
  const winner = byK
    .get(k)!
    .reduce((best, row) => (row.score > best.score ? row : best));
  return {
    k,
    votes: byK.get(k)!.length,
    voters: eligible.length,
    winner: winner.name,
  };
}
