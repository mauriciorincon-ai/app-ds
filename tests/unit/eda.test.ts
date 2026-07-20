import { describe, expect, it } from "vitest";
import type { CsvTable } from "@/lib/ds/csv";
import { computeEdaAlerts, type EdaAlert } from "@/engine/eda";

function table(headers: string[], rows: string[][]): CsvTable {
  return { headers, rows };
}

function kinds(alerts: EdaAlert[]): string[] {
  return alerts.map((a) => a.kind);
}

describe("computeEdaAlerts — silencio en dataset limpio", () => {
  it("no emite alertas cuando no hay fuga, ID ni desbalance", () => {
    // edad numérica de baja cardinalidad; region independiente del objetivo
    // (ciclo de 3 vs objetivo de 2 ⇒ sin correlación); clases balanceadas.
    const rows = Array.from({ length: 20 }, (_, i) => [
      String(20 + (i % 7)),
      ["norte", "sur", "este"][i % 3],
      i % 2 === 0 ? "0" : "1",
    ]);
    const alerts = computeEdaAlerts(table(["edad", "region", "y"], rows), "y");
    expect(alerts).toEqual([]);
  });
});

describe("computeEdaAlerts — posible fuga", () => {
  it("marca una feature categórica que es proxy casi perfecto del objetivo", () => {
    const rows = Array.from({ length: 20 }, (_, i) => {
      const positivo = i % 2 === 0;
      return [positivo ? "p" : "q", positivo ? "1" : "0"];
    });
    const alerts = computeEdaAlerts(table(["proxy", "y"], rows), "y");
    const leak = alerts.find((a) => a.kind === "possible-leak");
    expect(leak).toBeDefined();
    if (leak?.kind === "possible-leak") expect(leak.column).toBe("proxy");
  });

  it("una columna casi-única se reporta como id-like, NO como fuga", () => {
    // valores todos distintos ⇒ pureza categórica 1.0, pero es un identificador.
    const rows = Array.from({ length: 20 }, (_, i) => [
      `cliente-${i}`,
      i % 2 === 0 ? "0" : "1",
    ]);
    const alerts = computeEdaAlerts(table(["ref", "y"], rows), "y");
    expect(kinds(alerts)).toContain("id-like");
    expect(kinds(alerts)).not.toContain("possible-leak");
  });
});

describe("computeEdaAlerts — desbalance", () => {
  it("alerta cuando la clase minoritaria está por debajo del 15%", () => {
    // 2 positivos / 20 = 0.10 < 0.15.
    const rows = Array.from({ length: 20 }, (_, i) => [
      String(i),
      i < 2 ? "1" : "0",
    ]);
    const alerts = computeEdaAlerts(table(["x", "y"], rows), "y");
    const imb = alerts.find((a) => a.kind === "class-imbalance");
    expect(imb).toBeDefined();
    if (imb?.kind === "class-imbalance")
      expect(imb.minorityRate).toBeCloseTo(0.1, 5);
  });

  it("calla cuando las clases están razonablemente balanceadas", () => {
    const rows = Array.from({ length: 20 }, (_, i) => [
      String(i),
      i % 2 === 0 ? "0" : "1",
    ]);
    const alerts = computeEdaAlerts(table(["x", "y"], rows), "y");
    expect(kinds(alerts)).not.toContain("class-imbalance");
  });
});

describe("computeEdaAlerts — objetivo no binario", () => {
  it("devuelve vacío (mismo criterio que el resto del pipeline)", () => {
    const t = table(
      ["x", "y"],
      [
        ["1", "a"],
        ["2", "b"],
        ["3", "c"],
      ],
    );
    expect(computeEdaAlerts(t, "y")).toEqual([]);
  });
});

describe("computeEdaAlerts — orden por severidad", () => {
  it("fuga antes que id-like antes que desbalance", () => {
    // proxy (fuga) + ref (id-like) + minoría 10% (desbalance), todo a la vez.
    const rows = Array.from({ length: 20 }, (_, i) => {
      const positivo = i < 2; // 2/20 = 0.10 ⇒ desbalance
      return [
        positivo ? "p" : "q", // proxy perfecto del objetivo
        `ref-${i}`, // casi-único
        positivo ? "1" : "0",
      ];
    });
    const alerts = computeEdaAlerts(table(["proxy", "ref", "y"], rows), "y");
    expect(kinds(alerts)).toEqual([
      "possible-leak",
      "id-like",
      "class-imbalance",
    ]);
  });
});
