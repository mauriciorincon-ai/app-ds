"use client";

// Pantalla "Usar el modelo" (S3): CSV nuevo → chequeo honesto de esquema →
// predicciones con etiqueta original + probabilidad → descarga del CSV
// puntuado. El panel de novedad (categorías nunca vistas / fuera de rango)
// SIEMPRE se muestra antes de descargar. El encabezado es el candidato LCP y
// nace estático (patrón lcp-nace-estatico: sin motion, sin opacity inicial).
import { useRef, useState } from "react";
import { useT } from "@/i18n/use-translation";
import { downloadTextFile } from "@/lib/files";
import { modelFeatures } from "@/lib/ds/schema-check";
import {
  buildScoredCsv,
  resolveScoredColumnNames,
  scoredCsvFileName,
} from "@/lib/scored-csv";
import type { ExportState, ModelMeta, ScoringState } from "@/lib/useExperiment";
import type { ProgressStage } from "@/workers/protocol";
import { Button, Card, MetricTile } from "./ui";

const PREVIEW_ROWS = 10;

const IMPORT_STAGES: ProgressStage[] = [
  "loading-runtime",
  "loading-packages",
  "importing",
];

export function ScoreScreen({
  meta,
  ready,
  progress,
  scoring,
  exportState,
  onScoreFile,
  onScoreAnother,
  onBackToResults,
  onExit,
  onExportModel,
}: {
  meta: ModelMeta;
  ready: boolean;
  progress: ProgressStage | null;
  scoring: ScoringState;
  exportState: ExportState;
  onScoreFile: (csv: string, name: string) => void;
  onScoreAnother: () => void;
  onBackToResults: () => void;
  onExit: () => void;
  onExportModel: () => void;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const features = modelFeatures(meta.schema);
  const backButton =
    meta.source === "trained" ? (
      <Button variant="secondary" onClick={onBackToResults}>
        {t("score.backResults")}
      </Button>
    ) : (
      <Button variant="secondary" onClick={onExit}>
        {t("score.backStart")}
      </Button>
    );

  async function handleFile(file: File) {
    onScoreFile(await file.text(), file.name);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Candidato LCP: nace visible, sin wrapper de motion. */}
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("score.title")}
        </h1>
        <p className="max-w-prose text-ink-muted">{t("score.subtitle")}</p>
        <p className="font-mono text-sm tabular-nums text-ink-muted">
          {t("score.modelLine", {
            dataset: meta.datasetName,
            target: meta.schema.target,
            positive: meta.schema.positive_class,
          })}
        </p>
      </header>

      {!ready && scoring.status !== "error" && (
        <PreparingModel progress={progress} />
      )}

      {ready && scoring.status === "idle" && (
        <>
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files[0];
              if (file) void handleFile(file);
            }}
            className={`flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center transition-colors ${
              dragging
                ? "border-accent bg-accent/5"
                : "border-hairline bg-surface"
            }`}
          >
            <p>{t("score.dropzone.label")}</p>
            <p className="text-sm text-ink-muted">{t("score.dropzone.hint")}</p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="min-h-11 rounded-md bg-accent px-4 text-sm font-medium text-accent-ink hover:opacity-90"
            >
              {t("score.dropzone.button")}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </div>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
              {t("score.needed.title")}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {features.map((name) => (
                <li
                  key={name}
                  className="rounded-full border border-hairline bg-surface px-2 py-0.5 font-mono text-xs"
                >
                  {name}
                </li>
              ))}
            </ul>
            <p className="text-sm text-ink-muted">
              {t("score.needed.noTarget", { target: meta.schema.target })}
            </p>
          </section>
        </>
      )}

      {scoring.status === "blocked" && (
        <div
          role="alert"
          className="rounded-md border border-negative/40 bg-negative/10 p-4"
        >
          <p className="mb-1 font-medium text-negative">
            <span aria-hidden className="mr-1">
              ✕
            </span>
            {t("score.blocked.title", { name: scoring.fileName })}
          </p>
          <p className="text-sm">{t("score.blocked.missing")}</p>
          <ul className="mt-1 ml-5 list-disc font-mono text-sm">
            {scoring.check.missing.map((column) => (
              <li key={column}>{column}</li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-ink-muted">
            {t("score.blocked.hint")}
          </p>
          <div className="mt-3">
            <Button variant="secondary" onClick={onScoreAnother}>
              {t("score.tryAnother")}
            </Button>
          </div>
        </div>
      )}

      {scoring.status === "running" && (
        <p role="status" aria-live="polite" className="text-ink-muted">
          {t("score.running")}
        </p>
      )}

      {scoring.status === "scored" && (
        <ScoredResults
          meta={meta}
          scoring={scoring}
          onScoreAnother={onScoreAnother}
        />
      )}

      {scoring.status === "error" && (
        <div role="alert" className="flex flex-col items-start gap-3">
          <span aria-hidden className="text-2xl text-negative">
            ⚠
          </span>
          <p className="text-ink-muted">
            {scoring.kind === "runtime" || scoring.kind === "import-failed"
              ? t(`score.errors.${scoring.kind}`)
              : t(`errors.${scoring.kind}`)}
          </p>
          {scoring.kind !== "import-failed" && (
            <Button variant="secondary" onClick={onScoreAnother}>
              {t("score.tryAnother")}
            </Button>
          )}
        </div>
      )}

      {/* Export también aquí (feedback visual S3): solo para modelos entrenados
          en esta sesión — un modelo importado ya ES el archivo. */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-3">
          {backButton}
          {meta.source === "trained" && ready && (
            <Button
              variant="secondary"
              onClick={onExportModel}
              disabled={exportState === "exporting"}
            >
              {exportState === "exporting"
                ? t("results.export.exporting")
                : t("results.export.button")}
            </Button>
          )}
        </div>
        {meta.source === "trained" && exportState === "error" && (
          <p role="alert" className="text-sm text-negative">
            <span aria-hidden className="mr-1">
              ✕
            </span>
            {t("results.export.error")}
          </p>
        )}
      </div>
    </div>
  );
}

// Import en curso: el worker está cargando Pyodide y restaurando el modelo.
function PreparingModel({ progress }: { progress: ProgressStage | null }) {
  const t = useT();
  const activeIndex = progress ? IMPORT_STAGES.indexOf(progress) : 0;
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
        {t("score.preparing.title")}
      </h2>
      <ol className="flex flex-col gap-3">
        {IMPORT_STAGES.map((stage, index) => {
          const done = index < activeIndex;
          const active = index === activeIndex;
          return (
            <li key={stage} className="flex items-center gap-3">
              <span
                aria-hidden
                className={`grid size-6 place-items-center rounded-full border font-mono text-xs ${
                  done
                    ? "border-accent bg-accent text-accent-ink"
                    : active
                      ? "border-accent text-accent"
                      : "border-hairline text-ink-muted"
                }`}
              >
                {done ? "✓" : index + 1}
              </span>
              <span
                className={active ? "font-medium text-ink" : "text-ink-muted"}
              >
                {stage === "importing"
                  ? t("score.preparing.importing")
                  : t(`training.${stage}`)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ScoredResults({
  meta,
  scoring,
  onScoreAnother,
}: {
  meta: ModelMeta;
  scoring: Extract<ScoringState, { status: "scored" }>;
  onScoreAnother: () => void;
}) {
  const t = useT();
  const { check, table, score, fileName } = scoring;
  const { predictions, probabilities, novelty } = score;

  const desiredNames = {
    prediction: t("score.columns.prediction"),
    probability: t("score.columns.probability", {
      label: meta.schema.positive_class,
    }),
  };
  const names = resolveScoredColumnNames(table.headers, desiredNames);

  // Distribución de predicciones por clase (conteo simple, honesto).
  const counts = new Map<string, number>();
  for (const label of predictions) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const total = predictions.length;
  const percent = (n: number) => Math.round((100 * n) / Math.max(total, 1));

  const download = () => {
    const csv = buildScoredCsv(table, predictions, probabilities, desiredNames);
    downloadTextFile(
      scoredCsvFileName(fileName, t("score.fileSuffix")),
      csv,
      "text/csv;charset=utf-8",
    );
  };

  const noveltyPercent = Math.round(
    (100 * novelty.affected_rows) / Math.max(novelty.n_rows, 1),
  );

  return (
    <div className="flex flex-col gap-5">
      {(check.extra.length > 0 || check.targetPresent) && (
        <div className="rounded-md border border-caution/40 bg-caution/10 p-4 text-sm">
          <p className="font-medium text-caution">
            <span aria-hidden className="mr-1">
              ⚠
            </span>
            {t("score.warnings.title")}
          </p>
          <ul className="mt-1 ml-5 list-disc">
            {check.extra.length > 0 && (
              <li>
                {t("score.warnings.extra", {
                  columns: check.extra.map((c) => `«${c}»`).join(", "),
                })}
              </li>
            )}
            {check.targetPresent && (
              <li>
                {t("score.warnings.target", { target: meta.schema.target })}
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Panel de novedad: SIEMPRE visible antes de descargar. */}
      <Card className="p-4">
        {novelty.columns.length > 0 ? (
          <div className="text-sm">
            <p className="font-medium text-caution">
              <span aria-hidden className="mr-1">
                ⚠
              </span>
              {t("score.novelty.title")}
            </p>
            <ul className="mt-1 ml-5 list-disc">
              {novelty.columns.map((column) => (
                <li key={column.column}>
                  {t(`score.novelty.${column.kind}`, {
                    column: column.column,
                    count: column.count,
                  })}
                </li>
              ))}
            </ul>
            <p className="mt-2 font-mono tabular-nums">
              {t("score.novelty.summary", {
                affected: novelty.affected_rows,
                total: novelty.n_rows,
                percent: noveltyPercent,
              })}
            </p>
            <p className="mt-1 text-ink-muted">{t("score.novelty.hint")}</p>
          </div>
        ) : (
          <p className="text-sm">
            <span aria-hidden className="mr-1 text-positive">
              ✓
            </span>
            {t("score.novelty.none")}
          </p>
        )}
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
          {t("score.distribution.title", { rows: total })}
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:max-w-md">
          {[...counts.entries()].map(([label, count]) => (
            <MetricTile
              key={label}
              label={label}
              value={`${count} (${percent(count)}%)`}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
          {t("score.preview.title", {
            shown: Math.min(PREVIEW_ROWS, table.rows.length),
            total: table.rows.length,
          })}
        </h2>
        {/* Región scrolleable accesible por teclado (axe: scrollable-region-focusable). */}
        <div
          className="overflow-x-auto rounded-md border border-hairline"
          role="region"
          tabIndex={0}
          aria-label={t("score.preview.title", {
            shown: Math.min(PREVIEW_ROWS, table.rows.length),
            total: table.rows.length,
          })}
        >
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-sunken text-left">
                <th className="px-3 py-2 font-mono text-xs font-semibold">
                  {names.prediction}
                </th>
                <th className="px-3 py-2 font-mono text-xs font-semibold">
                  {names.probability}
                </th>
                {table.headers.map((header) => (
                  <th
                    key={header}
                    className="px-3 py-2 font-mono text-xs font-normal text-ink-muted"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.slice(0, PREVIEW_ROWS).map((row, index) => (
                <tr key={index} className="border-t border-hairline">
                  <td className="px-3 py-1.5 font-medium">
                    {predictions[index]}
                  </td>
                  <td className="px-3 py-1.5 font-mono tabular-nums">
                    {probabilities[index]!.toFixed(4)}
                  </td>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="px-3 py-1.5 font-mono text-xs tabular-nums text-ink-muted"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <Button onClick={download}>{t("score.download")}</Button>
        <Button variant="secondary" onClick={onScoreAnother}>
          {t("score.another")}
        </Button>
      </div>
    </div>
  );
}
