"use client";

import {
  MLP_MIN_ROWS,
  type Placement,
  type Routing,
} from "@/engine/encarrilador";
import { thousands } from "@/content/modelos";
import { AGGLO_MAX_ROWS } from "@/engine/verdict";
import { useI18n } from "@/i18n/provider";
import { formatEstimate } from "@/lib/duration";
import { Card, Icon } from "./ui";

// E2 (S5): quién compite y en qué nivel, con una razón por modelo. Lo que queda
// fuera es una RECOMENDACIÓN con su razón (regla dura 3: no se esconde).
export function RosterCard({
  routing,
  rows,
  minorityShare,
  k,
  smallSample,
  cluster = false,
}: {
  routing: Routing;
  rows: number;
  /** null en regresión (S6): sin clases no hay minoritaria. */
  minorityShare: number | null;
  k: number;
  smallSample: boolean;
  /** S7: agrupar — sin validación cruzada; cada agrupador elige su k. */
  cluster?: boolean;
}) {
  const { locale, t } = useI18n();
  const n = (value: number) => thousands(value, locale === "es" ? "." : ",");
  const name = (id: Placement["id"]) => t(`results.candidates.short.${id}`);
  const level2 = routing.placements.filter((p) => p.level === 2);
  const out = routing.placements.filter((p) => p.level === "out");

  const outReason = (p: Placement) =>
    t(`roster.reason.${p.outReason ?? p.reason}`, {
      rows,
      min: MLP_MIN_ROWS,
      share: Math.round((minorityShare ?? 0) * 100),
    });

  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold">{t("roster.title")}</h2>

      <section className="flex flex-col gap-1.5">
        <h3 className="text-sm font-medium">
          {t("roster.level1", {
            count: routing.level1.length,
            time: formatEstimate(routing.level1EstimateS),
          })}
        </h3>
        <ul className="flex flex-wrap gap-1.5" aria-label={t("roster.title")}>
          {routing.placements
            .filter((p) => p.level === 1)
            .map((p) => (
              <li
                key={p.id}
                className="rounded-sm border border-hairline bg-sunken px-2 py-0.5 text-xs"
              >
                {name(p.id)}
              </li>
            ))}
        </ul>
      </section>

      {level2.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h3 className="text-sm font-medium">
            {t("roster.level2", { count: level2.length })}
          </h3>
          <ul className="flex flex-col gap-1 text-sm text-ink-muted">
            {level2.map((p) => (
              <li key={p.id}>
                <span className="font-medium text-ink">{name(p.id)}</span>
                {" · "}
                {p.reason === "forced"
                  ? t("roster.reason.forced", { why: outReason(p) })
                  : t("roster.reason.over-ceiling", {
                      time: formatEstimate(p.estimateS),
                    })}
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-muted">
            {t("roster.level2Hint", {
              time: formatEstimate(routing.unionEstimateS),
            })}
          </p>
        </section>
      )}

      {out.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h3 className="text-sm font-medium">
            {t("roster.out", { count: out.length })}
          </h3>
          <ul className="flex flex-col gap-1 text-sm text-ink-muted">
            {out.map((p) => (
              <li key={p.id}>
                <span className="font-medium text-ink">{name(p.id)}</span>
                {" · "}
                {outReason(p)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {cluster ? (
        <>
          <p className="text-xs text-ink-muted">{t("roster.clusterK")}</p>
          <p className="text-xs text-ink-muted">
            {t("roster.clusterNote", { max: k })}
          </p>
          {/* Decisión 8 del usuario: la muestra del jerárquico, antes de correr. */}
          {rows > AGGLO_MAX_ROWS && (
            <p className="flex items-start gap-1 text-xs">
              <Icon name="info" className="mt-0.5 shrink-0 text-ink-muted" />
              {t("roster.clusterSample", {
                sample: n(AGGLO_MAX_ROWS),
                rows: n(rows),
              })}
            </p>
          )}
        </>
      ) : (
        <p className="text-xs text-ink-muted">{t("roster.cv", { k })}</p>
      )}
      {smallSample && (
        <p className="text-xs text-caution">
          <span aria-hidden className="mr-1">
            ⚠
          </span>
          {t("roster.smallSample", { rows })}
        </p>
      )}
      {out.length > 0 && (
        <p className="text-xs text-ink-muted">{t("roster.note")}</p>
      )}
    </Card>
  );
}
