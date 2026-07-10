// Tipos compartidos entre el hilo principal (orquestación pura y testeada) y el
// runner de Pyodide (public/pyodide-runner.js), que solo entrena y devuelve
// métricas. La UI no habla WASM: lee el estado de useExperiment.
import type { LeakageFinding } from "@/engine/leakage";
import type { Metrics, Verdict } from "@/engine/verdict";
import type { ColumnProfile } from "@/lib/ds/csv";

export type ProgressStage = "loading-runtime" | "loading-packages" | "training";

export type WorkerErrorKind =
  | "csv-empty"
  | "csv-too-large"
  | "csv-too-many-rows"
  | "csv-ragged"
  | "target-not-binary"
  | "no-features"
  | "runtime";

export type DatasetSummary = {
  headers: string[];
  rowCount: number;
  profiles: ColumnProfile[];
  previewRows: string[][];
  /** Columnas elegibles como objetivo binario. */
  targetCandidates: string[];
  /** Columnas que parecen fecha (aviso S1: no se usa split temporal aún). */
  dateColumns: string[];
};

// Lo que se envía al runner de Pyodide (nombres en snake_case: los consume pipeline.py).
export type PipelinePayload = {
  headers: string[];
  rows: string[][];
  target: string;
  numeric: string[];
  categorical: string[];
  train_idx: number[];
  test_idx: number[];
  seed: number;
};

// Lo que devuelve pipeline.py (JSON).
export type PipelineResult = {
  positive_class: string;
  positive_rate: number;
  n_train: number;
  n_test: number;
  baselines: { majority: Metrics; logistic: Metrics };
  model: Metrics;
  confusion_matrix: number[][];
  preprocessing?: { numeric_medians: Record<string, number> };
};

export type ExperimentResult = {
  positiveClass: string;
  positiveRate: number;
  nTrain: number;
  nTest: number;
  baselines: { majority: Metrics; logistic: Metrics };
  model: Metrics;
  confusionMatrix: number[][];
  verdict: Verdict;
  leakage: LeakageFinding[];
};

export type RunnerRequest = { id: number; payload: PipelinePayload };

export type RunnerResponse =
  | { id: number; type: "progress"; stage: ProgressStage }
  | { id: number; type: "result"; result: PipelineResult }
  | { id: number; type: "error"; message: string };
