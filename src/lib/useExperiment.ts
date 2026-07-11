"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LeakageFinding } from "@/engine/leakage";
import { parseCsvWithLimits, type CsvTable } from "@/lib/ds/csv";
import {
  checkSchema,
  modelFeatures,
  type SchemaCheck,
} from "@/lib/ds/schema-check";
import { assembleResult, prepareRun, summarizeDataset } from "@/lib/experiment";
import { downloadTextFile } from "@/lib/files";
import {
  modelFileName,
  packModelFile,
  type ModelFile,
  type ModelManifest,
} from "@/lib/model-file";
import {
  reportExperimentError,
  reportExportError,
  reportImportError,
  reportScoringError,
} from "@/lib/observability";
import type {
  DatasetSummary,
  ExperimentResult,
  ExportResult,
  ModelSchema,
  ProgressStage,
  RunnerResponse,
  ScorePayload,
  ScoreResult,
  WorkerErrorKind,
} from "@/workers/protocol";

export type ExperimentPhase =
  "empty" | "configuring" | "running" | "results" | "error" | "scoring";

/** Metadatos del run que consumen la narración y la model card (S2). */
export type RunMeta = {
  target: string;
  numericFeatures: number;
  categoricalFeatures: number;
  seed: number;
};

/** De dónde salió el modelo activo (S3): entrenado aquí o importado. */
export type ModelSource = "trained" | "imported";

export type ModelMeta = {
  source: ModelSource;
  schema: ModelSchema;
  datasetName: string;
  /** Solo `imported`: manifiesto validado, para el resumen honesto. */
  manifest: ModelManifest | null;
};

export type ScoringErrorKind =
  | "csv-empty"
  | "csv-too-large"
  | "csv-too-many-rows"
  | "csv-ragged"
  | "runtime"
  | "import-failed";

/** Sub-estado de la pantalla "Usar el modelo" (los 4 estados de la orden). */
export type ScoringState =
  | { status: "idle" }
  | { status: "blocked"; check: SchemaCheck; fileName: string }
  | { status: "running"; progress: ProgressStage | null }
  | {
      status: "scored";
      check: SchemaCheck;
      fileName: string;
      table: CsvTable;
      score: ScoreResult;
    }
  | { status: "error"; kind: ScoringErrorKind };

export type ExportState = "idle" | "exporting" | "error";

export type ExperimentState = {
  phase: ExperimentPhase;
  datasetName: string | null;
  dataset: DatasetSummary | null;
  progress: ProgressStage | null;
  result: ExperimentResult | null;
  runMeta: RunMeta | null;
  error: { kind: WorkerErrorKind; message: string } | null;
  // S3 — el modelo se usa:
  modelMeta: ModelMeta | null;
  /** false mientras un import está deserializando en el worker. */
  modelReady: boolean;
  scoring: ScoringState;
  exportState: ExportState;
};

const INITIAL: ExperimentState = {
  phase: "empty",
  datasetName: null,
  dataset: null,
  progress: null,
  result: null,
  runMeta: null,
  error: null,
  modelMeta: null,
  modelReady: false,
  scoring: { status: "idle" },
  exportState: "idle",
};

const SEED = 42;

const CSV_ERROR: Record<string, WorkerErrorKind & ScoringErrorKind> = {
  empty: "csv-empty",
  "too-large": "csv-too-large",
  "too-many-rows": "csv-too-many-rows",
  ragged: "csv-ragged",
};

// Qué esperaba cada mensaje en vuelo. Mapa por id (no un único pending): un
// mensaje tardío de un comando viejo no puede pisar el estado del actual.
type Pending =
  | {
      kind: "train";
      leakage: LeakageFinding[];
      schema: Pick<ModelSchema, "numeric" | "categorical" | "target">;
    }
  | { kind: "score"; check: SchemaCheck; fileName: string; table: CsvTable }
  | { kind: "export-model"; datasetName: string; result: ExperimentResult }
  | { kind: "import-model" };

// Gestiona el runner de Pyodide y la máquina de estados del experimento. El
// parseo/perfilado/split/veredicto/fuga/esquema/manifiesto corren aquí (puro,
// testeado); el runner solo entrena, puntúa y (de)serializa el modelo. El
// worker vive toda la sesión: el _MODEL de pipeline.py sobrevive entre fases.
export function useExperiment() {
  const workerRef = useRef<Worker | null>(null);
  const nextId = useRef(0);
  const tableRef = useRef<CsvTable | null>(null);
  const pendingRef = useRef(new Map<number, Pending>());
  // Espejos para leer en callbacks sin closures obsoletas (patrón tableRef).
  const modelRef = useRef<ModelMeta | null>(null);
  const resultRef = useRef<ExperimentResult | null>(null);
  const datasetNameRef = useRef<string | null>(null);
  const [state, setState] = useState<ExperimentState>(INITIAL);

  useEffect(() => {
    // Module worker real servido desde public/ (Pyodide exige module worker).
    const worker = new Worker("/pyodide-runner.js", { type: "module" });
    workerRef.current = worker;

    const finishExport = async (
      pending: Extract<Pending, { kind: "export-model" }>,
      exported: ExportResult,
    ) => {
      try {
        const file = await packModelFile({
          datasetName: pending.datasetName,
          result: pending.result,
          exported,
        });
        downloadTextFile(
          modelFileName(pending.datasetName),
          JSON.stringify(file, null, 2),
          "application/json",
        );
        setState((s) => ({ ...s, exportState: "idle" }));
      } catch {
        reportExportError("pack");
        setState((s) => ({ ...s, exportState: "error" }));
      }
    };

    worker.onmessage = (event: MessageEvent<RunnerResponse>) => {
      const message = event.data;
      const pending = pendingRef.current.get(message.id);
      if (!pending) return;

      if (message.type === "progress") {
        if (pending.kind === "train") {
          setState((s) => ({
            ...s,
            phase: "running",
            progress: message.stage,
          }));
        } else if (pending.kind === "score") {
          setState((s) => ({
            ...s,
            scoring: { status: "running", progress: message.stage },
          }));
        } else if (pending.kind === "import-model") {
          setState((s) => ({ ...s, progress: message.stage }));
        }
        return;
      }

      pendingRef.current.delete(message.id);

      if (message.type === "error") {
        console.error("[experiment] runtime", message.message);
        if (pending.kind === "train") {
          const table = tableRef.current;
          reportExperimentError(
            "runtime",
            table
              ? { rows: table.rows.length, cols: table.headers.length }
              : undefined,
          );
          setState((s) => ({
            ...s,
            phase: "error",
            error: { kind: "runtime", message: message.message },
          }));
        } else if (pending.kind === "score") {
          reportScoringError("runtime", {
            rows: pending.table.rows.length,
            cols: pending.table.headers.length,
          });
          setState((s) => ({
            ...s,
            scoring: { status: "error", kind: "runtime" },
          }));
        } else if (pending.kind === "export-model") {
          reportExportError("runtime");
          setState((s) => ({ ...s, exportState: "error" }));
        } else {
          reportImportError("runtime");
          setState((s) => ({
            ...s,
            progress: null,
            scoring: { status: "error", kind: "import-failed" },
          }));
        }
        return;
      }

      // result — cada comando actualiza SOLO su tajada del estado.
      if (message.command === "train" && pending.kind === "train") {
        const assembled = assembleResult(message.result, pending.leakage);
        const meta: ModelMeta = {
          source: "trained",
          schema: {
            ...pending.schema,
            classes: message.result.classes,
            positive_class: message.result.positive_class,
          },
          datasetName: datasetNameRef.current ?? "dataset",
          manifest: null,
        };
        modelRef.current = meta;
        resultRef.current = assembled;
        setState((s) => ({
          ...s,
          phase: "results",
          result: assembled,
          modelMeta: meta,
          modelReady: true,
        }));
      } else if (message.command === "score" && pending.kind === "score") {
        setState((s) => ({
          ...s,
          scoring: {
            status: "scored",
            check: pending.check,
            fileName: pending.fileName,
            table: pending.table,
            score: message.result,
          },
        }));
      } else if (
        message.command === "export-model" &&
        pending.kind === "export-model"
      ) {
        void finishExport(pending, message.result);
      } else if (
        message.command === "import-model" &&
        pending.kind === "import-model"
      ) {
        setState((s) => ({ ...s, progress: null, modelReady: true }));
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const loadCsv = useCallback((csvText: string, name: string) => {
    const parsed = parseCsvWithLimits(csvText);
    if (!parsed.ok) {
      setState({
        ...INITIAL,
        phase: "error",
        datasetName: name,
        error: {
          kind: CSV_ERROR[parsed.error.kind],
          message: parsed.error.kind,
        },
      });
      return;
    }
    tableRef.current = parsed.table;
    datasetNameRef.current = name;
    setState({
      ...INITIAL,
      phase: "configuring",
      datasetName: name,
      dataset: summarizeDataset(parsed.table),
    });
  }, []);

  const run = useCallback((targetColumn: string) => {
    const table = tableRef.current;
    if (!table) return;

    const prepared = prepareRun(table, targetColumn, SEED);
    if (!prepared.ok) {
      setState((s) => ({
        ...s,
        phase: "error",
        error: { kind: prepared.error, message: prepared.error },
      }));
      return;
    }

    const id = nextId.current++;
    pendingRef.current.set(id, {
      kind: "train",
      leakage: prepared.leakage,
      schema: {
        numeric: prepared.payload.numeric,
        categorical: prepared.payload.categorical,
        target: targetColumn,
      },
    });
    modelRef.current = null;
    resultRef.current = null;
    setState((s) => ({
      ...s,
      phase: "running",
      progress: null,
      error: null,
      result: null,
      modelMeta: null,
      modelReady: false,
      scoring: { status: "idle" },
      exportState: "idle",
      runMeta: {
        target: targetColumn,
        numericFeatures: prepared.payload.numeric.length,
        categoricalFeatures: prepared.payload.categorical.length,
        seed: SEED,
      },
    }));
    workerRef.current?.postMessage({
      id,
      type: "train",
      payload: prepared.payload,
    });
  }, []);

  // --- S3: usar el modelo ---------------------------------------------------

  const goToScoring = useCallback(() => {
    setState((s) => (s.modelMeta ? { ...s, phase: "scoring" } : s));
  }, []);

  const backToResults = useCallback(() => {
    setState((s) => (s.result ? { ...s, phase: "results" } : s));
  }, []);

  /** Vuelve al estado vacío de la pantalla de scoring (probar otro CSV). */
  const resetScoring = useCallback(() => {
    setState((s) => ({ ...s, scoring: { status: "idle" } }));
  }, []);

  const scoreCsv = useCallback((csvText: string, fileName: string) => {
    const meta = modelRef.current;
    if (!meta) return;

    const parsed = parseCsvWithLimits(csvText);
    if (!parsed.ok) {
      const kind = CSV_ERROR[parsed.error.kind];
      reportScoringError(kind);
      setState((s) => ({ ...s, scoring: { status: "error", kind } }));
      return;
    }

    const check = checkSchema(parsed.table.headers, meta.schema);
    if (!check.ok) {
      // Bloqueo honesto en TS puro: no se postea NADA al worker.
      setState((s) => ({
        ...s,
        scoring: { status: "blocked", check, fileName },
      }));
      return;
    }

    // Solo las columnas del modelo, en el orden del esquema (Python no adivina).
    const features = modelFeatures(meta.schema);
    const indices = features.map((f) => parsed.table.headers.indexOf(f));
    const payload: ScorePayload = {
      headers: features,
      rows: parsed.table.rows.map((row) => indices.map((i) => row[i]!)),
    };
    const id = nextId.current++;
    pendingRef.current.set(id, {
      kind: "score",
      check,
      fileName,
      table: parsed.table,
    });
    setState((s) => ({
      ...s,
      scoring: { status: "running", progress: null },
    }));
    workerRef.current?.postMessage({ id, type: "score", payload });
  }, []);

  const exportModel = useCallback(() => {
    const result = resultRef.current;
    const datasetName = datasetNameRef.current;
    if (!result || !datasetName) return;
    const id = nextId.current++;
    pendingRef.current.set(id, { kind: "export-model", datasetName, result });
    setState((s) => ({ ...s, exportState: "exporting" }));
    workerRef.current?.postMessage({ id, type: "export-model" });
  }, []);

  /** Activa un modelo importado (el archivo YA pasó validateModelFile). */
  const activateImportedModel = useCallback((file: ModelFile) => {
    const meta: ModelMeta = {
      source: "imported",
      schema: file.manifest.schema,
      datasetName: file.manifest.dataset.name,
      manifest: file.manifest,
    };
    modelRef.current = meta;
    resultRef.current = null;
    datasetNameRef.current = file.manifest.dataset.name;
    tableRef.current = null;
    const id = nextId.current++;
    pendingRef.current.set(id, { kind: "import-model" });
    setState({
      ...INITIAL,
      phase: "scoring",
      datasetName: file.manifest.dataset.name,
      modelMeta: meta,
      modelReady: false,
    });
    workerRef.current?.postMessage({
      id,
      type: "import-model",
      payload: { payload_b64: file.payload },
    });
  }, []);

  const reset = useCallback(() => {
    tableRef.current = null;
    modelRef.current = null;
    resultRef.current = null;
    datasetNameRef.current = null;
    pendingRef.current.clear();
    setState(INITIAL);
  }, []);

  return {
    state,
    loadCsv,
    run,
    reset,
    goToScoring,
    backToResults,
    resetScoring,
    scoreCsv,
    exportModel,
    activateImportedModel,
  };
}
