"use client";

import { REGRESSION_BASELINE_IDS } from "@/engine/roster";
import { useT } from "@/i18n/use-translation";
import { bestRegressionBaseline } from "@/lib/experiment";
import {
  errorReductionPct,
  formatQuantity,
  quantityDecimals,
  withUnit,
} from "@/lib/quantity";
import type { RegressionResult } from "@/workers/protocol";
import { FichaButton } from "./FichaButton";
import { PredichoVsReal } from "./PredichoVsReal";
import { Card, MetricTile } from "./ui";
import { LEVEL_MARK, VerdictCard, type Banner } from "./VerdictCard";

// S6 (P5/P6): Resultados al estimar una cantidad. El veredicto habla en las
// unidades del objetivo («se equivoca en promedio ±X; adivinar la mediana, ±Y»);
// el gráfico estimado-frente-a-real tiene su equivalente en texto (los cuantiles
// del error sobre TODO el test). Todo valor aquí deriva del objetivo: vive solo
// en el navegador (regla dura 2).

/** Formateador de un grupo de cantidades comparables (mismos decimales). */
function quantities(result: RegressionResult, values: readonly number[]) {
  const decimals = quantityDecimals(values);
  return (value: number) =>
    withUnit(formatQuantity(value, decimals), result.unit);
}

export function RegressionVerdict({
  result,
  target,
  hasLeak,
}: {
  result: RegressionResult;
  target: string;
  hasLeak: boolean;
}) {
  const t = useT();
  const { verdict } = result;
  const q = quantities(result, [verdict.modelScore, verdict.baselineScore]);
  const winnerName = t(`results.candidates.short.${result.modelName}`);
  const baselineId = bestRegressionBaseline(result.baselines);
  const baselinePhrase = t(
    `results.regression.verdict.baseline.${baselineId}`,
    {
      value: quantities(result, [result.targetStats.median])(
        result.targetStats.median,
      ),
    },
  );

  // R10: la lineal es baseline Y miembro. Si gana la liga y EMPATA, empata consigo
  // misma y se dice así; si PIERDE (la mediana rinde mejor), el «NO supera» franco
  // no se reemplaza (regla dura 3, AU-S5-01).
  const linearWon =
    result.modelName === "linear" &&
    result.selection.by === "cv" &&
    verdict.level === "ties";
  const banner: Banner = hasLeak
    ? {
        tone: "caution",
        mark: "⚠",
        headline: t("results.verdict.suspicious"),
        detail: t("results.verdict.suspiciousDetail"),
      }
    : linearWon
      ? {
          ...LEVEL_MARK.ties,
          headline: t("results.regression.verdict.linearTie"),
          detail: t("results.regression.verdict.linearTieDetail", {
            model: q(verdict.modelScore),
          }),
        }
      : {
          ...LEVEL_MARK[verdict.level],
          headline: t(`results.verdict.${verdict.level}`, { name: winnerName }),
          detail: t(`results.regression.verdict.${verdict.level}Detail`, {
            model: q(verdict.modelScore),
            baseline: baselinePhrase,
            reference: q(verdict.baselineScore),
            pct: errorReductionPct(verdict.modelScore, verdict.baselineScore),
          }),
        };

  return (
    <VerdictCard banner={banner}>
      {!result.unit.symbol && (
        <p className="mt-2 text-sm text-ink-muted">
          {t("results.regression.verdict.units", { column: target })}
        </p>
      )}
      {result.selection.by === "user" && (
        <p className="mt-2 text-sm font-medium">
          {t("results.verdict.chosenNote")}
        </p>
      )}
    </VerdictCard>
  );
}

export function RegressionMetricsSection({
  result,
}: {
  result: RegressionResult;
}) {
  const t = useT();
  const { model } = result;
  const q = quantities(result, [model.mae, model.rmse, model.medae]);
  return (
    <section className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {t("results.regression.primaryMetric")}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricTile label={t("results.metrics.mae")} value={q(model.mae)} />
        <MetricTile label={t("results.metrics.rmse")} value={q(model.rmse)} />
        <MetricTile
          label={t("results.metrics.r2")}
          value={model.r2.toFixed(2)}
        />
        <MetricTile label={t("results.metrics.medae")} value={q(model.medae)} />
      </div>
      <p className="max-w-prose text-sm text-ink-muted">
        {t("results.regression.guide")}
      </p>
    </section>
  );
}

const PERCENTILES = ["p05", "p25", "p50", "p75", "p95"] as const;

export function RegressionDetail({
  result,
  target,
}: {
  result: RegressionResult;
  target: string;
}) {
  const t = useT();
  const { residuals, model, predVsReal } = result;
  // El error con signo: «+12.3» es estimar de más; «−4.1», de menos.
  const errDecimals = quantityDecimals([
    residuals.p25,
    residuals.p75,
    residuals.abs_p90,
  ]);
  const err = (value: number) =>
    withUnit(
      `${value > 0 ? "+" : ""}${formatQuantity(value, errDecimals)}`,
      result.unit,
    );
  const abs = (value: number) =>
    withUnit(formatQuantity(value, errDecimals), result.unit);
  // Un sesgo «apreciable»: el error mediano supera el 5 % del MAE.
  const lean =
    Math.abs(residuals.p50) <= 0.05 * model.mae
      ? "none"
      : residuals.p50 > 0
        ? "over"
        : "under";
  const baselineQ = quantities(result, [
    result.baselines.median.mae,
    result.baselines.linear.mae,
  ]);

  return (
    <section className="flex flex-col gap-4">
      <Card className="p-5">
        <PredichoVsReal
          points={predVsReal}
          mae={model.mae}
          unit={result.unit}
          column={target}
        />
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
        {/* El equivalente en texto del gráfico, sobre TODO el test. */}
        <div className="flex flex-col gap-2 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {t("results.regression.residuals.title")}
          </h2>
          <ul className="flex flex-col gap-1">
            <li>
              {t("results.regression.residuals.middle", {
                p25: err(residuals.p25),
                p75: err(residuals.p75),
              })}
            </li>
            <li>
              {t("results.regression.residuals.abs90", {
                abs90: abs(residuals.abs_p90),
              })}
            </li>
            <li>
              {t(`results.regression.residuals.median.${lean}`, {
                p50: err(residuals.p50),
              })}
            </li>
          </ul>
          <table className="w-full max-w-xs border-collapse font-mono text-xs tabular-nums">
            <caption className="mb-1 text-left font-sans text-xs text-ink-muted">
              {t("results.regression.residuals.tableCaption", {
                total: predVsReal.n_total,
              })}
            </caption>
            <thead>
              <tr className="text-left font-sans text-ink-muted">
                <th
                  scope="col"
                  className="border-b border-hairline py-1 pr-3 font-normal"
                >
                  {t("results.regression.residuals.percentile")}
                </th>
                <th
                  scope="col"
                  className="border-b border-hairline py-1 font-normal"
                >
                  {t("results.regression.residuals.error")}
                </th>
              </tr>
            </thead>
            <tbody>
              {PERCENTILES.map((p) => (
                <tr key={p}>
                  <th scope="row" className="py-0.5 pr-3 text-left font-normal">
                    {p.slice(1).replace(/^0/, "")}
                  </th>
                  <td className="py-0.5">{err(residuals[p])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-ink-muted">
            {t("results.regression.residuals.sign")}
          </p>
        </div>

        <div className="flex flex-col gap-2 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {t("results.baselines.title")}
          </h2>
          {/* E3: cada baseline abre su ficha — juzgan la liga, no compiten. */}
          <ul className="flex flex-col">
            {REGRESSION_BASELINE_IDS.map((id) => (
              <li key={id} className="flex flex-wrap items-center gap-x-2">
                <FichaButton
                  target={{
                    id,
                    status: { kind: "baseline" },
                    task: "numerica",
                  }}
                  label={t("league.fichaAria", {
                    model: t(`results.baselines.${id}`),
                  })}
                >
                  {t(`results.baselines.${id}`)}
                </FichaButton>
                <span className="font-mono tabular-nums">
                  {t("results.metrics.mae")}{" "}
                  {baselineQ(result.baselines[id].mae)}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-ink-muted">
            {t("results.regression.baselinesNote")}
          </p>
          <p className="text-ink-muted">{t("results.regression.testNote")}</p>
        </div>
      </div>
    </section>
  );
}
