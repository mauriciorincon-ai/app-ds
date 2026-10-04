import { describe, expect, it } from "vitest";
import {
  categoryPurity,
  detectLeakage,
  detectLeakageByClass,
  LEAKAGE_CLASS_MIN_SUPPORT,
  type LeakageColumn,
  normalizedPurity,
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

// S7 (D8): las clases se evalúan con al menos LEAKAGE_CLASS_MIN_SUPPORT (5) filas
// con valor de cada lado. Las pruebas de abajo tenían 3 por clase: se agrandaron a 5
// sin cambiar lo que prueban (cambio esperado, registrado en la bitácora del S7).
describe("detectLeakage", () => {
  it("marca una feature numérica que es proxy del target", () => {
    const columns: LeakageColumn[] = [
      {
        name: "leak",
        kind: "numeric",
        values: [1, 2, 3, 4, 5, 10, 11, 12, 13, 14],
      },
    ];
    const target: (0 | 1)[] = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
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
      {
        name: "inversa",
        kind: "numeric",
        values: [14, 13, 12, 11, 10, 5, 4, 3, 2, 1],
      },
    ];
    const target: (0 | 1)[] = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
    const findings = detectLeakage(columns, target);
    expect(findings).toHaveLength(1);
    expect(findings[0].score).toBeCloseTo(1);
  });

  it("marca una categórica proxy y ordena por score descendente", () => {
    const columns: LeakageColumn[] = [
      {
        name: "limpia",
        kind: "categorical",
        values: ["a", "b", "a", "b", "a", "b", "a", "b", "a", "b"],
      },
      {
        name: "proxy",
        kind: "categorical",
        values: ["p", "p", "p", "p", "p", "q", "q", "q", "q", "q"],
      },
    ];
    const target: (0 | 1)[] = [1, 1, 1, 1, 1, 0, 0, 0, 0, 0];
    const findings = detectLeakage(columns, target);
    expect(findings).toHaveLength(1);
    expect(findings[0].column).toBe("proxy");
  });

  it("ignora nulos emparejando cada valor con su target", () => {
    const columns: LeakageColumn[] = [
      {
        name: "conNulos",
        kind: "numeric",
        values: [1, null, 2, 3, 4, 5, 10, null, 11, 12, 13, 14],
      },
    ];
    const target: (0 | 1)[] = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1];
    const findings = detectLeakage(columns, target);
    expect(findings).toHaveLength(1);
    expect(findings[0].column).toBe("conNulos");
  });
});

describe("S7 — fuga por clase con soporte mínimo (D8, P6)", () => {
  const perfectValues = (low: number, high: number): number[] => [
    ...Array.from({ length: low }, (_, i) => i),
    ...Array.from({ length: high }, (_, i) => 100 + i),
  ];
  const perfect = (low: number, high: number): LeakageColumn => ({
    name: "espia",
    kind: "numeric",
    values: perfectValues(low, high),
  });
  const target = (low: number, high: number) =>
    [...Array(low).fill(0), ...Array(high).fill(1)] as (0 | 1)[];

  it("el soporte mínimo es 5 (decisión del usuario en el STOP de la F0)", () => {
    expect(LEAKAGE_CLASS_MIN_SUPPORT).toBe(5);
  });

  it("borde: con 4 filas en la clase chica NO se evalúa; con 5, se marca", () => {
    expect(detectLeakage([perfect(20, 4)], target(20, 4))).toEqual([]);
    const found = detectLeakage([perfect(20, 5)], target(20, 5));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      column: "espia",
      reason: "near-perfect-separation",
    });
    expect(found[0].score).toBeCloseTo(1);
  });

  it("el soporte se cuenta en filas CON valor (los nulos no suman)", () => {
    const column: LeakageColumn = {
      name: "espia",
      kind: "numeric",
      values: [...perfectValues(20, 5).slice(0, 24), null],
    };
    expect(detectLeakage([column], target(20, 5))).toEqual([]);
  });

  it("pureza normalizada: una clase chica no da falsa alarma; la fuga perfecta sí", () => {
    // 2 de 40 en la clase: la categoría al azar da pureza CRUDA alta por construcción.
    const t = [1, 1, ...Array(38).fill(0)] as (0 | 1)[];
    const azar = Array.from({ length: 40 }, (_, i) => `c${i % 4}`);
    expect(categoryPurity(azar, t)).toBeGreaterThanOrEqual(0.95);
    expect(normalizedPurity(azar, t)).toBeLessThan(0.1);
    const espejo = t.map((v) => (v ? "si" : "no"));
    expect(normalizedPurity(espejo, t)).toBeCloseTo(1);
    expect(normalizedPurity(["a", "b"], [1, 1])).toBeNull();
  });

  it("una categórica al azar con una clase chica (5 de 300) no se marca", () => {
    // Con la pureza CRUDA saldría ≥ 295/300 = 0,983 sin mirar la columna.
    const t = Array.from({ length: 300 }, (_, i) => (i < 5 ? 1 : 0)) as (
      0 | 1
    )[];
    const column: LeakageColumn = {
      name: "region",
      kind: "categorical",
      values: t.map((_, i) => `r${(i * 7) % 4}`),
    };
    expect(categoryPurity(column.values as string[], t)).toBeGreaterThan(0.98);
    expect(detectLeakage([column], t)).toEqual([]);
  });

  it("varias categorías: marca la columna y NOMBRA la clase que delata", () => {
    const labels = [
      ...Array(10).fill("basico"),
      ...Array(8).fill("premium"),
      ...Array(6).fill("empresa"),
    ];
    // Solo «empresa» tiene un cargo corporativo; las demás, cero.
    const cargo: LeakageColumn = {
      name: "cargo_corporativo",
      kind: "numeric",
      values: labels.map((l, i) => (l === "empresa" ? 500 + i : 0)),
    };
    const limpia: LeakageColumn = {
      name: "usuarios",
      kind: "numeric",
      values: labels.map((_, i) => (i * 7) % 11),
    };
    const found = detectLeakageByClass([limpia, cargo], labels);
    expect(found).toEqual([
      {
        column: "cargo_corporativo",
        score: 1,
        reason: "near-perfect-separation",
        class: "empresa",
      },
    ]);
  });

  it("varias categorías: una clase con 4 filas no se evalúa (sin falsa alarma)", () => {
    const labels = [
      ...Array(12).fill("a"),
      ...Array(4).fill("b"),
      ...Array(9).fill("c"),
    ];
    const column: LeakageColumn = {
      name: "espia",
      kind: "categorical",
      values: labels.map((l) => (l === "b" ? "solo-b" : "otro")),
    };
    expect(detectLeakageByClass([column], labels)).toEqual([]);
  });

  it("con dos clases, la binaria y la regla por clase marcan lo mismo", () => {
    const columns = [perfect(20, 5), perfect(20, 4)].map((c, i) => ({
      ...c,
      name: `c${i}`,
    }));
    const t = target(20, 5);
    const labels = t.map((v) => (v ? "si" : "no"));
    const binary = detectLeakage(columns, t).map((f) => f.column);
    const byClass = detectLeakageByClass(columns, labels).map((f) => f.column);
    expect(byClass).toEqual(binary);
  });
});
