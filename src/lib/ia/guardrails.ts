// Guardrails del flujo de narración (capa base del estándar 7).
// Input: el route SOLO acepta el payload estructurado validado por Zod — no
// existe texto libre del usuario, así que la inyección de prompt no tiene
// vehículo; el límite de tamaño viene dado por el propio schema (top-8
// features, strings acotados). Output: schema Zod + verificación determinista
// (verify.ts) + umbral del Grader. Aquí además: kill-switch y rate limit.
import {
  narrateRequestSchema,
  type GraderOutput,
  type NarrationPayload,
} from "./schemas";

export function narrationEnabled(): boolean {
  return process.env.NARRATION_ENABLED === "true";
}

export type ParsedRequest =
  { ok: true; payload: NarrationPayload } | { ok: false };

export function parseNarrateRequest(body: unknown): ParsedRequest {
  const parsed = narrateRequestSchema.safeParse(body);
  return parsed.success
    ? { ok: true, payload: parsed.data.payload }
    : { ok: false };
}

// Rate limit en memoria (ventana deslizante) — suficiente a escala personal;
// por instancia serverless, no global (límite documentado en decisions/005).
export const RATE_LIMIT_MAX = 10;
export const RATE_LIMIT_WINDOW_MS = 60_000;

const hits = new Map<string, number[]>();

export function checkRateLimit(key: string, now = Date.now()): boolean {
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const recent = (hits.get(key) ?? []).filter((t) => t > windowStart);
  if (recent.length >= RATE_LIMIT_MAX) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

export function resetRateLimit(): void {
  hits.clear();
}

// Umbral del Grader (solo evalúa narrativas YA verificadas numéricamente):
// exactitud alta obligatoria; completitud y claridad con margen.
export const GRADER_THRESHOLD = {
  accuracy: 4,
  completeness: 3,
  clarity: 3,
} as const;

export function passesGrader(grade: GraderOutput): boolean {
  return (
    grade.accuracy >= GRADER_THRESHOLD.accuracy &&
    grade.completeness >= GRADER_THRESHOLD.completeness &&
    grade.clarity >= GRADER_THRESHOLD.clarity
  );
}
