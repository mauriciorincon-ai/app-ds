// Plantilla determinista bilingüe: el texto estándar que SIEMPRE existe (es lo
// que se muestra sin consentimiento y el fallback universal cuando el LLM no
// está, falla o miente). Se construye desde el mismo payload estructurado que
// vería el Narrator — mismos números, cero red. Los strings viven en
// messages/{es,en}.json (test de paridad); aquí solo se ensamblan.
import type { EdaAlert } from "@/engine/eda";
import { isFeatureUsed } from "@/engine/explainability";
import type { Locale } from "@/i18n/config";
import { translate } from "@/i18n/translate";
import type { NarrationPayload } from "@/lib/ia/schemas";
import {
  errorReductionPct,
  formatQuantity,
  quantityDecimals,
  withUnit,
} from "@/lib/quantity";
import type { MulticlassResult, RegressionResult } from "@/workers/protocol";

export const TEMPLATE_TOP_FEATURES = 3;

const fmt = (value: number) => value.toFixed(2);

type DirectedFeature = Pick<
  NarrationPayload["explainability"]["features"][number],
  "importance" | "kind" | "direction"
>;

function directionKey(feature: DirectedFeature): string {
  // Misma regla que el gráfico (engine/explainability.ts): importancia 0 ⇒ el
  // modelo no se apoya en ella, y no se le atribuye ningún efecto.
  if (!isFeatureUsed(feature.importance)) return "unused";
  if (feature.kind === "categorical") return "categorical";
  if (feature.direction === null) return "unclear";
  return feature.direction;
}

export function buildTemplateNarrative(payload: NarrationPayload): string {
  const { locale, verdict, explainability, leakage, eda } = payload;
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
    // Gate ⭐ S4 (bloque C): qué mide la métrica y en qué rango vive. Anclas
    // FÁCTICAS (0.50 sería azar, 1.00 perfecto), no etiquetas subjetivas
    // ("alto"/"bajo") — un juicio de valor no es un dato medido.
    t("narration.template.metricNote", {
      metric: t(`results.metrics.${verdict.primaryMetric}`),
      help: t(`narration.template.metricHelp.${verdict.primaryMetric}`),
    }),
    t("narration.template.features", { list }),
    t("narration.template.method"),
  ];

  if (leakage.length > 0) {
    parts.push(
      t("narration.template.leakage", { columns: leakage.join(", ") }),
    );
  }

  // S4 — extensión al informe EDA: cifras deterministas (nunca del LLM). La
  // posible-fuga de la EDA la cubre ya la frase de fuga de arriba; aquí solo se
  // añaden las señales genuinamente nuevas: casi-identificadores y desbalance.
  const idLike = (eda ?? [])
    .filter((alert) => alert.kind === "id-like")
    .map((alert) => alert.column);
  if (idLike.length > 0) {
    parts.push(t("narration.template.idLike", { columns: idLike.join(", ") }));
  }
  const imbalance = (eda ?? []).find(
    (alert) => alert.kind === "class-imbalance",
  );
  if (imbalance && imbalance.kind === "class-imbalance") {
    parts.push(
      t("narration.template.imbalance", {
        rate: (imbalance.minorityRate * 100).toFixed(0),
      }),
    );
  }

  return parts.join(" ");
}

/**
 * S6 (P7): el texto estándar al ESTIMAR una cantidad. Sale del resultado (no hay
 * payload de IA: la narración con IA no narra regresión), con los mismos números
 * que la pantalla — en las unidades del objetivo — y cero red. Vive solo en el
 * navegador: trae valores derivados del objetivo (regla dura 2).
 */
export function buildRegressionTemplate(input: {
  result: RegressionResult;
  locale: Locale;
  edaAlerts?: EdaAlert[] | null;
}): string {
  const { result, locale, edaAlerts } = input;
  const t = (key: string, params?: Record<string, string | number>) =>
    translate(locale, key, params);
  const { verdict } = result;
  const decimals = quantityDecimals([
    verdict.modelScore,
    verdict.baselineScore,
  ]);
  const q = (value: number) =>
    withUnit(formatQuantity(value, decimals), result.unit);

  const direction = (feature: DirectedFeature) => {
    const key = directionKey(feature);
    return key === "positive" || key === "negative"
      ? t(`narration.template.regression.direction.${key}`)
      : t(`narration.template.direction.${key}`);
  };
  const list = result.explainability.features
    .slice(0, TEMPLATE_TOP_FEATURES)
    .map((feature) => `${feature.name} (${direction(feature)})`)
    .join(" · ");

  const parts = [
    t(`narration.template.regression.verdict.${verdict.level}`, {
      model: q(verdict.modelScore),
      baseline: q(verdict.baselineScore),
      pct: errorReductionPct(verdict.modelScore, verdict.baselineScore),
    }),
    t("narration.template.regression.metricNote", {
      r2: result.model.r2.toFixed(2),
    }),
    t("narration.template.features", { list }),
    t("narration.template.method"),
  ];

  if (result.leakage.length > 0) {
    parts.push(
      t("narration.template.leakage", {
        columns: result.leakage.map((finding) => finding.column).join(", "),
      }),
    );
  }
  // Las columnas con pinta de identificador, en UNA frase, como en la binaria
  // (AU-S6-40).
  const idLike = (edaAlerts ?? [])
    .filter((alert) => alert.kind === "id-like")
    .map((alert) => alert.column);
  if (idLike.length > 0) {
    parts.push(t("narration.template.idLike", { columns: idLike.join(", ") }));
  }
  for (const alert of edaAlerts ?? []) {
    if (alert.kind === "target-skewed") {
      parts.push(
        t("narration.template.regression.skewed", {
          skew: alert.skew.toFixed(1),
        }),
      );
    } else if (alert.kind === "target-outliers") {
      parts.push(
        t("narration.template.regression.outliers", {
          share: (alert.share * 100).toFixed(1),
        }),
      );
    }
  }
  return parts.join(" ");
}

/**
 * S7 (P10): el texto estándar al clasificar en VARIAS categorías. Como en la
 * regresión, sale del resultado (la IA no narra esta tarea), con los mismos
 * números que la pantalla y cero red. Nombra clases del objetivo: vive solo en el
 * navegador (regla dura 2).
 */
export function buildMulticlassTemplate(input: {
  result: MulticlassResult;
  locale: Locale;
  edaAlerts?: EdaAlert[] | null;
}): string {
  const { result, locale, edaAlerts } = input;
  const t = (key: string, params?: Record<string, string | number>) =>
    translate(locale, key, params);
  const { verdict } = result;
  const k = result.classes.length;

  // Con K clases la permutación no tiene dirección (pipeline.py): se nombra el
  // peso, y solo «no se apoya en ella» cuando no lo tiene.
  const list = result.explainability.features
    .slice(0, TEMPLATE_TOP_FEATURES)
    .map((feature) =>
      isFeatureUsed(feature.importance)
        ? feature.name
        : `${feature.name} (${t("narration.template.direction.unused")})`,
    )
    .join(" · ");

  const parts = [
    t(`narration.template.verdict.${verdict.level}`, {
      model: fmt(verdict.modelScore),
      baseline: fmt(verdict.baselineScore),
      metric: t(`results.metrics.${verdict.primaryMetric}`),
      delta: fmt(Math.abs(verdict.delta)),
    }),
    t("narration.template.multiclass.metricNote", {
      k,
      chance: fmt(1 / k),
      f1: fmt(result.model.f1_macro),
    }),
    t("narration.template.features", { list }),
    t("narration.template.multiclass.noDirection"),
    t("narration.template.method"),
  ];

  if (result.leakage.length > 0) {
    const columns = result.leakage
      .map((finding) =>
        finding.class === undefined
          ? finding.column
          : t("narration.template.multiclass.leakageItem", {
              column: finding.column,
              class: finding.class,
            }),
      )
      .join(", ");
    parts.push(t("narration.template.multiclass.leakage", { columns }));
  }
  const idLike = (edaAlerts ?? [])
    .filter((alert) => alert.kind === "id-like")
    .map((alert) => alert.column);
  if (idLike.length > 0) {
    parts.push(t("narration.template.idLike", { columns: idLike.join(", ") }));
  }
  for (const alert of edaAlerts ?? []) {
    if (alert.kind === "class-imbalance" && alert.class !== undefined) {
      parts.push(
        t("narration.template.multiclass.imbalance", {
          class: alert.class,
          rate: (alert.minorityRate * 100).toFixed(0),
        }),
      );
    }
  }
  return parts.join(" ");
}
