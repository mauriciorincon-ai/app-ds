"use client";

import {
  isTrainableTask,
  type AmbiguousChoice,
  type Task,
  type TaskDetection,
} from "@/engine/tarea";
import { useT } from "@/i18n/use-translation";
import type { TargetUnit } from "@/workers/protocol";
import { Button, Icon, type IconName } from "./ui";

// E1 (S5): qué tipo de predicción plantea la columna elegida y por qué. La
// honestidad acompaña: toda columna se puede elegir; si su tarea todavía no se
// entrena, se dice de frente (no se esconde la columna ni se adivina). Si la
// tarea se entrena pero el plan está bloqueado (p. ej. muy pocas filas), no hay
// ✓: la tarjeta remite al motivo, que se muestra debajo.
//
// S6 (D2): una columna AMBIGUA (pocos números distintos) no se adivina: se
// pregunta «¿categorías o una cantidad?», con la lectura más probable marcada
// con símbolo + texto. Con la respuesta, la tarjeta pasa a la tarea respondida.
export function TaskCard({
  detection,
  blocked = false,
  target = "",
  resolved = detection.task,
  choice = null,
  unit = null,
  onAnswer,
}: {
  detection: TaskDetection;
  blocked?: boolean;
  /** El nombre de la columna objetivo (para la pregunta y la unidad). */
  target?: string;
  /** La tarea con que se entrenaría (la respondida, si era ambigua). */
  resolved?: Task;
  choice?: AmbiguousChoice | null;
  /** Solo al estimar: la unidad leída del nombre de la columna. */
  unit?: TargetUnit | null;
  onAnswer?: (choice: AmbiguousChoice | null) => void;
}) {
  if (detection.task === "ambigua" && onAnswer && choice === null) {
    return (
      <AmbiguousQuestion
        detection={detection}
        target={target}
        onAnswer={onAnswer}
      />
    );
  }
  return (
    <TaskStatus
      detection={detection}
      blocked={blocked}
      target={target}
      resolved={resolved}
      choice={choice}
      unit={unit}
      onAnswer={onAnswer}
    />
  );
}

const CHOICES: { id: AmbiguousChoice; icon: IconName }[] = [
  { id: "numerica", icon: "ruler" },
  { id: "multiclase", icon: "tag" },
];

function AmbiguousQuestion({
  detection,
  target,
  onAnswer,
}: {
  detection: TaskDetection;
  target: string;
  onAnswer: (choice: AmbiguousChoice) => void;
}) {
  const t = useT();
  return (
    <div
      role="group"
      aria-labelledby="task-question"
      className="flex flex-col gap-3 rounded-md border border-l-4 border-hairline border-l-accent bg-surface p-4 text-sm"
    >
      <div className="flex flex-col gap-1">
        <p id="task-question" className="font-semibold">
          <span aria-hidden className="mr-1.5 text-accent">
            ?
          </span>
          {t("task.ask.question", { column: target })}
        </p>
        <p className="text-ink-muted">
          {t(`task.reason.${detection.reason}`, {
            distinct: detection.distinct,
          })}{" "}
          {t("task.ask.help")}
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {CHOICES.map(({ id, icon }) => {
          const suggested = detection.suggested === id;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onAnswer(id)}
                aria-describedby={`task-answer-${id}`}
                className={`flex min-h-11 w-full items-start gap-3 rounded-md border p-3 text-left transition-colors motion-reduce:transition-none hover:bg-sunken ${
                  suggested
                    ? "border-accent bg-accent/5"
                    : "border-hairline bg-surface"
                }`}
              >
                <Icon name={icon} className="mt-0.5 h-5 w-5" />
                <span className="flex flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-x-2 font-medium">
                    {t(`task.ask.${id}.label`)}
                    {suggested && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent">
                        <span aria-hidden>★</span>
                        {t("task.ask.suggested")}
                      </span>
                    )}
                  </span>
                  <span
                    id={`task-answer-${id}`}
                    className="text-xs text-ink-muted"
                  >
                    {t(`task.ask.${id}.desc`)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TaskStatus({
  detection,
  blocked,
  target,
  resolved,
  choice,
  unit,
  onAnswer,
}: {
  detection: TaskDetection;
  blocked: boolean;
  target: string;
  resolved: Task;
  choice: AmbiguousChoice | null;
  unit: TargetUnit | null;
  onAnswer?: (choice: AmbiguousChoice | null) => void;
}) {
  const t = useT();
  const task = t(`task.name.${detection.task}`);
  const trainable = isTrainableTask(resolved) && !blocked;
  const answered = detection.task === "ambigua" && choice !== null;
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
          {answered
            ? t("task.ask.answered", {
                answer: t(`task.ask.${choice}.label`),
              })
            : t(`task.reason.${detection.reason}`, {
                distinct: detection.distinct,
                task,
              })}
        </p>
        {!answered && detection.suggested && (
          <p>
            {t("task.suggested", {
              task: t(`task.name.${detection.suggested}`),
            })}
          </p>
        )}
        <p className={trainable ? "" : "text-ink-muted"}>
          {blocked
            ? t("task.blocked")
            : !trainable
              ? t("task.notYet")
              : resolved === "numerica"
                ? unit?.symbol
                  ? t("task.estimate.unit", { unit: unit.symbol })
                  : t("task.estimate.noUnit", { column: target })
                : t("task.trainable")}
        </p>
        {answered && onAnswer && (
          <div>
            <Button
              variant="ghost"
              icon="retry"
              onClick={() => onAnswer(null)}
              className="-ml-4"
            >
              {t("task.ask.change")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
