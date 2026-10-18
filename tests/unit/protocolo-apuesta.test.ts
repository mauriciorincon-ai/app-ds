// Protocolo DS (S9), etapa 4: la apuesta se fija al revelar y se recuerda mientras dure la pestaña.
// Atada al archivo (huella) y a lo que se respondió en las etapas 1–3; lo que no cuadra con la
// forma esperada se ignora; un navegador sin almacenamiento no rompe nada.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Previas } from "@/engine/protocolo/etapas";
import {
  claveApuesta,
  fijarApuesta,
  leerApuestaFija,
  olvidarApuesta,
} from "@/lib/protocolo/apuesta";

const previas = (objetivo: string): Previas => ({
  1: { respuestas: { forma: "binaria" }, chequeos: {} },
  2: { respuestas: { objetivo }, chequeos: {} },
  3: { respuestas: { proposito: "predecir" }, chequeos: {} },
});

const CLAVE_DE_ALMACEN = "probeta-protocolo:apuesta";

beforeEach(() => window.sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("la clave de la apuesta", () => {
  it("es la misma para el mismo archivo y las mismas respuestas, y cambia con cualquiera de los dos", () => {
    const h = "a".repeat(64);
    expect(claveApuesta(h, previas("y"))).toBe(claveApuesta(h, previas("y")));
    expect(claveApuesta(h, previas("y"))).not.toBe(
      claveApuesta(h, previas("z")),
    );
    expect(claveApuesta(h, previas("y"))).not.toBe(
      claveApuesta("b".repeat(64), previas("y")),
    );
    const otraEtapa1: Previas = {
      ...previas("y"),
      1: { respuestas: { forma: "numerica" }, chequeos: {} },
    };
    expect(claveApuesta(h, otraEtapa1)).not.toBe(claveApuesta(h, previas("y")));
  });
});

describe("fijar y leer", () => {
  it("devuelve lo fijado, solo con la misma clave", () => {
    fijarApuesta("k1", { apuesta: ["a", "b"], ninguna: false });
    expect(leerApuestaFija("k1")).toEqual({
      apuesta: ["a", "b"],
      ninguna: false,
    });
    expect(leerApuestaFija("k2")).toBeNull();
    fijarApuesta("k1", { apuesta: [], ninguna: true });
    expect(leerApuestaFija("k1")).toEqual({ apuesta: [], ninguna: true });
  });

  it("olvidar la borra", () => {
    fijarApuesta("k1", { apuesta: ["a"], ninguna: false });
    olvidarApuesta();
    expect(leerApuestaFija("k1")).toBeNull();
  });

  it.each([
    ["JSON roto", "{no es json"],
    ["una lista", "[]"],
    ["sin la bandera", JSON.stringify({ clave: "k", apuesta: ["a"] })],
    [
      "apuesta que no es lista",
      JSON.stringify({ clave: "k", apuesta: "a", ninguna: false }),
    ],
    [
      "nombres que no son texto",
      JSON.stringify({ clave: "k", apuesta: [1], ninguna: false }),
    ],
    [
      "«ninguna» con columnas",
      JSON.stringify({ clave: "k", apuesta: ["a"], ninguna: true }),
    ],
    [
      "columnas sin «ninguna» ni apuesta",
      JSON.stringify({ clave: "k", apuesta: [], ninguna: false }),
    ],
  ])("lo que no tiene la forma esperada se ignora: %s", (_, crudo) => {
    window.sessionStorage.setItem(CLAVE_DE_ALMACEN, crudo);
    expect(leerApuestaFija("k")).toBeNull();
  });
});

describe("sin almacenamiento", () => {
  it("fijar, leer y olvidar no lanzan aunque el navegador lo impida", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("cuota");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    expect(() =>
      fijarApuesta("k", { apuesta: ["a"], ninguna: false }),
    ).not.toThrow();
    expect(leerApuestaFija("k")).toBeNull();
    expect(() => olvidarApuesta()).not.toThrow();
  });
});
