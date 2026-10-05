// Estimar una cantidad (S6, ADR-013): los motores puros de la regresión. Cada
// garantía falla si alguien la rompe: E1 con la respuesta del usuario, el split
// por bandas, la fuga continua (|Spearman| y η² con soporte), la regla del MAE
// (menor es mejor, ± 1 % relativo) en UN sitio, la regla de un error estándar
// con dirección, costos y roster por tarea, la unidad del objetivo y el EDA de
// la forma del objetivo. La binaria sigue con su regla exacta.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  costCoefficients,
  estimateMemberSeconds,
  REGRESSION_COST_COEFFICIENTS,
} from "@/engine/costos";
import {
  computeEdaAlerts,
  farOutShare,
  skewness,
  TARGET_OUTLIER_SHARE,
  TARGET_SKEW_THRESHOLD,
} from "@/engine/eda";
import { MLP_MIN_ROWS, routeModels } from "@/engine/encarrilador";
import {
  CONTINUOUS_LEAKAGE_THRESHOLD,
  detectLeakageContinuous,
  ETA_MIN_SUPPORT,
  etaSquared,
  LEAKAGE_MIN_PAIRS,
  spearmanAbs,
} from "@/engine/leakage";
import {
  ALL_MEMBER_IDS,
  CLUSTER_MEMBER_IDS,
  isMemberOf,
  MEMBER_IDS,
  REGRESSION_MEMBER_IDS,
  ROSTER_BY_TASK,
  selectOneSe,
  type CvRowLike,
  type MemberId,
} from "@/engine/roster";
import { sanitizeTable } from "@/engine/sanitize";
import { quantileSplit, stratifiedSplit, TARGET_BANDS } from "@/engine/split";
import { detectTask, resolveTask, TRAINABLE_TASKS } from "@/engine/tarea";
import {
  computeVerdict,
  METRIC_RULES,
  pickBestBaseline,
  REGRESSION_TIE_TOLERANCE,
  TIE_EPSILON,
} from "@/engine/verdict";
import { parseCsvWithLimits, type CsvTable } from "@/lib/ds/csv";
import {
  assembleRegressionResult,
  inferUnit,
  MIN_REGRESSION_TEST_ROWS,
  prepareRun,
} from "@/lib/experiment";
import { formatEstimates } from "@/lib/scored-csv";
import type { RegressionPipelineResult } from "@/workers/protocol";

const kit = (file: string): CsvTable => {
  const parsed = parseCsvWithLimits(
    readFileSync(resolve(process.cwd(), "public/datasets", file), "utf8"),
  );
  if (!parsed.ok) throw new Error(file);
  return sanitizeTable(parsed.table).table;
};

describe("E1: la tarea con la respuesta del usuario (D2)", () => {
  const ocupantes = detectTask(["1", "2", "3", "4", "5", "6", "2", "3"]);

  it("una ambigua sin respuesta sigue ambigua; con respuesta, es lo que el usuario dijo", () => {
    expect(ocupantes.task).toBe("ambigua");
    expect(resolveTask(ocupantes)).toBe("ambigua");
    expect(resolveTask(ocupantes, "numerica")).toBe("numerica");
    expect(resolveTask(ocupantes, "multiclase")).toBe("multiclase");
  });

  it("la respuesta no cambia una tarea que no es ambigua", () => {
    expect(resolveTask(detectTask(["si", "no"]), "numerica")).toBe("binaria");
  });

  it("la UI ofrece entrenar la cantidad desde la F2 del S6 (D4), y varias categorías desde el S7", () => {
    expect(TRAINABLE_TASKS).toEqual(["binaria", "multiclase", "numerica"]);
  });
});

describe("split por bandas de cuantiles (P4, R2)", () => {
  // 200 valores continuos distintos: cada uno sería su propia «clase».
  const values = Array.from({ length: 200 }, (_, i) => 100 + i * 1.37);

  it("el split estratificado por valor deja la prueba VACÍA con un objetivo continuo", () => {
    expect(stratifiedSplit(values, 0.25, 42).testIdx).toHaveLength(0);
  });

  it("por bandas: ~25 % a prueba, en TODAS las bandas, sin solaparse y determinista", () => {
    const { trainIdx, testIdx } = quantileSplit(values, 0.25, 42);
    expect(testIdx).toHaveLength(50);
    expect(trainIdx.length + testIdx.length).toBe(200);
    expect(testIdx.filter((i) => trainIdx.includes(i))).toEqual([]);
    const bandOf = (i: number) => Math.floor((i * TARGET_BANDS) / 200);
    expect(new Set(testIdx.map(bandOf)).size).toBe(TARGET_BANDS);
    expect(quantileSplit(values, 0.25, 42)).toEqual({ trainIdx, testIdx });
    expect(quantileSplit(values, 0.25, 7)).not.toEqual({ trainIdx, testIdx });
  });
});

describe("fuga con objetivo continuo (sobre train)", () => {
  const y = Array.from({ length: 120 }, (_, i) => 50 + ((i * 37) % 101));

  it("|Spearman|: 1 si ordena igual (o al revés), ~0 si es independiente, 0 si constante", () => {
    expect(
      spearmanAbs(
        y.map((v) => v * 1.01),
        y,
      ),
    ).toBeCloseTo(1, 12);
    expect(
      spearmanAbs(
        y.map((v) => -v),
        y,
      ),
    ).toBeCloseTo(1, 12);
    expect(
      spearmanAbs(
        y.map((_, i) => (i * 7919) % 13),
        y,
      ),
    ).toBeLessThan(0.3);
    expect(
      spearmanAbs(
        y.map(() => 3),
        y,
      ),
    ).toBe(0);
  });

  it("η²: una categoría que determina el objetivo ≈ 1; un identificador NO (soporte mínimo)", () => {
    const band = y.map((v) => (v < 80 ? "bajo" : v < 120 ? "medio" : "alto"));
    const tiers = y.map((v) => String(v)); // cada valor su categoría
    const byTier = etaSquared(tiers, y);
    // El comportamiento primero (el rojo lo nombra él, no la constante).
    expect(byTier).toBeLessThan(0.05);
    // Sin soporte mínimo, un identificador «explica» todo: por eso existe.
    expect(etaSquared(tiers, y, 1)).toBeCloseTo(1, 12);
    expect(ETA_MIN_SUPPORT).toBe(5);
    expect(etaSquared(band, y)).toBeGreaterThan(0.7);
  });

  it("detecta la columna = objetivo × 1,01 y la categoría que lo fija; deja pasar la independiente", () => {
    expect(CONTINUOUS_LEAKAGE_THRESHOLD).toBe(0.98);
    const numeric = detectLeakageContinuous(
      [
        { name: "proxy", kind: "numeric", values: y.map((v) => v * 1.01) },
        {
          name: "ruido",
          kind: "numeric",
          values: y.map((_, i) => (i * 31) % 17),
        },
      ],
      y,
    );
    expect(numeric.map((f) => [f.column, f.reason])).toEqual([
      ["proxy", "near-perfect-rank-correlation"],
    ]);
    // Una categoría que fija el objetivo (dos niveles bien poblados).
    const yStep = y.map((v) => (v > 100 ? 1000 : 10));
    const nivel = y.map((v) => (v > 100 ? "alto" : "bajo"));
    const categorical = detectLeakageContinuous(
      [{ name: "nivel", kind: "categorical", values: nivel }],
      yStep,
    );
    expect(categorical.map((f) => [f.column, f.reason])).toEqual([
      ["nivel", "category-determines-target"],
    ]);
  });

  it("una columna casi vacía no se evalúa: con pocos pares, el azar da |ρ| = 1 (D8, AU-S6-11)", () => {
    // 9 valores no nulos, ordenados IGUAL que el objetivo (ρ = 1 por construcción).
    const sparse = (k: number) => y.map((v, i) => (i < k ? v : null));
    const sparseCategory = (k: number) =>
      y.map((v, i) => (i < k ? (v > 100 ? "alto" : "bajo") : null));
    expect(
      detectLeakageContinuous(
        [
          { name: "casi_vacia", kind: "numeric", values: sparse(9) },
          {
            name: "casi_vacia_cat",
            kind: "categorical",
            values: sparseCategory(9),
          },
        ],
        y,
      ),
    ).toEqual([]);
    // Con 10 pares, la misma relación perfecta ya se nombra.
    expect(
      detectLeakageContinuous(
        [{ name: "diez", kind: "numeric", values: sparse(10) }],
        y,
      ).map((f) => f.column),
    ).toEqual(["diez"]);
    // El comportamiento primero (el rojo lo nombra él, no la constante).
    expect(LEAKAGE_MIN_PAIRS).toBe(10);
  });

  it("los nulos se ignoran emparejados con su objetivo", () => {
    const values = y.map((v, i) => (i % 10 === 0 ? null : v));
    expect(
      detectLeakageContinuous([{ name: "x", kind: "numeric", values }], y),
    ).toHaveLength(1);
  });
});

describe("METRIC_RULES: la regla en UN sitio", () => {
  it("binaria: mayor es mejor, empate absoluto de 0,01 (sin cambios)", () => {
    for (const metric of [
      "auc",
      "f1",
      "accuracy",
      "precision",
      "recall",
    ] as const)
      expect(METRIC_RULES[metric]).toEqual({
        direction: "higher",
        tolerance: { kind: "absolute", value: TIE_EPSILON },
      });
  });

  it("MAE: menor es mejor, empate relativo de 1 % (fijado por el usuario en el STOP)", () => {
    expect(REGRESSION_TIE_TOLERANCE).toBe(0.01);
    expect(METRIC_RULES.mae).toEqual({
      direction: "lower",
      tolerance: { kind: "relative", value: 0.01 },
    });
  });

  it("veredicto en MAE contra el mejor baseline (casos medidos en el spike)", () => {
    const v = (model: number, base: number) =>
      computeVerdict({ mae: model }, { mae: base }, "mae").level;
    expect(v(33.5, 43.77)).toBe("beats"); // consumo: extra_trees vs lineal
    expect(v(10.18, 10.08)).toBe("ties"); // edad: −0,99 %, dentro de 1 %
    expect(v(10.3, 10.08)).toBe("loses");
    expect(v(25244, 25244)).toBe("ties"); // la lineal gana la liga: es baseline
    expect(v(0, 0)).toBe("ties"); // proxy perfecto (fuga): nada que medir
    expect(v(1, 0)).toBe("loses");
    expect(
      computeVerdict({ mae: 33.5 }, { mae: 43.77 }, "mae").delta,
    ).toBeCloseTo(-10.27, 10);
  });

  it("el mejor baseline con MAE es el de MENOR error", () => {
    const median = { mae: 80.9, rmse: 1, r2: 0, medae: 1, mape: null };
    const linear = { mae: 43.8, rmse: 1, r2: 0.7, medae: 1, mape: null };
    expect(pickBestBaseline([median, linear], "mae")).toBe(linear);
  });
});

describe("regla de un error estándar con dirección", () => {
  const row = (name: MemberId, mean: number, std = 1): CvRowLike => ({
    name,
    status: "ok",
    cv: { mean, std },
  });

  it("con MAE el mejor es el mínimo y gana el más simple a ≤ 1 EE por ENCIMA", () => {
    // EE del mejor = 2/√5 ≈ 0,894 ⇒ umbral 35,02 + 0,894.
    const league = [
      row("linear", 36.0),
      row("hgb", 35.5),
      row("extra_trees", 35.02, 2),
    ];
    expect(selectOneSe(league, 5, "lower")).toMatchObject({
      best: "extra_trees",
      winner: "hgb",
    });
    // Con la dirección de la binaria («mayor es mejor»), el «mejor» sería el máximo.
    expect(selectOneSe(league, 5, "higher")).toMatchObject({ best: "linear" });
  });

  it("empate exacto ⇒ el primero del orden", () => {
    expect(
      selectOneSe([row("linear", 10), row("ridge", 10)], 5, "lower")!.best,
    ).toBe("linear");
  });
});

describe("roster y costos por tarea", () => {
  it("cada roster es una subsecuencia de la prioridad global (byPriority sirve a las dos)", () => {
    for (const roster of Object.values(ROSTER_BY_TASK)) {
      const positions = roster.map((id) => ALL_MEMBER_IDS.indexOf(id));
      expect(positions.every((p) => p >= 0)).toBe(true);
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    }
    // S7 (cambio esperado): agrupar suma su roster al mismo espacio de ids.
    expect(
      new Set([
        ...MEMBER_IDS,
        ...REGRESSION_MEMBER_IDS,
        ...CLUSTER_MEMBER_IDS,
      ]),
    ).toEqual(new Set(ALL_MEMBER_IDS));
  });

  it("solo estiman los que existen como regresores (un logistic no estima cantidades)", () => {
    expect(isMemberOf("numerica", "linear")).toBe(true);
    expect(isMemberOf("numerica", "logistic")).toBe(false);
    expect(isMemberOf("binaria", "lasso")).toBe(false);
    expect(isMemberOf("binaria", "forest")).toBe(true);
  });

  it("coeficientes medidos para cada regresor, y un id compartido cuesta distinto por tarea", () => {
    expect(Object.keys(REGRESSION_COST_COEFFICIENTS).sort()).toEqual(
      [...REGRESSION_MEMBER_IDS].sort(),
    );
    const input = { nTrain: 15_000, width: 33, k: 5 };
    // Bosque de regresión ≈ 5× el de clasificación (max_features=1.0, spike F0).
    expect(estimateMemberSeconds("forest", input, "numerica")).toBeGreaterThan(
      3 * estimateMemberSeconds("forest", input, "binaria"),
    );
    expect(() => costCoefficients("logistic", "numerica")).toThrow(
      /no compite/,
    );
  });

  it("E2 con 200 filas: los 10 caben en el Nivel 1 y el MLP queda fuera (forzable)", () => {
    const routing = routeModels({
      task: "numerica",
      rows: 200,
      nTrain: 150,
      width: 10,
      minorityShare: null,
      k: 5,
    });
    expect(routing.level1).toEqual(
      REGRESSION_MEMBER_IDS.filter((id) => id !== "mlp"),
    );
    expect(routing.out).toEqual(["mlp"]);
    expect(MLP_MIN_ROWS).toBe(500);
    expect(routing.level1EstimateS).toBeLessThan(5);
  });
});

describe("la unidad sale del NOMBRE del objetivo (tabla cerrada, P5)", () => {
  it.each([
    ["consumo_kwh", "kWh"],
    ["precio_usd", "USD"],
    ["temp_media_c", "°C"],
    ["superficie_m2", "m²"],
    ["duracion_dias", "d"],
    ["peso-kg", "kg"],
  ])("%s → %s", (column, symbol) => {
    expect(inferUnit(column).symbol).toBe(symbol);
  });

  // «meses» y «años» son palabras, no símbolos: con la UI en inglés se leerían en
  // español (AU-S6-26); sin un símbolo neutro, no se inventa.
  it.each(["edad", "total", "ventas_q3", "x", "plazo_meses", "edad_anios"])(
    "%s → sin unidad (no se inventa)",
    (column) => {
      expect(inferUnit(column)).toEqual({ symbol: null });
    },
  );
});

describe("EDA de un objetivo numérico (umbrales del STOP de la F0)", () => {
  it("sesgo de Fisher-Pearson y fracción lejana (3·IQR)", () => {
    expect(skewness([1, 2, 3, 4, 5])).toBeCloseTo(0, 12);
    expect(skewness([1, 1, 1, 1, 10])).toBeGreaterThan(1);
    expect(
      farOutShare([...Array.from({ length: 99 }, (_, i) => i), 10_000]),
    ).toBe(0.01);
    expect(TARGET_SKEW_THRESHOLD).toBe(1);
    expect(TARGET_OUTLIER_SHARE).toBe(0.01);
  });

  it("precio: avisa la fuga plantada y el sesgo; consumo: limpio", () => {
    const precio = computeEdaAlerts(
      kit("precio-fuga-plantada.csv"),
      "precio_usd",
      "numerica",
    );
    expect(precio.map((a) => a.kind)).toEqual([
      "possible-leak",
      "target-skewed",
    ]);
    expect(precio[0]).toMatchObject({ column: "impuesto_transferencia_usd" });
    expect(
      computeEdaAlerts(kit("consumo-energia.csv"), "consumo_kwh", "numerica"),
    ).toEqual([]);
  });

  it("atípicos simétricos: avisa los atípicos y no el sesgo", () => {
    // 2 % de las filas muy lejos por cada lado: el sesgo se cancela (≈ 0) y
    // solo la fracción lejana (4 % ≥ 1 %) puede disparar el aviso.
    const y = Array.from({ length: 100 }, (_, i) =>
      i < 2 ? -10_000 : i < 4 ? 10_000 : 50 + (i % 10),
    );
    const table: CsvTable = {
      headers: ["x", "objetivo"],
      rows: y.map((v, i) => [String((i * 7) % 13), String(v)]),
    };
    expect(
      computeEdaAlerts(table, "objetivo", "numerica").map((a) => a.kind),
    ).toEqual(["target-outliers"]);
  });

  it("bordes: pocas filas, objetivo constante o con texto, fechas y nulos", () => {
    expect(skewness([1, 2])).toBe(0);
    expect(skewness([4, 4, 4, 4])).toBe(0);
    expect(farOutShare([1, 2, 1000])).toBe(0);
    const table: CsvTable = {
      headers: ["fecha", "zona", "objetivo"],
      rows: Array.from({ length: 40 }, (_, i) => [
        `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
        i % 5 === 0 ? "" : ["norte", "sur"][i % 2],
        String(100 + (i % 7)),
      ]),
    };
    expect(computeEdaAlerts(table, "no-existe", "numerica")).toEqual([]);
    expect(computeEdaAlerts(table, "objetivo", "numerica")).toEqual([]);
    const conTexto: CsvTable = {
      ...table,
      rows: table.rows.map((row, i) =>
        i === 3 ? [row[0], row[1], "n/d"] : row,
      ),
    };
    expect(computeEdaAlerts(conTexto, "objetivo", "numerica")).toEqual([]);
  });

  it("con la tarea binaria, un objetivo numérico no da alertas (el comportamiento del S5)", () => {
    expect(
      computeEdaAlerts(
        kit("precio-fuga-plantada.csv"),
        "precio_usd",
        "binaria",
      ),
    ).toEqual([]);
  });
});

describe("prepareRun por tarea", () => {
  it("consumo: regresión con MAE, split 150/50, roster de regresión y sin fuga", () => {
    const run = prepareRun(kit("consumo-energia.csv"), "consumo_kwh", 42);
    if (!run.ok) throw new Error(run.error);
    expect(run.payload.task).toBe("numerica");
    expect(run.payload.primary_metric).toBe("mae");
    expect(run.payload.test_idx).toHaveLength(50);
    expect(run.payload.roster.every((id) => isMemberOf("numerica", id))).toBe(
      true,
    );
    expect(run.leakage).toEqual([]);
    expect(run.profile.minorityShare).toBeNull();
  });

  it("precio con fuga plantada: la nombra; ocupantes: pregunta antes de entrenar", () => {
    const precio = prepareRun(
      kit("precio-fuga-plantada.csv"),
      "precio_usd",
      42,
    );
    expect(precio.ok && precio.leakage.map((f) => f.column)).toEqual([
      "impuesto_transferencia_usd",
    ]);
    const table = kit("consumo-energia.csv");
    expect(prepareRun(table, "ocupantes", 42)).toEqual({
      ok: false,
      error: "target-ambiguous",
    });
    const asQuantity = prepareRun(table, "ocupantes", 42, {
      ambiguousChoice: "numerica",
    });
    expect(asQuantity.ok && asQuantity.payload.task).toBe("numerica");
    // S7 (D2 pagada; cambio esperado, R13): «Categorías» entrena como varias
    // categorías — el motor ya la sabe entrenar.
    const asClasses = prepareRun(table, "ocupantes", 42, {
      ambiguousChoice: "multiclase",
    });
    expect(asClasses.ok && asClasses.payload.task).toBe("multiclase");
    expect(asClasses.ok && asClasses.payload.primary_metric).toBe(
      "balanced_accuracy",
    );
  });

  it("precio SIN la columna plantada: entrena sin aviso de fuga (AC2, AU-S6-22)", () => {
    const table = kit("precio-fuga-plantada.csv");
    const drop = table.headers.indexOf("impuesto_transferencia_usd");
    expect(drop).toBeGreaterThanOrEqual(0);
    const withoutLeak: CsvTable = {
      headers: table.headers.filter((_, i) => i !== drop),
      rows: table.rows.map((row) => row.filter((_, i) => i !== drop)),
    };
    const run = prepareRun(withoutLeak, "precio_usd", 42);
    expect(run.ok).toBe(true);
    expect(run.ok && run.leakage).toEqual([]);
    expect(run.ok && run.payload.task).toBe("numerica");
  });

  it("muy pocas filas: un rechazo honesto propio, no un error del motor (AU-S6-08)", () => {
    // Por la ambigua (≤ 10 enteros) con «Una cantidad»: con 6 filas la prueba se
    // quedaría con 1 (R² inexistente); con 7, ya tiene 2.
    const tiny = (n: number): CsvTable => ({
      headers: ["x", "cat", "y"],
      rows: Array.from({ length: n }, (_, i) => [
        String(i * 3),
        i % 2 ? "a" : "b",
        String(i + 1),
      ]),
    });
    for (const n of [3, 4, 5, 6]) {
      expect(
        prepareRun(tiny(n), "y", 42, { ambiguousChoice: "numerica" }),
        `${n} filas`,
      ).toEqual({ ok: false, error: "too-few-rows-quantity" });
    }
    const seven = prepareRun(tiny(7), "y", 42, { ambiguousChoice: "numerica" });
    expect(seven.ok).toBe(true);
    expect(seven.ok && seven.payload.test_idx.length).toBeGreaterThanOrEqual(
      MIN_REGRESSION_TEST_ROWS,
    );
  });

  it("el mínimo de filas de prueba es el mismo en pipeline.py (tripwire)", () => {
    const python = readFileSync(
      resolve(process.cwd(), "src/lib/ds/pipeline.py"),
      "utf8",
    );
    expect(python).toMatch(
      new RegExp(
        `^MIN_REGRESSION_TEST_ROWS = ${MIN_REGRESSION_TEST_ROWS}$`,
        "m",
      ),
    );
  });

  it("la binaria sigue igual, ahora con `task` explícita", () => {
    const run = prepareRun(kit("marketing-campania.csv"), "convirtio", 42);
    expect(run.ok && run.payload.task).toBe("binaria");
    expect(
      run.ok && run.payload.roster.every((id) => isMemberOf("binaria", id)),
    ).toBe(true);
  });
});

describe("el resultado de regresión se ensambla con lo validado", () => {
  const py = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "tests/fixtures/contrato/train-result-regresion.json",
      ),
      "utf8",
    ),
  ) as RegressionPipelineResult;

  it("veredicto en MAE contra el mejor de mediana y lineal, con la unidad del objetivo", () => {
    const result = assembleRegressionResult(py, [], "consumo_kwh");
    const best = Math.min(py.baselines.median.mae, py.baselines.linear.mae);
    expect(result.verdict.baselineScore).toBe(best);
    expect(result.verdict.modelScore).toBe(py.model.mae);
    expect(result.unit).toEqual({ symbol: "kWh" });
    expect(result.selection).toMatchObject({ by: "cv", metric: "mae" });
  });

  it("las estimaciones se escriben con los decimales del objetivo", () => {
    expect(formatEstimates([412.345, 7], 1)).toEqual(["412.3", "7.0"]);
    expect(formatEstimates([158912.4], 0)).toEqual(["158912"]);
    expect(formatEstimates([1.23456789], 99)).toEqual(["1.234568"]);
  });
});
