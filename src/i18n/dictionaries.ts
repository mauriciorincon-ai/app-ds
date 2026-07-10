import type { Locale } from "./config";
import es from "../../messages/es.json";
import en from "../../messages/en.json";

// Estructura recursiva de strings: evita fricción de tipos-literal entre los dos
// JSON y permite claves anidadas. La igualdad de claves se verifica en un test
// de paridad (no en tiempo de tipos), para dar un mensaje de error legible.
export type Dictionary = { [key: string]: string | Dictionary };

export const dictionaries: Record<Locale, Dictionary> = { es, en };
