// S6 (D9, AU-S6-15): ¿el modelo tiende a estimar de más o de menos? Lo decide una
// PRUEBA DE SIGNO exacta, no un umbral a ojo. La regla anterior («el error mediano
// supera el 5 % del MAE») decía «tiende a estimar de más» en 74–83 % de las
// corridas de un modelo SIN sesgo con 50 filas de prueba (simulación con residuos
// normales, Laplace y asimétricos; bitácora, D9): leía ruido como tendencia.
//
// La prueba de signo cuenta cuántas estimaciones quedan por encima del valor real
// y cuántas por debajo, y pregunta si ese desbalance podría salir por azar
// (Binomial(n, ½)). Es la prueba de la MEDIANA, sin suponer ninguna forma del
// error. Con α = 5 %, un modelo sin sesgo «se inclina» a lo sumo el 5 % de las
// veces; un sesgo de medio MAE se detecta en 52–92 % de las corridas con 50 filas,
// y en 95–100 % desde 125.
//
// Corre sobre la muestra del gráfico (todos los puntos de prueba hasta el tope de
// 200), y el lado tiene que coincidir con el del error mediano de TODA la prueba.

/** Nivel de la prueba de signo (dos colas). */
export const RESIDUAL_LEAN_ALPHA = 0.05;

export type ResidualLean = "over" | "under" | "none";

function logChoose(n: number, k: number): number {
  let sum = 0;
  for (let i = 1; i <= k; i++) sum += Math.log((n - k + i) / i);
  return sum;
}

/** p-valor exacto, dos colas, de la prueba de signo (los empates no cuentan). */
export function signTestPValue(above: number, below: number): number {
  const n = above + below;
  if (n === 0) return 1;
  const k = Math.min(above, below);
  let tail = 0;
  for (let i = 0; i <= k; i++) tail += Math.exp(logChoose(n, i) - n * Math.LN2);
  return Math.min(1, 2 * tail);
}

/**
 * Hacia dónde se inclina el error (estimado − real). «none» si el desbalance de
 * signos podría ser azar, o si no coincide con el lado del error mediano de toda
 * la prueba: entonces no se afirma ninguna tendencia.
 */
export function residualLean(
  sample: { real: readonly number[]; predicted: readonly number[] },
  medianError: number,
): ResidualLean {
  let above = 0;
  let below = 0;
  sample.real.forEach((real, i) => {
    const error = sample.predicted[i]! - real;
    if (error > 0) above += 1;
    else if (error < 0) below += 1;
  });
  if (signTestPValue(above, below) >= RESIDUAL_LEAN_ALPHA) return "none";
  const lean: ResidualLean = above > below ? "over" : "under";
  const median: ResidualLean =
    medianError > 0 ? "over" : medianError < 0 ? "under" : "none";
  return lean === median ? lean : "none";
}
