// Sprint 016 (cierre de H-2) — regresiones del lote de medios y bajos del motor y de la capa de datos: cada prueba
// lleva el sprint y el id del hallazgo que paga. Lo que tiene que valer:
//  · S8 B2: un costo enorme (1e308) no pasa; el tope es COSTO_MAX y es inclusivo;
//  · S8 M6: declarar menos parámetros que los contados se dice (trampa), sin bloquear;
//  · S15 B4: `cargaDe` devuelve la última carga con esa huella sin `Array.prototype.findLast` (target ES2017);
//  · S15 B2: la pantalla del chequeo de deriva no trae el hook completo solo por la tabla de errores del CSV.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ETAPA_1, chequeos1 } from "@/engine/protocolo/etapa1";
import { ETAPA_3 } from "@/engine/protocolo/etapa3";
import type { Cuaderno } from "@/engine/protocolo/cuaderno";
import type { DatosEtapa } from "@/engine/protocolo/etapas";
import { cargaDe } from "@/engine/protocolo/ficha";
import { PROTOCOLO_DS } from "@/engine/protocolo/protocolo-ds";
import { COSTO_MAX, esIdGuardado, positivo } from "@/engine/protocolo/valores";
import { CSV_ERROR } from "@/lib/protocolo/csv-error";

const BASE_1 = {
  decision: "Llamar o no al cliente",
  decisor: "Jefa de retención",
  cuando: "El día 25",
  hoy: "Se llama a todos",
  unidad: "US$",
};
const datos1 = (extra: Record<string, unknown>): DatosEtapa => {
  const respuestas = { ...BASE_1, ...extra } as DatosEtapa["respuestas"];
  return { respuestas, chequeos: chequeos1(respuestas) ?? {} };
};

describe("S8 B2 · un costo enorme no pasa", () => {
  it("1e308 suma Infinity: ya no se acepta como costo", () => {
    expect(positivo({ c: 1e308 }, "c")).toBeNull();
    const d = datos1({ forma: "binaria", c_fp: 1e308, c_fn: 1e308 });
    expect(d.chequeos).toEqual({});
    expect(ETAPA_1.criterio(d, {})).toEqual({ tipo: "falta", faltan: ["costos"] });
  });

  it("el tope es COSTO_MAX, inclusive: un billón pasa, un billón y uno no", () => {
    expect(positivo({ c: COSTO_MAX }, "c")).toBe(COSTO_MAX);
    expect(positivo({ c: COSTO_MAX + 1 }, "c")).toBeNull();
    const ok = datos1({ forma: "binaria", c_fp: COSTO_MAX, c_fn: 1 });
    expect(ETAPA_1.criterio(ok, {})).toEqual({ tipo: "cumple" });
    const roto = datos1({ forma: "numerica", c_sub: 1, c_sobre: COSTO_MAX * 10 });
    expect(ETAPA_1.criterio(roto, {})).toEqual({ tipo: "falta", faltan: ["costos"] });
  });

  it("con varias opciones, un costo sobre el tope tampoco pasa", () => {
    const opciones = ["a", "b", "c"];
    const bien = datos1({ forma: "multiclase", opciones, costos: { a: 1, b: 2, c: COSTO_MAX } });
    expect(ETAPA_1.criterio(bien, {})).toEqual({ tipo: "cumple" });
    const mal = datos1({ forma: "multiclase", opciones, costos: { a: 1, b: 2, c: 1e300 } });
    expect(mal.chequeos).toEqual({});
    expect(ETAPA_1.criterio(mal, {})).toEqual({ tipo: "falta", faltan: ["costos"] });
  });
});

describe("S8 M6 · menos parámetros que los contados se dice", () => {
  const datos = (parametros: number, contados: number): DatosEtapa =>
    ({
      respuestas: { proposito: "predecir" },
      chequeos: {
        parametros,
        parametros_contados: contados,
        n_requerido: 100,
        n_disponible: 200,
        suficiente: true,
        manda: "riley",
      },
    }) as unknown as DatosEtapa;

  it("declarar 3 con 5 contados avisa con los dos números", () => {
    expect(ETAPA_3.trampas(datos(3, 5), {})).toContainEqual({
      clave: "parametros-menos",
      params: { declarado: 3, contado: 5 },
    });
  });

  it.each([
    ["los mismos", 5, 5],
    ["más", 7, 5],
  ])("declarar %s que los contados no avisa", (_n, declarado, contado) => {
    const claves = ETAPA_3.trampas(datos(declarado, contado), {}).map((t) => t.clave);
    expect(claves).not.toContain("parametros-menos");
  });
});

describe("S15 B4 · cargaDe sin findLast", () => {
  const carga = (sha256: string, nombre: string) => ({
    fecha: "2026-10-20T00:00:00.000Z",
    sha256,
    nombre,
    filas: 10,
    columnas: 3,
  });
  const cuaderno = (cargas: ReturnType<typeof carga>[]) =>
    ({ version: 1, evidencias: [], cargas }) as unknown as Cuaderno;

  it("devuelve la ÚLTIMA carga con esa huella, y null si no hay o no hay huella", () => {
    const c = cuaderno([carga("a", "uno.csv"), carga("b", "otro.csv"), carga("a", "tres.csv")]);
    expect(cargaDe(c, "a")?.nombre).toBe("tres.csv");
    expect(cargaDe(c, "b")?.nombre).toBe("otro.csv");
    expect(cargaDe(c, "z")).toBeNull();
    expect(cargaDe(c, null)).toBeNull();
  });

  it("el código de producción no usa findLast (ES2023; el target es ES2017)", () => {
    expect(readFileSync("src/engine/protocolo/ficha.ts", "utf8")).not.toMatch(/\.findLast\(/);
  });
});

describe("S15 B2 · la tabla de errores del CSV vive en su módulo", () => {
  it("el chequeo de deriva no importa el hook completo", () => {
    const fuente = readFileSync("src/components/protocolo/Etapa10Deriva.tsx", "utf8");
    expect(fuente).not.toMatch(/useProtocolo/);
    expect(fuente).toMatch(/@\/lib\/protocolo\/csv-error/);
    expect(CSV_ERROR.empty).toBe("errors.csv-empty");
  });
});

describe("S13 B1 / S14 · un identificador guardado no es texto libre", () => {
  it.each(["balanced_accuracy", "xgboost", "ridge-2"])("«%s» sí", (id) => {
    expect(esIdGuardado(id)).toBe(true);
  });
  it.each(["<b>x</b>", "Mi métrica", "", " x", "a".repeat(41), 3, null])("%j no", (id) => {
    expect(esIdGuardado(id)).toBe(false);
  });
});

describe("S8 B5 · `preguntas` tiene lector", () => {
  it("cada etapa construida declara sus preguntas como ids únicos y no vacíos (la 7 no pregunta nada: corre la liga)", () => {
    for (const etapa of PROTOCOLO_DS) {
      if (!etapa.construida) continue;
      expect(new Set(etapa.preguntas).size, `etapa ${etapa.id}`).toBe(etapa.preguntas.length);
      for (const p of etapa.preguntas) expect(p.trim(), `etapa ${etapa.id}`).not.toBe("");
      if (etapa.id === 7) expect(etapa.preguntas).toEqual([]);
      else expect(etapa.preguntas.length, `etapa ${etapa.id}`).toBeGreaterThan(0);
    }
  });
});

describe("S13 B4 · las clases se ordenan por punto de código, no con `.sort()` sin comparador", () => {
  it.each(["src/lib/protocolo/prueba8.ts", "src/lib/protocolo/liga7.ts"])("%s", (archivo) => {
    expect(readFileSync(archivo, "utf8")).not.toMatch(/\.sort\(\)/);
  });
});
