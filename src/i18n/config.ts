// Configuración del i18n ligero (diccionario propio, sin routing por [locale]).
// Decisión registrada en el ADR de i18n. La paridad de claves es exigida por un test.
export const locales = ["es", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "es";

export const LOCALE_STORAGE_KEY = "probeta-ds.locale";

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}
