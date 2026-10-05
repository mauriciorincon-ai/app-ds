// El roster de la liga (S5): paridad de ids TS ↔ pipeline.py (tripwire de texto,
// como null-token-parity; la paridad en el runtime real vive en liga.test.ts) y la
// regla de un error estándar, espejo exacto de select_one_se.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_MEMBER_IDS,
  BASELINE_IDS,
  CLUSTER_MEMBER_IDS,
  byPriority,
  isMemberId,
  MEMBER_IDS,
  MEMBERS,
  REGRESSION_MEMBER_IDS,
  selectOneSe,
  type CvRowLike,
  type MemberId,
} from "@/engine/roster";
import { MULTICLASS_MAX_CLASSES, MULTICLASS_MIN_CLASSES } from "@/engine/tarea";
import {
  AGGLO_MAX_ROWS,
  CLUSTER_GAP_MIN,
  CLUSTER_K_MAX,
  CLUSTER_K_MIN,
  CLUSTER_MIN_NUMERIC,
  CLUSTER_STABILITY_MIN,
  HDBSCAN_MIN_CLUSTER_SIZE,
  HDBSCAN_ROWS_PER_MIN_CLUSTER,
  METRIC_RULES,
  MULTICLASS_PRIMARY_METRIC,
  SEPARATING_TOP,
  SILHOUETTE_SAMPLE,
  STABILITY_FRACTION,
  STABILITY_RUNS,
} from "@/engine/verdict";
import {
  PRED_VS_REAL_MAX,
  SCORER,
  TARGET_DECIMALS_MAX,
} from "@/workers/contract";

const PIPELINE_PY = readFileSync(
  resolve(__dirname, "../../src/lib/ds/pipeline.py"),
  "utf8",
);

describe("paridad del roster TS ↔ Python", () => {
  it("pipeline.py declara EXACTAMENTE los ids de MEMBER_IDS en _FACTORIES", () => {
    const block = PIPELINE_PY.slice(
      PIPELINE_PY.indexOf("_FACTORIES = {"),
      PIPELINE_PY.indexOf("\n}\n", PIPELINE_PY.indexOf("_FACTORIES = {")),
    );
    const pythonIds = [...block.matchAll(/^ {4}"([a-z_]+)":/gm)].map(
      (m) => m[1],
    );
    expect(new Set(pythonIds)).toEqual(new Set(MEMBER_IDS));
    expect(pythonIds).toHaveLength(MEMBER_IDS.length);
  });

  it("cada miembro tiene su ficha de app (familia, base, probabilidades)", () => {
    // S6: MEMBERS cubre el espacio de ids de las dos tareas.
    expect(Object.keys(MEMBERS).sort()).toEqual([...ALL_MEMBER_IDS].sort());
    for (const id of ALL_MEMBER_IDS) {
      expect(isMemberId(MEMBERS[id].base)).toBe(true);
      // Una variante balanceada comparte la ficha de su base (D4).
      if (MEMBERS[id].balanced) expect(MEMBERS[id].base).not.toBe(id);
    }
    expect(MEMBERS.ridge.probabilities).toBe(false);
    expect(MEMBERS.linear_svc.probabilities).toBe(false);
    expect(BASELINE_IDS).toEqual(["majority", "logistic"]);
  });

  it("SCORER de pipeline.py tiene las mismas parejas métrica → scorer que contract.ts", () => {
    const block = PIPELINE_PY.slice(
      PIPELINE_PY.indexOf("SCORER = {"),
      PIPELINE_PY.indexOf("\n}\n", PIPELINE_PY.indexOf("SCORER = {")),
    );
    const pairs = Object.fromEntries(
      // S7: las claves llevan «_» (balanced_accuracy): el patrón viejo no las veía.
      [...block.matchAll(/^ {4}"([a-z0-9_]+)": "([a-z0-9_]+)",$/gm)].map((m) => [
        m[1],
        m[2],
      ]),
    );
    expect(pairs).toEqual(SCORER);
  });

  // S6: tripwires de texto de la regresión (la paridad en el runtime real vive en
  // tests/integration/regresion.test.ts).
  it("pipeline.py declara EXACTAMENTE los ids de REGRESSION_MEMBER_IDS en _REGRESSORS", () => {
    const start = PIPELINE_PY.indexOf("_REGRESSORS = {");
    const block = PIPELINE_PY.slice(start, PIPELINE_PY.indexOf("\n}\n", start));
    const pythonIds = [...block.matchAll(/^ {4}"([a-z_]+)":/gm)].map(
      (m) => m[1],
    );
    expect(pythonIds).toEqual([...REGRESSION_MEMBER_IDS]);
  });

  it("METRIC_DIRECTION de pipeline.py es la dirección de METRIC_RULES", () => {
    const start = PIPELINE_PY.indexOf("METRIC_DIRECTION = {");
    const block = PIPELINE_PY.slice(start, PIPELINE_PY.indexOf("\n}\n", start));
    const pairs = Object.fromEntries(
      [...block.matchAll(/^ {4}"([a-z0-9_]+)": "(higher|lower)",$/gm)].map(
        (m) => [m[1], m[2]],
      ),
    );
    expect(pairs).toEqual(
      Object.fromEntries(
        Object.entries(METRIC_RULES).map(([k, rule]) => [k, rule.direction]),
      ),
    );
  });

  it("los topes del contrato son los mismos en los dos lados", () => {
    expect(PIPELINE_PY).toMatch(
      new RegExp(`^PRED_VS_REAL_MAX = ${PRED_VS_REAL_MAX}$`, "m"),
    );
    expect(PIPELINE_PY).toMatch(
      new RegExp(`^TARGET_DECIMALS_MAX = ${TARGET_DECIMALS_MAX}$`, "m"),
    );
    // S7: cuántas clases son «varias categorías», en los dos lados.
    expect(PIPELINE_PY).toMatch(
      new RegExp(`^MULTICLASS_MIN_CLASSES = ${MULTICLASS_MIN_CLASSES}$`, "m"),
    );
    expect(PIPELINE_PY).toMatch(
      new RegExp(`^MULTICLASS_MAX_CLASSES = ${MULTICLASS_MAX_CLASSES}$`, "m"),
    );
  });

  it("S7: pipeline.py declara EXACTAMENTE los agrupadores de CLUSTER_MEMBER_IDS, en su orden", () => {
    const start = PIPELINE_PY.indexOf("_CLUSTERERS = {");
    const block = PIPELINE_PY.slice(start, PIPELINE_PY.indexOf("\n}\n", start));
    const pythonIds = [...block.matchAll(/^ {4}"([a-z_]+)":/gm)].map((m) => m[1]);
    expect(pythonIds).toEqual([...CLUSTER_MEMBER_IDS]);
  });

  it("S7: las constantes de agrupar son las mismas en los dos lados (STOP de la F0)", () => {
    const pairs: [string, number][] = [
      ["CLUSTER_K_MIN", CLUSTER_K_MIN],
      ["CLUSTER_K_MAX", CLUSTER_K_MAX],
      ["CLUSTER_MIN_NUMERIC", CLUSTER_MIN_NUMERIC],
      ["HDBSCAN_MIN_CLUSTER_SIZE", HDBSCAN_MIN_CLUSTER_SIZE],
      ["HDBSCAN_ROWS_PER_MIN_CLUSTER", HDBSCAN_ROWS_PER_MIN_CLUSTER],
      ["SILHOUETTE_SAMPLE", SILHOUETTE_SAMPLE],
      ["STABILITY_RUNS", STABILITY_RUNS],
      ["STABILITY_FRACTION", STABILITY_FRACTION],
      ["CLUSTER_GAP_MIN", CLUSTER_GAP_MIN],
      ["CLUSTER_STABILITY_MIN", CLUSTER_STABILITY_MIN],
      ["AGGLO_MAX_ROWS", AGGLO_MAX_ROWS],
      ["SEPARATING_TOP", SEPARATING_TOP],
    ];
    for (const [name, value] of pairs) {
      const match = new RegExp(`^${name} = ([0-9.]+)$`, "m").exec(PIPELINE_PY);
      expect(match, `${name} en pipeline.py`).not.toBeNull();
      expect(Number(match![1]), name).toBe(value);
    }
  });

  it("S7: con varias categorías Python solo admite la primaria que eligió TS", () => {
    expect(PIPELINE_PY).toContain(
      `"multiclase": ("${MULTICLASS_PRIMARY_METRIC}",),`,
    );
  });

  it("isMemberId y byPriority", () => {
    expect(isMemberId("xgboost")).toBe(true);
    expect(isMemberId("majority")).toBe(false);
    expect(isMemberId(3)).toBe(false);
    expect(byPriority(["mlp", "logistic", "hgb", "logistic"])).toEqual([
      "logistic",
      "hgb",
      "mlp",
    ]);
  });
});

function row(
  name: MemberId,
  mean: number,
  std = 0.02,
  status: CvRowLike["status"] = "ok",
): CvRowLike {
  return { name, status, cv: status === "error" ? null : { mean, std } };
}

describe("selectOneSe — regla de un error estándar (D8)", () => {
  it("gana el más simple dentro de un EE del mejor (el caso de rotación en la F0)", () => {
    // NB tiene el máximo (0,720) con EE 0,0405 ⇒ umbral 0,6795: la logística
    // (0,707), primera del orden, queda dentro y gana.
    const league = [
      row("logistic", 0.707),
      row("naive_bayes", 0.72, 0.0405 * Math.sqrt(5)),
      row("forest", 0.701),
    ];
    const selection = selectOneSe(league, 5, "higher")!;
    expect(selection).toMatchObject({
      best: "naive_bayes",
      winner: "logistic",
    });
    expect(selection.se).toBeCloseTo(0.0405, 10);
  });

  it("si nadie queda dentro del EE, gana el mejor", () => {
    const league = [row("logistic", 0.6), row("hgb", 0.8, 0.01)];
    expect(selectOneSe(league, 5, "higher")!.winner).toBe("hgb");
  });

  it("empate exacto en el máximo ⇒ el primero del orden", () => {
    const league = [row("ridge", 0.75, 0), row("hgb", 0.75, 0)];
    expect(selectOneSe(league, 5, "higher")).toMatchObject({
      best: "ridge",
      winner: "ridge",
    });
  });

  it("solo compiten los «ok»: no-converge y error se muestran pero no ganan solos", () => {
    const league = [
      row("logistic", 0.9, 0.01, "no-converge"),
      row("knn", 0, 0, "error"),
      row("hgb", 0.7, 0.01),
    ];
    expect(selectOneSe(league, 5, "higher")).toMatchObject({
      best: "hgb",
      winner: "hgb",
    });
  });

  it("nadie concluyó ⇒ null (la app no inventa un ganador)", () => {
    expect(selectOneSe([row("knn", 0, 0, "error")], 5, "higher")).toBeNull();
    expect(selectOneSe([], 5, "higher")).toBeNull();
  });
});
