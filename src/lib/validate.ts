// Validadores estructurales escritos a mano (sin zod: rompía el budget de script
// de 300 KB en el cliente — lección S2). Cada validador devuelve null si el valor
// cuadra, o la RUTA del primer campo que no cuadra («league[3].cv.mean»): el lado
// que LEE un contrato rechaza nombrando el campo (regla 15, gate de contrato entre
// lenguajes). Las rutas son nombres de campos de la app, nunca valores del dataset.
//
// Política: los objetos toleran claves extra (un emisor más nuevo no rompe a un
// lector más viejo); lo que se exige es que lo declarado esté y tenga su forma.

export type Validator = (value: unknown, path: string) => string | null;

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const at = (path: string, key: string) => (path ? `${path}.${key}` : key);

export const num: Validator = (v, path) =>
  typeof v === "number" && Number.isFinite(v) ? null : path;

export const int: Validator = (v, path) =>
  typeof v === "number" && Number.isInteger(v) ? null : path;

export const str: Validator = (v, path) =>
  typeof v === "string" ? null : path;

export const bool: Validator = (v, path) =>
  typeof v === "boolean" ? null : path;

export function oneOf(values: readonly unknown[]): Validator {
  return (v, path) => (values.includes(v) ? null : path);
}

export function nullable(inner: Validator): Validator {
  return (v, path) => (v === null ? null : inner(v, path));
}

/** Para claves opcionales de un `obj`: ausente (undefined) es válido. */
export function optional(inner: Validator): Validator {
  return (v, path) => (v === undefined ? null : inner(v, path));
}

export function arr(item: Validator, minLength = 0): Validator {
  return (v, path) => {
    if (!Array.isArray(v) || v.length < minLength) return path;
    for (let i = 0; i < v.length; i++) {
      const issue = item(v[i], `${path}[${i}]`);
      if (issue) return issue;
    }
    return null;
  };
}

export function obj(shape: Record<string, Validator>): Validator {
  return (v, path) => {
    if (!isRecord(v)) return path;
    for (const [key, validator] of Object.entries(shape)) {
      const issue = validator(v[key], at(path, key));
      if (issue) return issue;
    }
    return null;
  };
}

/** Objeto-diccionario: toda clave vale; cada valor pasa `inner`. */
export function dict(inner: Validator): Validator {
  return (v, path) => {
    if (!isRecord(v)) return path;
    for (const [key, value] of Object.entries(v)) {
      const issue = inner(value, at(path, key));
      if (issue) return issue;
    }
    return null;
  };
}

/** Condición adicional sobre un valor que ya pasó `inner`. */
export function refine(
  inner: Validator,
  predicate: (v: unknown) => boolean,
): Validator {
  return (v, path) => inner(v, path) ?? (predicate(v) ? null : path);
}

export type Checked<T> = { ok: true; value: T } | { ok: false; field: string };

export function check<T>(validator: Validator, value: unknown): Checked<T> {
  const issue = validator(value, "");
  return issue === null
    ? { ok: true, value: value as T }
    : { ok: false, field: issue || "(root)" };
}
