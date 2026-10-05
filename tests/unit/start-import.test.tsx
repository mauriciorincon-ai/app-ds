// Import de modelo en la pantalla inicial (S3): la validación (manifiesto +
// SHA-256, ANTES de deserializar) es la real de model-file.ts — aquí se prueba
// que la pantalla la comunica: resumen honesto, advertencia de versión y
// rechazo claro sin tocar el payload.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/provider";
import {
  RUNTIME_VERSIONS,
  packModelFile,
  type ModelFile,
} from "@/lib/model-file";
import { assembleMulticlassResult } from "@/lib/experiment";
import type {
  ExperimentResult,
  ExportResult,
  MulticlassPipelineResult,
  RuntimeVersions,
} from "@/workers/protocol";
import { StartScreen } from "@/components/StartScreen";
import { leagueFields } from "./factories";

const METRICS = {
  accuracy: 0.71,
  precision: 0.62,
  recall: 0.55,
  f1: 0.58,
  auc: 0.81,
};

const RESULT: ExperimentResult = {
  positiveClass: "si",
  positiveRate: 0.3,
  nTrain: 150,
  nTest: 50,
  baselines: {
    majority: { ...METRICS, auc: 0.5 },
    logistic: { ...METRICS, auc: 0.77 },
  },
  model: METRICS,
  modelName: "forest",
  candidates: [{ name: "forest", metrics: METRICS }],
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
    features: [],
  },
};

function packFixture(
  versions: RuntimeVersions = { ...RUNTIME_VERSIONS, python: "3.14.2" },
  result: ExperimentResult = RESULT,
) {
  return packModelFile({
    datasetName: "ventas.csv",
    result,
    exported: {
      payload_b64: btoa("payload-de-mentira"),
      versions,
      schema: {
        numeric: ["edad"],
        categorical: ["region"],
        target: "convirtio",
        classes: ["no", "si"],
        positive_class: "si",
      },
      training_profile: {
        numeric: { edad: { min: 18, max: 70 } },
        categorical: { region: ["norte", "sur"] },
      },
    },
    date: new Date("2026-07-11T12:00:00Z"),
  });
}

function ui() {
  const onImport = vi.fn();
  render(
    <I18nProvider>
      <StartScreen onLoad={() => {}} onImport={onImport} />
    </I18nProvider>,
  );
  return { onImport };
}

function uploadModelFile(content: string) {
  const input = document.querySelector(
    'input[accept=".json,application/json"]',
  )!;
  const file = new File([content], "modelo.probeta.json", {
    type: "application/json",
  });
  fireEvent.change(input, { target: { files: [file] } });
}

describe("StartScreen — cargar modelo guardado", () => {
  it("archivo válido ⇒ resumen honesto del manifiesto y confirmación", async () => {
    const { onImport } = ui();
    fireEvent.click(screen.getByText("Cargar modelo guardado"));

    const file = await packFixture();
    uploadModelFile(JSON.stringify(file));

    await waitFor(() =>
      expect(screen.getByText(/Modelo válido/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/«ventas.csv» \(200 filas\)/)).toBeInTheDocument();
    expect(screen.getByText(/Predice «convirtio»/)).toBeInTheDocument();
    expect(screen.getByText(/AUC en prueba: 0.81/)).toBeInTheDocument();
    // El veredicto se lee entero: sin «{name}» crudo de la plantilla.
    expect(screen.getByText(/— supera al baseline/)).toBeInTheDocument();
    expect(screen.queryByText(/\{name\}/)).toBeNull();
    // S5: cómo se eligió el modelo viaja con el archivo (AU-S5-06).
    expect(
      screen.getByText(
        "Elegido por validación cruzada de 5 pliegues (compitió 1 modelo).",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Elegido por ti/)).toBeNull();
    expect(screen.getByText(/Sin advertencias de fuga/)).toBeInTheDocument();
    // Mismas versiones ⇒ SIN advertencia de versión.
    expect(screen.queryByText(/versiones distintas/i)).toBeNull();

    fireEvent.click(screen.getByText("Usar este modelo"));
    expect(onImport).toHaveBeenCalledOnce();
    const imported = onImport.mock.calls[0]![0] as ModelFile;
    expect(imported.manifest.dataset.name).toBe("ventas.csv");
  });

  it("un modelo elegido a mano conserva su etiqueta «◆ Elegido por ti» al importarse (AU-S5-06)", async () => {
    ui();
    const chosen: ExperimentResult = {
      ...RESULT,
      modelName: "knn",
      ...leagueFields("forest", ["knn"]),
    };
    chosen.selection = { ...chosen.selection, by: "user" };
    uploadModelFile(
      JSON.stringify(
        await packFixture({ ...RUNTIME_VERSIONS, python: "3.14.2" }, chosen),
      ),
    );
    await waitFor(() =>
      expect(screen.getByText(/Modelo válido/)).toBeInTheDocument(),
    );
    expect(
      screen.getByText(
        /◆ Elegido por ti, no por la validación cruzada \(el ganador de la validación cruzada era Random Forest\)/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Elegido por validación cruzada/)).toBeNull();
  });

  it("versiones distintas ⇒ advertencia honesta pero se puede continuar", async () => {
    ui();
    const file = await packFixture({
      pyodide: "999.0.0",
      sklearn: RUNTIME_VERSIONS.sklearn,
      python: "3.14.2",
    });
    uploadModelFile(JSON.stringify(file));

    await waitFor(() =>
      expect(screen.getByText(/versiones distintas/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/pyodide 999.0.0/)).toBeInTheDocument();
    expect(screen.getByText("Usar este modelo")).toBeInTheDocument();
  });

  it("payload manipulado ⇒ rechazo claro SIN tocar el payload", async () => {
    const { onImport } = ui();
    const file = await packFixture();
    file.payload = btoa("payload-manipulado");
    uploadModelFile(JSON.stringify(file));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(
      /no coincide con su manifiesto/,
    );
    expect(
      screen.getByText(/Solo carga archivos .probeta.json/),
    ).toBeInTheDocument();
    expect(onImport).not.toHaveBeenCalled();
  });

  it("un archivo de una tarea que esta versión no abre la NOMBRA (ADR 014 §3, AU-S6-02)", async () => {
    // S7 (cambio esperado): varias categorías ya se abre (D3 cumplida). Agrupar
    // se abre con su pantalla; una tarea que esta versión ni conoce se nombra
    // tal como viene.
    for (const [task, named] of [
      ["agrupar", "agrupar"],
      ["serie-tiempo", "serie-tiempo"],
    ] as const) {
      const { onImport } = ui();
      const file = await packFixture();
      (file.manifest as { task?: string }).task = task;
      uploadModelFile(JSON.stringify(file));
      await waitFor(() =>
        expect(screen.getByRole("alert")).toBeInTheDocument(),
      );
      expect(screen.getByRole("alert")).toHaveTextContent(
        `Ese archivo declara un modelo de Probeta para «${named}», un tipo de tarea que esta versión no abre.`,
      );
      expect(screen.getByRole("alert")).not.toHaveTextContent(
        /no parece un modelo/,
      );
      expect(onImport).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it("S7: un archivo de varias categorías se abre y su resumen dice cuántas, sin «clase positiva»", async () => {
    const fixture = (name: string) =>
      JSON.parse(
        readFileSync(resolve(process.cwd(), "tests/fixtures", name), "utf8"),
      ) as unknown;
    const file = await packModelFile({
      datasetName: "planes-suscripcion.csv",
      result: assembleMulticlassResult(
        fixture("contrato/train-result-multiclase.json") as MulticlassPipelineResult,
        [],
      ),
      exported: fixture("contrato/export-result-multiclase.json") as ExportResult,
    });
    const { onImport } = ui();
    uploadModelFile(JSON.stringify(file));
    await waitFor(() =>
      expect(
        screen.getByText("Clasifica «plan» en 5 categorías"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/Exactitud balanceada en prueba: 0\.54/),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/clase positiva/);
    fireEvent.click(screen.getByRole("button", { name: /Usar este modelo/ }));
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  it("archivo ajeno ⇒ 'no parece un modelo exportado por Probeta'", async () => {
    const { onImport } = ui();
    uploadModelFile('{"cualquier": "cosa"}');

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(
      /no parece un modelo exportado por Probeta/,
    );
    expect(onImport).not.toHaveBeenCalled();
  });
});
