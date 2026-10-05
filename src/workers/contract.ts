// El lado que LEE del contrato Python → TS (regla 15, gate de contrato entre
// lenguajes): todo lo que el runner devuelve por postMessage se valida AQUÍ, en
// producción, antes de tocar el estado. Si la forma no cuadra, el error nombra el
// campo («league[3].cv.mean») y la UI lo dice con honestidad en vez de pintar algo
// que no se puede verificar. El emisor (pipeline.py en Pyodide real) escribe los
// fixtures en tests/fixtures/contrato/; tests/unit/contract.test.ts los valida y
// muta cada campo (carnadas) — «detectó k de n».
//
// S6 (P1): cada resultado trae su `task` y el lector la coteja con la enviada; la
// forma, las métricas y la selección se validan con las reglas de ESA tarea.
import { byTask, matchByTask, taskOf, type ByTask } from "@/engine/despacho";
import { isMemberOf, selectOneSe, type MemberId } from "@/engine/roster";
import {
  MULTICLASS_MAX_CLASSES,
  MULTICLASS_MIN_CLASSES,
  CLUSTER_TASK,
  TRAIN_TASKS,
  type SupervisedTask,
  type TrainTask,
} from "@/engine/tarea";
import {
  AGGLO_MAX_ROWS,
  computeClusterReading,
  METRIC_RULES,
  selectClusterWinner,
  SEPARATING_TOP,
  SILHOUETTE_SAMPLE,
  STABILITY_FRACTION,
  type PrimaryMetric,
} from "@/engine/verdict";
import {
  arr,
  bool,
  check,
  dict,
  int,
  isRecord,
  nullable,
  num,
  obj,
  oneOf,
  refine,
  str,
  type Checked,
  type Validator,
} from "@/lib/validate";
import type {
  BinaryScoreResult,
  ClusterMemberFitResult,
  ClusterMemberRow,
  ClusterModelSchema,
  ClusterScoringSchema,
  ClusterPipelineResult,
  ClusterProfiles,
  ClusterReadingResult,
  ClusterAssignment,
  ClusterScoreResult,
  ExportResult,
  MemberFitResult,
  MulticlassMemberFitResult,
  MulticlassPipelineResult,
  MulticlassScoreResult,
  PerClassMetrics,
  PipelineResult,
  ProgressDetail,
  RegressionMemberFitResult,
  RegressionPipelineResult,
  RegressionScoreResult,
} from "@/workers/protocol";

const METRIC_KEYS = ["accuracy", "precision", "recall", "f1", "auc"] as const;
/** S6: las métricas de regresión que viajan (y que el lector compara). */
export const REGRESSION_METRIC_KEYS = [
  "mae",
  "rmse",
  "r2",
  "medae",
  "mape",
] as const;
/** S7: las métricas de varias categorías que viajan (y que el lector compara). */
export const MULTICLASS_METRIC_KEYS = [
  "balanced_accuracy",
  "f1_macro",
  "accuracy",
  "log_loss",
  "auc_ovr",
] as const;
/** S6 (P6): espejo de PRED_VS_REAL_MAX de pipeline.py (paridad en roster.test.ts). */
export const PRED_VS_REAL_MAX = 200;
/** S6: espejo de TARGET_DECIMALS_MAX de pipeline.py. */
export const TARGET_DECIMALS_MAX = 6;

const member: Validator = (v, path) => (isMemberOf("binaria", v) ? null : path);
/** S6: un id del roster de regresión (un `logistic` no estima cantidades). */
const regressionMember: Validator = (v, path) =>
  isMemberOf("numerica", v) ? null : path;

/** Espejo de SCORER en pipeline.py: la métrica primaria enviada es el scorer de
 *  la CV (paridad de texto vigilada en tests/unit/roster.test.ts). */
export const SCORER: Record<PrimaryMetric, string> = {
  auc: "roc_auc",
  f1: "f1",
  accuracy: "accuracy",
  precision: "precision",
  recall: "recall",
  balanced_accuracy: "balanced_accuracy",
  mae: "neg_mean_absolute_error",
};

const nonNegInt = refine(int, (v) => (v as number) >= 0);
const nonNeg = refine(num, (v) => (v as number) >= 0);
/** S7: una proporción (las métricas de clasificación viven entre 0 y 1). */
const unit01 = refine(num, (v) => (v as number) >= 0 && (v as number) <= 1);

export const metricsV = obj(
  Object.fromEntries(METRIC_KEYS.map((k) => [k, num])),
);

/** S6: errores en unidades (≥ 0); R² puede ser negativo; MAPE null si hay ceros. */
export const regressionMetricsV = obj({
  mae: nonNeg,
  rmse: nonNeg,
  r2: num,
  medae: nonNeg,
  mape: nullable(nonNeg),
});

const cvScoreV = obj({
  mean: num,
  std: refine(num, (v) => (v as number) >= 0),
  folds: arr(num, 2),
});

/** S6: la CV de una métrica de ERROR (el MAE) llega en sus unidades, con el signo
 *  ya invertido por Python: jamás negativa. Si Python perdiera el cambio de signo,
 *  «menor es mejor» elegiría al PEOR modelo y el recálculo de la regla de un error
 *  estándar coincidiría igual: lo para el dominio, nombrando el campo (AU-S6-09). */
const errorCvScoreV = obj({
  mean: nonNeg,
  std: nonNeg,
  folds: arr(nonNeg, 2),
});

const leagueRowOf = (
  memberV: Validator,
  testV: Validator,
  cvV: Validator = cvScoreV,
) =>
  obj({
    name: memberV,
    status: oneOf(["ok", "no-converge", "error"]),
    cv: nullable(cvV),
    test: nullable(testV),
    elapsed_ms: nonNegInt,
    error_type: nullable(str),
  });

const confusionV = refine(
  arr(arr(nonNegInt)),
  (v) =>
    (v as number[][]).length === 2 &&
    (v as number[][]).every((r) => r.length === 2),
);

const explainabilityV = obj({
  method: oneOf(["permutation_importance"]),
  scoring: str,
  n_repeats: int,
  features: arr(
    obj({
      name: str,
      kind: oneOf(["numeric", "categorical"]),
      importance: num,
      std: num,
      direction: oneOf(["positive", "negative", null]),
    }),
  ),
});

const preprocessingV = obj({
  numeric_medians: dict(num),
  rare_categories: dict(arr(str)),
});

const cvSummaryOf = (memberV: Validator) =>
  obj({
    k: refine(int, (v) => (v as number) >= 2),
    scoring: str,
    rule: oneOf(["one-se"]),
    best: memberV,
    se: refine(num, (v) => (v as number) >= 0),
  });

const pipelineResultV = obj({
  task: oneOf(["binaria"]),
  classes: refine(arr(str), (v) => (v as string[]).length === 2),
  positive_class: str,
  positive_rate: num,
  n_train: nonNegInt,
  n_test: nonNegInt,
  baselines: obj({ majority: metricsV, logistic: metricsV }),
  model: metricsV,
  model_name: member,
  winner: member,
  league: arr(leagueRowOf(member, metricsV), 1),
  cv: cvSummaryOf(member),
  elapsed_ms: nonNegInt,
  confusion_matrix: confusionV,
  explainability: explainabilityV,
  preprocessing: preprocessingV,
});

// --- S7: varias categorías -------------------------------------------------

/** Exactitud balanceada, F1 macro y exactitud en [0, 1]; log-loss ≥ 0 y AUC uno
 *  contra el resto en [0, 1], los dos null sin probabilidades. */
export const multiclassMetricsV = obj({
  balanced_accuracy: unit01,
  f1_macro: unit01,
  accuracy: unit01,
  log_loss: nullable(nonNeg),
  auc_ovr: nullable(unit01),
});

const perClassV = arr(
  obj({ precision: unit01, recall: unit01, f1: unit01, support: nonNegInt }),
  3,
);

const multiclassResultV = obj({
  task: oneOf(["multiclase"]),
  classes: arr(str, 3),
  n_train: nonNegInt,
  n_test: nonNegInt,
  baselines: obj({ majority: multiclassMetricsV, logistic: multiclassMetricsV }),
  model: multiclassMetricsV,
  model_name: member,
  winner: member,
  league: arr(leagueRowOf(member, multiclassMetricsV), 1),
  cv: cvSummaryOf(member),
  elapsed_ms: nonNegInt,
  confusion_matrix: arr(arr(nonNegInt)),
  per_class: perClassV,
  explainability: explainabilityV,
  preprocessing: preprocessingV,
});

/** Lo que TS envió (o sabe de su partición) con varias categorías. */
type MulticlassSent = {
  classes?: readonly string[];
  /** Filas de prueba por clase, en el orden de `classes`. */
  testCounts?: readonly number[];
};

/**
 * S7: la matriz K×K y las métricas por clase, contra lo que solo TS sabe: las
 * clases que mandó y cuántas filas de prueba tiene cada una. Filas de la matriz =
 * clase real ⇒ cada fila suma los conteos de prueba de su clase, el total es el
 * tamaño de la prueba, y el soporte de cada clase es su fila.
 */
function multiclassDetailsField(
  r: { confusion_matrix: number[][]; per_class: PerClassMetrics[] },
  sent: MulticlassSent,
  nTest: number | undefined,
): string | null {
  const k = sent.classes?.length ?? r.per_class.length;
  const m = r.confusion_matrix;
  if (m.length !== k || m.some((row) => row.length !== k))
    return "confusion_matrix";
  const rowSums = m.map((row) => row.reduce((a, b) => a + b, 0));
  if (
    sent.testCounts &&
    rowSums.some((sum, i) => sum !== sent.testCounts![i])
  ) {
    return "confusion_matrix";
  }
  if (nTest !== undefined && rowSums.reduce((a, b) => a + b, 0) !== nTest)
    return "confusion_matrix";
  if (
    r.per_class.length !== k ||
    r.per_class.some((c, i) => c.support !== rowSums[i])
  ) {
    return "per_class";
  }
  return null;
}

/** S7: lo que solo una liga multiclase puede incumplir. */
function multiclassTrainField(
  r: MulticlassPipelineResult,
  sent: MulticlassSent,
): string | null {
  const sentClasses = sent.classes ?? [];
  if (
    r.classes.length !== sentClasses.length ||
    r.classes.some((c, i) => c !== sentClasses[i])
  ) {
    return "classes";
  }
  // El tamaño de la prueba lo sabe TS: la suma de sus filas por clase.
  if (
    sent.testCounts &&
    r.n_test !== sent.testCounts.reduce((a, b) => a + b, 0)
  ) {
    return "n_test";
  }
  const details = multiclassDetailsField(r, sent, r.n_test);
  if (details) return details;
  // La logística es baseline Y miembro: la misma fábrica sobre el mismo train,
  // así que sus métricas de prueba coinciden (como la lineal del S6, AU-S6-39).
  const logistic = r.league.find((row) => row.name === "logistic")?.test;
  if (
    logistic &&
    MULTICLASS_METRIC_KEYS.some((k) => {
      const a = logistic[k];
      const b = r.baselines.logistic[k];
      return a === null || b === null
        ? a !== b
        : Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(b));
    })
  ) {
    return "baselines.logistic";
  }
  return null;
}

// --- S6: regresión ---------------------------------------------------------

/** El objetivo en train: min ≤ mediana ≤ max y la media dentro del rango. */
export const targetStatsV = refine(
  obj({
    mean: num,
    std: nonNeg,
    min: num,
    max: num,
    median: num,
    decimals: refine(
      int,
      (v) => (v as number) >= 0 && (v as number) <= TARGET_DECIMALS_MAX,
    ),
  }),
  (v) => {
    const t = v as Record<string, number>;
    return (
      t.min <= t.median &&
      t.median <= t.max &&
      t.min <= t.mean &&
      t.mean <= t.max
    );
  },
);

/** Muestra del gráfico: dos listas finitas del MISMO largo, dentro del tope. Su
 *  largo exacto y su `n_total` se cotejan con el tamaño de la prueba aparte
 *  (`predVsRealField`), porque dependen de un campo hermano. */
const predVsRealV = refine(
  obj({
    real: arr(num, 1),
    predicted: arr(num, 1),
    n_total: refine(int, (v) => (v as number) >= 1),
  }),
  (v) => {
    const p = v as { real: number[]; predicted: number[] };
    return (
      p.real.length === p.predicted.length && p.real.length <= PRED_VS_REAL_MAX
    );
  },
);

/** S6 (AU-S6-10): `n_total` ES el tamaño de la prueba (se muestra en pantalla y
 *  en la model card), y la muestra trae todos los puntos hasta el tope: ni una
 *  muestra truncada ni un total inventado pasan. */
function predVsRealField(
  p: { real: readonly number[]; n_total: number },
  nTest: number,
): string | null {
  if (p.n_total !== nTest) return "pred_vs_real.n_total";
  if (p.real.length !== Math.min(p.n_total, PRED_VS_REAL_MAX))
    return "pred_vs_real.real";
  return null;
}

/** Cuantiles del residuo: ordenados (p05 ≤ … ≤ p95) y |error| p90 ≥ 0. */
const residualsV = refine(
  obj({
    p05: num,
    p25: num,
    p50: num,
    p75: num,
    p95: num,
    abs_p90: nonNeg,
  }),
  (v) => {
    const r = v as Record<string, number>;
    return r.p05 <= r.p25 && r.p25 <= r.p50 && r.p50 <= r.p75 && r.p75 <= r.p95;
  },
);

const regressionResultV = obj({
  task: oneOf(["numerica"]),
  target_stats: targetStatsV,
  n_train: nonNegInt,
  n_test: nonNegInt,
  baselines: obj({ median: regressionMetricsV, linear: regressionMetricsV }),
  model: regressionMetricsV,
  model_name: regressionMember,
  winner: regressionMember,
  league: arr(
    leagueRowOf(regressionMember, regressionMetricsV, errorCvScoreV),
    1,
  ),
  cv: cvSummaryOf(regressionMember),
  elapsed_ms: nonNegInt,
  pred_vs_real: predVsRealV,
  residuals: residualsV,
  explainability: explainabilityV,
  preprocessing: preprocessingV,
});

/** S6: lo que solo una liga de regresión puede incumplir. */
function regressionTrainField(r: RegressionPipelineResult): string | null {
  const field = predVsRealField(r.pred_vs_real, r.n_test);
  if (field) return field;
  // La lineal es baseline Y miembro: el MISMO ajuste sobre el mismo train, así
  // que su puntaje de prueba como miembro es el del baseline (AU-S6-39). Si no
  // coincide, uno de los dos no es lo que dice ser.
  const linear = r.league.find((row) => row.name === "linear")?.test;
  if (
    linear &&
    REGRESSION_METRIC_KEYS.some((k) => {
      const a = linear[k];
      const b = r.baselines.linear[k];
      return a === null || b === null
        ? a !== b
        : Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(b));
    })
  ) {
    return "baselines.linear";
  }
  return null;
}

export type TrainSent = {
  /** S6: ausente = binaria (lo que el S5 enviaba). S7: agrupar tiene su lector. */
  task?: SupervisedTask;
  roster: readonly MemberId[];
  cv_k: number;
  primary_metric: PrimaryMetric;
} & MulticlassSent;

type AnyTrainResult =
  | PipelineResult
  | MulticlassPipelineResult
  | RegressionPipelineResult;

/**
 * Valida el resultado de la liga. Además de la forma, cruza lo que solo el lector
 * puede comprobar: la tarea es la enviada, la liga es exactamente el roster
 * enviado (en su orden), k es el enviado, y la selección es la regla de un error
 * estándar recalculada en TS CON LA DIRECCIÓN de la métrica (S6: con MAE, menor
 * es mejor) — si Python eligió otra cosa, el resultado no se muestra.
 */
export function validateTrainResult(
  raw: unknown,
  sent: TrainSent & { task: "numerica" },
): Checked<RegressionPipelineResult>;
export function validateTrainResult(
  raw: unknown,
  sent: TrainSent & { task: "multiclase" },
): Checked<MulticlassPipelineResult>;
export function validateTrainResult(
  raw: unknown,
  sent: TrainSent & { task?: "binaria" },
): Checked<PipelineResult>;
export function validateTrainResult(
  raw: unknown,
  sent: TrainSent,
): Checked<AnyTrainResult>;
export function validateTrainResult(
  raw: unknown,
  sent: TrainSent,
): Checked<AnyTrainResult> {
  const task = taskOf(sent);
  // La tarea primero: con otra tarea, todo lo demás tiene otra forma.
  if (!isRecord(raw) || raw.task !== task) return { ok: false, field: "task" };
  const shaped = check<AnyTrainResult>(
    byTask(task, {
      binaria: pipelineResultV,
      multiclase: multiclassResultV,
      numerica: regressionResultV,
    }),
    raw,
  );
  if (!shaped.ok) return shaped;
  const r: AnyTrainResult = shaped.value;
  // Lo que solo puede cotejarse dentro de cada tarea.
  const taskField: string | null = matchByTask(r, {
    binaria: () => null,
    multiclase: (multi) => multiclassTrainField(multi, sent),
    numerica: (reg) => regressionTrainField(reg),
  });
  if (taskField) return { ok: false, field: taskField };
  const names = r.league.map((row) => row.name);
  if (
    names.length !== sent.roster.length ||
    names.some((n, i) => n !== sent.roster[i])
  ) {
    return { ok: false, field: "league" };
  }
  // k antes que las filas: un k distinto al enviado es la causa, no sus folds.
  if (r.cv.k !== sent.cv_k) return { ok: false, field: "cv.k" };
  // La CV puntuó con la métrica enviada (no con otra que Python re-derivara).
  if (r.cv.scoring !== SCORER[sent.primary_metric])
    return { ok: false, field: "cv.scoring" };
  for (const [i, row] of r.league.entries()) {
    // «error» ⇔ no concluyó la CV ⇔ sin puntaje de CV.
    if ((row.status === "error") !== (row.cv === null)) {
      return { ok: false, field: `league[${i}].cv` };
    }
    // Sin test ⇔ con tipo de error (falló la CV, o el ajuste final tras la CV).
    if ((row.test === null) !== (row.error_type !== null)) {
      return { ok: false, field: `league[${i}].test` };
    }
    if (row.cv && row.cv.folds.length !== r.cv.k) {
      return { ok: false, field: `league[${i}].cv.folds` };
    }
  }
  const selection = selectOneSe(
    r.league,
    r.cv.k,
    METRIC_RULES[sent.primary_metric].direction,
  );
  if (!selection || selection.best !== r.cv.best)
    return { ok: false, field: "cv.best" };
  if (Math.abs(selection.se - r.cv.se) > 1e-12)
    return { ok: false, field: "cv.se" };
  if (selection.winner !== r.winner) return { ok: false, field: "winner" };
  if (r.model_name !== r.winner) return { ok: false, field: "model_name" };
  const winnerTest = r.league.find((row) => row.name === r.winner)!
    .test as Record<string, unknown> | null;
  const keys: readonly string[] = byTask(task, {
    binaria: METRIC_KEYS,
    multiclase: MULTICLASS_METRIC_KEYS,
    numerica: REGRESSION_METRIC_KEYS,
  });
  const model = r.model as Record<string, unknown>;
  if (!winnerTest || keys.some((k) => winnerTest[k] !== model[k])) {
    return { ok: false, field: "model" };
  }
  return shaped;
}

const memberFitV = obj({
  task: oneOf(["binaria"]),
  model: metricsV,
  model_name: member,
  confusion_matrix: confusionV,
  explainability: explainabilityV,
  preprocessing: preprocessingV,
});

const multiclassMemberFitV = obj({
  task: oneOf(["multiclase"]),
  model: multiclassMetricsV,
  model_name: member,
  confusion_matrix: arr(arr(nonNegInt)),
  per_class: perClassV,
  explainability: explainabilityV,
  preprocessing: preprocessingV,
});

const regressionMemberFitV = obj({
  task: oneOf(["numerica"]),
  model: regressionMetricsV,
  model_name: regressionMember,
  pred_vs_real: predVsRealV,
  residuals: residualsV,
  explainability: explainabilityV,
  preprocessing: preprocessingV,
});

/** Valida el ajuste de un miembro elegido a mano (U1): tiene que ser el pedido. */
export function validateMemberFit(
  raw: unknown,
  // S6: el tamaño de la prueba del resultado vigente (el fit-member no lo trae).
  sent: { member: MemberId; task: "numerica"; nTest: number },
): Checked<RegressionMemberFitResult>;
export function validateMemberFit(
  raw: unknown,
  sent: { member: MemberId; task: "multiclase"; nTest: number } & MulticlassSent,
): Checked<MulticlassMemberFitResult>;
export function validateMemberFit(
  raw: unknown,
  sent: { member: MemberId; task?: "binaria" },
): Checked<MemberFitResult>;
export function validateMemberFit(
  raw: unknown,
  sent: {
    member: MemberId;
    task?: SupervisedTask;
    nTest?: number;
  } & MulticlassSent,
): Checked<
  MemberFitResult | MulticlassMemberFitResult | RegressionMemberFitResult
> {
  const task = taskOf(sent);
  if (!isRecord(raw) || raw.task !== task) return { ok: false, field: "task" };
  const shaped = check<
    MemberFitResult | MulticlassMemberFitResult | RegressionMemberFitResult
  >(
    byTask(task, {
      binaria: memberFitV,
      multiclase: multiclassMemberFitV,
      numerica: regressionMemberFitV,
    }),
    raw,
  );
  if (!shaped.ok) return shaped;
  const { nTest } = sent;
  const taskField: string | null = matchByTask(shaped.value, {
    binaria: () => null,
    multiclase: (fit) => multiclassDetailsField(fit, sent, nTest),
    numerica: (fit) =>
      nTest === undefined ? null : predVsRealField(fit.pred_vs_real, nTest),
  });
  if (taskField) return { ok: false, field: taskField };
  if (shaped.value.model_name !== sent.member)
    return { ok: false, field: "model_name" };
  return shaped;
}

const progressV = obj({
  phase: oneOf(["cv", "test", "cluster", "stability"]),
  member: (v, path) =>
    TRAIN_TASKS.some((task) => isMemberOf(task, v)) ? null : path,
  index: nonNegInt,
  total: refine(int, (v) => (v as number) >= 1),
});

export function validateProgressDetail(raw: unknown): Checked<ProgressDetail> {
  const shaped = check<ProgressDetail>(progressV, raw);
  if (shaped.ok && shaped.value.index >= shaped.value.total) {
    return { ok: false, field: "index" };
  }
  return shaped;
}

const versionsV = obj({
  pyodide: str,
  sklearn: str,
  python: str,
  xgboost: str,
  lightgbm: str,
});

const binarySchemaV = obj({
  numeric: arr(str),
  categorical: arr(str),
  target: str,
  classes: refine(arr(str), (v) => (v as string[]).length === 2),
  positive_class: str,
  task: oneOf(["binaria"]),
});

const regressionSchemaV = obj({
  numeric: arr(str),
  categorical: arr(str),
  target: str,
  task: oneOf(["numerica"]),
  target_stats: targetStatsV,
});

/** S7: de 3 a MULTICLASS_MAX_CLASSES clases distintas. */
export const multiclassClassesV = refine(arr(str), (v) => {
  const classes = v as string[];
  return (
    classes.length >= MULTICLASS_MIN_CLASSES &&
    classes.length <= MULTICLASS_MAX_CLASSES &&
    new Set(classes).size === classes.length
  );
});

const multiclassSchemaV = obj({
  numeric: arr(str),
  categorical: arr(str),
  target: str,
  classes: multiclassClassesV,
  task: oneOf(["multiclase"]),
});

/** S6: el esquema exportado dice su tarea; la binaria exige sus clases, la
 *  numérica su objetivo. Una tarea que no es ninguna se nombra como tal. */
const SCHEMA_V_BY_TASK: ByTask<Validator> = {
  binaria: binarySchemaV,
  multiclase: multiclassSchemaV,
  numerica: regressionSchemaV,
  agrupar: (v, path) => clusterSchemaV(v, path),
};
const exportSchemaV: Validator = (v, path) => {
  if (!isRecord(v)) return path;
  return typeof v.task === "string" && Object.hasOwn(SCHEMA_V_BY_TASK, v.task)
    ? SCHEMA_V_BY_TASK[v.task as TrainTask](v, path)
    : path
      ? `${path}.task`
      : "task";
};

export const trainingProfileV = obj({
  numeric: dict(obj({ min: nullable(num), max: nullable(num) })),
  categorical: dict(arr(str)),
});

const exportV = obj({
  payload_b64: refine(str, (v) => (v as string).length > 0),
  versions: versionsV,
  schema: exportSchemaV,
  training_profile: trainingProfileV,
});

export function validateExportResult(raw: unknown): Checked<ExportResult> {
  return check<ExportResult>(exportV, raw);
}

const noveltyV = obj({
  columns: arr(
    obj({
      column: str,
      kind: oneOf(["numeric", "categorical"]),
      count: nonNegInt,
    }),
  ),
  affected_rows: nonNegInt,
  n_rows: nonNegInt,
});

const scoreV = obj({
  task: oneOf(["binaria"]),
  predictions: arr(str),
  probabilities: nullable(arr(num)),
  positive_class: str,
  novelty: noveltyV,
});

/** S7: la clase predicha y la probabilidad de esa clase (null sin probabilidades). */
const multiclassScoreV = obj({
  task: oneOf(["multiclase"]),
  predictions: arr(str),
  probabilities: nullable(arr(num)),
  novelty: noveltyV,
});

/** S7: cada predicción es una de las clases del modelo y su probabilidad es la de
 *  la clase predicha — la más alta de K, así que está en [1/K, 1] (un control de
 *  dominio gratis: una probabilidad de otra clase o de una binaria no pasa). */
function multiclassScoreField(
  s: MulticlassScoreResult,
  classes: readonly string[] | undefined,
): string | null {
  if (s.predictions.length !== s.novelty.n_rows) return "predictions";
  if (classes && s.predictions.some((p) => !classes.includes(p)))
    return "predictions";
  if (s.probabilities) {
    const floor = classes ? 1 / classes.length - 1e-9 : 0;
    if (
      s.probabilities.length !== s.predictions.length ||
      s.probabilities.some((p) => p < floor || p > 1 + 1e-9)
    ) {
      return "probabilities";
    }
  }
  return null;
}

/** S6: la cantidad estimada por fila (finita) y ninguna probabilidad inventada. */
const regressionScoreV = obj({
  task: oneOf(["numerica"]),
  predictions: arr(num),
  probabilities: oneOf([null]),
  novelty: noveltyV,
});

export function validateScoreResult(
  raw: unknown,
  sent: { task: "numerica" },
): Checked<RegressionScoreResult>;
export function validateScoreResult(
  raw: unknown,
  sent: { task: "multiclase"; classes: readonly string[] },
): Checked<MulticlassScoreResult>;
export function validateScoreResult(
  raw: unknown,
  sent?: { task?: "binaria" },
): Checked<BinaryScoreResult>;
export function validateScoreResult(
  raw: unknown,
  sent: { task?: SupervisedTask; classes?: readonly string[] } = {},
): Checked<BinaryScoreResult | MulticlassScoreResult | RegressionScoreResult> {
  const task = taskOf(sent);
  if (!isRecord(raw) || raw.task !== task) return { ok: false, field: "task" };
  const shaped = check<
    BinaryScoreResult | MulticlassScoreResult | RegressionScoreResult
  >(
    byTask(task, {
      binaria: scoreV,
      multiclase: multiclassScoreV,
      numerica: regressionScoreV,
    }),
    raw,
  );
  if (!shaped.ok) return shaped;
  const field: string | null = matchByTask(shaped.value, {
    binaria: ({ predictions, probabilities }) =>
      probabilities && probabilities.length !== predictions.length
        ? "probabilities"
        : null,
    multiclase: (multi) => multiclassScoreField(multi, sent.classes),
    numerica: ({ predictions, novelty }) =>
      predictions.length !== novelty.n_rows ? "predictions" : null,
  });
  return field ? { ok: false, field } : shaped;
}

// --- S7: agrupar sin objetivo (ADR 016) --------------------------------------
//
// El lector de agrupar coteja la forma Y recalcula lo que solo TS puede afirmar:
// el k que eligió cada criterio, el puntaje comparable, el ganador por consenso y
// la lectura (las reglas de engine/verdict.ts), los tamaños contra las filas
// enviadas, y que NINGUNA etiqueta por fila viaje (P13).

const clusterMember: Validator = (v, path) =>
  isMemberOf("agrupar", v) ? null : path;
/** Silueta (y puntaje comparable): de −1 a 1. */
const silhouetteV = refine(
  num,
  (v) => (v as number) >= -1 && (v as number) <= 1,
);
const positiveInt = refine(int, (v) => (v as number) >= 1);

const clusterRowV = obj({
  name: clusterMember,
  status: oneOf(["ok", "no-converge", "no-structure", "error"]),
  error_type: nullable(str),
  k: nullable(nonNegInt),
  k_by: oneOf(["silhouette", "bic", "density"]),
  silhouette_by_k: nullable(
    arr(obj({ k: positiveInt, silhouette: nullable(silhouetteV) })),
  ),
  bic_by_k: nullable(arr(obj({ k: positiveInt, bic: num }))),
  silhouette: nullable(silhouetteV),
  noise_share: nullable(unit01),
  score: nullable(silhouetteV),
  sizes: nullable(arr(positiveInt)),
  sample_rows: nullable(positiveInt),
  elapsed_ms: nonNegInt,
});

const stabilityV = obj({
  // El ARI vive en [−0,5, 1]; solo se exige que no pase de 1.
  ari_mean: refine(num, (v) => (v as number) <= 1),
  ari_min: refine(num, (v) => (v as number) <= 1),
  runs: positiveInt,
  fraction: unit01,
});

export const clusterReadingV = obj({
  level: oneOf(["exist", "fragile", "none"]),
  score: silhouetteV,
  null_score: silhouetteV,
  gap: num,
  stability: stabilityV,
});

const profilesV = obj({
  groups: arr(
    obj({
      group: nonNegInt,
      size: positiveInt,
      share: unit01,
      numeric: dict(nullable(num)),
      categorical: dict(nullable(obj({ mode: str, share: unit01 }))),
    }),
    2,
  ),
  noise: nullable(obj({ size: positiveInt, share: unit01 })),
  separating: arr(
    obj({
      column: str,
      kind: oneOf(["numeric", "categorical"]),
      strength: unit01,
    }),
  ),
});

export const clusterAssignmentV = obj({
  method: oneOf(["nearest-centroid", "gaussian", "centroid-radius"]),
  train_agreement: unit01,
  sample_rows: nullable(positiveInt),
});

const clusterPreprocessingV = obj({ rare_categories: dict(arr(str)) });

const clusterResultV = obj({
  task: oneOf(["agrupar"]),
  n_rows: positiveInt,
  distance: oneOf(["numeric", "all"]),
  silhouette_sample: positiveInt,
  k_range: refine(arr(int), (v) => (v as number[]).length === 2),
  league: arr(clusterRowV, 1),
  consensus: obj({ k: positiveInt, votes: positiveInt, voters: positiveInt }),
  winner: clusterMember,
  model_name: clusterMember,
  reading: clusterReadingV,
  profiles: profilesV,
  assignment: clusterAssignmentV,
  preprocessing: clusterPreprocessingV,
  elapsed_ms: nonNegInt,
});

/** Cómo elige su k cada agrupador, y con qué regla asigna una fila nueva. */
const CLUSTER_K_BY = {
  kmeans: "silhouette",
  agglomerative: "silhouette",
  gmm: "bic",
  hdbscan: "density",
} as const;
const CLUSTER_ASSIGN = {
  kmeans: "nearest-centroid",
  agglomerative: "nearest-centroid",
  gmm: "gaussian",
  hdbscan: "centroid-radius",
} as const;
type ClusterId = keyof typeof CLUSTER_K_BY;
const clusterId = (name: MemberId) => name as ClusterId;

/** Lo que TS envió (o sabe) al agrupar. */
export type ClusterSent = {
  roster: readonly MemberId[];
  k_range: readonly [number, number];
  n_rows: number;
  distance: "numeric" | "all";
  stability_runs: number;
  /** Las columnas utilizables (las de los perfiles). */
  numeric: readonly string[];
  categorical: readonly string[];
};

/** P13: una etiqueta por fila no viaja en NINGÚN resultado de agrupar. */
function labelsField(r: Record<string, unknown>): string | null {
  if ("labels" in r) return "labels";
  const league = Array.isArray(r.league) ? r.league : [];
  const i = league.findIndex((row) => isRecord(row) && "labels" in row);
  return i >= 0 ? `league[${i}].labels` : null;
}

const close = (a: number, b: number) =>
  Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(b));

/** Lo que solo una fila de agrupador puede incumplir, con su criterio. */
function clusterRowField(
  row: ClusterMemberRow,
  i: number,
  sent: ClusterSent,
): string | null {
  const at = (field: string) => `league[${i}].${field}`;
  const id = clusterId(row.name);
  if (row.k_by !== CLUSTER_K_BY[id]) return at("k_by");
  if ((row.status === "error") !== (row.error_type !== null))
    return at("error_type");
  if (row.status === "error") {
    return row.k !== null || row.score !== null || row.sizes !== null
      ? at("score")
      : null;
  }
  const votes = row.status === "ok" || row.status === "no-converge";
  if (votes !== (row.score !== null)) return at("score");
  // El barrido de k: los de silueta, todos los k del rango y en orden; el de BIC,
  // un subconjunto ordenado (un k sin ajuste posible se salta).
  const [kMin, kMax] = sent.k_range;
  const range = Array.from({ length: kMax - kMin + 1 }, (_, j) => kMin + j);
  if (row.k_by === "silhouette") {
    const byK = row.silhouette_by_k;
    if (!byK || byK.map((x) => x.k).join() !== range.join())
      return at("silhouette_by_k");
    if (row.bic_by_k !== null) return at("bic_by_k");
    const scored = byK.filter(
      (x): x is { k: number; silhouette: number } => x.silhouette !== null,
    );
    if (votes) {
      const best = scored.reduce((a, b) => (b.silhouette > a.silhouette ? b : a));
      if (row.k !== best.k) return at("k");
      if (row.silhouette !== best.silhouette) return at("silhouette");
    }
  } else if (row.k_by === "bic") {
    const byK = row.bic_by_k;
    if (
      !byK ||
      byK.length === 0 ||
      byK.some((x, j) => !range.includes(x.k) || (j > 0 && x.k <= byK[j - 1]!.k))
    )
      return at("bic_by_k");
    if (row.silhouette_by_k !== null) return at("silhouette_by_k");
    const best = byK.reduce((a, b) => (b.bic < a.bic ? b : a));
    if (votes && row.k !== best.k) return at("k");
  } else if (row.silhouette_by_k !== null || row.bic_by_k !== null) {
    return at("silhouette_by_k");
  }
  // El ruido es solo de HDBSCAN.
  if ((row.k_by === "density") !== (row.noise_share !== null))
    return at("noise_share");
  // Los tamaños: k grupos, del más grande al más chico, que con el ruido suman las
  // filas. Sin grupos (un barrido sin ningún k con silueta) no hay tamaños.
  const sample =
    clusterId(row.name) === "agglomerative" && sent.n_rows > AGGLO_MAX_ROWS
      ? AGGLO_MAX_ROWS
      : null;
  if (row.sample_rows !== sample) return at("sample_rows");
  if (row.sizes === null) return votes ? at("sizes") : null;
  const sizes = row.sizes;
  if (votes && (row.k === null || row.k < 2 || sizes.length !== row.k))
    return at("sizes");
  if (sizes.some((n, j) => j > 0 && n > sizes[j - 1]!)) return at("sizes");
  const grouped = sizes.reduce((a, b) => a + b, 0);
  if (grouped > sent.n_rows) return at("sizes");
  const noise = (sent.n_rows - grouped) / sent.n_rows;
  if (row.noise_share === null ? grouped !== sent.n_rows : !close(row.noise_share, noise))
    return row.noise_share === null ? at("sizes") : at("noise_share");
  // Con el ruido ya cotejado contra los tamaños, el puntaje: silueta × (1 − ruido).
  if (
    votes &&
    !close(row.score!, row.silhouette! * (1 - (row.noise_share ?? 0)))
  ) {
    return at("score");
  }
  return null;
}

/** La lectura, los perfiles y la regla del agrupador RETENIDO, contra su fila. */
function clusterDetailsField(
  d: {
    reading: ClusterReadingResult;
    profiles: ClusterProfiles;
    assignment: ClusterAssignment;
  },
  row: ClusterMemberRow,
  sent: ClusterSent,
): string | null {
  const { reading, profiles, assignment } = d;
  if (row.score === null || row.sizes === null) return "model_name";
  if (reading.score !== row.score) return "reading.score";
  if (!close(reading.gap, reading.score - reading.null_score))
    return "reading.gap";
  const { stability } = reading;
  if (stability.runs !== sent.stability_runs) return "reading.stability.runs";
  if (stability.fraction !== STABILITY_FRACTION)
    return "reading.stability.fraction";
  if (stability.ari_min > stability.ari_mean) return "reading.stability";
  if (reading.level !== computeClusterReading(reading.gap, stability.ari_mean))
    return "reading.level";
  // Un perfil por grupo, con los tamaños de la fila y las columnas enviadas.
  const n = sent.n_rows;
  if (
    profiles.groups.length !== row.sizes.length ||
    profiles.groups.some(
      (g, j) =>
        g.group !== j ||
        g.size !== row.sizes![j] ||
        !close(g.share, g.size / n) ||
        Object.keys(g.numeric).sort().join() !== [...sent.numeric].sort().join() ||
        Object.keys(g.categorical).sort().join() !==
          [...sent.categorical].sort().join(),
    )
  ) {
    return "profiles.groups";
  }
  const noise = n - row.sizes.reduce((a, b) => a + b, 0);
  if (
    noise === 0
      ? profiles.noise !== null
      : profiles.noise?.size !== noise || !close(profiles.noise.share, noise / n)
  ) {
    return "profiles.noise";
  }
  const kind = (c: string) =>
    sent.numeric.includes(c)
      ? "numeric"
      : sent.categorical.includes(c)
        ? "categorical"
        : null;
  if (
    profiles.separating.length > SEPARATING_TOP ||
    profiles.separating.some((s, j) =>
      kind(s.column) !== s.kind ||
      (j > 0 && s.strength > profiles.separating[j - 1]!.strength),
    )
  ) {
    return "profiles.separating";
  }
  if (assignment.method !== CLUSTER_ASSIGN[clusterId(row.name)])
    return "assignment.method";
  if (assignment.sample_rows !== row.sample_rows)
    return "assignment.sample_rows";
  return null;
}

/** Valida el resultado de AGRUPAR (Python → TS). */
export function validateClusterResult(
  raw: unknown,
  sent: ClusterSent,
): Checked<ClusterPipelineResult> {
  if (!isRecord(raw) || raw.task !== CLUSTER_TASK)
    return { ok: false, field: "task" };
  const labels = labelsField(raw);
  if (labels) return { ok: false, field: labels };
  const shaped = check<ClusterPipelineResult>(clusterResultV, raw);
  if (!shaped.ok) return shaped;
  const r = shaped.value;
  if (r.n_rows !== sent.n_rows) return { ok: false, field: "n_rows" };
  if (r.distance !== sent.distance) return { ok: false, field: "distance" };
  if (r.k_range[0] !== sent.k_range[0] || r.k_range[1] !== sent.k_range[1])
    return { ok: false, field: "k_range" };
  if (r.silhouette_sample !== Math.min(r.n_rows, SILHOUETTE_SAMPLE))
    return { ok: false, field: "silhouette_sample" };
  const names = r.league.map((row) => row.name);
  if (
    names.length !== sent.roster.length ||
    names.some((n, i) => n !== sent.roster[i])
  ) {
    return { ok: false, field: "league" };
  }
  for (const [i, row] of r.league.entries()) {
    const field = clusterRowField(row, i, sent);
    if (field) return { ok: false, field };
  }
  // El consenso, recalculado con la regla de verdict.ts.
  const consensus = selectClusterWinner(r.league);
  if (!consensus) return { ok: false, field: "league" };
  if (
    r.consensus.k !== consensus.k ||
    r.consensus.votes !== consensus.votes ||
    r.consensus.voters !== consensus.voters
  ) {
    return { ok: false, field: "consensus" };
  }
  if (r.winner !== consensus.winner) return { ok: false, field: "winner" };
  if (r.model_name !== r.winner) return { ok: false, field: "model_name" };
  const row = r.league.find((x) => x.name === r.winner)!;
  const details = clusterDetailsField(r, row, sent);
  return details ? { ok: false, field: details } : shaped;
}

const clusterMemberFitV = obj({
  task: oneOf(["agrupar"]),
  model_name: clusterMember,
  k: positiveInt,
  score: silhouetteV,
  reading: clusterReadingV,
  profiles: profilesV,
  assignment: clusterAssignmentV,
  preprocessing: clusterPreprocessingV,
});

/** Valida el agrupador elegido a mano (U1) contra SU fila de la liga vigente. */
export function validateClusterMemberFit(
  raw: unknown,
  sent: ClusterSent & { member: MemberId; row: ClusterMemberRow },
): Checked<ClusterMemberFitResult> {
  if (!isRecord(raw) || raw.task !== CLUSTER_TASK)
    return { ok: false, field: "task" };
  const labels = labelsField(raw);
  if (labels) return { ok: false, field: labels };
  const shaped = check<ClusterMemberFitResult>(clusterMemberFitV, raw);
  if (!shaped.ok) return shaped;
  const fit = shaped.value;
  if (fit.model_name !== sent.member) return { ok: false, field: "model_name" };
  if (fit.k !== sent.row.k) return { ok: false, field: "k" };
  if (fit.score !== sent.row.score) return { ok: false, field: "score" };
  const details = clusterDetailsField(fit, sent.row, sent);
  return details ? { ok: false, field: details } : shaped;
}

/** El esquema exportado de agrupar: la regla de asignación con su forma. */
const clusterSchemaShapeV = obj({
  numeric: arr(str),
  categorical: arr(str),
  task: oneOf(["agrupar"]),
  groups: refine(int, (v) => (v as number) >= 2),
  noise: bool,
  assign: obj({
    method: oneOf(["nearest-centroid", "gaussian", "centroid-radius"]),
    centroids: arr(arr(num, 1), 2),
    radii: nullable(arr(nonNeg)),
    sample_rows: nullable(positiveInt),
  }),
});
export function clusterSchemaV(v: unknown, path: string): string | null {
  const shape = clusterSchemaShapeV(v, path);
  if (shape) return shape;
  const at = (field: string) => (path ? `${path}.${field}` : field);
  const s = v as ClusterModelSchema;
  const { centroids, radii, method } = s.assign;
  if (
    centroids.length !== s.groups ||
    centroids.some((c) => c.length !== centroids[0]!.length)
  ) {
    return at("assign.centroids");
  }
  const withRadius = method === "centroid-radius";
  if (withRadius !== (radii !== null) || (radii && radii.length !== s.groups))
    return at("assign.radii");
  // Solo la regla con radio deja filas «fuera de todo grupo».
  if (s.noise !== withRadius) return at("noise");
  return null;
}

const clusterScoreV = obj({
  task: oneOf(["agrupar"]),
  predictions: arr(int),
  probabilities: nullable(arr(unit01)),
  novelty: noveltyV,
});

/** Valida la puntuación al agrupar contra el esquema del modelo activo: un grupo
 *  que el modelo tiene, −1 solo si su regla admite «fuera de todo grupo», y la
 *  probabilidad solo con la mezcla gaussiana. */
export function validateClusterScore(
  raw: unknown,
  // S7: un esquema completo (archivo importado) o el de puntuar (recién entrenado).
  schema: Pick<ClusterScoringSchema, "groups" | "noise" | "assign">,
): Checked<ClusterScoreResult> {
  if (!isRecord(raw) || raw.task !== CLUSTER_TASK)
    return { ok: false, field: "task" };
  const shaped = check<ClusterScoreResult>(clusterScoreV, raw);
  if (!shaped.ok) return shaped;
  const { predictions, probabilities, novelty } = shaped.value;
  if (predictions.length !== novelty.n_rows) return { ok: false, field: "predictions" };
  if (
    predictions.some(
      (g) => g >= schema.groups || g < -1 || (g === -1 && !schema.noise),
    )
  ) {
    return { ok: false, field: "predictions" };
  }
  const gaussian = schema.assign.method === "gaussian";
  if (
    gaussian !== (probabilities !== null) ||
    (probabilities && probabilities.length !== predictions.length)
  ) {
    return { ok: false, field: "probabilities" };
  }
  return shaped;
}

/** S7 (P13): las etiquetas por fila del agrupamiento retenido, SOLO para el CSV
 *  local. Una por fila agrupada, de −1 a k − 1. */
export function validateClusterLabels(
  raw: unknown,
  sent: { n_rows: number; groups: number; noise: boolean },
): Checked<{ labels: number[] }> {
  const shaped = check<{ labels: number[] }>(obj({ labels: arr(int) }), raw);
  if (!shaped.ok) return shaped;
  const { labels } = shaped.value;
  if (
    labels.length !== sent.n_rows ||
    labels.some((g) => g >= sent.groups || g < -1 || (g === -1 && !sent.noise))
  ) {
    return { ok: false, field: "labels" };
  }
  return shaped;
}

/** «contract:<campo>» que lanza _validate_payload en Python (lado que LEE TS → Python).
 *  Anclado a la ÚLTIMA línea del traceback: un «contract:xyz» citado dentro de otro
 *  error (un valor que pandas o sklearn repiten) no se lee como campo rechazado. */
export function pythonContractField(message: string): string | null {
  const match = /ValueError: contract:([A-Za-z_]+)\s*$/.exec(message);
  return match ? match[1]! : null;
}

/** RuntimeError("league-empty") de Python: ningún miembro concluyó la CV. */
export function pythonLeagueEmpty(message: string): boolean {
  return /RuntimeError: league-empty\s*$/.test(message);
}
