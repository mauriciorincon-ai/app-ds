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
