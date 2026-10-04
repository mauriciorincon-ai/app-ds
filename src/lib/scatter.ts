// S6 (P6): la geometría del gráfico estimado-frente-a-real, pura y testeable. El
// componente (PredichoVsReal.tsx) solo dibuja lo que esto calcula.
import type { PredVsReal } from "@/workers/protocol";

/** Un mismo rango para los dos ejes (la diagonal es y = x), con un margen del 4 %. */
export function scatterDomain(points: PredVsReal): [number, number] {
  const values = [...points.real, ...points.predicted];
  if (values.length === 0) return [0, 1];
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi === lo) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.04;
  return [lo - pad, hi + pad];
}

/** Marcas «redondas» (paso 1, 2 o 5 × 10ⁿ) dentro del rango, unas `count`. */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  const raw = (hi - lo) / Math.max(count, 1);
  if (!(raw > 0) || !Number.isFinite(raw)) return [lo];
  const power = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? 10 * power;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) {
    // Sin «−0» ni basura de coma flotante (0.30000000000000004).
    ticks.push(Number((Math.abs(v) < step * 1e-9 ? 0 : v).toPrecision(12)));
  }
  return ticks;
}

/** El paso entre marcas (para elegir con cuántos decimales escribirlas). */
export function tickStep(ticks: readonly number[]): number {
  return ticks.length > 1 ? ticks[1] - ticks[0] : 0;
}

// Rótulos de las marcas (mono de 12 px en el viewBox ≈ 0,6 em por carácter). Con
// cifras de seis dígitos («500,000») el margen fijo dejaba los rótulos del eje
// vertical encima de su título y los del horizontal tocándose (pasada de capturas
// del cierre del S6, ejemplo de precios).
export const TICK_CHAR_WIDTH = 7.2;
/** El margen izquierdo nunca baja de aquí (las cifras cortas no lo necesitan). */
export const MIN_LEFT_MARGIN = 64;
/** Lo que ocupa el título girado del eje vertical, con su aire. */
const AXIS_TITLE_ROOM = 22;
const TICK_GAP = 6;

function widest(labels: readonly string[]): number {
  return Math.max(0, ...labels.map((label) => label.length)) * TICK_CHAR_WIDTH;
}

/** Margen izquierdo para que el rótulo más largo no pise el título del eje. */
export function leftMargin(labels: readonly string[]): number {
  return Math.max(
    MIN_LEFT_MARGIN,
    Math.ceil(AXIS_TITLE_ROOM + widest(labels) + TICK_GAP),
  );
}

/** El margen derecho nunca baja de aquí. */
export const MIN_RIGHT_MARGIN = 12;

/** Margen derecho para que el rótulo de una marca en el borde del rango (centrado
 *  en ella) no se salga del dibujo. */
export function rightMargin(labels: readonly string[]): number {
  return Math.max(MIN_RIGHT_MARGIN, Math.ceil(widest(labels) / 2));
}

/** Cada cuántas marcas se rotula el eje horizontal para que los rótulos, separados
 *  `spacing` unidades, no se toquen. La rejilla se dibuja entera. */
export function labelEvery(labels: readonly string[], spacing: number): number {
  if (!(spacing > 0)) return 1;
  return Math.max(1, Math.ceil((widest(labels) + TICK_GAP) / spacing));
}

/** Cuántas filas de la muestra caen a menos de ±mae de su valor real (0 a 1). */
export function insideBandShare(points: PredVsReal, mae: number): number {
  const n = points.real.length;
  if (n === 0) return 0;
  let inside = 0;
  for (let i = 0; i < n; i++) {
    if (Math.abs(points.predicted[i] - points.real[i]) <= mae) inside += 1;
  }
  return inside / n;
}
