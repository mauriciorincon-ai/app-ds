// S19 (regla 19, el lado que LEE): lo que `run_simulate` y `run_fit_winner` entregan pasa por su lector antes de usarse. Los fixtures
// los escribió pipeline.py en Pyodide (tests/integration/simulador.test.ts); aquí cada carnada rompe UNA cosa y el lector la nombra,
// jamás con un valor.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  validateFitWinnerResult,
  type GanadorSent,
} from "@/workers/contrato-ganador";
import {
  validateSimulateResult,
  type SimuladorSent,
} from "@/workers/contrato-simulador";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixtures JSON que las carnadas mutan a propósito
type Json = Record<string, any>;
const fixture = (name: string): Json =>
  JSON.parse(
    readFileSync(resolve(__dirname, `../fixtures/contrato/${name}.json`), "utf8"),
  ) as Json;
const copia = (name: string): Json => JSON.parse(JSON.stringify(fixture(name))) as Json;

const enviadoDe = (r: Json): SimuladorSent => ({
  task: r.task,
  n: r.n,
  column: r.column,
  classes: r.classes ?? (r.task === "binaria" ? [...new Set<string>([...r.base.pred, ...r.changed.pred])] : null),
  positive: r.positive_class ?? null,
});

const NOMBRES = [
  "simulate-result-binaria",
  "simulate-result-multiclase",
  "simulate-result-numerica",
  "simulate-result-agrupar",
];

describe("el lector del simulador", () => {
  it.each(NOMBRES)("acepta lo que pipeline.py escribió: %s", (nombre) => {
    const r = fixture(nombre);
    expect(validateSimulateResult(r, enviadoDe(r)).ok).toBe(true);
  });

  it("dos y varias clases traen probabilidades (o ninguna en las dos versiones); estimar y agrupar, ninguna", () => {
    expect(Array.isArray(fixture("simulate-result-binaria").base.proba)).toBe(true);
    const m = fixture("simulate-result-multiclase");
    expect(m.base.proba === null || Array.isArray(m.base.proba[0])).toBe(true);
    expect(fixture("simulate-result-numerica").base.proba).toBeNull();
    expect(fixture("simulate-result-agrupar").base.proba).toBeNull();
  });

  const rompe = (
    nombre: string,
    cambio: (r: Json) => void,
    campo: string,
    sent?: Partial<SimuladorSent>,
  ) => {
    const r = copia(nombre);
    cambio(r);
    const v = validateSimulateResult(r, { ...enviadoDe(fixture(nombre)), ...sent });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.field.split(/[.[]/)[0]).toBe(campo);
  };

  it("otra tarea, otra columna o un número de filas que no es el enviado se rechazan nombrando el campo", () => {
    rompe("simulate-result-binaria", (r) => (r.task = "numerica"), "task");
    rompe("simulate-result-binaria", (r) => (r.column = "otra"), "column");
    rompe("simulate-result-binaria", (r) => (r.n = r.n + 1), "n");
    rompe("simulate-result-binaria", () => undefined, "n", { n: 3 });
    rompe("simulate-result-binaria", (r) => delete r.outside, "outside");
    rompe("simulate-result-binaria", (r) => (r.outside.after = r.n + 1), "outside");
    rompe("simulate-result-binaria", (r) => (r.outside.before = -1), "outside");
  });

  it("dos clases: la positiva es la enviada, las etiquetas son las del modelo y las probabilidades van de 0 a 1", () => {
    rompe("simulate-result-binaria", (r) => (r.positive_class = "otra"), "positive_class");
    rompe("simulate-result-binaria", (r) => delete r.positive_class, "positive_class");
    rompe("simulate-result-binaria", (r) => (r.classes = ["a", "b"]), "classes");
    rompe("simulate-result-binaria", (r) => (r.base.pred[0] = "intrusa"), "base");
    rompe("simulate-result-binaria", (r) => r.changed.pred.pop(), "changed");
    rompe("simulate-result-binaria", (r) => (r.base.proba[0] = 1.5), "base");
    rompe("simulate-result-binaria", (r) => r.base.proba.pop(), "base");
    // un modelo da probabilidades o no las da: no una versión sí y la otra no
    rompe("simulate-result-binaria", (r) => (r.changed.proba = null), "proba");
  });

  it("varias clases: las mismas K clases en el mismo orden y K probabilidades por fila", () => {
    rompe("simulate-result-multiclase", (r) => r.classes.reverse(), "classes");
    rompe("simulate-result-multiclase", (r) => delete r.classes, "classes");
    rompe("simulate-result-multiclase", (r) => (r.positive_class = "x"), "positive_class");
    rompe("simulate-result-multiclase", (r) => (r.changed.pred[0] = "intrusa"), "changed");
    const m = fixture("simulate-result-multiclase");
    if (m.base.proba !== null) {
      rompe("simulate-result-multiclase", (r) => r.base.proba[0].pop(), "base");
      rompe("simulate-result-multiclase", (r) => (r.base.proba[0][0] = -0.1), "base");
    }
  });

  it("estimar: números finitos y sin probabilidades ni clases; agrupar: grupos enteros", () => {
    rompe("simulate-result-numerica", (r) => (r.base.pred[0] = "x"), "base");
    rompe("simulate-result-numerica", (r) => (r.base.proba = [0.5]), "base");
    rompe("simulate-result-numerica", (r) => (r.classes = ["a"]), "classes");
    rompe("simulate-result-numerica", (r) => (r.positive_class = "a"), "positive_class");
    rompe("simulate-result-agrupar", (r) => (r.changed.pred[0] = 0.5), "changed");
    rompe("simulate-result-agrupar", (r) => (r.base.proba = r.base.pred), "base");
  });

  it("la forma: un campo que falta o con otro tipo se nombra", () => {
    for (const campo of ["base", "changed", "n", "column", "elapsed_ms"])
      rompe("simulate-result-numerica", (r) => delete r[campo], campo);
    rompe("simulate-result-numerica", (r) => (r.base = []), "base");
    rompe("simulate-result-numerica", (r) => (r.elapsed_ms = "lento"), "elapsed_ms");
  });
});

// --- el ajuste del ganador del Protocolo ---------------------------------------------------------

const ganadorDe = (r: Json): GanadorSent => ({
  task: r.task,
  winner: r.winner,
  n_train: r.n_train,
  huella: r.huella,
  sello: r.sello,
});

describe("el lector del ajuste del ganador", () => {
  it.each(["fit-winner-result", "fit-winner-result-multiclase", "fit-winner-result-numerica"])(
    "acepta lo que pipeline.py escribió: %s",
    (nombre) => {
      const r = fixture(nombre);
      expect(validateFitWinnerResult(r, ganadorDe(r)).ok).toBe(true);
    },
  );

  it("el eco debe ser el de lo enviado: otro ganador, otras filas, otra huella o otro sello se rechazan nombrándolos", () => {
    const base = fixture("fit-winner-result");
    for (const [campo, valor] of [
      ["winner", "otro"],
      ["task", "numerica"],
      ["n_train", base.n_train + 1],
      ["huella", "0".repeat(64)],
      ["sello", "1".repeat(64)],
    ] as const) {
      const r = copia("fit-winner-result");
      r[campo] = valor;
      const v = validateFitWinnerResult(r, ganadorDe(base));
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.field).toBe(campo);
    }
  });

  it("un campo que falta se nombra", () => {
    for (const campo of ["winner", "n_train", "huella", "sello", "elapsed_ms"]) {
      const r = copia("fit-winner-result");
      delete r[campo];
      const v = validateFitWinnerResult(r, ganadorDe(fixture("fit-winner-result")));
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.field).toBe(campo);
    }
  });
});
