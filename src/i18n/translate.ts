// Núcleo PURO del i18n (sin React): resolución de claves con notación de punto
// e interpolación de {placeholders}. Lo usan el provider (hooks) y los motores
// puros que generan texto para el usuario (plantillas de narración, model card)
// — así TODO el contenido visible vive en messages/{es,en}.json bajo el test de
// paridad, también el que no pasa por componentes.
import type { Locale } from "./config";
import { dictionaries, type Dictionary } from "./dictionaries";

export type TParams = Record<string, string | number>;

// Resuelve una clave con notación de punto ("app.name"). Si falta, devuelve la
// clave misma (fallback honesto y visible, nunca una cadena vacía silenciosa).
export function resolve(dictionary: Dictionary, key: string): string {
  let current: string | Dictionary = dictionary;
  for (const part of key.split(".")) {
    if (typeof current === "string") return key;
    const next: string | Dictionary | undefined = current[part];
    if (next === undefined) return key;
    current = next;
  }
  return typeof current === "string" ? current : key;
}

// Reemplaza {nombre} por params.nombre; deja el marcador si falta el parámetro.
export function interpolate(template: string, params?: TParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

// Plural mínimo (S5): con count === 1 se usa la variante `<clave>_one` si existe
// («Compitieron 1 modelos» → «Compitió 1 modelo»). Español e inglés solo
// distinguen uno / otros; la paridad de claves cubre también las `_one`.
export function translate(
  locale: Locale,
  key: string,
  params?: TParams,
): string {
  const dictionary = dictionaries[locale];
  if (params?.count === 1) {
    const one = resolve(dictionary, `${key}_one`);
    if (one !== `${key}_one`) return interpolate(one, params);
  }
  return interpolate(resolve(dictionary, key), params);
}
