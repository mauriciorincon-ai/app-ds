"use client";

import { useT } from "@/i18n/use-translation";
import type { ProgressStage } from "@/workers/protocol";

const STAGES: ProgressStage[] = [
  "loading-runtime",
  "loading-packages",
  "training",
];

export function TrainingScreen({ stage }: { stage: ProgressStage | null }) {
  const t = useT();
  const activeIndex = stage ? STAGES.indexOf(stage) : 0;

  return (
    <div className="flex flex-col gap-6" role="status" aria-live="polite">
      <h1 className="text-2xl font-semibold">{t("training.title")}</h1>
      <ol className="flex flex-col gap-3">
        {STAGES.map((s, index) => {
          const done = index < activeIndex;
          const active = index === activeIndex;
          return (
            <li key={s} className="flex items-center gap-3">
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
                {t(`training.${s}`)}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-sm text-ink-muted">{t("training.wait")}</p>
    </div>
  );
}
