"use client";

import { useT } from "@/i18n/use-translation";
import { formatEstimate } from "@/lib/duration";
import type { ProgressDetail, ProgressStage } from "@/workers/protocol";
import { Button } from "./ui";

const STAGES: ProgressStage[] = [
  "loading-runtime",
  "loading-packages",
  "training",
];

export function TrainingScreen({
  stage,
  detail = null,
  level2 = null,
  estimateS = null,
  cluster = false,
  onCancel,
}: {
  stage: ProgressStage | null;
  /** S5: modelo a modelo durante la liga (CV de todos, luego el test). */
  detail?: ProgressDetail | null;
  /** S5: corriendo el Nivel 2 (se puede cancelar: vuelve el Nivel 1). */
  level2?: { count: number; estimateS: number } | null;
  /** S5: segundos estimados del Nivel 1 (la misma cifra que prometió Configuración). */
  estimateS?: number | null;
  /** S7: agrupando (sin validación cruzada ni prueba): otro texto de la etapa. */
  cluster?: boolean;
  onCancel?: () => void;
}) {
  const t = useT();
  const activeIndex = stage ? STAGES.indexOf(stage) : 0;
  // Avance de la liga: la CV de todos y luego el test de todos (dos vueltas). S7:
  // al agrupar, el barrido de cada agrupador y, al final, la lectura del ganador.
  const steps = !detail
    ? 0
    : detail.phase === "cv" || detail.phase === "test"
      ? detail.total * 2
      : detail.total + 1;
  const step = !detail
    ? 0
    : detail.phase === "cv" || detail.phase === "cluster"
      ? detail.index + 1
      : detail.total + (detail.phase === "test" ? detail.index + 1 : 1);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("training.title")}</h1>
      {level2 ? (
        <p className="font-mono text-sm tabular-nums">
          {t("level2.running", {
            count: level2.count,
            time: formatEstimate(level2.estimateS),
          })}
        </p>
      ) : (
        estimateS !== null && (
          <p className="font-mono text-sm tabular-nums">
            {t("training.estimate", { time: formatEstimate(estimateS) })}
          </p>
        )
      )}
      {/* La región viva anuncia solo el cambio de etapa: la línea por modelo
          (hasta 2·N cambios por liga) queda fuera; la barra expone el avance.
          Envuelve la lista (un role en el <ol> le quitaría su semántica). */}
      <div role="status" aria-live="polite">
        <ol className="flex flex-col gap-3">
          {STAGES.map((s, index) => {
            const done = index < activeIndex;
            const active = index === activeIndex;
            return (
              <li key={s} className="flex items-center gap-3">
                <span
                  aria-hidden
                  className={`grid size-6 shrink-0 place-items-center rounded-full border font-mono text-xs ${
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
                  {cluster && s === "training"
                    ? t("training.clustering")
                    : t(`training.${s}`)}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      {detail && (
        <div className="flex flex-col gap-2">
          <p className="font-mono text-sm tabular-nums">
            {t(`training.member.${detail.phase}`, {
              index: detail.index + 1,
              total: detail.total,
              model: t(`results.candidates.short.${detail.member}`),
            })}
          </p>
          <div
            role="progressbar"
            aria-label={t("training.training")}
            aria-valuemin={0}
            aria-valuemax={steps}
            aria-valuenow={step}
            className="h-1.5 w-full overflow-hidden rounded-full bg-sunken"
          >
            <div
              className="h-full bg-accent"
              style={{ width: `${(100 * step) / Math.max(steps, 1)}%` }}
            />
          </div>
        </div>
      )}
      {level2 && onCancel ? (
        <div className="flex flex-col items-start gap-2">
          <Button variant="secondary" icon="stop" onClick={onCancel}>
            {t("level2.cancel")}
          </Button>
          <p className="text-sm text-ink-muted">{t("level2.cancelHint")}</p>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">{t("training.wait")}</p>
      )}
    </div>
  );
}
