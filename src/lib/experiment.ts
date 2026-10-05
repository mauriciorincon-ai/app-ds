// Orquestación pura del experimento (hilo principal): perfila, valida, arma el
// split anti-fuga y la advertencia de fuga, y ensambla el veredicto a partir de
// las métricas que devuelve Pyodide. Todo aquí es puro y testeable; el cómputo
// pesado (entrenar) vive en el runner de Pyodide.
import {
  detectLeakage,
  detectLeakageByClass,
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
import { BASELINE_IDS_BY_TASK, type MemberId } from "@/engine/roster";
import { clusterEdaAlerts } from "@/engine/eda";
import { quantileSplit, stratifiedSplit } from "@/engine/split";
import { matchTask } from "@/engine/despacho";
import {
  detectTask,
  isTrainTask,
  resolveTask,
  type AmbiguousChoice,
} from "@/engine/tarea";
import {
  CLUSTER_K_MIN,
  CLUSTER_MIN_NUMERIC,
  clusterKCap,
  computeVerdict,
  MULTICLASS_PRIMARY_METRIC,
  STABILITY_RUNS,
  pickBestBaseline,
  pickPrimaryMetric,
  type MulticlassMetrics,
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
import type { ClusterSent } from "@/workers/contract";
import type {
  BinaryResult,
  ClusterMemberFitResult,
  ClusterFitMemberPayload,
  ClusterPayload,
  ClusterPipelineResult,
  ClusterResult,
  ClusterScoringSchema,
  DatasetSummary,
  MemberFitResult,
  ModelCandidate,
  MulticlassBaselines,
  MulticlassMemberFitResult,
  MulticlassPipelineResult,
  MulticlassResult,
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
  | {
      ok: false;
      error: WorkerErrorKind;
      /** S7 (P4): con `too-few-rows-per-class`, la clase más chica y sus filas
       *  de train — se nombra EN PANTALLA (dato del usuario), jamás en un log. */
      smallestClass?: { name: string; trainRows: number };
    };

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
  const detection = detectTask(labels);
  const task = resolveTask(detection, options.ambiguousChoice);
  if (task === "ambigua") return { ok: false, error: "target-ambiguous" };
  // Una columna que no sirve de objetivo (constante, vacía, demasiadas categorías).
  if (!isTrainTask(task)) return { ok: false, error: "target-not-usable" };
  // S7 (P2): una rama por tarea; la que falte no compila.
  return matchTask(task, {
    binaria: () =>
      prepareBinary(table, targetColumn, rows, labels, seed, options),
    multiclase: () =>
      prepareMulticlass(
        table,
        targetColumn,
        rows,
        labels,
        detection.distinct,
        seed,
        options,
      ),
    numerica: () =>
      prepareRegression(table, targetColumn, rows, seed, options),
  });
}

/** Clasificación binaria (S1–S5): estratificada, fuga por AUC de rango y pureza. */
function prepareBinary(
  table: CsvTable,
  targetColumn: string,
  rows: string[][],
  labels: readonly string[],
  seed: number,
  options: RunOptions,
): PreparedRun {
  const targetIndex = table.headers.indexOf(targetColumn);
  if (!isBinaryTarget(labels)) {
    // E1 cuenta valores numéricos («1» = «1.0»); el entrenador, texto. Si E1 ve
    // dos valores, el problema es la notación, y se dice así (AU-S5-10).
    return { ok: false, error: "target-mixed-notation" };
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
 * S7: orden de las clases por punto de código — el de `sorted()` de Python, que
 * las codifica 0..K−1 y las coteja con las que manda TS. (El `sort()` de JS compara
 * unidades UTF-16 y difiere fuera del plano básico: un emoji contra «ﬀ».)
 */
export function byCodePoint(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i]!.codePointAt(0)! - y[i]!.codePointAt(0)!;
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

/** S7: filas de PRUEBA por clase, en el orden de `payload.classes` (el lector
 *  coteja con ellas las filas de la matriz de confusión). */
export function testClassCounts(payload: PipelinePayload): number[] {
  const classes = payload.classes ?? [];
  const targetIndex = payload.headers.indexOf(payload.target);
  const counts = new Map(classes.map((c) => [c, 0]));
  for (const i of payload.test_idx) {
    const label = payload.rows[i]![targetIndex]!.trim();
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return classes.map((c) => counts.get(c)!);
}

/**
 * S7 — clasificar en VARIAS categorías (ADR 015). Las mismas garantías que la
 * binaria: partición estratificada por índices, fuga por clase SOLO en train
 * (cada clase contra el resto, con soporte mínimo — D8), y E2 con el roster de
 * K clases. La métrica primaria es la exactitud balanceada (STOP de la F0) y k
 * de la CV está acotado por la clase MÁS CHICA de train (P4).
 */
function prepareMulticlass(
  table: CsvTable,
  targetColumn: string,
  rows: string[][],
  labels: readonly string[],
  detected: number,
  seed: number,
  options: RunOptions,
): PreparedRun {
  const trimmed = labels.map((l) => l.trim());
  const classes = targetClasses(trimmed).sort(byCodePoint);
  // E1 cuenta números («1» = «1.0»); el entrenador, texto: si difieren, el
  // problema es la notación, y se dice así (como en la binaria, AU-S5-10).
  if (classes.length !== detected) {
    return { ok: false, error: "target-mixed-notation" };
  }

  const { numeric, categorical } = selectFeatures(table, targetColumn);
  if (numeric.length + categorical.length === 0)
    return { ok: false, error: "no-features" };

  const { trainIdx, testIdx } = stratifiedSplit(trimmed, TEST_SIZE, seed);

  const trainLabels = trainIdx.map((i) => trimmed[i]!);
  const leakage = detectLeakageByClass(
    leakageColumns(table, rows, numeric, categorical, trainIdx),
    trainLabels,
  );

  // k acotado por la clase más chica de train: con menos de 2 filas suyas no
  // hay CV estratificada honesta (P4). La clase viaja para nombrarse en pantalla.
  const trainCounts = classes.map(
    (c) => trainLabels.filter((l) => l === c).length,
  );
  const smallestTrain = Math.min(...trainCounts);
  const k = chooseCvK(rows.length, smallestTrain);
  if (k === null) {
    return {
      ok: false,
      error: "too-few-rows-per-class",
      smallestClass: {
        name: classes[trainCounts.indexOf(smallestTrain)]!,
        trainRows: smallestTrain,
      },
    };
  }

  const profile: RouteProfile = {
    task: "multiclase",
    rows: rows.length,
    nTrain: trainIdx.length,
    width: estimateEncodedWidth(
      table.headers,
      rows,
      numeric,
      categorical,
      trainIdx,
    ),
    minorityShare: smallestTrain / trainIdx.length,
    classes: classes.length,
    k,
  };
  const routing = routeModels(
    profile,
    options.ceilingS ?? LEVEL1_CEILING_S,
    options.forced ?? [],
  );

  const payload: PipelinePayload = {
    task: "multiclase",
    headers: table.headers,
    rows,
    target: targetColumn,
    numeric,
    categorical,
    train_idx: trainIdx,
    test_idx: testIdx,
    seed,
    primary_metric: MULTICLASS_PRIMARY_METRIC,
    roster: rosterFor(routing, options.level ?? 1),
    cv_k: k,
    classes,
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

/** S6 (AU-S6-08): filas mínimas de PRUEBA para estimar una cantidad. Con una sola,
 *  el R² no existe; con ninguna, no hay nada que medir. Espejo en pipeline.py. */
export const MIN_REGRESSION_TEST_ROWS = 2;

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
  // Con menos filas de prueba no hay métricas que creer (AU-S6-08).
  if (testIdx.length < MIN_REGRESSION_TEST_ROWS)
    return { ok: false, error: "too-few-rows-quantity" };
  const leakage = detectLeakageContinuous(
    leakageColumns(table, rows, numeric, categorical, trainIdx),
    trainIdx.map((i) => y[i]),
  );

  // Sin clases que cuidar, k solo está acotado por las filas de train.
  const k = chooseCvK(rows.length, trainIdx.length);
  if (k === null) return { ok: false, error: "too-few-rows-quantity" };

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
    BASELINE_IDS_BY_TASK.binaria.map((id) => py.baselines[id]),
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
    BASELINE_IDS_BY_TASK.binaria.map((id) => result.baselines[id]),
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
  // Las unidades que son PALABRAS se leerían en español con la UI en inglés
  // (AU-S6-26): los días van con su símbolo, «d», aceptado junto al SI; meses y
  // años no tienen uno, así que no se inventa: «en las unidades de «columna»».
  dias: "d",
  c: "°C",
  pct: "%",
};

export function inferUnit(column: string): TargetUnit {
  const match = /[_\s-]([a-z0-9]+)$/i.exec(column.trim());
  const suffix = match ? match[1].toLowerCase() : null;
  return { symbol: suffix ? (UNIT_SUFFIXES[suffix] ?? null) : null };
}

/**
 * El baseline de regresión a batir: el de menor MAE (la regla de METRIC_RULES vía
 * pickBestBaseline; en empate, la mediana, que es la primera). La UI lo nombra en
 * el veredicto («adivinar siempre la mediana» o «una regresión lineal»).
 */
export function bestRegressionBaseline(
  baselines: RegressionBaselines,
): keyof RegressionBaselines {
  // La lista de datos es la fuente (AU-S6-28): ningún par se nombra a mano.
  const ids = BASELINE_IDS_BY_TASK.numerica;
  const scored = ids.map((id) => baselines[id]);
  return ids[scored.indexOf(pickBestBaseline(scored, "mae"))]!;
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

// --- S7: varias categorías ---------------------------------------------------

/**
 * El baseline multiclase a batir: el de mayor exactitud balanceada (la regla de
 * METRIC_RULES vía pickBestBaseline; en empate, la mayoritaria, que es la primera).
 */
export function bestMulticlassBaseline(
  baselines: MulticlassBaselines,
): keyof MulticlassBaselines {
  const ids = BASELINE_IDS_BY_TASK.multiclase;
  const scored = ids.map((id) => baselines[id]);
  return ids[
    scored.indexOf(pickBestBaseline(scored, MULTICLASS_PRIMARY_METRIC))
  ]!;
}

/**
 * Ensambla el resultado de VARIAS categorías con lo que el lector (contract.ts)
 * validó: veredicto en exactitud balanceada contra el mejor baseline (mayoritaria o
 * logística multinomial), matriz K×K y métricas por clase.
 */
export function assembleMulticlassResult(
  py: MulticlassPipelineResult,
  leakage: LeakageFinding[],
  smallSample = false,
): MulticlassResult {
  const bestBaseline = py.baselines[bestMulticlassBaseline(py.baselines)];
  return {
    task: "multiclase",
    classes: py.classes,
    nTrain: py.n_train,
    nTest: py.n_test,
    baselines: py.baselines,
    model: py.model,
    modelName: py.model_name,
    candidates: candidatesOf<MulticlassMetrics>(py),
    league: py.league,
    selection: {
      by: "cv",
      cvWinner: py.winner,
      best: py.cv.best,
      k: py.cv.k,
      metric: MULTICLASS_PRIMARY_METRIC,
      rule: py.cv.rule,
      se: py.cv.se,
      competitors: py.league.length,
      elapsedMs: py.elapsed_ms,
    },
    smallSample,
    rareCategories: py.preprocessing.rare_categories,
    confusionMatrix: py.confusion_matrix,
    perClass: py.per_class,
    verdict: computeVerdict(py.model, bestBaseline, MULTICLASS_PRIMARY_METRIC),
    leakage,
    explainability: py.explainability,
  };
}

/** Elección manual con varias categorías (U1): mismo baseline, el veredicto habla
 *  del elegido; la liga y el ganador de la CV no cambian. */
export function applyMulticlassMemberFit(
  result: MulticlassResult,
  fit: MulticlassMemberFitResult,
): MulticlassResult {
  const bestBaseline =
    result.baselines[bestMulticlassBaseline(result.baselines)];
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
    perClass: fit.per_class,
    verdict: computeVerdict(fit.model, bestBaseline, MULTICLASS_PRIMARY_METRIC),
    explainability: fit.explainability,
  };
}

// --- S7: agrupar sin objetivo (ADR 016) ------------------------------------

/** Por qué una columna no entra a agrupar (se lista en pantalla, P5). */
export type ClusterExclusion = { column: string; reason: "id-like" | "date" };

export type PreparedClusterRun =
  | {
      ok: true;
      payload: ClusterPayload;
      /** Las columnas que no forman parte, con su razón (ninguna se esconde). */
      excluded: ClusterExclusion[];
      routing: Routing;
      profile: RouteProfile;
      smallSample: boolean;
    }
  | { ok: false; error: WorkerErrorKind };

/**
 * S7 (P5) — la entrada de agrupar, APARTE de prepareRun (la rama supervisada no
 * se toca). Sin objetivo ni partición: todas las filas, todas las columnas menos
 * las fechas y las que parecen identificador (listadas con su razón). La distancia
 * usa solo las numéricas si hay al menos CLUSTER_MIN_NUMERIC; si no, también las
 * categóricas (one-hot). Python recibe la decisión y la coteja, no la re-deriva.
 */
export function prepareClusterRun(
  table: CsvTable,
  seed: number,
  options: Omit<RunOptions, "ambiguousChoice"> = {},
): PreparedClusterRun {
  const rows = table.rows;
  const idLike = new Set(
    clusterEdaAlerts(table).flatMap((a) =>
      a.kind === "id-like" ? [a.column] : [],
    ),
  );
  const excluded: ClusterExclusion[] = [];
  const numeric: string[] = [];
  const categorical: string[] = [];
  for (const profile of profileTable(table)) {
    if (profile.looksLikeDate) {
      excluded.push({ column: profile.name, reason: "date" });
    } else if (idLike.has(profile.name)) {
      excluded.push({ column: profile.name, reason: "id-like" });
    } else {
      (profile.kind === "numeric" ? numeric : categorical).push(profile.name);
    }
  }
  if (numeric.length + categorical.length === 0)
    return { ok: false, error: "no-features" };

  // Cada re-muestreo de la estabilidad necesita al menos k + 1 filas.
  const kMax = clusterKCap(rows.length);
  if (kMax < CLUSTER_K_MIN) return { ok: false, error: "too-few-rows-cluster" };

  const distance = numeric.length >= CLUSTER_MIN_NUMERIC ? "numeric" : "all";
  const all = rows.map((_, i) => i);
  const profile: RouteProfile = {
    task: "agrupar",
    rows: rows.length,
    nTrain: rows.length,
    width:
      distance === "numeric"
        ? numeric.length
        : estimateEncodedWidth(table.headers, rows, numeric, categorical, all),
    minorityShare: null,
    k: kMax,
  };
  const routing = routeModels(
    profile,
    options.ceilingS ?? LEVEL1_CEILING_S,
    options.forced ?? [],
  );
  return {
    ok: true,
    payload: {
      task: "agrupar",
      headers: table.headers,
      rows,
      numeric,
      categorical,
      distance,
      seed,
      roster: rosterFor(routing, options.level ?? 1),
      k_range: [CLUSTER_K_MIN, kMax],
      stability_runs: STABILITY_RUNS,
    },
    excluded,
    routing,
    profile,
    smallSample: rows.length < SMALL_SAMPLE_ROWS,
  };
}

/** Lo que el lector de agrupar coteja: lo que TS envió y sabe. */
export function clusterSent(payload: ClusterPayload): ClusterSent {
  return {
    roster: payload.roster,
    k_range: payload.k_range,
    n_rows: payload.rows.length,
    distance: payload.distance,
    stability_runs: payload.stability_runs,
    numeric: payload.numeric,
    categorical: payload.categorical,
  };
}

/** Lo que el lector coteja al elegir otro agrupador, sacado del resultado vigente
 *  (que ya pasó por el lector): sus filas, su rango de k, su distancia y las
 *  columnas de sus perfiles. */
export function clusterSentOf(result: ClusterResult): ClusterSent {
  const first = result.profiles.groups[0];
  return {
    roster: result.league.map((row) => row.name),
    k_range: result.kRange,
    n_rows: result.nRows,
    distance: result.distance,
    stability_runs: result.reading.stability.runs,
    numeric: first ? Object.keys(first.numeric) : [],
    categorical: first ? Object.keys(first.categorical) : [],
  };
}

/** Ensambla el resultado de AGRUPAR con lo que el lector validó. */
export function assembleClusterResult(
  py: ClusterPipelineResult,
  smallSample = false,
): ClusterResult {
  return {
    task: "agrupar",
    nRows: py.n_rows,
    distance: py.distance,
    silhouetteSample: py.silhouette_sample,
    kRange: py.k_range,
    modelName: py.model_name,
    league: py.league,
    selection: {
      by: "consensus",
      consensusWinner: py.winner,
      k: py.consensus.k,
      votes: py.consensus.votes,
      voters: py.consensus.voters,
      competitors: py.league.length,
      elapsedMs: py.elapsed_ms,
    },
    reading: py.reading,
    profiles: py.profiles,
    assignment: py.assignment,
    rareCategories: py.preprocessing.rare_categories,
    smallSample,
  };
}

/** Elección manual al agrupar (U1): la lectura, los perfiles y la regla pasan a
 *  ser los del elegido; la liga y el ganador por consenso no cambian. */
export function applyClusterMemberFit(
  result: ClusterResult,
  fit: ClusterMemberFitResult,
): ClusterResult {
  return {
    ...result,
    modelName: fit.model_name,
    selection: {
      ...result.selection,
      by:
        fit.model_name === result.selection.consensusWinner
          ? "consensus"
          : "user",
    },
    reading: fit.reading,
    profiles: fit.profiles,
    assignment: fit.assignment,
    rareCategories: fit.preprocessing.rare_categories,
  };
}

/** El payload de fit-member al agrupar: el de la liga sin el roster. */
export function withoutClusterLeague(
  payload: ClusterPayload,
  member: MemberId,
): ClusterFitMemberPayload {
  const copy: Partial<ClusterPayload> = { ...payload };
  delete copy.roster;
  return { ...(copy as Omit<ClusterPayload, "roster">), member };
}

/**
 * S7: lo que la app sabe del agrupador ACTIVO para puntuar, sin pedírselo al
 * worker: las columnas de la distancia (las mismas que retiene pipeline.py), el k
 * del retenido, si su regla deja filas «fuera de todo grupo» y la regla. Los
 * centroides viven en el worker y viajan solo en el archivo exportado (P12).
 */
export function clusterScoringSchema(
  result: ClusterResult,
  payload: Pick<ClusterPayload, "numeric" | "categorical" | "distance">,
): ClusterScoringSchema {
  const row = result.league.find((r) => r.name === result.modelName);
  if (!row || row.k === null) {
    throw new Error("clusterScoringSchema: el retenido no está en la liga");
  }
  return {
    numeric: [...payload.numeric],
    categorical: payload.distance === "numeric" ? [] : [...payload.categorical],
    task: "agrupar",
    groups: row.k,
    noise: result.assignment.method === "centroid-radius",
    assign: {
      method: result.assignment.method,
      sample_rows: result.assignment.sample_rows,
    },
  };
}
