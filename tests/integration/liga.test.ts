// @vitest-environment node
//
// La liga (S5, ADR-009) en el Pyodide REAL, cargado como en el navegador (los 4
// paquetes; xgboost sin su cierre declarado). Garantías que estos tests hacen
// FALLAR si se rompen:
//  - anti-fuga de la CV: el preprocesador se reajusta en CADA fold y nunca ve las
//    filas de validación de su fold ni las de test; ningún ajuste sobre train
//    completo ocurre antes de que termine la CV (el test se abre después);
//  - la selección no mira el test: permutar las etiquetas de test no cambia ni el
//    ganador ni un solo puntaje de CV;
//  - cada miembro entrena con el preprocesador compartido sobre nulos y
//    categóricas; uno que falla no tumba la liga (y solo viaja el TIPO de error);
//  - fit_member reproduce exactamente la fila de la liga (determinismo);
//  - export → import → puntuar con XGBoost y con LightGBM: mismas predicciones;
//  - el progreso cruza Python → JS y valida con contract.ts;
//  - el lado que LEE del contrato TS → Python (_validate_payload) rechaza cada
//    carnada nombrando el campo («detectó k de n»);
//  - el EMISOR escribe los fixtures del contrato (tests/fixtures/contrato/) con su
//    serializador real; si la forma cambia, este test falla (CONTRATO_ACTUALIZAR=1
//    los regenera, y tests/unit/contract.test.ts vuelve a correr las carnadas).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PyodideInterface } from "pyodide";
import { MEMBER_IDS, selectOneSe, type MemberId } from "@/engine/roster";
import { sanitizeTable } from "@/engine/sanitize";
import { parseCsvWithLimits } from "@/lib/ds/csv";
import {
  applyMemberFit,
  assembleResult,
  prepareRun,
  withoutLeague,
} from "@/lib/experiment";
import {
  pythonContractField,
  validateExportResult,
  validateMemberFit,
  validateProgressDetail,
  validateScoreResult,
  validateTrainResult,
} from "@/workers/contract";
import type {
  ExportResult,
  FitMemberPayload,
  MemberFitResult,
  PipelinePayload,
  PipelineResult,
  ScoreResult,
} from "@/workers/protocol";
import { ligaSintetica } from "../../scripts/spike-liga/datos.mjs";
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

// Datasets por el camino REAL de la app: parse → saneamiento → prepareRun.
function prepared(csv: string, target: string) {
  const parsed = parseCsvWithLimits(csv);
  if (!parsed.ok) throw new Error(`parse: ${parsed.error.kind}`);
  const run = prepareRun(sanitizeTable(parsed.table).table, target, 42);
  if (!run.ok) throw new Error(`prepare: ${run.error}`);
  return run;
}
const kitCsv = (file: string) =>
  readFileSync(resolve(process.cwd(), "public/datasets", file), "utf8");

const league = (payload: PipelinePayload, onProgress?: (d: string) => void) =>
  JSON.parse(
    runExperiment(JSON.stringify(payload), onProgress),
  ) as PipelineResult;

describe("roster: paridad TS ↔ Python en el runtime real", () => {
  it("pipeline.py conoce EXACTAMENTE los ids de engine/roster.ts", () => {
    const ids = JSON.parse(pyFunction<[]>(py, "roster_ids")()) as string[];
    expect(ids).toEqual([...MEMBER_IDS].sort());
  });
});

describe("anti-fuga de la validación cruzada (espía en el preprocesador)", () => {
  // El espía envuelve al preprocesador real y registra las filas (índice original
  // del payload) de CADA fit. clone() lo copia como a cualquier estimador.
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

  it("cada fold reajusta el preprocesador sin ver su validación; train completo solo DESPUÉS de la CV", () => {
    const run = prepared(kitCsv("marketing-campania.csv"), "convirtio");
    const roster: MemberId[] = ["logistic", "decision_tree", "hgb"];
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

    // 1) Ningún ajuste, jamás, ve una fila de test.
    for (const fit of fits) {
      expect(fit.some((i) => test.has(i))).toBe(false);
    }

    // 2) Los primeros k·M ajustes son la CV: por miembro, k ajustes sobre una
    //    PARTE de train cuyas validaciones (train − ajuste) son disjuntas y cubren
    //    train completo. Si el preprocesador se ajustara una vez fuera de la CV,
    //    no habría ajustes por fold y esto falla.
    const cvFits = fits.slice(0, k * roster.length);
    expect(cvFits).toHaveLength(k * roster.length);
    for (let m = 0; m < roster.length; m++) {
      const folds = cvFits.slice(m * k, (m + 1) * k);
      const covered = new Set<number>();
      for (const fit of folds) {
        expect(fit.length).toBeLessThan(train.size);
        const seen = new Set(fit);
        const validation = [...train].filter((i) => !seen.has(i));
        for (const i of validation) {
          expect(covered.has(i)).toBe(false); // validaciones disjuntas
          covered.add(i);
        }
      }
      expect(covered.size).toBe(train.size); // y cubren train
    }

    // 3) Ningún ajuste sobre train completo antes de que termine la CV; después,
    //    exactamente uno por baseline (2) y por miembro (3): recién ahí se abre el test.
    const full = fits.map((fit) => fit.length === train.size);
    expect(full.slice(0, cvFits.length).some(Boolean)).toBe(false);
    expect(full.slice(cvFits.length).filter(Boolean)).toHaveLength(
      2 + roster.length,
    );
  });
});

describe("la selección no mira el test", () => {
  it("permutar las etiquetas de test no cambia ni el ganador ni un puntaje de CV", () => {
    const run = prepared(kitCsv("rotacion-empleados.csv"), "renuncio");
    const base = league(run.payload);

    // Permuta (invierte) las etiquetas SOLO entre filas de test: mismas
    // proporciones ⇒ misma clase positiva; train intacto.
    const target = run.payload.headers.indexOf(run.payload.target);
    const rows = run.payload.rows.map((row) => [...row]);
    const testLabels = run.payload.test_idx.map((i) => rows[i]![target]!);
    testLabels.reverse();
    run.payload.test_idx.forEach((i, j) => {
      rows[i]![target] = testLabels[j]!;
    });
    const shuffled = league({ ...run.payload, rows });

    expect(shuffled.winner).toBe(base.winner);
    expect(shuffled.cv).toEqual(base.cv);
    expect(shuffled.league.map((r) => r.cv)).toEqual(
      base.league.map((r) => r.cv),
    );
    // Y el test SÍ cambió (si no, la permutación no habría probado nada).
    expect(shuffled.league.map((r) => r.test)).not.toEqual(
      base.league.map((r) => r.test),
    );
  });
});

describe("cada miembro en el runtime real", () => {
  // Sintético con nulos (~5 %) y categóricas, 300 filas: todos los miembros
  // (incluido el MLP, que E2 dejaría fuera con < 500 filas: aquí se fuerza).
  const csv = ligaSintetica({ n: 300, seed: 7 });

  it("los 14 entrenan con el preprocesador compartido sobre nulos y categóricas", () => {
    const run = prepared(csv, "objetivo");
    const result = league({ ...run.payload, roster: [...MEMBER_IDS] });
    expect(result.league.map((r) => r.name)).toEqual([...MEMBER_IDS]);
    for (const row of result.league) {
      expect(row.status, row.name).not.toBe("error");
      expect(row.error_type, row.name).toBeNull();
      expect(row.cv!.folds, row.name).toHaveLength(run.payload.cv_k);
      expect(row.test, row.name).not.toBeNull();
    }
    expect(
      validateTrainResult(result, {
        roster: [...MEMBER_IDS],
        cv_k: run.payload.cv_k,
        primary_metric: run.payload.primary_metric,
      }).ok,
    ).toBe(true);
  });

  it("un miembro que falla no tumba la liga y solo viaja el TIPO de error", () => {
    const run = prepared(csv, "objetivo");
    py.runPython(`
from sklearn.base import BaseEstimator, ClassifierMixin
class _Broken(ClassifierMixin, BaseEstimator):
    def fit(self, X, y):
        raise ValueError("valor-secreto-del-dataset 1234")
_REAL_NB = _FACTORIES["naive_bayes"]
_FACTORIES["naive_bayes"] = lambda seed: _Broken()
`);
    let result: PipelineResult;
    try {
      result = league({
        ...run.payload,
        roster: ["logistic", "naive_bayes", "hgb"],
      });
    } finally {
      py.runPython(`_FACTORIES["naive_bayes"] = _REAL_NB`);
    }
    const broken = result.league.find((r) => r.name === "naive_bayes")!;
    expect(broken.status).toBe("error");
    expect(broken.error_type).toBe("ValueError");
    expect(broken.cv).toBeNull();
    expect(broken.test).toBeNull();
    expect(JSON.stringify(result)).not.toContain("valor-secreto");
    expect(result.winner).not.toBe("naive_bayes");
    expect(
      validateTrainResult(result, {
        roster: ["logistic", "naive_bayes", "hgb"],
        cv_k: run.payload.cv_k,
        primary_metric: run.payload.primary_metric,
      }).ok,
    ).toBe(true);
  });
});

describe("elección manual (fit_member) y export de los boosters", () => {
  const run = () => prepared(kitCsv("marketing-campania.csv"), "convirtio");
  const memberPayload = (
    payload: PipelinePayload,
    member: MemberId,
  ): FitMemberPayload => {
    const rest = withoutLeague(payload);
    return { ...rest, member };
  };

  it("fit_member reproduce EXACTAMENTE el test de su fila de la liga", () => {
    const r = run();
    const payload = {
      ...r.payload,
      roster: [
        "logistic",
        "knn",
        "lightgbm",
        "xgboost",
        "extra_trees",
        "forest",
      ] as MemberId[],
    };
    const result = league(payload);
    // Los bosques dependen de la semilla (bootstrap): sin ellos, este test no
    // detectaría un fit_member con otra semilla (demo en rojo, bitácora F1).
    for (const member of [
      "knn",
      "lightgbm",
      "xgboost",
      "extra_trees",
      "forest",
    ] as MemberId[]) {
      const fit = JSON.parse(
        fitMember(JSON.stringify(memberPayload(payload, member))),
      ) as MemberFitResult;
      expect(validateMemberFit(fit, { member }).ok).toBe(true);
      const row = result.league.find((x) => x.name === member)!;
      expect(fit.model).toEqual(row.test); // floats exactos
    }
  });

  it("si fit_member falla DESPUÉS de ajustar, el modelo retenido NO cambia (AU-S5-07)", () => {
    const r = run();
    const payload = { ...r.payload, roster: ["logistic", "knn"] as MemberId[] };
    const result = league(payload);
    const retained = () =>
      py.runPython(
        "type(_MODEL['pipe'].named_steps['model']).__name__",
      ) as string;
    const before = retained();
    const other: MemberId = result.winner === "knn" ? "logistic" : "knn";
    py.runPython(`
_REAL_SD = _selected_details
def _selected_details(*a, **k):
    raise RuntimeError("boom")
`);
    try {
      expect(() =>
        fitMember(JSON.stringify(memberPayload(payload, other))),
      ).toThrow(/boom/);
    } finally {
      py.runPython("_selected_details = _REAL_SD");
    }
    expect(retained()).toBe(before);
  });

  it.each(["xgboost", "lightgbm"] as MemberId[])(
    "export → import → puntuar con %s: mismas predicciones y probabilidades",
    (member) => {
      const r = run();
      JSON.parse(fitMember(JSON.stringify(memberPayload(r.payload, member))));
      const features = [...r.payload.numeric, ...r.payload.categorical];
      const idx = features.map((f) => r.payload.headers.indexOf(f));
      const newRows = {
        headers: features,
        rows: r.payload.test_idx
          .slice(0, 12)
          .map((i) => idx.map((j) => r.payload.rows[i]![j]!)),
      };
      const before = JSON.parse(
        scoreNewData(JSON.stringify(newRows)),
      ) as ScoreResult;
      const exported = JSON.parse(exportModel("{}")) as ExportResult;
      expect(validateExportResult(exported).ok).toBe(true);
      resetModel();
      importModel(JSON.stringify({ payload_b64: exported.payload_b64 }));
      const after = JSON.parse(
        scoreNewData(JSON.stringify(newRows)),
      ) as ScoreResult;
      expect(after.predictions).toEqual(before.predictions);
      expect(after.probabilities).toEqual(before.probabilities);
      expect(before.probabilities).not.toBeNull();
    },
  );

  it("ridge y el SVM lineal no inventan probabilidades (null, validado por el lector)", () => {
    const r = run();
    for (const member of ["ridge", "linear_svc"] as MemberId[]) {
      JSON.parse(fitMember(JSON.stringify(memberPayload(r.payload, member))));
      const features = [...r.payload.numeric, ...r.payload.categorical];
      const idx = features.map((f) => r.payload.headers.indexOf(f));
      const score = JSON.parse(
        scoreNewData(
          JSON.stringify({
            headers: features,
            rows: [idx.map((j) => r.payload.rows[0]![j]!)],
          }),
        ),
      ) as ScoreResult;
      expect(score.probabilities).toBeNull();
      expect(validateScoreResult(score).ok).toBe(true);
    }
  });
});

describe("cruce de punta a punta: prepareRun → Pyodide → contract.ts → assembleResult", () => {
  it("el progreso cruza Python → JS en orden (CV de todos, luego el test) y valida", () => {
    const r = prepared(kitCsv("credito-fuga-plantada.csv"), "incumplio");
    const details: unknown[] = [];
    const result = league(r.payload, (d) => details.push(JSON.parse(d)));
    const checked = details.map(validateProgressDetail);
    expect(checked.every((c) => c.ok)).toBe(true);
    const roster = r.payload.roster;
    const expected = [
      ...roster.map((member, index) => ({
        phase: "cv",
        member,
        index,
        total: roster.length,
      })),
      ...result.league.flatMap((row, index) =>
        row.status === "error"
          ? []
          : [{ phase: "test", member: row.name, index, total: roster.length }],
      ),
    ];
    expect(details).toEqual(expected);
  });

  it("la app ensambla la liga y la elección manual con lo que el lector validó", () => {
    const r = prepared(kitCsv("rotacion-empleados.csv"), "renuncio");
    const checked = validateTrainResult(league(r.payload), r.payload);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const result = assembleResult(checked.value, r.leakage, r.smallSample);
    expect(result.selection.by).toBe("cv");
    expect(result.selection.cvWinner).toBe(
      selectOneSe(result.league, result.selection.k)!.winner,
    );
    expect(result.selection.competitors).toBe(r.payload.roster.length);

    // Elegir a mano otro miembro: el veredicto habla del elegido («elegido por ti»).
    const other = r.payload.roster.find(
      (m) => m !== result.selection.cvWinner,
    )!;
    const rest = withoutLeague(r.payload);
    const fit = validateMemberFit(
      JSON.parse(fitMember(JSON.stringify({ ...rest, member: other }))),
      {
        member: other,
      },
    );
    expect(fit.ok).toBe(true);
    if (!fit.ok) return;
    const chosen = applyMemberFit(result, fit.value);
    expect(chosen.selection.by).toBe("user");
    expect(chosen.modelName).toBe(other);
    expect(chosen.model).toEqual(
      result.league.find((row) => row.name === other)!.test,
    );
  });
});

// --- Carnadas del contrato TS → Python (el lector es _validate_payload) --------

function contractFieldOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return pythonContractField(String((error as Error).message));
  }
}

describe("carnadas TS → Python: _validate_payload rechaza nombrando el campo", () => {
  it("el payload real pasa; cada carnada se rechaza con su campo — detectó k de n", () => {
    const r = prepared(kitCsv("credito-fuga-plantada.csv"), "incumplio");
    const p = r.payload;
    const rest = withoutLeague(p);
    const member = { ...rest, member: "logistic" };
    const minorityTrain = Math.min(
      ...["0", "1"].map(
        (c) =>
          p.train_idx.filter(
            (i) => p.rows[i]![p.headers.indexOf(p.target)]!.trim() === c,
          ).length,
      ),
    );
    const without = <T extends object>(o: T, key: string) =>
      Object.fromEntries(Object.entries(o).filter(([k]) => k !== key));

    const runBaits: [string, object][] = [
      ["roster", { ...p, roster: ["no_existe"] }],
      ["roster", { ...p, roster: [] }],
      ["roster", { ...p, roster: ["logistic", "logistic"] }],
      ["roster", without(p, "roster")],
      ["cv_k", { ...p, cv_k: 1 }],
      ["cv_k", { ...p, cv_k: minorityTrain + 1 }],
      ["cv_k", { ...p, cv_k: "5" }],
      ["cv_k", without(p, "cv_k")],
      ["primary_metric", { ...p, primary_metric: "rmse" }],
      ["primary_metric", without(p, "primary_metric")],
      ["seed", { ...p, seed: "42" }],
      ["target", { ...p, target: "no-es-columna" }],
      ["train_idx", without(p, "train_idx")],
    ];
    const memberBaits: [string, object][] = [
      ["member", { ...member, member: "no_existe" }],
      ["member", without(member, "member")],
      ["primary_metric", { ...member, primary_metric: 3 }],
    ];

    // El real pasa (sin error de contrato).
    expect(contractFieldOf(() => runExperiment(JSON.stringify(p)))).toBeNull();
    expect(contractFieldOf(() => fitMember(JSON.stringify(member)))).toBeNull();

    const detected = [
      ...runBaits.map(
        ([field, bait]) =>
          contractFieldOf(() => runExperiment(JSON.stringify(bait))) === field,
      ),
      ...memberBaits.map(
        ([field, bait]) =>
          contractFieldOf(() => fitMember(JSON.stringify(bait))) === field,
      ),
    ];
    const k = detected.filter(Boolean).length;
    const n = detected.length;
    console.log(
      `[contrato TS→Python] _validate_payload detectó ${k} de ${n} carnadas`,
    );
    expect(k).toBe(n);
  });
});

// --- El EMISOR escribe los fixtures del contrato Python → TS ------------------

const FIXTURES = resolve(process.cwd(), "tests/fixtures/contrato");
const UPDATE = process.env.CONTRATO_ACTUALIZAR === "1";

/** Firma de forma: claves y tipos (los valores — tiempos, floats — no cuentan). */
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
  const versioned = JSON.parse(readFileSync(file, "utf8")) as unknown;
  expect(
    shape(value),
    `la forma de ${name} cambió: regenera con CONTRATO_ACTUALIZAR=1 y revisa las carnadas`,
  ).toEqual(shape(versioned));
}

describe("fixtures del contrato (emisor real: pipeline.py en Pyodide)", () => {
  it("train, fit-member, progreso, export, score y el payload de TS", () => {
    // Dataset del kit (público, empaquetado): sin datos de usuarios en el fixture.
    const r = prepared(kitCsv("credito-fuga-plantada.csv"), "incumplio");
    const progress: unknown[] = [];
    const train = league(r.payload, (d) => progress.push(JSON.parse(d)));
    const rest = withoutLeague(r.payload);
    const fit = JSON.parse(
      fitMember(JSON.stringify({ ...rest, member: "logistic" })),
    );
    const features = [...r.payload.numeric, ...r.payload.categorical];
    const idx = features.map((f) => r.payload.headers.indexOf(f));
    const score = JSON.parse(
      scoreNewData(
        JSON.stringify({
          headers: features,
          rows: r.payload.test_idx
            .slice(0, 3)
            .map((i) => idx.map((j) => r.payload.rows[i]![j]!)),
        }),
      ),
    );
    const exported = JSON.parse(exportModel("{}"));
    // El payload del pickle (base64) no aporta forma y pesa: se recorta.
    exported.payload_b64 = String(exported.payload_b64).slice(0, 64);

    emit("train-result", train);
    emit("fit-member-result", fit);
    emit("progress", progress);
    emit("score-result", score);
    emit("export-result", exported);
    // TS → Python: lo emite el serializador real de TS (prepareRun + JSON).
    emit("payload", { ...r.payload, rows: r.payload.rows.slice(0, 5) });
  });
});
