import type { Locale } from "./config";
import es from "../../messages/es.json";

// Estructura recursiva de strings: evita fricción de tipos-literal entre los dos
// JSON y permite claves anidadas. La igualdad de claves se verifica en un test
// de paridad (no en tiempo de tipos), para dar un mensaje de error legible.
export type Dictionary = { [key: string]: string | Dictionary };

// S11 (peso de las páginas): cada página llevaba los DOS diccionarios (188 KB) en su
// chunk compartido. Las páginas se prerenderizan en español y el provider hidrata con él,
// así que el español va estático; el inglés es otro chunk que llega con `import()` cuando
// alguien lo elige (o ya lo había elegido). Mientras no llega, `translate` y el provider
// siguen en español: nunca se pinta una clave cruda.
//
// El servidor (narración) y las pruebas necesitan el inglés a la mano: lo registran con
// `registrarDiccionario` (src/i18n/servidor.ts). `tests/unit/un-idioma-por-pagina.test.ts`
// vigila que ninguna página alcance ese módulo ni el JSON inglés por imports estáticos.
const CARGADORES: Readonly<
  Partial<Record<Locale, () => Promise<{ default: unknown }>>>
> = {
  en: () => import("../../messages/en.json"),
};

export type EstadoIdioma = "lista" | "cargando" | "fallo";

const registro: Partial<Record<Locale, Dictionary>> = { es };
const estados: Partial<Record<Locale, EstadoIdioma>> = {};
const enVuelo = new Map<Locale, Promise<boolean>>();
const oyentes = new Set<() => void>();

function avisar(): void {
  for (const oyente of oyentes) oyente();
}

/** El diccionario de un idioma si ya está en memoria. */
export function diccionarioDe(locale: Locale): Dictionary | undefined {
  return registro[locale];
}

export function estadoDeIdioma(locale: Locale): EstadoIdioma {
  if (registro[locale]) return "lista";
  return estados[locale] ?? "cargando";
}

/** Registra un diccionario ya importado (servidor y pruebas). */
export function registrarDiccionario(
  locale: Locale,
  diccionario: Dictionary,
): void {
  registro[locale] = diccionario;
  estados[locale] = "lista";
  avisar();
}

export function suscribirDiccionarios(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/**
 * Trae el diccionario de un idioma que no va en el bundle de la página. Devuelve `true` si
 * quedó en memoria. Una carga en vuelo se comparte; tras un fallo, volver a pedirla reintenta.
 */
export function cargarIdioma(
  locale: Locale,
  /** Solo las pruebas lo pasan: por omisión, el `import()` del diccionario. */
  cargador: (() => Promise<{ default: unknown }>) | undefined = CARGADORES[
    locale
  ],
): Promise<boolean> {
  if (registro[locale]) return Promise.resolve(true);
  if (!cargador) return Promise.resolve(false);
  const previa = enVuelo.get(locale);
  if (previa) return previa;
  estados[locale] = "cargando";
  avisar();
  const carga = cargador()
    .then((modulo) => {
      registro[locale] = modulo.default as Dictionary;
      estados[locale] = "lista";
      return true;
    })
    .catch(() => {
      estados[locale] = "fallo";
      return false;
    })
    .finally(() => {
      enVuelo.delete(locale);
      avisar();
    });
  enVuelo.set(locale, carga);
  return carga;
}
