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

export type VerdictLevel = "beats" | "ties" | "loses";

export type Verdict = {
  level: VerdictLevel;
  primaryMetric: MetricName;
  modelScore: number;
  baselineScore: number;
  delta: number;
};

// Margen dentro del cual modelo ≈ baseline → empate honesto (no inflar una
// mejora marginal como victoria).
export const TIE_EPSILON = 0.01;

/**
 * Con clases desbalanceadas, AUC (independiente del umbral; el baseline de clase
 * mayoritaria vale 0.5) es más honesto que F1. Con clases balanceadas, F1
 * resume bien el equilibrio precisión/recall.
 */
export function pickPrimaryMetric(positiveRate: number): MetricName {
  const imbalance = Math.abs(positiveRate - 0.5);
  return imbalance >= 0.15 ? "auc" : "f1";
}

/** El baseline más fuerte en la métrica primaria: el rival honesto a batir. */
export function pickBestBaseline(
  baselines: readonly Metrics[],
  metric: MetricName,
): Metrics {
  if (baselines.length === 0) {
    throw new Error("pickBestBaseline: se requiere al menos un baseline");
  }
  return baselines.reduce((best, candidate) =>
    candidate[metric] > best[metric] ? candidate : best,
  );
}

/**
 * Compara el modelo contra el baseline en la métrica primaria y emite el
 * veredicto. `delta > TIE_EPSILON` ⇒ supera; `delta < -TIE_EPSILON` ⇒ no supera;
 * en medio ⇒ empate.
 */
export function computeVerdict(
  model: Metrics,
  baseline: Metrics,
  primaryMetric: MetricName,
): Verdict {
  const modelScore = model[primaryMetric];
  const baselineScore = baseline[primaryMetric];
  const delta = modelScore - baselineScore;

  let level: VerdictLevel;
  if (delta > TIE_EPSILON) {
    level = "beats";
  } else if (delta < -TIE_EPSILON) {
    level = "loses";
  } else {
    level = "ties";
  }

  return { level, primaryMetric, modelScore, baselineScore, delta };
}
