// Clasificar en VARIAS categorías (S7, ADR 015): los motores puros. Cada garantía
// falla si alguien la rompe: los costos con el factor del número de clases, la
// regla de las balanceadas re-expresada para K clases (idéntica con dos), la
// regla de la exactitud balanceada en UN sitio, la EDA por clase, la partición y
// el payload de prepareRun, el orden de las clases (el de Python) y la plantilla
// local bilingüe.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COST_COEFFICIENTS_BY_TASK,
  estimateMemberSeconds,
  MULTICLASS_COST_COEFFICIENTS,
} from "@/engine/costos";
import { computeEdaAlerts, EDA_IMBALANCE_THRESHOLD } from "@/engine/eda";
import {
  BALANCED_MIN_MINORITY,
  routeModels,
  type RouteProfile,
} from "@/engine/encarrilador";
import { MEMBER_IDS, MEMBERS } from "@/engine/roster";
import { sanitizeTable } from "@/engine/sanitize";
import {
  computeVerdict,
  METRIC_RULES,
  MULTICLASS_PRIMARY_METRIC,
  type MulticlassMetrics,
} from "@/engine/verdict";
import { parseCsvWithLimits, type CsvTable } from "@/lib/ds/csv";
import {
  assembleMulticlassResult,
  bestMulticlassBaseline,
  byCodePoint,
  prepareRun,
  testClassCounts,
} from "@/lib/experiment";
import { buildMulticlassTemplate } from "@/lib/narration/templates";
import type { MulticlassPipelineResult } from "@/workers/protocol";

const kit = (file: string): CsvTable => {
  const parsed = parseCsvWithLimits(
    readFileSync(resolve(process.cwd(), "public/datasets", file), "utf8"),
  );
  if (!parsed.ok) throw new Error(file);
  return sanitizeTable(parsed.table).table;
};

const fixture = <T>(name: string): T =>
  JSON.parse(
    readFileSync(
      resolve(process.cwd(), "tests/fixtures/contrato", `${name}.json`),
      "utf8",
    ),
  ) as T;

describe("costos con varias categorías (anexo A del spike)", () => {
  it("los 14 tienen coeficientes, todos con el exponente del número de clases", () => {
    expect(Object.keys(MULTICLASS_COST_COEFFICIENTS).sort()).toEqual(
      [...MEMBER_IDS].sort(),
    );
    expect(COST_COEFFICIENTS_BY_TASK.multiclase).toBe(
      MULTICLASS_COST_COEFFICIENTS,
    );
    for (const id of MEMBER_IDS) {
      expect(Number.isFinite(MULTICLASS_COST_COEFFICIENTS[id].d), id).toBe(
        true,
      );
    }
  });

  it("con K = 5 (la referencia) el factor es 1; con K = 10 la parte variable crece como 2^d", () => {
    const input = { nTrain: 1500, width: 33, k: 5 };
    const { t0, a, b, d } = MULTICLASS_COST_COEFFICIENTS.logistic;
    const fit = (factor: number, fraction: number) =>
      t0 / 5 + ((a * 1.5 ** b * factor) / 5) * (fraction / 0.8) ** b;
    const at = (factor: number) => 5 * fit(factor, 0.8) + fit(factor, 1);
    expect(
      estimateMemberSeconds("logistic", { ...input, classes: 5 }, "multiclase"),
    ).toBeCloseTo(at(1), 10);
    expect(
      estimateMemberSeconds(
        "logistic",
        { ...input, classes: 10 },
        "multiclase",
      ),
    ).toBeCloseTo(at(2 ** d), 10);
  });

  it("sin el número de clases no se estima (no se supone ninguno)", () => {
    expect(() =>
      estimateMemberSeconds(
        "hgb",
        { nTrain: 1500, width: 33, k: 5 },
        "multiclase",
      ),
    ).toThrow("la multiclase necesita el número de clases");
  });

  it("la binaria ignora `classes` (su costo no cambia)", () => {
    const input = { nTrain: 1500, width: 33, k: 5 };
    expect(
      estimateMemberSeconds("forest", { ...input, classes: 20 }, "binaria"),
    ).toBe(estimateMemberSeconds("forest", input, "binaria"));
  });
});

describe("E2: balanceadas fuera con minoritaria × K ≥ 0,4 × 2 (P7, R12)", () => {
  const BASE: RouteProfile = {
    task: "binaria",
    rows: 200,
    nTrain: 150,
    width: 10,
    minorityShare: 0.3,
    k: 5,
  };
  const balancedOut = (profile: RouteProfile) =>
    routeModels(profile).out.filter((id) => MEMBERS[id].balanced);

  it("con dos clases la regla es IDÉNTICA a la del S5 (barrido de la minoritaria)", () => {
    for (let pct = 0; pct <= 50; pct += 1) {
      const share = pct / 100;
      const old = share >= BALANCED_MIN_MINORITY;
      expect(
        balancedOut({ ...BASE, minorityShare: share }).length > 0,
        `minoritaria ${share}`,
      ).toBe(old);
    }
  });

  it("con K clases: la más chica al 30 % de 3 (0,9 ≥ 0,8) las deja fuera; al 20 % (0,6), dentro", () => {
    const multi = { ...BASE, task: "multiclase" as const, classes: 3 };
    expect(balancedOut({ ...multi, minorityShare: 0.3 })).toEqual([
      "logistic_balanced",
      "forest_balanced",
    ]);
    expect(balancedOut({ ...multi, minorityShare: 0.2 })).toEqual([]);
    // Con 5 clases, la regla vieja (≥ 0,4) no se dispararía nunca: 1/5 = 0,2.
    expect(
      balancedOut({ ...multi, classes: 5, minorityShare: 0.18 }),
    ).toHaveLength(2);
  });

  it("sin el número de clases, la multiclase no se reparte (no se supone ninguno)", () => {
    expect(() => routeModels({ ...BASE, task: "multiclase" })).toThrow(
      "la multiclase necesita el número de clases",
    );
  });
});

describe("la regla de la exactitud balanceada vive en UN sitio", () => {
  const m = (balanced_accuracy: number): MulticlassMetrics => ({
    balanced_accuracy,
    f1_macro: 0.5,
    accuracy: 0.5,
    log_loss: null,
    auc_ovr: null,
  });

  it("mayor es mejor, empate ± 0,01 absoluto (decisiones 1 y 2 del STOP de la F0)", () => {
    expect(MULTICLASS_PRIMARY_METRIC).toBe("balanced_accuracy");
    expect(METRIC_RULES.balanced_accuracy).toBe(METRIC_RULES.auc);
    expect(computeVerdict(m(0.62), m(0.6), "balanced_accuracy").level).toBe(
      "beats",
    );
    expect(computeVerdict(m(0.605), m(0.6), "balanced_accuracy").level).toBe(
      "ties",
    );
    expect(computeVerdict(m(0.55), m(0.6), "balanced_accuracy").level).toBe(
      "loses",
    );
  });

  it("el baseline a batir es el de mayor exactitud balanceada; en empate, la mayoritaria", () => {
    expect(bestMulticlassBaseline({ majority: m(0.2), logistic: m(0.5) })).toBe(
      "logistic",
    );
    expect(bestMulticlassBaseline({ majority: m(0.4), logistic: m(0.4) })).toBe(
      "majority",
    );
  });
});

describe("EDA con varias categorías", () => {
  it("la fuga plantada se nombra con su clase; sin desbalance que avisar en planes", () => {
    const alerts = computeEdaAlerts(
      kit("planes-fuga-plantada.csv"),
      "plan",
      "multiclase",
    );
    const leaks = alerts.filter((a) => a.kind === "possible-leak");
    expect(leaks.map((a) => a.kind === "possible-leak" && a.column)).toEqual([
      "cargo_corporativo_usd",
    ]);
    expect(leaks[0]!.kind === "possible-leak" && leaks[0]!.class).toBe(
      "empresa",
    );
  });

  it("el desbalance mira la clase MÁS CHICA con la frontera re-expresada (cuota × K < 0,15 × 2)", () => {
    const table = (counts: number[]): CsvTable => ({
      headers: ["x", "t"],
      rows: counts.flatMap((n, c) =>
        Array.from({ length: n }, (_, i) => [String(i), `c${c}`]),
      ),
    });
    // 3 clases, la más chica 9 de 100: 0,09 × 3 = 0,27 < 0,30 ⇒ aviso, nombrándola.
    const alert = computeEdaAlerts(table([46, 45, 9]), "t", "multiclase").find(
      (a) => a.kind === "class-imbalance",
    );
    expect(alert).toEqual({
      kind: "class-imbalance",
      minorityRate: 0.09,
      class: "c2",
    });
    // 11 de 100: 0,33 ≥ 0,30 ⇒ sin aviso.
    expect(
      computeEdaAlerts(table([45, 44, 11]), "t", "multiclase").some(
        (a) => a.kind === "class-imbalance",
      ),
    ).toBe(false);
    expect(EDA_IMBALANCE_THRESHOLD).toBe(0.15);
  });

  // S7 (AU-S7-29): con dos clases igual de chicas se nombra la primera en el orden de Python
  // (por punto de código): «ﬀ» antes que el emoji, como en la partición y la fuga.
  it("con un empate de la más chica nombra la clase en el orden de Python", () => {
    const rows = [
      ...Array.from({ length: 90 }, (_, i) => [String(i), "grande"]),
      ...Array.from({ length: 5 }, (_, i) => [String(i), "😀"]),
      ...Array.from({ length: 5 }, (_, i) => [String(i), "ﬀ"]),
    ];
    const alert = computeEdaAlerts(
      { headers: ["x", "t"], rows },
      "t",
      "multiclase",
    ).find((a) => a.kind === "class-imbalance");
    expect(alert && "class" in alert ? alert.class : null).toBe("ﬀ");
  });
});

describe("prepareRun con varias categorías", () => {
  it("planes: clases en orden, exactitud balanceada, k por la clase más chica de train, sin fuga", () => {
    const run = prepareRun(kit("planes-suscripcion.csv"), "plan", 42);
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.payload.task).toBe("multiclase");
    expect(run.payload.primary_metric).toBe("balanced_accuracy");
    expect(run.payload.classes).toEqual([
      "basico",
      "empresa",
      "estandar",
      "estudiante",
      "premium",
    ]);
    expect(run.profile.classes).toBe(5);
    expect(run.leakage).toEqual([]);
    const counts = testClassCounts(run.payload);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(run.payload.test_idx.length);
    expect(counts.every((n) => n > 0)).toBe(true);
  });

  it("la fuga plantada se marca nombrando la columna y la clase", () => {
    const run = prepareRun(kit("planes-fuga-plantada.csv"), "plan", 42);
    expect(run.ok && run.leakage.map((f) => [f.column, f.class])).toEqual([
      ["cargo_corporativo_usd", "empresa"],
    ]);
  });

  // S7 (AU-S7-11): una columna que delata la clase «a» SOLO en las filas de train (en las de
  // prueba es azar). Medida sobre train, se marca; medida sobre todas las filas, su AUC baja y
  // no se marca. Así esta prueba cae si la fuga dejara de medirse solo en train.
  it("la fuga se mide SOLO en train: una columna perfecta en train y azar en prueba se marca", () => {
    const n = 90;
    const t = Array.from({ length: n }, (_, i) => ["a", "b", "c"][i % 3]!);
    const ruido = (i: number) => String((i * 37 + 11) % 200);
    const base: CsvTable = {
      headers: ["z", "t"],
      rows: t.map((c, i) => [ruido(i * 7), c]),
    };
    const first = prepareRun(base, "t", 42);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const train = new Set(first.payload.train_idx);
    const table: CsvTable = {
      headers: ["z", "x", "t"],
      rows: t.map((c, i) => [
        ruido(i * 7),
        train.has(i) ? (c === "a" ? "500" : "0") : ruido(i),
        c,
      ]),
    };
    const run = prepareRun(table, "t", 42);
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.payload.train_idx).toEqual(first.payload.train_idx);
    expect(
      run.leakage.map((f) => [f.column, f.class]),
      "la columna que delata «a» solo en train no se marcó: ¿la fuga se mide con todas las filas?",
    ).toEqual([["x", "a"]]);
  });

  it("«1» y «1.0» en una columna de pocas cifras ⇒ se nombra la notación (AU-S5-10)", () => {
    const rows = Array.from({ length: 60 }, (_, i) => [
      String(i),
      ["1", "2", "3", "1.0"][i % 4]!,
    ]);
    expect(
      prepareRun({ headers: ["x", "t"], rows }, "t", 1, {
        ambiguousChoice: "multiclase",
      }),
    ).toEqual({ ok: false, error: "target-mixed-notation" });
  });
});

describe("el orden de las clases es el de Python (punto de código)", () => {
  it("coincide con `sorted()` también fuera del plano básico", () => {
    // UTF-16 pondría el emoji (sustitutos D83D…) antes que «ﬀ» (U+FB00).
    expect(["😀", "ﬀ", "b", "B", "á"].sort(byCodePoint)).toEqual([
      "B",
      "b",
      "á",
      "ﬀ",
      "😀",
    ]);
  });
});

describe("la plantilla local de varias categorías (P10: la IA no la narra)", () => {
  const py = fixture<MulticlassPipelineResult>("train-result-multiclase");
  const result = assembleMulticlassResult(py, [
    {
      column: "cargo_corporativo_usd",
      score: 1,
      reason: "near-perfect-separation",
      class: "empresa",
    },
  ]);

  it("dice la métrica, lo que da adivinar con K clases, y la fuga con su clase — ES y EN", () => {
    const es = buildMulticlassTemplate({ result, locale: "es" });
    expect(es).toContain("exactitud balanceada");
    expect(es).toContain("Con 5 categorías, adivinar da 0.20");
    expect(es).toContain("cargo_corporativo_usd (categoría «empresa»)");
    const en = buildMulticlassTemplate({ result, locale: "en" });
    expect(en).toContain("balanced accuracy");
    expect(en).toContain("With 5 categories, guessing gives 0.20");
    expect(en).toContain("cargo_corporativo_usd (category “empresa”)");
  });

  it("no habla de «la clase positiva» ni de una dirección única", () => {
    for (const locale of ["es", "en"] as const) {
      const text = buildMulticlassTemplate({ result, locale });
      expect(text).not.toMatch(/positiv/i);
    }
  });

  it("nombra la categoría más chica cuando hay desbalance", () => {
    const text = buildMulticlassTemplate({
      result,
      locale: "es",
      edaAlerts: [
        { kind: "class-imbalance", minorityRate: 0.05, class: "estudiante" },
      ],
    });
    expect(text).toContain("La categoría más chica, «estudiante», es el 5\u00a0%");
  });
});
