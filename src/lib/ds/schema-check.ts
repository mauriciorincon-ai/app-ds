// Chequeo honesto de esquema para puntuar datos nuevos (TS puro, síncrono).
//
// Compara los headers del CSV nuevo contra el esquema del modelo ANTES de tocar
// el worker/Pyodide: columnas del modelo faltantes ⇒ bloqueo nombrándolas
// exactamente (jamás se puntúa a medias); columnas extra o el objetivo presente
// ⇒ aviso y se ignoran. La novedad de VALORES (categorías nunca vistas, números
// fuera de rango) no se decide aquí: la calcula score_new_data en Python contra
// el training_profile.
import { matchByTask } from "@/engine/despacho";
import type { ScoringSchema } from "@/workers/protocol";

export type SchemaCheck = {
  /** true ⇔ no falta ninguna columna del modelo (extras/objetivo no bloquean). */
  ok: boolean;
  /** Columnas del modelo ausentes en el CSV, en el orden del esquema. */
  missing: string[];
  /** Columnas del CSV que el modelo no usa (se ignoran), en el orden del CSV. */
  extra: string[];
  /** El CSV trae la columna objetivo (se ignora: aquí se predice, no se evalúa).
   *  S7: al agrupar no hay objetivo, y es siempre false. */
  targetPresent: boolean;
};

/** Columnas que el modelo espera, en orden determinista (numéricas primero). */
export function modelFeatures(schema: ScoringSchema): string[] {
  return [...schema.numeric, ...schema.categorical];
}

export function checkSchema(
  headers: readonly string[],
  schema: ScoringSchema,
): SchemaCheck {
  const present = new Set(headers);
  const features = modelFeatures(schema);
  const featureSet = new Set(features);

  // S7: el objetivo de cada tarea; agrupar no tiene.
  const target: string | null = matchByTask(schema, {
    binaria: (s) => s.target,
    multiclase: (s) => s.target,
    numerica: (s) => s.target,
    agrupar: () => null,
  });
  const missing = features.filter((name) => !present.has(name));
  const extra = headers.filter(
    (name) => !featureSet.has(name) && name !== target,
  );
  const targetPresent = target !== null && present.has(target);

  return { ok: missing.length === 0, missing, extra, targetPresent };
}
