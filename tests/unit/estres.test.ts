// S17 (ADR 023): la lectura de la prueba de estrés. Pura: qué dicen las cifras que pipeline.py ya midió.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NOISE_LEVELS,
  SEAL_NOISE_LEVEL,
  SHIFT_COLUMNS,
  SHIFT_LEVELS,
  SHUFFLE_REPEATS,
  noiseAt,
  robustness,
  trendOf,
  worsening,
  worstColumn,
} from "@/engine/estres";
import type { StressResult } from "@/workers/protocol";

const resultado = (over: Partial<StressResult> = {}): StressResult => ({
  task: "binaria",
  metric: { name: "auc", direction: "higher" },
  base: 0.91,
  n_test: 100,
  seed: 42,
  noise: [
    { level: 0.05, value: 0.88 },
    { level: 0.1, value: 0.74 },
    { level: 0.2, value: 0.6 },
  ],
  shuffle: [
    { column: "ingreso", kind: "numeric", value: 0.7 },
    { column: "region", kind: "categorical", value: 0.9 },
  ],
  shift: [
    { level: 0.5, columns: ["ingreso"], value: 0.8 },
    { level: 1, columns: ["ingreso"], value: 0.65 },
  ],
  elapsed_ms: 10,
  ...over,
});

describe("las constantes son las de pipeline.py (una receta, dos lenguajes)", () => {
  const python = readFileSync(
    resolve(__dirname, "../../src/lib/ds/pipeline.py"),
    "utf8",
  );
  const tupla = (nombre: string) =>
    [...python.match(new RegExp(`^${nombre} = \\(([^)]*)\\)`, "m"))![1]!.matchAll(/[\d.]+/g)].map((m) => Number(m[0]));
  const entero = (nombre: string) =>
    Number(python.match(new RegExp(`^${nombre} = (\\d+)`, "m"))![1]);

  it("niveles de ruido y de corrimiento, repeticiones y columnas", () => {
    expect(tupla("STRESS_NOISE_LEVELS")).toEqual([...NOISE_LEVELS]);
    expect(tupla("STRESS_SHIFT_LEVELS")).toEqual([...SHIFT_LEVELS]);
    expect(entero("STRESS_SHUFFLE_REPEATS")).toBe(SHUFFLE_REPEATS);
    expect(entero("STRESS_SHIFT_COLUMNS")).toBe(SHIFT_COLUMNS);
  });
  it("el nivel del sello es uno de los niveles de ruido", () => {
    expect(NOISE_LEVELS).toContain(SEAL_NOISE_LEVEL);
  });
});

describe("cuánto peor quedó", () => {
  it("con una métrica que sube, perder puntos es empeorar; con el error medio, subirlo", () => {
    expect(worsening("higher", 0.91, 0.74)).toBeCloseTo(0.17);
    expect(worsening("lower", 100, 130)).toBe(30);
    expect(worsening("lower", 100, 80)).toBe(-20);
  });
  it("medio punto o menos (0,5 % del error base) se lee «casi igual»", () => {
    const r = resultado();
    expect(trendOf(r, 0.74)).toBe("worse");
    expect(trendOf(r, 0.907)).toBe("same");
    expect(trendOf(r, 0.95)).toBe("better");
    const e = resultado({
      task: "numerica",
      metric: { name: "mae", direction: "lower" },
      base: 200,
    });
    expect(trendOf(e, 200.9)).toBe("same");
    expect(trendOf(e, 260)).toBe("worse");
    expect(trendOf(e, 150)).toBe("better");
  });
});

describe("el renglón y la peor columna", () => {
  it("encuentra el nivel pedido, o nada", () => {
    expect(noiseAt(resultado(), 0.1)!.value).toBe(0.74);
    expect(noiseAt(resultado(), 0.3)).toBeUndefined();
  });
  it("la peor columna es la primera del orden de Python, si de verdad empeora", () => {
    expect(worstColumn(resultado())!.column).toBe("ingreso");
    expect(
      worstColumn(
        resultado({ shuffle: [{ column: "x", kind: "numeric", value: 0.95 }] }),
      ),
    ).toBeNull();
    expect(worstColumn(resultado({ shuffle: [] }))).toBeNull();
  });
});

describe("el criterio del ✓: con 10 % de ruido, ¿sigue ganándole a su rival sin modelo?", () => {
  it("sí: la regla de siempre (computeVerdict), con la cifra a la vista", () => {
    const r = robustness(resultado({ noise: [{ level: 0.1, value: 0.8 }] }), 0.5);
    expect(r).toMatchObject({ kind: "holds", level: 0.1, value: 0.8, rival: 0.5, base: 0.91 });
  });
  it("no: con ruido deja de ganarle (y se dice que antes sí le ganaba)", () => {
    const r = robustness(resultado(), 0.74);
    expect(r).toMatchObject({ kind: "drops", alreadyLost: false, value: 0.74 });
  });
  it("un empate dentro de la tolerancia del veredicto no es ganar", () => {
    const r = robustness(resultado({ noise: [{ level: 0.1, value: 0.595 }] }), 0.59);
    expect(r.kind).toBe("drops");
  });
  it("ya no le ganaba SIN ruido: la lectura lo dice en vez de culpar al ruido", () => {
    const r = robustness(
      resultado({ base: 0.505, noise: [{ level: 0.1, value: 0.5 }] }),
      0.5,
    );
    expect(r).toMatchObject({ kind: "drops", alreadyLost: true });
  });
  it("con el error medio, ganar es equivocarse MENOS que el rival (más de 1 % menos)", () => {
    const e = (valor: number) =>
      resultado({
        task: "numerica",
        metric: { name: "mae", direction: "lower" },
        base: 40,
        noise: [{ level: 0.1, value: valor }],
      });
    expect(robustness(e(50), 100).kind).toBe("holds");
    expect(robustness(e(120), 100).kind).toBe("drops");
  });
  it("sin numéricas no hay dónde poner ruido: no se mide, no se inventa", () => {
    expect(robustness(resultado({ noise: [] }), 0.5)).toEqual({ kind: "no-noise" });
  });
});
