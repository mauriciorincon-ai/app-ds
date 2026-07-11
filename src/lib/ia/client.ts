// Único punto de llamada al LLM (regla de oro del skill ia-embebida): la UI
// jamás llama al proveedor; el route usa estas dos funciones y NADA más.
// Presupuesto acotado por construcción: ≤2 llamadas por narración (Narrator +
// Grader), máx. tokens por respuesta, timeout corto y CERO retries — cualquier
// fallo cae a la plantilla determinista. Proveedor conmutable por env
// (NARRATION_PROVIDER: groq | mock); el system prompt vive SOLO aquí (server).
import { createGroq } from "@ai-sdk/groq";
import { generateObject } from "ai";
import {
  graderOutputSchema,
  narratorOutputSchema,
  type GraderOutput,
  type NarrationPayload,
  type NarratorOutput,
} from "./schemas";
import { mockGrader, mockNarrator, resolveMockMode } from "./mock";

export type NarrationProvider = "groq" | "mock";

export const NARRATOR_MAX_TOKENS = 400;
export const GRADER_MAX_TOKENS = 150;
export const LLM_TIMEOUT_MS = 10_000;

// Modelos Groq (decisión y precios: decisions/005). El Narrator usa el modelo
// grande (mejor tasa de verificación); el Grader evalúa estilo → el barato basta.
export const GROQ_NARRATOR_MODEL = "llama-3.3-70b-versatile";
export const GROQ_GRADER_MODEL = "llama-3.1-8b-instant";

export type LlmUsage = { inputTokens: number; outputTokens: number };

export type LlmResult<T> = { output: T; usage: LlmUsage; model: string };

export function resolveProvider(
  value: string | undefined,
): NarrationProvider | null {
  return value === "groq" || value === "mock" ? value : null;
}

function groqModel(modelId: string) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY missing");
  return createGroq({ apiKey })(modelId);
}

const ZERO_USAGE: LlmUsage = { inputTokens: 0, outputTokens: 0 };

function usageOf(result: {
  usage?: { inputTokens?: number; outputTokens?: number };
}): LlmUsage {
  return {
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
  };
}

// El prompt instruye few-shot mínimo + contrato: SOLO variables del payload,
// direcciones e importancias copiadas tal cual (la verificación determinista
// rechaza cualquier desviación, así que mentir = no publicarse).
function narratorPrompt(payload: NarrationPayload): string {
  const language = payload.locale === "es" ? "Spanish" : "English";
  return [
    `Explain a binary-classification experiment to a non-expert, in plain ${language}.`,
    "Rules (violations are discarded by a deterministic verifier):",
    "- Mention ONLY variables listed in the payload; copy importance values and directions exactly.",
    "- Echo the verdict level exactly as given; never soften an unfavorable verdict.",
    "- 2-4 short sentences, no marketing tone, no advice beyond the data.",
    "- Every variable you mention in the narrative MUST appear in your claims, and vice versa.",
    `Payload: ${JSON.stringify(payload)}`,
  ].join("\n");
}

function graderPrompt(payload: NarrationPayload, narrative: string): string {
  return [
    "You grade a short narrative that explains a machine-learning experiment.",
    "Score 1-5 (integers): accuracy (faithful to the payload numbers), completeness (covers verdict + top variables), clarity (plain language).",
    `Payload: ${JSON.stringify(payload)}`,
    `Narrative: ${narrative}`,
  ].join("\n");
}

export async function runNarrator(
  payload: NarrationPayload,
  provider: NarrationProvider,
): Promise<LlmResult<NarratorOutput>> {
  if (provider === "mock") {
    const mode = resolveMockMode(process.env.NARRATION_MOCK_MODE);
    return {
      output: narratorOutputSchema.parse(mockNarrator(payload, mode)),
      usage: ZERO_USAGE,
      model: `mock:${mode}`,
    };
  }

  const result = await generateObject({
    model: groqModel(GROQ_NARRATOR_MODEL),
    schema: narratorOutputSchema,
    prompt: narratorPrompt(payload),
    maxOutputTokens: NARRATOR_MAX_TOKENS,
    abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });
  return {
    output: result.object,
    usage: usageOf(result),
    model: GROQ_NARRATOR_MODEL,
  };
}

export async function runGrader(
  payload: NarrationPayload,
  narrative: string,
  provider: NarrationProvider,
): Promise<LlmResult<GraderOutput>> {
  if (provider === "mock") {
    const mode = resolveMockMode(process.env.NARRATION_MOCK_MODE);
    return {
      output: graderOutputSchema.parse(mockGrader(mode)),
      usage: ZERO_USAGE,
      model: `mock:${mode}`,
    };
  }

  const result = await generateObject({
    model: groqModel(GROQ_GRADER_MODEL),
    schema: graderOutputSchema,
    prompt: graderPrompt(payload, narrative),
    maxOutputTokens: GRADER_MAX_TOKENS,
    abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });
  return {
    output: result.object,
    usage: usageOf(result),
    model: GROQ_GRADER_MODEL,
  };
}
