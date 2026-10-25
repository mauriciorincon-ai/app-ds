// @vitest-environment node
/**
 * S19 (ADR 027): vigilar el desempeño. Garantías que estos tests hacen FALLAR si se rompen:
 *  - «reentrenar» solo cuando TODO el intervalo de hoy queda peor que la cifra de la prueba más allá del empate; con la cifra
 *    peor pero el intervalo todavía tocando el empate, «revisar»; con la cifra no peor más allá del empate, «sigue»;
 *  - la regla respeta la dirección de cada métrica (mayor es mejor / menor es mejor) y su empate (0,01 absoluto; 1 % relativo con MAE);
 *  - con menos de 50 filas con resultado real nunca se decide: siempre «revisar»;
 *  - el borde exacto del empate cuenta como empate (no es peor);
 *  - la lectura completa sobre lo que entregó el emisor real es determinista.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Intervalo } from "@/engine/intervalo";
import {
  empateDe,
  metricaIndefinida,
  veredictoDe,
  vigilar,
  VEREDICTOS_VIGILANCIA,
  type ReferenciaVigilancia,
} from "@/engine/vigilancia";
import type { EvaluateNewResult } from "@/workers/protocol";

const hoy = (valor: number, bajo: number, alto: number, n = 300): Intervalo => ({
  valor,
  bajo,
  alto,
  remuestreos: 1000,
  semilla: 42,
  n,
});
const F1: ReferenciaVigilancia = { metric: "f1", valor: 0.8, nPrueba: 50 };
const MAE: ReferenciaVigilancia = { metric: "mae", valor: 10, nPrueba: 50 };

describe("las palabras son las del chequeo de deriva de la etapa 10", () => {
  it("sigue · revisar · reentrenar", () => {
    expect([...VEREDICTOS_VIGILANCIA]).toEqual(["sigue", "revisar", "reentrenar"]);
  });
});

describe("mayor es mejor (f1, auc, exactitud…): empate 0,01 absoluto", () => {
  it("todo el intervalo peor que la prueba menos el empate → reentrenar", () => {
    expect(veredictoDe(hoy(0.6, 0.55, 0.65), F1)).toBe("reentrenar");
  });
  it("el extremo de arriba justo en el empate NO es peor → revisar (la cifra sí es peor)", () => {
    // 0.8 − 0.01 = 0.79: un alto de 0.79 no está estrictamente por debajo
    expect(veredictoDe(hoy(0.7, 0.6, 0.79), F1)).toBe("revisar");
    expect(veredictoDe(hoy(0.7, 0.6, 0.789), F1)).toBe("reentrenar");
  });
  it("la cifra de hoy no peor que la prueba más allá del empate → sigue", () => {
    expect(veredictoDe(hoy(0.9, 0.85, 0.95), F1)).toBe("sigue");
    expect(veredictoDe(hoy(0.79, 0.7, 0.88), F1)).toBe("sigue"); // justo en el empate
    expect(veredictoDe(hoy(0.8, 0.7, 0.9), F1)).toBe("sigue");
  });
  it("la cifra peor más allá del empate pero con el intervalo tocando la prueba → revisar", () => {
    expect(veredictoDe(hoy(0.75, 0.68, 0.82), F1)).toBe("revisar");
  });
});

describe("menor es mejor (MAE): empate relativo del 1 %", () => {
  it("el empate es el 1 % de la cifra de la prueba", () => {
    expect(empateDe("mae", 10)).toBeCloseTo(0.1, 12);
    expect(empateDe("f1", 10)).toBe(0.01);
  });
  it("todo el intervalo por encima de la prueba más el empate → reentrenar", () => {
    expect(veredictoDe(hoy(14, 12, 16), MAE)).toBe("reentrenar");
  });
  it("la cifra de hoy mejor (menor) → sigue", () => {
    expect(veredictoDe(hoy(8, 7, 9), MAE)).toBe("sigue");
    expect(veredictoDe(hoy(10.1, 9, 11.5), MAE)).toBe("sigue");
  });
  it("la cifra peor pero el intervalo baja hasta la prueba → revisar", () => {
    expect(veredictoDe(hoy(11, 9.5, 12.5), MAE)).toBe("revisar");
  });
});

describe("con pocas filas nada se decide", () => {
  it("menos de 50 filas con resultado: siempre «revisar», aunque la cifra sea mucho mejor o mucho peor", () => {
    expect(veredictoDe(hoy(0.99, 0.95, 1, 49), F1)).toBe("revisar");
    expect(veredictoDe(hoy(0.1, 0.05, 0.2, 49), F1)).toBe("revisar");
    expect(veredictoDe(hoy(0.99, 0.95, 1, 50), F1)).toBe("sigue");
  });
});

describe("una cifra que no se puede calcular no es una cifra peor (AUDITORÍA A-01)", () => {
  const filas = (y: number[], pred: number[]) => ({
    task: "binaria" as const,
    y,
    pred,
  });
  const sinPositivos = Array.from({ length: 80 }, () => 0);
  const sinNegativos = Array.from({ length: 80 }, () => 1);
  const mezcla = Array.from({ length: 80 }, (_, i) => i % 2);

  it("la AUC necesita las dos clases; el recall y el F1, algún positivo real; la precisión, alguna predicción positiva", () => {
    expect(metricaIndefinida(filas(sinPositivos, sinPositivos), "auc")).toBe(true);
    expect(metricaIndefinida(filas(sinNegativos, sinNegativos), "auc")).toBe(true);
    expect(metricaIndefinida(filas(mezcla, mezcla), "auc")).toBe(false);
    expect(metricaIndefinida(filas(sinPositivos, mezcla), "recall")).toBe(true);
    expect(metricaIndefinida(filas(sinPositivos, mezcla), "f1")).toBe(true);
    expect(metricaIndefinida(filas(mezcla, sinPositivos), "f1")).toBe(false);
    expect(metricaIndefinida(filas(mezcla, sinPositivos), "precision")).toBe(true);
    expect(metricaIndefinida(filas(mezcla, mezcla), "precision")).toBe(false);
  });

  it("la exactitud y las tareas de varias clases o de un número siempre están definidas", () => {
    expect(metricaIndefinida(filas(sinPositivos, sinPositivos), "accuracy")).toBe(false);
    expect(
      metricaIndefinida({ task: "multiclase", y: sinPositivos, pred: sinPositivos }, "balanced_accuracy"),
    ).toBe(false);
    expect(metricaIndefinida({ task: "numerica", y: sinPositivos, pred: sinPositivos }, "mae")).toBe(false);
  });

  it("80 filas donde nadie convirtió, con una AUC de 0,85 en la prueba: «revisar», no «reentrenar»", () => {
    const datos: EvaluateNewResult = {
      task: "binaria",
      n_rows: 80,
      n_used: 80,
      dropped: { empty: 0, unknown: 0 },
      y: sinPositivos,
      pred: sinPositivos,
      score: sinPositivos.map(() => 0.1),
      elapsed_ms: 1,
    };
    const lectura = vigilar(datos, { metric: "auc", valor: 0.85, nPrueba: 100 }, { semilla: 42 });
    expect(lectura.indefinida).toBe(true);
    expect(lectura.veredicto).toBe("revisar");
    // el mismo intervalo, sin la marca, SÍ diría «reentrenar»: la marca es lo que lo detiene
    expect(veredictoDe(lectura.hoy, { metric: "auc", valor: 0.85, nPrueba: 100 })).toBe("reentrenar");
  });
});

describe("la lectura completa sobre lo que entregó el emisor real", () => {
  const raw = JSON.parse(
    readFileSync(resolve(__dirname, "../fixtures/contrato/evaluate-result-binaria.json"), "utf8"),
  ) as EvaluateNewResult;

  it("la cifra de hoy lleva su margen y es la misma dos veces", () => {
    const a = vigilar(raw, F1, { semilla: 42 });
    const b = vigilar(raw, F1, { semilla: 42 });
    expect(b).toEqual(a);
    expect(a.hoy.n).toBe(raw.n_used);
    expect(a.hoy.bajo).toBeLessThanOrEqual(a.hoy.valor);
    expect(a.hoy.valor).toBeLessThanOrEqual(a.hoy.alto);
    expect(a.diferencia).toBeCloseTo(a.hoy.valor - F1.valor, 12);
    expect(a.empate).toBe(0.01);
    expect(a.pocas).toBe(false);
  });

  it("otra semilla da otro margen pero la misma cifra", () => {
    const a = vigilar(raw, F1, { semilla: 42 });
    const b = vigilar(raw, F1, { semilla: 7 });
    expect(b.hoy.valor).toBe(a.hoy.valor);
    expect(b.hoy.bajo).not.toBe(a.hoy.bajo);
  });

  it("la AUC pide el puntaje por fila: sin él no se inventa", () => {
    expect(() =>
      vigilar({ ...raw, score: null }, { metric: "auc", valor: 0.8, nPrueba: 50 }, { semilla: 42 }),
    ).toThrow();
  });
});
