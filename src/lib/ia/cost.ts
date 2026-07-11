// Tracking de costo por request (estándar 7): log estructurado con Pino —
// SOLO metadatos de la llamada (modelo, tokens, USD). Jamás el payload, jamás
// nombres de columnas (regla dura 2). Presupuesto de la app: ≤US$10/mes; a
// ≤2 llamadas por narración con tokens acotados, el margen es enorme
// (decisions/005 documenta los precios).
import pino from "pino";
import type { LlmUsage } from "./client";

const logger = pino({
  base: null,
  // Silencio en tests (el contrato del log se prueba con estimateCostUsd).
  level: process.env.NODE_ENV === "test" ? "silent" : "info",
});

// USD por 1M de tokens (entrada/salida) — precios de decisions/005.
const PRICE_PER_MILLION: Record<string, { input: number; output: number }> = {
  "llama-3.3-70b-versatile": { input: 0.59, output: 0.79 },
  "llama-3.1-8b-instant": { input: 0.05, output: 0.08 },
};

export function estimateCostUsd(model: string, usage: LlmUsage): number {
  const price = PRICE_PER_MILLION[model];
  if (!price) return 0; // mock u otro proveedor sin precio conocido
  return (
    (usage.inputTokens * price.input + usage.outputTokens * price.output) /
    1_000_000
  );
}

export function logNarrationCost(entry: {
  requestId: string;
  step: "narrator" | "grader";
  model: string;
  usage: LlmUsage;
}): void {
  logger.info({
    feature: "narration",
    requestId: entry.requestId,
    step: entry.step,
    model: entry.model,
    tokensIn: entry.usage.inputTokens,
    tokensOut: entry.usage.outputTokens,
    costUsd: Number(estimateCostUsd(entry.model, entry.usage).toFixed(6)),
  });
}
