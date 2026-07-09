// Orquestación pura del experimento (hilo principal): perfila, valida, arma el
// split anti-fuga y la advertencia de fuga, y ensambla el veredicto a partir de
// las métricas que devuelve Pyodide. Todo aquí es puro y testeable; el cómputo
// pesado (entrenar) vive en el runner de Pyodide.
import {
  detectLeakage,
  type LeakageColumn,
  type LeakageFinding,
} from "@/engine/leakage";
import { stratifiedSplit } from "@/engine/split";
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
  return {
    headers: table.headers,
    rowCount: table.rows.length,
    profiles,
    previewRows: table.rows.slice(0, PREVIEW_ROWS),
    targetCandidates,
    dateColumns,
  };
}

export type PreparedRun =
  | { ok: true; payload: PipelinePayload; leakage: LeakageFinding[] }
  | { ok: false; error: WorkerErrorKind };

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
): PreparedRun {
  const targetIndex = table.headers.indexOf(targetColumn);

  // Filtra filas con objetivo nulo (no se pueden entrenar/evaluar).
  const rows = table.rows.filter((row) => !isNullToken(row[targetIndex]));
  const labels = rows.map((row) => row[targetIndex]);
  if (!isBinaryTarget(labels)) return { ok: false, error: "target-not-binary" };

  const { numeric, categorical } = selectFeatures(table, targetColumn);
  if (numeric.length + categorical.length === 0)
    return { ok: false, error: "no-features" };

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

  const payload: PipelinePayload = {
    headers: table.headers,
    rows,
    target: targetColumn,
    numeric,
    categorical,
    train_idx: trainIdx,
    test_idx: testIdx,
    seed,
  };
  return { ok: true, payload, leakage };
}

export function assembleResult(
  py: PipelineResult,
  leakage: LeakageFinding[],
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
    confusionMatrix: py.confusion_matrix,
    verdict,
    leakage,
  };
}
