"use client";

// Sección "¿Por qué predice así?" — el gráfico crudo SIEMPRE visible (la
// narrativa persuade más allá de lo fáctico; el gráfico ancla los números) +
// DOS bloques de texto separados y rotulados (gate ⭐ S4, bloque C):
//   1) "Texto estándar" — determinista, local, siempre presente.
//   2) "Narración con IA" — a demanda, con botón; nunca se pide sola.
// El método se nombra con honestidad (importancia por permutación, ADR-004).
import { isFeatureUsed } from "@/engine/explainability";
import { useT } from "@/i18n/use-translation";
// SOLO tipo (un import runtime de schemas.ts metería zod al bundle del cliente).
import type { FallbackReason } from "@/lib/ia/schemas";
import type { AiNarrationState } from "@/lib/useNarration";
import type { Explainability, FeatureImportance } from "@/workers/protocol";
import { Badge, Button, Card } from "./ui";

const MAX_BARS = 8;

// La narración cayó a plantilla: decir POR QUÉ, en tres cubetas honestas.
// Sin esto el botón se siente "muerto" (hallazgo del usuario probando la
// preview real): la app intentaba, fallaba y no contaba nada.
const FALLBACK_NOTICE: Record<FallbackReason, string> = {
  disabled: "unavailable",
  "no-provider": "unavailable",
  "invalid-request": "provider",
  "rate-limited": "provider",
  "provider-error": "provider",
  "verification-failed": "rejected",
  "grader-rejected": "rejected",
};

function directionKey(feature: FeatureImportance): string {
  // Se comprueba ANTES que el tipo: con importancia 0 el modelo no usa la
  // variable, sea numérica o categórica, y decir "el efecto varía por categoría"
  // insinuaría un efecto que no existe.
  if (!isFeatureUsed(feature.importance)) return "unused";
  if (feature.kind === "categorical") return "categorical";
  if (feature.direction === null) return "unclear";
  return feature.direction;
}

function ImportanceChart({
  explain,
  target,
  positiveClass,
}: {
  explain: Explainability;
  target: string;
  positiveClass: string;
}) {
  const t = useT();
  const features = explain.features.slice(0, MAX_BARS);
  const max = Math.max(...features.map((f) => f.importance), 0);

  if (features.length === 0 || max <= 0) {
    return <p className="text-sm text-ink-muted">{t("why.empty")}</p>;
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {features.map((feature) => {
        const width = Math.max(
          (Math.max(feature.importance, 0) / max) * 100,
          1,
        );
        return (
          <li key={feature.name} className="text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate font-medium">
                {feature.name}
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-ink-muted">
                {feature.importance.toFixed(3)}
              </span>
            </div>
            <div
              className="mt-1 h-2 rounded-sm bg-sunken"
              role="img"
              aria-label={t("why.barLabel", {
                name: feature.name,
                value: feature.importance.toFixed(3),
              })}
            >
              <div
                className="h-full rounded-sm bg-accent"
                style={{ width: `${width}%` }}
              />
            </div>
            <p className="mt-0.5 text-xs text-ink-muted">
              {t(`why.direction.${directionKey(feature)}`, {
                target,
                positive: positiveClass,
              })}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

export function WhySection({
  explain,
  target,
  positiveClass,
  template,
  ai,
  onRequestNarration,
}: {
  explain: Explainability;
  /** Columna objetivo — las direcciones se leen contra ella (no contra "«0»"). */
  target: string;
  /** Etiqueta real de la clase positiva — las direcciones se leen contra ella. */
  positiveClass: string;
  /** Texto determinista local: siempre presente, jamás depende de la red. */
  template: string;
  ai: AiNarrationState;
  onRequestNarration: () => void;
}) {
  const t = useT();

  return (
    <section className="flex flex-col gap-4" aria-labelledby="why-title">
      <header>
        <h2
          id="why-title"
          className="text-xs font-semibold uppercase tracking-wide text-ink-muted"
        >
          {t("why.title")}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{t("why.method")}</p>
      </header>

      <Card className="p-5">
        <ImportanceChart
          explain={explain}
          target={target}
          positiveClass={positiveClass}
        />
        {/* Qué es la clase detectada + qué significan barra y dirección: sin
            esto, «0» no le dice nada a nadie (gate ⭐ S4, bloque C). */}
        <p className="mt-4 border-t border-hairline pt-3 text-xs text-ink-muted">
          {t("why.positiveClass", { target, positive: positiveClass })}
        </p>
        <p className="mt-1 text-xs text-ink-muted">{t("why.legend")}</p>
      </Card>

      {/* Bloque 1 — el texto que SIEMPRE existe, sin red ni IA. */}
      <Card className="p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">
            {t("why.narration.templateTitle")}
          </h3>
          <Badge>{t("why.narration.templateBadge")}</Badge>
        </div>
        <p className="text-sm leading-relaxed">{template}</p>
      </Card>

      {/* Bloque 2 — la IA, SEPARADA y a demanda. */}
      <Card className="p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">
            {t("why.narration.aiTitle")}
          </h3>
          {ai.kind === "verified" && (
            <Badge tone="positive">
              <span aria-hidden>✓</span> {t("why.narration.verifiedBadge")}
            </Badge>
          )}
        </div>

        <p className="text-sm text-ink-muted">{t("why.narration.aiIntro")}</p>

        <div aria-live="polite">
          {ai.kind === "loading" && (
            <p className="mt-3 text-sm text-ink-muted">
              {t("why.narration.loading")}
            </p>
          )}
          {ai.kind === "verified" && (
            <p className="mt-3 text-sm leading-relaxed">{ai.text}</p>
          )}
          {ai.kind === "failed" && (
            <p className="mt-3 text-sm text-caution">
              <span aria-hidden className="mr-1">
                ⚠
              </span>
              {t(`why.narration.fallback.${FALLBACK_NOTICE[ai.reason]}`)}
            </p>
          )}
        </div>

        {ai.kind !== "loading" && (
          <div className="mt-3">
            <Button
              variant="secondary"
              icon="sparkle"
              onClick={onRequestNarration}
            >
              {ai.kind === "idle"
                ? t("why.narration.request")
                : t("why.narration.again")}
            </Button>
          </div>
        )}
      </Card>
    </section>
  );
}
