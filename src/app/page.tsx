"use client";

import { locales } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";

// Placeholder de la landing (Fase 0). La landing real —con el flujo del
// experimento— se construye en la Fase 2 junto al design-system.md.
// Debe permanecer estática y liviana: es el candidato LCP que mide Lighthouse
// en "/". Pyodide NO se carga aquí (se trae bajo demanda al iniciar el experimento).
export default function Home() {
  const { t, locale, setLocale } = useI18n();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <nav aria-label={t("language.label")} className="flex gap-2 self-end">
        {locales.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLocale(l)}
            aria-pressed={locale === l}
            className="min-h-11 rounded-md border border-foreground/20 px-3 py-1 text-sm aria-pressed:border-foreground aria-pressed:font-semibold"
          >
            {t(`language.${l}`)}
          </button>
        ))}
      </nav>
      <h1 className="text-4xl font-semibold tracking-tight">{t("app.name")}</h1>
      <p className="text-xl text-foreground/70">{t("app.tagline")}</p>
      <p className="text-base text-foreground/60">{t("landing.lead")}</p>
    </main>
  );
}
