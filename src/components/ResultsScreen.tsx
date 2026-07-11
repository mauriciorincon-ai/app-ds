"use client";

import type { MetricName } from "@/engine/verdict";
import { useT } from "@/i18n/use-translation";
import { useConsent } from "@/lib/useConsent";
import { useNarration } from "@/lib/useNarration";
import type { RunMeta } from "@/lib/useExperiment";
import type { ExperimentResult } from "@/workers/protocol";
import { ModelCardView } from "./ModelCardView";
import { WhySection } from "./WhySection";
import { Button, Card, MetricTile } from "./ui";

const METRIC_KEYS: MetricName[] = [
  "accuracy",
  "precision",
  "recall",
  "f1",
  "auc",
];

type BannerTone = "positive" | "negative" | "caution" | "ink";

const TONE_CLASS: Record<BannerTone, string> = {
  positive: "text-positive",
  negative: "text-negative",
  caution: "text-caution",
  ink: "text-ink",
};

const LEVEL_MARK: Record<string, { tone: BannerTone; mark: string }> = {
  beats: { tone: "positive", mark: "▲" },
  ties: { tone: "ink", mark: "＝" },
  loses: { tone: "negative", mark: "▼" },
};

export function ResultsScreen({
  result,
  datasetName,
  cols,
  runMeta,
  onAgain,
}: {
  result: ExperimentResult;
  datasetName: string | null;
  cols: number;
  runMeta: RunMeta;
  onAgain: () => void;
}) {
  const t = useT();
  const { verdict, model, leakage, confusionMatrix } = result;
  const { consent, setConsent } = useConsent();
  const { narration, retryNarration } = useNarration({
    result,
    target: runMeta.target,
    cols,
    consent,
  });
  // Re-activar el consentimiento reintenta la narración (si la anterior falló,
  // el toggle no puede sentirse "muerto": siempre se ve cargar → resultado).
  const handleConsentChange = (next: boolean) => {
    if (next && !consent) retryNarration();
    setConsent(next);
  };
  const hasLeak = leakage.length > 0;
  const fmt = (value: number) => value.toFixed(2);
  const metricLabel = (metric: MetricName) => t(`results.metrics.${metric}`);

  const banner = hasLeak
    ? {
        tone: "caution" as BannerTone,
        mark: "⚠",
        headline: t("results.verdict.suspicious"),
        detail: t("results.verdict.suspiciousDetail"),
      }
    : {
        ...LEVEL_MARK[verdict.level],
        headline: t(`results.verdict.${verdict.level}`),
        detail: t(`results.verdict.${verdict.level}Detail`, {
          delta: `+${fmt(verdict.delta)}`,
          metric: metricLabel(verdict.primaryMetric),
          model: fmt(verdict.modelScore),
          baseline: fmt(verdict.baselineScore),
        }),
      };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {t("results.title")}
        </p>
        {datasetName && (
          <p className="font-mono text-sm tabular-nums text-ink-muted">
            {t("results.dataset", {
              name: datasetName,
              rows: result.nTrain + result.nTest,
            })}
          </p>
        )}
      </header>

      {/* Pieza jerárquica: el veredicto. */}
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className={`text-2xl ${TONE_CLASS[banner.tone]}`} aria-hidden>
            {banner.mark}
          </span>
          <div>
            <h1 className={`text-xl font-semibold ${TONE_CLASS[banner.tone]}`}>
              {banner.headline}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">{banner.detail}</p>
          </div>
        </div>
      </Card>

      {hasLeak && (
        <div className="rounded-md border border-caution/40 bg-caution/10 p-4">
          <p className="mb-1 font-medium text-caution">
            <span aria-hidden className="mr-1">
              ⚠
            </span>
            {t("results.leakage.title")}
          </p>
          <ul className="ml-5 list-disc text-sm">
            {leakage.map((finding) => (
              <li key={finding.column}>
                {t("results.leakage.finding", { column: finding.column })}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-ink-muted">
            {t("results.leakage.hint")}
          </p>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {t("results.primaryMetric", {
            metric: metricLabel(verdict.primaryMetric),
          })}
        </p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {METRIC_KEYS.map((metric) => (
            <MetricTile
              key={metric}
              label={metricLabel(metric)}
              value={fmt(model[metric])}
            />
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
        <Card className="w-fit p-4">
          <table className="border-collapse font-mono text-sm tabular-nums">
            <caption className="mb-2 text-left font-sans text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {t("results.confusion.title")}
            </caption>
            <thead>
              <tr>
                <td />
                <th className="px-3 py-1 text-xs font-normal text-ink-muted">
                  {t("results.confusion.pred", { label: 0 })}
                </th>
                <th className="px-3 py-1 text-xs font-normal text-ink-muted">
                  {t("results.confusion.pred", { label: 1 })}
                </th>
              </tr>
            </thead>
            <tbody>
              {confusionMatrix.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  <th className="px-3 py-1 text-left text-xs font-normal text-ink-muted">
                    {t("results.confusion.real", { label: rowIndex })}
                  </th>
                  {row.map((count, colIndex) => (
                    <td
                      key={colIndex}
                      className={`border border-hairline px-4 py-2 text-center ${
                        rowIndex === colIndex
                          ? "bg-positive/10 font-semibold"
                          : ""
                      }`}
                    >
                      {count}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <div className="flex flex-col gap-3 text-sm">
          <p className="text-ink-muted">
            {t("results.confusion.positive", { label: result.positiveClass })}
          </p>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {t("results.baselines.title")}
            </p>
            <p className="mt-1 font-mono tabular-nums">
              {t("results.baselines.majority")}:{" "}
              {fmt(result.baselines.majority[verdict.primaryMetric])}
              {" · "}
              {t("results.baselines.logistic")}:{" "}
              {fmt(result.baselines.logistic[verdict.primaryMetric])}
            </p>
          </div>
          <p className="text-ink-muted">{t("results.testNote")}</p>
        </div>
      </section>

      {/* S2: el porqué — gráfico siempre visible + narración verificada/plantilla. */}
      <WhySection
        explain={result.explainability}
        positiveClass={result.positiveClass}
        narration={narration}
        consent={consent}
        onConsentChange={handleConsentChange}
      />

      {/* S2: la constancia exportable del experimento. */}
      <ModelCardView
        result={result}
        meta={{
          datasetName: datasetName ?? "dataset",
          cols,
          numericFeatures: runMeta.numericFeatures,
          categoricalFeatures: runMeta.categoricalFeatures,
          target: runMeta.target,
          seed: runMeta.seed,
        }}
        verifiedNarrative={
          narration.kind === "verified" ? narration.text : null
        }
      />

      <div>
        <Button variant="secondary" onClick={onAgain}>
          {t("results.again")}
        </Button>
      </div>
    </div>
  );
}
