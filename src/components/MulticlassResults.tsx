"use client";

import { BASELINE_IDS_BY_TASK } from "@/engine/roster";
import { pickBestBaseline } from "@/engine/verdict";
import { useT } from "@/i18n/use-translation";
import type { MulticlassResult } from "@/workers/protocol";
import { FichaButton } from "./FichaButton";
import { Card, MetricTile } from "./ui";
import {
  LEVEL_MARK,
  suspiciousBanner,
  VerdictCard,
  type Banner,
} from "./VerdictCard";

// S7 (ADR 015): Resultados al clasificar en VARIAS categorías. El veredicto habla
// en exactitud balanceada (de cada categoría, qué parte acierta, en promedio) contra
// el mejor baseline; la matriz K×K dice DÓNDE se equivoca. Las clases, la matriz y
// las métricas por clase son datos del usuario: viven solo en memoria (P13).

const two = (value: number) => value.toFixed(2);

export function MulticlassVerdict({
  result,
  hasLeak,
}: {
  result: MulticlassResult;
  hasLeak: boolean;
}) {
  const t = useT();
  const { verdict } = result;
  const winnerName = t(`results.candidates.short.${result.modelName}`);
  // La logística multinomial es baseline Y miembro (AU-S5-01 / AU-S6-18): si gana
  // la liga y EMPATA con el baseline que decide —ella misma—, se dice así; si
  // decide la mayoritaria, el titular normal la nombra.
  const logisticTie =
    result.modelName === "logistic" &&
    result.selection.by === "cv" &&
    verdict.level === "ties" &&
    pickBestBaseline(
      BASELINE_IDS_BY_TASK.multiclase.map((id) => result.baselines[id]),
      verdict.primaryMetric,
    ) === result.baselines.logistic;
  const banner: Banner = hasLeak
    ? suspiciousBanner(t)
    : logisticTie
      ? {
          ...LEVEL_MARK.ties,
          headline: t("results.verdict.logisticTie"),
          detail: t("results.verdict.logisticTieDetail"),
        }
      : {
          ...LEVEL_MARK[verdict.level],
          headline: t(`results.verdict.${verdict.level}`, { name: winnerName }),
          detail: t(`results.verdict.${verdict.level}Detail`, {
            delta: `+${two(verdict.delta)}`,
            metric: t(`results.metrics.${verdict.primaryMetric}`),
            model: two(verdict.modelScore),
            baseline: two(verdict.baselineScore),
          }),
        };
  return (
    <VerdictCard banner={banner}>
      {result.selection.by === "user" && (
        <p className="mt-2 text-sm font-medium">
          {t("results.verdict.chosenNote")}
        </p>
      )}
    </VerdictCard>
  );
}

export function MulticlassMetricsSection({
  result,
}: {
  result: MulticlassResult;
}) {
  const t = useT();
  const { model, classes } = result;
  const k = classes.length;
  // Sin probabilidades (Ridge, SVM lineal) la pérdida logarítmica y el AUC no
  // existen: se muestra «—», no se inventan.
  const maybe = (value: number | null) => (value === null ? "—" : two(value));
  return (
    <section className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {t("results.primaryMetric", {
          metric: t("results.metrics.balanced_accuracy"),
        })}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <MetricTile
          label={t("results.metrics.balanced_accuracy")}
          value={two(model.balanced_accuracy)}
        />
        <MetricTile
          label={t("results.metrics.f1_macro")}
          value={two(model.f1_macro)}
        />
        <MetricTile
          label={t("results.metrics.accuracy")}
          value={two(model.accuracy)}
        />
        <MetricTile
          label={t("results.metrics.log_loss")}
          value={maybe(model.log_loss)}
        />
        <MetricTile
          label={t("results.metrics.auc_ovr")}
          value={maybe(model.auc_ovr)}
        />
      </div>
      {/* «Cuál mirar»: la primaria, con su referencia de azar en el mismo número. */}
      <p className="max-w-prose text-sm text-ink-muted">
        {t("results.multiclass.guide", { k, chance: two(1 / k) })}
      </p>
      {(model.log_loss === null || model.auc_ovr === null) && (
        <p className="max-w-prose text-sm text-ink-muted">
          {t("results.multiclass.noProbabilities")}
        </p>
      )}
    </section>
  );
}

/** La confusión más frecuente (fuera de la diagonal); null si no hay errores. */
export function topConfusion(
  matrix: readonly (readonly number[])[],
): { real: number; predicted: number; count: number } | null {
  let top: { real: number; predicted: number; count: number } | null = null;
  matrix.forEach((row, real) =>
    row.forEach((count, predicted) => {
      if (real !== predicted && count > 0 && (!top || count > top.count)) {
        top = { real, predicted, count };
      }
    }),
  );
  return top;
}

export function MulticlassDetail({ result }: { result: MulticlassResult }) {
  const t = useT();
  const { classes, confusionMatrix, perClass, verdict } = result;
  const top = topConfusion(confusionMatrix);
  return (
    <section className="flex flex-col gap-4">
      <ConfusionTable classes={classes} matrix={confusionMatrix} />
      <p className="text-sm">
        {top
          ? t("results.multiclass.topConfusion", {
              real: classes[top.real]!,
              predicted: classes[top.predicted]!,
              count: top.count,
            })
          : t("results.multiclass.noConfusion")}
      </p>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
        <PerClassTable classes={classes} perClass={perClass} />
        <div className="flex flex-col gap-2 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {t("results.baselines.title")}
          </h2>
          {/* E3: cada baseline abre su ficha — juzgan la liga, no compiten. */}
          <ul className="flex flex-col">
            {BASELINE_IDS_BY_TASK.multiclase.map((id) => (
              <li key={id} className="flex flex-wrap items-center gap-x-2">
                <FichaButton
                  target={{
                    id,
                    status: { kind: "baseline" },
                    task: "multiclase",
                  }}
                  label={t("league.fichaAria", {
                    model: t(`results.baselines.${id}`),
                  })}
                >
                  {t(`results.baselines.${id}`)}
                </FichaButton>
                <span className="font-mono tabular-nums">
                  {two(result.baselines[id][verdict.primaryMetric])}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="text-sm text-ink-muted">
        {t("results.multiclass.testNote")}
      </p>
    </section>
  );
}

/**
 * La matriz K×K (filas = la categoría real, columnas = la que predijo el modelo).
 * Los aciertos (la diagonal) llevan ✓ + negrita + su nombre para el lector: nunca
 * solo color (daltonismo leve del usuario). Con 20 categorías no cabe en 360 px:
 * vive en su propia región desplazable, enfocable y con nombre (R10); la página no
 * se desplaza de lado. Los nombres largos se recortan a la vista, pero el texto
 * completo sigue en la celda (el lector lo lee entero) y en `title`.
 */
export function ConfusionTable({
  classes,
  matrix,
}: {
  classes: readonly string[];
  matrix: readonly (readonly number[])[];
}) {
  const t = useT();
  return (
    <Card className="flex flex-col gap-2 p-4">
      <h2
        id="confusion-title"
        className="text-xs font-semibold uppercase tracking-wide text-ink-muted"
      >
        {t("results.confusion.title")}
      </h2>
      <p className="text-xs text-ink-muted">
        {t("results.multiclass.confusionHow")}
      </p>
      {/* relative: el sr-only de las celdas no escapa del recorte (S5 F2). */}
      <div
        className="relative overflow-x-auto"
        role="region"
        tabIndex={0}
        aria-labelledby="confusion-title"
      >
        <table className="border-collapse font-mono text-sm tabular-nums">
          <thead>
            <tr>
              <th
                scope="col"
                className="px-2 py-1 text-left font-sans text-xs font-normal text-ink-muted"
              >
                {t("results.multiclass.realPredicted")}
              </th>
              {classes.map((name) => (
                <th
                  key={name}
                  scope="col"
                  className="px-2 py-1 text-center font-sans text-xs font-normal text-ink-muted"
                >
                  <span className="block max-w-[7rem] truncate" title={name}>
                    {name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, real) => (
              <tr key={classes[real]}>
                <th
                  scope="row"
                  className="px-2 py-1 text-left font-sans text-xs font-normal text-ink-muted"
                >
                  <span
                    className="block max-w-[9rem] truncate"
                    title={classes[real]}
                  >
                    {classes[real]}
                  </span>
                </th>
                {row.map((count, predicted) => {
                  const hit = real === predicted;
                  return (
                    <td
                      key={predicted}
                      className={`border border-hairline px-3 py-1.5 text-center ${
                        hit ? "bg-positive/10 font-semibold" : ""
                      }`}
                    >
                      {hit && (
                        <>
                          <span aria-hidden className="mr-1 text-positive">
                            ✓
                          </span>
                          <span className="sr-only">
                            {t("results.multiclass.hit")}{" "}
                          </span>
                        </>
                      )}
                      {count}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PerClassTable({
  classes,
  perClass,
}: {
  classes: readonly string[];
  perClass: MulticlassResult["perClass"];
}) {
  const t = useT();
  return (
    <div className="flex min-w-0 flex-col gap-2 text-sm">
      <h2
        id="per-class-title"
        className="text-xs font-semibold uppercase tracking-wide text-ink-muted"
      >
        {t("results.multiclass.perClass")}
      </h2>
      <div
        className="relative overflow-x-auto"
        role="region"
        tabIndex={0}
        aria-labelledby="per-class-title"
      >
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="text-left text-ink-muted">
              <th
                scope="col"
                className="border-b border-hairline py-1 pr-3 font-normal"
              >
                {t("results.multiclass.class")}
              </th>
              <th
                scope="col"
                className="border-b border-hairline py-1 pr-3 font-normal"
              >
                {t("results.metrics.precision")}
              </th>
              <th
                scope="col"
                className="border-b border-hairline py-1 pr-3 font-normal"
              >
                {t("results.metrics.recall")}
              </th>
              <th
                scope="col"
                className="border-b border-hairline py-1 pr-3 font-normal"
              >
                {t("results.metrics.f1")}
              </th>
              <th
                scope="col"
                className="border-b border-hairline py-1 font-normal"
              >
                {t("results.multiclass.support")}
              </th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {perClass.map((row, index) => (
              <tr key={classes[index]}>
                <th
                  scope="row"
                  className="py-0.5 pr-3 text-left font-sans font-normal"
                >
                  <span
                    className="block max-w-[10rem] truncate"
                    title={classes[index]}
                  >
                    {classes[index]}
                  </span>
                </th>
                <td className="py-0.5 pr-3">{two(row.precision)}</td>
                <td className="py-0.5 pr-3">{two(row.recall)}</td>
                <td className="py-0.5 pr-3">{two(row.f1)}</td>
                <td className="py-0.5">{row.support}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
