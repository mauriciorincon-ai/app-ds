// @vitest-environment node
/**
 * S19 (ADR 027): el motor del simulador «¿qué pasaría si?». Garantías que estos tests hacen FALLAR si se rompen:
 *  - preparar NO toca la tabla (se congela y se compara), el vacío sigue vacío y una categoría que no existe se rechaza;
 *  - sin cambio, cero filas tocadas; el mismo cambio dos veces da lo mismo; el segmento solo toca a quien lo cumple;
 *  - con más de FILAS_SIMULACION_MAX filas, la muestra es la misma con la misma semilla y otra con otra;
 *  - el dinero de un caso a mano por tarea cuadra con los costos escritos (dos clases con el umbral de los costos, varias clases
 *    con el costo de la clase real, estimar y agrupar sin dinero) y dice por qué no hay dinero cuando no lo hay.
 */
import { describe, expect, it } from "vitest";
import {
  FILAS_SIMULACION_MAX,
  PORCENTAJE_MIN,
  categoriasDe,
  compararSimulacion,
  posicionesDeMuestra,
  prepararSimulacion,
  type Alcance,
  type Cambio,
  type CostosSimulador,
  type EntradaSimulacion,
} from "@/engine/simulador";
import type { CsvTable } from "@/lib/ds/csv";
import type { SimulateResult } from "@/workers/protocol";

const TABLA: CsvTable = {
  headers: ["precio", "region", "edad", "id"],
  rows: [
    ["100", "norte", "30", "a"],
    ["200", "sur", "40", "b"],
    ["", "norte", "50", "c"],
    ["300", "", "60", "d"],
    ["abc", "sur", "70", "e"],
  ],
};
const COLUMNAS = ["precio", "region", "edad"];

const entrada = (
  cambio: Cambio,
  columna = "precio",
  alcance: Alcance = { tipo: "todas" },
  tabla: CsvTable = TABLA,
): EntradaSimulacion => ({
  tabla,
  columnas: COLUMNAS,
  columna,
  tipo: columna === "region" ? "categoria" : "numero",
  cambio,
  alcance,
  semilla: 42,
});

function preparar(e: EntradaSimulacion) {
  const r = prepararSimulacion(e);
  if (!r.ok) throw new Error(`rechazada: ${r.motivo}`);
  return r.simulacion;
}

describe("prepararSimulacion", () => {
  it("sube un 10 %: un vacío sigue vacío, un texto que no es número no se toca, y la tabla queda intacta", () => {
    const congelada = JSON.stringify(TABLA);
    const s = preparar(entrada({ tipo: "porcentaje", porcentaje: 10 }));
    expect(s.valores).toEqual(["110", "220", "", "330", "abc"]);
    expect(s.tocadas).toBe(3);
    expect(s.headers).toEqual(COLUMNAS);
    // solo las columnas del modelo viajan: «id» no sale
    expect(s.filas[0]).toEqual(["100", "norte", "30"]);
    expect(JSON.stringify(TABLA)).toBe(congelada);
  });

  it("sin cambio, cero filas tocadas; el mismo cambio dos veces da lo mismo", () => {
    expect(preparar(entrada({ tipo: "porcentaje", porcentaje: 0 })).tocadas).toBe(0);
    expect(preparar(entrada({ tipo: "fijo", valor: 100 })).tocadas).toBe(2);
    const a = preparar(entrada({ tipo: "porcentaje", porcentaje: 10 }));
    const b = preparar(entrada({ tipo: "porcentaje", porcentaje: 10 }));
    expect(b).toEqual(a);
  });

  it("no deja ruido de coma flotante: 1.1 × 3 es 3.3", () => {
    const t: CsvTable = { headers: ["precio"], rows: [["3"]] };
    const s = prepararSimulacion({
      tabla: t,
      columnas: ["precio"],
      columna: "precio",
      tipo: "numero",
      cambio: { tipo: "porcentaje", porcentaje: 10 },
      alcance: { tipo: "todas" },
      semilla: 1,
    });
    expect(s.ok && s.simulacion.valores).toEqual(["3.3"]);
  });

  it("otra categoría de las que existen; una que no existe se rechaza; el vacío no se llena", () => {
    const s = preparar(entrada({ tipo: "categoria", categoria: "sur" }, "region"));
    expect(s.valores).toEqual(["sur", "sur", "sur", "", "sur"]);
    expect(s.tocadas).toBe(2);
    const r = prepararSimulacion(
      entrada({ tipo: "categoria", categoria: "este" }, "region"),
    );
    expect(r).toEqual({ ok: false, motivo: "categoria" });
  });

  it("el segmento solo toca a quien lo cumple (y un vacío en su columna nunca lo cumple)", () => {
    const s = preparar(
      entrada({ tipo: "fijo", valor: 1 }, "precio", {
        tipo: "segmento",
        condiciones: [{ columna: "region", operador: "=", valor: "norte" }],
        union: "",
      }),
    );
    // norte: filas 0 y 2; la 2 tiene el precio vacío y sigue vacío
    expect(s.valores).toEqual(["1", "200", "", "300", "abc"]);
    expect(s.tocadas).toBe(1);
    const dos = preparar(
      entrada({ tipo: "fijo", valor: 1 }, "precio", {
        tipo: "segmento",
        condiciones: [
          { columna: "region", operador: "=", valor: "sur" },
          { columna: "edad", operador: ">=", valor: "40" },
        ],
        union: "y",
      }),
    );
    expect(dos.valores).toEqual(["100", "1", "", "300", "abc"]);
  });

  it("un segmento mal escrito o de una columna que no existe se rechaza", () => {
    const seg = (c: { columna: string; operador: string; valor: string }[], union = ""): Alcance => ({
      tipo: "segmento",
      condiciones: c,
      union,
    });
    for (const alcance of [
      seg([{ columna: "nada", operador: "=", valor: "x" }]),
      seg([{ columna: "region", operador: ">", valor: "x" }]),
      seg([{ columna: "edad", operador: ">", valor: "1,5" }]),
      seg([], ""),
    ])
      expect(
        prepararSimulacion(entrada({ tipo: "fijo", valor: 1 }, "precio", alcance)),
      ).toEqual({ ok: false, motivo: "segmento" });
  });

  it("rechaza lo que no es un escenario: columna ajena, cambio de otro tipo, números fuera de límites", () => {
    expect(prepararSimulacion(entrada({ tipo: "fijo", valor: 1 }, "id"))).toEqual({
      ok: false,
      motivo: "columna",
    });
    expect(
      prepararSimulacion(entrada({ tipo: "categoria", categoria: "x" }, "precio")),
    ).toEqual({ ok: false, motivo: "cambio" });
    expect(
      prepararSimulacion(entrada({ tipo: "porcentaje", porcentaje: 5 }, "region")),
    ).toEqual({ ok: false, motivo: "cambio" });
    for (const porcentaje of [PORCENTAJE_MIN - 1, Infinity, NaN])
      expect(
        prepararSimulacion(entrada({ tipo: "porcentaje", porcentaje })),
      ).toEqual({ ok: false, motivo: "valor" });
    expect(
      prepararSimulacion(entrada({ tipo: "fijo", valor: Infinity })),
    ).toEqual({ ok: false, motivo: "valor" });
    expect(
      prepararSimulacion(
        entrada({ tipo: "fijo", valor: 1 }, "precio", { tipo: "todas" }, {
          headers: ["precio", "region", "edad"],
          rows: [],
        }),
      ),
    ).toEqual({ ok: false, motivo: "sin-filas" });
  });
});

describe("la muestra", () => {
  it("con más filas que el tope, la misma muestra con la misma semilla; otra, con otra", () => {
    const total = FILAS_SIMULACION_MAX + 1234;
    const a = posicionesDeMuestra(total, FILAS_SIMULACION_MAX, 42);
    expect(a).toHaveLength(FILAS_SIMULACION_MAX);
    expect(new Set(a).size).toBe(FILAS_SIMULACION_MAX);
    expect(a).toEqual([...a].sort((x, y) => x - y));
    expect(posicionesDeMuestra(total, FILAS_SIMULACION_MAX, 42)).toEqual(a);
    expect(posicionesDeMuestra(total, FILAS_SIMULACION_MAX, 7)).not.toEqual(a);
    expect(posicionesDeMuestra(10, FILAS_SIMULACION_MAX, 42)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it("avisa que se muestreó", () => {
    const filas = Array.from({ length: FILAS_SIMULACION_MAX + 10 }, (_, i) => [String(i + 1)]);
    const s = prepararSimulacion({
      tabla: { headers: ["x"], rows: filas },
      columnas: ["x"],
      columna: "x",
      tipo: "numero",
      cambio: { tipo: "fijo", valor: 0 },
      alcance: { tipo: "todas" },
      semilla: 42,
    });
    expect(s.ok && s.simulacion.muestreada).toBe(true);
    expect(s.ok && s.simulacion.usadas).toBe(FILAS_SIMULACION_MAX);
    expect(s.ok && s.simulacion.total).toBe(FILAS_SIMULACION_MAX + 10);
  });
});

describe("categoriasDe", () => {
  it("de la más frecuente a la menos, sin vacíos", () => {
    expect(categoriasDe(TABLA, "region")).toEqual(["norte", "sur"]);
    expect(categoriasDe(TABLA, "nada")).toEqual([]);
  });
});

// --- el dinero, a mano --------------------------------------------------------------------------------------

const base = (
  over: Partial<SimulateResult> & Pick<SimulateResult, "task" | "base" | "changed">,
): SimulateResult => ({
  n: over.base.pred.length,
  column: "x",
  outside: { before: 0, after: 0 },
  elapsed_ms: 1,
  ...over,
});

describe("compararSimulacion — dos clases", () => {
  // costos: c_FP = 10, c_FN = 30 → umbral 10 / 40 = 0.25
  const costos: CostosSimulador = { task: "binaria", fp: 10, fn: 30 };
  const r = base({
    task: "binaria",
    positive_class: "si",
    base: { pred: ["no", "no", "si", "no"], proba: [0.1, 0.3, 0.8, 0.2] },
    changed: { pred: ["no", "si", "si", "si"], proba: [0.1, 0.5, 0.9, 0.4] },
  });

  it("cuenta las decisiones con el umbral de los costos y calcula el costo esperado por cada 100", () => {
    const c = compararSimulacion(r, costos);
    if (c.task !== "binaria") throw new Error("tarea");
    expect(c.umbral).toBe(0.25);
    // antes: p ≥ 0.25 actúa en 0.3 y 0.8 → 2 filas; después: 0.5, 0.9, 0.4 → 3 filas
    expect(c.actuan).toEqual({ antes: 2, despues: 3 });
    // decisión por fila antes [no, sí, sí, no] / después [no, sí, sí, sí] → cambia 1
    expect(c.cambian).toBe(1);
    // antes:   no actúa p=.1 → .1·30=3 ; actúa p=.3 → .7·10=7 ; actúa p=.8 → .2·10=2 ; no actúa p=.2 → .2·30=6 → media 4.5
    // después: no actúa p=.1 → 3 ; actúa .5 → 5 ; actúa .9 → 1 ; actúa .4 → 6 → media 3.75
    expect(c.dinero?.antes).toBeCloseTo(450, 9);
    expect(c.dinero?.despues).toBeCloseTo(375, 9);
    expect(c.dinero?.delta).toBeCloseTo(-75, 9);
    expect(c.sinDinero).toBeNull();
  });

  it("sin costos solo cuenta lo que el modelo dice y explica por qué no hay dinero", () => {
    const c = compararSimulacion(r, null);
    if (c.task !== "binaria") throw new Error("tarea");
    expect(c.umbral).toBeNull();
    expect(c.actuan).toEqual({ antes: 1, despues: 3 });
    expect(c.cambian).toBe(2);
    expect(c.dinero).toBeNull();
    expect(c.sinDinero).toBe("sin-costos");
  });

  it("un modelo que decide sin probabilidades no tiene costo esperado, y lo dice", () => {
    const sin = base({
      task: "binaria",
      positive_class: "si",
      base: { pred: ["no", "si"], proba: null },
      changed: { pred: ["si", "si"], proba: null },
    });
    const c = compararSimulacion(sin, costos);
    expect(c.dinero).toBeNull();
    expect(c.sinDinero).toBe("sin-probabilidades");
    expect(c.cambian).toBe(1);
  });

  it("sin cambio, cero decisiones se mueven y el dinero no cambia", () => {
    const igual = base({
      task: "binaria",
      positive_class: "si",
      base: r.base,
      changed: r.base,
    });
    const c = compararSimulacion(igual, costos);
    expect(c.cambian).toBe(0);
    expect(c.dinero?.delta).toBe(0);
  });

  it("cuenta las filas que quedan fuera de lo que el modelo vio", () => {
    const c = compararSimulacion({ ...r, outside: { before: 1, after: 3 } }, costos);
    expect(c.fuera).toEqual({ antes: 1, despues: 3 });
  });
});

describe("compararSimulacion — varias clases", () => {
  // costo de equivocarse cuando la clase REAL es: a=10, b=20, c=40
  const costos: CostosSimulador = {
    task: "multiclase",
    costoClase: new Map([
      ["a", 10],
      ["b", 20],
      ["c", 40],
    ]),
  };
  const r = base({
    task: "multiclase",
    classes: ["a", "b", "c"],
    base: {
      pred: ["a", "b"],
      proba: [
        [0.6, 0.3, 0.1],
        [0.2, 0.7, 0.1],
      ],
    },
    changed: {
      pred: ["b", "b"],
      proba: [
        [0.2, 0.6, 0.2],
        [0.2, 0.7, 0.1],
      ],
    },
  });

  it("el costo de la fila es la suma de p(k)·costo(k) sobre las clases que NO se eligió", () => {
    const c = compararSimulacion(r, costos);
    if (c.task !== "multiclase") throw new Error("tarea");
    // antes: fila 1 elige a → .3·20 + .1·40 = 10 ; fila 2 elige b → .2·10 + .1·40 = 6 → media 8
    // después: fila 1 elige b → .2·10 + .2·40 = 10 ; fila 2 igual 6 → media 8
    expect(c.dinero?.antes).toBeCloseTo(800, 9);
    expect(c.dinero?.despues).toBeCloseTo(800, 9);
    expect(c.cambian).toBe(1);
    expect(c.porOpcion).toEqual([
      { opcion: "a", antes: 1, despues: 0 },
      { opcion: "b", antes: 1, despues: 2 },
      { opcion: "c", antes: 0, despues: 0 },
    ]);
  });

  it("sin los costos de todas las clases no hay dinero", () => {
    expect(compararSimulacion(r, null).sinDinero).toBe("sin-costos");
  });
});

describe("compararSimulacion — estimar y agrupar", () => {
  it("estimar: el cambio medio es el promedio de (después − antes), en las unidades del objetivo, sin dinero", () => {
    const c = compararSimulacion(
      base({
        task: "numerica",
        base: { pred: [10, 20, 30], proba: null },
        changed: { pred: [12, 20, 36], proba: null },
      }),
      null,
    );
    if (c.task !== "numerica") throw new Error("tarea");
    expect(c.cambioMedio).toBeCloseTo(8 / 3, 12);
    expect(c.promedio).toEqual({ antes: 20, despues: 68 / 3 });
    expect(c.cambian).toBe(2);
    expect(c.dinero).toBeNull();
    expect(c.sinDinero).toBeNull();
  });

  it("agrupar: cuántas filas cambian de grupo, sin dinero", () => {
    const c = compararSimulacion(
      base({
        task: "agrupar",
        base: { pred: [0, 0, 1, -1], proba: null },
        changed: { pred: [0, 1, 1, 0], proba: null },
      }),
      null,
    );
    if (c.task !== "agrupar") throw new Error("tarea");
    expect(c.cambian).toBe(2);
    expect(c.porGrupo).toEqual([
      { grupo: -1, antes: 1, despues: 0 },
      { grupo: 0, antes: 2, despues: 2 },
      { grupo: 1, antes: 1, despues: 2 },
    ]);
  });
});
