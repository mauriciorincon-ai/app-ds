import { describe, expect, it } from "vitest";
import { MEMBER_IDS } from "@/engine/roster";
import type { Metrics } from "@/engine/verdict";
import type { CsvTable, ColumnProfile } from "@/lib/ds/csv";
import {
  applyMemberFit,
  assembleResult,
  estimateEncodedWidth,
  prepareRun,
  summarizeDataset,
} from "@/lib/experiment";
import type { MemberFitResult } from "@/workers/protocol";
import { pipelineResult } from "./factories";

function table(headers: string[], rows: string[][]): CsvTable {
  return { headers, rows };
}

function metrics(overrides: Partial<Metrics> = {}): Metrics {
  return {
    accuracy: 0.5,
    precision: 0.5,
    recall: 0.5,
    f1: 0.5,
    auc: 0.5,
    ...overrides,
  };
}

describe("summarizeDataset", () => {
  it("perfila columnas y detecta candidatos a objetivo y fechas", () => {
    const t = table(
      ["edad", "region", "alta", "convirtio"],
      [
        ["30", "norte", "2024-01-01", "0"],
        ["45", "sur", "2024-02-01", "1"],
        ["50", "norte", "2024-03-01", "0"],
      ],
    );
    const summary = summarizeDataset(t);
    expect(summary.rowCount).toBe(3);
    expect(summary.targetTasks.convirtio?.task).toBe("binaria");
    expect(summary.dateColumns).toContain("alta");
    const edad = summary.profiles.find((p: ColumnProfile) => p.name === "edad");
    expect(edad?.kind).toBe("numeric");
  });

  it("S5 (E1): toda columna dice qué tarea plantearía como objetivo — ninguna se esconde", () => {
    const t = table(
      ["edad", "region", "convirtio"],
      [
        ["30", "norte", "0"],
        ["45", "sur", "1"],
        ["50", "este", "0"],
      ],
    );
    const summary = summarizeDataset(t);
    expect(Object.keys(summary.targetTasks)).toEqual([
      "edad",
      "region",
      "convirtio",
    ]);
    expect(summary.targetTasks.convirtio!.task).toBe("binaria");
    expect(summary.targetTasks.region!.task).toBe("multiclase");
    expect(summary.targetTasks.edad!.task).toBe("ambigua");
  });
});

describe("prepareRun", () => {
  const clean = table(
    ["x", "cat", "y"],
    [
      ["1", "a", "0"],
      ["2", "a", "1"],
      ["3", "b", "0"],
      ["4", "b", "1"],
      ["5", "a", "0"],
      ["6", "a", "1"],
      ["7", "b", "0"],
      ["8", "b", "1"],
    ],
  );

  it("arma el payload con features numéricas y categóricas y un split sin solapamiento", () => {
    const prepared = prepareRun(clean, "y", 42);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.payload.numeric).toEqual(["x"]);
    expect(prepared.payload.categorical).toEqual(["cat"]);
    const all = [
      ...prepared.payload.train_idx,
      ...prepared.payload.test_idx,
    ].sort((a, b) => a - b);
    expect(all).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(prepared.leakage).toEqual([]);
    // Balanceado (4/8 = 0.5) ⇒ métrica primaria F1.
    expect(prepared.payload.primary_metric).toBe("f1");
  });

  it("elige AUC como métrica primaria cuando el objetivo está desbalanceado", () => {
    // 2 positivos / 10 = 0.2 ⇒ |0.2 − 0.5| = 0.3 ≥ 0.15 ⇒ AUC. La regla vive en
    // verdict.ts; prepareRun la aplica con la tasa de una clase fija (simétrica).
    // 4 positivos / 20 = 0.2 (con 2/10, train quedaba con 1 positivo: sin CV
    // honesta posible desde el S5 — ver «too-few-rows»).
    const imbalanced = table(
      ["x", "y"],
      Array.from({ length: 20 }, (_, i) => [String(i), i < 4 ? "1" : "0"]),
    );
    const prepared = prepareRun(imbalanced, "y", 1);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.payload.primary_metric).toBe("auc");
  });

  it("rechaza un objetivo que no sirve como objetivo (más de 20 categorías)", () => {
    // S7 (cambio esperado, R13): tres categorías ya no se rechazan por «no
    // binarias» — entrenan como varias categorías (ver el caso siguiente). Lo que
    // el motor no entrena es una columna con demasiadas categorías para ser clases.
    const t = table(
      ["x", "t"],
      Array.from({ length: 21 }, (_, i) => [String(i), `c${i}`]),
    );
    expect(prepareRun(t, "t", 1)).toEqual({
      ok: false,
      error: "target-not-binary",
    });
  });

  it("S7 (P4): varias categorías con una fila por clase ⇒ faltan filas POR CLASE, y nombra la más chica", () => {
    const t = table(
      ["x", "t"],
      [
        ["1", "a"],
        ["2", "b"],
        ["3", "c"],
      ],
    );
    expect(prepareRun(t, "t", 1)).toEqual({
      ok: false,
      error: "too-few-rows-per-class",
      smallestClass: { name: "a", trainRows: 1 },
    });
  });

  it("AU-S5-10: dos valores para E1 escritos de dos formas («1» y «1.0») ⇒ se nombra la notación", () => {
    const t = table(
      ["x", "y"],
      Array.from({ length: 12 }, (_, i) => [
        String(i),
        ["0", "1", "1.0"][i % 3],
      ]),
    );
    expect(prepareRun(t, "y", 1)).toEqual({
      ok: false,
      error: "target-mixed-notation",
    });
  });

  it("rechaza cuando no quedan features (solo fecha + objetivo)", () => {
    const t = table(
      ["alta", "y"],
      [
        ["2024-01-01", "0"],
        ["2024-02-01", "1"],
        ["2024-03-01", "0"],
        ["2024-04-01", "1"],
      ],
    );
    expect(prepareRun(t, "y", 1)).toEqual({ ok: false, error: "no-features" });
  });

  it("marca una feature categórica que es proxy del objetivo", () => {
    // S7 (D8): 10 por clase (antes 4) — en train quedan ≥ 5 de cada una.
    const leaky = table(
      ["proxy", "y"],
      Array.from({ length: 20 }, (_, i) => (i % 2 ? ["q", "1"] : ["p", "0"])),
    );
    const prepared = prepareRun(leaky, "y", 42);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.leakage.map((f) => f.column)).toContain("proxy");
  });
});

describe("prepareRun — la liga (S5)", () => {
  const rows = (n: number, positives: number) =>
    Array.from({ length: n }, (_, i) => [
      String(i),
      i % 3 === 0 ? "a" : "b",
      i < positives ? "1" : "0",
    ]);

  it("manda el roster del encarrilador (orden de prioridad) y k acotado a la minoritaria", () => {
    const prepared = prepareRun(table(["x", "cat", "y"], rows(40, 8)), "y", 42);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const { roster, cv_k } = prepared.payload;
    // Ordenado por prioridad y sin repetidos.
    expect(roster).toEqual(MEMBER_IDS.filter((id) => roster.includes(id)));
    // 40 filas: el MLP queda fuera (< 500) y el resto cabe en el techo.
    expect(roster).not.toContain("mlp");
    expect(prepared.routing.out).toContain("mlp");
    // 8 positivos ⇒ 6 en train ⇒ k = 5.
    expect(cv_k).toBe(5);
    expect(prepared.smallSample).toBe(true);
    expect(prepared.profile).toMatchObject({ rows: 40, nTrain: 30 });
  });

  it("k baja con pocos positivos en train y, sin 2 de cada clase, «too-few-rows» honesto", () => {
    const three = prepareRun(table(["x", "cat", "y"], rows(40, 4)), "y", 42);
    expect(three.ok && three.payload.cv_k).toBe(3);
    expect(prepareRun(table(["x", "cat", "y"], rows(12, 2)), "y", 42)).toEqual({
      ok: false,
      error: "too-few-rows",
    });
  });

  it("Nivel 2 = la unión Nivel 1 ∪ Nivel 2 (D5), con los forzados (U3)", () => {
    const t = table(["x", "cat", "y"], rows(40, 8));
    const level2 = prepareRun(t, "y", 42, {
      level: 2,
      ceilingS: 0.3,
      forced: ["mlp"],
    });
    expect(level2.ok).toBe(true);
    if (!level2.ok) return;
    expect(level2.payload.roster).toEqual(
      MEMBER_IDS.filter(
        (id) =>
          level2.routing.level1.includes(id) ||
          level2.routing.level2.includes(id),
      ),
    );
    expect(level2.payload.roster).toContain("mlp");
    expect(level2.routing.level2.length).toBeGreaterThan(0);
  });

  it("estima el ancho tras one-hot como el OneHotEncoder(min_frequency=2)", () => {
    const headers = ["n", "c"];
    const data = [
      ["1", "a"],
      ["2", "a"],
      ["3", "b"],
      ["4", "b"],
      ["5", "rara"],
      ["6", "NA"],
    ];
    // 1 numérica + a, b (≥ 2) + bucket infrecuente por «rara»; el nulo no suma.
    expect(
      estimateEncodedWidth(headers, data, ["n"], ["c"], [0, 1, 2, 3, 4, 5]),
    ).toBe(4);
    // Sin raras, sin bucket.
    expect(
      estimateEncodedWidth(headers, data, ["n"], ["c"], [0, 1, 2, 3]),
    ).toBe(3);
  });
});

describe("assembleResult", () => {
  it("elige la métrica primaria, el mejor baseline y calcula el veredicto", () => {
    const py = pipelineResult(
      { roster: ["logistic", "hgb", "forest"], cv_k: 5 },
      {
        logistic: 0.7,
        hgb: 0.8,
        forest: 0.75,
      },
    );
    const result = assembleResult(py, []);
    // desbalanceado (0.3) → métrica primaria AUC; mejor baseline 0.6; modelo 0.8 → supera
    expect(result.verdict.primaryMetric).toBe("auc");
    expect(result.verdict.level).toBe("beats");
    expect(result.verdict.baselineScore).toBe(0.6);
    // El ganador de la CV y la liga pasan al resultado (los muestra ResultsScreen).
    expect(result.modelName).toBe("hgb");
    expect(result.league.map((row) => row.name)).toEqual([
      "logistic",
      "hgb",
      "forest",
    ]);
    expect(result.selection).toMatchObject({
      by: "cv",
      cvWinner: "hgb",
      best: "hgb",
      k: 5,
      metric: "auc",
      competitors: 3,
      elapsedMs: 1234,
    });
    // La explicabilidad pasa intacta al resultado (la consume la UI y la model card).
    expect(result.explainability.features[0]?.name).toBe("x");
  });
});

describe("applyMemberFit (elección manual, U1)", () => {
  const base = () =>
    assembleResult(
      pipelineResult({ roster: ["logistic", "hgb", "knn"], cv_k: 5 }),
      [],
    );
  const fit = (name: "knn" | "logistic", auc: number): MemberFitResult => ({
    task: "binaria",
    model: metrics({ auc }),
    model_name: name,
    confusion_matrix: [
      [2, 1],
      [1, 2],
    ],
    explainability: {
      method: "permutation_importance",
      scoring: "roc_auc",
      n_repeats: 10,
      features: [],
    },
    preprocessing: { numeric_medians: {}, rare_categories: { cat: ["z"] } },
  });

  it("el veredicto habla del elegido contra el MISMO baseline; la liga no cambia", () => {
    const result = base();
    const chosen = applyMemberFit(result, fit("knn", 0.55));
    expect(chosen.selection.by).toBe("user");
    expect(chosen.selection.cvWinner).toBe(result.selection.cvWinner);
    expect(chosen.modelName).toBe("knn");
    expect(chosen.verdict.level).toBe("loses"); // 0.55 vs baseline 0.6
    expect(chosen.league).toBe(result.league);
    expect(chosen.rareCategories).toEqual({ cat: ["z"] });
  });

  it("volver al ganador de la CV devuelve la selección a «cv»", () => {
    const result = base();
    const back = applyMemberFit(
      applyMemberFit(result, fit("knn", 0.55)),
      fit("logistic", 0.8),
    );
    expect(back.selection.by).toBe("cv");
    expect(back.verdict.level).toBe("beats");
  });
});
