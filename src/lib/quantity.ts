// S6 (R9): cifras en las unidades del objetivo. Las métricas de clasificación
// viven entre 0 y 1 y se leen con `toFixed`; un error en kWh o en USD no. Aquí se
// formatean con el MISMO separador decimal que el resto de la app (punto) y miles
// con coma, en los dos idiomas, y con las cifras significativas justas para leer
// la diferencia sin inventar precisión.
import { TARGET_DECIMALS_MAX } from "@/workers/contract";
import type { TargetUnit } from "@/workers/protocol";

/** Cifras significativas del valor más pequeño de un grupo que se compara. */
export const QUANTITY_SIG_DIGITS = 3;

/**
 * Decimales para mostrar JUNTOS varios valores (p. ej. el MAE del modelo y el del
 * baseline): los que necesita el más pequeño para tener 3 cifras significativas,
 * entre 0 y el tope del contrato.
 */
export function quantityDecimals(
  values: readonly number[],
  sig: number = QUANTITY_SIG_DIGITS,
): number {
  const sizes = values
    .map((v) => Math.abs(v))
    .filter((v) => v > 0 && Number.isFinite(v));
  if (sizes.length === 0) return 0;
  const smallest = Math.min(...sizes);
  const decimals = sig - 1 - Math.floor(Math.log10(smallest));
  return Math.min(Math.max(decimals, 0), TARGET_DECIMALS_MAX);
}

const formatters = new Map<number, Intl.NumberFormat>();

/** El número con `decimals` decimales fijos, punto decimal y miles con coma. */
export function formatQuantity(value: number, decimals: number): string {
  let formatter = formatters.get(decimals);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    formatters.set(decimals, formatter);
  }
  // −0 se escribe 0 (un residuo de −0.0 no dice nada que 0.0 no diga), también
  // cuando lo produce el redondeo: −0.004 con un decimal es «0.0» (AU-S6-15).
  return formatter.format(Number(value.toFixed(decimals)) === 0 ? 0 : value);
}

/** «33.3 kWh» si la unidad se conoce; si no, el número solo (la UI dice de qué
 *  columna). Espacio NO separable: «33.3» y «kWh» nunca quedan en líneas distintas. */
export function withUnit(text: string, unit: TargetUnit): string {
  return unit.symbol ? `${text}\u00a0${unit.symbol}` : text;
}

/** Cuánto MENOS se equivoca el modelo que el baseline, en % del error del baseline. */
export function errorReductionPct(model: number, baseline: number): number {
  if (baseline === 0) return 0;
  return Math.round(((baseline - model) / baseline) * 100);
}
