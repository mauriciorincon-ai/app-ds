// Proveedor MOCK: determinista, in-process, sin red. Es el proveedor de CI y
// de los tests (ningún test depende del API real). Sus modos reproducen los
// tres escenarios del estándar 7: éxito, narrador-que-miente (la verificación
// debe descartarlo) y proveedor caído (el route debe caer a plantilla).
import type { GraderOutput, NarrationPayload, NarratorOutput } from "./schemas";

export type MockMode = "success" | "lying" | "down";

export function resolveMockMode(value: string | undefined): MockMode {
  return value === "lying" || value === "down" ? value : "success";
}

const MOCK_CLAIMS = 2;

export function mockNarrator(
  payload: NarrationPayload,
  mode: MockMode,
): NarratorOutput {
  if (mode === "down") {
    throw new Error("mock provider down");
  }

  if (mode === "lying") {
    // Cita una variable que NO existe en el experimento: la verificación
    // determinista debe rechazarla (unknown-feature) y el route caer a plantilla.
    return {
      verdictLevel: payload.verdict.level,
      narrative:
        payload.locale === "es"
          ? "El factor decisivo es columna_fantasma, que domina el modelo con claridad y explica casi todo el resultado."
          : "The decisive factor is columna_fantasma, which clearly dominates the model and explains almost the entire outcome.",
      claims: [
        { feature: "columna_fantasma", direction: "positive", importance: 0.9 },
      ],
    };
  }

  // Éxito: claims copiados fielmente del payload; la narrativa menciona
  // exactamente las variables reclamadas (pasa la verificación por construcción).
  const claimed = payload.explainability.features.slice(0, MOCK_CLAIMS);
  const list = claimed.map((feature) => feature.name).join(", ");
  const narrative =
    payload.locale === "es"
      ? `Narración de prueba (mock): las variables con más peso fueron ${list}. Las cifras provienen del payload y se verifican antes de mostrarse.`
      : `Test narrative (mock): the variables with the most weight were ${list}. The figures come from the payload and are verified before display.`;

  return {
    verdictLevel: payload.verdict.level,
    narrative,
    claims: claimed.map((feature) => ({
      feature: feature.name,
      direction: feature.direction ?? "none",
      importance: feature.importance,
    })),
  };
}

export function mockGrader(mode: MockMode): GraderOutput {
  if (mode === "down") {
    throw new Error("mock provider down");
  }
  return { accuracy: 5, completeness: 4, clarity: 5 };
}
