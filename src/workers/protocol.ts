// Contrato tipado de mensajes entre la UI y el worker de Pyodide. La UI no habla
// WASM directo: solo intercambia estos mensajes. Cada request lleva un `id` que
// el worker devuelve para emparejar la respuesta.
import type { LeakageFinding } from "@/engine/leakage";
import type { Metrics, Verdict } from "@/engine/verdict";
import type { ColumnProfile } from "@/lib/ds/csv";

export type WorkerRequest =
  | { id: number; type: "init" }
  | { id: number; type: "loadDataset"; csvText: string }
  | { id: number; type: "runExperiment"; targetColumn: string; seed: number };

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

export type WorkerErrorKind =
  | "csv-empty"
  | "csv-too-large"
  | "csv-too-many-rows"
  | "csv-ragged"
  | "target-not-binary"
  | "no-features"
  | "runtime";

export type ProgressStage = "loading-runtime" | "loading-packages" | "training";

export type WorkerResponse =
  | { id: number; type: "ready" }
  | { id: number; type: "progress"; stage: ProgressStage }
  | { id: number; type: "dataset"; summary: DatasetSummary }
  | { id: number; type: "result"; result: ExperimentResult }
  | {
      id: number;
      type: "error";
      error: { kind: WorkerErrorKind; message: string };
    };
