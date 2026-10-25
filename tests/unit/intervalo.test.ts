// @vitest-environment node
/**
 * S18 — el intervalo de la métrica del ganador en Probeta. Lo que estas pruebas hacen FALLAR si se rompe:
 *  · cada métrica primaria de las tres tareas da, sobre la prueba tal cual, la cifra que un cálculo directo da;
 *  · el AUC por orden (O(n) por remuestreo) coincide con el AUC por pares de siempre, con empates;
 *  · con semilla es DETERMINISTA: la misma cifra dos veces; otra semilla, otro intervalo;
 *  · con más filas el intervalo se angosta, y sin variación en los datos queda en un punto.
 */
import { describe, expect, it } from "vitest";
import { rankAuc } from "@/engine/leakage";
import {
  calcularIntervalo,
  FILAS_PRUEBA_POCAS,
  NIVEL,
  REMUESTREOS,
} from "@/engine/intervalo";
import { mulberry32 } from "@/engine/split";

/** Dos clases con mucho ruido (las clases se traslapan): el puntaje sube con la clase, con empates a propósito (se redondea). */
function dosClases(n: number, semilla = 7) {
  const rng = mulberry32(semilla);
  const y: number[] = [];
  const score: number[] = [];
  for (let i = 0; i < n; i++) {
    const clase = rng() < 0.4 ? 1 : 0;
    y.push(clase);
    score.push(Math.round((0.4 + 0.2 * clase + 0.6 * (rng() - 0.5)) * 10) / 10);
  }
  const pred = score.map((s) => (s >= 0.5 ? 1 : 0));
  return { y, pred, score };
}

const bruto = {
  auc: (y: number[], score: number[]) => {
    let favor = 0;
    let pares = 0;
    for (let i = 0; i < y.length; i++)
      for (let j = 0; j < y.length; j++)
        if (y[i] === 1 && y[j] === 0) {
          pares += 1;
          favor += score[i]! > score[j]! ? 1 : score[i]! === score[j]! ? 0.5 : 0;
        }
    return favor / pares;
  },
};

describe("la métrica sobre la prueba tal cual", () => {
  const datos = dosClases(80);
  const base = { task: "binaria" as const, ...datos, semilla: 1, remuestreos: 5 };

  it("AUC: por orden da lo mismo que por pares (con empates) y que el rankAuc de la fuga", () => {
    const r = calcularIntervalo({ ...base, metric: "auc" });
    expect(r.valor).toBeCloseTo(bruto.auc(datos.y, datos.score), 12);
    expect(r.valor).toBeCloseTo(rankAuc(datos.score, datos.y as (0 | 1)[]), 12);
  });

  it("exactitud, precisión, sensibilidad y F1 con una prueba chica contada a mano", () => {
    const y = [1, 1, 1, 0, 0, 0, 0, 0];
    const pred = [1, 1, 0, 1, 0, 0, 0, 0];
    const score = [0.9, 0.8, 0.4, 0.6, 0.2, 0.1, 0.3, 0.2];
    const entrada = { task: "binaria" as const, y, pred, score, semilla: 1, remuestreos: 3 };
    // tp=2 fp=1 fn=1 tn=4
    expect(calcularIntervalo({ ...entrada, metric: "accuracy" }).valor).toBeCloseTo(6 / 8, 12);
    expect(calcularIntervalo({ ...entrada, metric: "precision" }).valor).toBeCloseTo(2 / 3, 12);
    expect(calcularIntervalo({ ...entrada, metric: "recall" }).valor).toBeCloseTo(2 / 3, 12);
    expect(calcularIntervalo({ ...entrada, metric: "f1" }).valor).toBeCloseTo(2 / 3, 12);
  });

  it("exactitud balanceada (varias categorías): el promedio del recall de cada clase", () => {
    const y = [0, 0, 0, 0, 1, 1, 2, 2, 2, 2];
    const pred = [0, 0, 0, 1, 1, 1, 2, 0, 2, 2];
    const r = calcularIntervalo({
      task: "multiclase",
      metric: "balanced_accuracy",
      y,
      pred,
      score: null,
      clases: 3,
      semilla: 1,
      remuestreos: 3,
    });
    expect(r.valor).toBeCloseTo((3 / 4 + 2 / 2 + 3 / 4) / 3, 12);
  });

  it("MAE (estimar una cantidad): el error absoluto medio en las unidades del objetivo", () => {
    const y = [10, 20, 30, 40];
    const pred = [12, 18, 33, 40];
    const r = calcularIntervalo({
      task: "numerica",
      metric: "mae",
      y,
      pred,
      score: null,
      semilla: 1,
      remuestreos: 3,
    });
    expect(r.valor).toBeCloseTo((2 + 2 + 3 + 0) / 4, 12);
  });
});

describe("el intervalo", () => {
  const datos = dosClases(200);
  const entrada = { task: "binaria" as const, metric: "auc" as const, ...datos };

  it("tiene 1 000 remuestreos y 95 % por defecto, y la semilla que se le dio", () => {
    expect(REMUESTREOS).toBe(1000);
    expect(NIVEL).toBe(0.95);
    const r = calcularIntervalo({ ...entrada, semilla: 42 });
    expect(r).toMatchObject({ remuestreos: 1000, semilla: 42, n: 200 });
    expect(r.bajo).toBeLessThan(r.valor);
    expect(r.alto).toBeGreaterThan(r.valor);
  });

  it("con semilla es DETERMINISTA: la misma cifra dos veces; otra semilla da otro intervalo", () => {
    const a = calcularIntervalo({ ...entrada, semilla: 42 });
    const b = calcularIntervalo({ ...entrada, semilla: 42 });
    expect(b).toEqual(a);
    const c = calcularIntervalo({ ...entrada, semilla: 43 });
    expect(c.valor).toBe(a.valor);
    expect([c.bajo, c.alto]).not.toEqual([a.bajo, a.alto]);
  });

  it("con más filas de prueba el intervalo se angosta", () => {
    const ancho = (n: number) => {
      const r = calcularIntervalo({ task: "binaria", metric: "auc", ...dosClases(n), semilla: 42 });
      return r.alto - r.bajo;
    };
    expect(ancho(2000)).toBeLessThan(ancho(100));
    expect(FILAS_PRUEBA_POCAS).toBeGreaterThanOrEqual(30);
  });

  it("si la prueba no varía (todo se acierta), el intervalo es un punto", () => {
    const y = Array.from({ length: 40 }, (_, i) => i % 2);
    const r = calcularIntervalo({
      task: "binaria",
      metric: "accuracy",
      y,
      pred: y,
      score: y.map((v) => v * 0.9 + 0.05),
      semilla: 3,
    });
    expect([r.valor, r.bajo, r.alto]).toEqual([1, 1, 1]);
  });

  it("el AUC de un remuestreo sin una de las dos clases vale 0.5, como pipeline.py", () => {
    const r = calcularIntervalo({
      task: "binaria",
      metric: "auc",
      y: [1, 0, 0, 0, 0, 0, 0, 0],
      pred: [1, 0, 0, 0, 0, 0, 0, 0],
      score: [0.9, 0.1, 0.2, 0.1, 0.3, 0.2, 0.1, 0.2],
      semilla: 5,
      remuestreos: 400,
    });
    expect(r.valor).toBe(1);
    expect(r.bajo).toBeLessThanOrEqual(0.5);
  });
});
