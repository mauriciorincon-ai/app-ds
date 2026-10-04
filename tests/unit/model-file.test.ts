import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { assembleRegressionResult } from "@/lib/experiment";
import type {
  ExperimentResult,
  ExportResult,
  RegressionPipelineResult,
} from "@/workers/protocol";
import {
  MODEL_FILE_FORMAT_VERSION,
  RUNTIME_VERSIONS,
  isBinaryManifest,
  manifestTask,
  modelFileName,
  packModelFile,
  validateModelFile,
} from "@/lib/model-file";
import { leagueFields } from "./factories";

// btoa está en jsdom: payload de juguete determinista.
const PAYLOAD_B64 = btoa("payload-pickle-zlib-de-mentira");

const METRICS = {
  accuracy: 0.9,
  precision: 0.8,
  recall: 0.7,
  f1: 0.75,
  auc: 0.85,
};

const RESULT: ExperimentResult = {
  positiveClass: "si",
  positiveRate: 0.3,
  nTrain: 75,
  nTest: 25,
  baselines: {
    majority: { ...METRICS, auc: 0.5 },
    logistic: { ...METRICS, auc: 0.6 },
  },
  model: METRICS,
  modelName: "forest",
  candidates: [{ name: "forest", metrics: METRICS }],
  ...leagueFields("forest"),
  confusionMatrix: [
    [20, 2],
    [1, 2],
  ],
  verdict: {
    level: "beats",
    primaryMetric: "auc",
    modelScore: 0.85,
    baselineScore: 0.6,
    delta: 0.25,
  },
  leakage: [
    { column: "proxy", score: 0.99, reason: "near-perfect-separation" },
  ],
  explainability: {
    method: "permutation_importance",
    scoring: "roc_auc",
    n_repeats: 10,
    features: [],
  },
};

const EXPORTED: ExportResult = {
  payload_b64: PAYLOAD_B64,
  versions: { ...RUNTIME_VERSIONS, python: "3.14.2" },
  schema: {
    numeric: ["edad"],
    categorical: ["region"],
    target: "convirtio",
    classes: ["no", "si"],
    positive_class: "si",
  },
  training_profile: {
    numeric: { edad: { min: 18, max: 70 } },
    categorical: { region: ["norte", "sur"] },
  },
};

const DATE = new Date("2026-07-11T12:00:00Z");

async function pack() {
  return packModelFile({
    datasetName: "Ventas Q1.csv",
    result: RESULT,
    exported: EXPORTED,
    date: DATE,
  });
}

describe("packModelFile → validateModelFile (roundtrip)", () => {
  it("un archivo empaquetado valida OK y sin advertencias de versión", async () => {
    const file = await pack();
    const validation = await validateModelFile(JSON.stringify(file));

    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.warnings).toEqual([]);
    expect(validation.file.manifest.dataset).toEqual({
      name: "Ventas Q1.csv",
      n_train: 75,
      n_test: 25,
    });
    expect(validation.file.manifest.verdict.level).toBe("beats");
    expect(validation.file.manifest.leakage).toHaveLength(1);
    expect(validation.file.payload).toBe(PAYLOAD_B64);
  });

  it("el hash es determinista (mismo payload ⇒ mismo SHA-256)", async () => {
    const [a, b] = [await pack(), await pack()];
    expect(a.manifest.payload_sha256).toBe(b.manifest.payload_sha256);
    expect(a.manifest.payload_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("compatibilidad S3↔S4 (campos aditivos opcionales — ADR-007 revisado)", () => {
  it("un archivo S4 trae model_name; sin él (forma S3) sigue validando (tolerante)", async () => {
    const file = await pack();
    expect(file.manifest.model_name).toBe("forest");

    // Simula un archivo de S3: sin los campos S4. El hash es del payload (no del
    // manifiesto) ⇒ sigue cuadrando; la validación estructural tolera la ausencia.
    const raw = JSON.parse(JSON.stringify(file)) as {
      manifest: Record<string, unknown>;
    };
    delete raw.manifest.model_name;
    delete raw.manifest.sanitation;
    const validation = await validateModelFile(JSON.stringify(raw));
    expect(validation.ok).toBe(true);
  });

  it("registra el saneamiento SOLO si el dataset no estaba limpio", async () => {
    const dirty = await packModelFile({
      datasetName: "sucio.csv",
      result: RESULT,
      exported: EXPORTED,
      date: DATE,
      sanitation: {
        clean: false,
        duplicateRowsRemoved: 10,
        exclusions: [{ column: "id", reason: "id-column" }],
        coercions: [{ column: "edad", cellsNulled: 6 }],
        rowsBefore: 200,
        rowsAfter: 190,
        colsBefore: 6,
        colsAfter: 4,
        usable: true,
      },
    });
    expect(dirty.manifest.sanitation?.duplicateRowsRemoved).toBe(10);
    expect(dirty.manifest.sanitation?.exclusions).toHaveLength(1);

    const clean = await packModelFile({
      datasetName: "limpio.csv",
      result: RESULT,
      exported: EXPORTED,
      date: DATE,
      sanitation: {
        clean: true,
        duplicateRowsRemoved: 0,
        exclusions: [],
        coercions: [],
        rowsBefore: 200,
        rowsAfter: 200,
        colsBefore: 6,
        colsAfter: 6,
        usable: true,
      },
    });
    // Dataset limpio ⇒ el manifiesto NO gana la clave sanitation (sin ruido).
    expect(clean.manifest.sanitation).toBeUndefined();
    // Y sigue siendo format_version 1 (aditivo-opcional NO sube la versión).
    expect(clean.format_version).toBe(1);
  });
});

describe("validateModelFile — rechazos ANTES de deserializar", () => {
  it("payload manipulado ⇒ hash-mismatch", async () => {
    const file = await pack();
    file.payload = btoa("payload-manipulado-por-un-tercero");
    const validation = await validateModelFile(JSON.stringify(file));
    expect(validation).toEqual({ ok: false, error: "hash-mismatch" });
  });

  it("texto que no es JSON ⇒ invalid-json", async () => {
    expect(await validateModelFile("esto no es json {")).toEqual({
      ok: false,
      error: "invalid-json",
    });
  });

  it("JSON ajeno (forma desconocida) ⇒ invalid-format", async () => {
    expect(await validateModelFile('{"hola": "mundo"}')).toEqual({
      ok: false,
      error: "invalid-format",
    });
  });

  it("manifiesto mutilado ⇒ invalid-format", async () => {
    const file = await pack();
    const raw = JSON.parse(JSON.stringify(file)) as Record<string, unknown>;
    delete (raw.manifest as Record<string, unknown>).schema;
    expect(await validateModelFile(JSON.stringify(raw))).toEqual({
      ok: false,
      error: "invalid-format",
      // S5: el lector nombra el campo que no cuadra (regla 15).
      field: "manifest.schema",
    });
  });

  it("payload con base64 corrupto ⇒ invalid-format (sin tocar el hash)", async () => {
    const file = await pack();
    file.payload = "%%%no-es-base64%%%";
    expect(await validateModelFile(JSON.stringify(file))).toEqual({
      ok: false,
      error: "invalid-format",
    });
  });

  it("versión de formato futura ⇒ unsupported-version (no 'corrupto')", async () => {
    const file = await pack();
    const raw = JSON.parse(JSON.stringify(file)) as Record<string, unknown>;
    raw.format_version = MODEL_FILE_FORMAT_VERSION + 1;
    expect(await validateModelFile(JSON.stringify(raw))).toEqual({
      ok: false,
      error: "unsupported-version",
    });
  });
});

describe("validateModelFile — advertencia honesta de versiones", () => {
  it("runtime distinto ⇒ ok:true con warnings por componente", async () => {
    const file = await packModelFile({
      datasetName: "x.csv",
      result: RESULT,
      exported: {
        ...EXPORTED,
        versions: { pyodide: "999.0.0", sklearn: "9.9.9", python: "3.99.0" },
      },
      date: DATE,
    });
    const validation = await validateModelFile(JSON.stringify(file));

    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.warnings).toEqual([
      {
        component: "pyodide",
        file: "999.0.0",
        runtime: RUNTIME_VERSIONS.pyodide,
      },
      {
        component: "sklearn",
        file: "9.9.9",
        runtime: RUNTIME_VERSIONS.sklearn,
      },
    ]);
  });
});

describe("S5 — la liga y la selección en el manifiesto (aditivos-opcionales)", () => {
  it("el archivo registra la liga, cómo se eligió y las versiones de los boosters", async () => {
    const file = await pack();
    expect(file.manifest.league?.map((row) => row.name)).toEqual(["forest"]);
    expect(file.manifest.league?.[0]).toMatchObject({
      status: "ok",
      cv_std: 0.01,
    });
    expect(file.manifest.selection).toEqual({
      by: "cv",
      cv_winner: "forest",
      k: 5,
      metric: "auc",
      rule: "one-se",
    });
    expect(file.manifest.versions.xgboost).toBe(RUNTIME_VERSIONS.xgboost);
    expect(file.manifest.versions.lightgbm).toBe(RUNTIME_VERSIONS.lightgbm);
  });

  it("«elegido por ti» queda registrado como by: user", async () => {
    const file = await packModelFile({
      datasetName: "x.csv",
      result: { ...RESULT, selection: { ...RESULT.selection, by: "user" } },
      exported: EXPORTED,
      date: DATE,
    });
    expect(file.manifest.selection?.by).toBe("user");
    expect((await validateModelFile(JSON.stringify(file))).ok).toBe(true);
  });

  it("un archivo S4 (sin liga, sin selección, sin versiones de boosters) sigue importando", async () => {
    const raw = JSON.parse(JSON.stringify(await pack())) as {
      manifest: Record<string, unknown> & { versions: Record<string, unknown> };
    };
    delete raw.manifest.league;
    delete raw.manifest.selection;
    delete raw.manifest.versions.xgboost;
    delete raw.manifest.versions.lightgbm;
    raw.manifest.model_name = "hgb"; // los nombres S4 siguen siendo miembros válidos
    const validation = await validateModelFile(JSON.stringify(raw));
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.warnings).toEqual([]); // sin versiones de boosters, no se cotejan
  });

  it("boosters de otra versión ⇒ advertencia honesta (no bloquea)", async () => {
    const file = await packModelFile({
      datasetName: "x.csv",
      result: RESULT,
      exported: {
        ...EXPORTED,
        versions: { ...EXPORTED.versions, xgboost: "1.0.0" },
      },
      date: DATE,
    });
    const validation = await validateModelFile(JSON.stringify(file));
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.warnings).toEqual([
      {
        component: "xgboost",
        file: "1.0.0",
        runtime: RUNTIME_VERSIONS.xgboost,
      },
    ]);
  });

  it("carnadas del manifiesto: cada campo nuevo mutado se rechaza NOMBRÁNDOLO — detectó k de n", async () => {
    const file = await pack();
    type Mutation = [field: string, mutate: (m: Record<string, any>) => void]; // eslint-disable-line @typescript-eslint/no-explicit-any
    const baits: Mutation[] = [
      ["manifest.league", (m) => (m.league = "liga")],
      ["manifest.league", (m) => (m.league = [])],
      ["manifest.league[0].name", (m) => (m.league[0].name = "no_existe")],
      ["manifest.league[0].status", (m) => (m.league[0].status = "ganó")],
      ["manifest.league[0].cv_mean", (m) => (m.league[0].cv_mean = "0.8")],
      ["manifest.league[0].cv_std", (m) => delete m.league[0].cv_std],
      ["manifest.league[0].test", (m) => (m.league[0].test = "0.9")],
      ["manifest.selection", (m) => (m.selection = "cv")],
      ["manifest.selection.by", (m) => (m.selection.by = "ia")],
      [
        "manifest.selection.cv_winner",
        (m) => (m.selection.cv_winner = "no_existe"),
      ],
      ["manifest.selection.k", (m) => (m.selection.k = 1)],
      ["manifest.selection.metric", (m) => (m.selection.metric = "rmse")],
      ["manifest.selection.rule", (m) => (m.selection.rule = "max")],
      ["manifest.versions.xgboost", (m) => (m.versions.xgboost = 2)],
      ["manifest.versions.lightgbm", (m) => (m.versions.lightgbm = null)],
      ["manifest.model_name", (m) => (m.model_name = "no_existe")],
    ];
    let detected = 0;
    for (const [field, mutate] of baits) {
      const raw = JSON.parse(JSON.stringify(file)) as {
        manifest: Record<string, unknown>;
      };
      mutate(raw.manifest);
      const validation = await validateModelFile(JSON.stringify(raw));
      if (
        !validation.ok &&
        validation.error === "invalid-format" &&
        validation.field === field
      ) {
        detected += 1;
      } else {
        console.log(`[manifiesto] carnada NO detectada: ${field}`, validation);
      }
    }
    console.log(
      `[contrato manifiesto] validateModelFile detectó ${detected} de ${baits.length} carnadas`,
    );
    expect(detected).toBe(baits.length);
  });
});

describe("S6 — manifiesto por tarea (P8)", () => {
  const fixture = (path: string) =>
    readFileSync(resolve(process.cwd(), "tests/fixtures", path), "utf8");

  async function packRegression() {
    const py = JSON.parse(
      fixture("contrato/train-result-regresion.json"),
    ) as RegressionPipelineResult;
    const exported = JSON.parse(
      fixture("contrato/export-result-regresion.json"),
    ) as ExportResult;
    return packModelFile({
      datasetName: "consumo-energia.csv",
      result: assembleRegressionResult(py, [], "consumo_kwh"),
      exported,
      date: DATE,
    });
  }

  it("un archivo REAL del S5 (emitido por su serializador) importa como binaria, sin advertencias", async () => {
    const validation = await validateModelFile(
      fixture("modelos/modelo-s5.probeta.json"),
    );
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.file.manifest.task).toBeUndefined();
    expect(manifestTask(validation.file.manifest)).toBe("binaria");
    expect(isBinaryManifest(validation.file.manifest)).toBe(true);
    expect(validation.warnings).toEqual([]);
  });

  it("un archivo binario nuevo declara su tarea", async () => {
    const file = await pack();
    expect(file.manifest.task).toBe("binaria");
  });

  it("una tarea que la UI no usa se rechaza NOMBRÁNDOLA (D4); desde la F2 la regresión se usa", async () => {
    const text = JSON.stringify(await packRegression());
    expect(await validateModelFile(text, ["binaria"])).toEqual({
      ok: false,
      error: "unsupported-task",
      task: "numerica",
    });
    const usable = await validateModelFile(text);
    expect(usable.ok).toBe(true);
    if (usable.ok) expect(manifestTask(usable.file.manifest)).toBe("numerica");
  });

  it("una tarea que esta versión NO CONOCE también se rechaza nombrándola, no como «no parece un modelo» (ADR 014 §3, AU-S6-02)", async () => {
    for (const task of ["multiclase", "agrupar"]) {
      const raw = JSON.parse(JSON.stringify(await packRegression())) as {
        manifest: Record<string, unknown>;
      };
      raw.manifest.task = task;
      expect(await validateModelFile(JSON.stringify(raw))).toEqual({
        ok: false,
        error: "unsupported-task",
        task,
      });
    }
  });

  it("carnadas del manifiesto de regresión: cada campo nuevo se rechaza NOMBRÁNDOLO — detectó k de n", async () => {
    const file = await packRegression();
    type Mutation = [field: string, mutate: (m: Record<string, any>) => void]; // eslint-disable-line @typescript-eslint/no-explicit-any
    const baits: Mutation[] = [
      // Una tarea que no es texto es forma rota; una tarea con nombre que esta
      // versión no abre se NOMBRA (unsupported-task, prueba aparte: AU-S6-02).
      ["manifest.task", (m) => (m.task = 7)],
      // «numerica» con métricas de clase: un archivo binario disfrazado.
      ["manifest.metrics.model.mae", (m) => (m.metrics.model = { ...METRICS })],
      ["manifest.metrics.model.mae", (m) => (m.metrics.model.mae = -1)],
      [
        "manifest.metrics.baselines.median",
        (m) => delete m.metrics.baselines.median,
      ],
      ["manifest.schema.target_stats", (m) => delete m.schema.target_stats],
      [
        "manifest.schema.target_stats.decimals",
        (m) => (m.schema.target_stats.decimals = 1.5),
      ],
      ["manifest.schema.task", (m) => (m.schema.task = "binaria")],
      [
        "manifest.verdict.primaryMetric",
        (m) => (m.verdict.primaryMetric = "auc"),
      ],
      ["manifest.selection.metric", (m) => (m.selection.metric = "auc")],
      ["manifest.league[0].name", (m) => (m.league[0].name = "logistic")],
      ["manifest.league[0].test.mae", (m) => delete m.league[0].test.mae],
      ["manifest.model_name", (m) => (m.model_name = "naive_bayes")],
    ];
    let detected = 0;
    for (const [field, mutate] of baits) {
      const raw = JSON.parse(JSON.stringify(file)) as {
        manifest: Record<string, unknown>;
      };
      mutate(raw.manifest);
      const validation = await validateModelFile(JSON.stringify(raw), [
        "binaria",
        "numerica",
      ]);
      if (
        !validation.ok &&
        validation.error === "invalid-format" &&
        validation.field === field
      ) {
        detected += 1;
      } else {
        console.log(
          `[manifiesto regresión] carnada NO detectada: ${field}`,
          validation,
        );
      }
    }
    console.log(
      `[contrato manifiesto regresión] validateModelFile detectó ${detected} de ${baits.length} carnadas`,
    );
    expect(detected).toBe(baits.length);
  });
});

describe("modelFileName", () => {
  it("slug del dataset + fecha + extensión .probeta.json", () => {
    expect(modelFileName("Ventas Q1.csv", DATE)).toBe(
      "modelo-ventas-q1-2026-07-11.probeta.json",
    );
  });

  it("dataset sin caracteres útiles ⇒ fallback 'experimento'", () => {
    expect(modelFileName("···.csv", DATE)).toBe(
      "modelo-experimento-2026-07-11.probeta.json",
    );
  });
});
