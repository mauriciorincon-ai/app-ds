"use client";

import { useState } from "react";
import {
  MLP_MIN_ROWS,
  measuredRun,
  planLevel2,
  type Placement,
  type RouteProfile,
} from "@/engine/encarrilador";
import { byPriority, type MemberId } from "@/engine/roster";
import { useT } from "@/i18n/use-translation";
import { formatEstimate } from "@/lib/duration";
import type { Level2State } from "@/lib/useExperiment";
import type { ExperimentResult } from "@/workers/protocol";
import { Button, Card, Icon } from "./ui";

// S5 (D5 + U3 + R1): el Nivel 2. Suma lo que no cupo en el techo, deja incluir
// «de todos modos» lo que el encarrilador recomendó dejar fuera, y estima el
// tiempo EN ESTE EQUIPO (calibrado con lo que tardó la corrida anterior). Re-corre
// la liga entera; cancelar devuelve este mismo resultado.
export function Level2Card({
  result,
  profile,
  forced,
  level2,
  busy,
  onRun,
}: {
  result: ExperimentResult;
  profile: RouteProfile;
  /** Los ya incluidos de todos modos en la liga vigente. */
  forced: readonly MemberId[];
  level2: Level2State;
  /** El worker está ocupado (ajustando un elegido o restaurando el modelo). */
  busy: boolean;
  onRun: (extraForced: MemberId[]) => void;
}) {
  const t = useT();
  const [extra, setExtra] = useState<MemberId[]>([]);
  const ran = result.league.map((row) => row.name);
  const measured = measuredRun(result.selection.elapsedMs, result.league);
  const baseline = planLevel2(profile, ran, measured, forced);
  const plan = planLevel2(profile, ran, measured, [...forced, ...extra]);
  const short = (id: MemberId) => t(`results.candidates.short.${id}`);
  const outReason = (p: Placement) =>
    t(`roster.reason.${p.outReason ?? p.reason}`, {
      rows: profile.rows,
      min: MLP_MIN_ROWS,
      share: Math.round((profile.minorityShare ?? 0) * 100),
    });
  const toggle = (id: MemberId) =>
    setExtra((current) =>
      current.includes(id)
        ? current.filter((other) => other !== id)
        : byPriority([...current, id]),
    );

  const notice =
    level2.status === "cancelled" ||
    level2.status === "failed" ||
    level2.status === "restore-failed"
      ? level2.status
      : null;
  // Nada que sumar ni que incluir: la tarjeta solo aparece para dar un aviso.
  if (baseline.forceable.length === 0 && baseline.added.length === 0) {
    return notice ? <Level2Notice notice={notice} busy={busy} /> : null;
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <section aria-labelledby="level2-title" className="flex flex-col gap-3">
        <h2 id="level2-title" className="text-base font-semibold">
          {t("level2.title")}
        </h2>
        {notice && <Level2Notice notice={notice} busy={busy} inline />}
        <p className="text-sm">
          {baseline.added.length > 0
            ? t("level2.desc", {
                count: baseline.added.length,
                models: baseline.added.map(short).join(", "),
              })
            : t("level2.descAllRan")}
        </p>

        {baseline.forceable.length > 0 && (
          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm font-medium">
              {t("level2.forceTitle")}
            </legend>
            {baseline.forceable.map((p) => (
              <label
                key={p.id}
                className="flex min-h-11 items-start gap-3 py-1 text-sm"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 size-5 shrink-0 accent-accent"
                  checked={extra.includes(p.id)}
                  onChange={() => toggle(p.id)}
                />
                <span>
                  <span className="font-medium">{short(p.id)}</span>
                  <span className="block text-ink-muted">
                    {t("level2.forceReason", { reason: outReason(p) })}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {result.selection.by === "user" && plan.added.length > 0 && (
          <p className="text-sm text-ink-muted">{t("level2.dropsChoice")}</p>
        )}

        {/* Mono solo para las cifras; la frase que las explica, en prosa. */}
        {plan.added.length > 0 ? (
          <p className="text-sm">
            <span className="font-mono tabular-nums">
              {t("level2.estimate", {
                count: plan.roster.length,
                time: formatEstimate(plan.estimateS),
              })}
            </span>
            <span className="block text-ink-muted">
              {t("level2.estimateNote")}
            </span>
          </p>
        ) : (
          <p className="text-sm text-ink-muted">{t("level2.nothingToAdd")}</p>
        )}
        <div>
          <Button
            icon="play"
            disabled={busy || plan.added.length === 0}
            onClick={() => onRun(extra)}
          >
            {plan.added.length > 0
              ? t("level2.run", { count: plan.added.length })
              : t("level2.runNothing")}
          </Button>
        </div>
        <p className="text-xs text-ink-muted">{t("level2.cancelHint")}</p>
      </section>
    </Card>
  );
}

function Level2Notice({
  notice,
  busy,
  inline = false,
}: {
  notice: "cancelled" | "failed" | "restore-failed";
  busy: boolean;
  inline?: boolean;
}) {
  const t = useT();
  const failed = notice === "restore-failed";
  const body = (
    <p
      role={failed ? "alert" : "status"}
      className={`text-sm ${failed ? "text-negative" : ""}`}
    >
      {failed ? (
        <span aria-hidden className="mr-1">
          ✕
        </span>
      ) : (
        <Icon name="info" className="mr-1 inline-block align-[-0.125em]" />
      )}
      {t(`level2.notice.${notice}`)}
      {busy && !failed && (
        <span className="block text-ink-muted">{t("level2.restoring")}</span>
      )}
    </p>
  );
  return inline ? body : <Card className="p-4">{body}</Card>;
}
