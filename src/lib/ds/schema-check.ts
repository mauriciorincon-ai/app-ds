// Chequeo honesto de esquema para puntuar datos nuevos (TS puro, síncrono).
//
// Compara los headers del CSV nuevo contra el esquema del modelo ANTES de tocar
// el worker/Pyodide: columnas del modelo faltantes ⇒ bloqueo nombrándolas
// exactamente (jamás se puntúa a medias); columnas extra o el objetivo presente
// ⇒ aviso y se ignoran. La novedad de VALORES (categorías nunca vistas, números
// fuera de rango) no se decide aquí: la calcula score_new_data en Python contra
// el training_profile.
import type { ModelSchema } from "@/workers/protocol";

export type SchemaCheck = {
  /** true ⇔ no falta ninguna columna del modelo (extras/objetivo no bloquean). */
  ok: boolean;
  /** Columnas del modelo ausentes en el CSV, en el orden del esquema. */
  missing: string[];
  /** Columnas del CSV que el modelo no usa (se ignoran), en el orden del CSV. */
  extra: string[];
  /** El CSV trae la columna objetivo (se ignora: aquí se predice, no se evalúa). */
  targetPresent: boolean;
};

/** Columnas que el modelo espera, en orden determinista (numéricas primero). */
export function modelFeatures(schema: ModelSchema): string[] {
  return [...schema.numeric, ...schema.categorical];
}

export function checkSchema(
  headers: readonly string[],
  schema: ModelSchema,
): SchemaCheck {
  const present = new Set(headers);
  const features = modelFeatures(schema);
  const featureSet = new Set(features);

  const missing = features.filter((name) => !present.has(name));
  const extra = headers.filter(
    (name) => !featureSet.has(name) && name !== schema.target,
  );
  const targetPresent = present.has(schema.target);

  return { ok: missing.length === 0, missing, extra, targetPresent };
}
