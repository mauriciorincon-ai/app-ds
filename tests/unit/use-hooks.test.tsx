// Hooks de estado del S2: consentimiento (localStorage) + narración (route con
// fetch mockeado) + máquina de estados del experimento (Worker stub) — pago de
// la deuda S1 de cobertura de la capa UI.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { I18nProvider } from "@/i18n/provider";
import { downloadTextFile } from "@/lib/files";
import type { NarrateResponse } from "@/lib/ia/schemas";
import {
  RUNTIME_VERSIONS,
  packModelFile,
  validateModelFile,
} from "@/lib/model-file";
import { CONSENT_STORAGE_KEY, useConsent } from "@/lib/useConsent";
import { useExperiment } from "@/lib/useExperiment";
import { useNarration } from "@/lib/useNarration";
import type { ExperimentResult, PipelineResult } from "@/workers/protocol";
import type { Metrics } from "@/engine/verdict";

// La descarga real (Blob + anchor) se prueba en files.test.ts; aquí solo
// importa QUE el hook la dispare con el archivo empaquetado correcto.
vi.mock("@/lib/files", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/files")>();
  return { ...actual, downloadTextFile: vi.fn() };
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider>{children}</I18nProvider>
);

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

function experimentResult(): ExperimentResult {
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
          name: "x",
          kind: "numeric",
          importance: 0.2,
          std: 0.01,
          direction: "positive",
        },
      ],
    },
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useConsent", () => {
  it("default OFF; el cambio persiste en localStorage", () => {
    const { result } = renderHook(() => useConsent());
    expect(result.current.consent).toBe(false);
    act(() => result.current.setConsent(true));
    expect(result.current.consent).toBe(true);
    expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBe("true");
  });
});

describe("useNarration", () => {
  const input = {
    result: experimentResult(),
    target: "convirtio",
    cols: 7,
  };

  it("sin consentimiento: plantilla local y CERO fetch", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { result } = renderHook(
      () => useNarration({ ...input, consent: false }),
      { wrapper },
    );
    const narration = result.current.narration;
    expect(narration.kind).toBe("template");
    if (narration.kind === "template") {
      expect(narration.reason).toBe("no-consent");
      expect(narration.text.length).toBeGreaterThan(20);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("con consentimiento: loading → verified cuando el route verifica", async () => {
    const response: NarrateResponse = {
      status: "verified",
      narrative: "Narrativa verificada de prueba con x.",
      grader: { accuracy: 5, completeness: 4, clarity: 5 },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(response), { status: 200 }),
    );
    const { result } = renderHook(
      () => useNarration({ ...input, consent: true }),
      { wrapper },
    );
    expect(result.current.narration.kind).toBe("loading");
    await waitFor(() => expect(result.current.narration.kind).toBe("verified"));
  });

  it("fallo del route ⇒ plantilla con razón (nunca sección vacía)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const { result } = renderHook(
      () => useNarration({ ...input, consent: true }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.narration.kind).toBe("template"));
    if (result.current.narration.kind === "template") {
      expect(result.current.narration.reason).toBe("provider-error");
    }
  });

  it("retryNarration tras un fallo vuelve a pedir (el toggle nunca queda muerto)", async () => {
    const verified: NarrateResponse = {
      status: "verified",
      narrative: "Narrativa verificada tras el reintento con x.",
      grader: { accuracy: 5, completeness: 4, clarity: 5 },
    };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(verified), { status: 200 }),
      );
    const { result } = renderHook(
      () => useNarration({ ...input, consent: true }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.narration.kind).toBe("template"));

    act(() => result.current.retryNarration());
    expect(result.current.narration.kind).toBe("loading");
    await waitFor(() => expect(result.current.narration.kind).toBe("verified"));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe("useExperiment", () => {
  class FakeWorker {
    static last: FakeWorker | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    posted: Array<{ id: number; type: string; payload?: unknown }> = [];
    constructor() {
      FakeWorker.last = this;
    }
    postMessage(message: { id: number; type: string; payload?: unknown }) {
      this.posted.push(message);
    }
    terminate() {}
  }

  const CSV = [
    "x,cat,y",
    "1,a,0",
    "2,a,1",
    "3,b,0",
    "4,b,1",
    "5,a,0",
    "6,a,1",
    "7,b,0",
    "8,b,1",
  ].join("\n");

  function pipelineResult(): PipelineResult {
    return {
      classes: ["0", "1"],
      positive_class: "1",
      // Desbalanceado ⇒ métrica primaria AUC (0.8 vs 0.6 ⇒ supera).
      positive_rate: 0.3,
      n_train: 6,
      n_test: 2,
      baselines: {
        majority: metrics({ auc: 0.5 }),
        logistic: metrics({ auc: 0.6 }),
      },
      model: metrics({ auc: 0.8 }),
      model_name: "forest",
      candidates: [{ name: "forest", metrics: metrics({ auc: 0.8 }) }],
      confusion_matrix: [
        [1, 0],
        [0, 1],
      ],
      explainability: {
        method: "permutation_importance",
        scoring: "roc_auc",
        n_repeats: 10,
        features: [
          {
            name: "x",
            kind: "numeric",
            importance: 0.2,
            std: 0.01,
            direction: "positive",
          },
        ],
      },
    };
  }

  beforeEach(() => {
    vi.stubGlobal("Worker", FakeWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("flujo completo: cargar → configurar → correr → resultados (con runMeta)", () => {
    const { result } = renderHook(() => useExperiment());
    expect(result.current.state.phase).toBe("empty");

    act(() => result.current.loadCsv(CSV, "test.csv"));
    expect(result.current.state.phase).toBe("configuring");
    expect(result.current.state.dataset?.targetCandidates).toContain("y");

    act(() => result.current.run("y"));
    expect(result.current.state.phase).toBe("running");
    expect(result.current.state.runMeta).toEqual({
      target: "y",
      numericFeatures: 1,
      categoricalFeatures: 1,
      seed: 42,
    });
    const worker = FakeWorker.last!;
    expect(worker.posted).toHaveLength(1);

    act(() => {
      worker.onmessage?.({
        data: {
          id: worker.posted[0]!.id,
          type: "result",
          command: "train",
          result: pipelineResult(),
        },
      } as MessageEvent);
    });
    expect(result.current.state.phase).toBe("results");
    expect(result.current.state.result?.verdict.level).toBe("beats");
    expect(result.current.state.result?.explainability.features[0]?.name).toBe(
      "x",
    );
  });

  it("CSV inválido ⇒ error honesto; reset vuelve al inicio", () => {
    const { result } = renderHook(() => useExperiment());
    act(() => result.current.loadCsv("", "vacio.csv"));
    expect(result.current.state.phase).toBe("error");
    expect(result.current.state.error?.kind).toBe("csv-empty");
    act(() => result.current.reset());
    expect(result.current.state.phase).toBe("empty");
  });

  it("error del runner ⇒ pantalla de error con tipo 'runtime'", () => {
    const { result } = renderHook(() => useExperiment());
    act(() => result.current.loadCsv(CSV, "test.csv"));
    act(() => result.current.run("y"));
    const worker = FakeWorker.last!;
    act(() => {
      worker.onmessage?.({
        data: { id: worker.posted[0]!.id, type: "error", message: "boom" },
      } as MessageEvent);
    });
    expect(result.current.state.phase).toBe("error");
    expect(result.current.state.error?.kind).toBe("runtime");
  });

  // --- S3: usar el modelo (scoring + export/import) -------------------------

  type Hook = ReturnType<
    typeof renderHook<ReturnType<typeof useExperiment>, unknown>
  >;

  /** Carga + entrena + responde el worker: deja el hook en "results". */
  function trainToResults(): Hook {
    const rendered = renderHook(() => useExperiment());
    act(() => rendered.result.current.loadCsv(CSV, "test.csv"));
    act(() => rendered.result.current.run("y"));
    const worker = FakeWorker.last!;
    act(() => {
      worker.onmessage?.({
        data: {
          id: worker.posted[0]!.id,
          type: "result",
          command: "train",
          result: pipelineResult(),
        },
      } as MessageEvent);
    });
    return rendered;
  }

  it("goToScoring ⇄ backToResults conservan el resultado y el modelo", () => {
    const { result } = trainToResults();
    expect(result.current.state.modelReady).toBe(true);
    expect(result.current.state.modelMeta).toMatchObject({
      source: "trained",
      datasetName: "test.csv",
      schema: {
        numeric: ["x"],
        categorical: ["cat"],
        target: "y",
        classes: ["0", "1"],
        positive_class: "1",
      },
    });

    act(() => result.current.goToScoring());
    expect(result.current.state.phase).toBe("scoring");
    expect(result.current.state.result).not.toBeNull();

    act(() => result.current.backToResults());
    expect(result.current.state.phase).toBe("results");
    expect(result.current.state.result?.verdict.level).toBe("beats");
  });

  it("scoreCsv con columna faltante ⇒ bloqueo local SIN postear al worker", () => {
    const { result } = trainToResults();
    const worker = FakeWorker.last!;
    act(() => result.current.goToScoring());

    act(() => result.current.scoreCsv("x,otra\n1,z", "nuevo.csv"));
    const scoring = result.current.state.scoring;
    expect(scoring.status).toBe("blocked");
    if (scoring.status === "blocked") {
      expect(scoring.check.missing).toEqual(["cat"]);
      expect(scoring.fileName).toBe("nuevo.csv");
    }
    // El bloqueo es TS puro: el único mensaje sigue siendo el train.
    expect(worker.posted).toHaveLength(1);
  });

  it("scoreCsv válido ⇒ postea SOLO columnas del modelo en orden del esquema", () => {
    const { result } = trainToResults();
    const worker = FakeWorker.last!;
    act(() => result.current.goToScoring());

    // Columnas desordenadas + extra: el payload va en orden del esquema.
    act(() =>
      result.current.scoreCsv("extra,cat,x\nfoo,a,7\nbar,b,3", "nuevo.csv"),
    );
    expect(result.current.state.scoring.status).toBe("running");
    expect(worker.posted).toHaveLength(2);
    expect(worker.posted[1]).toMatchObject({
      type: "score",
      payload: {
        headers: ["x", "cat"],
        rows: [
          ["7", "a"],
          ["3", "b"],
        ],
      },
    });

    act(() => {
      worker.onmessage?.({
        data: {
          id: worker.posted[1]!.id,
          type: "result",
          command: "score",
          result: {
            predictions: ["1", "0"],
            probabilities: [0.9, 0.2],
            positive_class: "1",
            novelty: { columns: [], affected_rows: 0, n_rows: 2 },
          },
        },
      } as MessageEvent);
    });
    const scoring = result.current.state.scoring;
    expect(scoring.status).toBe("scored");
    if (scoring.status === "scored") {
      expect(scoring.score.predictions).toEqual(["1", "0"]);
      expect(scoring.check.extra).toEqual(["extra"]);
    }
  });

  it("error del worker al puntuar ⇒ scoring.error runtime (la fase no se cae)", () => {
    const { result } = trainToResults();
    const worker = FakeWorker.last!;
    act(() => result.current.goToScoring());
    act(() => result.current.scoreCsv("x,cat\n1,a", "nuevo.csv"));
    act(() => {
      worker.onmessage?.({
        data: { id: worker.posted[1]!.id, type: "error", message: "boom" },
      } as MessageEvent);
    });
    expect(result.current.state.phase).toBe("scoring");
    expect(result.current.state.scoring).toEqual({
      status: "error",
      kind: "runtime",
    });
  });

  it("exportModel ⇒ postea export-model y al resolver descarga el archivo", async () => {
    const { result } = trainToResults();
    const worker = FakeWorker.last!;

    act(() => result.current.exportModel());
    expect(result.current.state.exportState).toBe("exporting");
    expect(worker.posted[1]).toMatchObject({ type: "export-model" });

    act(() => {
      worker.onmessage?.({
        data: {
          id: worker.posted[1]!.id,
          type: "result",
          command: "export-model",
          result: {
            payload_b64: btoa("payload"),
            versions: { ...RUNTIME_VERSIONS, python: "3.14.2" },
            schema: {
              numeric: ["x"],
              categorical: ["cat"],
              target: "y",
              classes: ["0", "1"],
              positive_class: "1",
            },
            training_profile: {
              numeric: { x: { min: 1, max: 8 } },
              categorical: { cat: ["a", "b"] },
            },
          },
        },
      } as MessageEvent);
    });

    await waitFor(() => expect(downloadTextFile).toHaveBeenCalledOnce());
    const [fileName, content, mime] =
      vi.mocked(downloadTextFile).mock.calls[0]!;
    expect(fileName).toMatch(/^modelo-test-.*\.probeta\.json$/);
    expect(mime).toBe("application/json");
    // El archivo descargado valida (manifiesto + hash) — roundtrip honesto.
    const validation = await validateModelFile(content);
    expect(validation.ok).toBe(true);
    expect(result.current.state.exportState).toBe("idle");
  });

  it("activateImportedModel ⇒ scoring con modelReady false → true al resolver", async () => {
    const { result } = renderHook(() => useExperiment());
    const worker = FakeWorker.last!;
    const file = await packModelFile({
      datasetName: "viejo.csv",
      result: experimentResult(),
      exported: {
        payload_b64: btoa("payload"),
        versions: { ...RUNTIME_VERSIONS, python: "3.14.2" },
        schema: {
          numeric: ["x"],
          categorical: ["cat"],
          target: "y",
          classes: ["0", "1"],
          positive_class: "1",
        },
        training_profile: {
          numeric: { x: { min: 1, max: 8 } },
          categorical: { cat: ["a", "b"] },
        },
      },
    });

    act(() => result.current.activateImportedModel(file));
    expect(result.current.state.phase).toBe("scoring");
    expect(result.current.state.modelReady).toBe(false);
    expect(result.current.state.modelMeta?.source).toBe("imported");
    expect(result.current.state.modelMeta?.manifest).not.toBeNull();
    expect(worker.posted[0]).toMatchObject({
      type: "import-model",
      payload: { payload_b64: file.payload },
    });

    act(() => {
      worker.onmessage?.({
        data: {
          id: worker.posted[0]!.id,
          type: "result",
          command: "import-model",
          result: { ok: true },
        },
      } as MessageEvent);
    });
    expect(result.current.state.modelReady).toBe(true);
  });

  it("fallo del import en el worker ⇒ scoring.error import-failed", async () => {
    const { result } = renderHook(() => useExperiment());
    const worker = FakeWorker.last!;
    const file = await packModelFile({
      datasetName: "viejo.csv",
      result: experimentResult(),
      exported: {
        payload_b64: btoa("payload"),
        versions: { ...RUNTIME_VERSIONS, python: "3.14.2" },
        schema: {
          numeric: ["x"],
          categorical: [],
          target: "y",
          classes: ["0", "1"],
          positive_class: "1",
        },
        training_profile: {
          numeric: { x: { min: 1, max: 8 } },
          categorical: {},
        },
      },
    });

    act(() => result.current.activateImportedModel(file));
    act(() => {
      worker.onmessage?.({
        data: {
          id: worker.posted[0]!.id,
          type: "error",
          message: "unpickle boom",
        },
      } as MessageEvent);
    });
    expect(result.current.state.phase).toBe("scoring");
    expect(result.current.state.scoring).toEqual({
      status: "error",
      kind: "import-failed",
    });
    expect(result.current.state.modelReady).toBe(false);
  });
});
