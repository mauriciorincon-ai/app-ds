"use client";

import { useEffect, useRef } from "react";
import {
  BALANCED_NOTES,
  FICHAS,
  REGRESSION_FICHA_FIELDS,
  REGRESSION_NOTES,
  type BalancedId,
  type BaselineFichaId,
  type Ficha,
  type FichaId,
  type SharedId,
} from "@/content/modelos";
import { MEMBERS, memberNameKey, type MemberId } from "@/engine/roster";
import { matchTask, pendingSurface, taskOf } from "@/engine/despacho";
import type { TrainTask } from "@/engine/tarea";
import { useI18n } from "@/i18n/provider";
import { Button } from "./ui";

// E3 (S5): la ficha de lectura de un modelo, en un <dialog> nativo (foco
// atrapado, Esc y fondo inerte los da el navegador). Llega por import()
// dinámico (FichaButton) junto con su contenido: el budget de script de la
// landing no lo paga. La línea de estado dice qué fue de ese modelo EN ESTA
// liga — ganador, elegido, competidor, pendiente o fuera — con símbolo + texto.

export type FichaStatus =
  | { kind: "winner" }
  | { kind: "chosen" }
  | { kind: "competitor"; rank: number; total: number }
  | { kind: "failed" }
  | { kind: "pending" }
  | { kind: "out"; reason: string }
  | { kind: "baseline" };

export type FichaTarget = {
  id: MemberId | BaselineFichaId;
  status: FichaStatus;
  /** S6: la tarea de la liga (un mismo modelo se llama distinto al estimar). */
  task?: TrainTask;
};

const isBaselineFicha = (id: FichaTarget["id"]): id is BaselineFichaId =>
  id === "majority" || id === "median";

const SECTIONS: (keyof Ficha)[] = [
  "what",
  "goodFor",
  "notFor",
  "watch",
  "cost",
];

const STATUS_MARK: Partial<Record<FichaStatus["kind"], string>> = {
  winner: "★",
  chosen: "◆",
};

export default function FichaModelo({
  target,
  onClose,
}: {
  target: FichaTarget;
  onClose: () => void;
}) {
  const { locale, t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    // El foco vuelve a quien abrió la ficha (no todos los navegadores lo hacen).
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (dialog && !dialog.open) dialog.showModal();
    return () => opener?.focus();
  }, []);

  const { id, status } = target;
  const task = taskOf(target);
  // `base` es un MemberId; que sea una ficha lo fija tests/unit/modelos.test.ts.
  const fichaId = isBaselineFicha(id) ? id : (MEMBERS[id].base as FichaId);
  // S6: al estimar, los apartados que solo hablan de clasificar se reemplazan y
  // los modelos compartidos suman cómo estiman.
  const { ficha, regressionNote } = matchTask(task, {
    binaria: () => ({ ficha: FICHAS[fichaId], regressionNote: null }),
    // S7 (D3): los reemplazos de «la clase positiva» llegan con la UI (F3).
    multiclase: () => pendingSurface("FichaModelo", "multiclase"),
    // S7 (D3): la ficha de un agrupador se abre desde su pantalla (F3).
    agrupar: () => pendingSurface("FichaModelo", "agrupar"),
    numerica: () => ({
      ficha:
        id in REGRESSION_FICHA_FIELDS
          ? { ...FICHAS[fichaId], ...REGRESSION_FICHA_FIELDS[id as SharedId] }
          : FICHAS[fichaId],
      regressionNote:
        id in REGRESSION_NOTES ? REGRESSION_NOTES[id as SharedId] : null,
    }),
  });
  const balancedNote =
    !isBaselineFicha(id) && MEMBERS[id].balanced
      ? BALANCED_NOTES[id as BalancedId]
      : null;
  const name = isBaselineFicha(id)
    ? t(`results.baselines.${id}`)
    : t(memberNameKey(id, task));
  const mark = STATUS_MARK[status.kind];

  return (
    <dialog
      ref={ref}
      aria-labelledby="ficha-title"
      onClose={onClose}
      // Un clic en el fondo (fuera de la tarjeta) también cierra.
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-lg border border-hairline bg-surface p-0 text-ink shadow-lg backdrop:bg-black/50"
    >
      <div className="flex flex-col gap-4 p-5">
        <header className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {t("ficha.eyebrow")}
          </p>
          <h2 id="ficha-title" className="text-lg font-semibold">
            {name}
          </h2>
          <p className="text-sm">
            {mark && (
              <span aria-hidden className="mr-1">
                {mark}
              </span>
            )}
            {t(`ficha.status.${status.kind}`, {
              rank: status.kind === "competitor" ? status.rank : 0,
              total: status.kind === "competitor" ? status.total : 0,
              reason: status.kind === "out" ? status.reason : "",
            })}
          </p>
        </header>

        <dl className="flex flex-col gap-3 text-sm">
          {SECTIONS.map((section) => (
            <div key={section}>
              <dt className="font-semibold">{t(`ficha.${section}`)}</dt>
              <dd className="mt-0.5 text-ink-muted">
                {ficha[section][locale]}
              </dd>
            </div>
          ))}
        </dl>

        {balancedNote && (
          <p className="rounded-md border border-hairline bg-sunken p-3 text-sm">
            {balancedNote[locale]}
          </p>
        )}
        {regressionNote && (
          <p className="rounded-md border border-hairline bg-sunken p-3 text-sm">
            {regressionNote[locale]}
          </p>
        )}

        <div>
          <Button
            variant="secondary"
            icon="x"
            onClick={() => ref.current?.close()}
          >
            {t("ficha.close")}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
