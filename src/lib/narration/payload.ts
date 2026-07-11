// Ensamblador del payload de narración: reduce el resultado del experimento a
// metadatos agregados (nombres de columnas, importancias, métricas, veredicto).
// GARANTÍA DE PRIVACIDAD (regla dura 2 + ADR de privacidad): aquí no entra
// ninguna fila ni valor del dataset — ni siquiera la etiqueta de la clase
// positiva (es un valor de celda). El test unit falla si esto se rompe.
import type { Locale } from "@/i18n/config";
import type { NarrationPayload } from "@/lib/ia/schemas";
import type { ExperimentResult } from "@/workers/protocol";

export const NARRATION_TOP_FEATURES = 8;

const round4 = (value: number) => Math.round(value * 10_000) / 10_000;
const clamp01 = (value: number) => Math.min(1, Math.max(0, round4(value)));

export function buildNarrationPayload(input: {
  result: ExperimentResult;
  target: string;
  cols: number;
  locale: Locale;
}): NarrationPayload {
  const { result, target, cols, locale } = input;
  const { model, verdict, explainability } = result;

  return {
    locale,
    problem: "binary-classification",
    target,
    dataset: { rows: result.nTrain + result.nTest, cols },
    metrics: {
      accuracy: clamp01(model.accuracy),
      precision: clamp01(model.precision),
      recall: clamp01(model.recall),
      f1: clamp01(model.f1),
      auc: clamp01(model.auc),
    },
    verdict: {
      level: verdict.level,
      primaryMetric: verdict.primaryMetric,
      modelScore: clamp01(verdict.modelScore),
      baselineScore: clamp01(verdict.baselineScore),
      delta: round4(verdict.delta),
    },
    explainability: {
      method: explainability.method,
      scoring: explainability.scoring,
      features: explainability.features
        .slice(0, NARRATION_TOP_FEATURES)
        .map((feature) => ({
          name: feature.name,
          kind: feature.kind,
          importance: round4(feature.importance),
          direction: feature.direction,
        })),
    },
    leakage: result.leakage.map((finding) => finding.column),
  };
}
