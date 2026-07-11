import { describe, expect, it } from "vitest";
import type { ExperimentResult, ExportResult } from "@/workers/protocol";
import {
  MODEL_FILE_FORMAT_VERSION,
  RUNTIME_VERSIONS,
  modelFileName,
  packModelFile,
  validateModelFile,
} from "@/lib/model-file";

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
