// @vitest-environment node
/**
 * S19 (ADR 027): el motor del modelo en reglas. Garantías que estos tests hacen FALLAR si se rompen:
 *  - las hojas salen en orden, cada una con el camino de condiciones que la alcanza («≤» a la izquierda, «>» a la derecha; «no es» a
 *    la izquierda, «es» a la derecha);
 *  - el evaluador manda un vacío numérico a la mediana de entrenamiento y un vacío categórico a «no es»;
 *  - el SQL escapa las comillas dobles de los nombres y las simples de los textos, usa COALESCE como la imputación, no lleva ELSE y
 *    escribe los números con la forma más corta (`1e-7`);
 *  - el umbral de fidelidad es 0,90 de acuerdo (o 0,80 de R² al estimar), con el borde incluido.
 */
import { describe, expect, it } from "vitest";
import {
  FIDELIDAD_MIN_ACUERDO,
  FIDELIDAD_MIN_R2,
  evaluarReglas,
  fidelidadSuficiente,
  hojasDe,
  identificadorSql,
  literalSql,
  numeroSql,
  sqlDe,
} from "@/engine/reglas";
import type { RuleNode, RulesResult } from "@/workers/protocol";

const hoja = (pred: string | number, n = 10): RuleNode => ({ leaf: true, pred, n });
const ARBOL: RuleNode = {
  leaf: false,
  column: "precio",
  kind: "numeric",
  threshold: 100.5,
  left: hoja("no", 40),
  right: {
    leaf: false,
    column: "region",
    kind: "categorical",
    category: "norte",
    left: hoja("no", 20),
    right: hoja("si", 40),
  },
};

const resultado = (over: Partial<RulesResult> = {}): RulesResult => ({
  task: "binaria",
  source: "training",
  tree: ARBOL,
  numeric: [{ column: "precio", median: 80 }],
  fidelity: { metric: "agreement", value: 0.95, n: 50 },
  truth: { metric: "accuracy", rules: 0.8, model: 0.82, n: 50 },
  depth: 2,
  leaves: 3,
  n_fit: 100,
  elapsed_ms: 0,
  ...over,
});

describe("las hojas", () => {
  it("de izquierda a derecha, cada una con su camino", () => {
    const hojas = hojasDe(ARBOL);
    expect(hojas.map((h) => h.pred)).toEqual(["no", "no", "si"]);
    expect(hojas.map((h) => h.n)).toEqual([40, 20, 40]);
    expect(hojas[0]!.condiciones).toEqual([
      { kind: "numeric", column: "precio", op: "<=", valor: 100.5 },
    ]);
    expect(hojas[1]!.condiciones).toEqual([
      { kind: "numeric", column: "precio", op: ">", valor: 100.5 },
      { kind: "categorical", column: "region", op: "no-es", categoria: "norte" },
    ]);
    expect(hojas[2]!.condiciones[1]).toEqual({
      kind: "categorical",
      column: "region",
      op: "es",
      categoria: "norte",
    });
  });

  it("un árbol de una sola hoja es una regla sin condiciones", () => {
    expect(hojasDe(hoja("x"))).toEqual([{ condiciones: [], pred: "x", n: 10 }]);
  });

  it("las columnas que usa, en el orden en que aparecen", () => {
    const vistas = new Set(hojasDe(ARBOL).flatMap((h) => h.condiciones.map((c) => c.column)));
    expect([...vistas]).toEqual(["precio", "region"]);
  });
});

describe("el evaluador", () => {
  const r = resultado();
  it("sigue el camino de la fila", () => {
    expect(evaluarReglas(r, { precio: 100.5, region: "sur" })).toBe("no");
    expect(evaluarReglas(r, { precio: 100.6, region: "sur" })).toBe("no");
    expect(evaluarReglas(r, { precio: 100.6, region: "norte" })).toBe("si");
  });

  it("un vacío numérico toma la mediana; un vacío categórico cuenta como «no es»", () => {
    // la mediana es 80 ≤ 100.5: va a la izquierda
    expect(evaluarReglas(r, { precio: null, region: "norte" })).toBe("no");
    // sin mediana que lo mande a la izquierda: con 200 y vacío en la categoría, «no es» → «no»
    expect(evaluarReglas(r, { precio: 200, region: null })).toBe("no");
    expect(evaluarReglas(resultado({ numeric: [{ column: "precio", median: 500 }] }), { precio: null, region: "norte" })).toBe("si");
  });

  it("un texto en una columna numérica (ilegible) se trata como vacío", () => {
    expect(evaluarReglas(r, { precio: Number.NaN, region: "norte" })).toBe("no");
  });
});

describe("el SQL", () => {
  const etiqueta = (p: string | number) => p;
  it("un CASE WHEN por hoja, COALESCE en las numéricas y «es / no es» sin NULL ambiguo, sin ELSE", () => {
    const sql = sqlDe(resultado(), { tabla: "clientes", alias: "pred", etiqueta });
    expect(sql).toBe(
      [
        "SELECT t.*,",
        "  CASE",
        `    WHEN COALESCE("precio", 80) <= 100.5 THEN 'no'`,
        `    WHEN COALESCE("precio", 80) > 100.5 AND ("region" IS NULL OR "region" <> 'norte') THEN 'no'`,
        `    WHEN COALESCE("precio", 80) > 100.5 AND "region" = 'norte' THEN 'si'`,
        `  END AS "pred"`,
        `FROM "clientes" t;`,
      ].join("\n"),
    );
    expect(sql).not.toContain("ELSE");
  });

  it("escapa las comillas dobles de los nombres y las simples de los textos", () => {
    expect(identificadorSql('ed"ad')).toBe('"ed""ad"');
    expect(literalSql("O'Brien")).toBe("'O''Brien'");
    const r = resultado({
      tree: {
        leaf: false,
        column: "a'b",
        kind: "categorical",
        category: "x'y",
        left: hoja("no"),
        right: hoja("l'a"),
      },
      numeric: [],
    });
    const sql = sqlDe(r, { tabla: 't"x', alias: 'p"', etiqueta });
    expect(sql).toContain(`"a'b" = 'x''y' THEN 'l''a'`);
    expect(sql).toContain(`FROM "t""x" t;`);
    expect(sql).toContain(`END AS "p"""`);
  });

  it("las cantidades se escriben como números, no como texto", () => {
    const r = resultado({
      task: "numerica",
      tree: { leaf: false, column: "precio", kind: "numeric", threshold: 1e-7, left: hoja(12.5), right: hoja(-3) },
    });
    const sql = sqlDe(r, { tabla: "t", alias: "p", etiqueta });
    expect(sql).toContain('COALESCE("precio", 80) <= 1e-7 THEN 12.5');
    expect(sql).toContain('COALESCE("precio", 80) > 1e-7 THEN -3');
    expect(numeroSql(0.1)).toBe("0.1");
  });

  it("un árbol de una hoja es «1 = 1»", () => {
    const sql = sqlDe(resultado({ tree: hoja("solo") }), { tabla: "t", alias: "p", etiqueta });
    expect(sql).toContain("WHEN 1 = 1 THEN 'solo'");
  });

  it("la etiqueta puede reescribir la predicción (los grupos)", () => {
    const sql = sqlDe(resultado({ tree: hoja(-1), task: "agrupar" }), {
      tabla: "t",
      alias: "p",
      etiqueta: (p) => (p === -1 ? "Fuera" : `Grupo ${Number(p) + 1}`),
    });
    expect(sql).toContain("THEN 'Fuera'");
  });
});

describe("el umbral de fidelidad", () => {
  const conAcuerdo = (v: number) => resultado({ fidelity: { metric: "agreement", value: v, n: 50 } });
  const conR2 = (v: number) => resultado({ task: "numerica", fidelity: { metric: "r2", value: v, n: 50 } });
  it("acuerdo: 0,90 llega, un poco menos no", () => {
    expect(FIDELIDAD_MIN_ACUERDO).toBe(0.9);
    expect(fidelidadSuficiente(conAcuerdo(0.9))).toBe(true);
    expect(fidelidadSuficiente(conAcuerdo(0.8999))).toBe(false);
  });
  it("R²: 0,80 llega, un poco menos no; y un R² negativo no", () => {
    expect(FIDELIDAD_MIN_R2).toBe(0.8);
    expect(fidelidadSuficiente(conR2(0.8))).toBe(true);
    expect(fidelidadSuficiente(conR2(0.7999))).toBe(false);
    expect(fidelidadSuficiente(conR2(-2))).toBe(false);
  });
  it("el mismo número no vale igual en las dos métricas: 0,85 de R² no llega y 0,85 de acuerdo tampoco, pero 0,95 de acuerdo sí", () => {
    expect(fidelidadSuficiente(conR2(0.85))).toBe(true);
    expect(fidelidadSuficiente(conAcuerdo(0.85))).toBe(false);
    expect(fidelidadSuficiente(conAcuerdo(0.95))).toBe(true);
  });
});
