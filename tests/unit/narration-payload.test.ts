import { describe, expect, it } from "vitest";
import type { Metrics } from "@/engine/verdict";
import { narrationPayloadSchema } from "@/lib/ia/schemas";
import {
  buildNarrationPayload,
  NARRATION_TOP_FEATURES,
} from "@/lib/narration/payload";
import type { ExperimentResult, FeatureImportance } from "@/workers/protocol";

// Valores de celda DISTINTIVOS: si alguno aparece en el payload serializado,
// la garantía de privacidad está rota (regla dura 2 / ADR de privacidad).
const CELL_VALUES = [
  "zanahoria-7731",
  "ingreso-secreto-9911",
  "8842.55",
  "cliente-vip-0007",
];

const POSITIVE_CLASS = "etiqueta-privada-si";

function metrics(overrides: Partial<Metrics> = {}): Metrics {
  return {
    accuracy: 0.71,
    precision: 0.62,
    recall: 0.55,
    f1: 0.58,
    auc: 0.77,
    ...overrides,
  };
}

function feature(
  name: string,
  overrides: Partial<FeatureImportance> = {},
): FeatureImportance {
  return {
    name,
    kind: "numeric",
    importance: 0.1,
    std: 0.01,
    direction: "positive",
    ...overrides,
  };
}

function experimentResult(
  overrides: Partial<ExperimentResult> = {},
): ExperimentResult {
  return {
    positiveClass: POSITIVE_CLASS,
    positiveRate: 0.3,
    nTrain: 150,
    nTest: 50,
    baselines: { majority: metrics({ auc: 0.5 }), logistic: metrics() },
    model: metrics({ auc: 0.812345 }),
    modelName: "forest",
    candidates: [{ name: "forest", metrics: metrics({ auc: 0.812345 }) }],
    confusionMatrix: [
      [30, 5],
      [7, 8],
    ],
    verdict: {
      level: "beats",
      primaryMetric: "auc",
      modelScore: 0.812345,
      baselineScore: 0.77,
      delta: 0.042345,
    },
    leakage: [],
    explainability: {
      method: "permutation_importance",
      scoring: "roc_auc",
      n_repeats: 10,
      features: [
        feature("visitas_web", { importance: 0.21 }),
        feature("dispositivo", {
          kind: "categorical",
          importance: 0.15,
          direction: null,
        }),
        feature("edad", { importance: 0.01, direction: "negative" }),
      ],
    },
    ...overrides,
  };
}

function build(overrides: Partial<ExperimentResult> = {}) {
  return buildNarrationPayload({
    result: experimentResult(overrides),
    target: "convirtio",
    cols: 7,
    locale: "es",
  });
}

describe("buildNarrationPayload", () => {
  it("GARANTÍA: el payload serializado no contiene ningún valor de filas (ni la clase positiva)", () => {
    const serialized = JSON.stringify(build());
    for (const value of CELL_VALUES) {
      expect(serialized).not.toContain(value);
    }
    expect(serialized).not.toContain(POSITIVE_CLASS);
  });

  it("incluye SOLO metadatos: nombres de columnas, métricas, veredicto e importancias", () => {
    const payload = build();
    expect(payload.target).toBe("convirtio");
    expect(payload.dataset).toEqual({ rows: 200, cols: 7 });
    expect(payload.verdict.level).toBe("beats");
    expect(payload.explainability.features.map((f) => f.name)).toEqual([
      "visitas_web",
      "dispositivo",
      "edad",
    ]);
  });

  it("valida contra el schema Zod del route (mismo contrato)", () => {
    expect(narrationPayloadSchema.safeParse(build()).success).toBe(true);
  });

  it("recorta al top-N de features y redondea a 4 decimales", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      feature(`col_${i}`, { importance: 0.123456 - i * 0.001 }),
    );
    const payload = build({
      explainability: {
        method: "permutation_importance",
        scoring: "roc_auc",
        n_repeats: 10,
        features: many,
      },
    });
    expect(payload.explainability.features).toHaveLength(
      NARRATION_TOP_FEATURES,
    );
    expect(payload.explainability.features[0]?.importance).toBe(0.1235);
    expect(payload.verdict.delta).toBe(0.0423);
  });

  it("propaga las columnas marcadas por la heurística de fuga (son nombres, no valores)", () => {
    const payload = build({
      leakage: [
        {
          column: "monto_recuperado",
          score: 0.99,
          reason: "near-perfect-separation",
        },
      ],
    });
    expect(payload.leakage).toEqual(["monto_recuperado"]);
  });
});
