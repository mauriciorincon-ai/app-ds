// Protocolo DS (S9, etapa 4): la apuesta se fija al ver los hallazgos. Si el navegador la olvidara
// (recargar la página, cancelar «Corregir»), el usuario podría apostar de nuevo con la respuesta a
// la vista y la comparación dejaría de enseñar algo. Por eso se guarda mientras dura la pestaña,
// atada al archivo (huella) y a lo que se respondió en las etapas 1 a 3: si cambian, es otra apuesta.
//
// Regla dura 2: vive solo en este navegador (`sessionStorage`) y nunca viaja a observabilidad. Si
// el navegador no la deja guardar, la apuesta vale mientras la pantalla siga abierta.
import type { Previas } from "@/engine/protocolo/etapas";

const CLAVE = "probeta-protocolo:apuesta";

export type ApuestaFija = {
  readonly apuesta: readonly string[];
  readonly ninguna: boolean;
};

/** FNV-1a de 32 bits: basta para distinguir una situación de otra, no es una huella de seguridad. */
function resumen(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Qué apuesta es: este archivo y estas respuestas de las etapas 1 a 3. */
export function claveApuesta(huella: string, previas: Previas): string {
  return `${huella.slice(0, 16)}:${resumen(
    JSON.stringify([
      previas[1]?.respuestas ?? null,
      previas[2]?.respuestas ?? null,
      previas[3]?.respuestas ?? null,
    ]),
  )}`;
}

export function leerApuestaFija(clave: string): ApuestaFija | null {
  try {
    const crudo = window.sessionStorage.getItem(CLAVE);
    if (!crudo) return null;
    const dato: unknown = JSON.parse(crudo);
    if (typeof dato !== "object" || dato === null) return null;
    const d = dato as Record<string, unknown>;
    if (
      d.clave !== clave ||
      typeof d.ninguna !== "boolean" ||
      !Array.isArray(d.apuesta) ||
      !d.apuesta.every((c) => typeof c === "string") ||
      d.ninguna !== (d.apuesta.length === 0)
    )
      return null;
    return { apuesta: d.apuesta as string[], ninguna: d.ninguna };
  } catch {
    return null;
  }
}

export function fijarApuesta(clave: string, apuesta: ApuestaFija): void {
  try {
    window.sessionStorage.setItem(
      CLAVE,
      JSON.stringify({
        clave,
        apuesta: apuesta.apuesta,
        ninguna: apuesta.ninguna,
      }),
    );
  } catch {
    // sin almacenamiento: la apuesta vale mientras la pantalla siga abierta
  }
}

/** Un cuaderno nuevo (o uno que reemplaza al actual) empieza sin apuesta: no hereda la de otro. */
export function olvidarApuesta(): void {
  try {
    window.sessionStorage.removeItem(CLAVE);
  } catch {
    // sin almacenamiento: no hay nada que olvidar
  }
}
