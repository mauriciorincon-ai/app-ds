// POST /api/narrate — la primera (y única) superficie server-side de la app.
// Recibe el payload estructurado de explicabilidad (Zod; nombres de columnas y
// estadísticas agregadas — JAMÁS filas: el cliente solo lo envía con opt-in),
// llama al Narrator, verifica DETERMINÍSTICAMENTE cada claim contra los
// números, y solo entonces deja que el Grader califique. Cualquier fallo en
// cualquier punto ⇒ { status: "fallback" } y la UI muestra la plantilla local.
// Sin persistencia: nada del LLM se guarda. Sin retries: ≤2 llamadas SIEMPRE.
import { NextResponse } from "next/server";
import { runGrader, runNarrator, resolveProvider } from "@/lib/ia/client";
import { logNarrationCost } from "@/lib/ia/cost";
import {
  checkRateLimit,
  narrationEnabled,
  parseNarrateRequest,
  passesGrader,
} from "@/lib/ia/guardrails";
import type { FallbackReason, NarrateResponse } from "@/lib/ia/schemas";
import { verifyNarration } from "@/lib/narration/verify";
import { reportNarrationError } from "@/lib/observability";

export const runtime = "nodejs";

function fallback(reason: FallbackReason, status = 200) {
  const body: NarrateResponse = { status: "fallback", reason };
  return NextResponse.json(body, { status });
}

export async function POST(request: Request): Promise<NextResponse> {
  // Kill-switch y proveedor: sin narración no hay error — hay plantilla.
  if (!narrationEnabled()) return fallback("disabled");

  const provider = resolveProvider(process.env.NARRATION_PROVIDER);
  if (provider === null) return fallback("no-provider");
  if (provider === "groq" && !process.env.GROQ_API_KEY) {
    return fallback("no-provider");
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!checkRateLimit(ip)) return fallback("rate-limited", 429);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fallback("invalid-request", 400);
  }
  const parsed = parseNarrateRequest(body);
  if (!parsed.ok) return fallback("invalid-request", 400);

  const requestId = crypto.randomUUID();

  // Llamada 1/2: Narrator. Falla (timeout, red, schema) ⇒ plantilla, sin retry.
  let narrator;
  try {
    narrator = await runNarrator(parsed.payload, provider);
  } catch {
    reportNarrationError("narrator-failed");
    return fallback("provider-error");
  }
  logNarrationCost({
    requestId,
    step: "narrator",
    model: narrator.model,
    usage: narrator.usage,
  });

  // Verificación numérica determinista ANTES de cualquier estética: una
  // narrativa que miente no se muestra, se descarta.
  const verification = verifyNarration(parsed.payload, narrator.output);
  if (!verification.ok) {
    reportNarrationError(`verification:${verification.reason}`);
    return fallback("verification-failed");
  }

  // Llamada 2/2: Grader (solo narrativas ya verificadas).
  let grader;
  try {
    grader = await runGrader(
      parsed.payload,
      narrator.output.narrative,
      provider,
    );
  } catch {
    reportNarrationError("grader-failed");
    return fallback("provider-error");
  }
  logNarrationCost({
    requestId,
    step: "grader",
    model: grader.model,
    usage: grader.usage,
  });

  if (!passesGrader(grader.output)) return fallback("grader-rejected");

  const response: NarrateResponse = {
    status: "verified",
    narrative: narrator.output.narrative,
    grader: grader.output,
  };
  return NextResponse.json(response);
}
