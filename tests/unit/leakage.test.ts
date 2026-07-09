import { describe, expect, it } from "vitest";
import {
  categoryPurity,
  detectLeakage,
  type LeakageColumn,
  rankAuc,
} from "@/engine/leakage";

describe("rankAuc", () => {
  it("separación perfecta creciente → 1.0", () => {
    const values = [1, 2, 3, 4, 5, 6];
    const target: (0 | 1)[] = [0, 0, 0, 1, 1, 1];
    expect(rankAuc(values, target)).toBeCloseTo(1);
  });

  it("separación perfecta inversa → 0.0", () => {
    const values = [1, 2, 3, 4, 5, 6];
    const target: (0 | 1)[] = [1, 1, 1, 0, 0, 0];
    expect(rankAuc(values, target)).toBeCloseTo(0);
  });

  it("maneja empates con rangos promedio", () => {
    const values = [1, 1, 2, 2];
    const target: (0 | 1)[] = [0, 1, 0, 1];
    expect(rankAuc(values, target)).toBeCloseTo(0.5);
  });

  it("devuelve 0.5 con una sola clase presente", () => {
    expect(rankAuc([1, 2, 3], [1, 1, 1])).toBe(0.5);
  });

  it("devuelve 0.5 con entrada vacía o longitudes distintas", () => {
    expect(rankAuc([], [])).toBe(0.5);
    expect(rankAuc([1, 2], [1])).toBe(0.5);
  });
});

describe("categoryPurity", () => {
  it("proxy perfecto → 1.0", () => {
    const values = ["x", "x", "y", "y"];
    const target: (0 | 1)[] = [1, 1, 0, 0];
    expect(categoryPurity(values, target)).toBeCloseTo(1);
  });

  it("categoría sin poder predictivo → ~0.5", () => {
    const values = ["x", "x", "x", "x"];
    const target: (0 | 1)[] = [1, 0, 1, 0];
    expect(categoryPurity(values, target)).toBeCloseTo(0.5);
  });

  it("devuelve 0 con entrada vacía", () => {
    expect(categoryPurity([], [])).toBe(0);
  });
});

describe("detectLeakage", () => {
  it("marca una feature numérica que es proxy del target", () => {
    const columns: LeakageColumn[] = [
      { name: "leak", kind: "numeric", values: [1, 2, 3, 10, 11, 12] },
    ];
    const target: (0 | 1)[] = [0, 0, 0, 1, 1, 1];
    const findings = detectLeakage(columns, target);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      column: "leak",
      reason: "near-perfect-separation",
    });
  });

  it("NO marca una feature numérica limpia (relación débil)", () => {
    // target=1 en índices 0,3,4 → valores mezclados (bajo, alto, alto): AUC ≈ 0.44,
    // score ≈ 0.56, muy por debajo del umbral 0.98.
    const columns: LeakageColumn[] = [
      { name: "ruido", kind: "numeric", values: [10, 20, 30, 40, 50, 60] },
    ];
    const target: (0 | 1)[] = [1, 0, 0, 1, 1, 0];
    expect(detectLeakage(columns, target)).toEqual([]);
  });

  it("es agnóstico a la dirección (feature inversa también se marca)", () => {
    const columns: LeakageColumn[] = [
      { name: "inversa", kind: "numeric", values: [12, 11, 10, 3, 2, 1] },
    ];
    const target: (0 | 1)[] = [0, 0, 0, 1, 1, 1];
    const findings = detectLeakage(columns, target);
    expect(findings).toHaveLength(1);
    expect(findings[0].score).toBeCloseTo(1);
  });

  it("marca una categórica proxy y ordena por score descendente", () => {
    const columns: LeakageColumn[] = [
      {
        name: "limpia",
        kind: "categorical",
        values: ["a", "b", "a", "b", "a", "b"],
      },
      {
        name: "proxy",
        kind: "categorical",
        values: ["p", "p", "p", "q", "q", "q"],
      },
    ];
    const target: (0 | 1)[] = [1, 1, 1, 0, 0, 0];
    const findings = detectLeakage(columns, target);
    expect(findings).toHaveLength(1);
    expect(findings[0].column).toBe("proxy");
  });

  it("ignora nulos emparejando cada valor con su target", () => {
    const columns: LeakageColumn[] = [
      { name: "conNulos", kind: "numeric", values: [1, null, 3, 10, null, 12] },
    ];
    const target: (0 | 1)[] = [0, 0, 0, 1, 1, 1];
    const findings = detectLeakage(columns, target);
    expect(findings).toHaveLength(1);
    expect(findings[0].column).toBe("conNulos");
  });
});
