"use client";

// Model card: la constancia del experimento. Vista previa plegable + descarga
// .md (Blob, 100% client-side — el archivo no toca ninguna red). Cita la
// narración IA solo si quedó verificada (la decide el estado, no este componente).
import { useI18n } from "@/i18n/provider";
import { buildModelCard, modelCardFileName } from "@/lib/modelcard";
import type { ExperimentResult } from "@/workers/protocol";
import { Button, Card } from "./ui";

export type ModelCardMeta = {
  datasetName: string;
  cols: number;
  numericFeatures: number;
  categoricalFeatures: number;
  target: string;
  seed: number;
};

export function ModelCardView({
  result,
  meta,
  verifiedNarrative,
}: {
  result: ExperimentResult;
  meta: ModelCardMeta;
  verifiedNarrative: string | null;
}) {
  const { locale, t } = useI18n();

  const markdown = buildModelCard({
    locale,
    datasetName: meta.datasetName,
    cols: meta.cols,
    numericFeatures: meta.numericFeatures,
    categoricalFeatures: meta.categoricalFeatures,
    target: meta.target,
    seed: meta.seed,
    result,
    verifiedNarrative,
  });

  const download = () => {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = modelCardFileName(meta.datasetName);
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section aria-labelledby="modelcard-title">
      <Card className="p-5">
        <h2 id="modelcard-title" className="text-sm font-semibold">
          {t("card.title")}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{t("card.desc")}</p>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={download}>{t("card.download")}</Button>
        </div>

        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-ink-muted underline-offset-4 hover:underline">
            {t("card.preview")}
          </summary>
          <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-sunken p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {markdown}
          </pre>
        </details>
      </Card>
    </section>
  );
}
