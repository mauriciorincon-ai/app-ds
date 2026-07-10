import { afterEach, describe, expect, it } from "vitest";
import {
  checkRateLimit,
  parseNarrateRequest,
  passesGrader,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  resetRateLimit,
} from "@/lib/ia/guardrails";
import { mockNarrator } from "@/lib/ia/mock";
import type { NarrationPayload } from "@/lib/ia/schemas";
import { verifyNarration } from "@/lib/narration/verify";

function payload(): NarrationPayload {
  return {
    locale: "en",
    problem: "binary-classification",
    target: "churn",
    dataset: { rows: 100, cols: 4 },
    metrics: {
      accuracy: 0.7,
      precision: 0.6,
      recall: 0.5,
      f1: 0.55,
      auc: 0.75,
    },
    verdict: {
      level: "ties",
      primaryMetric: "f1",
      modelScore: 0.55,
      baselineScore: 0.55,
      delta: 0,
    },
    explainability: {
      method: "permutation_importance",
      scoring: "roc_auc",
      features: [
        {
          name: "hours",
          kind: "numeric",
          importance: 0.12,
          direction: "positive",
        },
      ],
    },
    leakage: [],
  };
}

afterEach(() => resetRateLimit());

describe("parseNarrateRequest", () => {
  it("acepta el contrato exacto y rechaza cualquier otra forma", () => {
    expect(parseNarrateRequest({ payload: payload() }).ok).toBe(true);
    expect(parseNarrateRequest({}).ok).toBe(false);
    expect(parseNarrateRequest(null).ok).toBe(false);
    // Un payload con filas coladas no cumple el schema (vocabulario cerrado).
    expect(
      parseNarrateRequest({ payload: { ...payload(), rows: [["a", "b"]] } }).ok,
    ).toBe(false);
  });
});

describe("checkRateLimit", () => {
  it("permite el máximo por ventana y luego bloquea", () => {
    const now = 1_000_000;
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      expect(checkRateLimit("ip-1", now + i)).toBe(true);
    }
    expect(checkRateLimit("ip-1", now + RATE_LIMIT_MAX)).toBe(false);
    // Otra IP no se ve afectada.
    expect(checkRateLimit("ip-2", now)).toBe(true);
  });

  it("la ventana desliza: pasado el periodo vuelve a permitir", () => {
    const now = 2_000_000;
    for (let i = 0; i < RATE_LIMIT_MAX; i++) checkRateLimit("ip-3", now);
    expect(checkRateLimit("ip-3", now)).toBe(false);
    expect(checkRateLimit("ip-3", now + RATE_LIMIT_WINDOW_MS + 1)).toBe(true);
  });
});

describe("passesGrader", () => {
  it("exige exactitud ≥4 y completitud/claridad ≥3", () => {
    expect(passesGrader({ accuracy: 4, completeness: 3, clarity: 3 })).toBe(
      true,
    );
    expect(passesGrader({ accuracy: 3, completeness: 5, clarity: 5 })).toBe(
      false,
    );
    expect(passesGrader({ accuracy: 5, completeness: 2, clarity: 5 })).toBe(
      false,
    );
  });
});

describe("mock provider", () => {
  it("el modo éxito produce una narrativa que PASA la verificación determinista", () => {
    const p = payload();
    expect(verifyNarration(p, mockNarrator(p, "success"))).toEqual({
      ok: true,
    });
  });

  it("el modo mentiroso produce una narrativa que la verificación RECHAZA", () => {
    const p = payload();
    const result = verifyNarration(p, mockNarrator(p, "lying"));
    expect(result.ok).toBe(false);
  });

  it("el modo caído lanza (el route lo convierte en fallback)", () => {
    expect(() => mockNarrator(payload(), "down")).toThrow();
  });
});
