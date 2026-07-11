import { describe, expect, it } from "vitest";
import type { NarrationPayload, NarratorOutput } from "@/lib/ia/schemas";
import { IMPORTANCE_TOLERANCE, verifyNarration } from "@/lib/narration/verify";

function payload(): NarrationPayload {
  return {
    locale: "es",
    problem: "binary-classification",
    target: "convirtio",
    dataset: { rows: 200, cols: 7 },
    metrics: {
      accuracy: 0.71,
      precision: 0.62,
      recall: 0.55,
      f1: 0.58,
      auc: 0.81,
    },
    verdict: {
      level: "beats",
      primaryMetric: "auc",
      modelScore: 0.81,
      baselineScore: 0.77,
      delta: 0.04,
    },
    explainability: {
      method: "permutation_importance",
      scoring: "roc_auc",
      features: [
        {
          name: "visitas_web",
          kind: "numeric",
          importance: 0.21,
          direction: "positive",
        },
        {
          name: "dispositivo",
          kind: "categorical",
          importance: 0.15,
          direction: null,
        },
        {
          name: "edad",
          kind: "numeric",
          importance: 0.01,
          direction: "negative",
        },
      ],
    },
    leakage: [],
  };
}

function output(overrides: Partial<NarratorOutput> = {}): NarratorOutput {
  return {
    verdictLevel: "beats",
    narrative:
      "El modelo supera al baseline. La variable con más peso es visitas_web, " +
      "seguida de dispositivo, cuyo efecto varía por categoría.",
    claims: [
      { feature: "visitas_web", direction: "positive", importance: 0.21 },
      { feature: "dispositivo", direction: "none", importance: 0.15 },
    ],
    ...overrides,
  };
}

describe("verifyNarration", () => {
  it("acepta una narrativa cuyos claims coinciden con el payload", () => {
    expect(verifyNarration(payload(), output())).toEqual({ ok: true });
  });

  it("rechaza una variable inventada (unknown-feature)", () => {
    const lying = output({
      narrative: "La variable clave es ingresos_extra, que domina el modelo.",
      claims: [
        { feature: "ingresos_extra", direction: "positive", importance: 0.3 },
      ],
    });
    expect(verifyNarration(payload(), lying)).toEqual({
      ok: false,
      reason: "unknown-feature",
    });
  });

  it("rechaza una dirección falsa (wrong-direction)", () => {
    const lying = output({
      claims: [
        { feature: "visitas_web", direction: "negative", importance: 0.21 },
      ],
      narrative: "A menos visitas_web, más conversión.",
    });
    expect(verifyNarration(payload(), lying)).toEqual({
      ok: false,
      reason: "wrong-direction",
    });
  });

  it("rechaza una cifra fuera de tolerancia (wrong-importance)", () => {
    const lying = output({
      claims: [
        {
          feature: "visitas_web",
          direction: "positive",
          importance: 0.21 + IMPORTANCE_TOLERANCE * 2,
        },
      ],
      narrative: "visitas_web pesa muchísimo.",
    });
    expect(verifyNarration(payload(), lying)).toEqual({
      ok: false,
      reason: "wrong-importance",
    });
  });

  it("acepta una cifra dentro de la tolerancia de redondeo", () => {
    const rounded = output({
      claims: [
        {
          feature: "visitas_web",
          direction: "positive",
          importance: 0.21 + IMPORTANCE_TOLERANCE / 2,
        },
      ],
      narrative: "visitas_web es la variable con más peso.",
    });
    expect(verifyNarration(payload(), rounded)).toEqual({ ok: true });
  });

  it("acepta menciones con acentos naturales del español (región respalda a region)", () => {
    // Visto con Groq real: la columna "region" aparece como "la región" en la
    // prosa. El matching es insensible a diacríticos — sigue siendo literal.
    const base = payload();
    const accented: NarrationPayload = {
      ...base,
      explainability: {
        ...base.explainability,
        features: [
          ...base.explainability.features,
          {
            name: "region",
            kind: "categorical",
            importance: 0.02,
            direction: null,
          },
        ],
      },
    };
    const withAccent = output({
      claims: [
        { feature: "visitas_web", direction: "positive", importance: 0.21 },
        { feature: "region", direction: "none", importance: 0.02 },
      ],
      narrative:
        "visitas_web pesa más, mientras que la región prácticamente no influye.",
    });
    expect(verifyNarration(accented, withAccent)).toEqual({ ok: true });
  });

  it("rechaza un claim que la narrativa no menciona (claim-not-in-narrative)", () => {
    const detached = output({
      narrative:
        "El modelo supera al baseline con claridad y las métricas son sólidas en prueba.",
    });
    expect(verifyNarration(payload(), detached)).toEqual({
      ok: false,
      reason: "claim-not-in-narrative",
    });
  });

  it("rechaza mencionar una variable del payload sin claim que la respalde", () => {
    const sneaky = output({
      narrative:
        "visitas_web y dispositivo pesan mucho, y edad también influye bastante.",
    });
    expect(verifyNarration(payload(), sneaky)).toEqual({
      ok: false,
      reason: "unclaimed-feature-mention",
    });
  });

  it("rechaza un veredicto contradicho (wrong-verdict)", () => {
    const lying = output({ verdictLevel: "loses" });
    expect(verifyNarration(payload(), lying)).toEqual({
      ok: false,
      reason: "wrong-verdict",
    });
  });
});
