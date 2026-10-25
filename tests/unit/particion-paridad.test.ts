// S17 (ADR 024, AU-S17-02): la partición que porta la receta (`receta.py`: mulberry32 + Fisher-Yates + reparto por clase y por
// cuantiles) tiene que ser BIT A BIT la de la app. Esta prueba fija el lado TypeScript: genera treinta casos con
// `split.ts` y los compara con tests/fixtures/particion/casos.json; el lado Python (tests/python/test_publica.py) corre los
// mismos casos contra las funciones de la receta ya armada. Si alguien toca `split.ts` (el redondeo de n_test, el orden de
// las clases, el PRNG), esta prueba falla hasta regenerar el fixture, y entonces la de Python falla hasta portar el cambio.
//   Regenerar:  REGENERAR_PARTICION=1 pnpm exec vitest run tests/unit/particion-paridad.test.ts
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { quantileSplit, stratifiedSplit } from "@/engine/split";

const RUTA = resolve(__dirname, "../fixtures/particion/casos.json");

type Caso =
  | {
      nombre: string;
      tipo: "estratificada";
      etiquetas: string[];
      fraccion: number;
      semilla: number;
      train: number[];
      test: number[];
    }
  | {
      nombre: string;
      tipo: "cuantiles";
      valores: number[];
      fraccion: number;
      semilla: number;
      bandas: number;
      train: number[];
      test: number[];
    };

/** Entradas deterministas SIN usar mulberry32 (para no probar el PRNG con sí mismo). */
function congruencial(semilla: number): () => number {
  let x = semilla >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

function etiquetasDe(
  n: number,
  pesos: readonly number[],
  nombres: readonly string[],
  semilla: number,
): string[] {
  const azar = congruencial(semilla);
  const total = pesos.reduce((a, b) => a + b, 0);
  return Array.from({ length: n }, () => {
    let r = azar() * total;
    for (let i = 0; i < pesos.length; i++) {
      r -= pesos[i]!;
      if (r < 0) return nombres[i]!;
    }
    return nombres[nombres.length - 1]!;
  });
}

function valoresDe(n: number, semilla: number, entero: boolean): number[] {
  const azar = congruencial(semilla);
  return Array.from({ length: n }, () =>
    entero ? Math.floor(azar() * 8) : Math.round(azar() * 100000) / 100,
  );
}

const ENTRADAS: {
  nombre: string;
  tipo: "estratificada" | "cuantiles";
  etiquetas?: string[];
  valores?: number[];
  fraccion: number;
  semilla: number;
  bandas?: number;
}[] = [
  // estratificadas: tamaños que caen justo en .5 (6·0,25 = 1,5; 2·0,25 = 0,5), clases de 1, 2 y 3, semillas extremas
  ...[
    ["binaria-200-desbalanceada", 200, [9, 1], 1, 42],
    ["binaria-60", 60, [1, 1], 2, 42],
    ["binaria-14-justo-en-medio", 14, [1, 1], 3, 7],
    ["binaria-6", 6, [1, 1], 4, 0],
    ["tres-clases-120", 120, [5, 3, 2], 5, 42],
    ["cinco-clases-500", 500, [1, 1, 1, 1, 1], 6, 123],
    ["clase-diminuta-de-1", 41, [20, 20, 1], 7, 42],
    ["clase-diminuta-de-2", 42, [20, 20, 2], 8, 42],
    ["clase-diminuta-de-3", 43, [20, 20, 3], 9, 42],
    ["doce-clases", 300, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 10, 42],
    ["semilla-maxima", 90, [2, 1], 11, 4294967295],
    ["semilla-2-a-la-31", 90, [2, 1], 12, 2147483648],
    ["semilla-1", 75, [3, 2, 1], 13, 1],
    ["semilla-negativa-envuelta", 75, [3, 2, 1], 14, -5],
  ].map(([nombre, n, pesos, base, semilla]) => ({
    nombre: nombre as string,
    tipo: "estratificada" as const,
    etiquetas: etiquetasDe(
      n as number,
      pesos as number[],
      ["no", "si", "tal vez", "ñandú", "x", "y", "z", "w", "v", "u", "t", "s"],
      base as number,
    ),
    fraccion: 0.25,
    semilla: semilla as number,
  })),
  // otras fracciones: la función es general aunque la receta use 0,25
  ...[0.1, 0.2, 0.3, 0.5, 0.75].map((fraccion, i) => ({
    nombre: `fraccion-${fraccion}`,
    tipo: "estratificada" as const,
    etiquetas: etiquetasDe(101, [3, 2, 1], ["a", "b", "c"], 20 + i),
    fraccion,
    semilla: 42,
  })),
  // bordes: una sola clase, dos filas que son dos clases de una, mil filas con la semilla 0, una fila por banda
  {
    nombre: "una-sola-clase-12",
    tipo: "estratificada" as const,
    etiquetas: Array.from({ length: 12 }, () => "a"),
    fraccion: 0.25,
    semilla: 42,
  },
  {
    nombre: "dos-filas-dos-clases",
    tipo: "estratificada" as const,
    etiquetas: ["a", "b"],
    fraccion: 0.25,
    semilla: 42,
  },
  {
    nombre: "binaria-1000-semilla-0",
    tipo: "estratificada" as const,
    etiquetas: etiquetasDe(1000, [7, 3], ["no", "si"], 30),
    fraccion: 0.25,
    semilla: 0,
  },
  {
    nombre: "cuantiles-una-fila-por-banda",
    tipo: "cuantiles" as const,
    valores: [3, 1, 2, 5, 4],
    fraccion: 0.25,
    semilla: 42,
    bandas: 5,
  },
  // por cuantiles: reales, con empates, bandas 5 (la de la app) y 3, tamaños que no dividen entre las bandas
  ...[
    ["cuantiles-continuo-200", 200, false, 5, 42],
    ["cuantiles-con-empates", 120, true, 5, 42],
    ["cuantiles-25", 25, false, 5, 42],
    ["cuantiles-7", 7, false, 5, 3],
    ["cuantiles-bandas-3", 100, false, 3, 42],
    ["cuantiles-empates-semilla-grande", 64, true, 5, 4294967295],
    ["cuantiles-1001", 1001, false, 5, 9],
  ].map(([nombre, n, entero, bandas, semilla], i) => ({
    nombre: nombre as string,
    tipo: "cuantiles" as const,
    valores: valoresDe(n as number, 40 + i, entero as boolean),
    fraccion: 0.25,
    semilla: semilla as number,
    bandas: bandas as number,
  })),
];

function generar(): Caso[] {
  return ENTRADAS.map((e): Caso => {
    if (e.tipo === "estratificada") {
      const s = stratifiedSplit(e.etiquetas!, e.fraccion, e.semilla);
      return {
        nombre: e.nombre,
        tipo: "estratificada",
        etiquetas: e.etiquetas!,
        fraccion: e.fraccion,
        semilla: e.semilla,
        train: s.trainIdx,
        test: s.testIdx,
      };
    }
    const s = quantileSplit(e.valores!, e.fraccion, e.semilla, e.bandas);
    return {
      nombre: e.nombre,
      tipo: "cuantiles",
      valores: e.valores!,
      fraccion: e.fraccion,
      semilla: e.semilla,
      bandas: e.bandas!,
      train: s.trainIdx,
      test: s.testIdx,
    };
  });
}

describe("la partición de la receta es la de la app: el lado TypeScript", () => {
  const casos = generar();
  if (process.env.REGENERAR_PARTICION)
    writeFileSync(RUTA, JSON.stringify({ casos }) + "\n");

  it("son treinta casos o más, de las dos formas de partir", () => {
    expect(casos.length).toBeGreaterThanOrEqual(30);
    expect(casos.filter((c) => c.tipo === "cuantiles").length).toBeGreaterThanOrEqual(6);
    expect(new Set(casos.map((c) => c.nombre)).size).toBe(casos.length);
  });

  it("split.ts da hoy lo que dice el fixture (si falla: cambió la partición; regenera y porta el cambio a receta.py)", () => {
    const guardado = JSON.parse(readFileSync(RUTA, "utf8")) as { casos: Caso[] };
    expect(guardado.casos).toEqual(casos);
  });

  it("cada caso reparte todas las filas, sin solaparse", () => {
    for (const c of casos) {
      const todo = [...c.train, ...c.test].sort((a, b) => a - b);
      const n = c.tipo === "estratificada" ? c.etiquetas.length : c.valores.length;
      expect(todo, c.nombre).toEqual(Array.from({ length: n }, (_, i) => i));
    }
  });
});
