// El roster de la liga (S5, ADR-009): quiénes pueden competir, en qué ORDEN de
// prioridad (del más simple/barato al más caro — es el orden en que el
// encarrilador llena el Nivel 1 y el desempate de la regla de un error estándar),
// y qué sabe la app de cada uno. Ningún «12» ni «14» se escribe a mano: todo se
// deriva de MEMBER_IDS. Paridad de ids con pipeline.py: tests/unit/roster.test.ts.

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

export type MemberId = (typeof MEMBER_IDS)[number];

/** Rivales honestos del veredicto (no compiten en la liga: la juzgan). */
export const BASELINE_IDS = ["majority", "logistic"] as const;

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
  /** false ⇒ decide la clase sin dar una probabilidad (ridge, SVM lineal). */
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
  ridge: {
    family: "linear",
    base: "ridge",
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

const PRIORITY = new Map<string, number>(MEMBER_IDS.map((id, i) => [id, i]));

export function isMemberId(value: unknown): value is MemberId {
  return typeof value === "string" && PRIORITY.has(value);
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
): OneSeSelection | null {
  const eligible = league.filter(
    (row): row is CvRowLike & { cv: { mean: number; std: number } } =>
      row.status === "ok" && row.cv !== null,
  );
  if (eligible.length === 0) return null;
  const best = eligible.reduce((a, b) => (b.cv.mean > a.cv.mean ? b : a));
  const se = best.cv.std / Math.sqrt(k);
  const threshold = best.cv.mean - se;
  const winner = eligible.find((row) => row.cv.mean >= threshold)!;
  return { best: best.name, winner: winner.name, se };
}
