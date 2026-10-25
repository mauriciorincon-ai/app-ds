// S19 (regla 19, el lado que LEE): lo que `run_rules` y `run_evaluate` entregan pasa por su lector antes de usarse. Los fixtures los
// escribió pipeline.py en Pyodide (tests/integration/reglas.test.ts); aquí cada carnada rompe UNA cosa y el lector la nombra, jamás con
// un valor.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateRulesResult, type ReglasSent } from "@/workers/contrato-reglas";
import {
  validateEvaluateResult,
  type VigilanciaSent,
} from "@/workers/contrato-vigilancia";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixtures JSON que las carnadas mutan a propósito
type Json = Record<string, any>;
const fixture = (name: string): Json =>
  JSON.parse(readFileSync(resolve(__dirname, `../fixtures/contrato/${name}.json`), "utf8")) as Json;
const copia = (name: string): Json => JSON.parse(JSON.stringify(fixture(name))) as Json;

/** Las columnas y clases que el hilo principal conoce: las que usa el árbol del fixture, o las del esquema de su caso. */
const ESQUEMAS: Record<string, ReglasSent> = {
  "rules-result-binaria": {
    task: "binaria",
    numeric: ["edad", "ingreso_mensual", "visitas_web", "correos_abiertos"],
    categorical: ["region", "dispositivo"],
    classes: ["0", "1"],
  },
  "rules-result-multiclase": {
    task: "multiclase",
    numeric: [],
    categorical: [],
    classes: [],
  },
  "rules-result-numerica": { task: "numerica", numeric: [], categorical: [], classes: null },
  "rules-result-agrupar": { task: "agrupar", numeric: [], categorical: [], classes: null },
};

/** El esquema de cada fixture se lee de sí mismo: las medianas dicen las numéricas; las categóricas, las columnas categóricas del árbol. */
function enviadoDe(nombre: string): ReglasSent {
  const r = fixture(nombre);
  const base = ESQUEMAS[nombre]!;
  const numeric: string[] = r.numeric.map((c: Json) => c.column);
  const categorical = new Set<string>(base.categorical);
  const clases = new Set<string>(base.classes ?? []);
  const recorrer = (n: Json) => {
    if (n.leaf) {
      if (base.task === "binaria" || base.task === "multiclase") clases.add(String(n.pred));
      return;
    }
    if (n.kind === "categorical") categorical.add(n.column);
    recorrer(n.left);
    recorrer(n.right);
  };
  recorrer(r.tree);
  return {
    task: base.task,
    numeric,
    categorical: [...categorical],
    classes: base.task === "binaria" || base.task === "multiclase" ? [...clases] : null,
  };
}

const NOMBRES = Object.keys(ESQUEMAS);

describe("el lector del modelo en reglas", () => {
  it.each(NOMBRES)("acepta lo que pipeline.py escribió: %s", (nombre) => {
    expect(validateRulesResult(fixture(nombre), enviadoDe(nombre)).ok).toBe(true);
  });

  const rompe = (
    nombre: string,
    cambio: (r: Json) => void,
    campo: string,
    sent?: Partial<ReglasSent>,
  ) => {
    const r = copia(nombre);
    cambio(r);
    const v = validateRulesResult(r, { ...enviadoDe(nombre), ...sent });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.field.split(/[.[]/)[0]).toBe(campo);
  };

  it("otra tarea, otras medianas o un campo que falta se rechazan nombrando el campo", () => {
    rompe("rules-result-binaria", (r) => (r.task = "numerica"), "task");
    rompe("rules-result-binaria", (r) => r.numeric.pop(), "numeric");
    rompe("rules-result-binaria", (r) => r.numeric.reverse(), "numeric");
    for (const campo of ["tree", "fidelity", "depth", "leaves", "n_fit", "elapsed_ms"])
      rompe("rules-result-binaria", (r) => delete r[campo], campo);
  });

  it("el árbol solo pregunta por columnas del modelo y cada una con su tipo", () => {
    rompe("rules-result-binaria", (r) => (r.tree.column = "intrusa"), "tree");
    rompe("rules-result-binaria", (r) => (r.tree.kind = "otra"), "tree");
    rompe("rules-result-binaria", (r) => (r.tree.threshold = "alto"), "tree");
    rompe("rules-result-binaria", (r) => (r.tree.left = { leaf: "sí" }), "tree");
    // una categórica que el árbol trata como número
    rompe("rules-result-binaria", (r) => {
      const nodo = (n: Json): Json => (n.leaf ? n : n.kind === "categorical" ? n : nodo(n.left.leaf ? n.right : n.left));
      const c = nodo(r.tree);
      c.kind = "numeric";
      c.threshold = 1;
    }, "tree");
  });

  it("las hojas: una clase del modelo, un número o un grupo entero; las filas suman las del ajuste", () => {
    const primeraHoja = (r: Json): Json => {
      let n = r.tree;
      while (!n.leaf) n = n.left;
      return n;
    };
    rompe("rules-result-binaria", (r) => (primeraHoja(r).pred = "clase-intrusa"), "tree");
    rompe("rules-result-binaria", (r) => (primeraHoja(r).n = -1), "tree");
    rompe("rules-result-binaria", (r) => (primeraHoja(r).n += 1), "n_fit");
    rompe("rules-result-numerica", (r) => (primeraHoja(r).pred = "texto"), "tree");
    rompe("rules-result-agrupar", (r) => (primeraHoja(r).pred = 0.5), "tree");
    rompe("rules-result-agrupar", (r) => (primeraHoja(r).pred = -2), "tree");
  });

  it("la profundidad y las hojas son las del árbol y no pasan del tope", () => {
    rompe("rules-result-binaria", (r) => (r.leaves += 1), "leaves");
    rompe("rules-result-binaria", (r) => (r.depth += 1), "depth");
    rompe("rules-result-binaria", (r) => (r.depth = 5), "depth");
  });

  it("la fidelidad es acuerdo (o R² al estimar) y la verdad, de la tarea; agrupar no tiene verdad", () => {
    rompe("rules-result-binaria", (r) => (r.fidelity.metric = "r2"), "fidelity");
    rompe("rules-result-numerica", (r) => (r.fidelity.metric = "agreement"), "fidelity");
    rompe("rules-result-binaria", (r) => (r.fidelity.value = 1.2), "fidelity");
    rompe("rules-result-binaria", (r) => (r.truth = null), "truth");
    rompe("rules-result-binaria", (r) => (r.truth.metric = "mae"), "truth");
    rompe("rules-result-binaria", (r) => (r.truth.rules = 1.5), "truth");
    rompe("rules-result-numerica", (r) => (r.truth.metric = "accuracy"), "truth");
    rompe("rules-result-agrupar", (r) => (r.truth = { metric: "accuracy", rules: 1, model: 1, n: 5 }), "truth");
  });
});

// --- vigilar el desempeño -----------------------------------------------------------------------

const enviadoEval = (nombre: string): VigilanciaSent => {
  const r = fixture(nombre);
  return {
    task: r.task,
    rows: r.n_rows,
    n_classes: r.task === "multiclase" ? Math.max(...r.y, ...r.pred) + 1 : null,
  };
};
const EVAL = ["evaluate-result-binaria", "evaluate-result-multiclase", "evaluate-result-numerica"];

describe("el lector de la vigilancia", () => {
  it.each(EVAL)("acepta lo que pipeline.py escribió: %s", (nombre) => {
    expect(validateEvaluateResult(fixture(nombre), enviadoEval(nombre)).ok).toBe(true);
  });

  const rompe = (nombre: string, cambio: (r: Json) => void, campo: string, sent?: Partial<VigilanciaSent>) => {
    const r = copia(nombre);
    cambio(r);
    const v = validateEvaluateResult(r, { ...enviadoEval(nombre), ...sent });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.field.split(/[.[]/)[0]).toBe(campo);
  };

  it("otra tarea, otro número de filas enviadas o cuentas que no suman se rechazan nombrando el campo", () => {
    rompe("evaluate-result-binaria", (r) => (r.task = "numerica"), "task");
    rompe("evaluate-result-binaria", (r) => (r.n_rows += 1), "n_rows");
    rompe("evaluate-result-binaria", () => undefined, "n_rows", { rows: 3 });
    rompe("evaluate-result-binaria", (r) => (r.dropped.empty = r.dropped.empty + 1), "n_used");
    rompe("evaluate-result-binaria", (r) => (r.dropped.unknown = -1), "dropped");
  });

  it("lo real y lo predicho: una por fila usada, 0 o 1 en dos clases, 0..K−1 en varias, números en estimar", () => {
    rompe("evaluate-result-binaria", (r) => r.y.pop(), "y");
    rompe("evaluate-result-binaria", (r) => r.pred.pop(), "pred");
    rompe("evaluate-result-binaria", (r) => (r.y[0] = 2), "y");
    rompe("evaluate-result-binaria", (r) => (r.pred[0] = 0.5), "pred");
    rompe("evaluate-result-multiclase", (r) => (r.y[0] = 99), "y");
    rompe("evaluate-result-multiclase", (r) => (r.score = r.y), "score");
    rompe("evaluate-result-numerica", (r) => (r.score = r.y), "score");
  });

  it("dos clases trae el puntaje por fila", () => {
    rompe("evaluate-result-binaria", (r) => (r.score = null), "score");
    rompe("evaluate-result-binaria", (r) => r.score.pop(), "score");
  });

  it("la forma: un campo que falta se nombra", () => {
    for (const campo of ["y", "pred", "n_used", "dropped", "elapsed_ms"])
      rompe("evaluate-result-numerica", (r) => delete r[campo], campo);
  });
});
