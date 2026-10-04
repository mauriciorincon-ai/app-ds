import { describe, expect, it } from "vitest";
import type { Metrics } from "@/engine/verdict";
import { buildModelCard, modelCardFileName } from "@/lib/modelcard";
import type { BinaryResult } from "@/workers/protocol";
import { leagueFields } from "./factories";

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

function result(overrides: Partial<BinaryResult> = {}): BinaryResult {
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
    modelName: "forest",
    candidates: [{ name: "forest", metrics: metrics() }],
    ...leagueFields("forest"),
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
    // Gate ⭐ S4 (bloque B): el veredicto nombra al modelo ganador.
    expect(card).toContain("«Random Forest» supera al baseline");
    expect(card).toContain("importancia por permutación");
    expect(card).toContain("| visitas_web |");
    expect(card).toContain("0.2134");
    expect(card).toContain("## Límites");
  });

  it("EN: la misma card narra en inglés", () => {
    const card = build({ locale: "en" });
    expect(card).toContain("200 rows × 7 columns");
    expect(card).toContain("Random Forest beats the baseline");
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

  it("S5: sección «Selección del modelo» — liga, k, criterio, tiempo", () => {
    const card = build();
    expect(card).toContain("## Selección del modelo");
    expect(card).toContain(
      "Compitió 1 modelo con validación cruzada de 5 pliegues",
    );
    expect(card).toContain("regla de un error estándar");
    expect(card).toContain(
      "Modelo elegido por la validación cruzada: Random Forest (200 árboles)",
    );
    expect(card).toContain("Tiempo de la liga en este equipo: 1.2 s");
    expect(card).not.toContain("Muestra pequeña");
    const en = build({ locale: "en" });
    expect(en).toContain("## Model selection");
    expect(en).toContain("one standard error");
  });

  it("S5 (U1): «elegido por ti» queda registrado, con el ganador de la CV, y la muestra pequeña se avisa", () => {
    const base = result();
    const card = build({
      result: result({
        modelName: "knn",
        smallSample: true,
        selection: { ...base.selection, by: "user", cvWinner: "forest" },
      }),
    });
    expect(card).toContain("◆ Elegido por ti: Vecinos más cercanos (k = 5)");
    expect(card).toContain(
      "El ganador de la validación cruzada era Random Forest (200 árboles)",
    );
    expect(card).toContain("Muestra pequeña: con menos de 200 filas");
  });

  it("modelCardFileName genera un slug seguro", () => {
    expect(modelCardFileName("Marketing Campaña 2026.csv")).toBe(
      "model-card-marketing-campa-a-2026.md",
    );
    expect(modelCardFileName("---.csv")).toBe("model-card-experimento.md");
  });
});
