import { describe, expect, it } from "vitest";
import type { Metrics } from "@/engine/verdict";
import type { CsvTable, ColumnProfile } from "@/lib/ds/csv";
import { assembleResult, prepareRun, summarizeDataset } from "@/lib/experiment";
import type { PipelineResult } from "@/workers/protocol";

function table(headers: string[], rows: string[][]): CsvTable {
  return { headers, rows };
}

function metrics(overrides: Partial<Metrics> = {}): Metrics {
  return {
    accuracy: 0.5,
    precision: 0.5,
    recall: 0.5,
    f1: 0.5,
    auc: 0.5,
    ...overrides,
  };
}

describe("summarizeDataset", () => {
  it("perfila columnas y detecta candidatos a objetivo y fechas", () => {
    const t = table(
      ["edad", "region", "alta", "convirtio"],
      [
        ["30", "norte", "2024-01-01", "0"],
        ["45", "sur", "2024-02-01", "1"],
        ["50", "norte", "2024-03-01", "0"],
      ],
    );
    const summary = summarizeDataset(t);
    expect(summary.rowCount).toBe(3);
    expect(summary.targetCandidates).toContain("convirtio");
    expect(summary.dateColumns).toContain("alta");
    const edad = summary.profiles.find((p: ColumnProfile) => p.name === "edad");
    expect(edad?.kind).toBe("numeric");
  });
});

describe("prepareRun", () => {
  const clean = table(
    ["x", "cat", "y"],
    [
      ["1", "a", "0"],
      ["2", "a", "1"],
      ["3", "b", "0"],
      ["4", "b", "1"],
      ["5", "a", "0"],
      ["6", "a", "1"],
      ["7", "b", "0"],
      ["8", "b", "1"],
    ],
  );

  it("arma el payload con features numéricas y categóricas y un split sin solapamiento", () => {
    const prepared = prepareRun(clean, "y", 42);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.payload.numeric).toEqual(["x"]);
    expect(prepared.payload.categorical).toEqual(["cat"]);
    const all = [
      ...prepared.payload.train_idx,
      ...prepared.payload.test_idx,
    ].sort((a, b) => a - b);
    expect(all).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(prepared.leakage).toEqual([]);
  });

  it("rechaza un objetivo no binario", () => {
    const t = table(
      ["x", "t"],
      [
        ["1", "a"],
        ["2", "b"],
        ["3", "c"],
      ],
    );
    expect(prepareRun(t, "t", 1)).toEqual({
      ok: false,
      error: "target-not-binary",
    });
  });

  it("rechaza cuando no quedan features (solo fecha + objetivo)", () => {
    const t = table(
      ["alta", "y"],
      [
        ["2024-01-01", "0"],
        ["2024-02-01", "1"],
        ["2024-03-01", "0"],
        ["2024-04-01", "1"],
      ],
    );
    expect(prepareRun(t, "y", 1)).toEqual({ ok: false, error: "no-features" });
  });

  it("marca una feature categórica que es proxy del objetivo", () => {
    const leaky = table(
      ["proxy", "y"],
      [
        ["p", "0"],
        ["p", "0"],
        ["q", "1"],
        ["q", "1"],
        ["p", "0"],
        ["p", "0"],
        ["q", "1"],
        ["q", "1"],
      ],
    );
    const prepared = prepareRun(leaky, "y", 42);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.leakage.map((f) => f.column)).toContain("proxy");
  });
});

describe("assembleResult", () => {
  it("elige la métrica primaria, el mejor baseline y calcula el veredicto", () => {
    const py: PipelineResult = {
      positive_class: "1",
      positive_rate: 0.3,
      n_train: 6,
      n_test: 2,
      baselines: {
        majority: metrics({ auc: 0.5 }),
        logistic: metrics({ auc: 0.6 }),
      },
      model: metrics({ auc: 0.8 }),
      confusion_matrix: [
        [1, 0],
        [0, 1],
      ],
    };
    const result = assembleResult(py, []);
    // desbalanceado (0.3) → métrica primaria AUC; mejor baseline 0.6; modelo 0.8 → supera
    expect(result.verdict.primaryMetric).toBe("auc");
    expect(result.verdict.level).toBe("beats");
    expect(result.verdict.baselineScore).toBe(0.6);
  });
});
