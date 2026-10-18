// Protocolo DS (S8, etapa 3): el tamaño de muestra reproduce los ejemplos resueltos del
// artículo y los vectores del paquete de los autores. Es el riesgo declarado en el plan
// («fórmula mal implementada»): si alguien toca una ecuación, esto cae nombrando la cifra.
//
// Fuentes (abiertas el 2026-10-17):
//  · Riley et al., Stat Med 2019, parte II (PMC6519266), § 5.1: ejemplo de la enfermedad de Chagas.
//  · Paquete `pmsampsize` 1.1.3 de los autores (CRAN), tests/testthat/test_bin.R y test_cont.R.
import { describe, expect, it } from "vitest";
import {
  contraccionParaOptimismo,
  MuestraInvalida,
  muestraBinaria,
  muestraCantidad,
  muestraMulticlase,
  nPorContraccion,
  nPorRiesgoMedio,
  r2Maximo,
  t975,
} from "@/engine/protocolo/muestra";

describe("dos clases: el ejemplo resuelto de Riley (Chagas, P = 24, prevalencia 0,174, R²_CS = 0,288)", () => {
  it("criterio (i): 622,31 → 623", () => {
    expect(nPorContraccion(24, 0.288, 0.9)).toBeCloseTo(622.31, 2);
    expect(
      muestraBinaria({ parametros: 24, prevalencia: 0.174, r2cs: 0.288 })
        .contraccion,
    ).toBe(623);
  });

  it("criterio (ii): con las cifras que el artículo redondea a mano (S = 0,906) da 667,41", () => {
    expect(contraccionParaOptimismo(0.288, 0.6)).toBeCloseTo(0.9057, 4);
    expect(nPorContraccion(24, 0.288, 0.906)).toBeCloseTo(667.41, 2);
  });

  it("criterio (ii) exacto: 662, lo mismo que el paquete de los autores", () => {
    expect(r2Maximo(0.174)).toBeCloseTo(0.6032, 4);
    expect(
      muestraBinaria({ parametros: 24, prevalencia: 0.174, r2cs: 0.288 })
        .optimismo,
    ).toBe(662);
  });

  it("criterio (iii): 220,85 → 221", () => {
    expect(nPorRiesgoMedio(0.174)).toBeCloseTo(220.85, 1);
    expect(
      muestraBinaria({ parametros: 24, prevalencia: 0.174, r2cs: 0.288 })
        .riesgoMedio,
    ).toBe(221);
  });

  it("el mínimo es 662 por optimismo: 115,2 eventos, EPP 4,80 (paquete: 623 · 662 · 221 → 662)", () => {
    const m = muestraBinaria({
      parametros: 24,
      prevalencia: 0.174,
      r2cs: 0.288,
    });
    expect(m.final).toBe(662);
    expect(m.manda).toBe("optimismo");
    expect(m.eventos).toBeCloseTo(115.2, 1);
    expect(m.epp).toBeCloseTo(4.8, 1);
  });

  it("el artículo da 668 con S redondeada a 0,906: 116,2 eventos y EPP 4,84", () => {
    const n = Math.ceil(nPorContraccion(24, 0.288, 0.906));
    expect(n).toBe(668);
    expect(n * 0.174).toBeCloseTo(116.2, 1);
    expect((n * 0.174) / 24).toBeCloseTo(4.84, 2);
  });

  // Vectores 4.2–4.4 del paquete de los autores (test_bin.R): [contracción, optimismo, riesgo, final].
  it.each([
    [{ parametros: 24, prevalencia: 0.174, r2cs: 0.55 }, [255, 532, 221, 532]],
    [{ parametros: 36, prevalencia: 0.174, r2cs: 0.288 }, [934, 992, 221, 992]],
    [{ parametros: 24, prevalencia: 0.25, r2cs: 0.288 }, [623, 590, 289, 623]],
  ])("vector del paquete %j", (entrada, [i, ii, iii, final]) => {
    const m = muestraBinaria(entrada);
    expect([m.contraccion, m.optimismo, m.riesgoMedio, m.final]).toEqual([
      i,
      ii,
      iii,
      final,
    ]);
  });

  it("sin R² anticipado usa el supuesto de Riley: 0,15 del máximo", () => {
    const m = muestraBinaria({ parametros: 10, prevalencia: 0.3 });
    expect(m.r2cs).toBeCloseTo(0.15 * r2Maximo(0.3), 10);
  });

  it("entradas imposibles se rechazan nombrando el campo", () => {
    expect(() => muestraBinaria({ parametros: 0, prevalencia: 0.2 })).toThrow(
      MuestraInvalida,
    );
    expect(() => muestraBinaria({ parametros: 5, prevalencia: 1 })).toThrow(
      "prevalencia",
    );
    expect(() =>
      muestraBinaria({ parametros: 5, prevalencia: 0.2, r2cs: 0.9 }),
    ).toThrow("r2cs");
  });
});

describe("una cantidad: los vectores del paquete de los autores (test_cont.R)", () => {
  // [contracción, optimismo, varianza, media] y el mínimo, media 1,9 y desviación 0,6 salvo que se diga.
  it.each([
    [
      "2.1",
      { parametros: 25, r2: 0.2, media: 1.9, desviacion: 0.6 },
      [918, 401, 259, 918, 918],
    ],
    [
      "2.2",
      { parametros: 25, r2: 0.3, media: 1.9, desviacion: 0.6 },
      [574, 351, 259, 574, 574],
    ],
    [
      "2.3",
      { parametros: 50, r2: 0.2, media: 1.9, desviacion: 0.6 },
      [1924, 801, 284, 1924, 1924],
    ],
    [
      "2.4",
      { parametros: 25, r2: 0.2, media: 10, desviacion: 0.6 },
      [918, 401, 259, 918, 918],
    ],
    [
      "2.5",
      { parametros: 25, r2: 0.2, media: 1.9, desviacion: 2 },
      [918, 401, 259, 918, 918],
    ],
    [
      "2.6",
      { parametros: 100, r2: 0.5, media: 1.9, desviacion: 2 },
      [1264, 1001, 334, 1264, 1264],
    ],
  ])("vector %s", (_nombre, entrada, [i, ii, iii, iv, final]) => {
    const m = muestraCantidad(entrada);
    expect([m.contraccion, m.optimismo, m.varianza, m.media, m.final]).toEqual([
      i,
      ii,
      iii,
      iv,
      final,
    ]);
  });

  it("la media manda cuando la desviación es grande frente a ella", () => {
    const m = muestraCantidad({
      parametros: 5,
      r2: 0.2,
      media: 0.5,
      desviacion: 5,
    });
    expect(m.manda).toBe("media");
    expect(m.final).toBe(m.media);
    expect(m.final).toBeGreaterThan(m.contraccion);
  });

  it("con media 0 el criterio de la media no existe", () => {
    const m = muestraCantidad({
      parametros: 5,
      r2: 0.2,
      media: 0,
      desviacion: 1,
    });
    expect(m.media).toBeNull();
    expect(m.final).toBe(Math.max(m.contraccion, m.optimismo, m.varianza));
  });

  it("la t de Student con 233 grados de libertad es la de R (1,970 …)", () => {
    expect(t975(233)).toBeCloseTo(1.97, 2);
    expect(t975(1_000_000)).toBeCloseTo(1.96, 3);
  });
});

describe("varias clases: uno contra el resto, el mayor (aproximación declarada)", () => {
  it("manda la clase más rara y coincide con el binario de esa clase", () => {
    const proporciones = { a: 0.6, b: 0.3, c: 0.1 };
    const m = muestraMulticlase({ parametros: 12, proporciones });
    expect(m.clase).toBe("c");
    expect(m.final).toBe(
      muestraBinaria({ parametros: 12, prevalencia: 0.1 }).final,
    );
    expect(Object.keys(m.porClase)).toEqual(["a", "b", "c"]);
    expect(m.final).toBe(Math.max(...Object.values(m.porClase)));
  });
});
