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
