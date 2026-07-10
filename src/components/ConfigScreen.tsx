"use client";

import { useState } from "react";
import { useT } from "@/i18n/use-translation";
import type { DatasetSummary } from "@/workers/protocol";
import { Badge, Button, Card } from "./ui";

export function ConfigScreen({
  dataset,
  onRun,
  onBack,
}: {
  dataset: DatasetSummary;
  onRun: (target: string) => void;
  onBack: () => void;
}) {
  const t = useT();
  const [target, setTarget] = useState("");
  const profileByName = new Map(dataset.profiles.map((p) => [p.name, p]));

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
          onChange={(event) => setTarget(event.target.value)}
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

      <Card className="overflow-hidden">
        <div className="border-b border-hairline px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {t("config.preview")}
        </div>
        <div className="overflow-x-auto">
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
