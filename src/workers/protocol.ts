// Tipos compartidos entre el hilo principal (orquestación pura y testeada) y el
// runner de Pyodide (public/pyodide-runner.js), que solo entrena y devuelve
// métricas. La UI no habla WASM: lee el estado de useExperiment.
import type { LeakageFinding } from "@/engine/leakage";
import type { MemberId } from "@/engine/roster";
import type { TaskDetection, TrainTask } from "@/engine/tarea";
import type {
  MetricName,
  Metrics,
  PrimaryMetric,
  RegressionMetrics,
  Verdict,
} from "@/engine/verdict";
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
  // S4 (gate ⭐ D2): el archivo no está separado por comas — típicamente Excel en
  // configuración regional europea/latina. Se nombra el separador real.
  | "csv-semicolon"
  | "csv-tab"
  | "target-not-binary"
  // S6: se eligió estimar una cantidad pero el objetivo trae valores no numéricos.
  | "target-not-numeric"
  // S6 (D2): la columna puede ser clases o cantidad y el usuario aún no respondió.
  | "target-ambiguous"
  // S5: el objetivo tiene 2 valores para E1 pero escritos de más de una forma («1» y «1.0»).
  | "target-mixed-notation"
  | "no-features"
  // S5: la clase minoritaria de train no alcanza para 2 pliegues de validación
  // cruzada (hay que tener al menos 2 ejemplos de cada clase en train).
  | "too-few-rows"
  // S6 (AU-S6-08): al estimar una cantidad, la prueba quedaría con menos de
  // MIN_REGRESSION_TEST_ROWS filas (el texto de «too-few-rows» habla de clases).
  | "too-few-rows-quantity"
  // S5 (regla 15): el resultado del motor no tiene la forma del contrato; se
  // nombra el campo y no se muestra nada que no se pueda verificar.
  | "contract"
  // S5: ningún miembro de la liga concluyó la CV (todos «error» o «no-converge»):
  // no hay ganador defendible y reintentar no cambia nada.
  | "league-empty"
  // S4: tras el saneamiento no queda estructura modelable (todo eran IDs/constantes,
  // o no quedan filas/columnas suficientes) — irrecuperable, con reporte honesto.
  | "csv-unusable"
  | "runtime"
  // Auditoría H1: el worker murió sin responder (carga del runner fallida o
  // aborto del runtime WASM, p. ej. sin memoria) — sin esto la UI colgaba.
  | "worker-dead";

export type DatasetSummary = {
  headers: string[];
  rowCount: number;
  profiles: ColumnProfile[];
  previewRows: string[][];
  /** S5 (E1): la tarea que cada columna plantearía como objetivo, con su razón. */
  targetTasks: Record<string, TaskDetection>;
  /** Columnas que parecen fecha (aviso S1: no se usa split temporal aún). */
  dateColumns: string[];
};

// Lo que se envía al runner de Pyodide (nombres en snake_case: los consume pipeline.py).
export type PipelinePayload = {
  /** S6 (P1): la tarea viaja explícita; Python la valida y la devuelve. */
  task: TrainTask;
  headers: string[];
  rows: string[][];
  target: string;
  numeric: string[];
  categorical: string[];
  train_idx: number[];
  test_idx: number[];
  seed: number;
  // S4: la regla de métrica primaria vive SOLO en verdict.ts (pickPrimaryMetric es
  // simétrica en p↔1−p ⇒ TS la resuelve sin conocer cuál clase es la positiva de
  // Python). S5: es también el scorer de la validación cruzada — no la re-deriva.
  primary_metric: PrimaryMetric;
  /** S5 (E2): quiénes compiten, en orden de prioridad (Python no lo re-deriva). */
  roster: MemberId[];
  /** S5: pliegues de la validación cruzada (≤ minoritaria de train, ≥ 2). */
  cv_k: number;
};

/** S5 (U1): ajustar UN miembro elegido por el usuario (sin CV: ya eligió). */
export type FitMemberPayload = Omit<PipelinePayload, "roster" | "cv_k"> & {
  member: MemberId;
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

// S4: cada candidato entrenado (mismo preprocesador) con sus métricas sobre test.
// S5: derivado de la liga (filas con test); lo lista la model card («Candidatos comparados»).
export type ModelCandidate<M = Metrics> = {
  /** Clave estable e independiente de idioma; la UI la traduce por i18n. */
  name: MemberId;
  metrics: M;
};

// --- S5: la liga ------------------------------------------------------------

/** ok = compite · no-converge = puntaje visible y etiquetado, no gana solo ·
 *  error = no concluyó (solo el TIPO de error viaja: regla dura 2). */
export type MemberStatus = "ok" | "no-converge" | "error";

export type CvScore = {
  mean: number;
  /** Desviación estándar de los folds (np.std, ddof=0). */
  std: number;
  folds: number[];
};

export type LeagueRow<M = Metrics> = {
  name: MemberId;
  status: MemberStatus;
  /** null ⇔ status "error". «Sirve para elegir.» (S6: con MAE, en unidades; menor es mejor.) */
  cv: CvScore | null;
  /** Métricas en test («no sirve para elegir»); null ⇔ status "error". */
  test: M | null;
  /** CV + ajuste en train + test de ESTE miembro, en ms (calibra el Nivel 2: ver planLevel2). */
  elapsed_ms: number;
  error_type: string | null;
};

export type CvSummary = {
  k: number;
  scoring: string;
  rule: "one-se";
  /** Máximo puntaje de CV. */
  best: MemberId;
  /** Error estándar del mejor (std/√k). */
  se: number;
};

/** Progreso modelo a modelo (worker → UI): primero la CV de todos, luego el test. */
export type ProgressDetail = {
  phase: "cv" | "test";
  member: MemberId;
  /** Base 0. */
  index: number;
  total: number;
};

// Lo que devuelve pipeline.py (JSON).
export type PipelineResult = {
  /** S6: la tarea (aditivo en la binaria; el lector la coteja con la enviada). */
  task: "binaria";
  /** Las 2 clases del objetivo, orden lexicográfico (S3: esquema del modelo). */
  classes: string[];
  positive_class: string;
  positive_rate: number;
  n_train: number;
  n_test: number;
  baselines: { majority: Metrics; logistic: Metrics };
  model: Metrics;
  /** Compat S4: el miembro que `model` representa (= winner en la liga). */
  model_name: MemberId;
  /** S5: ganador de la CV por la regla de un error estándar. */
  winner: MemberId;
  /** S5: todos los que compitieron, en el orden del roster enviado. */
  league: LeagueRow[];
  cv: CvSummary;
  elapsed_ms: number;
  confusion_matrix: number[][];
  explainability: Explainability;
  preprocessing: Preprocessing;
};

export type Preprocessing = {
  numeric_medians: Record<string, number>;
  /** S4: categorías raras agrupadas por columna (min_frequency, aprendido de train). */
  rare_categories: Record<string, string[]>;
};

// --- S6: estimar una cantidad (ADR-013) ------------------------------------

/** El objetivo en TRAIN (jamás test): veredicto en unidades y formato de las
 *  predicciones. Son valores del objetivo: viven solo en el navegador (regla dura 2). */
export type TargetStats = {
  mean: number;
  std: number;
  min: number;
  max: number;
  median: number;
  /** Decimales con que el usuario escribió el objetivo (tope 6). */
  decimals: number;
};

/** Muestra determinista del test para el gráfico, ordenada por el valor real. */
export type PredVsReal = {
  real: number[];
  predicted: number[];
  /** Filas de test en total (la muestra puede ser menor: tope de despliegue). */
  n_total: number;
};

/** Cuantiles del residuo (predicho − real) sobre TODO el test. */
export type Residuals = {
  p05: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  /** Percentil 90 del error absoluto: «9 de cada 10 se equivocan menos que…». */
  abs_p90: number;
};

export type RegressionBaselines = {
  median: RegressionMetrics;
  linear: RegressionMetrics;
};

export type RegressionPipelineResult = {
  task: "numerica";
  target_stats: TargetStats;
  n_train: number;
  n_test: number;
  baselines: RegressionBaselines;
  model: RegressionMetrics;
  model_name: MemberId;
  winner: MemberId;
  league: LeagueRow<RegressionMetrics>[];
  cv: CvSummary;
  elapsed_ms: number;
  pred_vs_real: PredVsReal;
  residuals: Residuals;
  explainability: Explainability;
  preprocessing: Preprocessing;
};

export type RegressionMemberFitResult = {
  task: "numerica";
  model: RegressionMetrics;
  model_name: MemberId;
  pred_vs_real: PredVsReal;
  residuals: Residuals;
  explainability: Explainability;
  preprocessing: Preprocessing;
};

/** S5 (U1): el miembro elegido a mano, ajustado en train completo. */
export type MemberFitResult = {
  task: "binaria";
  model: Metrics;
  model_name: MemberId;
  confusion_matrix: number[][];
  explainability: Explainability;
  preprocessing: Preprocessing;
};

/** S5: cómo se eligió el modelo activo (lo registran la model card y el manifiesto). */
export type Selection<M extends PrimaryMetric = MetricName> = {
  /** "cv" = ganador de la validación cruzada · "user" = «elegido por ti» (U1). */
  by: "cv" | "user";
  cvWinner: MemberId;
  best: MemberId;
  k: number;
  metric: M;
  rule: "one-se";
  se: number;
  /** Cuántos compitieron. */
  competitors: number;
  elapsedMs: number;
};

export type BinaryResult = {
  /** S6: ausente = binaria (los resultados y archivos del S5 no la traen). */
  task?: "binaria";
  positiveClass: string;
  positiveRate: number;
  nTrain: number;
  nTest: number;
  baselines: { majority: Metrics; logistic: Metrics };
  model: Metrics;
  /** El modelo activo (el ganador de la CV o el elegido por el usuario). */
  modelName: MemberId;
  /** Los miembros de la liga con puntaje de prueba (lo lista la model card). */
  candidates: ModelCandidate[];
  /** S5: la liga completa y cómo se eligió. */
  league: LeagueRow[];
  selection: Selection;
  /** S5: n < SMALL_SAMPLE_ROWS ⇒ la CV varía mucho (aviso honesto). */
  smallSample: boolean;
  rareCategories?: Record<string, string[]>;
  confusionMatrix: number[][];
  verdict: Verdict;
  leakage: LeakageFinding[];
  explainability: Explainability;
};

/** Unidad del objetivo inferida del NOMBRE de la columna (tabla cerrada de sufijos;
 *  sin sufijo conocido no se inventa: `symbol` null y la UI dice «en las unidades de…»). */
export type TargetUnit = { symbol: string | null };

/** S6: el resultado de estimar una cantidad. El veredicto habla en unidades. */
export type RegressionResult = {
  task: "numerica";
  nTrain: number;
  nTest: number;
  targetStats: TargetStats;
  unit: TargetUnit;
  baselines: RegressionBaselines;
  model: RegressionMetrics;
  modelName: MemberId;
  candidates: ModelCandidate<RegressionMetrics>[];
  league: LeagueRow<RegressionMetrics>[];
  selection: Selection<"mae">;
  smallSample: boolean;
  rareCategories?: Record<string, string[]>;
  predVsReal: PredVsReal;
  residuals: Residuals;
  verdict: Verdict<"mae">;
  leakage: LeakageFinding[];
  explainability: Explainability;
};

export type ExperimentResult = BinaryResult | RegressionResult;

// --- Scoring + export/import (S3) ------------------------------------------
// El modelo fitted vive a nivel de módulo en pipeline.py (_MODEL) dentro del
// worker; `score`/`export-model` operan sobre él e `import-model` lo repuebla.

/** Esquema del modelo: qué columnas espera y qué clases aprendió. */
export type BinaryModelSchema = {
  numeric: string[];
  categorical: string[];
  target: string;
  classes: string[];
  positive_class: string;
  /** S6: aditivo; ausente en los archivos del S5 (= binaria). */
  task?: "binaria";
};

/** S6: un modelo que estima una cantidad no tiene clases; trae su objetivo en train. */
export type RegressionModelSchema = {
  numeric: string[];
  categorical: string[];
  target: string;
  task: "numerica";
  target_stats: TargetStats;
};

export type ModelSchema = BinaryModelSchema | RegressionModelSchema;

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

export type BinaryScoreResult = {
  /** S6: aditivo (Python lo emite desde el S6). */
  task?: "binaria";
  /** Etiqueta ORIGINAL de la clase por fila (jamás 0/1). */
  predictions: string[];
  /** Probabilidad de la clase positiva por fila; null si el modelo no la da
   *  (S5: ridge y SVM lineal deciden la clase sin probabilidad — no se inventa). */
  probabilities: number[] | null;
  positive_class: string;
  novelty: NoveltyReport;
};

/** S6: la cantidad estimada por fila, en las unidades del objetivo. */
export type RegressionScoreResult = {
  task: "numerica";
  predictions: number[];
  /** Siempre null: estimar no da una probabilidad (no se inventa). */
  probabilities: null;
  novelty: NoveltyReport;
};

export type ScoreResult = BinaryScoreResult | RegressionScoreResult;

export type RuntimeVersions = {
  pyodide: string;
  sklearn: string;
  python: string;
  /** S5: opcionales en el manifiesto (archivos S3/S4 no los traen); el runtime
   *  actual los emite siempre (contract.ts los exige en el export). */
  xgboost?: string;
  lightgbm?: string;
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
  | { id: number; type: "fit-member"; payload: FitMemberPayload }
  | { id: number; type: "score"; payload: ScorePayload }
  | { id: number; type: "export-model" }
  | {
      id: number;
      type: "import-model";
      // expected_schema = el esquema del MANIFIESTO (validado en TS): la UI
      // gatea columnas con él, pero quien puntúa es el esquema del pickle.
      // pipeline.py los coteja y rechaza el archivo si no coinciden.
      payload: { payload_b64: string; expected_schema: ModelSchema };
    };

export type RunnerCommand = RunnerRequest["type"];

export type RunnerResponse =
  | {
      id: number;
      type: "progress";
      stage: ProgressStage;
      /** S5: modelo a modelo durante `training` (validado con contract.ts). */
      detail?: unknown;
    }
  // Los resultados llegan como `unknown`: contract.ts los valida ANTES de usarlos
  // (el lado que LEE del contrato Python → TS, en producción).
  | { id: number; type: "result"; command: "train"; result: unknown }
  | { id: number; type: "result"; command: "fit-member"; result: unknown }
  | { id: number; type: "result"; command: "score"; result: unknown }
  | {
      id: number;
      type: "result";
      command: "export-model";
      result: unknown;
    }
  | {
      id: number;
      type: "result";
      command: "import-model";
      result: ImportResult;
    }
  | { id: number; type: "error"; message: string };
