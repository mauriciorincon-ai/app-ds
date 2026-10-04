"use client";

import { matchByTask } from "@/engine/despacho";
import type { EdaAlert } from "@/engine/eda";
import type { RouteProfile, Routing } from "@/engine/encarrilador";
import {
  BASELINE_IDS,
  BASELINE_IDS_BY_TASK,
  type MemberId,
} from "@/engine/roster";
import type { SanitationReport } from "@/engine/sanitize";
import { pickBestBaseline, type MetricName } from "@/engine/verdict";
import { useT } from "@/i18n/use-translation";
import { useNarration } from "@/lib/useNarration";
import type {
  ChoiceState,
  ExportState,
  Level2State,
  RunMeta,
} from "@/lib/useExperiment";
import type { BinaryResult, ExperimentResult } from "@/workers/protocol";
import { FichaButton } from "./FichaButton";
import { LeagueTable } from "./LeagueTable";
import { Level2Card } from "./Level2Card";
import { ModelCardView } from "./ModelCardView";
import {
  RegressionDetail,
  RegressionMetricsSection,
  RegressionVerdict,
} from "./RegressionResults";
import { WhySection } from "./WhySection";
import { Button, Card, MetricTile } from "./ui";
import {
  LEVEL_MARK,
  suspiciousBanner,
  VerdictCard,
  type Banner,
} from "./VerdictCard";

const METRIC_KEYS: MetricName[] = [
  "accuracy",
  "precision",
  "recall",
  "f1",
  "auc",
];

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
  routing,
  choice,
  onChoose,
  modelReady = true,
  profile = null,
  forced = [],
  level2 = { status: "idle" },
  onRunLevel2,
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
  /** S5: el reparto con que se entrenó (pendientes del Nivel 2 y «fuera»). */
  routing: Routing | null;
  choice: ChoiceState;
  onChoose: (member: MemberId) => void;
  /** false mientras el worker ajusta un modelo elegido a mano o lo restaura. */
  modelReady?: boolean;
  /** S5: para planear el Nivel 2 (sin perfil no se ofrece). */
  profile?: RouteProfile | null;
  forced?: readonly MemberId[];
  level2?: Level2State;
  onRunLevel2?: (extraForced: MemberId[]) => void;
}) {
  const t = useT();
  const { leakage } = result;
  // Narración a demanda (gate ⭐ S4, bloque C): la plantilla existe siempre;
  // la IA solo se pide cuando el usuario pulsa el botón de WhySection. S6 (P7):
  // al estimar una cantidad no hay IA (el hook no llama al route).
  const { template, ai, aiAvailable, requestNarration } = useNarration({
    result,
    target: runMeta.target,
    cols,
    edaAlerts,
  });
  const hasLeak = leakage.length > 0;
  // S7 (P2): cada pieza que depende de la tarea escribe la rama de cada una.
  const byResult = matchByTask(result, {
    binaria: (binary) => ({
      verdict: <BinaryVerdict result={binary} hasLeak={hasLeak} />,
      metrics: <BinaryMetrics result={binary} />,
      detail: <BinaryDetail result={binary} />,
      positiveClass: binary.positiveClass,
      unit: null,
    }),
    numerica: (regression) => ({
      verdict: (
        <RegressionVerdict
          result={regression}
          target={runMeta.target}
          hasLeak={hasLeak}
        />
      ),
      metrics: <RegressionMetricsSection result={regression} />,
      detail: <RegressionDetail result={regression} target={runMeta.target} />,
      positiveClass: null,
      unit: regression.unit,
    }),
  });

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
      {byResult.verdict}

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

      {byResult.metrics}

      {/* S5: la liga — filas = modelos, CV para elegir, prueba para creer. */}
      <LeagueTable
        result={result}
        routing={routing}
        choice={choice}
        onChoose={onChoose}
      />
      {profile && onRunLevel2 && (
        <Level2Card
          result={result}
          profile={profile}
          forced={forced}
          level2={level2}
          busy={!modelReady || choice.status === "fitting"}
          onRun={onRunLevel2}
        />
      )}

      {byResult.detail}

      {/* S2: el porqué — gráfico siempre visible + texto estándar + IA a demanda. */}
      <WhySection
        explain={result.explainability}
        target={runMeta.target}
        positiveClass={byResult.positiveClass}
        template={template}
        ai={ai}
        aiAvailable={aiAvailable}
        onRequestNarration={requestNarration}
        unit={byResult.unit}
      />

      {/* S3: el modelo se usa — puntuar datos nuevos y exportar como archivo. */}
      <section aria-labelledby="use-model-title">
        <Card className="p-5">
          <h2 id="use-model-title" className="text-sm font-semibold">
            {t("results.use.title")}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">{t("results.use.desc")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button icon="table" onClick={onUseModel} disabled={!modelReady}>
              {t("results.use.button")}
            </Button>
            <Button
              variant="secondary"
              icon="download"
              onClick={onExportModel}
              disabled={exportState === "exporting" || !modelReady}
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

/** El veredicto de clasificación (S1–S5, sin cambios de lógica en el S6). */
function BinaryVerdict({
  result,
  hasLeak,
}: {
  result: BinaryResult;
  hasLeak: boolean;
}) {
  const t = useT();
  const { verdict } = result;
  const fmt = (value: number) => value.toFixed(2);
  const metricLabel = (metric: MetricName) => t(`results.metrics.${metric}`);

  // Gate ⭐ S4 (bloque B): el veredicto nombra al modelo ganador — "el modelo"
  // a secas dejaba la duda de CUÁL superó al baseline.
  const winnerName = t(`results.candidates.short.${result.modelName}`);

  // S5 (R2): la logística es baseline Y miembro — si gana la liga y EMPATA, empata
  // consigo misma y se dice así. Si PIERDE (la clase mayoritaria rinde mejor), el
  // veredicto franco «NO supera» no se reemplaza (regla dura 3). S6 (AU-S6-18):
  // solo si el baseline que decide es la logística; si decide la clase
  // mayoritaria, el titular normal la nombra.
  const logisticWon =
    (BASELINE_IDS as readonly string[]).includes(result.modelName) &&
    result.selection.by === "cv" &&
    verdict.level === "ties" &&
    pickBestBaseline(
      BASELINE_IDS_BY_TASK.binaria.map((id) => result.baselines[id]),
      verdict.primaryMetric,
    ) === result.baselines.logistic;
  const banner: Banner = hasLeak
    ? suspiciousBanner(t)
    : logisticWon
      ? {
          ...LEVEL_MARK.ties,
          headline: t("results.verdict.logisticTie"),
          detail: t("results.verdict.logisticTieDetail"),
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
    <VerdictCard banner={banner}>
      {/* S5 (U1): el veredicto habla del elegido, etiquetado. */}
      {result.selection.by === "user" && (
        <p className="mt-2 text-sm font-medium">
          {t("results.verdict.chosenNote")}
        </p>
      )}
    </VerdictCard>
  );
}

function BinaryMetrics({ result }: { result: BinaryResult }) {
  const t = useT();
  const { verdict, model } = result;
  const metricLabel = (metric: MetricName) => t(`results.metrics.${metric}`);
  return (
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
            value={model[metric].toFixed(2)}
          />
        ))}
      </div>
    </section>
  );
}

function BinaryDetail({ result }: { result: BinaryResult }) {
  const t = useT();
  const { verdict, confusionMatrix } = result;
  return (
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
          {/* S5 (E3): cada baseline abre su ficha — juzgan la liga, no compiten. */}
          <ul className="mt-1 flex flex-col">
            {BASELINE_IDS.map((id) => (
              <li key={id} className="flex flex-wrap items-center gap-x-2">
                <FichaButton
                  target={{ id, status: { kind: "baseline" } }}
                  label={t("league.fichaAria", {
                    model: t(`results.baselines.${id}`),
                  })}
                >
                  {t(`results.baselines.${id}`)}
                </FichaButton>
                <span className="font-mono tabular-nums">
                  {result.baselines[id][verdict.primaryMetric].toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-ink-muted">{t("results.testNote")}</p>
      </div>
    </section>
  );
}
