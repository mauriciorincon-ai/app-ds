// Agrupar sin objetivo (S7, ADR 016): los motores puros. Cada garantía falla si
// alguien la rompe: la lectura contra la referencia nula y su borde, el ganador
// por consenso (con sus desempates, y las celdas del spike), el tope de k, la
// entrada de agrupar (sin objetivo; columnas excluidas con su razón; la distancia
// numérica con al menos dos numéricas) y el chequeo de esquema sin objetivo.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLUSTER_COST_COEFFICIENTS,
  CLUSTER_READING_COEFFICIENTS,
  estimateMemberSeconds,
  selectionReserveSeconds,
} from "@/engine/costos";
import { clusterEdaAlerts } from "@/engine/eda";
import {
  LEVEL1_CEILING_S,
  planLevel2,
  routeModels,
  type RouteProfile,
} from "@/engine/encarrilador";
import { CLUSTER_MEMBER_IDS, ROSTER_BY_TASK } from "@/engine/roster";
import { sanitizeTable } from "@/engine/sanitize";
import {
  AGGLO_MAX_ROWS,
  CLUSTER_GAP_MIN,
  CLUSTER_K_MAX,
  CLUSTER_K_MIN,
  CLUSTER_MIN_NUMERIC,
  CLUSTER_STABILITY_MIN,
  clusterKCap,
  computeClusterReading,
  selectClusterWinner,
  STABILITY_FRACTION,
  type ClusterRowLike,
} from "@/engine/verdict";
import { parseCsvWithLimits, type CsvTable } from "@/lib/ds/csv";
import { checkSchema } from "@/lib/ds/schema-check";
import { prepareClusterRun } from "@/lib/experiment";
import type { ClusterModelSchema } from "@/workers/protocol";

const kit = (file: string): CsvTable => {
  const parsed = parseCsvWithLimits(
    readFileSync(resolve(process.cwd(), "public/datasets", file), "utf8"),
  );
  if (!parsed.ok) throw new Error(file);
  return sanitizeTable(parsed.table).table;
};

describe("la lectura: «existen» / «frágiles» / «no hay estructura» (decisión 5)", () => {
  it("las constantes del STOP de la F0: gap ≥ 0,10 y ARI medio ≥ 0,7", () => {
    expect(CLUSTER_GAP_MIN).toBe(0.1);
    expect(CLUSTER_STABILITY_MIN).toBe(0.7);
  });

  it("el borde: justo en el umbral cuenta; justo debajo, no", () => {
    expect(computeClusterReading(0.1, 0.7)).toBe("exist");
    expect(computeClusterReading(0.1, 0.6999)).toBe("fragile");
    expect(computeClusterReading(0.0999, 0.99)).toBe("none");
    // Sin gap no importa cuán estable sea: K-Means sobre datos uniformes de una
    // dimensión salió con ARI 0,98 en el spike — la referencia nula lo frena.
    expect(computeClusterReading(0.004, 0.9849)).toBe("none");
  });

  it("las celdas del spike que fijaron la regla (anexo B, solo numéricas)", () => {
    // segmentos-300 (Agglomerative k = 3): gap 0,251, ARI 0,8765 → existen.
    expect(computeClusterReading(0.251, 0.8765)).toBe("exist");
    // sin-grupos-300 (K-Means k = 10): gap −0,029 → no hay estructura.
    expect(computeClusterReading(-0.029, 0.4956)).toBe("none");
    // planes-200 por gap (Agglomerative k = 2): gap 0,207, ARI 0,6848 → frágiles.
    expect(computeClusterReading(0.207, 0.6848)).toBe("fragile");
  });
});

describe("el ganador por consenso (decisión 4)", () => {
  const row = (
    name: string,
    k: number | null,
    score: number | null,
    status = "ok",
  ): ClusterRowLike => ({ name, k, score, status });

  it("segmentos-300 del spike: KM 5 · AG 3 · GMM 3 · HDB 3 ⇒ k = 3 (3 de 4), el de mayor puntaje", () => {
    const winner = selectClusterWinner([
      row("kmeans", 5, 0.507),
      row("agglomerative", 3, 0.481),
      row("gmm", 3, 0.4809),
      row("hdbscan", 3, 0.4805),
    ]);
    expect(winner).toEqual({
      k: 3,
      votes: 3,
      voters: 4,
      winner: "agglomerative",
    });
  });

  it("empate de votos ⇒ el k cuyo mejor miembro tiene más puntaje; luego el k menor", () => {
    expect(
      selectClusterWinner([
        row("kmeans", 4, 0.3),
        row("agglomerative", 4, 0.31),
        row("gmm", 2, 0.4),
        row("hdbscan", 2, 0.2),
      ]),
    ).toEqual({ k: 2, votes: 2, voters: 4, winner: "gmm" });
    expect(
      selectClusterWinner([row("kmeans", 4, 0.3), row("gmm", 2, 0.3)])?.k,
    ).toBe(2);
  });

  it("empate de puntaje dentro del k ⇒ el primero del orden", () => {
    expect(
      selectClusterWinner([row("kmeans", 3, 0.4), row("gmm", 3, 0.4)])?.winner,
    ).toBe("kmeans");
  });

  it("solo votan los `ok`: un no-converge, sin estructura o roto no vota; sin ninguno, null", () => {
    expect(
      selectClusterWinner([
        row("kmeans", 2, 0.2),
        row("gmm", 5, 0.9, "no-converge"),
        row("hdbscan", 0, null, "no-structure"),
        row("agglomerative", null, null, "error"),
      ]),
    ).toEqual({ k: 2, votes: 1, voters: 1, winner: "kmeans" });
    expect(
      selectClusterWinner([row("hdbscan", 1, null, "no-structure")]),
    ).toBeNull();
  });
});

describe("el rango de k", () => {
  it("2..10, acotado para que cada re-muestreo tenga más filas que grupos", () => {
    expect([CLUSTER_K_MIN, CLUSTER_K_MAX]).toEqual([2, 10]);
    expect(clusterKCap(300)).toBe(10);
    // 0,8 × 4 = 3,2 → 3 filas por re-muestreo → a lo sumo 2 grupos.
    expect(clusterKCap(4)).toBe(2);
    expect(clusterKCap(3)).toBeLessThan(CLUSTER_K_MIN);
    expect(Math.floor(STABILITY_FRACTION * 13) - 1).toBe(clusterKCap(13));
  });
});

describe("la entrada de agrupar (P5): prepareClusterRun", () => {
  it("segmentos: sin objetivo; el identificador fuera (saneamiento); distancia numérica", () => {
    const run = prepareClusterRun(kit("segmentos-clientes.csv"), 42);
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    const { payload } = run;
    expect(payload.task).toBe("agrupar");
    expect(payload).not.toHaveProperty("target");
    expect(payload).not.toHaveProperty("train_idx");
    expect(payload.numeric.length).toBeGreaterThanOrEqual(CLUSTER_MIN_NUMERIC);
    expect(payload.distance).toBe("numeric");
    expect(payload.k_range).toEqual([2, 10]);
    expect(payload.rows).toHaveLength(300);
    expect(ROSTER_BY_TASK.agrupar).toEqual(CLUSTER_MEMBER_IDS);
    // Con pocas filas, los cuatro caben en el Nivel 1.
    expect(run.routing.level1).toEqual([...CLUSTER_MEMBER_IDS]);
  });

  it("una columna con pinta de identificador y una fecha quedan fuera, NOMBRADAS con su razón", () => {
    const rows = Array.from({ length: 40 }, (_, i) => [
      `ID-${1000 + i}-x`,
      `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
      String(i % 7),
      String((i * 3) % 11),
      i % 2 ? "a" : "b",
    ]);
    const table: CsvTable = {
      headers: ["codigo", "fecha", "x", "y", "c"],
      rows,
    };
    expect(
      clusterEdaAlerts(table).map((a) => a.kind === "id-like" && a.column),
    ).toEqual(["codigo"]);
    const run = prepareClusterRun(table, 1);
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.excluded).toEqual([
      { column: "codigo", reason: "id-like" },
      { column: "fecha", reason: "date" },
    ]);
    expect(run.payload.numeric).toEqual(["x", "y"]);
    expect(run.payload.categorical).toEqual(["c"]);
  });

  it("con menos de dos numéricas la distancia usa también las categóricas", () => {
    const table: CsvTable = {
      headers: ["x", "c"],
      rows: Array.from({ length: 30 }, (_, i) => [String(i), `c${i % 3}`]),
    };
    const run = prepareClusterRun(table, 1);
    expect(run.ok && run.payload.distance).toBe("all");
  });

  it("sin columnas utilizables ⇒ no-features; con tan pocas filas que no hay dos grupos medibles ⇒ too-few-rows-cluster", () => {
    expect(
      prepareClusterRun(
        { headers: ["fecha"], rows: [["2026-01-01"], ["2026-01-02"]] },
        1,
      ),
    ).toEqual({ ok: false, error: "no-features" });
    expect(
      prepareClusterRun(
        {
          headers: ["x", "y"],
          rows: [
            ["1", "2"],
            ["3", "4"],
            ["5", "6"],
          ],
        },
        1,
      ),
    ).toEqual({ ok: false, error: "too-few-rows-cluster" });
  });
});

describe("el chequeo de esquema al puntuar sin objetivo", () => {
  it("no busca un objetivo que no existe; las columnas de la distancia son las que pide", () => {
    const schema: ClusterModelSchema = {
      numeric: ["x", "y"],
      categorical: [],
      task: "agrupar",
      groups: 2,
      noise: false,
      assign: {
        method: "nearest-centroid",
        centroids: [
          [0, 0],
          [1, 1],
        ],
        radii: null,
        sample_rows: null,
      },
    };
    expect(checkSchema(["x", "z"], schema)).toEqual({
      ok: false,
      missing: ["y"],
      extra: ["z"],
      targetPresent: false,
    });
  });
});

describe("costos y reparto al agrupar (dos partes medidas: barrido + lectura)", () => {
  const profile = (rows: number): RouteProfile => ({
    task: "agrupar",
    rows,
    nTrain: rows,
    width: 5,
    minorityShare: null,
    k: 10,
  });
  const input = (rows: number) => ({ nTrain: rows, width: 5, k: 10 });

  it("los cuatro tienen barrido y lectura", () => {
    for (const table of [CLUSTER_COST_COEFFICIENTS, CLUSTER_READING_COEFFICIENTS])
      expect(Object.keys(table).sort()).toEqual([...CLUSTER_MEMBER_IDS].sort());
  });

  it("un agrupador estima SU barrido; Agglomerative, en modo muestra, no crece pasado AGGLO_MAX_ROWS", () => {
    const { t0, a, b } = CLUSTER_COST_COEFFICIENTS.kmeans;
    expect(estimateMemberSeconds("kmeans", input(2000), "agrupar")).toBeCloseTo(
      t0 + a * 2 ** b,
      12,
    );
    expect(
      estimateMemberSeconds("agglomerative", input(AGGLO_MAX_ROWS * 3), "agrupar"),
    ).toBe(estimateMemberSeconds("agglomerative", input(AGGLO_MAX_ROWS), "agrupar"));
    expect(
      estimateMemberSeconds("hdbscan", input(20_000), "agrupar"),
    ).toBeGreaterThan(estimateMemberSeconds("hdbscan", input(8_000), "agrupar"));
  });

  it("la reserva: la lectura más cara entre los que corren; con objetivo, 0", () => {
    const ids = [...CLUSTER_MEMBER_IDS];
    const reserve = selectionReserveSeconds(ids, input(5000), "agrupar");
    const each = ids.map((id) => selectionReserveSeconds([id], input(5000), "agrupar"));
    expect(reserve).toBe(Math.max(...each));
    for (const task of ["binaria", "multiclase", "numerica"] as const)
      expect(selectionReserveSeconds(["logistic"], input(5000), task)).toBe(0);
  });

  it("con pocas filas los cuatro caben; con 20.000, los de lectura cara pasan al Nivel 2 (nadie queda «fuera»)", () => {
    const small = routeModels(profile(300));
    expect(small.level1).toEqual([...CLUSTER_MEMBER_IDS]);
    expect(small.out).toEqual([]);
    const big = routeModels(profile(20_000));
    expect(big.level1).toEqual(["kmeans", "gmm"]);
    expect(big.level2).toEqual(["agglomerative", "hdbscan"]);
    expect(big.out).toEqual([]);
    // El Nivel 1 suma sus barridos MÁS la lectura más cara posible entre ellos.
    const sweeps = big.level1.reduce(
      (acc, id) => acc + big.placements.find((p) => p.id === id)!.estimateS,
      0,
    );
    expect(big.level1EstimateS).toBeCloseTo(
      sweeps + selectionReserveSeconds(big.level1, input(20_000), "agrupar"),
      12,
    );
    expect(big.level1EstimateS).toBeLessThanOrEqual(LEVEL1_CEILING_S);
  });

  it("el Nivel 2 suma la reserva de la unión si es mayor que lo fijo medido", () => {
    const plan = planLevel2(profile(20_000), ["kmeans", "gmm"], {
      totalMs: 3000,
      membersMs: 2500,
    });
    expect(plan.added).toEqual(["agglomerative", "hdbscan"]);
    // La lectura de HDBSCAN (si gana) es mucho más que los 0,5 s fijos medidos.
    expect(plan.estimateS).toBeGreaterThan(
      selectionReserveSeconds(["hdbscan"], input(20_000), "agrupar") * 0.25,
    );
  });
});
