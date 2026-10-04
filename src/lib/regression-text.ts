// S6: el veredicto de ESTIMAR en palabras, en UN solo sitio — lo usan la
// pantalla (RegressionVerdict) y la model card. En las unidades del objetivo,
// contra el mejor baseline (mediana o lineal), con la regla de R10: la lineal es
// baseline Y miembro, y su titular de empate aparece SOLO cuando empata.
import type { TParams } from "@/i18n/translate";
import { bestRegressionBaseline } from "@/lib/experiment";
import {
  errorReductionPct,
  formatQuantity,
  quantityDecimals,
  withUnit,
} from "@/lib/quantity";
import type { RegressionResult } from "@/workers/protocol";

type T = (key: string, params?: TParams) => string;

/** Formateador de un grupo de cantidades comparables (mismos decimales). */
export function quantityFormatter(
  result: Pick<RegressionResult, "unit">,
  values: readonly number[],
): (value: number) => string {
  const decimals = quantityDecimals(values);
  return (value) => withUnit(formatQuantity(value, decimals), result.unit);
}

/**
 * Las importancias al estimar (cuánto SUBE el MAE al permutar la columna) están en
 * las unidades del objetivo: se escriben como las demás cantidades (R9, AU-S6-21),
 * con las cifras significativas de la MAYOR (una importancia diminuta no obliga a
 * escribir todas con seis decimales).
 */
export function importanceFormatter(
  result: Pick<RegressionResult, "unit">,
  importances: readonly number[],
): (value: number) => string {
  const largest = Math.max(0, ...importances.map((v) => Math.abs(v)));
  const decimals = quantityDecimals([largest]);
  return (value) => withUnit(formatQuantity(value, decimals), result.unit);
}

export type RegressionVerdictText = {
  /** La lineal ganó la liga y empata consigo misma (titular propio, R10). */
  linearTie: boolean;
  headline: string;
  detail: string;
};

export function regressionVerdictText(
  result: RegressionResult,
  t: T,
): RegressionVerdictText {
  const { verdict } = result;
  const q = quantityFormatter(result, [
    verdict.modelScore,
    verdict.baselineScore,
  ]);
  const baselineId = bestRegressionBaseline(result.baselines);
  // R10: la lineal empata CONSIGO MISMA solo si el baseline que decide es la
  // lineal. Si decide la mediana, el empate es con adivinar una constante: el
  // titular normal la nombra (AU-S6-18).
  const linearTie =
    result.modelName === "linear" &&
    result.selection.by === "cv" &&
    verdict.level === "ties" &&
    baselineId === "linear";
  if (linearTie) {
    return {
      linearTie,
      headline: t("results.regression.verdict.linearTie"),
      detail: t("results.regression.verdict.linearTieDetail", {
        model: q(verdict.modelScore),
      }),
    };
  }
  const median = result.targetStats.median;
  return {
    linearTie,
    headline: t(`results.verdict.${verdict.level}`, {
      name: t(`results.candidates.short.${result.modelName}`),
    }),
    detail: t(`results.regression.verdict.${verdict.level}Detail`, {
      model: q(verdict.modelScore),
      baseline: t(`results.regression.verdict.baseline.${baselineId}`, {
        value: quantityFormatter(result, [median])(median),
      }),
      reference: q(verdict.baselineScore),
      pct: errorReductionPct(verdict.modelScore, verdict.baselineScore),
    }),
  };
}
