// Hooks de estado: narración a demanda (route con fetch mockeado) + máquina de
// estados del experimento (Worker stub) — pago de la deuda S1 de cobertura de
// la capa UI. El consentimiento persistente desapareció en el gate ⭐ S4: el
// consentimiento ES la pulsación del botón (ADR-006 enmendado).
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { I18nProvider } from "@/i18n/provider";
import { downloadTextFile } from "@/lib/files";
import { recordLeagueRun } from "@/lib/observability";
import type { NarrateResponse } from "@/lib/ia/schemas";
import {
  RUNTIME_VERSIONS,
  packModelFile,
  validateModelFile,
} from "@/lib/model-file";
import { useExperiment } from "@/lib/useExperiment";
import { useNarration } from "@/lib/useNarration";
import type { ExperimentResult, PipelinePayload } from "@/workers/protocol";
import type { Metrics } from "@/engine/verdict";
import { leagueFields, memberFit, pipelineResult } from "./factories";

// La descarga real (Blob + anchor) se prueba en files.test.ts; aquí solo
// importa QUE el hook la dispare con el archivo empaquetado correcto.
vi.mock("@/lib/files", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/files")>();
  return { ...actual, downloadTextFile: vi.fn() };
});

// El breadcrumb de la liga: se afirma QUÉ registra (solo metadatos), no Sentry.
vi.mock("@/lib/observability", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/observability")>();
  return { ...actual, recordLeagueRun: vi.fn() };
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

describe("useNarration", () => {
  const input = {
    result: experimentResult(),
    target: "convirtio",
    cols: 7,
  };

  it("por defecto NADA viaja: plantilla presente, IA en idle, cero fetch", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { result } = renderHook(() => useNarration(input), { wrapper });
    expect(result.current.ai.kind).toBe("idle");
    expect(result.current.template.length).toBeGreaterThan(20);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("al pedirla: loading → verified cuando el route verifica", async () => {
    const response: NarrateResponse = {
      status: "verified",
      narrative: "Narrativa verificada de prueba con x.",
      grader: { accuracy: 5, completeness: 4, clarity: 5 },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(response), { status: 200 }),
    );
    const { result } = renderHook(() => useNarration(input), { wrapper });

    act(() => result.current.requestNarration());
    expect(result.current.ai.kind).toBe("loading");
    await waitFor(() => expect(result.current.ai.kind).toBe("verified"));
    // La plantilla sigue ahí: los dos textos conviven, no se reemplazan.
    expect(result.current.template.length).toBeGreaterThan(20);
  });

  it("fallo del route ⇒ estado failed con razón (la plantilla nunca se pierde)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useNarration(input), { wrapper });

    act(() => result.current.requestNarration());
    await waitFor(() => expect(result.current.ai.kind).toBe("failed"));
    if (result.current.ai.kind === "failed") {
      expect(result.current.ai.reason).toBe("provider-error");
    }
    expect(result.current.template.length).toBeGreaterThan(20);
  });

  it("volver a pedirla tras un fallo re-pide (el botón nunca queda muerto)", async () => {
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
    const { result } = renderHook(() => useNarration(input), { wrapper });

    act(() => result.current.requestNarration());
    await waitFor(() => expect(result.current.ai.kind).toBe("failed"));

    act(() => result.current.requestNarration());
    expect(result.current.ai.kind).toBe("loading");
    await waitFor(() => expect(result.current.ai.kind).toBe("verified"));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("R8: si el resultado cambia (elección manual), la narración verificada vuelve a reposo", async () => {
    const response: NarrateResponse = {
      status: "verified",
      narrative: "Narrativa verificada del ganador con x.",
      grader: { accuracy: 5, completeness: 4, clarity: 5 },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(response), { status: 200 }),
    );
    const winner = experimentResult();
    const { result, rerender } = renderHook(
      ({ res }: { res: ExperimentResult }) =>
        useNarration({ ...input, result: res }),
      { wrapper, initialProps: { res: winner } },
    );
    act(() => result.current.requestNarration());
    await waitFor(() => expect(result.current.ai.kind).toBe("verified"));

    rerender({
      res: {
        ...winner,
        modelName: "logistic",
        selection: { ...winner.selection, by: "user" },
      },
    });
    await waitFor(() => expect(result.current.ai.kind).toBe("idle"));
    expect(result.current.template.length).toBeGreaterThan(20);
  });
});

describe("useExperiment", () => {
  class FakeWorker {
    static last: FakeWorker | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: { message: string }) => void) | null = null;
    posted: Array<{ id: number; type: string; payload?: unknown }> = [];
    terminated = false;
    constructor() {
      FakeWorker.last = this;
    }
    postMessage(message: { id: number; type: string; payload?: unknown }) {
      this.posted.push(message);
    }
    terminate() {
      this.terminated = true;
    }
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

  // S5: el FakeWorker responde una liga coherente con lo que el hook envió (el
  // lector del contrato rechaza una liga que no sea el roster enviado).
  const respondTo = (posted: { payload?: unknown }) =>
    pipelineResult(posted.payload as PipelinePayload);

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
    expect(result.current.state.dataset?.targetTasks.y?.task).toBe("binaria");

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
          result: respondTo(worker.posted[0]!),
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

  it("liga sin ningún «ok» ⇒ error franco «league-empty», no el genérico (AU-S5-23)", () => {
    const { result } = renderHook(() => useExperiment());
    act(() => result.current.loadCsv(CSV, "test.csv"));
    act(() => result.current.run("y"));
    const worker = FakeWorker.last!;
    act(() => {
      worker.onmessage?.({
        data: {
          id: worker.posted[0]!.id,
          type: "error",
          message:
            "Traceback (most recent call last):\nRuntimeError: league-empty\n",
        },
      } as MessageEvent);
    });
    expect(result.current.state.phase).toBe("error");
    expect(result.current.state.error?.kind).toBe("league-empty");
  });

  // --- S5: el plan E1 + E2 al elegir el objetivo (AU-S5-09) -------------------

  it("selectTarget: binaria ⇒ reparto; varias categorías ⇒ sin reparto ni bloqueo; muy pocas filas ⇒ bloqueo", () => {
    const multi = [
      "x,cat,y,grupo",
      ...Array.from(
        { length: 12 },
        (_, i) => `${i},${i % 2 ? "a" : "b"},${i % 2},${"pqr"[i % 3]}`,
      ),
    ].join("\n");
    const { result } = renderHook(() => useExperiment());
    act(() => result.current.loadCsv(multi, "multi.csv"));
    act(() => result.current.selectTarget("y"));
    expect(result.current.state.plan?.routing).not.toBeNull();
    expect(result.current.state.plan?.blocked).toBeNull();

    act(() => result.current.selectTarget("grupo"));
    expect(result.current.state.plan?.task.task).toBe("multiclase");
    expect(result.current.state.plan?.routing).toBeNull();
    expect(result.current.state.plan?.blocked).toBeNull();

    const tiny = ["x,y", "1,0", "2,0", "3,0", "4,0", "5,0", "6,1"].join("\n");
    act(() => result.current.loadCsv(tiny, "tiny.csv"));
    act(() => result.current.selectTarget("y"));
    expect(result.current.state.plan?.task.task).toBe("binaria");
    expect(result.current.state.plan?.blocked).toBe("too-few-rows");
  });

  // --- S5: el lector del contrato en producción ------------------------------

  it("S5: una liga que no es el roster enviado se rechaza («contract», nombra el campo)", () => {
    const { result } = renderHook(() => useExperiment());
    act(() => result.current.loadCsv(CSV, "test.csv"));
    act(() => result.current.run("y"));
    const worker = FakeWorker.last!;
    const posted = worker.posted[0]!;
    const forged = respondTo(posted);
    forged.league = [...forged.league].reverse();
    act(() => {
      worker.onmessage?.({
        data: {
          id: posted.id,
          type: "result",
          command: "train",
          result: forged,
        },
      } as MessageEvent);
    });
    expect(result.current.state.phase).toBe("error");
    expect(result.current.state.error).toEqual({
      kind: "contract",
      message: "league",
    });
    expect(result.current.state.result).toBeNull();
  });

  it("S5: Python rechaza el payload (contract:<campo>) ⇒ error «contract» con ese campo", () => {
    const { result } = renderHook(() => useExperiment());
    act(() => result.current.loadCsv(CSV, "test.csv"));
    act(() => result.current.run("y"));
    const worker = FakeWorker.last!;
    act(() => {
      worker.onmessage?.({
        data: {
          id: worker.posted[0]!.id,
          type: "error",
          message:
            "Traceback (most recent call last):\nValueError: contract:roster",
        },
      } as MessageEvent);
    });
    expect(result.current.state.error).toEqual({
      kind: "contract",
      message: "payload.roster",
    });
  });

  it("S5: el progreso modelo a modelo llega validado al estado; uno que no cuadra se ignora", () => {
    const { result } = renderHook(() => useExperiment());
    act(() => result.current.loadCsv(CSV, "test.csv"));
    act(() => result.current.run("y"));
    const worker = FakeWorker.last!;
    const id = worker.posted[0]!.id;
    const progress = (detail: unknown) =>
      act(() => {
        worker.onmessage?.({
          data: { id, type: "progress", stage: "training", detail },
        } as MessageEvent);
      });
    progress({ phase: "cv", member: "hgb", index: 2, total: 9 });
    expect(result.current.state.progressDetail).toEqual({
      phase: "cv",
      member: "hgb",
      index: 2,
      total: 9,
    });
    progress({ phase: "cv", member: "no_existe", index: 3, total: 9 });
    expect(result.current.state.progressDetail?.member).toBe("hgb");
    // Al llegar el resultado, el detalle se limpia.
    act(() => {
      worker.onmessage?.({
        data: {
          id,
          type: "result",
          command: "train",
          result: respondTo(worker.posted[0]!),
        },
      } as MessageEvent);
    });
    expect(result.current.state.progressDetail).toBeNull();
    expect(result.current.state.phase).toBe("results");
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
          result: respondTo(worker.posted[0]!),
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

  // --- S5: el Nivel 2 (D5 + U3) y su cancelación (R1) -----------------------

  const SNAPSHOT = {
    payload_b64: btoa("modelo-del-nivel-1"),
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
  };

  const reply = (
    worker: FakeWorker,
    index: number,
    data: Record<string, unknown>,
  ) =>
    act(() => {
      worker.onmessage?.({
        data: { id: worker.posted[index]!.id, ...data },
      } as MessageEvent);
    });

  /** Resultados del Nivel 1 → pide el Nivel 2 con MLP forzada → instantánea. */
  function startLevel2(withSnapshot = true) {
    const rendered = trainToResults();
    const worker = FakeWorker.last!;
    act(() => rendered.result.current.runLevel2(["mlp"]));
    if (withSnapshot) {
      reply(worker, 1, {
        type: "result",
        command: "export-model",
        result: SNAPSHOT,
      });
    }
    return { ...rendered, worker };
  }

  it("Nivel 2: primero la instantánea, DESPUÉS la unión con el forzado; al terminar la liga crece", () => {
    const { result, worker } = startLevel2(false);
    const level1 = result.current.state.result!;
    expect(result.current.state.phase).toBe("running");
    expect(result.current.state.level2.status).toBe("running");
    // R1: lo primero que viaja es la instantánea del modelo vigente.
    expect(worker.posted[1]).toMatchObject({ type: "export-model" });
    expect(worker.posted).toHaveLength(2);

    reply(worker, 1, {
      type: "result",
      command: "export-model",
      result: SNAPSHOT,
    });
    const train = worker.posted[2]!;
    expect(train.type).toBe("train");
    const roster = (train.payload as PipelinePayload).roster;
    expect(roster).toContain("mlp");
    expect(roster).toEqual(
      expect.arrayContaining(level1.league.map((r) => r.name)),
    );

    reply(worker, 2, {
      type: "result",
      command: "train",
      result: respondTo(train),
    });
    const state = result.current.state;
    expect(state.phase).toBe("results");
    expect(state.level2).toEqual({ status: "idle" });
    expect(state.forced).toEqual(["mlp"]);
    expect(state.result!.league.map((r) => r.name)).toContain("mlp");
    expect(state.routing!.placements.find((p) => p.id === "mlp")).toMatchObject(
      { level: 2, reason: "forced" },
    );
  });

  it("cancelar a media liga: termina el worker, crea otro y restaura la instantánea del Nivel 1", () => {
    const { result, worker } = startLevel2();
    const level1 = result.current.state.result!;
    act(() => result.current.cancelLevel2());

    expect(worker.terminated).toBe(true);
    const fresh = FakeWorker.last!;
    expect(fresh).not.toBe(worker);
    expect(fresh.posted[0]).toMatchObject({
      type: "import-model",
      payload: {
        payload_b64: SNAPSHOT.payload_b64,
        expected_schema: SNAPSHOT.schema,
      },
    });
    const state = result.current.state;
    expect(state.phase).toBe("results");
    expect(state.result).toBe(level1);
    expect(state.forced).toEqual([]);
    expect(state.level2).toEqual({ status: "cancelled" });
    // Usar y exportar esperan a que el modelo vuelva.
    expect(state.modelReady).toBe(false);

    reply(fresh, 0, {
      type: "result",
      command: "import-model",
      result: { ok: true },
    });
    expect(result.current.state.modelReady).toBe(true);
  });

  it("cancelar ANTES de la instantánea: no se termina nada y el modelo sigue listo", () => {
    const { result, worker } = startLevel2(false);
    act(() => result.current.cancelLevel2());
    expect(worker.terminated).toBe(false);
    expect(FakeWorker.last).toBe(worker);
    expect(result.current.state.modelReady).toBe(true);
    expect(result.current.state.level2).toEqual({ status: "cancelled" });
    // La instantánea que llega tarde se ignora: el Nivel 2 no arranca.
    reply(worker, 1, {
      type: "result",
      command: "export-model",
      result: SNAPSHOT,
    });
    expect(worker.posted).toHaveLength(2);
    expect(result.current.state.phase).toBe("results");
  });

  it("si el Nivel 2 falla en Python vuelve el Nivel 1 (restaurado), no la pantalla de error", () => {
    const { result, worker } = startLevel2();
    reply(worker, 2, { type: "error", message: "MemoryError" });
    const state = result.current.state;
    expect(state.phase).toBe("results");
    expect(state.level2).toEqual({ status: "failed" });
    expect(worker.posted[3]).toMatchObject({ type: "import-model" });
    expect(state.modelReady).toBe(false);
  });

  it("si el worker MUERE en el Nivel 2, el nuevo restaura la instantánea", () => {
    const { result, worker } = startLevel2();
    act(() => worker.onerror?.({ message: "out of memory" }));
    const fresh = FakeWorker.last!;
    expect(fresh).not.toBe(worker);
    expect(fresh.posted[0]).toMatchObject({ type: "import-model" });
    expect(result.current.state.phase).toBe("results");
    expect(result.current.state.level2).toEqual({ status: "failed" });
  });

  it("si muere ANTES de la instantánea, se dice que el modelo no se pudo recuperar", () => {
    const { result, worker } = startLevel2(false);
    act(() => worker.onerror?.({ message: "out of memory" }));
    expect(result.current.state.phase).toBe("results");
    expect(result.current.state.level2).toEqual({ status: "restore-failed" });
    expect(result.current.state.modelReady).toBe(false);
  });

  it("si la restauración falla: restore-failed y el modelo NO queda listo", () => {
    const { result } = startLevel2();
    act(() => result.current.cancelLevel2());
    const fresh = FakeWorker.last!;
    reply(fresh, 0, { type: "error", message: "unpickle boom" });
    expect(result.current.state.level2).toEqual({ status: "restore-failed" });
    expect(result.current.state.modelReady).toBe(false);
  });

  it("R15: reset con cómputo en vuelo corta el worker (el experimento nuevo no espera detrás)", () => {
    const { result, worker } = startLevel2();
    act(() => result.current.reset());
    expect(worker.terminated).toBe(true);
    expect(FakeWorker.last).not.toBe(worker);
    expect(result.current.state.phase).toBe("empty");
  });

  it("reset sin nada en vuelo NO reinicia el worker (Pyodide sigue cargado)", () => {
    const { result } = trainToResults();
    const worker = FakeWorker.last!;
    act(() => result.current.reset());
    expect(worker.terminated).toBe(false);
    expect(FakeWorker.last).toBe(worker);
  });

  // --- S5 (U1): la elección manual en el hook (AU-S5-09) ----------------------

  /** Resultados del Nivel 1 → «Elegir» un miembro que NO es el ganador. */
  function chooseOther() {
    const rendered = trainToResults();
    const worker = FakeWorker.last!;
    const trained = respondTo(worker.posted[0]!);
    const member = trained.league.find((r) => r.name !== trained.winner)!.name;
    act(() => rendered.result.current.chooseMember(member));
    return { ...rendered, worker, trained, member };
  }

  it("chooseMember: postea fit-member SIN liga; el modelo espera; al volver habla del elegido", () => {
    const { result, worker, trained, member } = chooseOther();
    const posted = worker.posted[1]!;
    expect(posted.type).toBe("fit-member");
    const payload = posted.payload as Record<string, unknown>;
    expect(payload.member).toBe(member);
    expect(payload).not.toHaveProperty("roster");
    expect(payload).not.toHaveProperty("cv_k");
    expect(result.current.state.choice).toEqual({ status: "fitting", member });
    expect(result.current.state.modelReady).toBe(false);

    reply(worker, 1, {
      type: "result",
      command: "fit-member",
      result: memberFit(trained, member),
    });
    const state = result.current.state;
    expect(state.result?.modelName).toBe(member);
    expect(state.result?.selection.by).toBe("user");
    expect(state.modelReady).toBe(true);
    expect(state.choice).toEqual({ status: "idle" });
  });

  it("chooseMember: si Python falla, el modelo anterior sigue activo y se dice", () => {
    const { result, worker, member } = chooseOther();
    const before = result.current.state.result;
    reply(worker, 1, { type: "error", message: "RuntimeError: boom" });
    expect(result.current.state.choice).toEqual({ status: "error", member });
    expect(result.current.state.modelReady).toBe(true);
    expect(result.current.state.result).toBe(before);
    expect(result.current.state.phase).toBe("results");
  });

  it("chooseMember: un ajuste de OTRO miembro se rechaza por contrato", () => {
    const { result, worker, trained } = chooseOther();
    reply(worker, 1, {
      type: "result",
      command: "fit-member",
      result: memberFit(trained, trained.winner),
    });
    expect(result.current.state.phase).toBe("error");
    expect(result.current.state.error).toEqual({
      kind: "contract",
      message: "model_name",
    });
  });

  // --- S5 (AU-S5-19): el breadcrumb de una liga cancelada ----------------------

  it("cancelar registra los competidores de la corrida CANCELADA (la unión), no los del Nivel 1", () => {
    vi.mocked(recordLeagueRun).mockClear();
    const { result, worker } = startLevel2();
    const union = (worker.posted[2]!.payload as PipelinePayload).roster;
    expect(union.length).toBeGreaterThan(
      result.current.state.result!.league.length,
    );
    act(() => result.current.cancelLevel2());
    expect(vi.mocked(recordLeagueRun).mock.lastCall?.[0]).toMatchObject({
      competitors: union.length,
      level: 2,
      cancelled: true,
    });
  });

  it("cancelar antes de la instantánea registra la unión que iba a correr", () => {
    vi.mocked(recordLeagueRun).mockClear();
    const { result } = startLevel2(false);
    const level1Count = result.current.state.result!.league.length;
    act(() => result.current.cancelLevel2());
    const call = vi.mocked(recordLeagueRun).mock.lastCall?.[0];
    expect(call?.cancelled).toBe(true);
    expect(call?.competitors).toBeGreaterThan(level1Count);
  });
});
