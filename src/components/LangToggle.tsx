"use client";

import { locales } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";

export function LangToggle() {
  const { t, locale, setLocale } = useI18n();
  return (
    <nav aria-label={t("language.label")} className="flex gap-1">
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          aria-pressed={locale === l}
          className="min-h-11 rounded-md px-3 text-sm text-ink-muted aria-pressed:font-semibold aria-pressed:text-ink"
        >
          {t(`language.${l}`)}
        </button>
      ))}
    </nav>
  );
}
