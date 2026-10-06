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
 *  (un solo sitio: AU-S6-42). S7: con varias categorías la fuga delata UNA
 *  categoría y la cifra global puede quedar lejos de «perfecta» (planes con fuga
 *  plantada: exactitud balanceada 0.78), así que ese titular no dice «casi
 *  perfectas»: dice la sospecha. */
export function suspiciousBanner(
  t: (key: string) => string,
  kind: "metrics" | "class" = "metrics",
): Banner {
  return {
    tone: "caution",
    mark: "⚠",
    headline: t(
      kind === "class"
        ? "results.verdict.suspiciousClass"
        : "results.verdict.suspicious",
    ),
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
          <h1 className={`text-xl font-semibold ${TONE_CLASS[banner.tone]}`}>
            {banner.headline}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">{banner.detail}</p>
          {children}
        </div>
      </div>
    </Card>
  );
}
