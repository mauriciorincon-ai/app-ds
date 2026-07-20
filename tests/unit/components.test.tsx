// Tests de componentes (Testing Library) — pago de la deuda S1 "cobertura de
// la capa UI". Cubren los componentes nuevos del S2 (estados del porqué,
// consentimiento, model card) + smoke de las pantallas S1.
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { Metrics } from "@/engine/verdict";
import { I18nProvider } from "@/i18n/provider";
import { summarizeDataset } from "@/lib/experiment";
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
    modelName: "forest",
    candidates: [{ name: "forest", metrics: metrics() }],
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
    positiveClass: "1",
    consent: false,
    onConsentChange: vi.fn(),
  };

  it("muestra el gráfico con dirección en símbolo + texto contra la clase positiva real", () => {
    ui(
      <WhySection
        {...base}
        narration={{ kind: "template", text: "texto", reason: "no-consent" }}
      />,
    );
    expect(screen.getByText("¿Por qué predice así?")).toBeInTheDocument();
    expect(screen.getByText("visitas_web")).toBeInTheDocument();
    expect(
      screen.getByText("▲ a mayor valor, más probable «1»"),
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

  it("plantilla por fallo del proveedor: el aviso dice qué pasó y cómo reintentar", () => {
    ui(
      <WhySection
        {...base}
        consent
        narration={{
          kind: "template",
          text: "texto estándar aquí",
          reason: "provider-error",
        }}
      />,
    );
    expect(
      screen.getByText(/El proveedor de IA no respondió/),
    ).toBeInTheDocument();
  });

  it("plantilla sin consentimiento: SIN aviso de fallo (no hubo intento)", () => {
    ui(
      <WhySection
        {...base}
        narration={{ kind: "template", text: "texto", reason: "no-consent" }}
      />,
    );
    expect(screen.queryByText(/proveedor de IA no respondió/)).toBeNull();
    expect(screen.queryByText(/no está configurada/)).toBeNull();
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
  it("ofrece la descarga; la vista previa se monta SOLO al abrir (sin duplicar títulos)", () => {
    const { container } = ui(
      <ModelCardView
        result={result()}
        meta={{ datasetName: "marketing.csv", cols: 7, ...RUN_META }}
        sanitation={null}
        verifiedNarrative={null}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Descargar model card/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Ver el contenido/)).toBeInTheDocument();
    // Cerrada: el markdown NO está en el DOM (no duplica títulos de pantalla).
    expect(screen.queryByText(/# Model card — marketing.csv/)).toBeNull();

    // Abierta: el contenido real aparece.
    const details = container.querySelector("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle", { bubbles: false }));
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
        sanitation={null}
        edaAlerts={null}
        onAgain={() => {}}
        onUseModel={() => {}}
        onExportModel={() => {}}
        exportState="idle"
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
        sanitation={null}
        edaAlerts={null}
        onAgain={() => {}}
        onUseModel={() => {}}
        onExportModel={() => {}}
        exportState="idle"
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
  it("StartScreen: dropzone + 4 ejemplos (incl. el sucio de S4)", () => {
    ui(<StartScreen onLoad={() => {}} onImport={() => {}} />);
    expect(screen.getByText("Empieza tu experimento")).toBeInTheDocument();
    expect(screen.getByText("Campaña de marketing")).toBeInTheDocument();
    expect(screen.getByText("Clientes (datos sucios)")).toBeInTheDocument();
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
    ui(
      <ConfigScreen
        dataset={dataset}
        sanitation={null}
        edaAlerts={null}
        onSelectTarget={() => {}}
        onRun={() => {}}
        onBack={() => {}}
      />,
    );
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

  it("ErrorScreen: caso irrecuperable (csv-unusable) con mensaje honesto", () => {
    ui(<ErrorScreen kind="csv-unusable" onRetry={() => {}} />);
    expect(screen.getByText(/nada para modelar/)).toBeInTheDocument();
  });
});

// --- S4: saneamiento + EDA + candidatos ------------------------------------

const DATASET = summarizeDataset({
  headers: ["edad", "y"],
  rows: [
    ["30", "0"],
    ["45", "1"],
    ["50", "0"],
  ],
});

describe("ConfigScreen — informe de saneamiento", () => {
  it("dataset limpio ⇒ dice de frente 'nada que sanear'", () => {
    ui(
      <ConfigScreen
        dataset={DATASET}
        sanitation={{
          clean: true,
          duplicateRowsRemoved: 0,
          exclusions: [],
          coercions: [],
          rowsBefore: 3,
          rowsAfter: 3,
          colsBefore: 2,
          colsAfter: 2,
          usable: true,
        }}
        edaAlerts={null}
        onSelectTarget={() => {}}
        onRun={() => {}}
        onBack={() => {}}
      />,
    );
    expect(screen.getByText(/nada que sanear/)).toBeInTheDocument();
  });

  it("dataset sucio ⇒ lista las acciones con conteos", () => {
    ui(
      <ConfigScreen
        dataset={DATASET}
        sanitation={{
          clean: false,
          duplicateRowsRemoved: 4,
          exclusions: [{ column: "id_cliente", reason: "id-column" }],
          coercions: [{ column: "edad", cellsNulled: 3 }],
          rowsBefore: 100,
          rowsAfter: 96,
          colsBefore: 5,
          colsAfter: 4,
          usable: true,
        }}
        edaAlerts={null}
        onSelectTarget={() => {}}
        onRun={() => {}}
        onBack={() => {}}
      />,
    );
    expect(screen.getByText(/4 filas duplicadas/)).toBeInTheDocument();
    expect(screen.getByText(/id_cliente/)).toBeInTheDocument();
    expect(
      screen.getByText(/edad.*3 celdas|3 celdas.*edad/),
    ).toBeInTheDocument();
  });
});

describe("ConfigScreen — alertas EDA + accesibilidad", () => {
  it("al elegir objetivo llama a onSelectTarget y muestra las alertas (role=status)", () => {
    const onSelectTarget = vi.fn();
    ui(
      <ConfigScreen
        dataset={DATASET}
        sanitation={null}
        edaAlerts={[{ kind: "class-imbalance", minorityRate: 0.1 }]}
        onSelectTarget={onSelectTarget}
        onRun={() => {}}
        onBack={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText(/¿Qué quieres predecir?/), {
      target: { value: "y" },
    });
    expect(onSelectTarget).toHaveBeenCalledWith("y");
    expect(screen.getByText(/desbalanceado/)).toBeInTheDocument();
  });

  it("la región de la preview es enfocable por teclado (axe: scrollable-region)", () => {
    const { container } = ui(
      <ConfigScreen
        dataset={DATASET}
        sanitation={null}
        edaAlerts={null}
        onSelectTarget={() => {}}
        onRun={() => {}}
        onBack={() => {}}
      />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region).toHaveAttribute("tabindex", "0");
  });
});

describe("ResultsScreen — candidatos", () => {
  it("muestra los candidatos y marca al ganador (símbolo + texto)", () => {
    ui(
      <ResultsScreen
        result={result({
          modelName: "hgb",
          candidates: [
            { name: "forest", metrics: metrics({ auc: 0.79 }) },
            { name: "hgb", metrics: metrics({ auc: 0.83 }) },
          ],
        })}
        datasetName="marketing.csv"
        cols={7}
        runMeta={RUN_META}
        sanitation={null}
        edaAlerts={null}
        onAgain={() => {}}
        onUseModel={() => {}}
        onExportModel={() => {}}
        exportState="idle"
      />,
    );
    expect(screen.getByText(/Random Forest/)).toBeInTheDocument();
    expect(screen.getByText("HistGradientBoosting")).toBeInTheDocument();
    // El ganador (hgb) lleva la etiqueta "elegido" (no solo color).
    expect(screen.getByText("elegido")).toBeInTheDocument();
  });
});
