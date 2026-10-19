// Protocolo DS (S13), etapa 8: las piezas puras con números a mano. El intervalo bootstrap por conglomerados
// (misma semilla, mismo intervalo; con filas que no son independientes, más ancho que por filas), la
// calibración por tramos con su Brier y su lectura, y los segmentos con soporte (periodo, categorías con 2 a 8
// valores, cuartiles con cortes del entrenamiento).
import { describe, expect, it } from "vitest";
import {
  REMUESTREOS,
  SEMILLA_8,
  conglomeradosDe,
  intervaloBootstrap,
} from "@/engine/protocolo/bootstrap";
import {
  SOPORTE_TRAMO,
  calibrar,
  lecturaDe,
  tramosPara,
} from "@/engine/protocolo/calibracion";
import type { Diseno } from "@/engine/protocolo/particion";
import {
  NIVELES_MAX,
  SOPORTE_CASOS,
  SOPORTE_FILAS,
  casosDe,
  claseRaraDe,
  conSoporte,
  segmentosDe,
} from "@/engine/protocolo/segmentos";
import { csv } from "./protocolo-etapa4-helpers";

describe("el intervalo bootstrap por conglomerados", () => {
  it("cada clave distinta es un conglomerado, en el orden en que aparece", () => {
    expect(conglomeradosDe(["b", "a", "b", "c", "a"])).toEqual([0, 1, 0, 2, 1]);
    expect(conglomeradosDe([])).toEqual([]);
  });

  it("sin valores el intervalo es cero; con valores iguales, se cierra sobre ellos", () => {
    expect(intervaloBootstrap([], [])).toEqual({ media: 0, bajo: 0, alto: 0 });
    expect(intervaloBootstrap([4, 4, 4], [0, 1, 2])).toEqual({
      media: 4,
      bajo: 4,
      alto: 4,
    });
  });

  // 10 unidades de 5 filas: la mitad de las unidades cuesta 10 en todas sus filas, la otra mitad 0
  const valores = Array.from({ length: 50 }, (_, i) =>
    Math.floor(i / 5) % 2 === 0 ? 10 : 0,
  );
  const unidades = valores.map((_, i) => Math.floor(i / 5));
  const filas = valores.map((_, i) => i);

  it("misma semilla, mismo intervalo; otra semilla, otro", () => {
    // costos que no caen en saltos enteros, para que otra semilla se note
    const costos = Array.from(
      { length: 60 },
      (_, i) => ((i * 7919) % 101) / 10,
    );
    const grupos = costos.map((_, i) => Math.floor(i / 3));
    const a = intervaloBootstrap(costos, grupos);
    expect(intervaloBootstrap(costos, grupos)).toEqual(a);
    expect(intervaloBootstrap(costos, grupos, REMUESTREOS, SEMILLA_8)).toEqual(
      a,
    );
    expect(intervaloBootstrap(costos, grupos, REMUESTREOS, 1)).not.toEqual(a);
    const m = intervaloBootstrap(valores, unidades);
    expect(m.media).toBe(5);
    expect(m.bajo).toBeLessThan(5);
    expect(m.alto).toBeGreaterThan(5);
  });

  it("con filas que no son independientes, remuestrear la unidad da un intervalo más ancho que remuestrear filas", () => {
    const porUnidad = intervaloBootstrap(valores, unidades);
    const porFila = intervaloBootstrap(valores, filas);
    expect(porUnidad.alto - porUnidad.bajo).toBeGreaterThan(
      porFila.alto - porFila.bajo,
    );
  });
});

describe("la calibración por tramos", () => {
  it("5 tramos con menos de 200 filas, 10 desde ahí", () => {
    expect([tramosPara(0), tramosPara(199), tramosPara(200)]).toEqual([
      5, 5, 10,
    ]);
  });

  it("cada probabilidad cae en su tramo (1 cae en el último) y el Brier va junto al de la tasa base", () => {
    const probas = [0, 0.1, 0.5, 0.9, 1];
    const pasa = [0, 0, 1, 1, 1] as const;
    const c = calibrar(probas, [...pasa]);
    expect(c.tramos.map((t) => t.n)).toEqual([2, 0, 1, 0, 2]);
    expect(c.tramos[0]).toEqual({ n: 2, predicho: 0.05, observado: 0 });
    expect(c.tramos[1]).toEqual({ n: 0, predicho: 0, observado: 0 });
    expect(c.tramos[4]).toEqual({ n: 2, predicho: 0.95, observado: 1 });
    expect(c.brier).toBeCloseTo((0.01 + 0.25 + 0.01) / 5, 12);
    expect(c.brierBase).toBeCloseTo(0.6 * 0.4, 12);
  });

  it("sin filas no hay Brier ni tasa", () => {
    const c = calibrar([], []);
    expect([c.brier, c.brierBase]).toEqual([0, 0]);
    expect(c.tramos.every((t) => t.n === 0)).toBe(true);
  });

  it("la lectura toma el tramo con soporte más desajustado; uno sin soporte no se lee", () => {
    const tramos = [
      { n: SOPORTE_TRAMO, predicho: 0.1, observado: 0.2 },
      { n: SOPORTE_TRAMO - 1, predicho: 0.3, observado: 1 },
      { n: 12, predicho: 0.75, observado: 0.45 },
      { n: 0, predicho: 0, observado: 0 },
      { n: 8, predicho: 0.9, observado: 0.85 },
    ];
    expect(lecturaDe(tramos)).toEqual({
      tramo: 3,
      desde: 0.4,
      hasta: 0.6,
      predicho: 0.75,
      observado: 0.45,
      n: 12,
    });
    expect(lecturaDe([{ n: 4, predicho: 0.5, observado: 0 }])).toBeNull();
    expect(lecturaDe([])).toBeNull();
  });
});

describe("los segmentos de la prueba", () => {
  /** Un diseño de dos clases a mano: la clase y la fecha por fila de la tabla. */
  const diseno = (
    clases: (string | null)[],
    fechas: (string | null)[] | null = null,
  ): Diseno => ({
    forma: "binaria",
    filasTabla: clases.length,
    filas: clases.map((_, i) => i),
    clases,
    valores: null,
    positivo: "si",
    unidades: null,
    unidadRepetida: false,
    fechas,
  });

  const tabla = csv(
    "canal,monto,fecha,y",
    "web,1,2025-01-15,si",
    "web,2,2025-01-20,no",
    "tienda,3,2025-02-01,no",
    "tienda,4,2025-02-11,si",
    "web,5,2025-03-03,no",
    "tienda,6,2025-03-09,no",
    "web,2,2025-04-01,si",
    "tienda,5,,no",
    "web,,2025-05-01,no",
    "tienda,100,2025-05-02,no",
  );
  const d = diseno(
    ["si", "no", "no", "si", "no", "no", "si", "no", "no", "no"],
    tabla.rows.map((r) => r[2] || null),
  );
  const entrenamiento = [0, 1, 2, 3, 4, 5];
  const prueba = [6, 7, 8, 9];

  it("el periodo por mes, las categorías y los cuartiles con cortes del entrenamiento, en ese orden", () => {
    const segs = segmentosDe(
      tabla,
      d,
      entrenamiento,
      prueba,
      ["monto"],
      ["canal"],
    );
    expect(segs.map((s) => s.id)).toEqual([
      "p:2025-04",
      "p:2025-05",
      "c:canal=tienda",
      "c:canal=web",
      "q:monto#1",
      "q:monto#3",
      "q:monto#4",
    ]);
    // la fila sin fecha no entra al periodo; la fila sin monto no entra a los cuartiles
    expect(segs.find((s) => s.id === "p:2025-05")!.filas).toEqual([8, 9]);
    expect(segs.find((s) => s.id === "c:canal=web")!.filas).toEqual([6, 8]);
    // los cortes salen del entrenamiento (1 a 6): 2, 3 y 5
    const q1 = segs.find((s) => s.id === "q:monto#1")!;
    expect([q1.desde, q1.hasta, q1.filas]).toEqual([null, 2, [6]]);
    const q4 = segs.find((s) => s.id === "q:monto#4")!;
    // 100 está fuera de lo que vio el entrenamiento: cae en el extremo abierto
    expect([q4.desde, q4.hasta, q4.filas]).toEqual([5, null, [9]]);
  });

  it("con más de 12 meses en la prueba, el periodo va por trimestre", () => {
    const fechas = Array.from({ length: 14 }, (_, i) => {
      const m = (i % 12) + 1;
      return `${2024 + Math.floor(i / 12)}-${String(m).padStart(2, "0")}-01`;
    });
    const t = csv("y", ...fechas.map(() => "no"));
    const dd = diseno(
      fechas.map(() => "no"),
      fechas,
    );
    const filas = fechas.map((_, i) => i);
    const ids = segmentosDe(t, dd, filas, filas, [], []).map((s) => s.id);
    expect(ids).toEqual([
      "p:2024-T1",
      "p:2024-T2",
      "p:2024-T3",
      "p:2024-T4",
      "p:2025-T1",
    ]);
  });

  it("una categoría con un solo valor o con más de 8 en la prueba no se segmenta; una numérica sin cuatro valores en el entrenamiento, tampoco", () => {
    const muchas = csv(
      "c,n,y",
      ...Array.from({ length: NIVELES_MAX + 1 }, (_, i) => `v${i},${i},no`),
    );
    const dd = diseno(Array(NIVELES_MAX + 1).fill("no"));
    const todas = Array.from({ length: NIVELES_MAX + 1 }, (_, i) => i);
    expect(segmentosDe(muchas, dd, todas, todas, [], ["c"])).toEqual([]);
    expect(segmentosDe(muchas, dd, [0, 1, 2], todas, ["n"], [])).toEqual([]);
    expect(segmentosDe(muchas, dd, todas, [0], [], ["c"])).toEqual([]);
    // una columna que no existe o que no es del tipo pedido no da segmentos
    expect(segmentosDe(muchas, dd, todas, todas, ["c"], ["n", "z"])).toEqual(
      [],
    );
    // sin fecha no hay periodo
    expect(segmentosDe(muchas, dd, todas, todas, [], [])).toEqual([]);
  });

  it("todas las filas de la prueba en un solo cuartil: no hay qué comparar", () => {
    const t = csv("n,y", ...[1, 2, 3, 4, 50, 51].map((v) => `${v},no`));
    const dd = diseno(Array(6).fill("no"));
    expect(segmentosDe(t, dd, [0, 1, 2, 3], [4, 5], ["n"], [])).toEqual([]);
  });

  it("la clase rara es la menos frecuente en la prueba; en un empate, la de «hay que actuar»", () => {
    expect(claseRaraDe(d, [6, 7, 8, 9])).toBe("si");
    expect(claseRaraDe(d, [0, 1])).toBe("si");
    const muchosSi = diseno(["si", "si", "si", "no"]);
    expect(claseRaraDe(muchosSi, [0, 1, 2, 3])).toBe("no");
    // solo una clase en la prueba: la rara es la de «hay que actuar»
    expect(claseRaraDe(muchosSi, [0, 1])).toBe("si");
    expect(claseRaraDe({ ...d, clases: null, positivo: null }, [0])).toBeNull();
  });

  it("el soporte: filas y, con dos clases, casos de la clase rara", () => {
    const seg = segmentosDe(
      tabla,
      d,
      entrenamiento,
      prueba,
      [],
      ["canal"],
    ).find((s) => s.id === "c:canal=web")!;
    expect(casosDe(seg, d, "si")).toBe(1);
    expect(casosDe(seg, d, null)).toBeNull();
    expect(conSoporte(SOPORTE_FILAS, SOPORTE_CASOS)).toBe(true);
    expect(conSoporte(SOPORTE_FILAS - 1, SOPORTE_CASOS)).toBe(false);
    expect(conSoporte(SOPORTE_FILAS, SOPORTE_CASOS - 1)).toBe(false);
    // sin clase rara (varias clases o un número) cuentan solo las filas
    expect(conSoporte(SOPORTE_FILAS, null)).toBe(true);
  });
});
