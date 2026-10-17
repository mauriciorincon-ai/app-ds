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

function numero(n: number): string {
  return formatQuantity(n, Number.isInteger(n) ? 0 : 2);
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
