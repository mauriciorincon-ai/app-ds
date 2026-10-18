// Protocolo DS (S12), etapa 7: el ganador contra la línea base, pliegue a pliegue. Lo que tiene que valer: la
// línea base se elige con el ENTRENAMIENTO del pliegue y se mide en su validación; la regla de hoy compite;
// el ganador se mide con sus predicciones fuera de pliegue (con probabilidad, desde el umbral de tus costos);
// el último valor de una unidad solo mira la historia anterior; y el veredicto sale de un intervalo con la t
// exacta de pocos grados.
import { describe, expect, it } from "vitest";
import {
  comparar,
  costoGanadorPorPliegue,
  lineaBasePorPliegue,
  t975Exacta,
  type Costos,
  type ReglaEvaluada,
} from "@/engine/protocolo/comparacion";
import type { Diseno } from "@/engine/protocolo/particion";

function diseno(p: Partial<Diseno> & { n: number }): Diseno {
  const filas = Array.from({ length: p.n }, (_, i) => i);
  return {
    forma: "binaria",
    filasTabla: p.n,
    filas,
    clases: null,
    valores: null,
    positivo: "si",
    unidades: null,
    unidadRepetida: false,
    fechas: null,
    ...p,
  };
}

const BINARIA: Costos = { task: "binaria", fp: 10, fn: 50, umbral: 10 / 60 };

describe("la línea base de cada pliegue", () => {
  // filas 0–9: entrenamiento con 6 «si»; filas 10–13: validación, todas «no»
  const d = diseno({
    n: 14,
    clases: Array.from({ length: 14 }, (_, i) => (i < 6 ? "si" : "no")),
  });
  const pliegue = {
    entrenamiento: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    validacion: [10, 11, 12, 13],
  };

  it("se elige con el entrenamiento del pliegue y se mide en su validación", () => {
    // en el entrenamiento, siempre actuar cuesta 10·0.4 = 4 y nunca actuar 50·0.6 = 30
    const [b] = lineaBasePorPliegue(BINARIA, d, [pliegue], null);
    expect(b!.referencia).toBe("siempre-actuar");
    // en la validación (todo «no»), siempre actuar cuesta un falso positivo por decisión
    expect(b!.costo).toBe(10);
  });

  it("la regla de hoy compite, y gana si cuesta menos en el entrenamiento", () => {
    // una regla que acierta todo el entrenamiento y en la validación actúa una de cuatro veces
    const cumple = new Map<number, boolean>();
    for (let i = 0; i < 14; i++) cumple.set(i, i < 6 || i === 10);
    const regla: ReglaEvaluada = { cumple, si: true, no: false };
    const [b] = lineaBasePorPliegue(BINARIA, d, [pliegue], regla);
    expect(b!.referencia).toBe("regla");
    expect(b!.costo).toBe(10 / 4);
  });

  it("varias clases: la más frecuente y la opción más barata salen del entrenamiento", () => {
    const clases = ["a", "a", "a", "b", "c", "c", "b", "b", "b", "b"];
    const dm = diseno({ n: 10, forma: "multiclase", clases, positivo: null });
    const costos: Costos = {
      task: "multiclase",
      costoClase: new Map([
        ["a", 1],
        ["b", 1],
        ["c", 10],
      ]),
      opciones: ["a", "b", "c"],
    };
    // entrenamiento 0–5: «a» es la más frecuente (3) y «c» la más cara de errar (2·10 = 20)
    const [b] = lineaBasePorPliegue(
      costos,
      dm,
      [{ entrenamiento: [0, 1, 2, 3, 4, 5], validacion: [6, 7, 8, 9] }],
      null,
    );
    expect(b!.referencia).toBe("opcion-barata");
    // la validación es toda «b»: decir siempre «c» cuesta 1 por decisión
    expect(b!.costo).toBe(1);
  });

  it("el último valor de una unidad solo mira la historia anterior del entrenamiento", () => {
    const dn = diseno({
      n: 5,
      forma: "numerica",
      positivo: null,
      valores: [10, 20, 99, 30, 7],
      unidades: ["U", "U", "U", "U", "V"],
      unidadRepetida: true,
      fechas: [
        "2025-01-15",
        "2025-02-15",
        "2025-04-15",
        "2025-03-15",
        "2025-03-15",
      ],
    });
    const costos: Costos = { task: "numerica", sub: 1, sobre: 1 };
    // validación: la fila 3 (U, marzo, vale 30) y la 4 (V, sin historia). La fila 2 es de abril: futuro.
    const pliegue7 = { entrenamiento: [0, 1, 2], validacion: [3, 4] };
    const [b] = lineaBasePorPliegue(costos, dn, [pliegue7], null);
    // mediana del entrenamiento: 20. El último valor de U antes de marzo es 20 (febrero), no 99 (abril).
    // Con «último valor», U → 20 (error 10) y V → 20 (error 13); con la mediana, lo mismo: empatan, gana la primera.
    expect(b!.referencia).toBe("mediana");
    expect(b!.costo).toBe((10 + 13) / 2);
  });
});

describe("el ganador en cada pliegue", () => {
  const d = diseno({ n: 4, clases: ["si", "no", "si", "no"] });
  const pliegue = { entrenamiento: [0, 1], validacion: [2, 3] };

  it("con probabilidad, actúa desde el umbral de tus costos (no desde 0.5)", () => {
    // 0.2 ≥ 1/6: actúa y acierta; 0.18 ≥ 1/6: actúa sin hacer falta (un falso positivo)
    const [c] = costoGanadorPorPliegue(
      BINARIA,
      d,
      [pliegue],
      [{ pred: [0, 0], proba: [0.2, 0.18] }],
    );
    expect(c).toBe(10 / 2);
  });

  it("sin probabilidad, decide con la clase que predice", () => {
    const [c] = costoGanadorPorPliegue(
      BINARIA,
      d,
      [pliegue],
      [{ pred: [0, 0], proba: null }],
    );
    // no actúa en la fila positiva: un falso negativo
    expect(c).toBe(50 / 2);
  });
});

describe("el veredicto: un intervalo con la t de k − 1 grados", () => {
  it("la t exacta con pocos grados, y la aproximación desde 11", () => {
    expect(t975Exacta(1)).toBe(12.7062);
    expect(t975Exacta(4)).toBe(2.7764);
    expect(t975Exacta(11)).toBeCloseTo(2.201, 2);
  });

  it("«supera» solo si el intervalo entero queda por encima de cero", () => {
    const ancho = comparar([10, 12, 11], [8, 9, 10]);
    expect(ancho.media).toBeCloseTo(2);
    expect(ancho.ee).toBeCloseTo(1 / Math.sqrt(3));
    expect(ancho.icBajo).toBeLessThan(0);
    expect(ancho.veredicto).toBe("no-supera");
    const angosto = comparar([10, 10.1, 9.9], [8, 8, 8]);
    expect(angosto.icBajo).toBeGreaterThan(0);
    expect(angosto.veredicto).toBe("supera");
  });

  it("si el ganador cuesta más, no supera aunque el intervalo sea angosto", () => {
    expect(comparar([5, 5, 5], [6, 6, 6]).veredicto).toBe("no-supera");
  });
});

// --- lo que la etapa 7 lee de las etapas 1 y 5 -------------------------------------------------
import { costosDe, reglaDe } from "@/engine/protocolo/comparacion";
import type { DatosEtapa } from "@/engine/protocolo/etapas";
import { csv } from "./protocolo-etapa4-helpers";

const etapa = (
  respuestas: Record<string, unknown>,
  chequeos: Record<string, unknown> = {},
) => ({ respuestas, chequeos }) as unknown as DatosEtapa;

describe("los costos de la etapa 1", () => {
  it("dos clases: los dos costos y el umbral (el de la etapa, o el que sale de los costos)", () => {
    expect(
      costosDe({
        1: etapa({ forma: "binaria", c_fp: 10, c_fn: 50 }, { umbral: 0.2 }),
      }),
    ).toEqual({
      task: "binaria",
      fp: 10,
      fn: 50,
      umbral: 0.2,
    });
    expect(
      costosDe({ 1: etapa({ forma: "binaria", c_fp: 10, c_fn: 30 }) }),
    ).toMatchObject({ umbral: 0.25 });
  });

  it("varias clases: el costo de cada opción (una sin costo vale 0)", () => {
    const c = costosDe({
      1: etapa({ forma: "multiclase", opciones: ["a", "b"], costos: { a: 2 } }),
    });
    expect(c).toMatchObject({ task: "multiclase", opciones: ["a", "b"] });
    expect(c && "costoClase" in c ? [...c.costoClase] : null).toEqual([
      ["a", 2],
      ["b", 0],
    ]);
  });

  it("un número: quedarse corto y pasarse; sin costos o sin etapa 1, nada", () => {
    expect(
      costosDe({ 1: etapa({ forma: "numerica", c_sub: 3, c_sobre: 1 }) }),
    ).toEqual({
      task: "numerica",
      sub: 3,
      sobre: 1,
    });
    expect(costosDe({ 1: etapa({ forma: "binaria", c_fp: 10 }) })).toBeNull();
    expect(costosDe({ 1: etapa({ forma: "multiclase" }) })).toBeNull();
    expect(costosDe({ 1: etapa({ forma: "numerica" }) })).toBeNull();
    expect(costosDe({})).toBeNull();
  });
});

describe("la regla de hoy de la etapa 5, evaluada en las filas", () => {
  const tabla = csv("x,y", "1,si", "5,no", "2,si", "8,no");
  const regla = (extra: Record<string, unknown>) => ({
    5: etapa({
      regla: "hay",
      regla_columnas: ["x"],
      regla_operadores: ["<="],
      regla_valores: ["3"],
      regla_union: "",
      ...extra,
    }),
  });

  it("dos clases: si se cumple se actúa", () => {
    const r = reglaDe(
      tabla,
      regla({ regla_si: "actuar", regla_no: "no-actuar" }),
      BINARIA,
      [0, 1, 2, 3],
    )!;
    expect([...r.cumple]).toEqual([
      [0, true],
      [1, false],
      [2, true],
      [3, false],
    ]);
    expect([r.si, r.no]).toEqual([true, false]);
  });

  it("varias clases y un número: las salidas que escribiste, o nada si no son válidas", () => {
    const multi: Costos = {
      task: "multiclase",
      costoClase: new Map([
        ["a", 1],
        ["b", 1],
      ]),
      opciones: ["a", "b"],
    };
    expect(
      reglaDe(tabla, regla({ regla_si: "a", regla_no: "b" }), multi, [0, 1]),
    ).toMatchObject({ si: "a", no: "b" });
    expect(
      reglaDe(tabla, regla({ regla_si: "z", regla_no: "b" }), multi, [0, 1]),
    ).toBeNull();
    const num: Costos = { task: "numerica", sub: 1, sobre: 1 };
    expect(
      reglaDe(tabla, regla({ regla_si: "10", regla_no: "20" }), num, [0, 1]),
    ).toMatchObject({ si: 10, no: 20 });
    expect(
      reglaDe(tabla, regla({ regla_si: "diez", regla_no: "20" }), num, [0, 1]),
    ).toBeNull();
  });

  it("sin regla, con la columna que no existe, o sin etapa 5: nada", () => {
    expect(
      reglaDe(tabla, { 5: etapa({ regla: "ninguna" }) }, BINARIA, [0]),
    ).toBeNull();
    expect(
      reglaDe(tabla, regla({ regla_columnas: ["w"] }), BINARIA, [0]),
    ).toBeNull();
    expect(reglaDe(tabla, {}, BINARIA, [0])).toBeNull();
  });
});
