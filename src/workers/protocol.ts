// Tipos compartidos entre el hilo principal (orquestación pura y testeada) y el
// runner de Pyodide (public/pyodide-runner.js), que solo entrena y devuelve
// métricas. La UI no habla WASM: lee el estado de useExperiment.
import type { SpecLimpieza } from "@/engine/limpieza-plan";
import type { LeakageFinding } from "@/engine/leakage";
import type { MemberId } from "@/engine/roster";
import type {
  SupervisedTask,
  TaskDetection,
  TrainTask,
} from "@/engine/tarea";
import type {
  ClusterReadingLevel,
  MetricName,
  Metrics,
  MulticlassMetrics,
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
  // S18 (ADR 025): un Excel que no se puede leer, con su motivo.
  | "xlsx-protegido"
  | "xlsx-antiguo"
  | "xlsx-danado"
  // S7: la columna no sirve como objetivo (constante, vacía o con demasiadas
  // categorías); el texto viejo («exactamente dos categorías») caducó.
  | "target-not-usable"
  // S6: se eligió estimar una cantidad pero el objetivo trae valores no numéricos.
  | "target-not-numeric"
  // S6 (D2): la columna puede ser clases o cantidad y el usuario aún no respondió.
  | "target-ambiguous"
  // S5: el objetivo tiene 2 valores para E1 pero escritos de más de una forma («1» y «1.0»).
  // S7: lo mismo con varias categorías (E1 cuenta K números; el texto, más).
  | "target-mixed-notation"
  | "no-features"
  // S5: la clase minoritaria de train no alcanza para 2 pliegues de validación
  // cruzada (hay que tener al menos 2 ejemplos de cada clase en train).
  | "too-few-rows"
  // S7 (P4): con varias categorías, la clase MÁS CHICA de train no alcanza para 2
  // pliegues. La clase se nombra en pantalla (dato del usuario), jamás en logs.
  | "too-few-rows-per-class"
  // S6 (AU-S6-08): al estimar una cantidad, la prueba quedaría con menos de
  // MIN_REGRESSION_TEST_ROWS filas (el texto de «too-few-rows» habla de clases).
  | "too-few-rows-quantity"
  // S7: al agrupar, tan pocas filas que la estabilidad no puede medir ni dos grupos
  // (cada re-muestreo necesita al menos k + 1 filas).
  | "too-few-rows-cluster"
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
  /** Columnas que parecen fecha (aviso S1: no entran al análisis; la app no parte por tiempo). */
  dateColumns: string[];
};

// Lo que se envía al runner de Pyodide (nombres en snake_case: los consume pipeline.py).
export type PipelinePayload = {
  /** S6 (P1): la tarea viaja explícita; Python la valida y la devuelve. S7:
   *  agrupar tiene su propio payload (ClusterPayload). */
  task: SupervisedTask;
  headers: string[];
  rows: string[][];
  target: string;
  numeric: string[];
  categorical: string[];
  /** S18: el plan de limpieza aprobado (solo nombres de columnas); ausente = el preprocesador de siempre. */
  limpieza?: SpecLimpieza;
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
  /** S7: SOLO con varias categorías — las clases en orden (el de la codificación
   *  0..K−1). Python las coteja con los datos; en otra tarea, su presencia se rechaza. */
  classes?: string[];
};

/**
 * S12 (Protocolo DS, etapa 7): la liga SOLO con el entrenamiento sellado en la etapa 6. No hay
 * `train_idx` ni `test_idx`: `rows` son las filas de entrenamiento y los pliegues son posiciones
 * dentro de ellas (los arma src/engine/protocolo/pliegues.ts según el esquema). Python rechaza el
 * payload nombrando `test_idx` o `train_idx` si llegan.
 */
export type ValidationPayload = {
  task: SupervisedTask;
  headers: string[];
  rows: string[][];
  target: string;
  numeric: string[];
  categorical: string[];
  seed: number;
  primary_metric: PrimaryMetric;
  roster: MemberId[];
  folds: { train: number[]; val: number[] }[];
  /** Binaria: el valor que la etapa 2 dijo que significa «hay que actuar». */
  positive?: string;
  /** Varias clases: las clases en orden (el de la codificación 0..K−1). */
  classes?: string[];
  /** Cuántas permutaciones: el presupuesto de tiempo entre lo que tarda la CV del ganador. */
  permutations: { budget_ms: number; min: number; max: number };
};

/** Las predicciones del ganador en la validación de un pliegue, alineadas con sus índices. */
export type ValidationFold = {
  /** Binaria: 0/1 (1 = «hay que actuar»). Varias clases: el nombre. Un número: el valor. */
  pred: (number | string)[];
  /** Binaria: la probabilidad de «hay que actuar»; null si el modelo no la da. */
  proba: number[] | null;
};

export type ValidationResult = {
  task: SupervisedTask;
  classes?: string[];
  positive_class?: string;
  n_rows: number;
  /** La liga sin prueba: `test` es siempre null. */
  league: LeagueRow<never>[];
  winner: MemberId;
  cv: CvSummary;
  oof: ValidationFold[];
  /** Los puntajes de CV del ganador con las etiquetas barajadas, y el observado. */
  permutation: {
    n: number;
    failed: number;
    scores: number[];
    observed: number;
  };
  elapsed_ms: number;
};

/**
 * S13 (Protocolo DS, etapa 8): la prueba, abierta una vez. El ÚNICO payload con filas de la prueba: TS
 * lo arma solo si el sello que da la tabla hoy es el sellado en la etapa 6 (src/lib/protocolo/prueba8.ts).
 * `train` son TODAS las filas de entrenamiento y `test` las de la prueba, con solo las columnas en «usar»
 * y el objetivo (`headers`). Python valida un conjunto cerrado de claves y devuelve el sello y la huella
 * tal cual, para que TS compruebe el eco; no puede rehacer el sello (su receta vive en TS).
 */
export type TestPayload = {
  task: SupervisedTask;
  headers: string[];
  train: string[][];
  test: string[][];
  target: string;
  numeric: string[];
  categorical: string[];
  seed: number;
  winner: MemberId;
  primary_metric: PrimaryMetric;
  /** La huella del archivo y el sello de la prueba (64 hex): su eco vuelve en el resultado. */
  huella: string;
  sello: string;
  positive?: string;
  classes?: string[];
};

/**
 * S19 (ADR 027): el envío de la etapa 8 SIN la prueba. `fit-winner` vuelve a ajustar al ganador del Protocolo solo con el
 * entrenamiento y lo deja retenido (para el simulador de la etapa 9 y el archivo de la 10); una clave `test` rompe el
 * contrato en Python nombrándola, así que la prueba no puede volver a abrirse por este camino.
 */
export type FitWinnerPayload = Omit<TestPayload, "test">;

export type TestResult = {
  task: SupervisedTask;
  classes?: string[];
  positive_class?: string;
  winner: MemberId;
  n_train: number;
  n_test: number;
  /** Por fila de la prueba, en su orden. Binaria: 0/1 (1 = «hay que actuar»); varias: el nombre. */
  pred: (number | string)[];
  /** Binaria: P(«hay que actuar»); varias: la de la clase predicha; null si el modelo no la da. */
  proba: number[] | null;
  /** La métrica de la liga, medida en la prueba (para el optimismo de la selección). */
  metric: { name: PrimaryMetric; value: number };
  huella: string;
  sello: string;
  elapsed_ms: number;
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

/** Progreso modelo a modelo (worker → UI): primero la CV de todos, luego el test.
 *  S7: al agrupar, el barrido de cada agrupador y la lectura del ganador. */
export type ProgressDetail = {
  /** S12: «perm» = una permutación de la etapa 7 (member = el ganador). */
  phase: "cv" | "test" | "cluster" | "stability" | "perm";
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

// --- S7: clasificar en varias categorías (ADR 015) ---------------------------

/** Métricas de una clase sobre TEST (en el orden de `classes`). */
export type PerClassMetrics = {
  precision: number;
  recall: number;
  f1: number;
  /** Filas de prueba de esa clase. */
  support: number;
};

export type MulticlassBaselines = {
  majority: MulticlassMetrics;
  logistic: MulticlassMetrics;
};

export type MulticlassPipelineResult = {
  task: "multiclase";
  /** Las K clases, en orden (las que envió TS). */
  classes: string[];
  n_train: number;
  n_test: number;
  baselines: MulticlassBaselines;
  model: MulticlassMetrics;
  model_name: MemberId;
  winner: MemberId;
  league: LeagueRow<MulticlassMetrics>[];
  cv: CvSummary;
  elapsed_ms: number;
  /** K×K: filas = clase real, columnas = predicha. */
  confusion_matrix: number[][];
  per_class: PerClassMetrics[];
  explainability: Explainability;
  preprocessing: Preprocessing;
};

export type MulticlassMemberFitResult = {
  task: "multiclase";
  model: MulticlassMetrics;
  model_name: MemberId;
  confusion_matrix: number[][];
  per_class: PerClassMetrics[];
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

/** S7: el resultado de clasificar en varias categorías. Las clases, la matriz y las
 *  métricas por clase son datos del usuario: viven solo en memoria (P13). */
export type MulticlassResult = {
  task: "multiclase";
  classes: string[];
  nTrain: number;
  nTest: number;
  baselines: MulticlassBaselines;
  model: MulticlassMetrics;
  modelName: MemberId;
  candidates: ModelCandidate<MulticlassMetrics>[];
  league: LeagueRow<MulticlassMetrics>[];
  selection: Selection<"balanced_accuracy">;
  smallSample: boolean;
  rareCategories?: Record<string, string[]>;
  confusionMatrix: number[][];
  perClass: PerClassMetrics[];
  verdict: Verdict<"balanced_accuracy">;
  leakage: LeakageFinding[];
  explainability: Explainability;
};

// --- S7: agrupar sin objetivo (ADR 016) -------------------------------------

/** TS → Python: SIN objetivo ni partición (el preprocesador se ajusta sobre todas
 *  las filas: no hay prueba). Python rechaza `target`, `train_idx`, `test_idx`,
 *  `primary_metric`, `cv_k` y `classes` nombrándolos. */
export type ClusterPayload = {
  task: "agrupar";
  headers: string[];
  rows: string[][];
  /** Columnas utilizables (las que describen los perfiles). */
  numeric: string[];
  categorical: string[];
  /** S18: el plan de limpieza aprobado (solo nombres de columnas). */
  limpieza?: SpecLimpieza;
  /** Qué columnas forman la distancia: «numeric» con ≥ CLUSTER_MIN_NUMERIC
   *  numéricas (las categóricas solo describen), «all» si no. TS decide. */
  distance: ClusterDistance;
  seed: number;
  roster: MemberId[];
  /** k candidatos, [mín, máx] (máx acotado por las filas). */
  k_range: [number, number];
  stability_runs: number;
};

export type ClusterDistance = "numeric" | "all";

export type ClusterFitMemberPayload = Omit<ClusterPayload, "roster"> & {
  member: MemberId;
};

/** ok = vota · no-converge = visible, se puede elegir, no vota · no-structure =
 *  no encontró dos grupos (HDBSCAN todo ruido) · error = solo el TIPO viaja. */
export type ClusterMemberStatus =
  "ok" | "no-converge" | "no-structure" | "error";

/** Cómo eligió su k: la silueta, el BIC o la densidad (HDBSCAN no elige k). */
export type ClusterKBy = "silhouette" | "bic" | "density";

export type ClusterMemberRow = {
  name: MemberId;
  status: ClusterMemberStatus;
  error_type: string | null;
  /** Grupos encontrados (sin el ruido); null si falló. */
  k: number | null;
  k_by: ClusterKBy;
  /** K-Means y Agglomerative: la silueta de cada k candidato, en orden. */
  silhouette_by_k: { k: number; silhouette: number | null }[] | null;
  /** GMM: el BIC de cada k que se pudo ajustar, en orden. */
  bic_by_k: { k: number; bic: number }[] | null;
  /** Sobre la muestra compartida, sin el ruido. */
  silhouette: number | null;
  /** Solo HDBSCAN: la parte de las filas «fuera de todo grupo». */
  noise_share: number | null;
  /** Puntaje comparable: silueta × (1 − cuota de ruido). null ⇔ no vota. */
  score: number | null;
  /** Filas por grupo, del más grande al más chico (+ el ruido = n_rows). */
  sizes: number[] | null;
  /** Solo Agglomerative con más de AGGLO_MAX_ROWS filas: el tamaño de la muestra. */
  sample_rows: number | null;
  elapsed_ms: number;
};

export type ClusterStability = {
  ari_mean: number;
  ari_min: number;
  runs: number;
  fraction: number;
};

export type ClusterReadingResult = {
  level: ClusterReadingLevel;
  /** El puntaje del retenido y el del mismo agrupador sobre datos sin estructura. */
  score: number;
  null_score: number;
  /** score − null_score. */
  gap: number;
  stability: ClusterStability;
};

/** Un grupo en las unidades del usuario. Medias, modas y columnas son datos del
 *  usuario: viven solo en memoria (P13, regla dura 2). */
export type GroupProfile = {
  group: number;
  size: number;
  share: number;
  numeric: Record<string, number | null>;
  categorical: Record<string, { mode: string; share: number } | null>;
};

export type ClusterProfiles = {
  groups: GroupProfile[];
  noise: { size: number; share: number } | null;
  /** Las columnas que más separan los grupos: η² (numéricas) o V de Cramér. */
  separating: {
    column: string;
    kind: "numeric" | "categorical";
    strength: number;
  }[];
};

export type ClusterAssignMethod =
  "nearest-centroid" | "gaussian" | "centroid-radius";

export type ClusterAssignment = {
  method: ClusterAssignMethod;
  /** Qué parte de las filas del ajuste reproduce la regla (P12). */
  train_agreement: number;
  /** Agglomerative en modo muestra: el tamaño de la muestra. */
  sample_rows: number | null;
};

export type ClusterPipelineResult = {
  task: "agrupar";
  n_rows: number;
  distance: ClusterDistance;
  /** Filas de la muestra con que se mide la silueta (todas, hasta SILHOUETTE_SAMPLE). */
  silhouette_sample: number;
  k_range: [number, number];
  league: ClusterMemberRow[];
  /** El k en que coinciden más agrupadores que votan, y cuántos. */
  consensus: { k: number; votes: number; voters: number };
  winner: MemberId;
  model_name: MemberId;
  reading: ClusterReadingResult;
  profiles: ClusterProfiles;
  assignment: ClusterAssignment;
  preprocessing: Pick<Preprocessing, "rare_categories">;
  elapsed_ms: number;
};

export type ClusterMemberFitResult = {
  task: "agrupar";
  model_name: MemberId;
  k: number;
  score: number;
  reading: ClusterReadingResult;
  profiles: ClusterProfiles;
  assignment: ClusterAssignment;
  preprocessing: Pick<Preprocessing, "rare_categories">;
};

/** S7: el resultado de agrupar. Sin prueba, sin baseline y sin fuga (no hay
 *  objetivo): lo que sirve para creer es `reading`. Las etiquetas por fila NO
 *  están aquí (P13). */
export type ClusterResult = {
  task: "agrupar";
  nRows: number;
  distance: ClusterDistance;
  silhouetteSample: number;
  kRange: [number, number];
  modelName: MemberId;
  league: ClusterMemberRow[];
  selection: {
    /** "consensus" = el ganador por consenso · "user" = «elegido por ti». */
    by: "consensus" | "user";
    consensusWinner: MemberId;
    k: number;
    votes: number;
    voters: number;
    competitors: number;
    elapsedMs: number;
  };
  reading: ClusterReadingResult;
  profiles: ClusterProfiles;
  assignment: ClusterAssignment;
  rareCategories?: Record<string, string[]>;
  smallSample: boolean;
};

/** Los resultados de una tarea CON objetivo (veredicto, prueba, liga con CV). */
export type SupervisedResult =
  BinaryResult | MulticlassResult | RegressionResult;

export type ExperimentResult = SupervisedResult | ClusterResult;

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

/** S7: un modelo de varias categorías trae sus clases (sin «clase positiva»). */
export type MulticlassModelSchema = {
  numeric: string[];
  categorical: string[];
  target: string;
  classes: string[];
  task: "multiclase";
};

/** S7: agrupar puntúa con su regla de asignación — sin objetivo y sin filas de
 *  entrenamiento (P12). `numeric`/`categorical` son las columnas de la distancia. */
export type ClusterModelSchema = {
  numeric: string[];
  categorical: string[];
  task: "agrupar";
  groups: number;
  /** true ⇔ la regla puede dejar una fila «fuera de todo grupo» (HDBSCAN). */
  noise: boolean;
  assign: {
    method: ClusterAssignMethod;
    /** k × p, en el espacio de la distancia (escalado). */
    centroids: number[][];
    /** Solo HDBSCAN: el radio de cada grupo. */
    radii: number[] | null;
    sample_rows: number | null;
  };
};

/** El esquema de un modelo con objetivo (sus columnas y su objetivo). */
export type SupervisedSchema =
  BinaryModelSchema | MulticlassModelSchema | RegressionModelSchema;

export type ModelSchema = SupervisedSchema | ClusterModelSchema;

/** S7: lo que la app necesita del modelo ACTIVO para puntuar. Al agrupar, la regla
 *  sin sus centroides: viven en el worker (retenidos en pipeline.py) y viajan solo
 *  en el archivo exportado, así que un modelo recién entrenado no los inventa. Un
 *  esquema completo (`ClusterModelSchema`, el de un archivo importado) también lo es. */
export type ClusterScoringSchema = Omit<ClusterModelSchema, "assign"> & {
  assign: Pick<ClusterModelSchema["assign"], "method" | "sample_rows">;
};

export type ScoringSchema = SupervisedSchema | ClusterScoringSchema;

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

/**
 * S19 (ADR 027): «¿qué pasaría si?». `rows` son las filas como están (solo las columnas del modelo) y `values` la columna
 * `column` con el cambio ya aplicado (lo calcula TS en engine/simulador.ts); el worker puntúa las dos versiones.
 */
export type SimulatePayload = {
  headers: string[];
  rows: string[][];
  column: string;
  values: string[];
};

/** La predicción de unas filas y, si el modelo las da, las probabilidades completas (binaria: P(positiva); varias: K por fila). */
export type SimulatedScore = {
  pred: (string | number)[];
  proba: number[] | number[][] | null;
};

export type SimulateResult = {
  task: TrainTask;
  n: number;
  column: string;
  base: SimulatedScore;
  changed: SimulatedScore;
  /** Filas con un valor en la columna que el entrenamiento nunca vio, antes y después del cambio. */
  outside: { before: number; after: number };
  positive_class?: string;
  classes?: string[];
  elapsed_ms: number;
};

/** S19: un nodo del árbol de reglas ya en la forma que se descarga. «left» es «no» (≤ el corte, o «no es» la categoría). */
export type RuleNode =
  | { leaf: true; pred: string | number; n: number }
  | {
      leaf: false;
      column: string;
      kind: "numeric";
      threshold: number;
      left: RuleNode;
      right: RuleNode;
    }
  | {
      leaf: false;
      column: string;
      kind: "categorical";
      category: string;
      left: RuleNode;
      right: RuleNode;
    };

/**
 * S20: las filas con que se arma el árbol cuando las pone el usuario (el archivo que cargó, o el que sube en la etapa 10). `truth`
 * pide medir contra el objetivo del archivo si lo trae; el Protocolo nunca lo pide ni envía esa columna.
 */
export type RulesPayload = {
  headers: string[];
  rows: string[][];
  truth?: boolean;
};

export type RulesResult = {
  task: TrainTask;
  /** S20: de dónde salieron las filas del árbol: las de entrenamiento del modelo, o las que subió el usuario. */
  source: "training" | "uploaded";
  tree: RuleNode;
  /** La mediana de entrenamiento con que se llenan los vacíos de cada numérica. */
  numeric: { column: string; median: number }[];
  /** Cuánto coinciden las reglas con el modelo en filas que el árbol no vio (acuerdo, o R² al estimar). */
  fidelity: { metric: "agreement" | "r2"; value: number; n: number };
  /** Cuánto aciertan las reglas frente a la verdad, junto al modelo; `null` al agrupar. */
  truth: {
    metric: "accuracy" | "mae";
    rules: number;
    model: number;
    n: number;
  } | null;
  depth: number;
  leaves: number;
  n_fit: number;
  /** Telemetría (S21, lote): la leen las mediciones (`medidas-s21`) y el registro del worker, no una pantalla; por eso el lector no la usa. */
  elapsed_ms: number;
};

/** S19: lo real y lo predicho de un CSV nuevo que trae el resultado (dos clases 0/1, varias 0..K−1, estimar en sus unidades). */
export type EvaluateNewPayload = { headers: string[]; rows: string[][] };

export type EvaluateNewResult = {
  task: SupervisedTask;
  n_rows: number;
  n_used: number;
  dropped: { empty: number; unknown: number };
  y: number[];
  pred: number[];
  /** Solo dos clases: el puntaje de la clase positiva por fila. */
  score: number[] | null;
  elapsed_ms: number;
};

export type FitWinnerResult = {
  task: SupervisedTask;
  winner: MemberId;
  n_train: number;
  huella: string;
  sello: string;
  elapsed_ms: number;
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

/** S7: la clase predicha por fila (etiqueta ORIGINAL) y la probabilidad de ESA
 *  clase; null si el modelo no da probabilidades (no se inventa). */
export type MulticlassScoreResult = {
  task: "multiclase";
  predictions: string[];
  probabilities: number[] | null;
  novelty: NoveltyReport;
};

/** S7: el grupo de cada fila (0..k−1; −1 = fuera de todo grupo, solo si la regla
 *  lo admite) y, solo con la mezcla gaussiana, la probabilidad de ese grupo. */
export type ClusterScoreResult = {
  task: "agrupar";
  predictions: number[];
  probabilities: number[] | null;
  novelty: NoveltyReport;
};

export type ScoreResult =
  | BinaryScoreResult
  | MulticlassScoreResult
  | RegressionScoreResult
  | ClusterScoreResult;

export type RuntimeVersions = {
  pyodide: string;
  sklearn: string;
  python: string;
  /** S5: opcionales en el manifiesto (archivos S3/S4 no los traen); el runtime
   *  actual los emite siempre (contract.ts los exige en el export). */
  xgboost?: string;
  lightgbm?: string;
};

/**
 * S17 (ADR 023), la prueba de estrés: el mismo modelo, sin reentrenar, sobre la prueba ya abierta y perturbada con
 * semilla fija. Solo nombres de columnas y números: ningún valor del dataset. `winner`, `huella` y `sello` viajan
 * solo en la etapa 8 del Protocolo (el eco que TS coteja); en Probeta el comando no lleva payload.
 */
export type StressResult = {
  task: SupervisedTask;
  metric: { name: PrimaryMetric; direction: "higher" | "lower" };
  /** La métrica primaria sobre la prueba sin perturbar (la misma que el veredicto). */
  base: number;
  n_test: number;
  seed: number;
  /** Ruido gaussiano en las numéricas, a este múltiplo de su desviación en train. */
  noise: { level: number; value: number }[];
  /** Cada columna barajada sola, de la que más duele a la que menos. */
  shuffle: {
    column: string;
    kind: "numeric" | "categorical";
    value: number;
  }[];
  /** Las numéricas más afectadas corridas este múltiplo de su desviación (el paso del tiempo). */
  shift: { level: number; columns: string[]; value: number }[];
  /** Telemetría (S21, lote): la leen las mediciones (`medidas-s21`) y el registro del worker, no una pantalla; por eso el lector no la usa. */
  elapsed_ms: number;
  /** Solo en la etapa 8: el mejor rival sin modelo en la misma métrica y la misma prueba (en Probeta lo da el veredicto). */
  baseline?: { name: string; value: number };
  winner?: MemberId;
  huella?: string;
  sello?: string;
};

export type ExportResult = {
  /** pipeline fitted + esquema + perfil: pickle → zlib → base64 (ADR-007). */
  payload_b64: string;
  versions: RuntimeVersions;
  schema: ModelSchema;
  training_profile: TrainingProfile;
};

export type ImportResult = { ok: true };

/** S20 (ADR 028): el pronóstico de una serie regular. El worker recibe números, la temporada y el horizonte; ninguna fecha ni columna. */
export type ForecastPeriod = "dia" | "semana" | "mes";
export type ForecastMethod =
  | "media"
  | "ingenuo"
  | "ingenuo_estacional"
  | "deriva"
  | "holt_winters"
  | "rezagos";

export type ForecastPayload = {
  y: number[];
  season: number;
  horizon: number;
  period: ForecastPeriod;
};

export type ForecastLeagueRow = {
  name: ForecastMethod;
  status: "ok" | "skipped";
  /** Por qué no compite: menos de dos temporadas, sin temporada o una cuenta que no cerró. */
  reason: "short" | "no_season" | "numeric" | null;
  /** El error medio en las unidades de la serie, pliegue por pliegue. */
  cv: { mean: number; std: number; folds: number[] } | null;
  /** El error medio dividido por el de repetir el periodo (o la temporada) anterior; `null` en una serie constante. */
  mase: number | null;
};

export type ForecastResult =
  | {
      viable: false;
      /** Cuántos periodos trae la serie y cuántos hacen falta para tres pliegues con ese horizonte. */
      n: number;
      needed: number;
      horizon: number;
    }
  | {
      viable: true;
      /** Periodos usados y recibidos (se usan los 2 000 más recientes). */
      n: number;
      n_input: number;
      truncated: boolean;
      season: number;
      seasonal_ok: boolean;
      seasonal_reason: "ok" | "short" | "no_season";
      period: ForecastPeriod;
      horizon: number;
      step: number;
      origins: number[];
      scale: number | null;
      league: ForecastLeagueRow[];
      best: ForecastMethod;
      winner: ForecastMethod;
      best_simple: ForecastMethod;
      se: number;
      forecast: number[];
      lo80: number[];
      hi80: number[];
      lo95: number[];
      hi95: number[];
      /** Telemetría (S21, lote): la leen las mediciones (`medidas-s21`), no una pantalla; por eso el lector no la usa. */
      elapsed_ms: number;
    };

/**
 * S20 (ADR 029): el gemelo sintético. El worker recibe SOLO las columnas que TypeScript dejó viajar (lo marcado como dato personal,
 * el texto libre, los identificadores y las fechas se quedan fuera), con su tipo, las filas y cuántas sintéticas pedir.
 */
export type SynthesizePayload = {
  headers: string[];
  kinds: ("numeric" | "categorical")[];
  rows: string[][];
  n_rows: number;
  seed: number;
};

export type SynthesizeResult = {
  headers: string[];
  kinds: ("numeric" | "categorical")[];
  n_real: number;
  n_rows: number;
  seed: number;
  /** Las filas sintéticas como texto; el vacío es "". */
  rows: string[][];
  /** Por columna: el KS (números) o la distancia de variación total (categorías) contra los datos, y entre dos mitades reales. */
  columns: { name: string; kind: "numeric" | "categorical"; value: number; floor: number }[];
  /** Qué tan cerca queda cada fila sintética de la fila real más cercana, frente a lo cerca que están entre sí las reales. */
  proximity: {
    median_syn: number;
    median_real: number;
    p5_real: number;
    share_below: number;
    n_real: number;
    n_syn: number;
  };
  /** Filas sintéticas idénticas a una real que quedaron tras volver a sacarlas (0 si se logró). */
  copies: number;
  resampled: number;
  rounds: number;
  rare_merged: { column: string; merged: number }[];
  /** Telemetría (S21, lote): la leen las mediciones (`medidas-s21`) y el registro del worker, no una pantalla; por eso el lector no la usa. */
  elapsed_ms: number;
};

export type RunnerRequest =
  | { id: number; type: "train"; payload: PipelinePayload | ClusterPayload }
  | { id: number; type: "validate"; payload: ValidationPayload }
  | { id: number; type: "test"; payload: TestPayload }
  // S17: la prueba de estrés. En Probeta no lleva payload (usa el modelo y la prueba retenidos en el worker);
  // en la etapa 8 lleva el mismo envío que abrió la prueba.
  | { id: number; type: "stress" }
  | { id: number; type: "stress-test"; payload: TestPayload }
  // S18: los vectores de la prueba retenida (lo real, lo predicho, el puntaje) para el intervalo; sin payload.
  | { id: number; type: "interval" }
  // S19: el simulador «¿qué pasaría si?» (el modelo retenido) y el ajuste del ganador del Protocolo (solo entrenamiento).
  | { id: number; type: "simulate"; payload: SimulatePayload }
  | { id: number; type: "fit-winner"; payload: FitWinnerPayload }
  // S19: el modelo en reglas (sin payload) y vigilar el desempeño con un CSV nuevo que trae el resultado.
  | { id: number; type: "rules"; payload?: RulesPayload }
  | { id: number; type: "evaluate-new"; payload: EvaluateNewPayload }
  // S20: el pronóstico de una serie regular (flujo propio; no usa el modelo retenido).
  | { id: number; type: "forecast"; payload: ForecastPayload }
  // S20: el gemelo sintético (cópula gaussiana con semilla fija) de las columnas que TypeScript dejó viajar.
  | { id: number; type: "synthesize"; payload: SynthesizePayload }
  | {
      id: number;
      type: "fit-member";
      payload: FitMemberPayload | ClusterFitMemberPayload;
    }
  | { id: number; type: "score"; payload: ScorePayload }
  // S7 (P13): las etiquetas por fila del agrupamiento retenido, solo para el CSV
  // local del usuario (jamás en un resultado, un esquema ni un archivo).
  | { id: number; type: "cluster-labels" }
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
  | { id: number; type: "result"; command: "validate"; result: unknown }
  | { id: number; type: "result"; command: "test"; result: unknown }
  | { id: number; type: "result"; command: "stress"; result: unknown }
  | { id: number; type: "result"; command: "stress-test"; result: unknown }
  | { id: number; type: "result"; command: "interval"; result: unknown }
  | { id: number; type: "result"; command: "simulate"; result: unknown }
  | { id: number; type: "result"; command: "fit-winner"; result: unknown }
  | { id: number; type: "result"; command: "rules"; result: unknown }
  | { id: number; type: "result"; command: "evaluate-new"; result: unknown }
  | { id: number; type: "result"; command: "forecast"; result: unknown }
  | { id: number; type: "result"; command: "synthesize"; result: unknown }
  | { id: number; type: "result"; command: "fit-member"; result: unknown }
  | { id: number; type: "result"; command: "score"; result: unknown }
  | { id: number; type: "result"; command: "cluster-labels"; result: unknown }
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
