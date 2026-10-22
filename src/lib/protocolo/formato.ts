// Protocolo DS (S8): cómo se lee en pantalla lo que guarda el cuaderno. Las cifras siguen la
// regla de la app (R9, `formatQuantity`); las fechas, el idioma de la interfaz.
import type { Valor } from "@/engine/protocolo/etapas";
import type { Locale } from "@/i18n/config";
import { formatQuantity } from "@/lib/quantity";

/** Las primeras cifras de una huella: bastan para reconocerla a la vista. */
export const HUELLA_CORTA = 12;

export function huellaCorta(sha256: string): string {
  return sha256.slice(0, HUELLA_CORTA);
}

export function fecha(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

/**
 * Una cifra del cuaderno o de una frase: miles con coma y dos decimales (R9), y en notación
 * científica lo diminuto (~1e-11) y lo enorme (≥ 1e12), que de otro modo se leería «0.00» o
 * como una fila de quince ceros (extremos de magnitud, regla 22).
 */
export function cifra(valor: number): string {
  const abs = Math.abs(valor);
  if (abs !== 0 && (abs < 1e-4 || abs >= 1e12)) return valor.toExponential(2);
  return formatQuantity(valor, Number.isInteger(valor) ? 0 : 2);
}

function numero(n: number): string {
  return cifra(n);
}

/** Un valor del cuaderno como texto (`si`/`no` llegan ya traducidos). */
export function valorTexto(
  valor: Valor,
  palabras: { readonly si: string; readonly no: string },
): string {
  if (valor === null) return "—";
  if (typeof valor === "boolean") return valor ? palabras.si : palabras.no;
  if (typeof valor === "number") return numero(valor);
  if (typeof valor === "string") return valor;
  if (Array.isArray(valor)) return valor.join(", ");
  return Object.entries(valor)
    .map(([clave, n]) => `${clave}: ${numero(n)}`)
    .join(" · ");
}

/**
 * Un PSI para mostrar: dos decimales, salvo que redondear lo pase al otro lado de un umbral (S16, S9 B4: un PSI
 * de 0.2496 es «moderado» y a dos decimales se leería «0.25», que ya es alerta). Agrega decimales hasta que no.
 */
export function psiTexto(psi: number, umbrales: readonly number[]): string {
  for (let d = 2; d <= 6; d++) {
    const redondeado = Number(psi.toFixed(d));
    if (umbrales.every((u) => psi >= u === redondeado >= u))
      return formatQuantity(psi, d);
  }
  return formatQuantity(psi, 6);
}

/**
 * Una probabilidad o un cuantil entre 0 y 1 con los decimales que hacen falta para no escribir
 * «0.00» (un umbral de 0.0016 no es cero) ni «1.00» (0.9995 no es uno): dos decimales cuando
 * ninguno de los dos extremos está a menos de 0.01, y más si lo está.
 */
export function proporcion(valor: number): string {
  if (!(valor > 0 && valor < 1)) return formatQuantity(valor, 2);
  const margen = Math.min(valor, 1 - valor);
  if (margen < 1e-6) return valor.toExponential(1);
  const decimales =
    margen >= 0.01 ? 2 : Math.min(12, Math.ceil(-Math.log10(margen)) + 1);
  return formatQuantity(valor, decimales);
}
