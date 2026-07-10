// Plantilla determinista bilingüe: el texto estándar que SIEMPRE existe (es lo
// que se muestra sin consentimiento y el fallback universal cuando el LLM no
// está, falla o miente). Se construye desde el mismo payload estructurado que
// vería el Narrator — mismos números, cero red. Los strings viven en
// messages/{es,en}.json (test de paridad); aquí solo se ensamblan.
import { translate } from "@/i18n/translate";
import type { NarrationPayload } from "@/lib/ia/schemas";

export const TEMPLATE_TOP_FEATURES = 3;

const fmt = (value: number) => value.toFixed(2);

function directionKey(
  feature: NarrationPayload["explainability"]["features"][number],
): string {
  if (feature.kind === "categorical") return "categorical";
  if (feature.direction === null) return "unclear";
  return feature.direction;
}

export function buildTemplateNarrative(payload: NarrationPayload): string {
  const { locale, verdict, explainability, leakage } = payload;
  const t = (key: string, params?: Record<string, string | number>) =>
    translate(locale, key, params);

  const verdictSentence = t(`narration.template.verdict.${verdict.level}`, {
    model: fmt(verdict.modelScore),
    baseline: fmt(verdict.baselineScore),
    metric: t(`results.metrics.${verdict.primaryMetric}`),
    delta: fmt(Math.abs(verdict.delta)),
  });

  const list = explainability.features
    .slice(0, TEMPLATE_TOP_FEATURES)
    .map(
      (feature) =>
        `${feature.name} (${t(`narration.template.direction.${directionKey(feature)}`)})`,
    )
    .join(" · ");

  const parts = [
    verdictSentence,
    t("narration.template.features", { list }),
    t("narration.template.method"),
  ];

  if (leakage.length > 0) {
    parts.push(
      t("narration.template.leakage", { columns: leakage.join(", ") }),
    );
  }

  return parts.join(" ");
}
