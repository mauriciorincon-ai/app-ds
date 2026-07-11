"use client";

import { useRef, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { useT } from "@/i18n/use-translation";
import {
  validateModelFile,
  type ModelFile,
  type ModelFileErrorKind,
  type VersionWarning,
} from "@/lib/model-file";
import { reportImportError } from "@/lib/observability";
import { Button, Card } from "./ui";

const EXAMPLES = [
  { key: "marketing", file: "marketing-campania.csv" },
  { key: "rotacion", file: "rotacion-empleados.csv" },
  { key: "credito", file: "credito-fuga-plantada.csv" },
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
        className={`flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center transition-colors ${
          dragging ? "border-accent bg-accent/5" : "border-hairline bg-surface"
        }`}
      >
        <p>{t("start.dropzone.label")}</p>
        <p className="text-sm text-ink-muted">{t("start.dropzone.hint")}</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="min-h-11 rounded-md bg-accent px-4 text-sm font-medium text-accent-ink hover:opacity-90"
        >
          {t("start.dropzone.button")}
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

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
          {t("start.examples.title")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {EXAMPLES.map(({ key, file }) => (
            <button
              key={key}
              type="button"
              onClick={() => void pickExample(file)}
              className="flex flex-col gap-1 rounded-lg border border-hairline bg-surface p-4 text-left shadow-sm transition-colors hover:border-accent"
            >
              <span className="font-medium">
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
  | { step: "rejected"; error: ModelFileErrorKind };

function ImportModelSection({
  onImport,
}: {
  onImport: (file: ModelFile) => void;
}) {
  const { locale, t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<ImportStatus>({ step: "idle" });

  async function handleFile(file: File) {
    setStatus({ step: "validating" });
    const validation = await validateModelFile(await file.text());
    if (!validation.ok) {
      // Solo el kind del rechazo (metadata) — jamás el contenido del archivo.
      reportImportError(validation.error);
      setStatus({ step: "rejected", error: validation.error });
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
            <Button variant="secondary" onClick={pickFile}>
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
              {t(`start.import.errors.${status.error}`)}
            </p>
            <p className="text-ink-muted">{t("start.import.errors.hint")}</p>
            <Button variant="secondary" onClick={pickFile}>
              {t("start.import.retry")}
            </Button>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
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

// Resumen honesto del manifiesto ANTES de continuar: qué modelo es, de qué
// dataset, con qué veredicto — y la advertencia franca si las versiones del
// archivo no son las de esta app.
function ImportSummary({
  file,
  warnings,
  locale,
  onConfirm,
  onCancel,
}: {
  file: ModelFile;
  warnings: VersionWarning[];
  locale: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const { manifest } = file;
  const date = new Date(manifest.created_at).toLocaleDateString(
    locale === "es" ? "es-ES" : "en-US",
    { year: "numeric", month: "long", day: "numeric" },
  );
  const fmt = (value: number) => value.toFixed(2);

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
            rows: manifest.dataset.n_train + manifest.dataset.n_test,
            date,
          })}
        </li>
        <li>
          {t("start.import.summary.target", {
            target: manifest.schema.target,
            positive: manifest.schema.positive_class,
          })}
        </li>
        <li className="font-mono tabular-nums">
          {t("start.import.summary.metric", {
            metric: t(`results.metrics.${manifest.verdict.primaryMetric}`),
            value: fmt(manifest.verdict.modelScore),
          })}{" "}
          — {t(`results.verdict.${manifest.verdict.level}`)}
        </li>
        <li>
          {manifest.leakage.length > 0
            ? t("start.import.summary.leakage", {
                count: manifest.leakage.length,
              })
            : t("start.import.summary.noLeakage")}
        </li>
      </ul>

      {warnings.length > 0 && (
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
      )}

      <div className="mt-1 flex flex-wrap gap-3">
        <Button onClick={onConfirm}>{t("start.import.summary.use")}</Button>
        <Button variant="secondary" onClick={onCancel}>
          {t("start.import.summary.cancel")}
        </Button>
      </div>
    </div>
  );
}
