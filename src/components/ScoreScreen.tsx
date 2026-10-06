"use client";

// Pantalla "Usar el modelo" (S3): CSV nuevo → chequeo honesto de esquema →
// predicciones con etiqueta original + probabilidad → descarga del CSV
// puntuado. El panel de novedad (categorías nunca vistas / fuera de rango)
// SIEMPRE se muestra antes de descargar. El encabezado es el candidato LCP y
// nace estático (patrón lcp-nace-estatico: sin motion, sin opacity inicial).
import { useRef, useState, type ReactNode } from "react";
import { matchByTask } from "@/engine/despacho";
import { useT } from "@/i18n/use-translation";
import { downloadTextFile } from "@/lib/files";
import { modelFeatures } from "@/lib/ds/schema-check";
import { inferUnit } from "@/lib/experiment";
import {
  csvLimitParams,
  formatQuantity,
  thousands,
  withUnit,
} from "@/lib/quantity";
import {
  buildScoredCsv,
  estimateSummary,
  formatEstimates,
  resolveScoredColumnNames,
  scoredCsvFileName,
} from "@/lib/scored-csv";
import type { ExportState, ModelMeta, ScoringState } from "@/lib/useExperiment";
import type {
  BinaryScoreResult,
  ClusterScoringSchema,
  MulticlassScoreResult,
  ProgressStage,
  RegressionScoreResult,
  ScoreResult,
  SupervisedSchema,
} from "@/workers/protocol";
import { Button, Card, Icon, MetricTile } from "./ui";

const PREVIEW_ROWS = 10;

const IMPORT_STAGES: ProgressStage[] = [
  "loading-runtime",
  "loading-packages",
  "importing",
];

type ScoreScreenProps<M> = {
  meta: M;
  ready: boolean;
  progress: ProgressStage | null;
  scoring: ScoringState;
  exportState: ExportState;
  onScoreFile: (csv: string, name: string) => void;
  onScoreAnother: () => void;
  onBackToResults: () => void;
  onExit: () => void;
  onExportModel: () => void;
};

/** El modelo activo de una tarea con objetivo. */
type SupervisedMeta = Omit<ModelMeta, "schema"> & { schema: SupervisedSchema };

type Scored = Extract<ScoringState, { status: "scored" }>;

/** S7 (P2): puntuar con el modelo de cada tarea. Con objetivo se predice; al
 *  agrupar se ASIGNA un grupo a cada fila nueva con la regla del modelo (P12). */
export function ScoreScreen(props: ScoreScreenProps<ModelMeta>) {
  const t = useT();
  const supervised = (schema: SupervisedSchema) => {
    const meta: SupervisedMeta = { ...props.meta, schema };
    return (
      <ScoreShell
        {...props}
        header={supervisedHeader(t, meta)}
        neededNote={t("score.needed.noTarget", { target: schema.target })}
        scored={(scoring) => (
          <ScoredResults
            meta={meta}
            scoring={scoring}
            onScoreAnother={props.onScoreAnother}
          />
        )}
      />
    );
  };
  return matchByTask(props.meta.schema, {
    binaria: supervised,
    multiclase: supervised,
    numerica: supervised,
    agrupar: (schema) => (
      <ScoreShell
        {...props}
        header={{
          subtitle: t("score.subtitleCluster"),
          modelLine: t("score.modelLineCluster", {
            dataset: props.meta.datasetName,
            k: schema.groups,
          }),
        }}
        neededNote={t("score.needed.cluster")}
        scored={(scoring) => (
          <ClusterScoredResults
            schema={schema}
            scoring={scoring}
            onScoreAnother={props.onScoreAnother}
          />
        )}
      />
    ),
  });
}

type Translate = ReturnType<typeof useT>;

function supervisedHeader(t: Translate, meta: SupervisedMeta) {
  return matchByTask(meta.schema, {
    binaria: (schema) => ({
      subtitle: t("score.subtitle"),
      modelLine: t("score.modelLine", {
        dataset: meta.datasetName,
        target: schema.target,
        positive: schema.positive_class,
      }),
    }),
    multiclase: (schema) => ({
      subtitle: t("score.subtitleMulticlass"),
      modelLine: t("score.modelLineMulticlass", {
        dataset: meta.datasetName,
        target: schema.target,
        count: schema.classes.length,
      }),
    }),
    numerica: (schema) => ({
      subtitle: t("score.subtitleQuantity"),
      modelLine: t("score.modelLineQuantity", {
        dataset: meta.datasetName,
        target: schema.target,
      }),
    }),
  });
}

/** Lo común de puntuar en todas las tareas: preparar el modelo, subir el CSV, el
 *  bloqueo honesto por columnas, el error y exportar. Lo propio de cada tarea
 *  llega por `header`, `neededNote` y `scored`. */
function ScoreShell({
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
  header,
  neededNote,
  scored,
}: ScoreScreenProps<ModelMeta> & {
  header: { subtitle: string; modelLine: string };
  neededNote: string;
  scored: (scoring: Scored) => ReactNode;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const features = modelFeatures(meta.schema);
  const backButton =
    meta.source === "trained" ? (
      <Button variant="secondary" icon="back" onClick={onBackToResults}>
        {t("score.backResults")}
      </Button>
    ) : (
      <Button variant="secondary" icon="plus" onClick={onExit}>
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
        <p className="max-w-prose text-ink-muted">{header.subtitle}</p>
        <p className="font-mono text-sm tabular-nums text-ink-muted">
          {header.modelLine}
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
            className={`flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center transition-colors motion-reduce:transition-none ${
              dragging
                ? "border-accent bg-accent/5"
                : "border-hairline bg-surface"
            }`}
          >
            <p>{t("score.dropzone.label")}</p>
            <p className="text-sm text-ink-muted">
              {t("score.dropzone.hint", csvLimitParams())}
            </p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-ink hover:opacity-90"
            >
              <Icon name="upload" />
              {t("score.dropzone.button")}
            </button>
            <input
              ref={inputRef}
              type="file"
              // El control real es el botón visible; el input es solo el mecanismo
              // del navegador: fuera del orden de tabulación y del árbol de
              // accesibilidad (Lighthouse S6: «label» en un input sin nombre).
              tabIndex={-1}
              aria-hidden
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
            <p className="text-sm text-ink-muted">{neededNote}</p>
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
            <Button variant="secondary" icon="upload" onClick={onScoreAnother}>
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

      {scoring.status === "scored" && scored(scoring)}

      {scoring.status === "error" && (
        <div role="alert" className="flex flex-col items-start gap-3">
          <span aria-hidden className="text-2xl text-negative">
            ⚠
          </span>
          <p className="text-ink-muted">
            {scoring.kind === "runtime" || scoring.kind === "import-failed"
              ? t(`score.errors.${scoring.kind}`)
              : t(`errors.${scoring.kind}`, csvLimitParams())}
          </p>
          {scoring.kind !== "import-failed" && (
            <Button variant="secondary" icon="upload" onClick={onScoreAnother}>
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
              icon="download"
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

type SupervisedScore =
  BinaryScoreResult | MulticlassScoreResult | RegressionScoreResult;

/** El lector valida el puntaje con el esquema del modelo activo: un puntaje de
 *  agrupar para un modelo con objetivo no puede llegar; si llega, falla
 *  nombrándose en vez de pintar grupos como clases. */
function supervisedScore(score: ScoreResult): SupervisedScore {
  return matchByTask(score, {
    binaria: (s): SupervisedScore => s,
    multiclase: (s): SupervisedScore => s,
    numerica: (s): SupervisedScore => s,
    agrupar: () => {
      throw new Error(
        "ScoreScreen: un puntaje de agrupar para un modelo con objetivo",
      );
    },
  });
}

function ScoredResults({
  meta,
  scoring,
  onScoreAnother,
}: {
  meta: SupervisedMeta;
  scoring: Scored;
  onScoreAnother: () => void;
}) {
  const t = useT();
  const { check, table, fileName } = scoring;
  const score = supervisedScore(scoring.score);
  const { probabilities, novelty } = score;
  const { schema } = meta;

  // S6: al estimar, la columna nueva es «<objetivo>_estimado» con los decimales
  // con que el usuario escribió su objetivo; no hay probabilidad (no se inventa).
  const decimals = matchByTask(schema, {
    binaria: () => null,
    multiclase: () => null,
    numerica: (quantitySchema) => quantitySchema.target_stats.decimals,
  });
  const quantity = matchByTask(score, {
    binaria: () => null,
    multiclase: () => null,
    numerica: (estimated) =>
      decimals === null ? null : { values: estimated.predictions, decimals },
  });
  const predictions = matchByTask(score, {
    binaria: (classified) => classified.predictions,
    multiclase: (classified) => classified.predictions,
    numerica: (estimated) =>
      formatEstimates(estimated.predictions, quantity?.decimals ?? 0),
  });

  const desiredNames = matchByTask(schema, {
    binaria: (binarySchema) => ({
      prediction: t("score.columns.prediction"),
      probability: t("score.columns.probability", {
        label: binarySchema.positive_class,
      }),
    }),
    // S7 (R11): la categoría predicha y la probabilidad de ESA categoría.
    multiclase: (multiSchema) => ({
      prediction: t("score.columns.predicted", { target: multiSchema.target }),
      probability: t("score.columns.predictedProbability", {
        target: multiSchema.target,
      }),
    }),
    numerica: (quantitySchema) => ({
      prediction: t("score.columns.estimate", {
        target: quantitySchema.target,
      }),
      probability: "",
    }),
  });
  const names = resolveScoredColumnNames(table.headers, desiredNames);
  // S7: con varias categorías, la probabilidad es la de la categoría predicha.
  const probabilityNote = matchByTask(schema, {
    binaria: () => null,
    multiclase: () => t("score.multiclassProbabilityNote"),
    numerica: () => null,
  });

  // Distribución de predicciones por clase (conteo simple, honesto). Al estimar
  // no hay clases: el resumen es mínimo · mediana · máximo.
  const counts = new Map<string, number>();
  if (!quantity) {
    for (const label of predictions) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
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
      <NoveltyPanel novelty={novelty} />

      {quantity ? (
        <QuantitySummary
          values={quantity.values}
          decimals={quantity.decimals}
          target={schema.target}
        />
      ) : (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            {t("score.distribution.title", { rows: thousands(total) })}
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
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
          {t("score.preview.title", {
            shown: Math.min(PREVIEW_ROWS, table.rows.length),
            total: thousands(table.rows.length),
          })}
        </h2>
        {/* S5: ridge y el SVM lineal no dan probabilidad — se dice, no se inventa.
            S6: estimar tampoco la da, por otra razón (no hay clases). */}
        {!probabilities && (
          <p className="text-sm text-ink-muted">
            {quantity ? t("score.quantityNote") : t("score.noProbabilities")}
          </p>
        )}
        {probabilities && probabilityNote && (
          <p className="text-sm text-ink-muted">{probabilityNote}</p>
        )}
        {/* Región scrolleable accesible por teclado (axe: scrollable-region-focusable). */}
        <div
          className="overflow-x-auto rounded-md border border-hairline"
          role="region"
          tabIndex={0}
          aria-label={t("score.preview.title", {
            shown: Math.min(PREVIEW_ROWS, table.rows.length),
            total: thousands(table.rows.length),
          })}
        >
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-sunken text-left">
                <th className="px-3 py-2 font-mono text-xs font-semibold">
                  {names.prediction}
                </th>
                {probabilities && (
                  <th className="px-3 py-2 font-mono text-xs font-semibold">
                    {names.probability}
                  </th>
                )}
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
                  {probabilities && (
                    <td className="px-3 py-1.5 font-mono tabular-nums">
                      {probabilities[index]!.toFixed(4)}
                    </td>
                  )}
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
        <Button icon="download" onClick={download}>
          {t("score.download")}
        </Button>
        <Button variant="secondary" icon="upload" onClick={onScoreAnother}>
          {t("score.another")}
        </Button>
      </div>
    </div>
  );
}

/** S6 (R20): el resumen de las cantidades estimadas — mínimo, mediana y máximo,
 *  con los mismos decimales que la columna descargada (los del objetivo). */
function QuantitySummary({
  values,
  decimals,
  target,
}: {
  values: readonly number[];
  decimals: number;
  target: string;
}) {
  const t = useT();
  const n = values.length;
  const stats = estimateSummary(values);
  const unit = inferUnit(target);
  const q = (value: number) => withUnit(formatQuantity(value, decimals), unit);
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
        {t("score.quantity.title", { count: n, rows: thousands(n) })}
      </h2>
      {stats && (
        <div className="grid grid-cols-3 gap-2 sm:max-w-md">
          <MetricTile label={t("score.quantity.min")} value={q(stats.min)} />
          <MetricTile
            label={t("score.quantity.median")}
            value={q(stats.median)}
          />
          <MetricTile label={t("score.quantity.max")} value={q(stats.max)} />
        </div>
      )}
    </section>
  );
}

/** Valores que el modelo nunca vio (categorías nuevas, números fuera de rango):
 *  SIEMPRE visible antes de descargar, en todas las tareas. */
function NoveltyPanel({ novelty }: { novelty: ScoreResult["novelty"] }) {
  const t = useT();
  const noveltyPercent = Math.round(
    (100 * novelty.affected_rows) / Math.max(novelty.n_rows, 1),
  );
  return (
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
              affected: thousands(novelty.affected_rows),
              total: thousands(novelty.n_rows),
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
  );
}

/**
 * S7 (P12): las filas nuevas con su GRUPO, asignado con la regla del agrupador
 * (el centro más cercano, la mezcla gaussiana o el centro con su radio). Los
 * grupos se numeran desde 1, como en Resultados; «fuera de todo grupo» solo
 * existe si la regla lo admite (HDBSCAN). Solo la mezcla gaussiana da una
 * probabilidad, la del grupo asignado.
 */
function ClusterScoredResults({
  schema,
  scoring,
  onScoreAnother,
}: {
  schema: ClusterScoringSchema;
  scoring: Scored;
  onScoreAnother: () => void;
}) {
  const t = useT();
  const { check, table, fileName } = scoring;
  const score = matchByTask(scoring.score, {
    agrupar: (s) => s,
    binaria: () => clusterMismatch(),
    multiclase: () => clusterMismatch(),
    numerica: () => clusterMismatch(),
  });
  const { probabilities, novelty } = score;
  const noise = t("cluster.noise.label");
  const labels = score.predictions.map((g) =>
    g === -1 ? noise : String(g + 1),
  );
  const names = {
    prediction: t("cluster.labels.column"),
    probability: t("score.columns.groupProbability"),
  };
  const resolved = resolveScoredColumnNames(table.headers, names);
  const total = labels.length;
  const percent = (n: number) => Math.round((100 * n) / Math.max(total, 1));
  const counts = Array.from({ length: schema.groups }, (_, g) => ({
    label: t("cluster.group", { n: g + 1 }),
    count: score.predictions.filter((p) => p === g).length,
  }));
  const outside = score.predictions.filter((p) => p === -1).length;

  const download = () => {
    const csv = buildScoredCsv(table, labels, probabilities, names);
    downloadTextFile(
      scoredCsvFileName(fileName, t("score.fileSuffix")),
      csv,
      "text/csv;charset=utf-8",
    );
  };

  return (
    <div className="flex flex-col gap-5">
      {check.extra.length > 0 && (
        <div className="rounded-md border border-caution/40 bg-caution/10 p-4 text-sm">
          <p className="font-medium text-caution">
            <span aria-hidden className="mr-1">
              ⚠
            </span>
            {t("score.warnings.title")}
          </p>
          <ul className="mt-1 ml-5 list-disc">
            <li>
              {t("score.warnings.extra", {
                columns: check.extra.map((c) => `«${c}»`).join(", "),
              })}
            </li>
          </ul>
        </div>
      )}

      <NoveltyPanel novelty={novelty} />

      <p className="max-w-prose text-sm text-ink-muted">
        {t(`cluster.assign.${schema.assign.method}`)}
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
          {t("score.groups.title", { rows: thousands(total) })}
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:max-w-md">
          {counts.map(({ label, count }) => (
            <MetricTile
              key={label}
              label={label}
              value={`${count} (${percent(count)}%)`}
            />
          ))}
          {schema.noise && (
            <MetricTile
              label={noise}
              value={`${outside} (${percent(outside)}%)`}
            />
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
          {t("score.preview.title", {
            shown: Math.min(PREVIEW_ROWS, table.rows.length),
            total: thousands(table.rows.length),
          })}
        </h2>
        {probabilities && (
          <p className="text-sm text-ink-muted">
            {t("score.groupProbabilityNote")}
          </p>
        )}
        <div
          className="overflow-x-auto rounded-md border border-hairline"
          role="region"
          tabIndex={0}
          aria-label={t("score.preview.title", {
            shown: Math.min(PREVIEW_ROWS, table.rows.length),
            total: thousands(table.rows.length),
          })}
        >
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-sunken text-left">
                <th className="px-3 py-2 font-mono text-xs font-semibold">
                  {resolved.prediction}
                </th>
                {probabilities && (
                  <th className="px-3 py-2 font-mono text-xs font-semibold">
                    {resolved.probability}
                  </th>
                )}
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
                  <td className="px-3 py-1.5 font-medium">{labels[index]}</td>
                  {probabilities && (
                    <td className="px-3 py-1.5 font-mono tabular-nums">
                      {probabilities[index]!.toFixed(4)}
                    </td>
                  )}
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
        <Button icon="download" onClick={download}>
          {t("score.download")}
        </Button>
        <Button variant="secondary" icon="upload" onClick={onScoreAnother}>
          {t("score.another")}
        </Button>
      </div>
    </div>
  );
}

/** El lector valida el puntaje con el esquema del modelo activo: un puntaje con
 *  objetivo para un agrupador no puede llegar; si llega, falla nombrándose. */
function clusterMismatch(): never {
  throw new Error("ScoreScreen: un puntaje con objetivo para un agrupador");
}
