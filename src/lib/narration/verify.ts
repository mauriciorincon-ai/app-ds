// Verificación numérica DETERMINISTA de la narrativa del LLM contra el payload
// (patrón Explingo como guardrail): cada claim debe citar una variable real,
// con la dirección real y la importancia real (tolerancia ε por redondeo). Si
// algo no cuadra, la narrativa NO se muestra — cae la plantilla determinista.
// Corre ANTES del Grader (que solo evalúa estilo de narrativas ya verificadas).
import type { NarrationPayload, NarratorOutput } from "@/lib/ia/schemas";

export const IMPORTANCE_TOLERANCE = 0.005;

export type VerificationFailure =
  | "wrong-verdict"
  | "unknown-feature"
  | "wrong-direction"
  | "wrong-importance"
  | "claim-not-in-narrative"
  | "unclaimed-feature-mention";

export type VerificationResult =
  { ok: true } | { ok: false; reason: VerificationFailure };

// Matching insensible a diacríticos: el LLM escribe español natural ("la
// región") aunque la columna se llame "region"; sigue siendo matching literal.
const fold = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const mentions = (narrative: string, name: string) =>
  fold(narrative).includes(fold(name));

export function verifyNarration(
  payload: NarrationPayload,
  output: NarratorOutput,
): VerificationResult {
  if (output.verdictLevel !== payload.verdict.level) {
    return { ok: false, reason: "wrong-verdict" };
  }

  const actualByName = new Map(
    payload.explainability.features.map((feature) => [feature.name, feature]),
  );

  for (const claim of output.claims) {
    const actual = actualByName.get(claim.feature);
    if (!actual) return { ok: false, reason: "unknown-feature" };

    const actualDirection = actual.direction ?? "none";
    if (claim.direction !== actualDirection) {
      return { ok: false, reason: "wrong-direction" };
    }
    if (Math.abs(claim.importance - actual.importance) > IMPORTANCE_TOLERANCE) {
      return { ok: false, reason: "wrong-importance" };
    }
    // Un claim que la narrativa no menciona es decorativo: no respalda nada.
    if (!mentions(output.narrative, claim.feature)) {
      return { ok: false, reason: "claim-not-in-narrative" };
    }
  }

  // Toda variable del payload citada en la narrativa debe estar respaldada por
  // un claim (si no, el texto afirma cosas que nadie verificó).
  const claimed = new Set(output.claims.map((claim) => claim.feature));
  for (const feature of payload.explainability.features) {
    if (
      !claimed.has(feature.name) &&
      mentions(output.narrative, feature.name)
    ) {
      return { ok: false, reason: "unclaimed-feature-mention" };
    }
  }

  return { ok: true };
}
