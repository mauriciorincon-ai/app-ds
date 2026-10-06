"use client";

import type { ReactNode } from "react";
import type { VerdictLevel } from "@/engine/verdict";
import { Card } from "./ui";

// La pieza jerárquica de Resultados, igual para las dos tareas (S6): símbolo +
// color + texto (nunca solo color). El texto lo arma cada tarea.

export type BannerTone = "positive" | "negative" | "caution" | "ink";

export type Banner = {
  tone: BannerTone;
  mark: string;
  headline: string;
  detail: string;
};

const TONE_CLASS: Record<BannerTone, string> = {
  positive: "text-positive",
  negative: "text-negative",
  caution: "text-caution",
  ink: "text-ink",
};

export const LEVEL_MARK: Record<
  VerdictLevel,
  { tone: BannerTone; mark: string }
> = {
  beats: { tone: "positive", mark: "▲" },
  ties: { tone: "ink", mark: "＝" },
  loses: { tone: "negative", mark: "▼" },
};

/** Con una fuga sospechada, el titular es la sospecha — igual en todas las tareas
 *  (un solo sitio: AU-S6-42). La alarma la da UNA columna, medida en las filas
 *  donde tiene valor, y la cifra global puede quedar lejos de «perfecta» (planes con
 *  fuga plantada: exactitud balanceada 0.78). S7 (AU-S7-20, decisión del usuario):
 *  el titular dice la sospecha en las tres tareas con objetivo, y el detalle, lo que
 *  se encontró: una columna que predice el objetivo, o una que delata una categoría. */
export function suspiciousBanner(
  t: (key: string) => string,
  kind: "column" | "class" = "column",
): Banner {
  return {
    tone: "caution",
    mark: "⚠",
    headline: t("results.verdict.suspicious"),
    detail: t(
      kind === "class"
        ? "results.verdict.suspiciousClassDetail"
        : "results.verdict.suspiciousDetail",
    ),
  };
}

export function VerdictCard({
  banner,
  children,
}: {
  banner: Banner;
  /** Notas bajo el detalle (p. ej. «elegido por ti»). */
  children?: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <span className={`text-2xl ${TONE_CLASS[banner.tone]}`} aria-hidden>
          {banner.mark}
        </span>
        <div>
          {/* tabIndex −1: el foco llega aquí tras «Elegir» (AU-S7-39), sin entrar al tabulador. */}
          <h1
            tabIndex={-1}
            className={`text-xl font-semibold ${TONE_CLASS[banner.tone]}`}
          >
            {banner.headline}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">{banner.detail}</p>
          {children}
        </div>
      </div>
    </Card>
  );
}
