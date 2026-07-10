// Tests de componentes (Testing Library) — pago de la deuda S1 "cobertura de
// la capa UI". Cubren los componentes nuevos del S2 (estados del porqué,
// consentimiento, model card) + smoke de las pantallas S1.
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { Metrics } from "@/engine/verdict";
import { I18nProvider } from "@/i18n/provider";
import { summarizeDataset } from "@/lib/experiment";
import type { NarrationState } from "@/lib/useNarration";
import type { ExperimentResult } from "@/workers/protocol";
import { ConfigScreen } from "@/components/ConfigScreen";
import { ConsentPanel } from "@/components/ConsentPanel";
import { ErrorScreen } from "@/components/ErrorScreen";
import { ModelCardView } from "@/components/ModelCardView";
import { ResultsScreen } from "@/components/ResultsScreen";
import { StartScreen } from "@/components/StartScreen";
import { TrainingScreen } from "@/components/TrainingScreen";
import { WhySection } from "@/components/WhySection";

function ui(children: ReactNode) {
  return render(<I18nProvider>{children}</I18nProvider>);
}

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
          importance: 0.21,
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

const RUN_META = {
  target: "convirtio",
  numericFeatures: 4,
  categoricalFeatures: 2,
  seed: 42,
};

beforeEach(() => {
  window.localStorage.clear();
});

describe("WhySection", () => {
  const base = {
    explain: result().explainability,
    consent: false,
    onConsentChange: vi.fn(),
  };

  it("muestra el gráfico con dirección en símbolo + texto (no solo color)", () => {
    ui(
      <WhySection
        {...base}
        narration={{ kind: "template", text: "texto", reason: "no-consent" }}
      />,
    );
    expect(screen.getByText("¿Por qué predice así?")).toBeInTheDocument();
    expect(screen.getByText("visitas_web")).toBeInTheDocument();
    expect(
      screen.getByText("▲ asociación positiva con el objetivo"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("· el efecto varía por categoría"),
    ).toBeInTheDocument();
  });

  it("estado plantilla: etiqueta 'Texto estándar' visible", () => {
    ui(
      <WhySection
        {...base}
        narration={{
          kind: "template",
          text: "texto estándar aquí",
          reason: "disabled",
        }}
      />,
    );
    expect(screen.getByText("Texto estándar")).toBeInTheDocument();
    expect(screen.getByText("texto estándar aquí")).toBeInTheDocument();
  });

  it("estado verificado: badge con símbolo + texto", () => {
    ui(
      <WhySection
        {...base}
        narration={{ kind: "verified", text: "narrativa verificada" }}
      />,
    );
    expect(screen.getByText(/verificada con los números/)).toBeInTheDocument();
    expect(screen.getByText("narrativa verificada")).toBeInTheDocument();
  });

  it("estado cargando: mensaje en región aria-live", () => {
    ui(<WhySection {...base} narration={{ kind: "loading" }} />);
    const loading = screen.getByText(/Generando la narración/);
    expect(loading.closest("[aria-live='polite']")).not.toBeNull();
  });
});

describe("ConsentPanel", () => {
  it("explica qué viaja y qué no, y reporta el cambio", () => {
    const onChange = vi.fn();
    ui(<ConsentPanel consent={false} onChange={onChange} />);
    expect(screen.getByText(/NUNCA se envían tus filas/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("ModelCardView", () => {
  it("ofrece la descarga y una vista previa con el contenido real", () => {
    ui(
      <ModelCardView
        result={result()}
        meta={{ datasetName: "marketing.csv", cols: 7, ...RUN_META }}
        verifiedNarrative={null}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Descargar model card/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Ver el contenido/)).toBeInTheDocument();
    // El markdown real está en la vista previa (título + sección de límites).
    expect(
      screen.getByText(/# Model card — marketing.csv/),
    ).toBeInTheDocument();
  });
});

describe("ResultsScreen (integración de la pantalla)", () => {
  it("veredicto arriba + porqué + model card; sin consentimiento no llama a la red", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    ui(
      <ResultsScreen
        result={result()}
        datasetName="marketing.csv"
        cols={7}
        runMeta={RUN_META}
        onAgain={() => {}}
      />,
    );
    expect(
      screen.getByText("El modelo supera al baseline"),
    ).toBeInTheDocument();
    expect(screen.getByText("¿Por qué predice así?")).toBeInTheDocument();
    expect(screen.getByText("Model card")).toBeInTheDocument();
    // Consent default OFF ⇒ plantilla local, CERO llamadas de red (ADR-006).
    expect(screen.getByText("Texto estándar")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("con fuga: banner sospechoso + columnas marcadas", () => {
    ui(
      <ResultsScreen
        result={result({
          leakage: [
            {
              column: "monto_recuperado",
              score: 0.99,
              reason: "near-perfect-separation",
            },
          ],
        })}
        datasetName="credito.csv"
        cols={6}
        runMeta={RUN_META}
        onAgain={() => {}}
      />,
    );
    expect(
      screen.getByText("Métricas casi perfectas — sospechoso"),
    ).toBeInTheDocument();
    // La columna marcada aparece en la alerta, la plantilla y la model card.
    expect(screen.getAllByText(/monto_recuperado/).length).toBeGreaterThan(0);
  });
});

describe("pantallas S1 (smoke)", () => {
  it("StartScreen: dropzone + 3 ejemplos", () => {
    ui(<StartScreen onLoad={() => {}} />);
    expect(screen.getByText("Empieza tu experimento")).toBeInTheDocument();
    expect(screen.getByText("Campaña de marketing")).toBeInTheDocument();
  });

  it("ConfigScreen: preview + selección de objetivo", () => {
    const dataset = summarizeDataset({
      headers: ["x", "y"],
      rows: [
        ["1", "0"],
        ["2", "1"],
        ["3", "0"],
      ],
    });
    ui(<ConfigScreen dataset={dataset} onRun={() => {}} onBack={() => {}} />);
    expect(screen.getByText("Configura el experimento")).toBeInTheDocument();
    expect(screen.getByText("¿Qué quieres predecir?")).toBeInTheDocument();
  });

  it("TrainingScreen: progreso honesto", () => {
    ui(<TrainingScreen stage="loading-packages" />);
    expect(screen.getByText(/pandas y scikit-learn/)).toBeInTheDocument();
  });

  it("ErrorScreen: mensaje llano + acción de recuperación", () => {
    const onRetry = vi.fn();
    ui(<ErrorScreen kind="csv-too-large" onRetry={onRetry} />);
    expect(screen.getByText(/5 MB/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(onRetry).toHaveBeenCalled();
  });
});
