"use client";

import { isTrainable, type TaskDetection } from "@/engine/tarea";
import { useT } from "@/i18n/use-translation";

// E1 (S5): qué tipo de predicción plantea la columna elegida y por qué. La
// honestidad acompaña: toda columna se puede elegir; si su tarea todavía no se
// entrena, se dice de frente (no se esconde la columna ni se adivina). Si la
// tarea se entrena pero el plan está bloqueado (p. ej. muy pocas filas), no hay
// ✓: la tarjeta remite al motivo, que se muestra debajo.
export function TaskCard({
  detection,
  blocked = false,
}: {
  detection: TaskDetection;
  blocked?: boolean;
}) {
  const t = useT();
  const task = t(`task.name.${detection.task}`);
  const trainable = isTrainable(detection) && !blocked;
  return (
    <div
      role="status"
      className={`flex items-start gap-2.5 rounded-md border p-3 text-sm ${
        trainable
          ? "border-positive/60 border-l-4 border-l-positive bg-positive/15"
          : "border-caution/40 bg-caution/10"
      }`}
    >
      <span
        aria-hidden
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          trainable ? "bg-positive text-bg" : "text-caution"
        }`}
      >
        {trainable ? "✓" : "⚠"}
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-medium">
          <span className="sr-only">{t("task.title")}: </span>
          {t(`task.reason.${detection.reason}`, {
            distinct: detection.distinct,
            task,
          })}
        </p>
        {detection.suggested && (
          <p>
            {t("task.suggested", {
              task: t(`task.name.${detection.suggested}`),
            })}
          </p>
        )}
        <p className={trainable ? "" : "text-ink-muted"}>
          {trainable
            ? t("task.trainable")
            : blocked
              ? t("task.blocked")
              : t("task.notYet")}
        </p>
      </div>
    </div>
  );
}
