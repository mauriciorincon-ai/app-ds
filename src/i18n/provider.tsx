"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  defaultLocale,
  isLocale,
  LOCALE_STORAGE_KEY,
  type Locale,
} from "./config";
import {
  cargarIdioma,
  estadoDeIdioma,
  suscribirDiccionarios,
} from "./dictionaries";
import { translate, type TParams } from "./translate";

export type { TParams };

// La preferencia de idioma vive en localStorage y se lee con useSyncExternalStore:
// el patrón de React para stores externos con SSR (sin setState-en-efecto ni
// hidratación inconsistente — el primer render usa defaultLocale y luego se
// re-lee la preferencia guardada).
const listeners = new Set<() => void>();

function readLocale(): Locale {
  if (typeof window === "undefined") return defaultLocale;
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return stored !== null && isLocale(stored) ? stored : defaultLocale;
}

function getServerLocale(): Locale {
  return defaultLocale;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function writeLocale(next: Locale): void {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
  // El evento "storage" solo dispara entre pestañas; notificamos a mano la actual.
  for (const listener of listeners) listener();
}

type I18nContextValue = {
  /** El idioma con que se pinta: el pedido cuando su diccionario ya llegó; si no, el español. */
  locale: Locale;
  /** El idioma que la persona eligió. Va por delante de `locale` mientras su diccionario carga. */
  requestedLocale: Locale;
  /** El diccionario del idioma pedido está en camino. */
  loading: boolean;
  /** El diccionario del idioma pedido no pudo cargarse: la página sigue en español. */
  failed: boolean;
  setLocale: (next: Locale) => void;
  t: (key: string, params?: TParams) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const requestedLocale = useSyncExternalStore(
    subscribe,
    readLocale,
    getServerLocale,
  );
  // S11: solo el español va en el bundle de la página; el inglés llega con `import()`. Mientras
  // no llega, se pinta en español (la página se prerenderiza así) y nunca una clave cruda.
  const estado = useSyncExternalStore(
    suscribirDiccionarios,
    () => estadoDeIdioma(requestedLocale),
    () => "lista" as const,
  );
  const locale = estado === "lista" ? requestedLocale : defaultLocale;

  useEffect(() => {
    void cargarIdioma(requestedLocale);
  }, [requestedLocale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    // Pedirlo otra vez tras un fallo reintenta la carga.
    void cargarIdioma(next);
    writeLocale(next);
  }, []);

  const t = useCallback(
    (key: string, params?: TParams) => translate(locale, key, params),
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      requestedLocale,
      loading: estado === "cargando",
      failed: estado === "fallo",
      setLocale,
      t,
    }),
    [locale, requestedLocale, estado, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (context === null) {
    throw new Error("useI18n debe usarse dentro de <I18nProvider>");
  }
  return context;
}
