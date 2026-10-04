// Modelo de costos de la liga (S5): la forma de la estimación y la calibración.
import { describe, expect, it } from "vitest";
import {
  calibrationFactor,
  CALIBRATION_MAX,
  CALIBRATION_MIN,
  COST_COEFFICIENTS,
  estimateMemberSeconds,
} from "@/engine/costos";
import { MEMBER_IDS } from "@/engine/roster";

describe("estimateMemberSeconds", () => {
  it("hay coeficientes para cada miembro del roster", () => {
    expect(Object.keys(COST_COEFFICIENTS).sort()).toEqual(
      [...MEMBER_IDS].sort(),
    );
  });

  it("con k=5 es la CV ajustada en la F0 más un ajuste sobre train completo", () => {
    const { t0, a, b, c } = COST_COEFFICIENTS.forest;
    const nTrain = 3750;
    const width = 33;
    const variable = a * (nTrain / 1000) ** b * (width / 33) ** c;
    const cv5 = t0 + variable;
    const fitFull = t0 / 5 + (variable / 5) * (1 / 0.8) ** b;
    expect(
      estimateMemberSeconds("forest", { nTrain, width, k: 5 }, "binaria"),
    ).toBeCloseTo(cv5 + fitFull, 10);
    // Medido en la F0 (Chromium, sintetico-5000): CV k=5 del bosque = 3,07 s.
    expect(cv5).toBeGreaterThan(3.07 * 0.8);
    expect(cv5).toBeLessThan(3.07 * 1.2);
  });

  it("crece con las filas y con el ancho; k=3 cuesta menos que k=5", () => {
    for (const id of MEMBER_IDS) {
      const base = estimateMemberSeconds(
        id,
        { nTrain: 1500, width: 33, k: 5 },
        "binaria",
      );
      expect(
        estimateMemberSeconds(
          id,
          { nTrain: 15000, width: 33, k: 5 },
          "binaria",
        ),
      ).toBeGreaterThan(base);
      expect(
        estimateMemberSeconds(
          id,
          { nTrain: 1500, width: 112, k: 5 },
          "binaria",
        ),
      ).toBeGreaterThanOrEqual(base);
      expect(
        estimateMemberSeconds(
          id,
          { nTrain: 15000, width: 33, k: 3 },
          "binaria",
        ),
      ).toBeLessThan(
        estimateMemberSeconds(
          id,
          { nTrain: 15000, width: 33, k: 5 },
          "binaria",
        ),
      );
    }
  });

  it("entradas degeneradas no rompen la estimación (filas/ancho ≥ 1)", () => {
    expect(
      Number.isFinite(
        estimateMemberSeconds("knn", { nTrain: 0, width: 0, k: 2 }, "binaria"),
      ),
    ).toBe(true);
  });
});

describe("calibrationFactor", () => {
  it("es lo medido sobre lo estimado (un equipo el doble de lento ⇒ 2)", () => {
    expect(calibrationFactor(8000, 4)).toBe(2);
    expect(calibrationFactor(2000, 4)).toBe(0.5);
  });

  it("acotado: una medición rara no promete ni amenaza de más", () => {
    expect(calibrationFactor(1, 10)).toBe(CALIBRATION_MIN);
    expect(calibrationFactor(10_000_000, 1)).toBe(CALIBRATION_MAX);
  });

  it("sin medición o sin estimación ⇒ 1 (no se corrige)", () => {
    expect(calibrationFactor(0, 4)).toBe(1);
    expect(calibrationFactor(5000, 0)).toBe(1);
    expect(calibrationFactor(Number.NaN, 4)).toBe(1);
  });
});
