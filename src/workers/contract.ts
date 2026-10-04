// El lado que LEE del contrato Python → TS (regla 15, gate de contrato entre
// lenguajes): todo lo que el runner devuelve por postMessage se valida AQUÍ, en
// producción, antes de tocar el estado. Si la forma no cuadra, el error nombra el
// campo («league[3].cv.mean») y la UI lo dice con honestidad en vez de pintar algo
// que no se puede verificar. El emisor (pipeline.py en Pyodide real) escribe los
// fixtures en tests/fixtures/contrato/; tests/unit/contract.test.ts los valida y
// muta cada campo (carnadas) — «detectó k de n».
import { isMemberId, selectOneSe, type MemberId } from "@/engine/roster";
import type { MetricName } from "@/engine/verdict";
import {
  arr,
  check,
  dict,
  int,
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
  ExportResult,
  MemberFitResult,
  PipelineResult,
  ProgressDetail,
  ScoreResult,
} from "@/workers/protocol";

const METRIC_KEYS = ["accuracy", "precision", "recall", "f1", "auc"] as const;

const member: Validator = (v, path) => (isMemberId(v) ? null : path);

/** Espejo de SCORER en pipeline.py: la métrica primaria enviada es el scorer de
 *  la CV (paridad de texto vigilada en tests/unit/roster.test.ts). */
export const SCORER: Record<MetricName, string> = {
  auc: "roc_auc",
  f1: "f1",
  accuracy: "accuracy",
  precision: "precision",
  recall: "recall",
};

const nonNegInt = refine(int, (v) => (v as number) >= 0);

export const metricsV = obj(
  Object.fromEntries(METRIC_KEYS.map((k) => [k, num])),
);

const cvScoreV = obj({
  mean: num,
  std: refine(num, (v) => (v as number) >= 0),
  folds: arr(num, 2),
});

const leagueRowV = obj({
  name: member,
  status: oneOf(["ok", "no-converge", "error"]),
  cv: nullable(cvScoreV),
  test: nullable(metricsV),
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

const pipelineResultV = obj({
  classes: refine(arr(str), (v) => (v as string[]).length === 2),
  positive_class: str,
  positive_rate: num,
  n_train: nonNegInt,
  n_test: nonNegInt,
  baselines: obj({ majority: metricsV, logistic: metricsV }),
  model: metricsV,
  model_name: member,
  winner: member,
  league: arr(leagueRowV, 1),
  cv: obj({
    k: refine(int, (v) => (v as number) >= 2),
    scoring: str,
    rule: oneOf(["one-se"]),
    best: member,
    se: refine(num, (v) => (v as number) >= 0),
  }),
  elapsed_ms: nonNegInt,
  confusion_matrix: confusionV,
  explainability: explainabilityV,
  preprocessing: preprocessingV,
});

/**
 * Valida el resultado de la liga. Además de la forma, cruza lo que solo el lector
 * puede comprobar: la liga es exactamente el roster enviado (en su orden), k es el
 * enviado, y la selección es la regla de un error estándar recalculada en TS — si
 * Python eligió otra cosa, el resultado no se muestra.
 */
export function validateTrainResult(
  raw: unknown,
  sent: {
    roster: readonly MemberId[];
    cv_k: number;
    primary_metric: MetricName;
  },
): Checked<PipelineResult> {
  const shaped = check<PipelineResult>(pipelineResultV, raw);
  if (!shaped.ok) return shaped;
  const r = shaped.value;
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
  const selection = selectOneSe(r.league, r.cv.k);
  if (!selection || selection.best !== r.cv.best)
    return { ok: false, field: "cv.best" };
  if (Math.abs(selection.se - r.cv.se) > 1e-12)
    return { ok: false, field: "cv.se" };
  if (selection.winner !== r.winner) return { ok: false, field: "winner" };
  if (r.model_name !== r.winner) return { ok: false, field: "model_name" };
  const winnerRow = r.league.find((row) => row.name === r.winner)!;
  if (
    !winnerRow.test ||
    METRIC_KEYS.some((k) => winnerRow.test![k] !== r.model[k])
  ) {
    return { ok: false, field: "model" };
  }
  return shaped;
}

const memberFitV = obj({
  model: metricsV,
  model_name: member,
  confusion_matrix: confusionV,
  explainability: explainabilityV,
  preprocessing: preprocessingV,
});

/** Valida el ajuste de un miembro elegido a mano (U1): tiene que ser el pedido. */
export function validateMemberFit(
  raw: unknown,
  sent: { member: MemberId },
): Checked<MemberFitResult> {
  const shaped = check<MemberFitResult>(memberFitV, raw);
  if (!shaped.ok) return shaped;
  if (shaped.value.model_name !== sent.member)
    return { ok: false, field: "model_name" };
  return shaped;
}

const progressV = obj({
  phase: oneOf(["cv", "test"]),
  member,
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

const schemaV = obj({
  numeric: arr(str),
  categorical: arr(str),
  target: str,
  classes: refine(arr(str), (v) => (v as string[]).length === 2),
  positive_class: str,
});

export const trainingProfileV = obj({
  numeric: dict(obj({ min: nullable(num), max: nullable(num) })),
  categorical: dict(arr(str)),
});

const exportV = obj({
  payload_b64: refine(str, (v) => (v as string).length > 0),
  versions: versionsV,
  schema: schemaV,
  training_profile: trainingProfileV,
});

export function validateExportResult(raw: unknown): Checked<ExportResult> {
  return check<ExportResult>(exportV, raw);
}

const scoreV = obj({
  predictions: arr(str),
  probabilities: nullable(arr(num)),
  positive_class: str,
  novelty: obj({
    columns: arr(
      obj({
        column: str,
        kind: oneOf(["numeric", "categorical"]),
        count: nonNegInt,
      }),
    ),
    affected_rows: nonNegInt,
    n_rows: nonNegInt,
  }),
});

export function validateScoreResult(raw: unknown): Checked<ScoreResult> {
  const shaped = check<ScoreResult>(scoreV, raw);
  if (!shaped.ok) return shaped;
  const { predictions, probabilities } = shaped.value;
  if (probabilities && probabilities.length !== predictions.length) {
    return { ok: false, field: "probabilities" };
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
