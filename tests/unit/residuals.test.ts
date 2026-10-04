import { describe, expect, it } from "vitest";
import {
  RESIDUAL_LEAN_ALPHA,
  residualLean,
  signTestPValue,
} from "@/engine/residuals";
import { formatQuantity } from "@/lib/quantity";

// S6 (D9, AU-S6-15): «tiende a estimar de más/de menos» solo con evidencia — una
// prueba de signo exacta, no un umbral a ojo que lee ruido como tendencia.
const sample = (above: number, below: number, ties = 0) => {
  const real = Array.from({ length: above + below + ties }, (_, i) => 100 + i);
  const predicted = real.map((v, i) =>
    i < above ? v + 7 : i < above + below ? v - 7 : v,
  );
  return { real, predicted };
};

describe("prueba de signo (residuals.ts)", () => {
  it("p-valores exactos de dos colas", () => {
    expect(signTestPValue(10, 0)).toBeCloseTo(2 / 1024, 12);
    expect(signTestPValue(5, 5)).toBe(1);
    expect(signTestPValue(0, 0)).toBe(1);
    // 15 de 50 de un lado: P(X ≤ 15) ≈ 0,0033 por cola.
    expect(signTestPValue(15, 35)).toBeCloseTo(0.0066, 3);
    expect(RESIDUAL_LEAN_ALPHA).toBe(0.05);
  });

  it("un desbalance claro inclina; uno que el azar explica, no", () => {
    expect(residualLean(sample(40, 10), 3)).toBe("over");
    expect(residualLean(sample(10, 40), -3)).toBe("under");
    // 30 de 50 por encima: p ≈ 0,20 — la regla vieja (5 % del MAE) lo llamaba tendencia.
    expect(residualLean(sample(30, 20), 5)).toBe("none");
    // Los empates (estimado = real) no cuentan para ningún lado.
    expect(residualLean(sample(9, 0, 40), 0.5)).toBe("over");
  });

  it("el lado tiene que coincidir con el error mediano de TODA la prueba", () => {
    expect(residualLean(sample(40, 10), -1)).toBe("none");
    expect(residualLean(sample(40, 10), 0)).toBe("none");
  });

  it("un error que redondea a cero se escribe sin signo («0.0», no «-0.0»)", () => {
    expect(formatQuantity(-0.004, 1)).toBe("0.0");
    expect(formatQuantity(-0.04, 1)).toBe("0.0");
    expect(formatQuantity(-0.06, 1)).toBe("-0.1");
  });
});
