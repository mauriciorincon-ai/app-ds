"use client";

// Panel de consentimiento de la narración IA: opt-in explícito con explicación
// honesta de qué viaja (nombres de columnas + estadísticas agregadas) y qué
// JAMÁS (las filas). Sin tono legalista. Default OFF; recordado localmente.
import { useT } from "@/i18n/use-translation";

export function ConsentPanel({
  consent,
  onChange,
}: {
  consent: boolean;
  onChange: (next: boolean) => void;
}) {
  const t = useT();

  return (
    <div className="rounded-md border border-hairline bg-sunken p-4">
      <label className="flex min-h-11 cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-accent"
        />
        <span>
          <span className="block text-sm font-medium">
            {t("consent.toggle")}
          </span>
          <span className="mt-1 block text-sm text-ink-muted">
            {t("consent.explain")}
          </span>
          <span className="mt-1 block text-xs text-ink-muted">
            {t("consent.verifiedNote")}
          </span>
        </span>
      </label>
    </div>
  );
}
