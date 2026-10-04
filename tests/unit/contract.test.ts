// Gate de contrato entre lenguajes (regla 15) — el lado que LEE Python → TS.
// Los fixtures los ESCRIBE el emisor real (pipeline.py en Pyodide, desde
// tests/integration/liga.test.ts); aquí el lector de producción (contract.ts) los
// valida, y cada carnada —una mutación de UN solo campo— tiene que rechazarse
// NOMBRANDO ese campo. Se reporta «detectó k de n» por dirección.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isMemberOf, type MemberId } from "@/engine/roster";
import { check, dict, num, obj, type Checked } from "@/lib/validate";
import {
  pythonContractField,
  pythonLeagueEmpty,
  validateExportResult,
  validateMemberFit,
  validateProgressDetail,
  validateScoreResult,
  validateTrainResult,
} from "@/workers/contract";
import type { PipelinePayload } from "@/workers/protocol";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixtures JSON que las carnadas mutan a propósito
type Json = Record<string, any>;

const fixture = <T = Json>(name: string): T =>
  JSON.parse(
    readFileSync(
      resolve(__dirname, `../fixtures/contrato/${name}.json`),
      "utf8",
    ),
  ) as T;

const PAYLOAD = fixture<PipelinePayload>("payload");
const SENT = {
  roster: PAYLOAD.roster,
  cv_k: PAYLOAD.cv_k,
  primary_metric: PAYLOAD.primary_metric,
};

type Bait = [field: string, mutate: (value: Json) => void];

/** Corre las carnadas: cada una sobre una copia fresca del fixture real. */
function runBaits(
  label: string,
  base: Json,
  validate: (value: unknown) => Checked<unknown>,
  baits: Bait[],
) {
  const missed: string[] = [];
  for (const [field, mutate] of baits) {
    const copy = structuredClone(base);
    mutate(copy);
    const result = validate(copy);
    if (result.ok || result.field !== field) {
      missed.push(`${field} → ${result.ok ? "aceptada" : result.field}`);
    }
  }
  const detected = baits.length - missed.length;
  console.log(
    `[contrato ${label}] detectó ${detected} de ${baits.length} carnadas`,
  );
  expect(missed).toEqual([]);
}

/** Segundo miembro «ok» distinto del ganador (para carnadas de selección). */
const otherOk = (train: Json): MemberId =>
  train.league.find((r: Json) => r.status === "ok" && r.name !== train.winner)
    .name;

describe("Python → TS: resultado de la liga (train)", () => {
  const train = fixture("train-result");

  it("el fixture real que emitió Pyodide valida", () => {
    expect(validateTrainResult(train, SENT)).toMatchObject({ ok: true });
  });

  it("carnadas por campo: se rechazan NOMBRANDO el campo", () => {
    runBaits("train", train, (v) => validateTrainResult(v, SENT), [
      ["league", (t) => (t.league = "liga")],
      ["league", (t) => (t.league = [])],
      ["league", (t) => t.league.reverse()],
      ["league[0].name", (t) => (t.league[0].name = "no_existe")],
      ["league[0].status", (t) => (t.league[0].status = "ganó")],
      ["league[0].cv", (t) => (t.league[0].cv = null)],
      ["league[0].cv.mean", (t) => delete t.league[0].cv.mean],
      ["league[0].cv.std", (t) => (t.league[0].cv.std = -0.1)],
      ["league[0].cv.folds", (t) => t.league[0].cv.folds.pop()],
      ["league[0].test", (t) => (t.league[0].test = null)],
      ["league[0].test.auc", (t) => (t.league[0].test.auc = "0.9")],
      ["league[0].elapsed_ms", (t) => (t.league[0].elapsed_ms = "40")],
      ["league[0].error_type", (t) => (t.league[0].error_type = 3)],
      ["cv.k", (t) => (t.cv.k = SENT.cv_k + 1)],
      ["cv.scoring", (t) => delete t.cv.scoring],
      // Una métrica distinta a la enviada: la CV no puntuó con lo que TS pidió.
      ["cv.scoring", (t) => (t.cv.scoring = "accuracy")],
      ["cv.rule", (t) => (t.cv.rule = "max")],
      ["cv.best", (t) => (t.cv.best = otherOk(t))],
      ["cv.se", (t) => (t.cv.se = t.cv.se + 0.5)],
      ["winner", (t) => (t.winner = otherOk(t))],
      ["model_name", (t) => (t.model_name = otherOk(t))],
      ["model", (t) => (t.model.auc = t.model.auc / 2)],
      ["elapsed_ms", (t) => (t.elapsed_ms = -1)],
      ["confusion_matrix", (t) => t.confusion_matrix.push([0, 0])],
      [
        "preprocessing.rare_categories",
        (t) => delete t.preprocessing.rare_categories,
      ],
      [
        "explainability.features[0].direction",
        (t) => (t.explainability.features[0].direction = "up"),
      ],
      ["baselines.logistic.auc", (t) => (t.baselines.logistic.auc = null)],
    ]);
  });
});

describe("Python → TS: elección manual (fit-member)", () => {
  const fit = fixture("fit-member-result");
  const sent = { member: fit.model_name as MemberId };

  it("el fixture real valida (y tiene que ser el miembro pedido)", () => {
    expect(validateMemberFit(fit, sent).ok).toBe(true);
    expect(validateMemberFit(fit, { member: "xgboost" })).toEqual({
      ok: false,
      field: "model_name",
    });
  });

  it("carnadas por campo", () => {
    runBaits("fit-member", fit, (v) => validateMemberFit(v, sent), [
      ["model_name", (f) => (f.model_name = "no_existe")],
      ["model.f1", (f) => delete f.model.f1],
      ["confusion_matrix", (f) => (f.confusion_matrix = [[1, 2]])],
      ["explainability.method", (f) => (f.explainability.method = "shap")],
      [
        "preprocessing.numeric_medians",
        (f) => (f.preprocessing.numeric_medians = []),
      ],
      // La ruta del valor NO lleva el nombre de la columna del usuario (AU-S5-15).
      [
        "preprocessing.numeric_medians.*",
        (f) => {
          const k = Object.keys(f.preprocessing.numeric_medians)[0]!;
          f.preprocessing.numeric_medians[k] = "x";
        },
      ],
    ]);
  });
});

describe("worker → UI: progreso modelo a modelo", () => {
  const progress = fixture<Json[]>("progress");

  it("cada paso real valida", () => {
    expect(progress.length).toBeGreaterThan(0);
    for (const step of progress)
      expect(validateProgressDetail(step).ok).toBe(true);
  });

  it("carnadas por campo (detail.{phase, member, index, total})", () => {
    runBaits("progreso", progress[0]!, validateProgressDetail, [
      ["phase", (d) => (d.phase = "train")],
      ["member", (d) => (d.member = "no_existe")],
      ["index", (d) => (d.index = d.total)],
      ["index", (d) => delete d.index],
      ["total", (d) => (d.total = 0)],
    ]);
  });
});

describe("Python → TS: export y puntuación", () => {
  const exported = fixture("export-result");
  const score = fixture("score-result");

  it("los fixtures reales validan", () => {
    expect(validateExportResult(exported).ok).toBe(true);
    expect(validateScoreResult(score).ok).toBe(true);
    // Un modelo sin probabilidades (ridge, SVM lineal) viaja con null: válido.
    expect(validateScoreResult({ ...score, probabilities: null }).ok).toBe(
      true,
    );
  });

  it("carnadas del export (versiones de los boosters incluidas)", () => {
    runBaits("export", exported, validateExportResult, [
      ["versions.xgboost", (e) => delete e.versions.xgboost],
      ["versions.lightgbm", (e) => (e.versions.lightgbm = 4.6)],
      ["versions.sklearn", (e) => delete e.versions.sklearn],
      ["payload_b64", (e) => (e.payload_b64 = "")],
      ["schema.classes", (e) => e.schema.classes.push("tal-vez")],
      [
        "training_profile.categorical",
        (e) => (e.training_profile.categorical = null),
      ],
    ]);
  });

  it("carnadas de la puntuación", () => {
    runBaits("score", score, validateScoreResult, [
      ["probabilities", (s) => s.probabilities.pop()],
      ["probabilities", (s) => (s.probabilities = "0.9")],
      ["predictions[0]", (s) => (s.predictions[0] = 1)],
      ["novelty.affected_rows", (s) => (s.novelty.affected_rows = -1)],
      ["positive_class", (s) => delete s.positive_class],
    ]);
  });
});

describe("TS → Python: el fixture del payload lo emite el serializador real de TS", () => {
  it("trae los campos nuevos del contrato (roster en orden de prioridad, k, métrica)", () => {
    expect(PAYLOAD.roster.length).toBeGreaterThan(0);
    expect(PAYLOAD.cv_k).toBeGreaterThanOrEqual(2);
    expect(["auc", "f1"]).toContain(PAYLOAD.primary_metric);
  });

  it("el error «contract:<campo>» de Python se lee nombrando el campo", () => {
    const traceback =
      'Traceback (most recent call last):\n  File "<exec>", line 330\nValueError: contract:cv_k';
    expect(pythonContractField(traceback)).toBe("cv_k");
    expect(pythonContractField("RuntimeError: league-empty")).toBeNull();
    // Con salto final (así llega el traceback de Pyodide) se sigue leyendo.
    expect(pythonContractField(`${traceback}\n`)).toBe("cv_k");
    // Un «contract:» citado dentro de OTRO error no es un campo rechazado (AU-S5-16).
    expect(
      pythonContractField(
        "Traceback…\nValueError: could not convert 'contract:abc'\nRuntimeError: x",
      ),
    ).toBeNull();
  });

  it("la liga vacía de Python se reconoce solo en la última línea del traceback", () => {
    expect(pythonLeagueEmpty("Traceback…\nRuntimeError: league-empty\n")).toBe(
      true,
    );
    expect(
      pythonLeagueEmpty("ValueError: 'league-empty' is not a number"),
    ).toBe(false);
  });
});

describe("validate.ts — el lector nombra el primer campo que no cuadra", () => {
  it("raíz no objeto ⇒ (root)", () => {
    expect(validateExportResult("hola")).toEqual({
      ok: false,
      field: "(root)",
    });
    expect(check(() => null, 1)).toEqual({ ok: true, value: 1 });
  });

  it("las claves de un diccionario (nombres de columna del usuario) no viajan en la ruta", () => {
    expect(check(dict(num), { salario_juan: "x" })).toEqual({
      ok: false,
      field: "*",
    });
    expect(check(obj({ m: dict(num) }), { m: { edad_de_ana: null } })).toEqual({
      ok: false,
      field: "m.*",
    });
  });
});

// --- S6: estimar una cantidad — una carnada por campo nuevo del contrato --------

describe("Python → TS: liga de REGRESIÓN (train)", () => {
  const train = fixture("train-result-regresion");
  const payload = fixture<PipelinePayload>("payload-regresion");
  const sentReg = {
    task: "numerica" as const,
    roster: payload.roster,
    cv_k: payload.cv_k,
    primary_metric: payload.primary_metric,
  };
  // El miembro con el MAYOR MAE de CV: el que ganaría si «mayor fuera mejor».
  const worst = (t: Json): MemberId =>
    t.league
      .filter((r: Json) => r.status === "ok")
      .reduce((a: Json, b: Json) => (b.cv.mean > a.cv.mean ? b : a)).name;

  it("el fixture real que emitió Pyodide valida (y una binaria no pasa por regresión)", () => {
    expect(validateTrainResult(train, sentReg)).toMatchObject({ ok: true });
    expect(
      validateTrainResult(fixture("train-result"), {
        ...sentReg,
        task: "numerica",
      }),
    ).toEqual({ ok: false, field: "task" });
  });

  it("carnadas por campo: se rechazan NOMBRANDO el campo", () => {
    runBaits("train-regresión", train, (v) => validateTrainResult(v, sentReg), [
      ["task", (t) => (t.task = "binaria")],
      ["task", (t) => delete t.task],
      ["model.mae", (t) => (t.model.mae = -1)],
      ["model.rmse", (t) => (t.model.rmse = "12")],
      ["model.r2", (t) => delete t.model.r2],
      ["model.medae", (t) => (t.model.medae = null)],
      ["model.mape", (t) => (t.model.mape = "0.1")],
      ["model", (t) => (t.model.mae = t.model.mae * 2)],
      ["baselines.median.mae", (t) => delete t.baselines.median.mae],
      ["baselines.linear.r2", (t) => (t.baselines.linear.r2 = "?")],
      // El miembro lineal y el baseline lineal son el mismo ajuste (AU-S6-39).
      ["baselines.linear", (t) => (t.baselines.linear.mae += 1)],
      ["league[0].test.mae", (t) => (t.league[0].test.mae = -2)],
      ["league[0].cv.mean", (t) => delete t.league[0].cv.mean],
      // El signo sin invertir (AU-S6-09): un MAE de CV negativo jamás pasa.
      [
        "league[0].cv.mean",
        (t) => (t.league[0].cv.mean = -t.league[0].cv.mean),
      ],
      ["league[0].cv.folds[0]", (t) => (t.league[0].cv.folds[0] = -1)],
      ["league[0].name", (t) => (t.league[0].name = "logistic")],
      ["cv.scoring", (t) => (t.cv.scoring = "roc_auc")],
      // Elegir como si «mayor fuera mejor»: el lector recalcula CON la dirección del MAE.
      ["cv.best", (t) => (t.cv.best = worst(t))],
      ["winner", (t) => (t.winner = worst(t))],
      ["target_stats.mean", (t) => (t.target_stats.mean = "380")],
      ["target_stats.std", (t) => (t.target_stats.std = -1)],
      ["target_stats.min", (t) => delete t.target_stats.min],
      ["target_stats.max", (t) => (t.target_stats.max = null)],
      ["target_stats.median", (t) => delete t.target_stats.median],
      ["target_stats.decimals", (t) => (t.target_stats.decimals = 7)],
      ["target_stats", (t) => (t.target_stats.min = t.target_stats.max + 1)],
      ["pred_vs_real", (t) => t.pred_vs_real.predicted.pop()],
      // n_total ES el tamaño de la prueba, y la muestra trae todos los puntos (AU-S6-10).
      ["pred_vs_real.n_total", (t) => (t.pred_vs_real.n_total = 2)],
      ["pred_vs_real.n_total", (t) => (t.pred_vs_real.n_total += 1)],
      [
        "pred_vs_real.real",
        (t) => {
          t.pred_vs_real.real.pop();
          t.pred_vs_real.predicted.pop();
        },
      ],
      ["pred_vs_real.real[0]", (t) => (t.pred_vs_real.real[0] = "1")],
      ["pred_vs_real.real[0]", (t) => (t.pred_vs_real.real[0] = Infinity)],
      ["pred_vs_real.n_total", (t) => (t.pred_vs_real.n_total = 0)],
      ["residuals.p50", (t) => (t.residuals.p50 = "x")],
      ["residuals", (t) => (t.residuals.p05 = t.residuals.p95 + 1)],
      ["residuals.abs_p90", (t) => (t.residuals.abs_p90 = -1)],
    ]);
  });
});

describe("Python → TS: elección manual en regresión (fit-member)", () => {
  const fit = fixture("fit-member-result-regresion");
  const sentFit = {
    member: fit.model_name as MemberId,
    task: "numerica" as const,
    nTest: fixture("train-result-regresion").n_test as number,
  };

  it("el fixture real valida (y tiene que ser el miembro pedido)", () => {
    expect(validateMemberFit(fit, sentFit).ok).toBe(true);
    expect(validateMemberFit(fit, { ...sentFit, member: "forest" })).toEqual({
      ok: false,
      field: "model_name",
    });
  });

  it("carnadas por campo", () => {
    runBaits(
      "fit-member-regresión",
      fit,
      (v) => validateMemberFit(v, sentFit),
      [
        ["task", (f) => (f.task = "binaria")],
        ["model.mae", (f) => (f.model.mae = -3)],
        ["pred_vs_real", (f) => f.pred_vs_real.real.pop()],
        ["pred_vs_real.n_total", (f) => (f.pred_vs_real.n_total += 1)],
        ["residuals", (f) => (f.residuals.p25 = f.residuals.p75 + 1)],
        ["model_name", (f) => (f.model_name = "logistic")],
      ],
    );
  });
});

describe("Python → TS: export y puntuación de REGRESIÓN", () => {
  const exported = fixture("export-result-regresion");
  const score = fixture("score-result-regresion");

  it("los fixtures reales validan", () => {
    expect(validateExportResult(exported).ok).toBe(true);
    expect(validateScoreResult(score, { task: "numerica" }).ok).toBe(true);
  });

  it("carnadas del export (schema.task, schema.target_stats)", () => {
    runBaits("export-regresión", exported, validateExportResult, [
      ["schema.task", (e) => (e.schema.task = "multiclase")],
      ["schema.task", (e) => delete e.schema.task],
      ["schema.target_stats", (e) => delete e.schema.target_stats],
      [
        "schema.target_stats.decimals",
        (e) => (e.schema.target_stats.decimals = -1),
      ],
    ]);
  });

  it("carnadas de la puntuación (estimaciones numéricas, ninguna probabilidad)", () => {
    runBaits(
      "score-regresión",
      score,
      (v) => validateScoreResult(v, { task: "numerica" }),
      [
        ["task", (s) => (s.task = "binaria")],
        ["predictions[0]", (s) => (s.predictions[0] = "123.4")],
        ["probabilities", (s) => (s.probabilities = [0.5, 0.5, 0.5])],
        ["predictions", (s) => s.predictions.pop()],
      ],
    );
  });
});

describe("TS → Python: el payload de regresión lo emite el serializador real de TS", () => {
  const payload = fixture<PipelinePayload>("payload-regresion");

  it("trae la tarea, el MAE y solo ids del roster de regresión", () => {
    expect(payload.task).toBe("numerica");
    expect(payload.primary_metric).toBe("mae");
    for (const id of payload.roster)
      expect(isMemberOf("numerica", id)).toBe(true);
  });

  it("el payload binario es el del S5 + `task` (R1/R18: nada más cambió de forma)", () => {
    expect(Object.keys(PAYLOAD).sort()).toEqual(
      [
        "categorical",
        "cv_k",
        "headers",
        "numeric",
        "primary_metric",
        "roster",
        "rows",
        "seed",
        "target",
        "task",
        "test_idx",
        "train_idx",
      ].sort(),
    );
    expect(PAYLOAD.task).toBe("binaria");
  });
});
