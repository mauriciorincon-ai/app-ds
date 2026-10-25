// @vitest-environment node
/**
 * S18 — el verificador de cifras y de nombres de un texto. Lo que hace FALLAR si se rompe:
 *  · cada cifra requerida tiene que estar, y una cifra que no es del resultado ni fija se delata como ajena;
 *  · las cifras que forman parte de un nombre de columna («f1_score», «col_2») no cuentan como cifras del texto;
 *  · los miles se escriben con coma y los decimales con punto (la regla de la app) y se leen igual;
 *  · el orden de los nombres, y una frase exacta, se comprueban;
 *  · las cifras fijas de las plantillas (rangos «de 0 a 1», «0.50 sería azar») son TODAS las que los diccionarios escriben.
 */
import { describe, expect, it } from "vitest";
import type { Dictionary } from "@/i18n/dictionaries";
import { cifrasDe, escribir, verificarTexto } from "@/lib/narration/cifras";
import { CIFRAS_FIJAS } from "@/lib/narration/explicacion";
import en from "../../messages/en.json";
import es from "../../messages/es.json";

describe("cifrasDe", () => {
  it("lee decimales con punto y miles con coma", () => {
    expect(
      cifrasDe(
        "El modelo saca 0.84, la base 0.5 y hay 12,345 filas y 1,234,567.89 de algo.",
      ),
    ).toEqual(["0.84", "0.5", "12,345", "1,234,567.89"]);
  });

  it("quita los nombres antes de buscar: un número dentro de una columna no es una cifra del texto", () => {
    expect(
      cifrasDe("pesan f1_score y col_2 (0.31)", ["f1_score", "col_2"]),
    ).toEqual(["0.31"]);
    // sin quitarlos, los dígitos del nombre se confundirían con cifras
    expect(cifrasDe("pesan f1_score y col_2 (0.31)")).toEqual([
      "1",
      "2",
      "0.31",
    ]);
  });
});

describe("el signo de una cifra (auditoría H-02, S18)", () => {
  it("un «-» o «−» pegado al número es su signo; entre palabras, fechas o rangos no lo es", () => {
    expect(cifrasDe("R² de -0.20, media de −12.5 y (-3)")).toEqual([
      "-0.20",
      "-12.5",
      "-3",
    ]);
    expect(cifrasDe("del 2026-05 al 2026-06, de 0-1, p-valor 3 y x-1")).toEqual(
      ["2026", "05", "2026", "06", "0", "1", "3", "1"],
    );
  });

  it("una cifra negativa requerida se acepta con su signo y se rechaza sin él", () => {
    const esperado = {
      requeridas: [{ clave: "r2", valor: -0.2, decimales: 2 }],
    };
    expect(verificarTexto("El R² es -0.20.", esperado)).toEqual([]);
    expect(verificarTexto("El R² es −0.20.", esperado)).toEqual([]);
    // el mismo texto sin el signo ya no cuadra: falta la cifra y sobra una ajena
    expect(verificarTexto("El R² es 0.20.", esperado)).toEqual([
      { tipo: "cifra-falta", clave: "r2" },
      { tipo: "cifra-ajena", cifra: "0.20" },
    ]);
  });

  it("la media de un grupo negativa en las unidades del usuario cuadra, y con otro signo no", () => {
    const esperado = {
      requeridas: [
        { clave: "grupo1:balance", valor: -1234.5, decimales: 1 },
        { clave: "promedio:balance", valor: 80.25, decimales: 1 },
      ],
    };
    expect(
      verificarTexto("balance más baja (-1,234.5 frente a 80.3 de promedio)", {
        ...esperado,
        requeridas: [
          esperado.requeridas[0]!,
          { clave: "promedio:balance", valor: 80.3, decimales: 1 },
        ],
      }),
    ).toEqual([]);
    expect(
      verificarTexto("balance más baja (1,234.5 frente a 80.3 de promedio)", {
        ...esperado,
        requeridas: [
          esperado.requeridas[0]!,
          { clave: "promedio:balance", valor: 80.3, decimales: 1 },
        ],
      }),
    ).not.toEqual([]);
  });
});

describe("verificarTexto", () => {
  const esperado = {
    requeridas: [
      { clave: "modelo", valor: 0.84, decimales: 2 },
      { clave: "base", valor: 0.5, decimales: 2 },
    ],
    permitidas: ["0.34"],
    fijas: CIFRAS_FIJAS,
    orden: ["edad", "región", "plan"],
  };

  it("pasa cuando están las cifras requeridas, las demás son permitidas y los nombres van en orden", () => {
    expect(
      verificarTexto(
        "Saca 0.84 contra 0.50 (0.34 más), de 0 a 1. Pesan: edad, región, plan.",
        esperado,
      ),
    ).toEqual([]);
  });

  it("una cifra requerida que falta se nombra por su clave", () => {
    expect(
      verificarTexto(
        "Saca 0.84, de 0 a 1. Pesan: edad, región, plan.",
        esperado,
      ),
    ).toEqual([{ tipo: "cifra-falta", clave: "base" }]);
  });

  it("una cifra que no es del resultado se delata como ajena, una sola vez", () => {
    const fallos = verificarTexto(
      "Saca 0.84 contra 0.50. El 87 % y otra vez 87 %. Pesan: edad, región, plan.",
      esperado,
    );
    expect(fallos).toEqual([{ tipo: "cifra-ajena", cifra: "87" }]);
  });

  it("el orden de los nombres: en otro orden o con uno que falta falla", () => {
    expect(
      verificarTexto("0.84 0.50 región, edad, plan", esperado).map(
        (f) => f.tipo,
      ),
    ).toEqual(["orden"]);
    expect(
      verificarTexto("0.84 0.50 edad, región", esperado).map((f) => f.tipo),
    ).toEqual(["orden"]);
  });

  it("una frase exacta que falta se nombra", () => {
    const con = {
      requeridas: [],
      frases: [{ clave: "separan", texto: "se separan por A, B." }],
    };
    expect(verificarTexto("Los grupos se separan por A, B.", con)).toEqual([]);
    expect(verificarTexto("Los grupos se separan por B, A.", con)).toEqual([
      { tipo: "frase-falta", clave: "separan" },
    ]);
  });

  it("escribir usa la misma regla que la pantalla (miles con coma)", () => {
    expect(escribir(1234.5, 1)).toBe("1,234.5");
    expect(escribir(0.5, 2)).toBe("0.50");
  });
});

describe("las cifras fijas de las plantillas", () => {
  // TODA cifra literal que escriben los textos de narration.template.* (no la que entra por {marcador}) está declarada
  const literales = (idioma: Dictionary) => {
    const salida = new Set<string>();
    const recorrer = (nodo: string | Dictionary) => {
      if (typeof nodo === "string") {
        for (const m of nodo
          .replace(/\{[^}]*\}/g, "")
          .matchAll(/\d+(?:\.\d+)?/g))
          salida.add(m[0]);
      } else for (const v of Object.values(nodo)) recorrer(v);
    };
    recorrer((idioma.narration as Dictionary).template as Dictionary);
    return salida;
  };

  it.each([
    ["es", es],
    ["en", en],
  ] as const)(
    "%s: no hay una cifra fija sin declarar",
    (_idioma, diccionario) => {
      const sinDeclarar = [...literales(diccionario as Dictionary)].filter(
        (c) => !(CIFRAS_FIJAS as readonly string[]).includes(c),
      );
      expect(sinDeclarar).toEqual([]);
    },
  );
});
