import { describe, expect, it } from "vitest";
import type { NarrationPayload } from "@/lib/ia/schemas";
import { buildTemplateNarrative } from "@/lib/narration/templates";

function payload(overrides: Partial<NarrationPayload> = {}): NarrationPayload {
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
    ...overrides,
  };
}

describe("buildTemplateNarrative", () => {
  it("ES: veredicto con cifras reales + variables con dirección + método honesto", () => {
    const text = buildTemplateNarrative(payload());
    expect(text).toContain("0.81");
    expect(text).toContain("0.77");
    expect(text).toContain("AUC");
    expect(text).toContain(
      "visitas_web (a mayor valor, más probable la clase positiva)",
    );
    expect(text).toContain("dispositivo (el efecto varía por categoría)");
    expect(text).toContain("permutación sobre el conjunto de prueba");
  });

  it("EN: el mismo payload narra en inglés", () => {
    const text = buildTemplateNarrative(payload({ locale: "en" }));
    expect(text).toContain("beats the baseline");
    expect(text).toContain(
      "visitas_web (higher values make the positive class more likely)",
    );
    expect(text).toContain("permutation on the test set");
  });

  it("no filtra claves i18n sin resolver (fallback de clave visible)", () => {
    for (const locale of ["es", "en"] as const) {
      const text = buildTemplateNarrative(payload({ locale }));
      expect(text).not.toMatch(/narration\.template|results\.metrics/);
    }
  });

  it("veredicto 'loses' se dice de frente", () => {
    const text = buildTemplateNarrative(
      payload({
        verdict: {
          level: "loses",
          primaryMetric: "f1",
          modelScore: 0.41,
          baselineScore: 0.52,
          delta: -0.11,
        },
      }),
    );
    expect(text).toContain("NO supera al baseline");
    expect(text).toContain("0.41");
  });

  it("incluye la advertencia de fuga solo cuando hay columnas marcadas", () => {
    expect(buildTemplateNarrative(payload())).not.toContain("posible fuga");
    const withLeak = buildTemplateNarrative(
      payload({ leakage: ["monto_recuperado"] }),
    );
    expect(withLeak).toContain("monto_recuperado");
    expect(withLeak).toContain("posible fuga");
  });
});
