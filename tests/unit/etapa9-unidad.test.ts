// S21 (lote 19-18): al ESTIMAR, la etapa 9 dice el cambio en la unidad del objetivo (la que Probeta infiere del nombre de la columna,
// como en la pantalla de resultados); en las demás tareas no hay unidad que decir.
import { describe, expect, it } from "vitest";
import { unidadDelObjetivo } from "@/components/protocolo/Etapa9Simulador";

describe("la unidad del objetivo en la etapa 9", () => {
  it("al estimar sale del nombre de la columna", () => {
    expect(unidadDelObjetivo("numerica", "consumo_kwh")).toBe("kWh");
    expect(unidadDelObjetivo("numerica", "precio_usd")).toBe("USD");
  });
  it("sin sufijo conocido no se inventa ninguna", () => {
    expect(unidadDelObjetivo("numerica", "valor")).toBeNull();
  });
  it("con dos o varias clases, o al agrupar, no hay unidad", () => {
    for (const forma of ["binaria", "multiclase", "agrupar"] as const)
      expect(unidadDelObjetivo(forma, "precio_usd")).toBeNull();
  });
});
