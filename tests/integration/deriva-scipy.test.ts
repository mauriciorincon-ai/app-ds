// @vitest-environment node
//
// Protocolo DS (S9), etapa 4: lo que la deriva calcula en TypeScript se contrasta con `scipy`
// (el que viene en el propio Pyodide de la app), no con otra copia de la fórmula:
//  · el χ² crítico de la guarda de ruido (`chi2.ppf(0.99, 5)`),
//  · el D de Kolmogorov-Smirnov (`ks_2samp(...).statistic`), con empates,
//  · los cortes de los quintiles (`numpy.quantile(..., method="inverted_cdf")`: el rango más
//    cercano, que es el cuantil empírico del motor),
//  · el PSI como divergencia de Jeffreys: Σ rel_entr(p_r, p_h) + Σ rel_entr(p_h, p_r), que es
//    algebraicamente Σ (p_r − p_h) · ln(p_r / p_h) (Potgieter et al. 2023, ec. 1).
import { beforeAll, describe, expect, it } from "vitest";
import type { PyodideInterface } from "pyodide";
import {
  CHI2_99_GL5,
  DERIVA_SUAVIZADO,
  cortesCuantiles,
  ksD,
  psiDeConteos,
} from "@/engine/protocolo/deriva";
import { loadRuntime } from "./runtime";

/** Semilla fija (mulberry32): las muestras salen iguales en cada corrida. */
function azar(semilla: number) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Una muestra redondeada (hay empates) con media y dispersión dadas. */
function muestra(n: number, media: number, escala: number, semilla: number) {
  const r = azar(semilla);
  return Array.from(
    { length: n },
    () => Math.round((media + escala * (r() + r() + r() - 1.5)) * 10) / 10,
  );
}

const ascendente = (x: number, y: number) => x - y;

const PARES: [number[], number[]][] = [
  [muestra(400, 10, 4, 1), muestra(150, 10, 4, 2)], // sin cambio
  [muestra(400, 10, 4, 3), muestra(150, 12, 4, 4)], // se corrió la media
  [muestra(300, 10, 4, 5), muestra(120, 10, 9, 6)], // se abrió la dispersión
  [muestra(60, 0, 1, 7), muestra(25, 3, 1, 8)], // pocas filas, casi separadas
  [
    [1, 1, 1, 2, 2, 3],
    [1, 2, 2, 2, 3, 3, 3],
  ], // empates por todos lados
  [
    [5, 5, 5],
    [5, 5],
  ], // constantes iguales
];

const CONTEOS: [number[], number[]][] = [
  [
    [100, 100, 100, 100, 100],
    [30, 30, 30, 30, 30],
  ],
  [
    [100, 100, 100, 100, 100],
    [60, 40, 30, 15, 5],
  ],
  [
    [200, 0, 0, 50, 10, 3],
    [90, 0, 0, 10, 40, 0],
  ], // casillas vacías en los dos periodos, y una vacía en uno solo
  [
    [10, 90],
    [50, 50],
  ],
];

let resultado: {
  chi2: number;
  ks: number[];
  cortes: number[][];
  psi: number[];
};

beforeAll(async () => {
  const pyodide: PyodideInterface = await loadRuntime({ pipeline: false });
  pyodide.globals.set(
    "entrada_json",
    JSON.stringify({
      pares: PARES,
      conteos: CONTEOS,
      suavizado: DERIVA_SUAVIZADO,
    }),
  );
  resultado = JSON.parse(
    pyodide.runPython(`
import json
import numpy as np
from scipy import special, stats

d = json.loads(entrada_json)

def psi(h, r, suav):
    h = np.array(h, dtype=float)
    r = np.array(r, dtype=float)
    queda = (h + r) > 0
    h, r = h[queda], r[queda]
    b = len(h)
    ph = (h + suav) / (h.sum() + suav * b)
    pr = (r + suav) / (r.sum() + suav * b)
    return float(special.rel_entr(pr, ph).sum() + special.rel_entr(ph, pr).sum())

def cortes(h):
    q = np.quantile(np.sort(np.array(h, dtype=float)), [0.2, 0.4, 0.6, 0.8], method="inverted_cdf")
    return sorted(set(float(x) for x in q))

json.dumps({
    "chi2": float(stats.chi2.ppf(0.99, 5)),
    "ks": [float(stats.ks_2samp(a, b).statistic) for a, b in d["pares"]],
    "cortes": [cortes(a) for a, _ in d["pares"]],
    "psi": [psi(h, r, d["suavizado"]) for h, r in d["conteos"]],
})
`) as string,
  );
}, 180_000);

describe("la deriva contra scipy (el que corre dentro de Pyodide)", () => {
  it("el χ² crítico de la guarda de ruido es chi2.ppf(0.99, 5)", () => {
    expect(CHI2_99_GL5).toBeCloseTo(resultado.chi2, 12);
  });

  it("el D de KS coincide con ks_2samp en cada par, también con empates y constantes", () => {
    PARES.forEach(([a, b], i) => {
      expect(
        ksD([...a].sort(ascendente), [...b].sort(ascendente)),
        `par ${i}`,
      ).toBeCloseTo(resultado.ks[i]!, 12);
    });
  });

  it("los cortes de los quintiles son los del cuantil de rango más cercano", () => {
    PARES.forEach(([a], i) => {
      expect(cortesCuantiles([...a].sort(ascendente)), `par ${i}`).toEqual(
        resultado.cortes[i],
      );
    });
  });

  it("el PSI es la divergencia de Jeffreys de las proporciones suavizadas", () => {
    CONTEOS.forEach(([h, r], i) => {
      expect(psiDeConteos(h, r), `conteos ${i}`).toBeCloseTo(
        resultado.psi[i]!,
        12,
      );
    });
  });
});
