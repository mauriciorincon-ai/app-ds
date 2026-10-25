// @vitest-environment node
/**
 * S19 (ADR 027): la frase del resumen del simulador, VERIFICADA contra la comparación. Garantías que estos tests hacen FALLAR:
 *  - la frase estándar de cada tarea (dos clases con y sin costos, con y sin probabilidades; varias clases; estimar; agrupar) pasa
 *    la comprobación de cifras en los dos idiomas;
 *  - una frase alterada (una cifra cambiada, una cifra ajena, una cifra que falta, la cifra del dinero con otra cantidad) NO
 *    pasa: se muestra el texto mínimo, que solo dice cuántas decisiones cambian;
 *  - con una unidad de costos que trae un número («m3»), el nombre no cuenta como cifra.
 */
import { describe, expect, it } from "vitest";
import {
  compararSimulacion,
  type Comparacion,
  type CostosSimulador,
} from "@/engine/simulador";
import {
  esperadoDe,
  fraseDe,
  resumenVerificado,
  textoMinimo,
} from "@/lib/narration/simulador";
import type { SimulateResult } from "@/workers/protocol";

const base = (
  over: Partial<SimulateResult> & Pick<SimulateResult, "task" | "base" | "changed">,
): SimulateResult => ({
  n: over.base.pred.length,
  column: "x",
  outside: { before: 0, after: 0 },
  elapsed_ms: 1,
  ...over,
});

const COSTOS: CostosSimulador = { task: "binaria", fp: 10, fn: 30 };
const BINARIA = base({
  task: "binaria",
  positive_class: "si",
  base: { pred: ["no", "no", "si", "no"], proba: [0.1, 0.3, 0.8, 0.2] },
  changed: { pred: ["no", "si", "si", "si"], proba: [0.1, 0.5, 0.9, 0.4] },
});

const CASOS: [string, Comparacion, string | null][] = [
  ["dos clases con costos", compararSimulacion(BINARIA, COSTOS), "USD"],
  ["dos clases con costos y sin unidad", compararSimulacion(BINARIA, COSTOS), null],
  ["dos clases sin costos", compararSimulacion(BINARIA, null), null],
  [
    "dos clases sin probabilidades",
    compararSimulacion(
      base({
        task: "binaria",
        positive_class: "si",
        base: { pred: ["no", "si"], proba: null },
        changed: { pred: ["si", "si"], proba: null },
      }),
      COSTOS,
    ),
    null,
  ],
  [
    "varias clases con costos",
    compararSimulacion(
      base({
        task: "multiclase",
        classes: ["a", "b", "c"],
        base: { pred: ["a", "b"], proba: [[0.6, 0.3, 0.1], [0.2, 0.7, 0.1]] },
        changed: { pred: ["b", "b"], proba: [[0.2, 0.6, 0.2], [0.2, 0.7, 0.1]] },
      }),
      { task: "multiclase", costoClase: new Map([["a", 10], ["b", 20], ["c", 40]]) },
    ),
    "m3",
  ],
  [
    "estimar una cantidad",
    compararSimulacion(
      base({
        task: "numerica",
        base: { pred: [10, 20, 30], proba: null },
        changed: { pred: [12, 20, 36], proba: null },
      }),
      null,
    ),
    "kWh",
  ],
  [
    "estimar una cantidad que baja",
    compararSimulacion(
      base({
        task: "numerica",
        base: { pred: [1000, 2000], proba: null },
        changed: { pred: [900, 1700], proba: null },
      }),
      null,
    ),
    null,
  ],
  [
    "agrupar",
    compararSimulacion(
      base({
        task: "agrupar",
        base: { pred: [0, 0, 1], proba: null },
        changed: { pred: [0, 1, 1], proba: null },
      }),
      null,
    ),
    null,
  ],
];

describe("la frase estándar cuadra con la comparación", () => {
  for (const locale of ["es", "en"] as const)
    it.each(CASOS)(`${locale}: %s`, (_, c, unidad) => {
      const r = resumenVerificado(c, locale, unidad);
      expect(r.fallos).toEqual([]);
      expect(r.verificado).toBe(true);
      expect(r.texto).toBe(fraseDe(c, locale, unidad));
    });

  it("el dinero se escribe con signo y con los decimales de los tres montos", () => {
    const c = compararSimulacion(BINARIA, COSTOS);
    const es = fraseDe(c, "es", "USD");
    // por cada 100 decisiones: 450 antes, 375 después, 75 menos (a mano en simulador.test.ts)
    expect(es).toContain("de 450.0\u00a0USD a 375.0\u00a0USD");
    expect(es).toContain("-75.0\u00a0USD");
    expect(es).toContain("cambia 1 decisión");
  });

  it("sin dinero, la frase dice por qué", () => {
    expect(fraseDe(compararSimulacion(BINARIA, null), "es", null)).toContain("Sin tus costos");
    expect(fraseDe(CASOS[3]![1], "en", null)).toContain("without giving probabilities");
  });
});

describe("una frase que no cuadra cae al texto mínimo", () => {
  const c = compararSimulacion(BINARIA, COSTOS);
  const buena = fraseDe(c, "es", "USD");

  it("una cifra cambiada", () => {
    const r = resumenVerificado(c, "es", "USD", buena.replace("De 4 filas", "De 5 filas"));
    expect(r.verificado).toBe(false);
    expect(r.texto).toBe(textoMinimo(c, "es"));
    expect(r.fallos.map((f) => f.tipo)).toContain("cifra-falta");
  });

  it("una cifra ajena", () => {
    const r = resumenVerificado(c, "es", "USD", `${buena} Ganarías 9 mil.`);
    expect(r.verificado).toBe(false);
    expect(r.fallos.map((f) => f.tipo)).toContain("cifra-ajena");
  });

  it("la cifra del dinero con otra cantidad", () => {
    const r = resumenVerificado(c, "es", "USD", buena.replace("375.0", "275.0"));
    expect(r.verificado).toBe(false);
  });

  it("el texto mínimo dice solo cuántas decisiones cambian, en los dos idiomas", () => {
    expect(textoMinimo(c, "es")).toBe("Cambia 1 de 4 decisiones.");
    expect(textoMinimo(c, "en")).toBe("1 of 4 decisions changes.");
  });

  it("lo que el texto tiene que decir es lo que la comparación calcula", () => {
    const e = esperadoDe(c, "USD");
    expect(e.requeridas.map((r) => r.clave)).toEqual([
      "n", "antes", "despues", "cambian", "umbral", "costo_antes", "costo_despues", "delta",
    ]);
  });
});
