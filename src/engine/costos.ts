// Modelo de costos de la liga (S5, ADR-010): cuánto tarda cada miembro, ANTES de
// entrenar, para repartir Nivel 1 / Nivel 2 contra el techo (D3) y estimar el
// Nivel 2 con honestidad. Coeficientes ajustados en el spike de la F0
// (sprints/SPRINT_005-spike-costos.md, Chromium 151 sobre el build de producción,
// roster propuesto con MLP de parada temprana):
//
//   t_cv5 ≈ t0 + a · (n_train/1000)^b · (ancho/33)^c      [segundos, CV k=5]
//
// Un equipo concreto tarda distinto (WebKit ~1,4× en 2.000–5.000 filas; un móvil
// 2–4×): por eso la estimación del Nivel 2 se CALIBRA con lo que el Nivel 1 tardó
// de verdad en el equipo del usuario.
import type { MemberId } from "@/engine/roster";

export type CostCoefficients = { t0: number; a: number; b: number; c: number };

export const COST_COEFFICIENTS: Record<MemberId, CostCoefficients> = {
  logistic: { t0: 0.037, a: 0.0243, b: 0.833, c: 0.593 },
  logistic_balanced: { t0: 0.038, a: 0.0179, b: 0.951, c: 0.597 },
  ridge: { t0: 0.035, a: 0.0181, b: 0.974, c: 1.142 },
  naive_bayes: { t0: 0.033, a: 0.0144, b: 0.97, c: 0.485 },
  linear_svc: { t0: 0.034, a: 0.0154, b: 0.964, c: 0.567 },
  decision_tree: { t0: 0.034, a: 0.0269, b: 1.11, c: 0.838 },
  knn: { t0: 0.034, a: 0.0198, b: 1.569, c: 0.452 },
  hgb: { t0: 0.084, a: 0.5077, b: 0.39, c: 0.69 },
  lightgbm: { t0: 0.081, a: 0.5529, b: 0.43, c: 0.65 },
  xgboost: { t0: 0.088, a: 0.4652, b: 0.56, c: 0.96 },
  extra_trees: { t0: 0.495, a: 0.4198, b: 1.157, c: 0.353 },
  forest: { t0: 0.676, a: 0.4323, b: 1.359, c: 0.548 },
  forest_balanced: { t0: 0.675, a: 0.4834, b: 1.28, c: 0.51 },
  mlp: { t0: 0.1, a: 0.8409, b: 0.74, c: 0.24 },
};

/** Ancho de referencia del ajuste (columnas tras one-hot de los sintéticos). */
const REFERENCE_WIDTH = 33;
/** Fracción de train con que se ajusta cada fold en la CV de referencia (k=5). */
const REFERENCE_FRACTION = 4 / 5;

export type CostInput = {
  /** Filas de entrenamiento. */
  nTrain: number;
  /** Columnas tras one-hot (estimadas sin ajustar nada). */
  width: number;
  /** Pliegues de la CV. */
  k: number;
};

/**
 * Segundos estimados para UN miembro: su CV con k pliegues + el ajuste en train
 * completo + la predicción en test (F0-5: el test de todos se calcula en la misma
 * corrida). Un ajuste sobre la fracción f de train cuesta ≈ t0/5 + (t_cv5 − t0)/5
 * · (f/0.8)^b; la CV son k ajustes sobre (k−1)/k y el final, uno sobre todo train.
 */
export function estimateMemberSeconds(
  member: MemberId,
  input: CostInput,
): number {
  const { t0, a, b, c } = COST_COEFFICIENTS[member];
  const nTrain = Math.max(input.nTrain, 1);
  const width = Math.max(input.width, 1);
  const variable = a * (nTrain / 1000) ** b * (width / REFERENCE_WIDTH) ** c;
  const fit = (fraction: number) =>
    t0 / 5 + (variable / 5) * (fraction / REFERENCE_FRACTION) ** b;
  const cv = input.k * fit((input.k - 1) / input.k);
  return cv + fit(1);
}

/** Factor de calibración: cuánto más lento (o rápido) es este equipo que la referencia. */
export const CALIBRATION_MIN = 0.25;
export const CALIBRATION_MAX = 8;

/**
 * Lo que el Nivel 1 tardó DE VERDAD frente a lo que se estimó: el factor con que
 * se corrige la estimación del Nivel 2. Acotado para que una medición rara (una
 * pestaña en segundo plano) no prometa ni amenace de más.
 */
export function calibrationFactor(
  measuredMs: number,
  estimatedS: number,
): number {
  if (!(measuredMs > 0) || !(estimatedS > 0)) return 1;
  const factor = measuredMs / 1000 / estimatedS;
  return Math.min(CALIBRATION_MAX, Math.max(CALIBRATION_MIN, factor));
}
