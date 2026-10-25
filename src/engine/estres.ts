// La prueba de estrés (S17, ADR 023) — LA LECTURA. Python (pipeline.py, `run_stress` / `run_stress_test`) perturba la
// prueba YA ABIERTA con semilla fija y mide la métrica primaria del veredicto; aquí se decide qué dicen esas cifras:
// cuánto cae cada nivel, qué columna duele más y si, con ruido, el modelo SIGUE ganándole a su rival sin modelo.
// No elige nada ni abre la prueba otra vez. El juicio es la regla de siempre (`computeVerdict` con `METRIC_RULES`): no
// se inventa un umbral nuevo. La cifra se ve aunque el criterio no pase.
import type { StressResult } from "@/workers/protocol";
import { METRIC_RULES, computeVerdict, type PrimaryMetric } from "./verdict";

/** Espejo de pipeline.py (STRESS_*): paridad vigilada en tests/unit/estres.test.ts. */
export const NOISE_LEVELS = [0.05, 0.1, 0.2] as const;
export const SHIFT_LEVELS = [0.5, 1] as const;
export const SHUFFLE_REPEATS = 5;
export const SHIFT_COLUMNS = 3;
/** El nivel con que se juzga y con que se escribe el sello de la ficha: 10 % de la desviación (ADR 023). */
export const SEAL_NOISE_LEVEL = 0.1;
/** Un cambio menor que esto (medio punto, o 0,5 % del error base) se lee «casi igual», no «cae» ni «mejora». */
export const SAME_TOLERANCE = 0.005;

export type Direction = StressResult["metric"]["direction"];

/** Cuánto PEOR quedó el modelo: positivo = peor, según la dirección de la métrica. */
export function worsening(
  direction: Direction,
  base: number,
  value: number,
): number {
  return direction === "higher" ? base - value : value - base;
}

export type Trend = "worse" | "same" | "better";

export function trendOf(r: StressResult, value: number): Trend {
  const delta = worsening(r.metric.direction, r.base, value);
  const tolerance =
    METRIC_RULES[r.metric.name].tolerance.kind === "relative"
      ? Math.abs(r.base) * SAME_TOLERANCE
      : SAME_TOLERANCE;
  if (delta > tolerance) return "worse";
  if (delta < -tolerance) return "better";
  return "same";
}

/** El renglón de ruido de un nivel, o `undefined` si ese nivel no se midió. */
export function noiseAt(r: StressResult, level: number) {
  return r.noise.find((n) => n.level === level);
}

/** La columna que más dolió al barajarla, o `null` si ninguna empeora el resultado. */
export function worstColumn(r: StressResult) {
  const first = r.shuffle[0];
  if (!first) return null;
  return worsening(r.metric.direction, r.base, first.value) > 0 ? first : null;
}

export type Robustness =
  /** No hay numéricas donde poner ruido: el sello dice que no se midió. */
  | { readonly kind: "no-noise" }
  /** Con ruido el modelo sigue ganándole a su rival sin modelo. */
  | RobustnessReading<"holds">
  /** Con ruido deja de ganarle (o ya no le ganaba sin ruido). */
  | (RobustnessReading<"drops"> & { readonly alreadyLost: boolean });

type RobustnessReading<K extends string> = {
  readonly kind: K;
  readonly level: number;
  readonly base: number;
  readonly value: number;
  readonly rival: number;
  readonly metric: PrimaryMetric;
};

/**
 * El criterio del ✓ (ADR 023), sobre cifras sueltas: con el ruido del sello (10 %) el modelo sigue ganándole a su
 * rival sin modelo en la métrica primaria, con el veredicto de siempre. La ficha del Protocolo lo recalcula desde
 * el cuaderno (que guarda la base, el valor con ruido y el rival) con esta misma función.
 */
export function robustnessOf(
  metric: PrimaryMetric,
  base: number,
  noisy: number,
  rival: number,
): Robustness {
  const scored = (v: number) => ({ [metric]: v }) as Record<PrimaryMetric, number>;
  const reading = { level: SEAL_NOISE_LEVEL, base, value: noisy, rival, metric };
  if (computeVerdict(scored(noisy), scored(rival), metric).level === "beats")
    return { kind: "holds", ...reading };
  const alreadyLost =
    computeVerdict(scored(base), scored(rival), metric).level !== "beats";
  return { kind: "drops", ...reading, alreadyLost };
}

/** Lo mismo desde el resultado del worker. `rival` es el mejor sin modelo (el del veredicto en Probeta; en la etapa 8, el que mide Python). */
export function robustness(r: StressResult, rival: number): Robustness {
  const noisy = noiseAt(r, SEAL_NOISE_LEVEL);
  if (!noisy) return { kind: "no-noise" };
  return robustnessOf(r.metric.name, r.base, noisy.value, rival);
}
