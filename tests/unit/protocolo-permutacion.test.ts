// Protocolo DS (S12), etapa 7: el valor p de la permutación. Cuenta igual o mejor según la dirección de la
// métrica, lleva el +1 de la observación (nunca es cero) y su resolución es 1/(N + 1); el 0,05 es convención.
import { describe, expect, it } from "vitest";
import {
  PERMUTACIONES,
  UMBRAL_SENAL,
  igualOMejor,
  resolucion,
  senalDe,
  valorP,
} from "@/engine/protocolo/permutacion";

describe("la permutación", () => {
  it("cuenta igual o mejor según la dirección: mayor es mejor, o menor (el MAE)", () => {
    const nulos = [0.5, 0.6, 0.7, 0.8];
    expect(igualOMejor(0.7, nulos, "higher")).toBe(2);
    expect(igualOMejor(0.7, nulos, "lower")).toBe(3);
  });

  it("el valor p lleva el +1 de la observación: nunca es cero, y su resolución es 1/(N + 1)", () => {
    expect(valorP(0, 19)).toBe(0.05);
    expect(valorP(19, 19)).toBe(1);
    expect(resolucion(199)).toBe(1 / 200);
    expect(valorP(0, PERMUTACIONES.max)).toBe(resolucion(PERMUTACIONES.max));
  });

  it("con el mínimo de permutaciones, «hay señal» es alcanzable", () => {
    expect(resolucion(PERMUTACIONES.min)).toBeLessThanOrEqual(UMBRAL_SENAL);
    expect(senalDe(UMBRAL_SENAL)).toBe("senal");
    expect(senalDe(0.051)).toBe("sin-senal");
  });
});
