// S17 (regla 19, el lado que LEE): el resultado de la prueba de estrés pasa por validateStressResult antes de
// usarse. Los fixtures los escribió pipeline.py en Pyodide (tests/integration/estres.test.ts); aquí cada carnada
// rompe UNA cosa y el lector la nombra. En la etapa 8 el eco del sello, la huella y el ganador es lo que confirma
// que el worker estresó LA prueba abierta y no otra; en Probeta ningún eco ni rival viaja.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  validateStressResult,
  type StressSent,
} from "@/workers/contrato-estres";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixtures JSON que las carnadas mutan a propósito
type Json = Record<string, any>;
const fixture = (name: string): Json =>
  JSON.parse(
    readFileSync(
      resolve(__dirname, `../fixtures/contrato/${name}.json`),
      "utf8",
    ),
  ) as Json;

/** Lo enviado, leído del propio resultado: el barajado lista TODAS las columnas del modelo con su tipo. */
function enviadoDe(r: Json, etapa8 = false): StressSent {
  const columnas = r.shuffle as { column: string; kind: string }[];
  return {
    task: r.task,
    primary_metric: r.metric.name,
    n_test: r.n_test,
    numeric: columnas.filter((c) => c.kind === "numeric").map((c) => c.column),
    categorical: columnas
      .filter((c) => c.kind === "categorical")
      .map((c) => c.column),
    ...(etapa8
      ? { echo: { winner: r.winner, huella: r.huella, sello: r.sello } }
      : {}),
  };
}

describe("el lector de la prueba de estrés", () => {
  it("acepta lo que pipeline.py escribió en Probeta (dos clases y un número) y en la etapa 8", () => {
    for (const nombre of ["estres-result", "estres-result-numerica"]) {
      const r = fixture(nombre);
      expect(validateStressResult(r, enviadoDe(r)).ok, nombre).toBe(true);
    }
    const e8 = fixture("estres-test-result");
    expect(validateStressResult(e8, enviadoDe(e8, true)).ok).toBe(true);
  });

  it("el resultado no trae más que nombres de columnas y números", () => {
    const r = fixture("estres-result");
    expect(Object.keys(r).sort()).toEqual(
      [
        "task",
        "metric",
        "base",
        "n_test",
        "seed",
        "noise",
        "shuffle",
        "shift",
        "elapsed_ms",
      ].sort(),
    );
    const e8 = fixture("estres-test-result");
    expect(Object.keys(e8).sort()).toEqual(
      [
        ...Object.keys(r),
        "baseline",
        "winner",
        "huella",
        "sello",
      ].sort(),
    );
  });

  const carnadas: [string, (r: Json) => void, string][] = [
    ["otra tarea", (r) => (r.task = "multiclase"), "task"],
    ["otra métrica", (r) => (r.metric.name = "auc"), "metric.name"],
    [
      "la dirección contraria a la de la métrica",
      (r) => (r.metric.direction = "lower"),
      "metric.direction",
    ],
    ["otro tamaño de prueba", (r) => (r.n_test += 1), "n_test"],
    ["una base fuera de [0, 1]", (r) => (r.base = 1.5), "base"],
    ["un número que no es finito", (r) => (r.base = null), "base"],
    ["un nivel de ruido de menos", (r) => r.noise.pop(), "noise"],
    ["un nivel de ruido que no es de la receta", (r) => (r.noise[1].level = 0.3), "noise"],
    ["los niveles en otro orden", (r) => r.noise.reverse(), "noise"],
    ["un valor de ruido fuera de [0, 1]", (r) => (r.noise[0].value = -0.1), "noise[0].value"],
    ["una columna de menos al barajar", (r) => r.shuffle.pop(), "shuffle"],
    [
      "una columna repetida al barajar",
      (r) => (r.shuffle[1].column = r.shuffle[0].column),
      "shuffle",
    ],
    [
      "una columna con el tipo cambiado",
      (r) =>
        (r.shuffle[0].kind =
          r.shuffle[0].kind === "numeric" ? "categorical" : "numeric"),
      "shuffle",
    ],
    ["una columna que el modelo no tiene", (r) => (r.shuffle[0].column = "inventada"), "shuffle"],
    [
      "un corrimiento a una categórica",
      (r) => {
        const cat = r.shuffle.find((e: Json) => e.kind === "categorical");
        for (const s of r.shift) s.columns[0] = cat.column;
      },
      "shift",
    ],
    [
      "un corrimiento con más de tres columnas",
      (r) => {
        for (const s of r.shift) s.columns.push("a", "b", "c");
      },
      "shift",
    ],
    [
      "un corrimiento con otras columnas en un nivel",
      (r) => r.shift[1].columns.reverse(),
      "shift",
    ],
    ["un nivel de corrimiento que no es de la receta", (r) => (r.shift[0].level = 2), "shift"],
    ["un eco que en Probeta no debe venir", (r) => (r.huella = "x"), "echo"],
  ];

  for (const [nombre, romper, campo] of carnadas) {
    it(`Probeta rechaza ${nombre}, nombrando «${campo}»`, () => {
      const r = fixture("estres-result");
      const sent = enviadoDe(r);
      romper(r);
      const verdict = validateStressResult(r, sent);
      expect(verdict.ok).toBe(false);
      expect(verdict.ok ? "" : verdict.field).toBe(campo);
    });
  }

  it("un número no tiene techo en 1: el error medio de una cantidad se acepta; un negativo, no", () => {
    const r = fixture("estres-result-numerica");
    expect(r.base).toBeGreaterThan(1);
    expect(validateStressResult(r, enviadoDe(r)).ok).toBe(true);
    r.noise[0].value = -1;
    const verdict = validateStressResult(r, enviadoDe(r));
    expect(verdict.ok ? "" : verdict.field).toBe("noise[0].value");
  });

  const carnadas8: [string, (r: Json) => void, string][] = [
    ["otro ganador", (r) => (r.winner = "knn"), "winner"],
    ["otra huella", (r) => (r.huella = "0".repeat(64)), "huella"],
    ["otro sello", (r) => (r.sello = "0".repeat(64)), "sello"],
    ["sin el rival sin modelo", (r) => delete r.baseline, "baseline"],
    ["un rival fuera de [0, 1]", (r) => (r.baseline.value = 3), "baseline.value"],
  ];
  for (const [nombre, romper, campo] of carnadas8) {
    it(`la etapa 8 rechaza ${nombre}, nombrando «${campo}»`, () => {
      const r = fixture("estres-test-result");
      const sent = enviadoDe(r, true);
      romper(r);
      const verdict = validateStressResult(r, sent);
      expect(verdict.ok).toBe(false);
      expect(verdict.ok ? "" : verdict.field).toBe(campo);
    });
  }
});
