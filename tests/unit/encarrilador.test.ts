// E2 — encarrilador de modelos (S5): reglas «fuera» solo con respaldo medido
// (D9), reparto por costo contra el techo (D3), forzados al Nivel 2 (U3) y la
// unión del Nivel 2 (D5). Los perfiles salen de los datasets medidos en la F0.
import { describe, expect, it } from "vitest";
import {
  BALANCED_MIN_MINORITY,
  chooseCvK,
  CV_K,
  CV_K_LARGE,
  CV_LARGE_FROM_ROWS,
  LEVEL1_CEILING_S,
  MLP_MIN_ROWS,
  rosterFor,
  routeModels,
  type RouteProfile,
} from "@/engine/encarrilador";
import { MEMBER_IDS } from "@/engine/roster";

// Un dataset del kit (200 filas) y el sintético de 20.000 filas de la F0.
const KIT: RouteProfile = {
  rows: 200,
  nTrain: 150,
  width: 10,
  minorityShare: 0.3,
  k: 5,
};
const BIG: RouteProfile = {
  rows: 20_000,
  nTrain: 15_000,
  width: 33,
  minorityShare: 0.3,
  k: 5,
};

describe("constantes fijadas en el STOP de la F0", () => {
  it("techo 5 s, MLP ≥ 500 filas, balanceadas con minoritaria < 40 %, k 5/3", () => {
    expect(LEVEL1_CEILING_S).toBe(5);
    expect(MLP_MIN_ROWS).toBe(500);
    expect(BALANCED_MIN_MINORITY).toBe(0.4);
    expect([CV_K, CV_K_LARGE, CV_LARGE_FROM_ROWS]).toEqual([5, 3, 20_001]);
  });
});

describe("routeModels (E2)", () => {
  it("dataset del kit: todo lo que tiene razón para competir cabe en el Nivel 1", () => {
    const routing = routeModels(KIT);
    expect(routing.level2).toEqual([]);
    expect(routing.out).toEqual(["mlp"]); // 200 filas < 500
    expect(routing.level1).toHaveLength(MEMBER_IDS.length - 1);
    expect(routing.level1EstimateS).toBeLessThanOrEqual(LEVEL1_CEILING_S);
    // Cada uno con su razón.
    for (const p of routing.placements) expect(p.reason).toBeTruthy();
  });

  it("MLP fuera con 100 filas, con su razón; dentro desde MLP_MIN_ROWS", () => {
    const mlp = (rows: number) =>
      routeModels({ ...KIT, rows }).placements.find((p) => p.id === "mlp")!;
    expect(mlp(100)).toMatchObject({ level: "out", reason: "mlp-few-rows" });
    expect(mlp(MLP_MIN_ROWS).level).not.toBe("out");
  });

  it("balanceadas fuera con clases equilibradas (repetirían a su base); dentro con desbalance", () => {
    const balanced = routeModels({ ...KIT, minorityShare: 0.45 });
    expect(balanced.out).toEqual(
      expect.arrayContaining(["logistic_balanced", "forest_balanced"]),
    );
    expect(
      balanced.placements.find((p) => p.id === "forest_balanced")!.reason,
    ).toBe("balanced-not-needed");
    expect(routeModels({ ...KIT, minorityShare: 0.3 }).out).not.toContain(
      "forest_balanced",
    );
  });

  it("D9: KNN y Naive Bayes NUNCA quedan fuera por regla (ni con 20.000 filas ni con categóricas)", () => {
    const routing = routeModels(BIG);
    expect(routing.out).not.toContain("knn");
    expect(routing.out).not.toContain("naive_bayes");
    expect(routing.out).toEqual([]); // 20.000 filas, desbalance 0,3: nada fuera
  });

  it("D3: con 20.000 filas el Nivel 1 se llena por prioridad hasta el techo; lo caro va al Nivel 2", () => {
    const routing = routeModels(BIG);
    expect(routing.level1EstimateS).toBeLessThanOrEqual(LEVEL1_CEILING_S);
    expect(routing.level1[0]).toBe("logistic");
    expect(routing.level2).toEqual(
      expect.arrayContaining(["forest", "extra_trees", "mlp"]),
    );
    for (const id of routing.level2) {
      expect(routing.placements.find((p) => p.id === id)!.reason).toBe(
        "over-ceiling",
      );
    }
    // F0 (simulación con costos medidos): 7 modelos en el Nivel 1 a 5 s.
    expect(routing.level1.length).toBeGreaterThanOrEqual(5);
    expect(routing.level1.length).toBeLessThanOrEqual(9);
    expect(routing.unionEstimateS).toBeGreaterThan(routing.level1EstimateS);
  });

  it("el primero del orden entra siempre (nunca hay liga vacía), aunque no quepa", () => {
    const routing = routeModels(BIG, 0.01);
    expect(routing.level1).toEqual(["logistic"]);
    expect(routing.placements[0]!.reason).toBe("always-first");
  });

  it("U3: un «fuera» forzado va al Nivel 2 con la razón por la que quedaba fuera", () => {
    const routing = routeModels({ ...KIT, rows: 100 }, LEVEL1_CEILING_S, [
      "mlp",
    ]);
    expect(routing.placements.find((p) => p.id === "mlp")).toMatchObject({
      level: 2,
      reason: "forced",
      outReason: "mlp-few-rows",
    });
    expect(routing.level2).toEqual(["mlp"]);
    expect(routing.out).not.toContain("mlp");
  });

  it("D5: el Nivel 2 re-corre la unión, en orden de prioridad", () => {
    const routing = routeModels(BIG);
    expect(rosterFor(routing, 1)).toEqual(routing.level1);
    const union = rosterFor(routing, 2);
    expect(union).toEqual(
      MEMBER_IDS.filter(
        (id) => routing.level1.includes(id) || routing.level2.includes(id),
      ),
    );
  });
});

describe("chooseCvK", () => {
  it("5 pliegues; 3 desde CV_LARGE_FROM_ROWS; acotado a la minoritaria de train", () => {
    expect(chooseCvK(1000, 100)).toBe(5);
    expect(chooseCvK(CV_LARGE_FROM_ROWS - 1, 100)).toBe(5);
    expect(chooseCvK(CV_LARGE_FROM_ROWS, 100)).toBe(3);
    expect(chooseCvK(1000, 4)).toBe(4);
    expect(chooseCvK(1000, 2)).toBe(2);
  });

  it("menos de 2 ejemplos de alguna clase en train ⇒ null (no hay CV honesta)", () => {
    expect(chooseCvK(1000, 1)).toBeNull();
    expect(chooseCvK(1000, 0)).toBeNull();
  });
});
