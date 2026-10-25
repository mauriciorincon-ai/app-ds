// S17: cómo se escribe una cifra de la prueba de estrés. Como el resto de la app: la exactitud y compañía en
// porcentaje entero; el AUC y el F1 con dos decimales; el error medio en las unidades del objetivo.
import type { PrimaryMetric } from "@/engine/verdict";
import { formatQuantity, quantityDecimals, withUnit } from "@/lib/quantity";
import type { StressResult, TargetUnit } from "@/workers/protocol";

const PROPORCIONES: ReadonlySet<PrimaryMetric> = new Set([
  "accuracy",
  "balanced_accuracy",
  "precision",
  "recall",
]);

export type Formato = (value: number) => string;

/** El escritor de cifras de UN resultado: con los decimales que necesitan juntos todos sus valores (el error medio). */
export function formatoDe(
  r: StressResult,
  rival: number,
  unit: TargetUnit | null,
): Formato {
  const metric = r.metric.name;
  if (metric === "mae") {
    const decimals = quantityDecimals([
      r.base,
      rival,
      ...r.noise.map((n) => n.value),
      ...r.shuffle.map((s) => s.value),
      ...r.shift.map((s) => s.value),
    ]);
    return (v) => {
      const q = formatQuantity(v, decimals);
      return unit ? withUnit(q, unit) : q;
    };
  }
  if (PROPORCIONES.has(metric)) return (v) => `${Math.round(v * 100)} %`;
  return (v) => v.toFixed(2);
}

/** «Exactitud» → «exactitud» en medio de una frase; «AUC», «F1» y «MAE» se quedan como están. */
export function enFrase(label: string): string {
  return /^[A-Z0-9]+$/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1);
}
