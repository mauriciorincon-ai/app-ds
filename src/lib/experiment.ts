// Orquestación pura del experimento (hilo principal): perfila, valida, arma el
// split anti-fuga y la advertencia de fuga, y ensambla el veredicto a partir de
// las métricas que devuelve Pyodide. Todo aquí es puro y testeable; el cómputo
// pesado (entrenar) vive en el runner de Pyodide.
import {
  detectLeakage,
  type LeakageColumn,
  type LeakageFinding,
} from "@/engine/leakage";
import {
  chooseCvK,
  LEVEL1_CEILING_S,
  rosterFor,
  routeModels,
  SMALL_SAMPLE_ROWS,
  type RouteProfile,
  type Routing,
} from "@/engine/encarrilador";
import type { MemberId } from "@/engine/roster";
import { stratifiedSplit } from "@/engine/split";
import { detectTask } from "@/engine/tarea";
import {
  computeVerdict,
  pickBestBaseline,
  pickPrimaryMetric,
} from "@/engine/verdict";
import {
  columnValues,
  isBinaryTarget,
  isNullToken,
  parseNumber,
  profileTable,
  targetClasses,
  type CsvTable,
} from "@/lib/ds/csv";
import type {
  DatasetSummary,
  ExperimentResult,
  MemberFitResult,
  ModelCandidate,
  PipelinePayload,
  PipelineResult,
  WorkerErrorKind,
} from "@/workers/protocol";

const PREVIEW_ROWS = 20;
const TEST_SIZE = 0.25;

export function summarizeDataset(table: CsvTable): DatasetSummary {
  const profiles = profileTable(table);
  const targetCandidates = table.headers.filter((_, index) =>
    isBinaryTarget(columnValues(table, index)),
  );
  const dateColumns = profiles
    .filter((p) => p.looksLikeDate)
    .map((p) => p.name);
  // S5 (E1): toda columna dice qué tarea plantearía como objetivo — ninguna se
  // esconde; las que el S5 no entrena se nombran con su razón.
  const targetTasks = Object.fromEntries(
    table.headers.map((name, index) => [
      name,
      detectTask(columnValues(table, index)),
    ]),
  );
  return {
    headers: table.headers,
    rowCount: table.rows.length,
    profiles,
    previewRows: table.rows.slice(0, PREVIEW_ROWS),
    targetCandidates,
    targetTasks,
    dateColumns,
  };
}

export type RunOptions = {
  /** 1 = lo que cabe en el techo · 2 = la unión 1 ∪ 2 (D5). */
  level?: 1 | 2;
  /** Modelos «fuera» que el usuario incluye de todos modos (U3). */
  forced?: readonly MemberId[];
  ceilingS?: number;
};

export type PreparedRun =
  | {
      ok: true;
      payload: PipelinePayload;
      leakage: LeakageFinding[];
      /** S5 (E2): quién compite y en qué nivel, con su razón. */
      routing: Routing;
      profile: RouteProfile;
      smallSample: boolean;
    }
  | { ok: false; error: WorkerErrorKind };

/**
 * Columnas tras el one-hot, estimadas SIN ajustar nada (para el modelo de
 * costos): numéricas + por categórica, sus categorías con ≥ 2 apariciones en train
 * (min_frequency=2) más un bucket «infrecuente» si alguna queda por debajo — el
 * mismo criterio que el OneHotEncoder de pipeline.py. Los nulos se imputan con la
 * moda: no agregan columna.
 */
export function estimateEncodedWidth(
  headers: readonly string[],
  rows: readonly string[][],
  numeric: readonly string[],
  categorical: readonly string[],
  trainIdx: readonly number[],
): number {
  let width = numeric.length;
  for (const name of categorical) {
    const index = headers.indexOf(name);
    const counts = new Map<string, number>();
    for (const i of trainIdx) {
      const raw = rows[i]![index]!;
      if (isNullToken(raw)) continue;
      const value = raw.trim();
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const values = [...counts.values()];
    const frequent = values.filter((c) => c >= 2).length;
    width += frequent + (values.some((c) => c < 2) ? 1 : 0);
  }
  return Math.max(width, 1);
}

// Features = columnas no-objetivo, no-fecha; numéricas/categóricas según perfil.
function selectFeatures(table: CsvTable, targetColumn: string) {
  const numeric: string[] = [];
  const categorical: string[] = [];
  for (const profile of profileTable(table)) {
    if (profile.name === targetColumn || profile.looksLikeDate) continue;
    (profile.kind === "numeric" ? numeric : categorical).push(profile.name);
  }
  return { numeric, categorical };
}

export function prepareRun(
  table: CsvTable,
  targetColumn: string,
  seed: number,
  options: RunOptions = {},
): PreparedRun {
  const targetIndex = table.headers.indexOf(targetColumn);

  // Filtra filas con objetivo nulo (no se pueden entrenar/evaluar).
  const rows = table.rows.filter((row) => !isNullToken(row[targetIndex]));
  const labels = rows.map((row) => row[targetIndex]);
  if (!isBinaryTarget(labels)) return { ok: false, error: "target-not-binary" };

  const { numeric, categorical } = selectFeatures(table, targetColumn);
  if (numeric.length + categorical.length === 0)
    return { ok: false, error: "no-features" };

  // Métrica primaria: la regla vive SOLO en verdict.ts. pickPrimaryMetric es
  // simétrica en p↔1−p ⇒ la calculamos con la tasa de cualquier clase fija sin
  // conocer cuál será la "positiva" (minoritaria) de Python. El split estratificado
  // preserva el balance ⇒ coincide con la que el veredicto usará post-split.
  const allClasses = targetClasses(labels).sort();
  const posRate =
    labels.filter((l) => l.trim() === allClasses[1]).length / labels.length;
  const primaryMetric = pickPrimaryMetric(posRate);

  const { trainIdx, testIdx } = stratifiedSplit(labels, TEST_SIZE, seed);

  // Fuga: sobre las features y solo las filas de train (honesto).
  const numericSet = new Set(numeric);
  const trainTargetRaw = trainIdx.map((i) => rows[i][targetIndex]);
  const classes = targetClasses(trainTargetRaw).sort();
  const target01 = trainTargetRaw.map((v) =>
    v.trim() === classes[1] ? 1 : 0,
  ) as (0 | 1)[];

  const leakColumns: LeakageColumn[] = [...numeric, ...categorical].map(
    (name) => {
      const index = table.headers.indexOf(name);
      const raw = trainIdx.map((i) => rows[i][index]);
      return numericSet.has(name)
        ? { name, kind: "numeric", values: raw.map((v) => parseNumber(v)) }
        : {
            name,
            kind: "categorical",
            values: raw.map((v) => (isNullToken(v) ? null : v.trim())),
          };
    },
  );
  const leakage = detectLeakage(leakColumns, target01);

  // S5: k de la CV acotado a la minoritaria de train (sin ella hay folds sin
  // positivos); con menos de 2 ejemplos de alguna clase no hay CV honesta.
  const positivesTrain = target01.filter((v) => v === 1).length;
  const minorityTrain = Math.min(
    positivesTrain,
    target01.length - positivesTrain,
  );
  const k = chooseCvK(rows.length, minorityTrain);
  if (k === null) return { ok: false, error: "too-few-rows" };

  const profile: RouteProfile = {
    rows: rows.length,
    nTrain: trainIdx.length,
    width: estimateEncodedWidth(
      table.headers,
      rows,
      numeric,
      categorical,
      trainIdx,
    ),
    minorityShare: minorityTrain / trainIdx.length,
    k,
  };
  const routing = routeModels(
    profile,
    options.ceilingS ?? LEVEL1_CEILING_S,
    options.forced ?? [],
  );

  const payload: PipelinePayload = {
    headers: table.headers,
    rows,
    target: targetColumn,
    numeric,
    categorical,
    train_idx: trainIdx,
    test_idx: testIdx,
    seed,
    primary_metric: primaryMetric,
    roster: rosterFor(routing, options.level ?? 1),
    cv_k: k,
  };
  return {
    ok: true,
    payload,
    leakage,
    routing,
    profile,
    smallSample: rows.length < SMALL_SAMPLE_ROWS,
  };
}

// Interino S5 F1: la tabla de candidatos de la UI H1 lee `candidates`; la F2 la
// reemplaza por la tabla de la liga (filas = modelos, CV y test etiquetados).
function candidatesOf(py: Pick<PipelineResult, "league">): ModelCandidate[] {
  return py.league.flatMap((row) =>
    row.test ? [{ name: row.name, metrics: row.test }] : [],
  );
}

export function assembleResult(
  py: PipelineResult,
  leakage: LeakageFinding[],
  smallSample = false,
): ExperimentResult {
  const primaryMetric = pickPrimaryMetric(py.positive_rate);
  const bestBaseline = pickBestBaseline(
    [py.baselines.majority, py.baselines.logistic],
    primaryMetric,
  );
  const verdict = computeVerdict(py.model, bestBaseline, primaryMetric);
  return {
    positiveClass: py.positive_class,
    positiveRate: py.positive_rate,
    nTrain: py.n_train,
    nTest: py.n_test,
    baselines: py.baselines,
    model: py.model,
    modelName: py.model_name,
    candidates: candidatesOf(py),
    league: py.league,
    selection: {
      by: "cv",
      cvWinner: py.winner,
      best: py.cv.best,
      k: py.cv.k,
      metric: primaryMetric,
      rule: py.cv.rule,
      se: py.cv.se,
      competitors: py.league.length,
      elapsedMs: py.elapsed_ms,
    },
    smallSample,
    rareCategories: py.preprocessing.rare_categories,
    confusionMatrix: py.confusion_matrix,
    verdict,
    leakage,
    explainability: py.explainability,
  };
}

/**
 * Elección manual (U1): el veredicto pasa a hablar del miembro elegido, contra el
 * MISMO baseline; la liga y el ganador de la CV no cambian. Si el elegido es el
 * ganador de la CV («volver al ganador»), la selección vuelve a ser «cv».
 */
export function applyMemberFit(
  result: ExperimentResult,
  fit: MemberFitResult,
): ExperimentResult {
  const primaryMetric = result.verdict.primaryMetric;
  const bestBaseline = pickBestBaseline(
    [result.baselines.majority, result.baselines.logistic],
    primaryMetric,
  );
  return {
    ...result,
    model: fit.model,
    modelName: fit.model_name,
    selection: {
      ...result.selection,
      by: fit.model_name === result.selection.cvWinner ? "cv" : "user",
    },
    rareCategories: fit.preprocessing.rare_categories,
    confusionMatrix: fit.confusion_matrix,
    verdict: computeVerdict(fit.model, bestBaseline, primaryMetric),
    explainability: fit.explainability,
  };
}
