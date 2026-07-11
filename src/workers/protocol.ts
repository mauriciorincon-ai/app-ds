// Tipos compartidos entre el hilo principal (orquestación pura y testeada) y el
// runner de Pyodide (public/pyodide-runner.js), que solo entrena y devuelve
// métricas. La UI no habla WASM: lee el estado de useExperiment.
import type { LeakageFinding } from "@/engine/leakage";
import type { Metrics, Verdict } from "@/engine/verdict";
import type { ColumnProfile } from "@/lib/ds/csv";

export type ProgressStage =
  | "loading-runtime"
  | "loading-packages"
  | "training"
  | "scoring"
  | "exporting"
  | "importing";

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

// Explicabilidad global (S2): permutation importance sobre TEST, calculada por
// pipeline.py (método según ADR-004). Ordenada por importancia descendente.
export type FeatureImportance = {
  name: string;
  kind: "numeric" | "categorical";
  importance: number;
  std: number;
  /** Solo numéricas; las categóricas no tienen dirección única → null. */
  direction: "positive" | "negative" | null;
};

export type Explainability = {
  method: "permutation_importance";
  scoring: string;
  n_repeats: number;
  features: FeatureImportance[];
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
  explainability: Explainability;
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
  explainability: Explainability;
};

// --- Scoring + export/import (S3) ------------------------------------------
// El modelo fitted vive a nivel de módulo en pipeline.py (_MODEL) dentro del
// worker; `score`/`export-model` operan sobre él e `import-model` lo repuebla.

/** Esquema del modelo: qué columnas espera y qué clases aprendió. */
export type ModelSchema = {
  numeric: string[];
  categorical: string[];
  target: string;
  classes: string[];
  positive_class: string;
};

/** Perfil de TRAIN (nunca de test) — base del reporte honesto de novedad.
 *  min/max null ⇔ la columna quedó sin valores numéricos en train. */
export type TrainingProfile = {
  numeric: Record<string, { min: number | null; max: number | null }>;
  categorical: Record<string, string[]>;
};

// CSV nuevo a puntuar: SOLO las columnas del modelo, en el orden del esquema
// (el chequeo de esquema en TS bloquea faltantes ANTES de llegar aquí).
export type ScorePayload = {
  headers: string[];
  rows: string[][];
};

/** Conteo de novedad por columna (solo columnas con count > 0, orden del esquema). */
export type NoveltyColumn = {
  column: string;
  kind: "numeric" | "categorical";
  count: number;
};

export type NoveltyReport = {
  columns: NoveltyColumn[];
  /** Filas con al menos un valor que el modelo nunca vio en train. */
  affected_rows: number;
  n_rows: number;
};

export type ScoreResult = {
  /** Etiqueta ORIGINAL de la clase por fila (jamás 0/1). */
  predictions: string[];
  /** Probabilidad de la clase positiva por fila. */
  probabilities: number[];
  positive_class: string;
  novelty: NoveltyReport;
};

export type RuntimeVersions = {
  pyodide: string;
  sklearn: string;
  python: string;
};

export type ExportResult = {
  /** pipeline fitted + esquema + perfil: pickle → zlib → base64 (ADR-007). */
  payload_b64: string;
  versions: RuntimeVersions;
  schema: ModelSchema;
  training_profile: TrainingProfile;
};

export type ImportResult = { ok: true };

export type RunnerRequest =
  | { id: number; type: "train"; payload: PipelinePayload }
  | { id: number; type: "score"; payload: ScorePayload }
  | { id: number; type: "export-model" }
  | { id: number; type: "import-model"; payload: { payload_b64: string } };

export type RunnerCommand = RunnerRequest["type"];

export type RunnerResponse =
  | { id: number; type: "progress"; stage: ProgressStage }
  | { id: number; type: "result"; command: "train"; result: PipelineResult }
  | { id: number; type: "result"; command: "score"; result: ScoreResult }
  | {
      id: number;
      type: "result";
      command: "export-model";
      result: ExportResult;
    }
  | {
      id: number;
      type: "result";
      command: "import-model";
      result: ImportResult;
    }
  | { id: number; type: "error"; message: string };
