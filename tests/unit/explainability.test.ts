import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  IMPORTANCE_DISPLAY_DECIMALS,
  isFeatureUsed,
} from "@/engine/explainability";

// Gate ⭐ S4 (post-cierre): el gráfico mostraba la MISMA línea ("sin dirección
// clara") para una variable que pesa 0.063 y para otra de -0.005. Son situaciones
// distintas: la segunda no aporta nada. La regla vive una sola vez aquí porque
// gobierna el gráfico, la plantilla determinista y el prompt del LLM.
describe("isFeatureUsed", () => {
  it("importancia positiva visible ⇒ el modelo la usa", () => {
    expect(isFeatureUsed(0.183)).toBe(true);
    expect(isFeatureUsed(0.063)).toBe(true);
    expect(isFeatureUsed(0.001)).toBe(true);
  });

  it("importancia negativa ⇒ no la usa (desordenarla no le hizo daño)", () => {
    expect(isFeatureUsed(-0.005)).toBe(false);
    expect(isFeatureUsed(-0.013)).toBe(false);
  });

  it("cero exacto ⇒ no la usa", () => {
    expect(isFeatureUsed(0)).toBe(false);
  });

  it("lo que redondea a 0.000 en pantalla ⇒ no la usa (coherencia con lo que se ve)", () => {
    expect(isFeatureUsed(0.0004)).toBe(false);
    expect(isFeatureUsed(0.0005)).toBe(true); // ya se muestra como 0.001
  });

  // El umbral está duplicado por fuerza en TS y Python (lados distintos del
  // worker). Este test falla si alguien mueve uno sin el otro.
  it("paridad con el umbral de pipeline.py", () => {
    const py = readFileSync("src/lib/ds/pipeline.py", "utf8");
    expect(py).toContain(
      `round(float(pi.importances_mean[i]), ${IMPORTANCE_DISPLAY_DECIMALS}) > 0`,
    );
  });
});
