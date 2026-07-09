import { describe, expect, it } from "vitest";
import {
  computeVerdict,
  type Metrics,
  pickBestBaseline,
  pickPrimaryMetric,
  TIE_EPSILON,
} from "@/engine/verdict";

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

describe("computeVerdict", () => {
  it("marca 'beats' cuando el modelo supera al baseline por más que epsilon", () => {
    const v = computeVerdict(
      metrics({ auc: 0.9 }),
      metrics({ auc: 0.5 }),
      "auc",
    );
    expect(v.level).toBe("beats");
    expect(v.delta).toBeCloseTo(0.4);
    expect(v.modelScore).toBe(0.9);
    expect(v.baselineScore).toBe(0.5);
  });

  it("marca 'loses' cuando el modelo NO supera al baseline", () => {
    const v = computeVerdict(metrics({ f1: 0.4 }), metrics({ f1: 0.7 }), "f1");
    expect(v.level).toBe("loses");
    expect(v.delta).toBeCloseTo(-0.3);
  });

  it("marca 'ties' dentro del margen de empate honesto", () => {
    const v = computeVerdict(
      metrics({ auc: 0.5 + TIE_EPSILON / 2 }),
      metrics({ auc: 0.5 }),
      "auc",
    );
    expect(v.level).toBe("ties");
  });

  it("una mejora marginal dentro del margen NO se infla a victoria", () => {
    // delta 0.009 < TIE_EPSILON (0.01) → empate honesto, no victoria.
    const v = computeVerdict(
      metrics({ f1: 0.509 }),
      metrics({ f1: 0.5 }),
      "f1",
    );
    expect(v.level).toBe("ties");
  });
});

describe("pickPrimaryMetric", () => {
  it("usa AUC con clases desbalanceadas", () => {
    expect(pickPrimaryMetric(0.1)).toBe("auc");
    expect(pickPrimaryMetric(0.9)).toBe("auc");
  });

  it("usa F1 con clases balanceadas", () => {
    expect(pickPrimaryMetric(0.5)).toBe("f1");
    expect(pickPrimaryMetric(0.45)).toBe("f1");
  });

  it("el límite 0.15 de desbalance cuenta como desbalanceado", () => {
    expect(pickPrimaryMetric(0.35)).toBe("auc");
  });
});

describe("pickBestBaseline", () => {
  it("devuelve el baseline más fuerte en la métrica primaria", () => {
    const majority = metrics({ auc: 0.5 });
    const logistic = metrics({ auc: 0.72 });
    expect(pickBestBaseline([majority, logistic], "auc")).toBe(logistic);
  });

  it("lanza error si no hay baselines", () => {
    expect(() => pickBestBaseline([], "auc")).toThrow(/al menos un baseline/);
  });
});
