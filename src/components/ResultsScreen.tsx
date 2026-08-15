"use client";

import type { EdaAlert } from "@/engine/eda";
import type { SanitationReport } from "@/engine/sanitize";
import type { MetricName } from "@/engine/verdict";
import { useT } from "@/i18n/use-translation";
import { useNarration } from "@/lib/useNarration";
import type { ExportState, RunMeta } from "@/lib/useExperiment";
import type { ExperimentResult } from "@/workers/protocol";
import { ModelCardView } from "./ModelCardView";
import { WhySection } from "./WhySection";
import { Badge, Button, Card, MetricTile } from "./ui";

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
  sanitation,
  edaAlerts,
  onAgain,
  onUseModel,
  onExportModel,
  exportState,
}: {
  result: ExperimentResult;
  datasetName: string | null;
  cols: number;
  runMeta: RunMeta;
  sanitation: SanitationReport | null;
  edaAlerts: EdaAlert[] | null;
  onAgain: () => void;
  onUseModel: () => void;
  onExportModel: () => void;
  exportState: ExportState;
}) {
  const t = useT();
  const { verdict, model, leakage, confusionMatrix } = result;
  // Narración a demanda (gate ⭐ S4, bloque C): la plantilla existe siempre;
  // la IA solo se pide cuando el usuario pulsa el botón de WhySection.
  const { template, ai, requestNarration } = useNarration({
    result,
    target: runMeta.target,
    cols,
    edaAlerts,
  });
  const hasLeak = leakage.length > 0;
  const fmt = (value: number) => value.toFixed(2);
  const metricLabel = (metric: MetricName) => t(`results.metrics.${metric}`);

  // Gate ⭐ S4 (bloque B): el veredicto nombra al modelo ganador — "el modelo"
  // a secas dejaba la duda de CUÁL superó al baseline.
  const winnerName = t(`results.candidates.short.${result.modelName}`);

  const banner = hasLeak
    ? {
        tone: "caution" as BannerTone,
        mark: "⚠",
        headline: t("results.verdict.suspicious"),
        detail: t("results.verdict.suspiciousDetail"),
      }
    : {
        ...LEVEL_MARK[verdict.level],
        headline: t(`results.verdict.${verdict.level}`, { name: winnerName }),
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

      {/* S4: los candidatos compitieron con el MISMO veredicto — sin selector del
          usuario: el veredicto habla. Gate ⭐ (bloque B): caja destacada con las
          MÉTRICAS COMPLETAS de ambos candidatos (no solo la primaria del ganador)
          y la nota en tamaño normal. Ganador con ▶ + badge (símbolo + texto). */}
      <Card className="border-accent/40 bg-accent/5 p-5">
        <h2 className="text-base font-semibold">
          {t("results.candidates.title")}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          {t("results.candidates.note")}
        </p>
        <div
          className="mt-3 overflow-x-auto"
          role="region"
          tabIndex={0}
          aria-label={t("results.candidates.title")}
        >
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="border-b border-hairline px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted"
                >
                  {t("results.candidates.metricCol")}
                </th>
                {result.candidates.map((candidate) => {
                  const isWinner = candidate.name === result.modelName;
                  return (
                    <th
                      key={candidate.name}
                      scope="col"
                      className="border-b border-hairline px-2 py-2 text-left"
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span
                          aria-hidden
                          className={
                            isWinner ? "text-positive" : "text-ink-muted"
                          }
                        >
                          {isWinner ? "▶" : "·"}
                        </span>
                        <span
                          className={
                            isWinner
                              ? "font-semibold"
                              : "font-medium text-ink-muted"
                          }
                        >
                          {t(`results.candidates.short.${candidate.name}`)}
                        </span>
                        {isWinner && (
                          <Badge tone="positive">
                            {t("results.candidates.winner")}
                          </Badge>
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {METRIC_KEYS.map((metric) => {
                const isPrimary = metric === verdict.primaryMetric;
                return (
                  <tr key={metric} className={isPrimary ? "bg-sunken" : ""}>
                    <th
                      scope="row"
                      className={`px-2 py-1.5 text-left ${
                        isPrimary
                          ? "font-semibold"
                          : "font-normal text-ink-muted"
                      }`}
                    >
                      {metricLabel(metric)}
                      {isPrimary && (
                        <span className="ml-1 text-xs">
                          ({t("results.candidates.primary")})
                        </span>
                      )}
                    </th>
                    {result.candidates.map((candidate) => {
                      const isWinner = candidate.name === result.modelName;
                      return (
                        <td
                          key={candidate.name}
                          className={`px-2 py-1.5 font-mono tabular-nums ${
                            isWinner ? "font-semibold" : "text-ink-muted"
                          }`}
                        >
                          {fmt(candidate.metrics[metric])}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

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

      {/* S2: el porqué — gráfico siempre visible + texto estándar + IA a demanda. */}
      <WhySection
        explain={result.explainability}
        target={runMeta.target}
        positiveClass={result.positiveClass}
        template={template}
        ai={ai}
        onRequestNarration={requestNarration}
      />

      {/* S3: el modelo se usa — puntuar datos nuevos y exportar como archivo. */}
      <section aria-labelledby="use-model-title">
        <Card className="p-5">
          <h2 id="use-model-title" className="text-sm font-semibold">
            {t("results.use.title")}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">{t("results.use.desc")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button icon="table" onClick={onUseModel}>
              {t("results.use.button")}
            </Button>
            <Button
              variant="secondary"
              icon="download"
              onClick={onExportModel}
              disabled={exportState === "exporting"}
            >
              {exportState === "exporting"
                ? t("results.export.exporting")
                : t("results.export.button")}
            </Button>
          </div>
          {exportState === "error" && (
            <p role="alert" className="mt-2 text-sm text-negative">
              <span aria-hidden className="mr-1">
                ✕
              </span>
              {t("results.export.error")}
            </p>
          )}
          <p className="mt-3 max-w-prose text-xs text-ink-muted">
            {t("results.export.contents")}
          </p>
        </Card>
      </section>

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
        sanitation={sanitation}
        verifiedNarrative={ai.kind === "verified" ? ai.text : null}
      />

      <div>
        <Button variant="secondary" icon="plus" onClick={onAgain}>
          {t("results.again")}
        </Button>
      </div>
    </div>
  );
}
