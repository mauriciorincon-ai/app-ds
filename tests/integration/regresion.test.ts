// @vitest-environment node
//
// Estimar una cantidad (S6, ADR-013) en el Pyodide REAL, cargado como en el
// navegador. Garantías que estos tests hacen FALLAR si se rompen:
//  - paridad TS ↔ Python del roster de regresión y de la dirección de cada métrica;
//  - anti-fuga de la CV (KFold): el preprocesador se reajusta en CADA fold, nunca
//    ve su validación ni el test; el test se abre después de la CV;
//  - la selección no mira el test: permutar los valores de test no cambia ni el
//    ganador ni un puntaje de CV;
//  - los 11 regresores entrenan sobre nulos y categóricas; uno roto no tumba la
//    liga y solo viaja el TIPO de error;
//  - fit_member reproduce EXACTAMENTE su fila (incluidos los que usan azar);
//  - export → import → puntuar con ganador lineal y con LightGBM: mismas estimaciones;
//  - un archivo del S5 importa y puntúa igual que en el S5;
//  - el lector TS → Python (_validate_payload) rechaza cada carnada nombrando el
//    campo («detectó k de n»);
//  - el emisor escribe los fixtures de regresión (CONTRATO_ACTUALIZAR=1).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PyodideInterface } from "pyodide";
import {
  REGRESSION_MEMBER_IDS,
  selectOneSe,
  type MemberId,
} from "@/engine/roster";
import { sanitizeTable } from "@/engine/sanitize";
import { METRIC_RULES } from "@/engine/verdict";
import { parseCsvWithLimits } from "@/lib/ds/csv";
import {
  applyRegressionMemberFit,
  assembleRegressionResult,
  prepareRun,
  withoutLeague,
  type RunOptions,
} from "@/lib/experiment";
import { manifestTask, validateModelFile } from "@/lib/model-file";
import {
  pythonContractField,
  validateExportResult,
  validateMemberFit,
  validateProgressDetail,
  validateScoreResult,
  validateTrainResult,
} from "@/workers/contract";
import type {
  BinaryScoreResult,
  ExportResult,
  PipelinePayload,
  RegressionMemberFitResult,
  RegressionPipelineResult,
  RegressionScoreResult,
} from "@/workers/protocol";
import { regresionSintetica } from "../../scripts/spike-regresion/datos.mjs";
import { loadRuntime, pyFunction } from "./runtime";

let py: PyodideInterface;
let runExperiment: (
  payload: string,
  onProgress?: (d: string) => void,
) => string;
let fitMember: (payload: string) => string;
let scoreNewData: (payload: string) => string;
let exportModel: (payload?: string) => string;
let importModel: (payload: string) => string;
let resetModel: (payload?: string) => string;

beforeAll(async () => {
  py = await loadRuntime();
  runExperiment = pyFunction(py, "run_experiment");
  fitMember = pyFunction(py, "fit_member");
  scoreNewData = pyFunction(py, "score_new_data");
  exportModel = pyFunction(py, "export_model");
  importModel = pyFunction(py, "import_model");
  resetModel = pyFunction(py, "reset_model");
}, 300_000);

const kitCsv = (file: string) =>
  readFileSync(resolve(process.cwd(), "public/datasets", file), "utf8");

/** Por el camino REAL de la app: parse → saneamiento → prepareRun (rama numérica). */
function prepared(csv: string, target: string, options: RunOptions = {}) {
  const parsed = parseCsvWithLimits(csv);
  if (!parsed.ok) throw new Error(`parse: ${parsed.error.kind}`);
  const run = prepareRun(
    sanitizeTable(parsed.table).table,
    target,
    42,
    options,
  );
  if (!run.ok) throw new Error(`prepare: ${run.error}`);
  expect(run.payload.task).toBe("numerica");
  return run;
}

const league = (payload: PipelinePayload, onProgress?: (d: string) => void) =>
  JSON.parse(
    runExperiment(JSON.stringify(payload), onProgress),
  ) as RegressionPipelineResult;

const sent = (payload: PipelinePayload) => ({
  task: "numerica" as const,
  roster: payload.roster,
  cv_k: payload.cv_k,
  primary_metric: payload.primary_metric,
});

const consumo = () => prepared(kitCsv("consumo-energia.csv"), "consumo_kwh");

describe("paridad TS ↔ Python en el runtime real (regresión)", () => {
  it("pipeline.py conoce EXACTAMENTE el roster de regresión de engine/roster.ts", () => {
    const ids = JSON.parse(
      pyFunction(py, "roster_ids")(JSON.stringify({ task: "numerica" })),
    ) as string[];
    expect(ids).toEqual([...REGRESSION_MEMBER_IDS].sort());
  });

  it("la dirección de cada métrica primaria es la de METRIC_RULES", () => {
    const { direction, task_metrics } = JSON.parse(
      pyFunction<[]>(py, "metric_directions")(),
    ) as {
      direction: Record<string, string>;
      task_metrics: Record<string, string[]>;
    };
    expect(direction).toEqual(
      Object.fromEntries(
        Object.entries(METRIC_RULES).map(([k, rule]) => [k, rule.direction]),
      ),
    );
    expect(task_metrics.numerica).toEqual(["mae"]);
  });
});

describe("anti-fuga de la validación cruzada en regresión (espía en el preprocesador)", () => {
  const SPY = `
from sklearn.base import BaseEstimator, TransformerMixin, clone as _clone
SPY_LOG = []
class _Spy(TransformerMixin, BaseEstimator):
    def __init__(self, inner=None):
        self.inner = inner
    def fit(self, X, y=None):
        SPY_LOG.append(sorted(int(i) for i in X.index))
        self.inner_ = _clone(self.inner).fit(X, y)
        return self
    def transform(self, X):
        return self.inner_.transform(X)
    @property
    def named_transformers_(self):
        return self.inner_.named_transformers_
_REAL_MAKE_PREPROCESSOR = _make_preprocessor
def _make_preprocessor(numeric, categorical):
    return _Spy(_REAL_MAKE_PREPROCESSOR(numeric, categorical))
`;
  const RESTORE = `
_make_preprocessor = _REAL_MAKE_PREPROCESSOR
SPY_LOG.clear()
`;

  it("cada fold reajusta sin ver su validación; train completo solo DESPUÉS de la CV", () => {
    const run = consumo();
    const roster: MemberId[] = ["linear", "decision_tree", "hgb"];
    const payload = { ...run.payload, roster };
    const k = payload.cv_k;
    py.runPython(SPY);
    let fits: number[][];
    try {
      league(payload);
      fits = (py.globals.get("SPY_LOG").toJs() as number[][]).map((f) => [
        ...f,
      ]);
    } finally {
      py.runPython(RESTORE);
    }
    const train = new Set(payload.train_idx);
    const test = new Set(payload.test_idx);
    for (const fit of fits) expect(fit.some((i) => test.has(i))).toBe(false);

    const cvFits = fits.slice(0, k * roster.length);
    expect(cvFits).toHaveLength(k * roster.length);
    for (let m = 0; m < roster.length; m++) {
      const covered = new Set<number>();
      for (const fit of cvFits.slice(m * k, (m + 1) * k)) {
        expect(fit.length).toBeLessThan(train.size);
        const seen = new Set(fit);
        for (const i of [...train].filter((i) => !seen.has(i))) {
          expect(covered.has(i)).toBe(false);
          covered.add(i);
        }
      }
      expect(covered.size).toBe(train.size);
    }
    const full = fits.map((fit) => fit.length === train.size);
    expect(full.slice(0, cvFits.length).some(Boolean)).toBe(false);
    // Recién ahora se abre el test: 2 baselines (mediana, lineal) + 3 miembros.
    expect(full.slice(cvFits.length).filter(Boolean)).toHaveLength(
      2 + roster.length,
    );
  });
});

describe("la selección de regresión no mira el test", () => {
  it("permutar los valores de test no cambia ni el ganador ni un puntaje de CV", () => {
    const run = consumo();
    const base = league(run.payload);
    const target = run.payload.headers.indexOf(run.payload.target);
    const rows = run.payload.rows.map((row) => [...row]);
    const values = run.payload.test_idx.map((i) => rows[i]![target]!);
    values.reverse();
    run.payload.test_idx.forEach((i, j) => {
      rows[i]![target] = values[j]!;
    });
    const shuffled = league({ ...run.payload, rows });
    expect(shuffled.winner).toBe(base.winner);
    expect(shuffled.cv).toEqual(base.cv);
    expect(shuffled.league.map((r) => r.cv)).toEqual(
      base.league.map((r) => r.cv),
    );
    expect(shuffled.league.map((r) => r.test)).not.toEqual(
      base.league.map((r) => r.test),
    );
  });
});

describe("cada regresor en el runtime real", () => {
  // Sintético con nulos (~5 %) y categóricas, 300 filas: los 11 (el MLP, que E2
  // dejaría fuera con < 500 filas, aquí se fuerza).
  const csv = regresionSintetica({ n: 300, seed: 7 });

  it("los 11 entrenan con el preprocesador compartido sobre nulos y categóricas", () => {
    const run = prepared(csv, "objetivo");
    const roster = [...REGRESSION_MEMBER_IDS];
    const result = league({ ...run.payload, roster });
    expect(result.league.map((r) => r.name)).toEqual(roster);
    for (const row of result.league) {
      expect(row.status, row.name).not.toBe("error");
      expect(row.cv!.folds, row.name).toHaveLength(run.payload.cv_k);
      expect(row.test, row.name).not.toBeNull();
      // MAE de CV en las unidades del objetivo (≈ 50 ± 20): positivo.
      expect(row.cv!.mean, row.name).toBeGreaterThan(0);
    }
    expect(
      validateTrainResult(result, { ...sent(run.payload), roster }).ok,
    ).toBe(true);
  });

  it("un regresor roto no tumba la liga y solo viaja el TIPO de error", () => {
    const run = prepared(csv, "objetivo");
    py.runPython(`
from sklearn.base import BaseEstimator, RegressorMixin
class _BrokenReg(RegressorMixin, BaseEstimator):
    def fit(self, X, y):
        raise ValueError("valor-secreto-del-dataset 4321")
_REAL_KNN_REG = _REGRESSORS["knn"]
_REGRESSORS["knn"] = lambda seed: _BrokenReg()
`);
    const roster: MemberId[] = ["linear", "knn", "hgb"];
    let result: RegressionPipelineResult;
    try {
      result = league({ ...run.payload, roster });
    } finally {
      py.runPython(`_REGRESSORS["knn"] = _REAL_KNN_REG`);
    }
    const broken = result.league.find((r) => r.name === "knn")!;
    expect(broken.status).toBe("error");
    expect(broken.error_type).toBe("ValueError");
    expect(JSON.stringify(result)).not.toContain("valor-secreto");
    expect(result.winner).not.toBe("knn");
    expect(
      validateTrainResult(result, { ...sent(run.payload), roster }).ok,
    ).toBe(true);
  });
});

describe("elección manual y export en regresión", () => {
  const memberPayload = (payload: PipelinePayload, member: MemberId) => ({
    ...withoutLeague(payload),
    member,
  });

  it("fit_member reproduce EXACTAMENTE el test de su fila (también los que usan azar)", () => {
    const r = consumo();
    const roster: MemberId[] = [
      "linear",
      "knn",
      "lightgbm",
      "xgboost",
      "extra_trees",
      "forest",
      "mlp",
    ];
    const payload = { ...r.payload, roster };
    const result = league(payload);
    for (const member of roster.slice(1)) {
      const fit = JSON.parse(
        fitMember(JSON.stringify(memberPayload(payload, member))),
      ) as RegressionMemberFitResult;
      expect(
        validateMemberFit(fit, {
          member,
          task: "numerica",
          nTest: payload.test_idx.length,
        }).ok,
      ).toBe(true);
      expect(fit.model, member).toEqual(
        result.league.find((x) => x.name === member)!.test,
      );
    }
  });

  it.each(["linear", "lightgbm"] as MemberId[])(
    "export → import → puntuar con %s: mismas estimaciones, sin probabilidad",
    (member) => {
      const r = consumo();
      JSON.parse(fitMember(JSON.stringify(memberPayload(r.payload, member))));
      const features = [...r.payload.numeric, ...r.payload.categorical];
      const idx = features.map((f) => r.payload.headers.indexOf(f));
      const newRows = {
        headers: features,
        rows: r.payload.test_idx
          .slice(0, 12)
          .map((i) => idx.map((j) => r.payload.rows[i]![j]!)),
      };
      const before = JSON.parse(scoreNewData(JSON.stringify(newRows)));
      const checked = validateScoreResult(before, { task: "numerica" });
      expect(checked.ok).toBe(true);
      const exported = JSON.parse(exportModel("{}")) as ExportResult;
      expect(validateExportResult(exported).ok).toBe(true);
      expect(exported.schema.task).toBe("numerica");
      resetModel();
      importModel(
        JSON.stringify({
          payload_b64: exported.payload_b64,
          expected_schema: exported.schema,
        }),
      );
      const after = JSON.parse(
        scoreNewData(JSON.stringify(newRows)),
      ) as RegressionScoreResult;
      expect(after.predictions).toEqual(
        (before as RegressionScoreResult).predictions,
      );
      expect(after.probabilities).toBeNull();
      expect(after.predictions.every(Number.isFinite)).toBe(true);
    },
  );

  it("el esquema exportado trae el objetivo de TRAIN con los decimales del usuario", () => {
    const r = consumo();
    JSON.parse(fitMember(JSON.stringify(memberPayload(r.payload, "linear"))));
    const exported = JSON.parse(exportModel("{}")) as ExportResult;
    if (exported.schema.task !== "numerica") throw new Error("esquema binario");
    const stats = exported.schema.target_stats;
    // consumo_kwh viene con 1 decimal.
    expect(stats.decimals).toBe(1);
    const target = r.payload.headers.indexOf("consumo_kwh");
    const trainValues = r.payload.train_idx.map((i) =>
      Number(r.payload.rows[i]![target]),
    );
    expect(stats.min).toBe(Math.min(...trainValues));
    expect(stats.max).toBe(Math.max(...trainValues));
  });
});

describe("un archivo del S5 importa (P8)", () => {
  it("valida, se restaura en el pipeline del S6 y puntúa EXACTAMENTE como en el S5", async () => {
    const text = readFileSync(
      resolve(process.cwd(), "tests/fixtures/modelos/modelo-s5.probeta.json"),
      "utf8",
    );
    const expected = JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          "tests/fixtures/modelos/modelo-s5.esperado.json",
        ),
        "utf8",
      ),
    ) as { score_payload: unknown; score: BinaryScoreResult };
    const validation = await validateModelFile(text);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.file.manifest.task).toBeUndefined();
    expect(manifestTask(validation.file.manifest)).toBe("binaria");
    expect(validation.warnings).toEqual([]);

    resetModel();
    importModel(
      JSON.stringify({
        payload_b64: validation.file.payload,
        expected_schema: validation.file.manifest.schema,
      }),
    );
    const score = JSON.parse(
      scoreNewData(JSON.stringify(expected.score_payload)),
    );
    expect(validateScoreResult(score).ok).toBe(true);
    expect(score.predictions).toEqual(expected.score.predictions);
    expect(score.probabilities).toEqual(expected.score.probabilities);
    expect(score.novelty).toEqual(expected.score.novelty);
  });
});

describe("TS → Python: _validate_payload rechaza cada carnada de regresión NOMBRANDO el campo", () => {
  type Bait = [
    field: string,
    fn: "train" | "fit",
    mutate: (p: Record<string, unknown>) => void,
  ];

  it("detecta las carnadas de los campos nuevos (task, roster, métrica, miembro, k)", () => {
    const base = consumo().payload;
    const baits: Bait[] = [
      ["task", "train", (p) => delete p.task],
      ["task", "train", (p) => (p.task = "multiclase")],
      ["task", "train", (p) => (p.task = 1)],
      ["roster", "train", (p) => (p.roster = ["linear", "logistic"])],
      ["primary_metric", "train", (p) => (p.primary_metric = "auc")],
      ["cv_k", "train", (p) => (p.cv_k = (p.train_idx as number[]).length + 1)],
      ["member", "fit", (p) => (p.member = "logistic")],
      ["task", "fit", (p) => (p.task = "binaria-no")],
      // AU-S6-08: menos de 2 filas de prueba no dan métricas que creer.
      [
        "test_idx",
        "train",
        (p) => (p.test_idx = (p.test_idx as number[]).slice(0, 1)),
      ],
    ];
    const missed: string[] = [];
    for (const [field, fn, mutate] of baits) {
      const copy: Record<string, unknown> =
        fn === "train"
          ? structuredClone({ ...base, roster: ["linear", "hgb"] })
          : structuredClone({ ...withoutLeague(base), member: "linear" });
      mutate(copy);
      let got: string | null = "aceptada";
      try {
        (fn === "train" ? runExperiment : fitMember)(JSON.stringify(copy));
      } catch (error) {
        got = pythonContractField(String((error as Error).message));
      }
      if (got !== field) missed.push(`${fn}:${field} → ${got}`);
    }
    console.log(
      `[contrato TS→Python regresión] detectó ${baits.length - missed.length} de ${baits.length} carnadas`,
    );
    expect(missed).toEqual([]);
  });
});

describe("el emisor en los bordes del objetivo", () => {
  it("decimales del objetivo en notación científica: los que de verdad escribe (AU-S6-31)", () => {
    const decimals = py.globals.get("_decimals") as (text: string) => number;
    expect(decimals("1.5e2")).toBe(0);
    expect(decimals("1.5e-3")).toBe(4);
    expect(decimals("3E1")).toBe(0);
    expect(decimals("2.25")).toBe(2);
    expect(decimals("40")).toBe(0);
  });

  it("un objetivo con ceros ⇒ MAPE null en el modelo y los baselines, y el lector lo acepta (AU-S6-32)", () => {
    // Un consumo de 0 cada 3 filas: el error porcentual no existe (se dividiría
    // por cero); se declara null, jamás un número enorme.
    const lines = kitCsv("consumo-energia.csv").trimEnd().split("\n");
    const col = lines[0]!.split(",").indexOf("consumo_kwh");
    const withZeros = [
      lines[0],
      ...lines.slice(1).map((line, i) => {
        if (i % 3 !== 0) return line;
        const cells = line.split(",");
        cells[col] = "0";
        return cells.join(",");
      }),
    ].join("\n");
    const run = prepared(withZeros, "consumo_kwh");
    const payload = { ...run.payload, roster: ["linear", "hgb"] as MemberId[] };
    const result = league(payload);
    expect(result.model.mape).toBeNull();
    expect(result.baselines.median.mape).toBeNull();
    expect(result.baselines.linear.mape).toBeNull();
    expect(validateTrainResult(result, sent(payload)).ok).toBe(true);
  });
});

describe("una tarea registrada sin ramas propias (AU-S6-03)", () => {
  it("se rechaza NOMBRANDO «task», jamás se binariza en silencio", () => {
    // El día que alguien registre «multiclase» en _FACTORIES_BY_TASK sin escribir
    // sus ramas, un objetivo de tres clases NO puede volver como `task: "binaria"`
    // (la minoritaria contra el resto): cada rama pasa por _is_regression.
    const base = consumo().payload;
    const targetIndex = base.headers.indexOf(base.target);
    const rows = base.rows.map((row, i) =>
      row.map((cell, j) => (j === targetIndex ? "abc"[i % 3]! : cell)),
    );
    const payload = {
      ...base,
      rows,
      task: "multiclase",
      primary_metric: "accuracy",
      roster: ["logistic"],
    };
    py.runPython(
      '_FACTORIES_BY_TASK["multiclase"] = _FACTORIES\nTASK_METRICS["multiclase"] = ("accuracy",)',
    );
    let got: string | null = "aceptada";
    try {
      runExperiment(JSON.stringify(payload));
    } catch (error) {
      got = pythonContractField(String((error as Error).message));
    } finally {
      py.runPython(
        'del _FACTORIES_BY_TASK["multiclase"]\ndel TASK_METRICS["multiclase"]',
      );
    }
    expect(got).toBe("task");
  });
});

describe("cruce de punta a punta: prepareRun → Pyodide → contract.ts → assembleRegressionResult", () => {
  it("consumo: el veredicto habla en kWh contra la mediana y la lineal", () => {
    const r = consumo();
    const details: unknown[] = [];
    const raw = league(r.payload, (d) => details.push(JSON.parse(d)));
    expect(details.map(validateProgressDetail).every((c) => c.ok)).toBe(true);
    const checked = validateTrainResult(raw, sent(r.payload));
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const result = assembleRegressionResult(
      checked.value,
      r.leakage,
      r.payload.target,
      r.smallSample,
    );
    expect(result.unit.symbol).toBe("kWh");
    expect(result.verdict.primaryMetric).toBe("mae");
    expect(result.selection.metric).toBe("mae");
    expect(result.selection.cvWinner).toBe(
      selectOneSe(result.league, result.selection.k, "lower")!.winner,
    );
    // La señal del kit es real: el elegido se equivoca menos que la lineal.
    expect(result.verdict.level).toBe("beats");
    expect(result.leakage).toEqual([]);
    expect(result.predVsReal.real.length).toBe(result.nTest);
    expect(result.residuals.p05).toBeLessThanOrEqual(result.residuals.p95);

    // Elegir a mano otro miembro: el veredicto habla del elegido («elegido por ti»).
    const other = r.payload.roster.find(
      (m) => m !== result.selection.cvWinner,
    )!;
    const fit = validateMemberFit(
      JSON.parse(
        fitMember(
          JSON.stringify({ ...withoutLeague(r.payload), member: other }),
        ),
      ),
      { member: other, task: "numerica", nTest: result.nTest },
    );
    expect(fit.ok).toBe(true);
    if (!fit.ok) return;
    const chosen = applyRegressionMemberFit(result, fit.value);
    expect(chosen.selection.by).toBe("user");
    expect(chosen.modelName).toBe(other);
    expect(chosen.verdict.modelScore).toBe(fit.value.model.mae);
  });

  it("precio con fuga plantada: la columna se nombra (|Spearman| sobre train)", () => {
    const r = prepared(kitCsv("precio-fuga-plantada.csv"), "precio_usd");
    expect(r.leakage.map((f) => [f.column, f.reason])).toEqual([
      ["impuesto_transferencia_usd", "near-perfect-rank-correlation"],
    ]);
  });
});

// --- Fixtures del contrato de regresión (emisor real) -----------------------

const FIXTURES = resolve(process.cwd(), "tests/fixtures/contrato");
const UPDATE = process.env.CONTRATO_ACTUALIZAR === "1";

function shape(value: unknown): unknown {
  if (Array.isArray(value))
    return value.length ? ["array", shape(value[0])] : ["array"];
  if (value === null) return "null";
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((k) => [k, shape((value as Record<string, unknown>)[k])]),
    );
  }
  return typeof value;
}

function emit(name: string, value: unknown) {
  const file = resolve(FIXTURES, `${name}.json`);
  if (UPDATE) {
    mkdirSync(FIXTURES, { recursive: true });
    writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
    return;
  }
  expect(
    existsSync(file),
    `falta el fixture ${name}.json (CONTRATO_ACTUALIZAR=1)`,
  ).toBe(true);
  expect(
    shape(value),
    `la forma de ${name} cambió: regenera con CONTRATO_ACTUALIZAR=1 y revisa las carnadas`,
  ).toEqual(shape(JSON.parse(readFileSync(file, "utf8"))));
}

describe("fixtures del contrato de regresión (emisor real: pipeline.py en Pyodide)", () => {
  it("train, fit-member, export, score y el payload de TS", () => {
    // Dataset del kit (público, sintético): sin datos de usuarios en el fixture.
    const r = consumo();
    const payload = {
      ...r.payload,
      roster: ["linear", "ridge", "hgb", "forest"] as MemberId[],
    };
    const train = league(payload);
    const fit = JSON.parse(
      fitMember(JSON.stringify({ ...withoutLeague(payload), member: "ridge" })),
    );
    const features = [...payload.numeric, ...payload.categorical];
    const idx = features.map((f) => payload.headers.indexOf(f));
    const score = JSON.parse(
      scoreNewData(
        JSON.stringify({
          headers: features,
          rows: payload.test_idx
            .slice(0, 3)
            .map((i) => idx.map((j) => payload.rows[i]![j]!)),
        }),
      ),
    );
    const exported = JSON.parse(exportModel("{}"));
    exported.payload_b64 = String(exported.payload_b64).slice(0, 64);
    // El gráfico viaja ENTERO en el fixture: el lector exige el largo exacto
    // (AU-S6-10), así que recortarlo aquí lo obligaría a ablandarse.
    emit("train-result-regresion", train);
    emit("fit-member-result-regresion", fit);
    emit("score-result-regresion", score);
    emit("export-result-regresion", exported);
    emit("payload-regresion", { ...payload, rows: payload.rows.slice(0, 5) });
  });
});
