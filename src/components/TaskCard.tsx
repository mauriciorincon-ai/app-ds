"use client";

import { useEffect, useRef, useState } from "react";
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
  // Responder (o cambiar la respuesta) desmonta el control que tenía el foco: el
  // foco va a lo que aparece en su lugar, para que el teclado y el lector de
  // pantalla no se pierdan (AU-S6-04). Al montar no se roba el foco a nadie.
  const [moveFocus, setMoveFocus] = useState(false);
  const answer = onAnswer
    ? (next: AmbiguousChoice | null) => {
        setMoveFocus(true);
        onAnswer(next);
      }
    : undefined;
  if (detection.task === "ambigua" && answer && choice === null) {
    return (
      <AmbiguousQuestion
        detection={detection}
        target={target}
        onAnswer={answer}
        autoFocus={moveFocus}
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
      onAnswer={answer}
      autoFocus={moveFocus}
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
  autoFocus,
}: {
  detection: TaskDetection;
  target: string;
  onAnswer: (choice: AmbiguousChoice) => void;
  autoFocus: boolean;
}) {
  const t = useT();
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (autoFocus) firstRef.current?.focus();
  }, [autoFocus]);
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
                ref={id === CHOICES[0]!.id ? firstRef : undefined}
                type="button"
                onClick={() => onAnswer(id)}
                // El nombre es la etiqueta (y «Sugerida»); la descripción va
                // aparte, para que el lector no la lea dos veces (AU-S6-38).
                aria-labelledby={`task-answer-${id}-label`}
                aria-describedby={`task-answer-${id}`}
                className={`flex min-h-11 w-full items-start gap-3 rounded-md border p-3 text-left transition-colors motion-reduce:transition-none hover:bg-sunken ${
                  suggested
                    ? "border-accent bg-accent/5"
                    : "border-hairline bg-surface"
                }`}
              >
                <Icon name={icon} className="mt-0.5 h-5 w-5" />
                <span className="flex flex-col gap-0.5">
                  <span
                    id={`task-answer-${id}-label`}
                    className="flex flex-wrap items-center gap-x-2 font-medium"
                  >
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
  autoFocus,
}: {
  detection: TaskDetection;
  blocked: boolean;
  target: string;
  resolved: Task;
  choice: AmbiguousChoice | null;
  unit: TargetUnit | null;
  onAnswer?: (choice: AmbiguousChoice | null) => void;
  autoFocus: boolean;
}) {
  const t = useT();
  const task = t(`task.name.${detection.task}`);
  const trainable = isTrainableTask(resolved) && !blocked;
  const answered = detection.task === "ambigua" && choice !== null;
  // Tras responder, el foco va a la respuesta: el lector la lee (un role="status"
  // que nace con su texto no siempre se anuncia).
  const headRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (autoFocus && answered) headRef.current?.focus();
  }, [autoFocus, answered]);
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
        <p ref={headRef} tabIndex={-1} className="font-medium">
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
              ? // Una columna que no sirve como objetivo no espera una versión
                // futura: se dice de frente (AU-S6-05).
                t(
                  detection.task === "sin-objetivo"
                    ? "task.notUsable"
                    : "task.notYet",
                )
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
