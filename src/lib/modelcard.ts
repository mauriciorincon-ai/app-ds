// Ensamblador determinista de la model card (markdown descargable): la
// constancia del experimento — datos, partición, método, métricas en test,
// veredicto, fuga, explicabilidad y límites. Se genera 100% client-side desde
// el estado del experimento (aquí SÍ puede aparecer la clase positiva: el
// documento nunca sale del equipo salvo que el usuario lo comparta). Cita la
// narración IA SOLO si quedó verificada. Strings en messages/{es,en}.json.
import type { Locale } from "@/i18n/config";
import { translate, type TParams } from "@/i18n/translate";
import type { MetricName } from "@/engine/verdict";
import { datasetSlug } from "@/lib/files";
import type { ExperimentResult } from "@/workers/protocol";

export type ModelCardInput = {
  locale: Locale;
  datasetName: string;
  /** Columnas totales de la tabla (incluye objetivo y fechas ignoradas). */
  cols: number;
  numericFeatures: number;
  categoricalFeatures: number;
  target: string;
  seed: number;
  result: ExperimentResult;
  /** Narración IA que PASÓ la verificación numérica; null ⇒ no se cita. */
  verifiedNarrative: string | null;
  /** Inyectable para tests deterministas. */
  date?: Date;
};

const METRICS: MetricName[] = ["accuracy", "precision", "recall", "f1", "auc"];

const fmt = (value: number) => value.toFixed(2);

const DIRECTION_KEY: Record<string, string> = {
  positive: "positive",
  negative: "negative",
};

export function buildModelCard(input: ModelCardInput): string {
  const { locale, result } = input;
  const t = (key: string, params?: TParams) => translate(locale, key, params);
  const section = (key: string) => `## ${t(`modelcard.sections.${key}`)}`;

  const date = (input.date ?? new Date()).toLocaleDateString(
    locale === "es" ? "es-ES" : "en-US",
    { year: "numeric", month: "long", day: "numeric" },
  );

  const metricsTable = [
    `| ${t("modelcard.metrics.metric")} | ${t("modelcard.metrics.model")} | ${t("results.baselines.majority")} | ${t("results.baselines.logistic")} |`,
    "| --- | --- | --- | --- |",
    ...METRICS.map(
      (metric) =>
        `| ${t(`results.metrics.${metric}`)} | ${fmt(result.model[metric])} | ${fmt(result.baselines.majority[metric])} | ${fmt(result.baselines.logistic[metric])} |`,
    ),
  ].join("\n");

  const explainTable = [
    `| ${t("modelcard.explainability.feature")} | ${t("modelcard.explainability.kind")} | ${t("modelcard.explainability.importance")} | ${t("modelcard.explainability.direction")} |`,
    "| --- | --- | --- | --- |",
    ...result.explainability.features.map((feature) => {
      const kind = t(`config.profile.${feature.kind}`);
      const directionKey =
        feature.kind === "categorical"
          ? "categorical"
          : (DIRECTION_KEY[feature.direction ?? ""] ?? "unclear");
      const direction = t(`narration.template.direction.${directionKey}`);
      return `| ${feature.name} | ${kind} | ${feature.importance.toFixed(4)} | ${direction} |`;
    }),
  ].join("\n");

  const verdictHeadline = t(`results.verdict.${result.verdict.level}`);
  const verdictDetail = t(`results.verdict.${result.verdict.level}Detail`, {
    delta: `+${fmt(result.verdict.delta)}`,
    metric: t(`results.metrics.${result.verdict.primaryMetric}`),
    model: fmt(result.verdict.modelScore),
    baseline: fmt(result.verdict.baselineScore),
  });

  const leakageBlock =
    result.leakage.length > 0
      ? t("modelcard.leakage.found", {
          columns: result.leakage.map((f) => `«${f.column}»`).join(", "),
        })
      : t("modelcard.leakage.none");

  const narrativeBlock =
    input.verifiedNarrative !== null
      ? `${section("narrative")}\n\n> ${input.verifiedNarrative}`
      : `${section("narrative")}\n\n${t("modelcard.explainability.notVerified")}`;

  return [
    `# ${t("modelcard.title", { name: input.datasetName })}`,
    "",
    t("modelcard.generated", { date }),
    "",
    section("data"),
    "",
    `- ${t("modelcard.data.dataset", { name: input.datasetName })}`,
    `- ${t("modelcard.data.shape", {
      rows: result.nTrain + result.nTest,
      cols: input.cols,
      numeric: input.numericFeatures,
      categorical: input.categoricalFeatures,
    })}`,
    `- ${t("modelcard.data.target", {
      target: input.target,
      positive: result.positiveClass,
    })}`,
    "",
    section("split"),
    "",
    `- ${t("modelcard.split.sizes", {
      train: result.nTrain,
      test: result.nTest,
      seed: input.seed,
    })}`,
    `- ${t("modelcard.split.rule")}`,
    "",
    section("method"),
    "",
    `- ${t("modelcard.method.pipeline")}`,
    `- ${t("modelcard.method.models")}`,
    "",
    section("metrics"),
    "",
    metricsTable,
    "",
    t("results.testNote"),
    "",
    section("verdict"),
    "",
    `**${verdictHeadline}** — ${verdictDetail}`,
    "",
    t("modelcard.verdict.primary", {
      metric: t(`results.metrics.${result.verdict.primaryMetric}`),
    }),
    "",
    section("leakage"),
    "",
    leakageBlock,
    "",
    section("explainability"),
    "",
    t("modelcard.explainability.method", {
      scoring: result.explainability.scoring,
      repeats: result.explainability.n_repeats,
    }),
    "",
    explainTable,
    "",
    narrativeBlock,
    "",
    section("limits"),
    "",
    `- ${t("modelcard.limits.binary")}`,
    `- ${t("modelcard.limits.leakage")}`,
    `- ${t("modelcard.limits.explainability")}`,
    `- ${t("modelcard.limits.dates")}`,
    "",
  ].join("\n");
}

export function modelCardFileName(datasetName: string): string {
  return `model-card-${datasetSlug(datasetName) || "experimento"}.md`;
}
