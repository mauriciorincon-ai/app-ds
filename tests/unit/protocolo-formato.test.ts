// Protocolo DS (S8): cómo se escriben las cifras del cuaderno (R9) y los extremos de magnitud
// (regla 22): un umbral diminuto no es «0.00» y una probabilidad casi uno no es «1.00».
import { describe, expect, it } from "vitest";
import {
  cifra,
  fecha,
  huellaCorta,
  proporcion,
  valorTexto,
} from "@/lib/protocolo/formato";

describe("proporcion", () => {
  it.each([
    [0.1667, "0.17"],
    [0.5, "0.50"],
    [0.75, "0.75"],
    [0.0016, "0.0016"],
    [0.001, "0.0010"],
    [1.6e-9, "1.6e-9"],
    [0.0000016, "0.0000016"],
    [0.9995, "0.99950"],
    [0, "0.00"],
    [1, "1.00"],
  ])("%s → %s", (valor, esperado) => {
    expect(proporcion(valor)).toBe(esperado);
  });
});

describe("valores del cuaderno", () => {
  const palabras = { si: "sí", no: "no" };
  it("escribe cada tipo con la regla de cifras de la app", () => {
    expect(valorTexto(null, palabras)).toBe("—");
    expect(valorTexto(true, palabras)).toBe("sí");
    expect(valorTexto(1234567, palabras)).toBe("1,234,567");
    expect(valorTexto(0.18282548, palabras)).toBe("0.18");
    expect(valorTexto(["a", "b"], palabras)).toBe("a, b");
    expect(valorTexto({ a: 2, b: 1 }, palabras)).toBe("a: 2 · b: 1");
  });

  it("la huella corta y la fecha", () => {
    expect(huellaCorta("0123456789abcdef".repeat(4))).toBe("0123456789ab");
    expect(fecha("2026-10-17T12:00:00.000Z", "es")).toMatch(/2026/);
  });
});

describe("cifra: los extremos de magnitud no se leen «0.00» ni como quince ceros", () => {
  it.each([
    [0, "0"],
    [5, "5"],
    [1234567, "1,234,567"],
    [9.14, "9.14"],
    [1e-11, "1.00e-11"],
    [0.00002, "2.00e-5"],
    [1e20, "1.00e+20"],
    [-3.5, "-3.50"],
  ])("%s → %s", (valor, esperado) => {
    expect(cifra(valor)).toBe(esperado);
  });

  it("una proporción extremadamente chica va en notación científica", () => {
    expect(proporcion(1e-20)).toBe("1.0e-20");
    expect(proporcion(1 - 1e-9)).toMatch(/e/);
  });
});
