// Contratos Zod del flujo de narración (patrón skill ia-embebida): lo ÚNICO que
// entra y sale del LLM son estos objetos. El payload es un vocabulario cerrado
// de metadatos agregados — nombres de columnas y estadísticas, JAMÁS filas ni
// valores del dataset (ni siquiera las etiquetas de clase del objetivo, que son
// valores de celdas). Ver decisions/006 (privacidad de la narración).
import { z } from "zod";

const score01 = z.number().min(0).max(1);

export const localeSchema = z.enum(["es", "en"]);

export const metricNameSchema = z.enum([
  "accuracy",
  "precision",
  "recall",
  "f1",
  "auc",
]);

export const narrationFeatureSchema = z.object({
  name: z.string().min(1).max(120),
  kind: z.enum(["numeric", "categorical"]),
  importance: z.number().min(-1).max(1),
  direction: z.enum(["positive", "negative"]).nullable(),
});

// S4 — alerta EDA como agregado (tipo + columna o tasa; JAMÁS un valor de celda).
// Vocabulario cerrado: cada variante lleva SOLO sus campos (strict).
export const edaAlertSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("possible-leak"),
      column: z.string().min(1).max(120),
    })
    .strict(),
  z
    .object({ kind: z.literal("id-like"), column: z.string().min(1).max(120) })
    .strict(),
  z
    .object({ kind: z.literal("class-imbalance"), minorityRate: score01 })
    .strict(),
]);

// Lo que la app envía al route (y el route, tras validar, al Narrator).
// strict(): una clave desconocida (p. ej. filas coladas) RECHAZA la petición
// entera — vocabulario cerrado de verdad, no "se ignora lo demás".
export const narrationPayloadSchema = z
  .object({
    locale: localeSchema,
    problem: z.literal("binary-classification"),
    target: z.string().min(1).max(120),
    dataset: z
      .object({
        rows: z.number().int().min(1).max(1_000_000),
        cols: z.number().int().min(1).max(10_000),
      })
      .strict(),
    metrics: z
      .object({
        accuracy: score01,
        precision: score01,
        recall: score01,
        f1: score01,
        auc: score01,
      })
      .strict(),
    verdict: z
      .object({
        level: z.enum(["beats", "ties", "loses"]),
        primaryMetric: metricNameSchema,
        modelScore: score01,
        baselineScore: score01,
        delta: z.number().min(-1).max(1),
      })
      .strict(),
    explainability: z
      .object({
        method: z.literal("permutation_importance"),
        scoring: z.string().min(1).max(40),
        // Solo el top-N viaja (guardrail de tamaño), ya ordenado por importancia.
        features: z.array(narrationFeatureSchema.strict()).min(1).max(8),
      })
      .strict(),
    /** Nombres de columnas marcadas por la heurística de fuga (puede ser vacío). */
    leakage: z.array(z.string().min(1).max(120)).max(8),
    /** S4: alertas EDA (agregados). Se OMITE si el dataset está limpio ⇒ el
     *  payload queda BYTE-IDÉNTICO al de S3 (no-regresión + privacidad). */
    eda: z.array(edaAlertSchema).max(20).optional(),
  })
  .strict();

export type NarrationPayload = z.infer<typeof narrationPayloadSchema>;

// Salida estructurada del Narrator: narrativa corta + claims verificables.
// Cada claim se contrasta DETERMINÍSTICAMENTE contra el payload (verify.ts);
// una variable inexistente, dirección o cifra falsa ⇒ la narrativa se descarta.
export const narratorClaimSchema = z.object({
  feature: z.string().min(1).max(120),
  direction: z.enum(["positive", "negative", "none"]),
  importance: z.number().min(-1).max(1),
});

export const narratorOutputSchema = z.object({
  verdictLevel: z.enum(["beats", "ties", "loses"]),
  narrative: z.string().min(40).max(900),
  claims: z.array(narratorClaimSchema).min(1).max(5),
});

export type NarratorOutput = z.infer<typeof narratorOutputSchema>;

// Salida del Grader (2ª y última llamada): califica la narrativa YA verificada.
export const graderOutputSchema = z.object({
  accuracy: z.number().int().min(1).max(5),
  completeness: z.number().int().min(1).max(5),
  clarity: z.number().int().min(1).max(5),
});

export type GraderOutput = z.infer<typeof graderOutputSchema>;

// Contrato del route POST /api/narrate.
export const narrateRequestSchema = z
  .object({
    payload: narrationPayloadSchema,
  })
  .strict();

export const fallbackReasonSchema = z.enum([
  "disabled",
  "no-provider",
  "invalid-request",
  "rate-limited",
  "provider-error",
  "verification-failed",
  "grader-rejected",
]);

export type FallbackReason = z.infer<typeof fallbackReasonSchema>;

export const narrateResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("verified"),
    narrative: z.string().min(1).max(900),
    grader: graderOutputSchema,
  }),
  z.object({
    status: z.literal("fallback"),
    reason: fallbackReasonSchema,
  }),
]);

export type NarrateResponse = z.infer<typeof narrateResponseSchema>;
