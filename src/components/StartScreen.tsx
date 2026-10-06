"use client";

import { useRef, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { useT } from "@/i18n/use-translation";
import { matchByTask, matchTask } from "@/engine/despacho";
import { memberNameKey } from "@/engine/roster";
import { isTask } from "@/engine/tarea";
import { inferUnit } from "@/lib/experiment";
import {
  manifestTask,
  MAX_MODEL_FILE_BYTES,
  validateModelFile,
  type ClusterManifest,
  type ModelFile,
  type ModelManifest,
  type SupervisedManifest,
  type ModelFileErrorKind,
  type VersionWarning,
} from "@/lib/model-file";
import { reportImportError } from "@/lib/observability";
import {
  formatQuantity,
  quantityDecimals,
  thousands,
  withUnit,
} from "@/lib/quantity";
import { Button, Card, Icon } from "./ui";

export const EXAMPLES = [
  { key: "marketing", file: "marketing-campania.csv" },
  { key: "rotacion", file: "rotacion-empleados.csv" },
  { key: "credito", file: "credito-fuga-plantada.csv" },
  // S4: dataset "real" sucio (nulos mixtos, basura, ID, constante, duplicados,
  // categoría rara) para demostrar el saneamiento transparente.
  { key: "clientes", file: "clientes-sucio.csv" },
  // S6 (P9): estimar una cantidad — el consumo de una casa, en kWh.
  { key: "consumo", file: "consumo-energia.csv" },
  // S7 (decisión 7: después de bajar el LCP): clasificar en cinco categorías y
  // agrupar sin objetivo.
  { key: "planes", file: "planes-suscripcion.csv" },
  { key: "segmentos", file: "segmentos-clientes.csv" },
] as const;

export function StartScreen({
  onLoad,
  onImport,
}: {
  onLoad: (csv: string, name: string) => void;
  onImport: (file: ModelFile) => void;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File) {
    onLoad(await file.text(), file.name);
  }

  async function pickExample(file: string) {
    const response = await fetch(`/datasets/${file}`);
    onLoad(await response.text(), file);
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("start.title")}
        </h1>
        <p className="max-w-prose text-ink-muted">{t("start.subtitle")}</p>
      </header>

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
          dragging ? "border-accent bg-accent/5" : "border-hairline bg-surface"
        }`}
      >
        <p>{t("start.dropzone.label")}</p>
        <p className="text-sm text-ink-muted">{t("start.dropzone.hint")}</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-ink hover:opacity-90"
        >
          <Icon name="upload" />
          {t("start.dropzone.button")}
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

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
          {t("start.examples.title")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {EXAMPLES.map(({ key, file }) => (
            <button
              key={key}
              type="button"
              onClick={() => void pickExample(file)}
              className="flex flex-col gap-1 rounded-lg border border-hairline bg-surface p-4 text-left shadow-sm transition-colors hover:border-accent motion-reduce:transition-none"
            >
              <span className="flex items-center gap-2 font-medium">
                <Icon name="table" className="text-accent" />
                {t(`start.examples.${key}.name`)}
              </span>
              <span className="text-sm text-ink-muted">
                {t(`start.examples.${key}.desc`)}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* S3: importar un modelo exportado por Probeta (validación TS + hash
          ANTES de que el payload toque Pyodide). */}
      <ImportModelSection onImport={onImport} />
    </div>
  );
}

type ImportStatus =
  | { step: "idle" }
  | { step: "validating" }
  | { step: "summary"; file: ModelFile; warnings: VersionWarning[] }
  | { step: "rejected"; error: ModelFileErrorKind; task?: string };

function ImportModelSection({
  onImport,
}: {
  onImport: (file: ModelFile) => void;
}) {
  const { locale, t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<ImportStatus>({ step: "idle" });

  async function handleFile(file: File) {
    // file.size se mira ANTES de leer: el tope debe proteger la memoria, no
    // llegar tarde con el archivo ya cargado.
    if (file.size > MAX_MODEL_FILE_BYTES) {
      reportImportError("file-too-large");
      setStatus({ step: "rejected", error: "file-too-large" });
      return;
    }
    setStatus({ step: "validating" });
    const validation = await validateModelFile(await file.text());
    if (!validation.ok) {
      // Solo el kind del rechazo (metadata) — jamás el contenido del archivo.
      reportImportError(validation.error);
      setStatus({
        step: "rejected",
        error: validation.error,
        task: validation.task,
      });
      return;
    }
    setStatus({
      step: "summary",
      file: validation.file,
      warnings: validation.warnings,
    });
  }

  const pickFile = () => inputRef.current?.click();

  return (
    <section
      aria-labelledby="import-model-title"
      className="flex flex-col gap-3"
    >
      <h2
        id="import-model-title"
        className="text-sm font-semibold uppercase tracking-wide text-ink-muted"
      >
        {t("start.import.title")}
      </h2>

      <Card className="p-4">
        {status.step === "idle" && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-ink-muted">{t("start.import.desc")}</p>
            <Button variant="secondary" icon="import" onClick={pickFile}>
              {t("start.import.button")}
            </Button>
          </div>
        )}

        {status.step === "validating" && (
          <p
            role="status"
            aria-live="polite"
            className="text-sm text-ink-muted"
          >
            {t("start.import.validating")}
          </p>
        )}

        {status.step === "summary" && (
          <ImportSummary
            file={status.file}
            warnings={status.warnings}
            locale={locale}
            onConfirm={() => onImport(status.file)}
            onCancel={() => setStatus({ step: "idle" })}
          />
        )}

        {status.step === "rejected" && (
          <div role="alert" className="flex flex-col items-start gap-2 text-sm">
            <p className="font-medium text-negative">
              <span aria-hidden className="mr-1">
                ✕
              </span>
              {t(`start.import.errors.${status.error}`, {
                // La tarea que declara el archivo: con su nombre si esta versión
                // la conoce; si no (p. ej. una futura), tal como viene.
                task:
                  status.task === undefined
                    ? ""
                    : isTask(status.task)
                      ? t(`task.name.${status.task}`)
                      : status.task,
              })}
            </p>
            <p className="text-ink-muted">{t("start.import.errors.hint")}</p>
            <Button variant="secondary" icon="retry" onClick={pickFile}>
              {t("start.import.retry")}
            </Button>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          // El control real es el botón visible; el input es solo el mecanismo
          // del navegador: fuera del orden de tabulación y del árbol de
          // accesibilidad (Lighthouse S6: «label» en un input sin nombre).
          tabIndex={-1}
          aria-hidden
          accept=".json,application/json"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Permite re-elegir el mismo archivo tras un rechazo.
            event.target.value = "";
            if (file) void handleFile(file);
          }}
        />
      </Card>
    </section>
  );
}

type ImportSummaryProps<M> = {
  manifest: M;
  warnings: VersionWarning[];
  locale: string;
  onConfirm: () => void;
  onCancel: () => void;
};

// Resumen honesto del manifiesto ANTES de continuar: qué modelo es, de qué
// dataset, con qué veredicto — y la advertencia franca si las versiones del
// archivo no son las de esta app. S7: el de agrupar dice sus grupos y su lectura.
function ImportSummary({
  file,
  ...rest
}: Omit<ImportSummaryProps<ModelManifest>, "manifest"> & { file: ModelFile }) {
  return matchByTask(file.manifest, {
    binaria: (manifest) => (
      <SupervisedImportSummary {...rest} manifest={manifest} />
    ),
    multiclase: (manifest) => (
      <SupervisedImportSummary {...rest} manifest={manifest} />
    ),
    numerica: (manifest) => (
      <SupervisedImportSummary {...rest} manifest={manifest} />
    ),
    agrupar: (manifest) => (
      <ClusterImportSummary {...rest} manifest={manifest} />
    ),
  });
}

/** La fecha de creación de un archivo, en el idioma activo. */
const createdOn = (createdAt: string, locale: string) =>
  new Date(createdAt).toLocaleDateString(locale === "es" ? "es-ES" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

function VersionWarningLine({ warnings }: { warnings: VersionWarning[] }) {
  const t = useT();
  if (warnings.length === 0) return null;
  return (
    <p className="rounded-md border border-caution/40 bg-caution/10 p-3 text-caution">
      <span aria-hidden className="mr-1">
        ⚠
      </span>
      {t("start.import.summary.versionWarning", {
        list: warnings
          .map((w) => `${w.component} ${w.file} → ${w.runtime}`)
          .join(", "),
      })}
    </p>
  );
}

/** S7 (ADR 016): un archivo de AGRUPAR — sin objetivo ni veredicto: sus grupos,
 *  su lectura, cómo se eligió y con qué regla asignará las filas nuevas. */
function ClusterImportSummary({
  manifest,
  warnings,
  locale,
  onConfirm,
  onCancel,
}: ImportSummaryProps<ClusterManifest>) {
  const t = useT();
  const n = (value: number) => thousands(value);
  const model = t(memberNameKey(manifest.model_name, "agrupar"));
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="font-medium">
        <span aria-hidden className="mr-1 text-positive">
          ✓
        </span>
        {t("start.import.summary.title")}
      </p>
      <ul className="ml-5 list-disc">
        <li>
          {t("start.import.summary.dataset", {
            name: manifest.dataset.name,
            rows: thousands(manifest.dataset.n_rows),
            date: createdOn(manifest.created_at, locale),
          })}
        </li>
        <li>
          {t("start.import.summary.cluster", {
            k: manifest.groups,
            model,
          })}
        </li>
        <li>{t(`start.import.summary.reading.${manifest.reading.level}`)}</li>
        <li>
          {manifest.selection.by === "user"
            ? t("start.import.summary.clusterChosen", {
                winner: t(
                  `results.candidates.short.${manifest.selection.consensus_winner}`,
                ),
              })
            : t("start.import.summary.clusterWinner", {
                k: manifest.selection.k,
                count: manifest.league.length,
              })}
        </li>
        <li>{t(`cluster.assign.${manifest.assignment.method}`)}</li>
        {manifest.assignment.sample_rows !== null && (
          <li>
            {t("cluster.sample.title", {
              sample: n(manifest.assignment.sample_rows),
              rows: n(manifest.dataset.n_rows),
            })}
          </li>
        )}
      </ul>

      <VersionWarningLine warnings={warnings} />

      <div className="mt-1 flex flex-wrap gap-3">
        <Button icon="check" onClick={onConfirm}>
          {t("start.import.summary.use")}
        </Button>
        <Button variant="secondary" icon="x" onClick={onCancel}>
          {t("start.import.summary.cancel")}
        </Button>
      </div>
    </div>
  );
}

function SupervisedImportSummary({
  manifest,
  warnings,
  locale,
  onConfirm,
  onCancel,
}: ImportSummaryProps<SupervisedManifest>) {
  const t = useT();
  const date = createdOn(manifest.created_at, locale);
  const task = manifestTask(manifest);
  // S6: el MAE se lee en las unidades del objetivo; las métricas de clase, de 0 a 1.
  const fmt = (value: number) =>
    matchTask(task, {
      binaria: () => value.toFixed(2),
      multiclase: () => value.toFixed(2),
      numerica: () =>
        withUnit(
          formatQuantity(value, quantityDecimals([value])),
          inferUnit(manifest.schema.target),
        ),
    });

  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="font-medium">
        <span aria-hidden className="mr-1 text-positive">
          ✓
        </span>
        {t("start.import.summary.title")}
      </p>
      <ul className="ml-5 list-disc">
        <li>
          {t("start.import.summary.dataset", {
            name: manifest.dataset.name,
            rows: thousands(manifest.dataset.n_train + manifest.dataset.n_test),
            date,
          })}
        </li>
        <li>
          {matchByTask(manifest, {
            binaria: (binary) =>
              t("start.import.summary.target", {
                target: binary.schema.target,
                positive: binary.schema.positive_class,
              }),
            multiclase: (multi) =>
              t("start.import.summary.targetMulticlass", {
                target: multi.schema.target,
                count: multi.schema.classes.length,
              }),
            numerica: (regression) =>
              t("start.import.summary.targetQuantity", {
                target: regression.schema.target,
              }),
          })}
        </li>
        <li className="font-mono tabular-nums">
          {t("start.import.summary.metric", {
            metric: t(`results.metrics.${manifest.verdict.primaryMetric}`),
            value: fmt(manifest.verdict.modelScore),
          })}{" "}
          — {t(`start.import.summary.verdict.${manifest.verdict.level}`)}
        </li>
        {/* S4: nombre del modelo ganador (campo aditivo opcional del manifiesto;
            un archivo S3 sin él simplemente no muestra esta línea). */}
        {manifest.model_name && (
          <li>
            {t("start.import.summary.model", {
              model: t(memberNameKey(manifest.model_name, task)),
            })}
          </li>
        )}
        {/* S5: cómo se eligió — la etiqueta «◆ Elegido por ti» cruza el archivo
            (la honestidad acompaña también al modelo importado). */}
        {manifest.selection?.by === "user" && (
          <li>
            {t("start.import.summary.chosen", {
              winner: t(
                `results.candidates.short.${manifest.selection.cv_winner}`,
              ),
            })}
          </li>
        )}
        {manifest.selection?.by === "cv" && (
          <li>
            {t("start.import.summary.cv", {
              k: manifest.selection.k,
              count: manifest.league?.length ?? 0,
            })}
          </li>
        )}
        <li>
          {manifest.leakage.length > 0
            ? t("start.import.summary.leakage", {
                count: manifest.leakage.length,
              })
            : t("start.import.summary.noLeakage")}
        </li>
      </ul>

      <VersionWarningLine warnings={warnings} />

      <div className="mt-1 flex flex-wrap gap-3">
        <Button icon="check" onClick={onConfirm}>
          {t("start.import.summary.use")}
        </Button>
        <Button variant="secondary" icon="x" onClick={onCancel}>
          {t("start.import.summary.cancel")}
        </Button>
      </div>
    </div>
  );
}
