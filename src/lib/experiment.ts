// Orquestación pura del experimento (hilo principal): perfila, valida, arma el
// split anti-fuga y la advertencia de fuga, y ensambla el veredicto a partir de
// las métricas que devuelve Pyodide. Todo aquí es puro y testeable; el cómputo
// pesado (entrenar) vive en el runner de Pyodide.
import {
  detectLeakage,
  detectLeakageContinuous,
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
import { quantileSplit, stratifiedSplit } from "@/engine/split";
import { detectTask, resolveTask, type AmbiguousChoice } from "@/engine/tarea";
import {
  computeVerdict,
  pickBestBaseline,
  pickPrimaryMetric,
  type RegressionMetrics,
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
  BinaryResult,
  DatasetSummary,
  MemberFitResult,
  ModelCandidate,
  PipelinePayload,
  PipelineResult,
  RegressionBaselines,
  RegressionMemberFitResult,
  RegressionPipelineResult,
  RegressionResult,
  TargetUnit,
  WorkerErrorKind,
} from "@/workers/protocol";

const PREVIEW_ROWS = 20;
const TEST_SIZE = 0.25;

export function summarizeDataset(table: CsvTable): DatasetSummary {
  const profiles = profileTable(table);
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
    targetTasks,
    dateColumns,
  };
}

export type RunOptions = {
  /** S6 (D2): la respuesta a «¿clases o cantidad?» de una columna ambigua. */
  ambiguousChoice?: AmbiguousChoice | null;
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

/** El payload de fit-member: el de la liga sin roster ni k (ya no hay CV). */
export function withoutLeague(
  payload: PipelinePayload,
): Omit<PipelinePayload, "roster" | "cv_k"> {
  const copy: Partial<PipelinePayload> = { ...payload };
  delete copy.roster;
  delete copy.cv_k;
  return copy as Omit<PipelinePayload, "roster" | "cv_k">;
}

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
// Exportada para el spike de regresión de la F0 del S6 (arma payloads con la regla real).
export function selectFeatures(table: CsvTable, targetColumn: string) {
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

  // S6: E1 decide la tarea; una ambigua necesita la respuesta del usuario (D2).
  const task = resolveTask(detectTask(labels), options.ambiguousChoice);
  if (task === "ambigua") return { ok: false, error: "target-ambiguous" };
  if (task === "numerica") {
    return prepareRegression(table, targetColumn, rows, seed, options);
  }

  if (!isBinaryTarget(labels)) {
    // E1 cuenta valores numéricos («1» = «1.0»); el entrenador, texto. Si E1 ve
    // dos valores, el problema es la notación, y se dice así (AU-S5-10).
    return {
      ok: false,
      error: task === "binaria" ? "target-mixed-notation" : "target-not-binary",
    };
  }

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
  const trainTargetRaw = trainIdx.map((i) => rows[i][targetIndex]);
  const classes = targetClasses(trainTargetRaw).sort();
  const target01 = trainTargetRaw.map((v) =>
    v.trim() === classes[1] ? 1 : 0,
  ) as (0 | 1)[];
  const leakage = detectLeakage(
    leakageColumns(table, rows, numeric, categorical, trainIdx),
    target01,
  );

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
    task: "binaria",
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
    task: "binaria",
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

/** Las columnas candidatas, con sus valores SOLO en las filas de train. */
function leakageColumns(
  table: CsvTable,
  rows: readonly string[][],
  numeric: readonly string[],
  categorical: readonly string[],
  trainIdx: readonly number[],
): LeakageColumn[] {
  const numericSet = new Set(numeric);
  return [...numeric, ...categorical].map((name) => {
    const index = table.headers.indexOf(name);
    const raw = trainIdx.map((i) => rows[i][index]);
    return numericSet.has(name)
      ? { name, kind: "numeric", values: raw.map((v) => parseNumber(v)) }
      : {
          name,
          kind: "categorical",
          values: raw.map((v) => (isNullToken(v) ? null : v.trim())),
        };
  });
}

/**
 * S6 — estimar una cantidad (ADR-013). Mismas garantías que la binaria: split
 * anti-fuga por índices (estratificado por bandas de cuantiles, P4), fuga medida
 * SOLO en train (|Spearman| y η²), y E2 por costo con el roster de regresión.
 * Métrica primaria: el MAE (decidida por el usuario en el STOP de la F0).
 */
function prepareRegression(
  table: CsvTable,
  targetColumn: string,
  rows: string[][],
  seed: number,
  options: RunOptions,
): PreparedRun {
  const targetIndex = table.headers.indexOf(targetColumn);
  const values = rows.map((row) => parseNumber(row[targetIndex].trim()));
  if (values.some((v) => v === null || !Number.isFinite(v))) {
    return { ok: false, error: "target-not-numeric" };
  }
  const y = values as number[];

  const { numeric, categorical } = selectFeatures(table, targetColumn);
  if (numeric.length + categorical.length === 0)
    return { ok: false, error: "no-features" };

  const { trainIdx, testIdx } = quantileSplit(y, TEST_SIZE, seed);
  const leakage = detectLeakageContinuous(
    leakageColumns(table, rows, numeric, categorical, trainIdx),
    trainIdx.map((i) => y[i]),
  );

  // Sin clases que cuidar, k solo está acotado por las filas de train.
  const k = chooseCvK(rows.length, trainIdx.length);
  if (k === null) return { ok: false, error: "too-few-rows" };

  const profile: RouteProfile = {
    task: "numerica",
    rows: rows.length,
    nTrain: trainIdx.length,
    width: estimateEncodedWidth(
      table.headers,
      rows,
      numeric,
      categorical,
      trainIdx,
    ),
    minorityShare: null,
    k,
  };
  const routing = routeModels(
    profile,
    options.ceilingS ?? LEVEL1_CEILING_S,
    options.forced ?? [],
  );

  const payload: PipelinePayload = {
    task: "numerica",
    headers: table.headers,
    rows,
    target: targetColumn,
    numeric,
    categorical,
    train_idx: trainIdx,
    test_idx: testIdx,
    seed,
    primary_metric: "mae",
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

// La model card lista los miembros con puntaje de prueba («Candidatos comparados»).
function candidatesOf<M>(py: {
  league: readonly { name: MemberId; test: M | null }[];
}): ModelCandidate<M>[] {
  return py.league.flatMap((row) =>
    row.test ? [{ name: row.name, metrics: row.test }] : [],
  );
}

export function assembleResult(
  py: PipelineResult,
  leakage: LeakageFinding[],
  smallSample = false,
): BinaryResult {
  const primaryMetric = pickPrimaryMetric(py.positive_rate);
  const bestBaseline = pickBestBaseline(
    [py.baselines.majority, py.baselines.logistic],
    primaryMetric,
  );
  const verdict = computeVerdict(py.model, bestBaseline, primaryMetric);
  return {
    task: "binaria",
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
  result: BinaryResult,
  fit: MemberFitResult,
): BinaryResult {
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

// --- S6: estimar una cantidad ----------------------------------------------

/**
 * Sufijos de unidad reconocidos en el NOMBRE de la columna objetivo (tabla
 * CERRADA, P5): si el sufijo no está aquí, no se inventa una unidad y la UI dice
 * «en las unidades de «columna»». El nombre de la columna no sale del navegador.
 */
export const UNIT_SUFFIXES: Readonly<Record<string, string>> = {
  usd: "USD",
  eur: "EUR",
  mxn: "MXN",
  cop: "COP",
  ars: "ARS",
  clp: "CLP",
  pen: "PEN",
  kwh: "kWh",
  wh: "Wh",
  kw: "kW",
  kg: "kg",
  g: "g",
  t: "t",
  km: "km",
  m: "m",
  cm: "cm",
  mm: "mm",
  m2: "m²",
  m3: "m³",
  l: "L",
  ml: "mL",
  h: "h",
  min: "min",
  s: "s",
  dias: "días",
  meses: "meses",
  anios: "años",
  c: "°C",
  pct: "%",
};

export function inferUnit(column: string): TargetUnit {
  const match = /[_\s-]([a-z0-9]+)$/i.exec(column.trim());
  const suffix = match ? match[1].toLowerCase() : null;
  const symbol = suffix ? (UNIT_SUFFIXES[suffix] ?? null) : null;
  return { suffix: symbol ? suffix : null, symbol };
}

/**
 * El baseline de regresión a batir: el de menor MAE (la regla de METRIC_RULES vía
 * pickBestBaseline; en empate, la mediana, que es la primera). La UI lo nombra en
 * el veredicto («adivinar siempre la mediana» o «una regresión lineal»).
 */
export function bestRegressionBaseline(
  baselines: RegressionBaselines,
): keyof RegressionBaselines {
  const best = pickBestBaseline([baselines.median, baselines.linear], "mae");
  return best === baselines.median ? "median" : "linear";
}

/**
 * Ensambla el resultado de REGRESIÓN con lo que el lector (contract.ts) validó:
 * veredicto en MAE contra el mejor baseline (mediana o lineal) con la regla de
 * METRIC_RULES, y la unidad inferida del nombre del objetivo.
 */
export function assembleRegressionResult(
  py: RegressionPipelineResult,
  leakage: LeakageFinding[],
  target: string,
  smallSample = false,
): RegressionResult {
  const bestBaseline = py.baselines[bestRegressionBaseline(py.baselines)];
  return {
    task: "numerica",
    nTrain: py.n_train,
    nTest: py.n_test,
    targetStats: py.target_stats,
    unit: inferUnit(target),
    baselines: py.baselines,
    model: py.model,
    modelName: py.model_name,
    candidates: candidatesOf<RegressionMetrics>(py),
    league: py.league,
    selection: {
      by: "cv",
      cvWinner: py.winner,
      best: py.cv.best,
      k: py.cv.k,
      metric: "mae",
      rule: py.cv.rule,
      se: py.cv.se,
      competitors: py.league.length,
      elapsedMs: py.elapsed_ms,
    },
    smallSample,
    rareCategories: py.preprocessing.rare_categories,
    predVsReal: py.pred_vs_real,
    residuals: py.residuals,
    verdict: computeVerdict(py.model, bestBaseline, "mae"),
    leakage,
    explainability: py.explainability,
  };
}

/** Elección manual en regresión (U1): mismo baseline, el veredicto habla del elegido. */
export function applyRegressionMemberFit(
  result: RegressionResult,
  fit: RegressionMemberFitResult,
): RegressionResult {
  const bestBaseline =
    result.baselines[bestRegressionBaseline(result.baselines)];
  return {
    ...result,
    model: fit.model,
    modelName: fit.model_name,
    selection: {
      ...result.selection,
      by: fit.model_name === result.selection.cvWinner ? "cv" : "user",
    },
    rareCategories: fit.preprocessing.rare_categories,
    predVsReal: fit.pred_vs_real,
    residuals: fit.residuals,
    verdict: computeVerdict(fit.model, bestBaseline, "mae"),
    explainability: fit.explainability,
  };
}
