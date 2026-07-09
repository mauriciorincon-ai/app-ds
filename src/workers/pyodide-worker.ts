/// <reference lib="webworker" />
//
// Worker de cómputo: carga Pyodide bajo demanda (self-hosteado en /pyodide/),
// y expone —vía protocol.ts— la ingesta y el experimento. La UI nunca habla WASM
// directo. El runtime en navegador se valida con el e2e (Fase 3); la lógica pura
// que orquesta (split/verdict/leakage) ya está cubierta por tests unit.
import type { PyodideInterface } from "pyodide";
import { stratifiedSplit } from "@/engine/split";
import { detectLeakage, type LeakageColumn } from "@/engine/leakage";
import {
  computeVerdict,
  pickBestBaseline,
  pickPrimaryMetric,
  type Metrics,
} from "@/engine/verdict";
import {
  columnValues,
  isBinaryTarget,
  isNullToken,
  parseCsvWithLimits,
  parseNumber,
  profileTable,
  targetClasses,
  type ColumnProfile,
  type CsvTable,
} from "@/lib/ds/csv";
import type {
  ExperimentResult,
  WorkerErrorKind,
  WorkerRequest,
  WorkerResponse,
} from "./protocol";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

type PyodideModule = {
  loadPyodide: (options: { indexURL: string }) => Promise<PyodideInterface>;
};

const PREVIEW_ROWS = 20;
const TEST_SIZE = 0.25;

let pyodide: PyodideInterface | null = null;
let runExperimentPy: ((payloadJson: string) => string) | null = null;
let table: CsvTable | null = null;
let profiles: ColumnProfile[] = [];

function post(message: WorkerResponse): void {
  ctx.postMessage(message);
}

class WorkerError extends Error {
  constructor(
    readonly kind: WorkerErrorKind,
    message: string,
  ) {
    super(message);
  }
}

async function ensureRuntime(id: number): Promise<{
  py: PyodideInterface;
  run: (payloadJson: string) => string;
}> {
  if (pyodide && runExperimentPy) {
    return { py: pyodide, run: runExperimentPy };
  }

  post({ id, type: "progress", stage: "loading-runtime" });
  const base = new URL("/pyodide/", ctx.location.origin).href;
  // Import dinámico del loader self-hosteado; el especificador es runtime para
  // que el bundler no intente resolverlo en build.
  const loaderUrl = `${base}pyodide.mjs`;
  const mod = (await import(
    /* turbopackIgnore: true */ loaderUrl
  )) as PyodideModule;
  const py = await mod.loadPyodide({ indexURL: base });

  post({ id, type: "progress", stage: "loading-packages" });
  await py.loadPackage(["pandas", "scikit-learn"]);

  const source = await (await fetch(`${base}pipeline.py`)).text();
  py.runPython(source);
  const run = py.globals.get("run_experiment") as unknown as (
    payloadJson: string,
  ) => string;

  pyodide = py;
  runExperimentPy = run;
  return { py, run };
}

function summarize(loaded: CsvTable, columnProfiles: ColumnProfile[]) {
  const targetCandidates = loaded.headers.filter((_, index) =>
    isBinaryTarget(columnValues(loaded, index)),
  );
  const dateColumns = columnProfiles
    .filter((p) => p.looksLikeDate)
    .map((p) => p.name);
  return {
    headers: loaded.headers,
    rowCount: loaded.rows.length,
    profiles: columnProfiles,
    previewRows: loaded.rows.slice(0, PREVIEW_ROWS),
    targetCandidates,
    dateColumns,
  };
}

function loadDataset(id: number, csvText: string): void {
  const parsed = parseCsvWithLimits(csvText);
  if (!parsed.ok) {
    const map: Record<string, WorkerErrorKind> = {
      empty: "csv-empty",
      "too-large": "csv-too-large",
      "too-many-rows": "csv-too-many-rows",
      ragged: "csv-ragged",
    };
    throw new WorkerError(
      map[parsed.error.kind],
      `CSV inválido: ${parsed.error.kind}`,
    );
  }
  table = parsed.table;
  profiles = profileTable(table);
  post({ id, type: "dataset", summary: summarize(table, profiles) });
}

// Features = columnas no-objetivo, no-fecha. Numéricas/categóricas según perfil.
function selectFeatures(targetColumn: string) {
  const numeric: string[] = [];
  const categorical: string[] = [];
  for (const profile of profiles) {
    if (profile.name === targetColumn || profile.looksLikeDate) continue;
    (profile.kind === "numeric" ? numeric : categorical).push(profile.name);
  }
  return { numeric, categorical };
}

type PipelineResult = {
  positive_class: string;
  positive_rate: number;
  n_train: number;
  n_test: number;
  baselines: { majority: Metrics; logistic: Metrics };
  model: Metrics;
  confusion_matrix: number[][];
};

function leakageOnTrain(
  loaded: CsvTable,
  targetIndex: number,
  trainIdx: number[],
  numeric: string[],
): LeakageFindingInput {
  const trainTargetRaw = trainIdx.map((i) => loaded.rows[i][targetIndex]);
  const classes = targetClasses(trainTargetRaw).sort();
  const target = trainTargetRaw.map((v) =>
    v.trim() === classes[1] ? 1 : 0,
  ) as (0 | 1)[];
  const numericSet = new Set(numeric);

  const columns: LeakageColumn[] = loaded.headers
    .map((name, index) => ({ name, index }))
    .filter(({ index }) => index !== targetIndex)
    .map(({ name, index }) => {
      const raw = trainIdx.map((i) => loaded.rows[i][index]);
      return numericSet.has(name)
        ? {
            name,
            kind: "numeric" as const,
            values: raw.map((v) => parseNumber(v)),
          }
        : {
            name,
            kind: "categorical" as const,
            values: raw.map((v) => (isNullToken(v) ? null : v.trim())),
          };
    });

  return { columns, target };
}

type LeakageFindingInput = { columns: LeakageColumn[]; target: (0 | 1)[] };

function runExperiment(id: number, targetColumn: string, seed: number): void {
  if (!table || !runExperimentPy) {
    throw new WorkerError(
      "runtime",
      "No hay dataset cargado o el runtime no está listo.",
    );
  }
  const loaded = table;
  const targetIndex = loaded.headers.indexOf(targetColumn);

  // Filtra filas con objetivo nulo (no se pueden entrenar/evaluar).
  const validIdx = loaded.rows
    .map((_, i) => i)
    .filter((i) => !isNullToken(loaded.rows[i][targetIndex]));
  const rows = validIdx.map((i) => loaded.rows[i]);
  const labels = rows.map((r) => r[targetIndex]);

  if (!isBinaryTarget(labels)) {
    throw new WorkerError(
      "target-not-binary",
      "El objetivo debe tener exactamente dos clases.",
    );
  }

  const { numeric, categorical } = selectFeatures(targetColumn);
  if (numeric.length + categorical.length === 0) {
    throw new WorkerError(
      "no-features",
      "No hay columnas utilizables como predictores.",
    );
  }

  const { trainIdx, testIdx } = stratifiedSplit(labels, TEST_SIZE, seed);

  post({ id, type: "progress", stage: "training" });
  const raw = runExperimentPy(
    JSON.stringify({
      headers: loaded.headers,
      rows,
      target: targetColumn,
      numeric,
      categorical,
      train_idx: trainIdx,
      test_idx: testIdx,
      seed,
    }),
  );
  const py = JSON.parse(raw) as PipelineResult;

  const primaryMetric = pickPrimaryMetric(py.positive_rate);
  const bestBaseline = pickBestBaseline(
    [py.baselines.majority, py.baselines.logistic],
    primaryMetric,
  );
  const verdict = computeVerdict(py.model, bestBaseline, primaryMetric);

  // Fuga: sobre las filas de train (subconjunto válido), honesto.
  const trainRowsInValid = trainIdx.map((i) => validIdx[i]);
  const { columns, target } = leakageOnTrain(
    loaded,
    targetIndex,
    trainRowsInValid,
    numeric,
  );
  const leakage = detectLeakage(columns, target);

  const result: ExperimentResult = {
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
  post({ id, type: "result", result });
}

ctx.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "init") {
      await ensureRuntime(request.id);
      post({ id: request.id, type: "ready" });
    } else if (request.type === "loadDataset") {
      loadDataset(request.id, request.csvText);
    } else if (request.type === "runExperiment") {
      await ensureRuntime(request.id);
      runExperiment(request.id, request.targetColumn, request.seed);
    }
  } catch (error) {
    const kind: WorkerErrorKind =
      error instanceof WorkerError ? error.kind : "runtime";
    const message = error instanceof Error ? error.message : String(error);
    post({ id: request.id, type: "error", error: { kind, message } });
  }
};
