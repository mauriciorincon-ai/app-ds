import { describe, expect, it } from "vitest";
import type { Metrics } from "@/engine/verdict";
import { buildModelCard, modelCardFileName } from "@/lib/modelcard";
import type { ExperimentResult } from "@/workers/protocol";

function metrics(overrides: Partial<Metrics> = {}): Metrics {
  return {
    accuracy: 0.71,
    precision: 0.62,
    recall: 0.55,
    f1: 0.58,
    auc: 0.81,
    ...overrides,
  };
}

function result(overrides: Partial<ExperimentResult> = {}): ExperimentResult {
  return {
    positiveClass: "1",
    positiveRate: 0.3,
    nTrain: 150,
    nTest: 50,
    baselines: {
      majority: metrics({ auc: 0.5 }),
      logistic: metrics({ auc: 0.77 }),
    },
    model: metrics(),
    confusionMatrix: [
      [30, 5],
      [7, 8],
    ],
    verdict: {
      level: "beats",
      primaryMetric: "auc",
      modelScore: 0.81,
      baselineScore: 0.77,
      delta: 0.04,
    },
    leakage: [],
    explainability: {
      method: "permutation_importance",
      scoring: "roc_auc",
      n_repeats: 10,
      features: [
        {
          name: "visitas_web",
          kind: "numeric",
          importance: 0.2134,
          std: 0.01,
          direction: "positive",
        },
        {
          name: "dispositivo",
          kind: "categorical",
          importance: 0.15,
          std: 0.02,
          direction: null,
        },
      ],
    },
    ...overrides,
  };
}

function build(
  overrides: Partial<Parameters<typeof buildModelCard>[0]> = {},
): string {
  return buildModelCard({
    locale: "es",
    datasetName: "marketing-campania.csv",
    cols: 7,
    numericFeatures: 4,
    categoricalFeatures: 2,
    target: "convirtio",
    seed: 42,
    result: result(),
    verifiedNarrative: null,
    date: new Date(2026, 6, 9),
    ...overrides,
  });
}

describe("buildModelCard", () => {
  it("ES: contiene datos, partición, métricas, veredicto, explicabilidad y límites", () => {
    const card = build();
    expect(card).toContain("# Model card — marketing-campania.csv");
    expect(card).toContain("200 filas × 7 columnas");
    expect(card).toContain("«convirtio»");
    expect(card).toContain("clase positiva: «1»");
    expect(card).toContain("Entrenamiento: 150 filas · Prueba: 50 filas");
    expect(card).toContain("semilla 42");
    expect(card).toContain("anti-fuga por construcción");
    expect(card).toContain("| AUC | 0.81 | 0.50 | 0.77 |");
    expect(card).toContain("El modelo supera al baseline");
    expect(card).toContain("importancia por permutación");
    expect(card).toContain("| visitas_web |");
    expect(card).toContain("0.2134");
    expect(card).toContain("## Límites");
  });

  it("EN: la misma card narra en inglés", () => {
    const card = build({ locale: "en" });
    expect(card).toContain("200 rows × 7 columns");
    expect(card).toContain("The model beats the baseline");
    expect(card).toContain("permutation importance on the test set");
    expect(card).toContain("anti-leakage by construction");
  });

  it("sin fuga: lo dice honesto (ayuda, no garantía); con fuga: nombra las columnas", () => {
    expect(build()).toContain("no una garantía");
    const withLeak = build({
      result: result({
        leakage: [
          {
            column: "monto_recuperado",
            score: 0.99,
            reason: "near-perfect-separation",
          },
        ],
      }),
    });
    expect(withLeak).toContain("«monto_recuperado»");
    expect(withLeak).toContain("infladas");
  });

  it("cita la narración SOLO si quedó verificada", () => {
    expect(build()).toContain("No se incluye narración IA");
    const verified = build({
      verifiedNarrative: "Texto verificado de prueba.",
    });
    expect(verified).toContain("> Texto verificado de prueba.");
    expect(verified).not.toContain("No se incluye narración IA");
  });

  it("no filtra claves i18n sin resolver", () => {
    for (const locale of ["es", "en"] as const) {
      expect(build({ locale })).not.toMatch(/modelcard\.|results\.metrics/);
    }
  });

  it("modelCardFileName genera un slug seguro", () => {
    expect(modelCardFileName("Marketing Campaña 2026.csv")).toBe(
      "model-card-marketing-campa-a-2026.md",
    );
    expect(modelCardFileName("---.csv")).toBe("model-card-experimento.md");
  });
});
