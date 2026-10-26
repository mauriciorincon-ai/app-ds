// S20 (ADR 029): lo que decide TypeScript del gemelo. Lo que estas pruebas hacen FALLAR:
//  · qué columnas viajan: lo marcado como dato personal, el texto libre, los identificadores, las fechas, lo constante y lo vacío se
//    quedan fuera con su motivo, y lo demás viaja con su tipo; el envío lleva SOLO las columnas que viajan;
//  · los niveles contra el piso «real contra real» respetan los bordes (1,25 y 2 veces el piso, con pisos fijos);
//  · el veredicto: una copia o una cercanía mala es «no compartir» (privacidad); una fidelidad que no llega es «revisar»; lo demás, compartir;
//  · las relaciones: una tabla contra sí misma no difiere, y una a la que se le rompe una relación sí;
//  · el CSV del gemelo neutraliza fórmulas.
import { describe, expect, it } from "vitest";
import {
  CERCANIA_BAJO_BIEN,
  CERCANIA_BAJO_MAL,
  CERCANIA_RAZON_BIEN,
  CERCANIA_RAZON_MAL,
  COLUMNAS_PISO_MIN,
  RELACIONES_PISO_MIN,
  csvDelGemelo,
  envioGemelo,
  leerRelaciones,
  nivelCercania,
  nivelPorRazon,
  permutacion,
  planGemelo,
  veredictoGemelo,
} from "@/engine/gemelo";
import { relaciones, explorar } from "@/engine/exploracion";
import type { CsvTable } from "@/lib/ds/csv";
import type { SynthesizeResult } from "@/workers/protocol";

const filas = (n: number, f: (i: number) => string[]) => Array.from({ length: n }, (_, i) => f(i));

describe("qué columnas viajan", () => {
  const tabla: CsvTable = {
    headers: ["id", "correo", "nombre", "alta", "plan", "monto", "nota", "siempre", "vacia", "uso", "ingreso"],
    rows: filas(100, (i) => [
      String(1000 + i),
      `persona${i}@ejemplo.com`,
      `Persona ${i}`,
      `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
      ["a", "b", "c"][i % 3]!,
      String(10 + (i % 17)),
      `texto libre largo y distinto para la fila número ${i} con bastante contenido para pasar de los cuarenta caracteres`,
      "igual",
      i === 0 ? "1" : "",
      String((i * 7) % 13),
      String(1500 + ((i * 6151) % 6000)), // un monto entero con casi todos los valores distintos: NO es un identificador
    ]),
  };
  const plan = planGemelo(tabla, ["correo", "nombre"]);

  it("lo personal, el texto libre, los identificadores, las fechas, lo constante y lo vacío se quedan fuera, cada uno con su motivo", () => {
    const motivos = Object.fromEntries(plan.fuera.map((f) => [f.name, f.motivo]));
    expect(motivos).toEqual({
      id: "identificador",
      correo: "personal",
      nombre: "personal",
      alta: "fecha",
      nota: "texto_libre",
      siempre: "constante",
      vacia: "vacia",
    });
  });

  it("lo demás viaja con su tipo, en el orden de la tabla", () => {
    expect(plan.incluidas).toEqual([
      { name: "plan", kind: "categorical" },
      { name: "monto", kind: "numeric" },
      { name: "uso", kind: "numeric" },
      { name: "ingreso", kind: "numeric" },
    ]);
  });

  it("el envío lleva solo esas columnas y sus filas, con la semilla fija", () => {
    const e = envioGemelo(tabla, plan, 100);
    expect(e.headers).toEqual(["plan", "monto", "uso", "ingreso"]);
    expect(e.kinds).toEqual(["categorical", "numeric", "numeric", "numeric"]);
    expect(e.rows[0]).toEqual(["a", "10", "0", "1500"]);
    expect(e.rows).toHaveLength(100);
    expect(JSON.stringify(e)).not.toMatch(/ejemplo\.com|Persona|2026-01|texto libre/);
    expect(e.seed).toBe(42);
  });

  it("un entero que se llama «id» o «código» es un identificador aunque sus valores estén salteados", () => {
    const t: CsvTable = {
      headers: ["cliente_id", "edad"],
      rows: filas(60, (i) => [String(9000 + i * 17), String(20 + (i % 40))]),
    };
    expect(planGemelo(t, []).fuera).toEqual([{ name: "cliente_id", motivo: "identificador" }]);
  });

  it("una categórica con pocas categorías que se repiten NO es texto libre; con casi todas distintas y muchas, sí", () => {
    const t: CsvTable = {
      headers: ["ciudad", "codigo"],
      rows: filas(300, (i) => [["lima", "bogota", "quito"][i % 3]!, `C-${i % 200}`]),
    };
    const p = planGemelo(t, []);
    expect(p.incluidas.map((c) => c.name)).toEqual(["ciudad"]);
    expect(p.fuera).toEqual([{ name: "codigo", motivo: "texto_libre" }]);
  });
});

describe("los niveles contra el piso real contra real", () => {
  it("bien hasta 1,25 veces el piso, revisar hasta 2, mal después; con piso mínimo cuando el piso casi es 0", () => {
    expect(nivelPorRazon(0.125, 0.1, COLUMNAS_PISO_MIN)).toBe("bien");
    expect(nivelPorRazon(0.1251, 0.1, COLUMNAS_PISO_MIN)).toBe("revisar");
    expect(nivelPorRazon(0.2, 0.1, COLUMNAS_PISO_MIN)).toBe("revisar");
    expect(nivelPorRazon(0.2001, 0.1, COLUMNAS_PISO_MIN)).toBe("mal");
    // piso casi 0: manda el piso fijo (0,05 → bien hasta 0,0625)
    expect(nivelPorRazon(0.0625, 0.001, RELACIONES_PISO_MIN)).toBe("bien");
    expect(nivelPorRazon(0.0626, 0.001, RELACIONES_PISO_MIN)).toBe("revisar");
    expect(nivelPorRazon(0.1001, 0.001, RELACIONES_PISO_MIN)).toBe("mal");
  });

  const prox = (median_syn: number, share_below: number, median_real = 1) => ({
    median_syn,
    median_real,
    p5_real: 0.2,
    share_below,
    n_real: 100,
    n_syn: 100,
  });
  it("la cercanía: copiar (menos de la mitad de la distancia) es mal; menos de 0,8 o demasiadas filas muy cerca, revisar", () => {
    expect(nivelCercania(prox(1, 0.05)).nivel).toBe("bien");
    expect(nivelCercania(prox(CERCANIA_RAZON_BIEN, CERCANIA_BAJO_BIEN)).nivel).toBe("bien");
    expect(nivelCercania(prox(0.79, 0.05)).nivel).toBe("revisar");
    expect(nivelCercania(prox(1, CERCANIA_BAJO_BIEN + 0.01)).nivel).toBe("revisar");
    expect(nivelCercania(prox(CERCANIA_RAZON_MAL - 0.01, 0.05)).nivel).toBe("mal");
    expect(nivelCercania(prox(1, CERCANIA_BAJO_MAL + 0.01)).nivel).toBe("mal");
    // con una mediana real de 0 la razón no dice nada
    expect(nivelCercania(prox(0, 0, 0)).razon).toBe(1);
  });
});

describe("el veredicto", () => {
  const columnas = (value: number) => [{ name: "x", kind: "numeric" as const, value, floor: 0.1 }];
  const ok = (over: Partial<Pick<SynthesizeResult, "columns" | "proximity" | "copies">> = {}) => ({
    columns: columnas(0.05),
    proximity: { median_syn: 1, median_real: 1, p5_real: 0.2, share_below: 0.05, n_real: 100, n_syn: 100 },
    copies: 0,
    ...over,
  });
  const relBien = { pares: { pearson: 1, cramer: 0 }, pearson: { delta: 0.01, piso: 0.1 }, cramer: null, nivel: "bien" as const };

  it("todo en «bien» se puede compartir", () => {
    const i = veredictoGemelo(ok(), relBien);
    expect(i.veredicto).toBe("compartir");
    expect(i.razones).toEqual([]);
  });

  it("una sola copia exacta basta para «no compartir»", () => {
    const i = veredictoGemelo(ok({ copies: 1 }), relBien);
    expect(i.veredicto).toBe("no_compartir");
    expect(i.razones).toEqual(["copias"]);
  });

  it("una cercanía mala es «no compartir»; una dudosa, «revisar»", () => {
    expect(veredictoGemelo(ok({ proximity: { ...ok().proximity, median_syn: 0.3 } }), relBien).veredicto).toBe("no_compartir");
    expect(veredictoGemelo(ok({ proximity: { ...ok().proximity, median_syn: 0.7 } }), relBien).veredicto).toBe("revisar");
  });

  it("una fidelidad que no llega es «revisar», nunca «no compartir»: es de privacidad lo que impide compartir", () => {
    const columnasMalas = veredictoGemelo(ok({ columns: columnas(0.9) }), relBien);
    expect(columnasMalas.veredicto).toBe("revisar");
    expect(columnasMalas.razones).toEqual(["columnas"]);
    const relMal = veredictoGemelo(ok(), { ...relBien, nivel: "mal" });
    expect(relMal.veredicto).toBe("revisar");
    expect(relMal.razones).toEqual(["relaciones"]);
  });
});

describe("las relaciones", () => {
  const base: CsvTable = {
    headers: ["x", "y", "z", "g", "h"],
    rows: filas(200, (i) => {
      const x = (i * 37) % 101;
      return [String(x), String(2 * x + ((i * 13) % 7)), String((i * 53) % 97), ["a", "b", "c"][x % 3]!, ["a", "b", "c"][x % 3] === "a" ? "u" : "v"];
    }),
  };

  it("una tabla contra sí misma no difiere en nada", () => {
    const l = leerRelaciones(base, base);
    expect(l.pearson!.delta).toBeCloseTo(0, 12);
    expect(l.cramer!.delta).toBeCloseTo(0, 12);
    expect(l.nivel).toBe("bien");
  });

  it("una copia a la que se le rompe una relación se nota y se dice «mal»", () => {
    const orden = permutacion(200, 5);
    const rota: CsvTable = {
      headers: base.headers,
      // la columna y revuelta: x y y dejan de moverse juntas
      rows: base.rows.map((f, i) => [f[0]!, base.rows[orden[i]!]![1]!, f[2]!, f[3]!, f[4]!]),
    };
    const l = leerRelaciones(base, rota);
    expect(l.pearson!.delta).toBeGreaterThan(0.3);
    expect(l.nivel).toBe("mal");
  });

  it("`relaciones` da las mismas medidas que la exploración (explorar las usa)", () => {
    const r = relaciones(base);
    const e = explorar(base);
    expect(e.matriz).toEqual(r.matriz);
    expect(e.cramer).toEqual(r.cramer.slice(0, 10));
    expect(e.numericas).toEqual(r.numericas);
  });

  it("la partición sembrada es una permutación y es la misma cada vez", () => {
    const p = permutacion(50, 9);
    expect([...p].sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i));
    expect(permutacion(50, 9)).toEqual(p);
    expect(permutacion(50, 10)).not.toEqual(p);
  });
});

describe("el CSV del gemelo", () => {
  it("neutraliza las celdas que empiezan como fórmula y deja los números", () => {
    const csv = csvDelGemelo({ headers: ["a", "=cmd"], rows: [["=SUM(A1)", "-12.5"], ["+x", "ok, con coma"]] });
    expect(csv.split("\n")[0]).toBe("a,'=cmd");
    expect(csv).toContain("'=SUM(A1),-12.5");
    expect(csv).toContain("'+x,\"ok, con coma\"");
  });
});
