// Hooks de estado del S2: consentimiento (localStorage) + narración (route con
// fetch mockeado) + máquina de estados del experimento (Worker stub) — pago de
// la deuda S1 de cobertura de la capa UI.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { I18nProvider } from "@/i18n/provider";
import type { NarrateResponse } from "@/lib/ia/schemas";
import { CONSENT_STORAGE_KEY, useConsent } from "@/lib/useConsent";
import { useExperiment } from "@/lib/useExperiment";
import { useNarration } from "@/lib/useNarration";
import type { ExperimentResult, PipelineResult } from "@/workers/protocol";
import type { Metrics } from "@/engine/verdict";

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
    expect(result.current.kind).toBe("template");
    if (result.current.kind === "template") {
      expect(result.current.reason).toBe("no-consent");
      expect(result.current.text.length).toBeGreaterThan(20);
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
    expect(result.current.kind).toBe("loading");
    await waitFor(() => expect(result.current.kind).toBe("verified"));
  });

  it("fallo del route ⇒ plantilla con razón (nunca sección vacía)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const { result } = renderHook(
      () => useNarration({ ...input, consent: true }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.kind).toBe("template"));
    if (result.current.kind === "template") {
      expect(result.current.reason).toBe("provider-error");
    }
  });
});

describe("useExperiment", () => {
  class FakeWorker {
    static last: FakeWorker | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    posted: Array<{ id: number; payload: unknown }> = [];
    constructor() {
      FakeWorker.last = this;
    }
    postMessage(message: { id: number; payload: unknown }) {
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
});
