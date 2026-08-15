// Guardia del tracking de costo (estándar 7, auditoría de cierre H1): los
// modelos EN PRODUCCIÓN deben tener precio en la tabla — si un cambio de
// modelo (client.ts) no actualiza cost.ts, el log registraría costUsd: 0 y
// el presupuesto ≤US$10/mes quedaría ciego. Este test falla en ese caso.
import { describe, expect, it } from "vitest";
import { GROQ_GRADER_MODEL, GROQ_NARRATOR_MODEL } from "@/lib/ia/client";
import { estimateCostUsd } from "@/lib/ia/cost";

const USAGE = { inputTokens: 1_000_000, outputTokens: 1_000_000 };

describe("estimateCostUsd", () => {
  it("tiene precio para el modelo del Narrator en producción", () => {
    expect(estimateCostUsd(GROQ_NARRATOR_MODEL, USAGE)).toBeGreaterThan(0);
  });

  it("tiene precio para el modelo del Grader en producción", () => {
    expect(estimateCostUsd(GROQ_GRADER_MODEL, USAGE)).toBeGreaterThan(0);
  });

  it("gpt-oss-120b cuesta lo que documenta el ADR-005 ($0.15/$0.60 por 1M)", () => {
    expect(estimateCostUsd("openai/gpt-oss-120b", USAGE)).toBeCloseTo(0.75, 10);
    expect(
      estimateCostUsd("openai/gpt-oss-120b", {
        inputTokens: 2000,
        outputTokens: 500,
      }),
    ).toBeCloseTo((2000 * 0.15 + 500 * 0.6) / 1_000_000, 12);
  });

  it("el mock (sin precio) reporta 0 sin reventar", () => {
    expect(estimateCostUsd("mock:ok", USAGE)).toBe(0);
  });
});
