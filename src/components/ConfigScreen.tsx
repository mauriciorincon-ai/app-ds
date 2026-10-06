"use client";

import { useState } from "react";
import type { EdaAlert } from "@/engine/eda";
import type { SanitationReport } from "@/engine/sanitize";
import { isTrainableTask, type AmbiguousChoice } from "@/engine/tarea";
import { useT } from "@/i18n/use-translation";
import { formatEstimate } from "@/lib/duration";
import type { ClusterPlan, TargetPlan } from "@/lib/useExperiment";
import type { DatasetSummary } from "@/workers/protocol";
import { thousands } from "@/lib/quantity";
import { RosterCard } from "./RosterCard";
import { TaskCard } from "./TaskCard";
import { Badge, Button, Card } from "./ui";

/** S7 (P5): el valor de la opción «agrupar» no puede chocar con una columna que
 *  se llame igual: se alarga hasta que ninguna coincida. */
export function clusterOptionValue(headers: readonly string[]): string {
  let value = "__agrupar__";
  while (headers.includes(value)) value += "_";
  return value;
}

export function ConfigScreen({
  dataset,
  sanitation,
  edaAlerts,
  plan,
  clusterPlan = null,
  onSelectTarget,
  onSelectCluster,
  onAnswerTask,
  onRun,
  onRunCluster,
  onBack,
}: {
  dataset: DatasetSummary;
  sanitation: SanitationReport | null;
  edaAlerts: EdaAlert[] | null;
  /** S5: E1 + E2 del objetivo elegido (null mientras no hay objetivo). */
  plan: TargetPlan | null;
  /** S7: el plan de agrupar (sin objetivo), si se eligió. */
  clusterPlan?: ClusterPlan | null;
  onSelectTarget: (target: string) => void;
  /** S7: elegir agrupar filas parecidas en lugar de un objetivo. */
  onSelectCluster?: () => void;
  /** S6 (D2): la respuesta a «¿categorías o una cantidad?». */
  onAnswerTask?: (choice: AmbiguousChoice | null) => void;
  onRun: (target: string) => void;
  onRunCluster?: () => void;
  onBack: () => void;
}) {
  const t = useT();
  const [target, setTarget] = useState("");
  const profileByName = new Map(dataset.profiles.map((p) => [p.name, p]));
  const clusterValue = clusterOptionValue(dataset.headers);
  const clustering = target === clusterValue && onSelectCluster !== undefined;
  const readyCluster = clustering && clusterPlan?.ok ? clusterPlan : null;

  // Solo se entrena lo que E1 reconoce (o el usuario respondió) como una tarea
  // entrenable y prepareRun pudo armar.
  const trainable =
    !clustering &&
    plan !== null &&
    plan.target === target &&
    isTrainableTask(plan.resolved) &&
    plan.routing !== null;

  const handleTargetChange = (value: string) => {
    setTarget(value);
    if (value === clusterValue && onSelectCluster) onSelectCluster();
    else onSelectTarget(value);
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("config.title")}</h1>
        <p className="font-mono text-sm tabular-nums text-ink-muted">
          {t("config.summary", {
            rows: thousands(dataset.rowCount),
            cols: dataset.headers.length,
          })}
        </p>
      </header>

      {sanitation && <SanitationBlock report={sanitation} />}

      {dataset.dateColumns.length > 0 && (
        <p className="rounded-md border border-caution/40 bg-caution/10 p-3 text-sm">
          <span className="mr-1 text-caution" aria-hidden>
            ⚠
          </span>
          {t("config.warnings.date", { cols: dataset.dateColumns.join(", ") })}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="target" className="font-medium">
          {t("config.target.label")}
        </label>
        <select
          id="target"
          value={target}
          onChange={(event) => handleTargetChange(event.target.value)}
          className="min-h-11 rounded-md border border-hairline bg-surface px-3 text-sm"
        >
          <option value="" disabled>
            {t("config.target.placeholder")}
          </option>
          {/* S7 (P5): agrupar va primero — no es una columna, es otra pregunta. */}
          {onSelectCluster && (
            <option value={clusterValue}>{t("config.target.cluster")}</option>
          )}
          {/* S5 (E1): TODAS las columnas, cada una con la tarea que plantearía —
              ninguna se esconde; la tarjeta de tarea dice si ya se entrena. */}
          {dataset.headers.map((column) => {
            const detection = dataset.targetTasks[column];
            return (
              <option key={column} value={column}>
                {detection
                  ? t("config.target.option", {
                      column,
                      task: t(`task.name.${detection.task}`),
                    })
                  : column}
              </option>
            );
          })}
        </select>
        <p className="text-sm text-ink-muted">{t("config.target.help")}</p>
      </div>

      {/* S7: agrupar — qué columnas forman la distancia y cuáles quedan fuera. */}
      {clustering && clusterPlan && <ClusterPlanCard plan={clusterPlan} />}

      {/* S5 (E1): qué tarea plantea el objetivo elegido, con su razón. */}
      {target !== "" && !clustering && plan && (
        <TaskCard
          // Otra columna, otra tarjeta: el foco solo se mueve tras responder.
          key={plan.target}
          detection={plan.task}
          blocked={plan.blocked !== null}
          target={plan.target}
          resolved={plan.resolved}
          choice={plan.choice}
          unit={plan.unit}
          onAnswer={onAnswerTask}
          // S7: una columna que no sirve como objetivo ofrece agrupar en su lugar.
          onCluster={
            onSelectCluster ? () => handleTargetChange(clusterValue) : undefined
          }
        />
      )}

      {/* Alertas EDA del objetivo elegido — role="status" (no "alert": no
          interrumpe; el route announcer de Next reserva alert — regla 7). */}
      {target !== "" &&
        !clustering &&
        edaAlerts &&
        (plan === null || isTrainableTask(plan.resolved)) && (
          <EdaBlock alerts={edaAlerts} />
        )}

      {/* S5: binaria pero sin validación cruzada honesta posible (o sin features). */}
      {target !== "" && !clustering && plan?.blocked && (
        <p
          role="status"
          className="rounded-md border border-negative/40 bg-negative/10 p-3 text-sm"
        >
          <span aria-hidden className="mr-1 text-negative">
            ✕
          </span>
          {/* S7 (P4): la categoría más chica se nombra aquí, en pantalla. */}
          {plan.smallestClass
            ? t("errors.too-few-rows-per-class-named", {
                class: plan.smallestClass.name,
                rows: plan.smallestClass.trainRows,
              })
            : t(`errors.${plan.blocked}`)}
        </p>
      )}

      {/* S5 (E2): quién compite y en qué nivel, con su razón. */}
      {target !== "" && !clustering && plan?.routing && plan.profile && (
        <RosterCard
          routing={plan.routing}
          rows={plan.profile.rows}
          minorityShare={plan.profile.minorityShare}
          k={plan.profile.k}
          smallSample={plan.smallSample}
        />
      )}
      {readyCluster && (
        <RosterCard
          routing={readyCluster.routing}
          rows={readyCluster.rows}
          minorityShare={null}
          k={readyCluster.profile.k}
          smallSample={readyCluster.smallSample}
          cluster
        />
      )}

      {trainable && plan?.routing && (
        <p className="text-sm text-ink-muted">
          {t("config.trainHint", {
            count: plan.routing.level1.length,
            time: formatEstimate(plan.routing.level1EstimateS),
          })}
        </p>
      )}
      {readyCluster && (
        <p className="text-sm text-ink-muted">
          {t("config.clusterHint", {
            count: readyCluster.routing.level1.length,
            time: formatEstimate(readyCluster.routing.level1EstimateS),
          })}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {clustering ? (
          <Button
            icon="play"
            onClick={() => onRunCluster?.()}
            disabled={!readyCluster || !onRunCluster}
          >
            {t("config.cluster")}
          </Button>
        ) : (
          <Button
            icon="play"
            onClick={() => onRun(target)}
            disabled={!trainable}
          >
            {t("config.train")}
          </Button>
        )}
        <Button variant="secondary" icon="back" onClick={onBack}>
          {t("config.back")}
        </Button>
      </div>

      {/* S5: la acción va antes de la vista previa — con la tarjeta de quién
          compite, en un móvil el botón quedaba a varias pantallas del objetivo. */}
      <Card className="overflow-hidden">
        <div className="border-b border-hairline px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {t("config.preview")}
        </div>
        {/* Región scrolleable accesible por teclado (axe: scrollable-region-focusable). */}
        <div
          className="overflow-x-auto"
          role="region"
          tabIndex={0}
          aria-label={t("config.preview")}
        >
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {dataset.headers.map((header) => {
                  const profile = profileByName.get(header);
                  return (
                    <th
                      key={header}
                      className="whitespace-nowrap border-b border-hairline bg-sunken px-3 py-2 text-left align-top"
                    >
                      <div className="font-medium">{header}</div>
                      <div className="mt-1 flex flex-wrap gap-1 font-normal">
                        {profile && (
                          <Badge>{t(`config.profile.${profile.kind}`)}</Badge>
                        )}
                        {profile && profile.nulls > 0 && (
                          <Badge>
                            {t("config.profile.nulls", {
                              count: profile.nulls,
                            })}
                          </Badge>
                        )}
                        {profile?.looksLikeDate && (
                          <Badge tone="caution">
                            ⚠ {t("config.profile.date")}
                          </Badge>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {dataset.previewRows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="whitespace-nowrap border-b border-hairline px-3 py-1.5 font-mono text-xs tabular-nums"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// Informe de saneamiento: si el dataset venía limpio, se DICE de frente ("nada
// que sanear" — el usuario merece saber que no se tocó nada). Si no, se listan
// las acciones con conteos exactos (nada silencioso).
function SanitationBlock({ report }: { report: SanitationReport }) {
  const t = useT();

  if (report.clean) {
    // Verde EVIDENTE sin ser intrusivo (gate ⭐ S4, daltonismo leve del
    // usuario): tinte 15% + borde sólido + barra izquierda + ✓ en círculo
    // relleno — la tranquilidad no depende de percibir un tinte sutil.
    return (
      <div
        className="flex items-center gap-2.5 rounded-md border border-positive/60 border-l-4 border-l-positive bg-positive/15 p-3 text-sm font-medium"
        role="status"
      >
        <span
          aria-hidden
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-positive text-xs font-bold text-bg"
        >
          ✓
        </span>
        {t("config.sanitation.clean")}
      </div>
    );
  }

  return (
    <Card className="p-4" role="status">
      <p className="mb-2 text-sm font-semibold">
        <span aria-hidden className="mr-1 text-accent">
          ⚙
        </span>
        {t("config.sanitation.title")}
      </p>
      <ul className="ml-5 list-disc text-sm text-ink-muted">
        {report.duplicateRowsRemoved > 0 && (
          <li>
            {t("config.sanitation.duplicates", {
              count: report.duplicateRowsRemoved,
            })}
          </li>
        )}
        {report.exclusions.map((ex) => (
          <li key={ex.column}>
            {t(`config.sanitation.exclusion.${ex.reason}`, {
              column: ex.column,
            })}
          </li>
        ))}
        {report.coercions.map((co) => (
          <li key={co.column}>
            {t("config.sanitation.coercion", {
              column: co.column,
              count: co.cellsNulled,
            })}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// Alertas EDA — honestas, con símbolo + texto (nada solo por color). Silencio si
// no hay nada que señalar (dataset sano). role="status" en el contenedor.
function EdaBlock({ alerts }: { alerts: EdaAlert[] }) {
  const t = useT();
  if (alerts.length === 0) {
    return (
      <p
        className="flex items-center gap-2.5 rounded-md border border-hairline bg-surface p-3 text-sm text-ink-muted"
        role="status"
      >
        <span
          aria-hidden
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-positive text-xs font-bold text-bg"
        >
          ✓
        </span>
        {t("config.eda.clean")}
      </p>
    );
  }

  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-caution/40 bg-caution/10 p-4"
      role="status"
    >
      <p className="text-sm font-semibold text-caution">
        <span aria-hidden className="mr-1">
          ⚠
        </span>
        {t("config.eda.title")}
      </p>
      <ul className="ml-5 list-disc text-sm">
        {alerts.map((alert, i) => (
          <li key={i}>
            {alert.kind === "class-imbalance"
              ? t("config.eda.imbalance", {
                  rate: (alert.minorityRate * 100).toFixed(0),
                })
              : alert.kind === "target-skewed"
                ? t("config.eda.target-skewed", { skew: alert.skew.toFixed(1) })
                : alert.kind === "target-outliers"
                  ? t("config.eda.target-outliers", {
                      share: (alert.share * 100).toFixed(1),
                    })
                  : t(`config.eda.${alert.kind}`, { column: alert.column })}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * S7 (P5): agrupar sin objetivo — qué es, qué columnas forman la distancia y
 * cuáles quedan fuera con su razón (ninguna se esconde). Sin objetivo no hay
 * prueba ni veredicto contra un baseline, y se dice antes de correr.
 */
function ClusterPlanCard({ plan }: { plan: ClusterPlan }) {
  const t = useT();
  if (!plan.ok) {
    return (
      <p
        role="status"
        className="rounded-md border border-negative/40 bg-negative/10 p-3 text-sm"
      >
        <span aria-hidden className="mr-1 text-negative">
          ✕
        </span>
        {t(`errors.${plan.error}`)}
      </p>
    );
  }
  const quote = (columns: readonly string[]) =>
    columns.map((c) => `«${c}»`).join(", ");
  return (
    <Card className="flex flex-col gap-2 p-4 text-sm" role="status">
      <h2 className="font-semibold">{t("cluster.plan.title")}</h2>
      <p>{t("cluster.plan.what")}</p>
      <p className="text-ink-muted">
        {plan.distance === "numeric"
          ? t("cluster.plan.distanceNumeric", {
              count: plan.numeric.length,
              columns: quote(plan.numeric),
            })
          : t("cluster.plan.distanceAll", {
              columns: quote([...plan.numeric, ...plan.categorical]),
            })}
        {plan.distance === "numeric" && plan.categorical.length > 0 && (
          <>
            {" "}
            {t("cluster.plan.describeOnly", {
              columns: quote(plan.categorical),
            })}
          </>
        )}
      </p>
      {plan.excluded.length > 0 && (
        <ul className="ml-5 list-disc text-ink-muted">
          {plan.excluded.map((ex) => (
            <li key={ex.column}>
              {t(`cluster.plan.excluded.${ex.reason}`, { column: ex.column })}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
