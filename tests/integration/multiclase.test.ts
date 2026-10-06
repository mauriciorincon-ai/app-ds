// @vitest-environment node
//
// Clasificar en VARIAS categorías (S7, ADR 015) en el Pyodide REAL, cargado como en
// el navegador. Garantías que estos tests hacen FALLAR si se rompen:
//  - paridad TS ↔ Python del roster multiclase y de su métrica primaria;
//  - anti-fuga de la CV (StratifiedKFold): el preprocesador se reajusta en CADA
//    fold, nunca ve su validación ni el test; el test se abre después de la CV;
//  - la selección no mira el test: permutar las clases de test no cambia ni el
//    ganador ni un puntaje de CV;
//  - los 14 miembros entrenan en su forma nativa de K clases sobre nulos y
//    categóricas; uno roto no tumba la liga y solo viaja el TIPO de error;
//  - fit_member reproduce EXACTAMENTE su fila (incluidos los que usan azar);
//  - los baselines: la mayoritaria da 1/K de exactitud balanceada, y la logística
//    baseline es la logística miembro;
//  - export → import → puntuar con ganador logística y con LightGBM: mismas clases
//    y probabilidades, cada probabilidad la de la clase predicha;
//  - el lector TS → Python (_validate_payload) rechaza cada carnada nombrando el
//    campo («detectó k de n»);
//  - el cruce de punta a punta prepareRun → Pyodide → contract.ts →
//    assembleMulticlassResult → fit_member → applyMulticlassMemberFit;
//  - el emisor escribe los fixtures multiclase (CONTRATO_ACTUALIZAR=1).
// Los archivos del S5 y del S6 importan y puntúan igual: regresion.test.ts y
// modelo-s6.test.ts, que corren sobre este mismo pipeline.py.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PyodideInterface } from "pyodide";
import { MEMBER_IDS, selectOneSe, type MemberId } from "@/engine/roster";
import { sanitizeTable } from "@/engine/sanitize";
import { MULTICLASS_PRIMARY_METRIC } from "@/engine/verdict";
import { parseCsvWithLimits } from "@/lib/ds/csv";
import {
  applyMulticlassMemberFit,
  assembleMulticlassResult,
  prepareRun,
  testClassCounts,
  withoutLeague,
  type RunOptions,
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
  MulticlassMemberFitResult,
  MulticlassPipelineResult,
  MulticlassScoreResult,
  PipelinePayload,
} from "@/workers/protocol";
import { multiclaseSintetica } from "../../scripts/spike-multiclase/datos.mjs";
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

/** Por el camino REAL de la app: parse → saneamiento → prepareRun (rama multiclase). */
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
  expect(run.payload.task).toBe("multiclase");
  return run;
}

const league = (payload: PipelinePayload, onProgress?: (d: string) => void) =>
  JSON.parse(
    runExperiment(JSON.stringify(payload), onProgress),
  ) as MulticlassPipelineResult;

/** Lo que useExperiment manda al lector: también las clases y las filas de prueba
 *  de cada una (con ellas coteja la matriz K×K). */
const sent = (payload: PipelinePayload) => ({
  task: "multiclase" as const,
  roster: payload.roster,
  cv_k: payload.cv_k,
  primary_metric: payload.primary_metric,
  classes: payload.classes!,
  testCounts: testClassCounts(payload),
});

const memberPayload = (payload: PipelinePayload, member: MemberId) => ({
  ...withoutLeague(payload),
  member,
});

const planes = () => prepared(kitCsv("planes-suscripcion.csv"), "plan");

describe("paridad TS ↔ Python en el runtime real (varias categorías)", () => {
  it("pipeline.py conoce EXACTAMENTE el roster multiclase de engine/roster.ts", () => {
    const ids = JSON.parse(
      pyFunction(py, "roster_ids")(JSON.stringify({ task: "multiclase" })),
    ) as string[];
    expect(ids).toEqual([...MEMBER_IDS].sort());
  });

  it("la única primaria multiclase es la que eligió TS", () => {
    const { task_metrics } = JSON.parse(
      pyFunction<[]>(py, "metric_directions")(),
    ) as { task_metrics: Record<string, string[]> };
    expect(task_metrics.multiclase).toEqual([MULTICLASS_PRIMARY_METRIC]);
  });
});

describe("anti-fuga de la validación cruzada multiclase (espía en el preprocesador)", () => {
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
    const run = planes();
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
    // Recién ahora se abre el test: 2 baselines (mayoritaria, logística) + 3 miembros.
    expect(full.slice(cvFits.length).filter(Boolean)).toHaveLength(
      2 + roster.length,
    );
  });
});

describe("la selección multiclase no mira el test", () => {
  it("permutar las clases de test no cambia ni el ganador ni un puntaje de CV", () => {
    const run = planes();
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

describe("cada miembro en su forma nativa de K clases", () => {
  // Sintético con nulos (~5 %) y categóricas, 300 filas y 5 clases desbalanceadas:
  // los 14 (el MLP, que E2 dejaría fuera con < 500 filas, aquí se fuerza).
  const csv = multiclaseSintetica({ n: 300, seed: 7 });

  it("los 14 entrenan con el preprocesador compartido sobre nulos y categóricas", () => {
    const run = prepared(csv, "objetivo");
    expect(run.payload.classes).toHaveLength(5);
    const roster = [...MEMBER_IDS];
    const result = league({ ...run.payload, roster });
    expect(result.league.map((r) => r.name)).toEqual(roster);
    for (const row of result.league) {
      expect(row.status, row.name).not.toBe("error");
      expect(row.cv!.folds, row.name).toHaveLength(run.payload.cv_k);
      expect(row.test, row.name).not.toBeNull();
      expect(row.cv!.mean, row.name).toBeGreaterThanOrEqual(0);
      expect(row.cv!.mean, row.name).toBeLessThanOrEqual(1);
    }
    // No todos le ganan a adivinar (1/K = 0,2): Naive Bayes gaussiano sale por
    // debajo en este sintético, y la liga lo muestra tal cual. El ganador, sí.
    const winner = result.league.find((r) => r.name === result.winner)!;
    expect(winner.cv!.mean).toBeGreaterThan(0.2);
    // Sin probabilidades no hay log-loss ni AUC: no se inventan.
    for (const id of ["ridge", "linear_svc"] as const) {
      const row = result.league.find((r) => r.name === id)!;
      expect(row.test!.log_loss, id).toBeNull();
      expect(row.test!.auc_ovr, id).toBeNull();
    }
    expect(
      validateTrainResult(result, { ...sent(run.payload), roster }).ok,
    ).toBe(true);
  });

  it("un miembro roto no tumba la liga y solo viaja el TIPO de error", () => {
    const run = prepared(csv, "objetivo");
    py.runPython(`
from sklearn.base import BaseEstimator, ClassifierMixin
class _BrokenClf(ClassifierMixin, BaseEstimator):
    def fit(self, X, y):
        raise ValueError("valor-secreto-del-dataset 4321")
_REAL_KNN_CLF = _FACTORIES["knn"]
_FACTORIES["knn"] = lambda seed: _BrokenClf()
`);
    const roster: MemberId[] = ["logistic", "knn", "hgb"];
    let result: MulticlassPipelineResult;
    try {
      result = league({ ...run.payload, roster });
    } finally {
      py.runPython(`_FACTORIES["knn"] = _REAL_KNN_CLF`);
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

describe("los baselines multiclase", () => {
  it("la mayoritaria da exactamente 1/K; la logística baseline ES la logística miembro", () => {
    const run = planes();
    const payload = {
      ...run.payload,
      roster: ["logistic", "hgb"] as MemberId[],
    };
    const result = league(payload);
    const k = payload.classes!.length;
    expect(result.baselines.majority.balanced_accuracy).toBeCloseTo(1 / k, 12);
    expect(result.league.find((r) => r.name === "logistic")!.test).toEqual(
      result.baselines.logistic,
    );
  });
});

describe("elección manual y export multiclase", () => {
  it("fit_member reproduce EXACTAMENTE el test de su fila (también los que usan azar)", () => {
    const r = planes();
    const roster: MemberId[] = [
      "logistic",
      "knn",
      "lightgbm",
      "xgboost",
      "extra_trees",
      "forest",
      "mlp",
    ];
    const payload = { ...r.payload, roster };
    const result = league(payload);
    const s = sent(payload);
    for (const member of roster.slice(1)) {
      const fit = JSON.parse(
        fitMember(JSON.stringify(memberPayload(payload, member))),
      ) as MulticlassMemberFitResult;
      expect(
        validateMemberFit(fit, {
          member,
          task: "multiclase",
          nTest: payload.test_idx.length,
          classes: s.classes,
          testCounts: s.testCounts,
        }).ok,
      ).toBe(true);
      expect(fit.model, member).toEqual(
        result.league.find((x) => x.name === member)!.test,
      );
    }
  });

  it.each(["logistic", "lightgbm"] as MemberId[])(
    "export → import → puntuar con %s: mismas clases y probabilidades",
    (member) => {
      const r = planes();
      const classes = r.payload.classes!;
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
      expect(
        validateScoreResult(before, { task: "multiclase", classes }).ok,
      ).toBe(true);
      const exported = JSON.parse(exportModel("{}")) as ExportResult;
      expect(validateExportResult(exported).ok).toBe(true);
      if (exported.schema.task !== "multiclase") {
        throw new Error("el esquema exportado no es multiclase");
      }
      expect(exported.schema.classes).toEqual(classes);
      resetModel();
      importModel(
        JSON.stringify({
          payload_b64: exported.payload_b64,
          expected_schema: exported.schema,
        }),
      );
      const after = JSON.parse(
        scoreNewData(JSON.stringify(newRows)),
      ) as MulticlassScoreResult;
      expect(after).toEqual(before);
      expect(after.predictions.every((p) => classes.includes(p))).toBe(true);
      // La probabilidad es la de la clase predicha: la más alta de K.
      for (const p of after.probabilities!) {
        expect(p).toBeGreaterThanOrEqual(1 / classes.length);
        expect(p).toBeLessThanOrEqual(1);
      }
    },
  );

  it("un modelo sin probabilidades (Ridge) puntúa clases y no inventa probabilidades", () => {
    const r = planes();
    JSON.parse(fitMember(JSON.stringify(memberPayload(r.payload, "ridge"))));
    const features = [...r.payload.numeric, ...r.payload.categorical];
    const idx = features.map((f) => r.payload.headers.indexOf(f));
    const score = JSON.parse(
      scoreNewData(
        JSON.stringify({
          headers: features,
          rows: r.payload.test_idx
            .slice(0, 5)
            .map((i) => idx.map((j) => r.payload.rows[i]![j]!)),
        }),
      ),
    ) as MulticlassScoreResult;
    expect(score.probabilities).toBeNull();
    expect(
      validateScoreResult(score, {
        task: "multiclase",
        classes: r.payload.classes!,
      }).ok,
    ).toBe(true);
  });
});

describe("TS → Python: _validate_payload rechaza cada carnada multiclase NOMBRANDO el campo", () => {
  type Bait = [
    field: string,
    fn: "train" | "fit",
    mutate: (p: Record<string, unknown>) => void,
  ];

  it("detecta las carnadas de los campos nuevos (task, roster, métrica, clases, k, miembro)", () => {
    const base = planes().payload;
    const classes = base.classes!;
    const target = base.headers.indexOf(base.target);
    const smallestTrain = Math.min(
      ...classes.map(
        (c) =>
          base.train_idx.filter((i) => base.rows[i]![target]!.trim() === c)
            .length,
      ),
    );
    const baits: Bait[] = [
      ["task", "train", (p) => (p.task = "serie-tiempo")],
      // El roster de estimar no compite al clasificar.
      ["roster", "train", (p) => (p.roster = ["linear", "logistic"])],
      ["primary_metric", "train", (p) => (p.primary_metric = "auc")],
      ["classes", "train", (p) => delete p.classes],
      ["classes", "train", (p) => (p.classes = classes.slice(0, 2))],
      [
        "classes",
        "train",
        (p) => (p.classes = Array.from({ length: 21 }, (_, i) => `c${i}`)),
      ],
      ["classes", "train", (p) => (p.classes = [...classes, classes[0]])],
      ["classes", "train", (p) => (p.classes = [...classes].reverse())],
      // Las clases enviadas no son las de los datos.
      [
        "classes",
        "train",
        (p) => (p.classes = [...classes.slice(0, -1), "zzz-otra"].sort()),
      ],
      // Dos clases enviadas como «multiclase» (y los datos con esas dos): sin el
      // tope de 3, entrenaría una binaria disfrazada.
      [
        "classes",
        "train",
        (p) => {
          const rows = p.rows as string[][];
          for (const row of rows) {
            if (row[target] !== classes[0]) row[target] = "zzz-resto";
          }
          p.classes = [classes[0]!, "zzz-resto"];
        },
      ],
      ["cv_k", "train", (p) => (p.cv_k = smallestTrain + 1)],
      // Las clases viajan SOLO con varias categorías.
      [
        "classes",
        "train",
        (p) => {
          p.task = "numerica";
          p.primary_metric = "mae";
          p.roster = ["linear"];
        },
      ],
      ["member", "fit", (p) => (p.member = "linear")],
    ];
    const missed: string[] = [];
    for (const [field, fn, mutate] of baits) {
      const copy: Record<string, unknown> =
        fn === "train"
          ? structuredClone({ ...base, roster: ["logistic", "hgb"] })
          : structuredClone({ ...withoutLeague(base), member: "logistic" });
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
      `[contrato TS→Python multiclase] detectó ${baits.length - missed.length} de ${baits.length} carnadas`,
    );
    expect(missed).toEqual([]);
  });
});

describe("cruce de punta a punta: prepareRun → Pyodide → contract.ts → assembleMulticlassResult", () => {
  it("planes: veredicto en exactitud balanceada, matriz K×K y «elegido por ti»", () => {
    const r = planes();
    const details: unknown[] = [];
    const raw = league(r.payload, (d) => details.push(JSON.parse(d)));
    expect(details.map(validateProgressDetail).every((c) => c.ok)).toBe(true);
    const checked = validateTrainResult(raw, sent(r.payload));
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const result = assembleMulticlassResult(
      checked.value,
      r.leakage,
      r.smallSample,
    );
    const k = result.classes.length;
    expect(result.classes).toEqual(r.payload.classes);
    expect(result.verdict.primaryMetric).toBe("balanced_accuracy");
    expect(result.selection.metric).toBe("balanced_accuracy");
    expect(result.selection.cvWinner).toBe(
      selectOneSe(result.league, result.selection.k, "higher")!.winner,
    );
    // La señal del kit es real: el elegido le gana al mejor baseline.
    expect(result.verdict.level).toBe("beats");
    expect(result.leakage).toEqual([]);
    expect(result.confusionMatrix).toHaveLength(k);
    expect(result.perClass.map((c) => c.support)).toEqual(
      testClassCounts(r.payload),
    );

    const other = r.payload.roster.find(
      (m) => m !== result.selection.cvWinner,
    )!;
    const s = sent(r.payload);
    const fit = validateMemberFit(
      JSON.parse(
        fitMember(
          JSON.stringify({ ...withoutLeague(r.payload), member: other }),
        ),
      ),
      {
        member: other,
        task: "multiclase",
        nTest: result.nTest,
        classes: s.classes,
        testCounts: s.testCounts,
      },
    );
    expect(fit.ok).toBe(true);
    if (!fit.ok) return;
    const chosen = applyMulticlassMemberFit(result, fit.value);
    expect(chosen.selection.by).toBe("user");
    expect(chosen.modelName).toBe(other);
    expect(chosen.verdict.modelScore).toBe(fit.value.model.balanced_accuracy);
  });

  it("planes con fuga plantada: nombra la columna Y la clase que delata (sobre train)", () => {
    const r = prepared(kitCsv("planes-fuga-plantada.csv"), "plan");
    expect(r.leakage.map((f) => f.column)).toEqual(["cargo_corporativo_usd"]);
    expect(r.leakage[0]!.class).toBeDefined();
    expect(r.payload.classes).toContain(r.leakage[0]!.class);
  });

  it("D2 pagada en el motor: «ocupantes» respondida como «Categorías» entrena", () => {
    const r = prepared(kitCsv("consumo-energia.csv"), "ocupantes", {
      ambiguousChoice: "multiclase",
    });
    const raw = league({ ...r.payload, roster: ["logistic", "hgb"] });
    expect(
      validateTrainResult(raw, {
        ...sent(r.payload),
        roster: ["logistic", "hgb"],
      }).ok,
    ).toBe(true);
  });
});

// --- Fixtures del contrato multiclase (emisor real) --------------------------

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

describe("fixtures del contrato multiclase (emisor real: pipeline.py en Pyodide)", () => {
  it("train, fit-member, export, score y el payload de TS", () => {
    // Dataset del kit (público, sintético): sin datos de usuarios en el fixture.
    const r = planes();
    const payload = {
      ...r.payload,
      roster: ["logistic", "ridge", "hgb", "forest"] as MemberId[],
    };
    const train = league(payload);
    const fit = JSON.parse(
      fitMember(
        JSON.stringify({ ...withoutLeague(payload), member: "forest" }),
      ),
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
    emit("train-result-multiclase", train);
    emit("fit-member-result-multiclase", fit);
    emit("score-result-multiclase", score);
    emit("export-result-multiclase", exported);
    // El payload trae las filas de prueba de cada clase: el lector las necesita.
    emit("payload-multiclase", {
      ...payload,
      rows: payload.rows.slice(0, 5),
      test_counts: testClassCounts(payload),
    });
  });
});
