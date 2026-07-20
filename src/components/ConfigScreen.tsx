"use client";

import { useState } from "react";
import type { EdaAlert } from "@/engine/eda";
import type { SanitationReport } from "@/engine/sanitize";
import { useT } from "@/i18n/use-translation";
import type { DatasetSummary } from "@/workers/protocol";
import { Badge, Button, Card } from "./ui";

export function ConfigScreen({
  dataset,
  sanitation,
  edaAlerts,
  onSelectTarget,
  onRun,
  onBack,
}: {
  dataset: DatasetSummary;
  sanitation: SanitationReport | null;
  edaAlerts: EdaAlert[] | null;
  onSelectTarget: (target: string) => void;
  onRun: (target: string) => void;
  onBack: () => void;
}) {
  const t = useT();
  const [target, setTarget] = useState("");
  const profileByName = new Map(dataset.profiles.map((p) => [p.name, p]));

  const handleTargetChange = (value: string) => {
    setTarget(value);
    onSelectTarget(value);
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("config.title")}</h1>
        <p className="font-mono text-sm tabular-nums text-ink-muted">
          {t("config.summary", {
            rows: dataset.rowCount,
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
          {dataset.targetCandidates.map((column) => (
            <option key={column} value={column}>
              {column}
            </option>
          ))}
        </select>
        <p className="text-sm text-ink-muted">{t("config.target.help")}</p>
      </div>

      {/* Alertas EDA del objetivo elegido — role="status" (no "alert": no
          interrumpe; el route announcer de Next reserva alert — regla 7). */}
      {target !== "" && edaAlerts && <EdaBlock alerts={edaAlerts} />}

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

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => onRun(target)} disabled={target === ""}>
          {t("config.train")}
        </Button>
        <Button variant="secondary" onClick={onBack}>
          {t("config.back")}
        </Button>
      </div>
    </div>
  );
}

// Informe de saneamiento: si el dataset venía limpio, se DICE de frente ("nada
// que sanear" — el usuario merece saber que no se tocó nada). Si no, se listan
// las acciones con conteos exactos (nada silencioso).
function SanitationBlock({ report }: { report: SanitationReport }) {
  const t = useT();

  if (report.clean) {
    return (
      <div
        className="rounded-md border border-positive/40 bg-positive/10 p-3 text-sm"
        role="status"
      >
        <span aria-hidden className="mr-1 text-positive">
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
        className="rounded-md border border-hairline bg-surface p-3 text-sm text-ink-muted"
        role="status"
      >
        <span aria-hidden className="mr-1 text-positive">
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
              : t(`config.eda.${alert.kind}`, { column: alert.column })}
          </li>
        ))}
      </ul>
    </div>
  );
}
