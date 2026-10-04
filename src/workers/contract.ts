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
import { TRAIN_TASKS, type TrainTask } from "@/engine/tarea";
import { METRIC_RULES, type PrimaryMetric } from "@/engine/verdict";
import {
  arr,
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
  ExportResult,
  MemberFitResult,
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
  mae: "neg_mean_absolute_error",
};

const nonNegInt = refine(int, (v) => (v as number) >= 0);
const nonNeg = refine(num, (v) => (v as number) >= 0);

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
  /** S6: ausente = binaria (lo que el S5 enviaba). */
  task?: TrainTask;
  roster: readonly MemberId[];
  cv_k: number;
  primary_metric: PrimaryMetric;
};

type AnyTrainResult = PipelineResult | RegressionPipelineResult;

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
    byTask(task, { binaria: pipelineResultV, numerica: regressionResultV }),
    raw,
  );
  if (!shaped.ok) return shaped;
  const r: AnyTrainResult = shaped.value;
  // Lo que solo puede cotejarse dentro de cada tarea.
  const taskField: string | null = matchByTask(r, {
    binaria: () => null,
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
  sent: { member: MemberId; task?: "binaria" },
): Checked<MemberFitResult>;
export function validateMemberFit(
  raw: unknown,
  sent: { member: MemberId; task?: TrainTask; nTest?: number },
): Checked<MemberFitResult | RegressionMemberFitResult> {
  const task = taskOf(sent);
  if (!isRecord(raw) || raw.task !== task) return { ok: false, field: "task" };
  const shaped = check<MemberFitResult | RegressionMemberFitResult>(
    byTask(task, { binaria: memberFitV, numerica: regressionMemberFitV }),
    raw,
  );
  if (!shaped.ok) return shaped;
  const { nTest } = sent;
  const taskField: string | null = matchByTask(shaped.value, {
    binaria: () => null,
    numerica: (fit) =>
      nTest === undefined ? null : predVsRealField(fit.pred_vs_real, nTest),
  });
  if (taskField) return { ok: false, field: taskField };
  if (shaped.value.model_name !== sent.member)
    return { ok: false, field: "model_name" };
  return shaped;
}

const progressV = obj({
  phase: oneOf(["cv", "test"]),
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

/** S6: el esquema exportado dice su tarea; la binaria exige sus clases, la
 *  numérica su objetivo. Una tarea que no es ninguna se nombra como tal. */
const SCHEMA_V_BY_TASK: ByTask<Validator> = {
  binaria: binarySchemaV,
  numerica: regressionSchemaV,
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
  sent?: { task?: "binaria" },
): Checked<BinaryScoreResult>;
export function validateScoreResult(
  raw: unknown,
  sent: { task?: TrainTask } = {},
): Checked<BinaryScoreResult | RegressionScoreResult> {
  const task = taskOf(sent);
  if (!isRecord(raw) || raw.task !== task) return { ok: false, field: "task" };
  const shaped = check<BinaryScoreResult | RegressionScoreResult>(
    byTask(task, { binaria: scoreV, numerica: regressionScoreV }),
    raw,
  );
  if (!shaped.ok) return shaped;
  const field: string | null = matchByTask(shaped.value, {
    binaria: ({ predictions, probabilities }) =>
      probabilities && probabilities.length !== predictions.length
        ? "probabilities"
        : null,
    numerica: ({ predictions, novelty }) =>
      predictions.length !== novelty.n_rows ? "predictions" : null,
  });
  return field ? { ok: false, field } : shaped;
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
