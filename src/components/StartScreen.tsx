"use client";

import { useRef, useState } from "react";
import { useT } from "@/i18n/use-translation";

const EXAMPLES = [
  { key: "marketing", file: "marketing-campania.csv" },
  { key: "rotacion", file: "rotacion-empleados.csv" },
  { key: "credito", file: "credito-fuga-plantada.csv" },
] as const;

export function StartScreen({
  onLoad,
}: {
  onLoad: (csv: string, name: string) => void;
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
    </div>
  );
}
