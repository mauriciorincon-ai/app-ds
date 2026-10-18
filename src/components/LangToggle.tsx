"use client";

import { locales } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";

export function LangToggle() {
  const { t, requestedLocale, loading, failed, setLocale } = useI18n();
  return (
    <div className="flex flex-col items-end gap-1">
      <nav
        aria-label={t("language.label")}
        aria-busy={loading || undefined}
        className="flex gap-1"
      >
        {locales.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLocale(l)}
            aria-pressed={requestedLocale === l}
            className="min-h-11 rounded-md px-3 text-sm text-ink-muted aria-pressed:font-semibold aria-pressed:text-ink"
          >
            {t(`language.${l}`)}
          </button>
        ))}
      </nav>
      {/* S11: el inglés se baja al elegirlo; si no llega, la página sigue en español y lo dice. */}
      {failed && (
        <p
          role="status"
          className="max-w-64 text-right text-xs text-caution"
          data-testid="idioma-fallo"
        >
          {t("language.failed")}
        </p>
      )}
    </div>
  );
}
