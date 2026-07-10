// @vitest-environment node
//
// Test de integración (Pyodide/WASM) del pipeline anti-fuga. Es el test que la
// DoD exige: FALLA si alguien ajusta el preprocesador sobre todo el dataset en
// vez de solo sobre train. Corre en su propia config (vitest.integration.config)
// con entorno node y timeout amplio (carga Pyodide + pandas + scikit-learn).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadPyodide, type PyodideInterface } from "pyodide";
import { parseCsvWithLimits } from "@/lib/ds/csv";
import { prepareRun } from "@/lib/experiment";

let pyodide: PyodideInterface;
// PyProxy invocable: run_experiment(payload_json) -> result_json
let runExperiment: (payloadJson: string) => string;

beforeAll(async () => {
  pyodide = await loadPyodide();
  await pyodide.loadPackage(["pandas", "scikit-learn"]);
  pyodide.runPython(
    readFileSync(resolve(process.cwd(), "src/lib/ds/pipeline.py"), "utf8"),
  );
  runExperiment = pyodide.globals.get("run_experiment") as unknown as (
    payloadJson: string,
  ) => string;
}, 180_000);

function run(payload: unknown): Record<string, unknown> {
  return JSON.parse(runExperiment(JSON.stringify(payload)));
}

describe("pipeline anti-fuga (integración Pyodide)", () => {
  it("el preprocesador se ajusta SOLO en train (falla si usa todo el dataset)", () => {
    // La columna x en train=[1,2,3,4] tiene mediana 2.5; si el imputer se
    // ajustara sobre todo el dataset (incluyendo test 100,100) sería 3.5.
    const result = run({
      headers: ["x", "y"],
      rows: [
        ["1", "0"],
        ["2", "0"],
        ["3", "1"],
        ["4", "1"],
        ["100", "0"],
        ["100", "1"],
      ],
      target: "y",
      numeric: ["x"],
      categorical: [],
      train_idx: [0, 1, 2, 3],
      test_idx: [4, 5],
      seed: 1,
    });

    const preprocessing = result.preprocessing as {
      numeric_medians: Record<string, number>;
    };
    expect(preprocessing.numeric_medians.x).toBe(2.5);
  });

  it("calcula métricas sobre test y devuelve la forma esperada", () => {
    const result = run({
      headers: ["x", "y"],
      rows: Array.from({ length: 40 }, (_, i) => [
        String(i),
        i % 2 === 0 ? "0" : "1",
      ]),
      target: "y",
      numeric: ["x"],
      categorical: [],
      train_idx: Array.from({ length: 30 }, (_, i) => i),
      test_idx: Array.from({ length: 10 }, (_, i) => i + 30),
      seed: 42,
    });

    expect(result.n_test).toBe(10);
    const model = result.model as { auc: number; f1: number };
    expect(model.auc).toBeGreaterThanOrEqual(0);
    expect(model.auc).toBeLessThanOrEqual(1);
    expect(result.confusion_matrix).toHaveLength(2);
  });
});

// --- Explicabilidad (S2) — permutation_importance sobre test -----------------

type ExplainFeature = {
  name: string;
  kind: "numeric" | "categorical";
  importance: number;
  std: number;
  direction: "positive" | "negative" | null;
};

type Explainability = {
  method: string;
  scoring: string;
  n_repeats: number;
  features: ExplainFeature[];
};

// Corre el experimento completo sobre un CSV real empaquetado, reusando la
// orquestación de producción (parse + split anti-fuga de prepareRun).
function runDataset(file: string, target: string): Explainability {
  const csv = readFileSync(
    resolve(process.cwd(), "public/datasets", file),
    "utf8",
  );
  const parsed = parseCsvWithLimits(csv);
  if (!parsed.ok) throw new Error(`parse failed: ${file}`);
  const prepared = prepareRun(parsed.table, target, 42);
  if (!prepared.ok) throw new Error(`prepare failed: ${file}`);
  const result = run(prepared.payload);
  return result.explainability as Explainability;
}

describe("explicabilidad (integración Pyodide)", () => {
  it("devuelve la forma esperada, ordenada por importancia descendente", () => {
    const explain = runDataset("marketing-campania.csv", "convirtio");

    expect(explain.method).toBe("permutation_importance");
    expect(explain.scoring).toBe("roc_auc");
    const importances = explain.features.map((f) => f.importance);
    expect(importances).toEqual([...importances].sort((a, b) => b - a));
    for (const feature of explain.features) {
      expect(["numeric", "categorical"]).toContain(feature.kind);
      // Dirección solo puede existir en numéricas (categóricas: varía por categoría).
      if (feature.kind === "categorical") expect(feature.direction).toBeNull();
    }
  });

  it("sanity empírico: la señal real de marketing queda arriba", () => {
    // La señal del generador es la interacción dispositivo×(visitas_web |
    // correos_abiertos); edad/ingreso_mensual/region son ruido puro.
    const explain = runDataset("marketing-campania.csv", "convirtio");
    const top3 = explain.features.slice(0, 3).map((f) => f.name);

    expect(top3).toContain("dispositivo");
    expect(
      top3.includes("visitas_web") || top3.includes("correos_abiertos"),
    ).toBe(true);
    expect(explain.features[0]!.name).not.toBe("edad");
    expect(explain.features[0]!.name).not.toBe("ingreso_mensual");
  });

  it("sanity empírico: el proxy de fuga plantada domina la importancia", () => {
    const explain = runDataset("credito-fuga-plantada.csv", "incumplio");
    const [first, second] = explain.features;

    expect(first!.name).toBe("monto_recuperado");
    // Dominio claro, no un empate: el proxy post-resultado concentra la señal.
    expect(first!.importance).toBeGreaterThan(
      2 * Math.max(second!.importance, 0.01),
    );
  });
});
