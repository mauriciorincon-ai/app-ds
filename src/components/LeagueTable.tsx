"use client";

import { useState } from "react";
import {
  MLP_MIN_ROWS,
  type Placement,
  type Routing,
} from "@/engine/encarrilador";
import { matchByTask, taskOf } from "@/engine/despacho";
import { selectOneSe, type MemberId } from "@/engine/roster";
import {
  METRIC_RULES,
  type Metrics,
  type MulticlassMetrics,
  type PrimaryMetric,
  type RegressionMetrics,
} from "@/engine/verdict";
import { useT } from "@/i18n/use-translation";
import { formatEstimate } from "@/lib/duration";
import { formatQuantity, quantityDecimals, withUnit } from "@/lib/quantity";
import type { ChoiceState } from "@/lib/useExperiment";
import type { SupervisedResult, LeagueRow } from "@/workers/protocol";
import { FichaButton } from "./FichaButton";
import type { FichaStatus } from "./FichaModelo";
import { Badge, Button, Card } from "./ui";

// La liga (S5, ADR-009): filas = modelos. La columna que se ve es la de
// validación cruzada («sirve para elegir»); la de prueba existe pero se abre a
// pedido, etiquetada «no sirve para elegir» (regla dura 3: acompaña y etiqueta,
// no esconde). El ganador lleva marca RELLENA ★ + texto (daltonismo leve del
// usuario: nunca solo color); el elegido a mano, ◆ + «elegido por ti».
//
// S6: la misma tabla para estimar una cantidad. La métrica es el MAE («menor es
// mejor», METRIC_RULES): el orden, la banda del error estándar y la marca del
// mejor siguen esa dirección, y las cifras van en las unidades del objetivo.

type AnyRow =
  | LeagueRow<Metrics>
  | LeagueRow<MulticlassMetrics>
  | LeagueRow<RegressionMetrics>;

type Entry =
  | { kind: "ran"; row: AnyRow }
  | { kind: "pending"; placement: Placement }
  | { kind: "out"; placement: Placement };

export function LeagueTable({
  result,
  routing,
  choice,
  onChoose,
  minorityShare: profileMinority = null,
}: {
  result: SupervisedResult;
  routing: Routing | null;
  choice: ChoiceState;
  onChoose: (member: MemberId) => void;
  /** S7: la parte de la clase más chica en el dataset con que se entrenó (la del
   *  reparto de E2), para la razón de una balanceada «fuera». */
  minorityShare?: number | null;
}) {
  const t = useT();
  const [showTest, setShowTest] = useState(false);
  const { selection } = result;
  const league: readonly AnyRow[] = result.league;
  const task = taskOf(result);
  const metric = selection.metric;
  const metricName = t(`results.metrics.${metric}`);
  const lower = METRIC_RULES[metric].direction === "lower";
  const short = (id: MemberId) => t(`results.candidates.short.${id}`);
  // El puntaje de prueba de una fila en la métrica de la liga, leído por SU nombre
  // (AU-S7-41: sin fijar `balanced_accuracy` ni `mae` aquí; la métrica la decide
  // `selection.metric`, la misma que gobierna METRIC_RULES). Las tres formas de
  // métricas encajan en este tipo sin conversión.
  const testScore = (
    m: Partial<Record<PrimaryMetric, number | null>>,
  ): number => m[metric] ?? Number.NaN;
  // Clasificación: 3 decimales (de 0 a 1). Estimar: unidades del objetivo, con
  // los decimales que pide el puntaje más chico de la tabla (R9).
  const fixed3 = (v: number) => v.toFixed(3);
  const fmt: (v: number) => string = matchByTask(result, {
    binaria: () => fixed3,
    multiclase: () => fixed3,
    numerica: (regression) => {
      const decimals = quantityDecimals(
        league.flatMap((row) => (row.cv ? [row.cv.mean, row.cv.std] : [])),
      );
      return (v: number) =>
        withUnit(formatQuantity(v, decimals), regression.unit);
    },
  });

  // La banda del error estándar: los que «empatan» con el mejor.
  const oneSe = selectOneSe(
    league,
    selection.k,
    METRIC_RULES[metric].direction,
  );
  const bestMean = league.find((r) => r.name === selection.best)?.cv?.mean;
  const withinBand = (mean: number) =>
    bestMean !== undefined &&
    (lower ? mean <= bestMean + selection.se : mean >= bestMean - selection.se);

  // Corrieron (por puntaje de CV, del mejor al peor según la dirección; sin
  // puntaje al final) → pendientes del Nivel 2 → fuera. Ninguno se omite.
  const ran = league.map((row) => row.name);
  const worst = lower ? Infinity : -Infinity;
  const cvKey = (row: AnyRow) => row.cv?.mean ?? worst;
  const placementOf = (id: MemberId) =>
    routing!.placements.find((p) => p.id === id)!;
  const entries: Entry[] = [
    ...[...league]
      .sort((a, b) => (lower ? cvKey(a) - cvKey(b) : cvKey(b) - cvKey(a)))
      .map((row): Entry => ({ kind: "ran", row })),
    ...(routing?.level2 ?? [])
      .filter((id) => !ran.includes(id))
      .map((id): Entry => ({ kind: "pending", placement: placementOf(id) })),
    ...(routing?.out ?? [])
      .filter((id) => !ran.includes(id))
      .map((id): Entry => ({ kind: "out", placement: placementOf(id) })),
  ];

  const rows = result.nTrain + result.nTest;
  const minorityShare = matchByTask(result, {
    binaria: (binary) => Math.min(binary.positiveRate, 1 - binary.positiveRate),
    // La del reparto (train); sin perfil, la de la prueba (las filas de la matriz).
    multiclase: (multi) =>
      profileMinority ??
      Math.min(...multi.perClass.map((c) => c.support)) / multi.nTest,
    numerica: () => 0,
  });
  const outReason = (p: Placement) =>
    t(`roster.reason.${p.outReason ?? p.reason}`, {
      rows,
      min: MLP_MIN_ROWS,
      share: Math.round(minorityShare * 100),
    });

  const fitting = choice.status === "fitting";
  const ficha = (id: MemberId, status: FichaStatus, emphasis: string) => (
    <FichaButton
      target={{ id, status, task }}
      label={t("league.fichaAria", { model: short(id) })}
      className={emphasis}
    >
      {short(id)}
    </FichaButton>
  );
  // Columnas extra desde sm (prueba y «usar») para el colSpan de pendientes/fuera.
  const testCols = showTest ? 1 : 0;

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-col gap-1">
        <h2 id="league-title" className="text-base font-semibold">
          {t("league.title", { count: league.length })}
        </h2>
        <p className="text-sm">{t("league.rule")}</p>
        {lower && (
          <p className="text-sm text-ink-muted">
            <span aria-hidden className="mr-1">
              ▼
            </span>
            {t("league.lowerIsBetter")}
          </p>
        )}
      </div>

      <div>
        <Button
          variant="ghost"
          icon="eye"
          aria-expanded={showTest}
          aria-controls="league-table"
          onClick={() => setShowTest((v) => !v)}
          className="-ml-4 justify-start text-left"
        >
          {showTest ? t("league.hideTest") : t("league.showTest")}
        </Button>
        {showTest && (
          <p className="rounded-md border border-caution/40 bg-caution/10 p-3 text-sm">
            <span aria-hidden className="mr-1 text-caution">
              ⚠
            </span>
            {t("league.testWarning")}
          </p>
        )}
      </div>

      {/* Región desplazable accesible por teclado (axe: scrollable-region-focusable). */}
      {/* relative: un descendiente absoluto (p. ej. un sr-only) sin bloque
          contenedor posicionado escapa del recorte y estira la página (estiró
          a 403 px un móvil de 360 — pasada de capturas, S5 F2). */}
      <div
        className="relative overflow-x-auto"
        role="region"
        tabIndex={0}
        aria-labelledby="league-title"
      >
        <table id="league-table" className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
              <th
                scope="col"
                className="border-b border-hairline px-2 py-2 font-semibold"
              >
                {t("league.cols.model")}
              </th>
              <th
                scope="col"
                className="border-b border-hairline px-2 py-2 font-semibold"
              >
                {t("league.cols.cv", { metric: metricName })}
              </th>
              {showTest && (
                <th
                  scope="col"
                  className="hidden border-b border-hairline bg-caution/10 px-2 py-2 font-semibold text-caution sm:table-cell"
                >
                  {t("league.cols.test", { metric: metricName })}
                </th>
              )}
              <th
                scope="col"
                className="hidden border-b border-hairline px-2 py-2 font-semibold sm:table-cell"
              >
                {t("league.cols.use")}
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => {
              if (entry.kind !== "ran") {
                const p = entry.placement;
                return (
                  <tr
                    key={p.id}
                    className="border-b border-hairline text-ink-muted"
                  >
                    <th
                      scope="row"
                      colSpan={3 + testCols}
                      className="px-2 py-2 text-left font-normal"
                    >
                      {ficha(
                        p.id,
                        entry.kind === "pending"
                          ? { kind: "pending" }
                          : { kind: "out", reason: outReason(p) },
                        "",
                      )}
                      <div className="text-xs">
                        {entry.kind === "pending"
                          ? t("league.status.pending", {
                              time: formatEstimate(p.estimateS),
                            })
                          : t("league.status.out", { reason: outReason(p) })}
                      </div>
                    </th>
                  </tr>
                );
              }

              const row = entry.row;
              // Las filas que corrieron van primero, ya ordenadas por CV.
              const rank = index + 1;
              const isWinner = row.name === selection.cvWinner;
              const isActive = row.name === result.modelName;
              const isChosen = isActive && selection.by === "user";
              const isBest = row.name === selection.best && !isWinner;
              const withinSe =
                row.status === "ok" &&
                row.cv !== null &&
                withinBand(row.cv.mean) &&
                !isWinner &&
                !isBest;
              // U3: compitió porque el usuario lo incluyó de todos modos.
              const isForced = routing?.placements.some(
                (p) => p.id === row.name && p.reason === "forced",
              );
              const canChoose = row.test !== null && !isActive;
              const thisFitting =
                choice.status === "fitting" && choice.member === row.name;
              const action = isActive ? (
                <Badge tone="positive">
                  <span aria-hidden>✓</span> {t("league.inUse")}
                </Badge>
              ) : canChoose ? (
                <Button
                  variant="secondary"
                  icon={isWinner ? "back" : "check"}
                  disabled={fitting}
                  aria-label={
                    isWinner
                      ? t("league.backToWinner")
                      : t("league.chooseAria", { model: short(row.name) })
                  }
                  onClick={() => onChoose(row.name)}
                  className="text-left sm:whitespace-nowrap"
                >
                  {thisFitting
                    ? t("league.fitting")
                    : isWinner
                      ? t("league.backToWinner")
                      : t("league.choose")}
                </Button>
              ) : null;

              return (
                <tr
                  key={row.name}
                  className={`border-b border-hairline ${
                    isWinner
                      ? "border-l-4 border-l-accent bg-accent/5"
                      : isChosen
                        ? "border-l-4 border-l-ink bg-sunken"
                        : ""
                  }`}
                >
                  {/* La acción vive bajo el nombre: en 360 px no hay ancho para
                      una columna aparte sin desplazar la tabla. */}
                  <th
                    scope="row"
                    className="px-2 py-2 text-left align-top font-normal"
                  >
                    {ficha(
                      row.name,
                      isWinner
                        ? { kind: "winner" }
                        : isChosen
                          ? { kind: "chosen" }
                          : row.cv === null
                            ? { kind: "failed" }
                            : {
                                kind: "competitor",
                                rank,
                                total: league.length,
                              },
                      isWinner || isChosen ? "font-semibold" : "font-medium",
                    )}
                    <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs">
                      {isWinner && (
                        <span className="inline-flex items-center gap-1 font-semibold text-accent">
                          <span
                            aria-hidden
                            className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[0.625rem] text-accent-ink"
                          >
                            ★
                          </span>
                          {t("league.mark.winner")}
                        </span>
                      )}
                      {isChosen && (
                        <span className="inline-flex items-center gap-1 font-semibold">
                          <span
                            aria-hidden
                            className="flex h-4 w-4 items-center justify-center rounded-full bg-ink text-[0.625rem] text-bg"
                          >
                            ◆
                          </span>
                          {t("league.mark.chosen")}
                        </span>
                      )}
                      {isBest && (
                        <span className="text-ink-muted">
                          <span aria-hidden>▲ </span>
                          {t("league.mark.best")}
                        </span>
                      )}
                      {withinSe && (
                        <span className="text-ink-muted">
                          {t("league.mark.withinSe")}
                        </span>
                      )}
                      {isForced && (
                        <span className="text-ink-muted">
                          {t("league.mark.forced")}
                        </span>
                      )}
                      {row.status === "no-converge" && (
                        <span className="text-caution">
                          {t("league.status.no-converge")}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 sm:hidden">{action}</div>
                  </th>
                  <td className="px-2 py-2 align-top font-mono tabular-nums">
                    {row.cv ? (
                      <>
                        <div>{fmt(row.cv.mean)}</div>
                        <div className="text-xs text-ink-muted">
                          ± {fmt(row.cv.std)}
                        </div>
                        {/* Móvil: sin ancho para una tercera columna, la prueba
                            va en su propia línea, rotulada y en ámbar. */}
                        {showTest && row.test && (
                          <div className="mt-1 rounded-sm bg-caution/10 px-1 text-xs text-caution sm:hidden">
                            {t("league.testShort")} {fmt(testScore(row.test))}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="font-sans text-xs text-negative">
                        {t("league.status.error", {
                          type: row.error_type ?? "",
                        })}
                      </span>
                    )}
                  </td>
                  {showTest && (
                    <td className="hidden bg-caution/5 px-2 py-2 align-top font-mono tabular-nums text-ink-muted sm:table-cell">
                      {row.test ? (
                        fmt(testScore(row.test))
                      ) : row.cv ? (
                        <span className="font-sans text-xs text-negative">
                          {t("league.status.testError", {
                            type: row.error_type ?? "",
                          })}
                        </span>
                      ) : null}
                    </td>
                  )}
                  <td className="hidden px-2 py-2 text-right align-top sm:table-cell">
                    {action}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {choice.status === "error" && (
        <p role="alert" className="text-sm text-negative">
          <span aria-hidden className="mr-1">
            ✕
          </span>
          {t("league.chooseError", { model: short(choice.member) })}
        </p>
      )}

      <p className="text-sm text-ink-muted">
        <span aria-hidden className="mr-1 text-accent">
          ★
        </span>
        {t("league.howWinner", {
          se: fmt(selection.se),
          best: short(oneSe?.best ?? selection.best),
        })}
      </p>
      {result.smallSample && (
        <p className="text-sm text-caution">
          <span aria-hidden className="mr-1">
            ⚠
          </span>
          {t("roster.smallSample", { rows })}
        </p>
      )}
      <p className="font-mono text-xs tabular-nums text-ink-muted">
        {t("league.time", { seconds: (selection.elapsedMs / 1000).toFixed(1) })}
      </p>
    </Card>
  );
}
