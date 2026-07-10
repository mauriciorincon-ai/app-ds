"use client";

// Sección "¿Por qué predice así?" — el gráfico crudo SIEMPRE visible (la
// narrativa persuade más allá de lo fáctico; el gráfico ancla los números) +
// bloque de narración con badge que distingue "verificada" de "texto estándar".
// El método se nombra con honestidad (importancia por permutación, ADR-004).
import { useT } from "@/i18n/use-translation";
import type { NarrationState } from "@/lib/useNarration";
import type { Explainability, FeatureImportance } from "@/workers/protocol";
import { Badge, Card } from "./ui";
import { ConsentPanel } from "./ConsentPanel";

const MAX_BARS = 8;

function directionKey(feature: FeatureImportance): string {
  if (feature.kind === "categorical") return "categorical";
  if (feature.direction === null) return "unclear";
  return feature.direction;
}

function ImportanceChart({
  explain,
  positiveClass,
}: {
  explain: Explainability;
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
  positiveClass,
  narration,
  consent,
  onConsentChange,
}: {
  explain: Explainability;
  /** Etiqueta real de la clase positiva — las direcciones se leen contra ella. */
  positiveClass: string;
  narration: NarrationState;
  consent: boolean;
  onConsentChange: (next: boolean) => void;
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
        <ImportanceChart explain={explain} positiveClass={positiveClass} />
      </Card>

      <Card className="p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">{t("why.narration.title")}</h3>
          {narration.kind === "verified" && (
            <Badge tone="positive">
              <span aria-hidden>✓</span> {t("why.narration.verifiedBadge")}
            </Badge>
          )}
          {narration.kind === "template" && (
            <Badge>{t("why.narration.templateBadge")}</Badge>
          )}
        </div>

        <div aria-live="polite">
          {narration.kind === "loading" ? (
            <p className="text-sm text-ink-muted">
              {t("why.narration.loading")}
            </p>
          ) : (
            <p className="text-sm leading-relaxed">{narration.text}</p>
          )}
        </div>
      </Card>

      <ConsentPanel consent={consent} onChange={onConsentChange} />
    </section>
  );
}
