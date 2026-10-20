"use client";

// Protocolo DS (S13, G-Plan 1a): los textos que solo usa la forma de una etapa viajan con el chunk de esa
// forma (los dos idiomas, como las fichas de modelo), no con el diccionario de la página, que llega entero a
// `/` y a `/protocolo`. La forma pide sus claves de siempre (`protocol.stage.5.rule.legend`): si la clave
// está en sus textos, sale de ahí; si no, del diccionario global (lo que también pinta el cuaderno, las
// trampas y los avisos de falta). Sin clave cruda al cargar: el texto llega en el mismo chunk que la pinta.
import { useCallback } from "react";
import { defaultLocale, type Locale } from "./config";
import type { Dictionary } from "./dictionaries";
import { useI18n } from "./provider";
import { interpolate, resolve, type TParams } from "./translate";

export type TextosEtapa = Readonly<Record<Locale, Dictionary>>;

/** Pura: busca la clave en los textos de la forma; devuelve `null` si no está (o es una rama). */
export function textoPropio(
  textos: TextosEtapa,
  locale: Locale,
  key: string,
  params?: TParams,
): string | null {
  const dictionary = textos[locale] ?? textos[defaultLocale];
  // el plural mínimo de `translate`: con count === 1 manda la variante `<clave>_one`
  if (params?.count === 1) {
    const one = resolve(dictionary, `${key}_one`);
    if (one !== `${key}_one`) return interpolate(one, params);
  }
  const propio = resolve(dictionary, key);
  return propio !== key ? interpolate(propio, params) : null;
}

export function useTextosEtapa(
  textos: TextosEtapa,
): (key: string, params?: TParams) => string {
  const { t, locale } = useI18n();
  return useCallback(
    (key: string, params?: TParams) =>
      textoPropio(textos, locale, key, params) ?? t(key, params),
    [textos, locale, t],
  );
}
