// El roster de la liga (S5, ADR-009): quiénes pueden competir, en qué ORDEN de
// prioridad (del más simple/barato al más caro — es el orden en que el
// encarrilador llena el Nivel 1 y el desempate de la regla de un error estándar),
// y qué sabe la app de cada uno. Ningún «12» ni «14» se escribe a mano: todo se
// deriva de MEMBER_IDS. Paridad de ids con pipeline.py: tests/unit/roster.test.ts.
//
// S6 (ADR-013): un roster POR TAREA sobre UN solo espacio de ids. Un modelo que
// existe en las dos tareas comparte id (y ficha); `linear` y `lasso` solo estiman.
// `MEMBER_IDS` sigue siendo el roster de clasificación binaria (el S5 lo usa por
// nombre); ALL_MEMBER_IDS fija la prioridad GLOBAL y cada roster es una
// subsecuencia suya (invariante con test), así `byPriority` sirve a las dos.
import { matchTask } from "@/engine/despacho";
import type { TrainTask } from "@/engine/tarea";
import type { Direction } from "@/engine/verdict";

export const MEMBER_IDS = [
  "logistic",
  "logistic_balanced",
  "ridge",
  "naive_bayes",
  "linear_svc",
  "decision_tree",
  "knn",
  "hgb",
  "lightgbm",
  "xgboost",
  "extra_trees",
  "forest",
  "forest_balanced",
  "mlp",
] as const;

/** Roster de REGRESIÓN (S6), en orden de prioridad medido en el spike de la F0. */
export const REGRESSION_MEMBER_IDS = [
  "linear",
  "ridge",
  "lasso",
  "decision_tree",
  "knn",
  "hgb",
  "lightgbm",
  "xgboost",
  "extra_trees",
  "forest",
  "mlp",
] as const;

/** Prioridad global: cada roster por tarea es una subsecuencia de esta lista. */
export const ALL_MEMBER_IDS = [
  "logistic",
  "logistic_balanced",
  "linear",
  "ridge",
  "lasso",
  "naive_bayes",
  "linear_svc",
  "decision_tree",
  "knn",
  "hgb",
  "lightgbm",
  "xgboost",
  "extra_trees",
  "forest",
  "forest_balanced",
  "mlp",
] as const;

export type BinaryMemberId = (typeof MEMBER_IDS)[number];
export type RegressionMemberId = (typeof REGRESSION_MEMBER_IDS)[number];
export type MemberId = (typeof ALL_MEMBER_IDS)[number];

export const ROSTER_BY_TASK: Record<TrainTask, readonly MemberId[]> = {
  binaria: MEMBER_IDS,
  numerica: REGRESSION_MEMBER_IDS,
};

/** Rivales honestos del veredicto (no compiten en la liga: la juzgan). */
export const BASELINE_IDS = ["majority", "logistic"] as const;
/** S6 (decisión del usuario en el STOP de la F0): con MAE, la mediana + la lineal. */
export const REGRESSION_BASELINE_IDS = ["median", "linear"] as const;
export const BASELINE_IDS_BY_TASK = {
  binaria: BASELINE_IDS,
  numerica: REGRESSION_BASELINE_IDS,
} as const satisfies Record<TrainTask, readonly string[]>;

export type Family =
  | "linear"
  | "probabilistic"
  | "tree"
  | "neighbors"
  | "boosting"
  | "ensemble"
  | "neural";

export type MemberInfo = {
  family: Family;
  /** Ficha de lectura que comparte (las variantes balanceadas usan la de su base). */
  base: MemberId;
  /** false ⇒ decide la clase sin dar una probabilidad (ridge, SVM lineal).
   *  En los que solo estiman una cantidad (S6) no aplica: false. */
  probabilities: boolean;
  /** Variante con `class_weight="balanced"` (D4). */
  balanced: boolean;
};

export const MEMBERS: Record<MemberId, MemberInfo> = {
  logistic: {
    family: "linear",
    base: "logistic",
    probabilities: true,
    balanced: false,
  },
  logistic_balanced: {
    family: "linear",
    base: "logistic",
    probabilities: true,
    balanced: true,
  },
  linear: {
    family: "linear",
    base: "linear",
    probabilities: false,
    balanced: false,
  },
  ridge: {
    family: "linear",
    base: "ridge",
    probabilities: false,
    balanced: false,
  },
  lasso: {
    family: "linear",
    base: "lasso",
    probabilities: false,
    balanced: false,
  },
  naive_bayes: {
    family: "probabilistic",
    base: "naive_bayes",
    probabilities: true,
    balanced: false,
  },
  linear_svc: {
    family: "linear",
    base: "linear_svc",
    probabilities: false,
    balanced: false,
  },
  decision_tree: {
    family: "tree",
    base: "decision_tree",
    probabilities: true,
    balanced: false,
  },
  knn: {
    family: "neighbors",
    base: "knn",
    probabilities: true,
    balanced: false,
  },
  hgb: {
    family: "boosting",
    base: "hgb",
    probabilities: true,
    balanced: false,
  },
  lightgbm: {
    family: "boosting",
    base: "lightgbm",
    probabilities: true,
    balanced: false,
  },
  xgboost: {
    family: "boosting",
    base: "xgboost",
    probabilities: true,
    balanced: false,
  },
  extra_trees: {
    family: "ensemble",
    base: "extra_trees",
    probabilities: true,
    balanced: false,
  },
  forest: {
    family: "ensemble",
    base: "forest",
    probabilities: true,
    balanced: false,
  },
  forest_balanced: {
    family: "ensemble",
    base: "forest",
    probabilities: true,
    balanced: true,
  },
  mlp: { family: "neural", base: "mlp", probabilities: true, balanced: false },
};

const PRIORITY = new Map<string, number>(
  ALL_MEMBER_IDS.map((id, i) => [id, i]),
);

export function isMemberId(value: unknown): value is MemberId {
  return typeof value === "string" && PRIORITY.has(value);
}

/** ¿Compite este id en el roster de esa tarea? (un `logistic` no estima cantidades). */
export function isMemberOf(task: TrainTask, value: unknown): value is MemberId {
  return (ROSTER_BY_TASK[task] as readonly unknown[]).includes(value);
}

/**
 * S6: los ids compartidos cuyo nombre largo cambia al estimar una cantidad (el
 * mismo Ridge es «Clasificador Ridge» al clasificar y «Regresión Ridge» al
 * estimar). Los demás se llaman igual en las dos tareas.
 */
export const REGRESSION_NAMED_IDS = [
  "ridge",
] as const satisfies readonly MemberId[];

/** La clave i18n del nombre largo de un miembro en esa tarea. */
export function memberNameKey(id: MemberId, task: TrainTask): string {
  const shared = `results.candidates.model.${id}`;
  return matchTask(task, {
    binaria: () => shared,
    numerica: () =>
      (REGRESSION_NAMED_IDS as readonly MemberId[]).includes(id)
        ? `results.candidates.regressionModel.${id}`
        : shared,
  });
}

/** Ordena (sin duplicados) por prioridad: el orden que Python recibe y no re-deriva. */
export function byPriority(ids: Iterable<MemberId>): MemberId[] {
  return [...new Set(ids)].sort((a, b) => PRIORITY.get(a)! - PRIORITY.get(b)!);
}

// --- Regla de un error estándar (espejo EXACTO de pipeline.py select_one_se) --

export type CvRowLike = {
  name: MemberId;
  status: "ok" | "no-converge" | "error";
  cv: { mean: number; std: number } | null;
};

export type OneSeSelection = {
  /** Máximo puntaje de CV (empate → el primero del orden). */
  best: MemberId;
  /** Ganador: el primero del orden a menos de un error estándar del mejor. */
  winner: MemberId;
  /** Error estándar del mejor: std de sus folds / √k. */
  se: number;
};

/**
 * Regla de un error estándar (ESL §7.10; desviación D8, medida en la F0): con
 * pocas filas, el máximo entre muchos modelos premia la suerte; entre los que
 * quedan a menos de un error estándar del mejor, gana el más simple (el primero
 * del orden). Solo compiten los `ok` (un «no-converge» se muestra etiquetado y
 * se puede elegir a mano, pero no gana solo). Devuelve null si nadie concluyó.
 * Python hace la selección; TS la recalcula y rechaza el resultado si no
 * coincide (contrato entre lenguajes).
 */
export function selectOneSe(
  league: readonly CvRowLike[],
  k: number,
  // S6: el MAE es «menor es mejor» (METRIC_RULES): el mejor es el mínimo y el
  // umbral suma. Obligatoria: ninguna métrica hereda la dirección por descarte.
  direction: Direction,
): OneSeSelection | null {
  const eligible = league.filter(
    (row): row is CvRowLike & { cv: { mean: number; std: number } } =>
      row.status === "ok" && row.cv !== null,
  );
  if (eligible.length === 0) return null;
  const lower = direction === "lower";
  const best = eligible.reduce((a, b) =>
    (lower ? b.cv.mean < a.cv.mean : b.cv.mean > a.cv.mean) ? b : a,
  );
  const se = best.cv.std / Math.sqrt(k);
  const winner = lower
    ? eligible.find((row) => row.cv.mean <= best.cv.mean + se)!
    : eligible.find((row) => row.cv.mean >= best.cv.mean - se)!;
  return { best: best.name, winner: winner.name, se };
}
