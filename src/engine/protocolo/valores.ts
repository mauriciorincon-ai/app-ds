// Protocolo DS (S8): lectores tipados de lo que una etapa registra. Lo que llega al cuaderno es
// un diccionario de `Valor`; estas funciones lo leen sin suponer nada (un archivo importado
// puede traer cualquier cosa) y devuelven `null` cuando el tipo no es el esperado.
import type { DatosEtapa, Valor } from "./etapas";

export type Registro = Readonly<Record<string, Valor>>;

export function texto(r: Registro, clave: string): string | null {
  const v = r[clave];
  return typeof v === "string" ? v : null;
}

/** Un texto con contenido (sin contar espacios). */
export function textoLleno(r: Registro, clave: string): string | null {
  const v = texto(r, clave);
  return v !== null && v.trim() !== "" ? v.trim() : null;
}

export function numero(r: Registro, clave: string): number | null {
  const v = r[clave];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function positivo(r: Registro, clave: string): number | null {
  const v = numero(r, clave);
  return v !== null && v > 0 ? v : null;
}

export function lista(r: Registro, clave: string): readonly string[] | null {
  const v = r[clave];
  return Array.isArray(v) && v.every((x) => typeof x === "string")
    ? (v as readonly string[])
    : null;
}

export function mapa(
  r: Registro,
  clave: string,
): Readonly<Record<string, number>> | null {
  const v = r[clave];
  if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
  const registro = v as Readonly<Record<string, unknown>>;
  return Object.values(registro).every(
    (x) => typeof x === "number" && Number.isFinite(x),
  )
    ? (registro as Readonly<Record<string, number>>)
    : null;
}

export function booleano(r: Registro, clave: string): boolean | null {
  const v = r[clave];
  return typeof v === "boolean" ? v : null;
}

/** La primera clave que no está en la lista de permitidas (o `null`). */
export function claveExtra(
  r: Registro,
  permitidas: readonly string[],
): string | null {
  return Object.keys(r).find((clave) => !permitidas.includes(clave)) ?? null;
}

/** Igualdad de lo registrado: números con tolerancia de redondeo, el resto exacto. */
export function mismoValor(
  a: Valor | undefined,
  b: Valor | undefined,
): boolean {
  if (typeof a === "number" && typeof b === "number")
    return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((x, i) => x === b[i]);
  if (
    a !== null &&
    b !== null &&
    typeof a === "object" &&
    typeof b === "object" &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const [ra, rb] = [a as Record<string, number>, b as Record<string, number>];
    const [ka, kb] = [Object.keys(ra), Object.keys(rb)];
    return (
      ka.length === kb.length &&
      ka.every((k) => Object.hasOwn(rb, k) && mismoValor(ra[k], rb[k]))
    );
  }
  return a === b;
}

export function mismoRegistro(a: Registro, b: Registro): boolean {
  const [ka, kb] = [Object.keys(a), Object.keys(b)];
  return (
    ka.length === kb.length && ka.every((k) => k in b && mismoValor(a[k], b[k]))
  );
}

/** Los datos de una etapa, vacíos. */
export const SIN_DATOS: DatosEtapa = { respuestas: {}, chequeos: {} };
