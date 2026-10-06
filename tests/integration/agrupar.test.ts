// @vitest-environment node
//
// Agrupar sin objetivo (S7, ADR 016) en el Pyodide REAL, cargado como en el
// navegador. Garantías que estos tests hacen FALLAR si se rompen:
//  - paridad TS ↔ Python del roster de agrupadores;
//  - cada agrupador corre y su k es reproducible con la semilla;
//  - los 3 grupos plantados de `segmentos` dan k = 3 y «los grupos existen»; el
//    ruido de `sin-grupos` da «no hay estructura» (la referencia nula, decisión 5);
//  - HDBSCAN deja filas «fuera de todo grupo» y puntuar lo respeta;
//  - Agglomerative con más de AGGLO_MAX_ROWS filas se ajusta sobre una muestra, y
//    lo declara en su fila, en la regla y en el esquema;
//  - fit_member reproduce la fila de su agrupador (mismo k, mismo puntaje);
//  - ninguna etiqueta por fila viaja en el resultado, el esquema ni el archivo:
//    solo `cluster_labels` las entrega (P13);
//  - export → import → puntuar con K-Means y con HDBSCAN: mismos grupos;
//  - el lector TS → Python (_cluster_validate) rechaza cada carnada nombrando el
//    campo («detectó k de n»);
//  - el cruce prepareClusterRun → Pyodide → contract.ts → assembleClusterResult →
//    fit_member → applyClusterMemberFit;
//  - el emisor escribe los fixtures de agrupar (CONTRATO_ACTUALIZAR=1).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PyodideInterface } from "pyodide";
import { CLUSTER_MEMBER_IDS, type MemberId } from "@/engine/roster";
import { sanitizeTable } from "@/engine/sanitize";
import { AGGLO_MAX_ROWS, computeClusterReading } from "@/engine/verdict";
import { parseCsvWithLimits } from "@/lib/ds/csv";
import {
  applyClusterMemberFit,
  assembleClusterResult,
  clusterSent,
  clusterSentOf,
  prepareClusterRun,
} from "@/lib/experiment";
import {
  pythonContractField,
  validateClusterLabels,
  validateClusterMemberFit,
  validateClusterResult,
  validateClusterScore,
  validateExportResult,
  validateProgressDetail,
} from "@/workers/contract";
import type {
  ClusterMemberFitResult,
  ClusterModelSchema,
  ClusterPayload,
  ClusterPipelineResult,
  ClusterScoreResult,
  ExportResult,
} from "@/workers/protocol";
import { nubes } from "../../scripts/spike-agrupar/datos.mjs";
import { loadRuntime, pyFunction } from "./runtime";

let py: PyodideInterface;
let runExperiment: (
  payload: string,
  onProgress?: (d: string) => void,
) => string;
let fitMember: (payload: string) => string;
let scoreNewData: (payload: string) => string;
let exportModel: (payload?: string) => string;
let importModel: (payload: string) => string;
let resetModel: (payload?: string) => string;
let clusterLabels: (payload?: string) => string;

beforeAll(async () => {
  py = await loadRuntime();
  runExperiment = pyFunction(py, "run_experiment");
  fitMember = pyFunction(py, "fit_member");
  scoreNewData = pyFunction(py, "score_new_data");
  exportModel = pyFunction(py, "export_model");
  importModel = pyFunction(py, "import_model");
  resetModel = pyFunction(py, "reset_model");
  clusterLabels = pyFunction(py, "cluster_labels");
}, 300_000);

const kitCsv = (file: string) =>
  readFileSync(resolve(process.cwd(), "public/datasets", file), "utf8");

/** Por el camino REAL de la app: parse → saneamiento → prepareClusterRun. */
function prepared(
  csv: string,
  roster: readonly MemberId[] = CLUSTER_MEMBER_IDS,
) {
  const parsed = parseCsvWithLimits(csv);
  if (!parsed.ok) throw new Error(`parse: ${parsed.error.kind}`);
  const run = prepareClusterRun(sanitizeTable(parsed.table).table, 42);
  if (!run.ok) throw new Error(`prepare: ${run.error}`);
  return { ...run, payload: { ...run.payload, roster: [...roster] } };
}

const league = (payload: ClusterPayload, onProgress?: (d: string) => void) =>
  JSON.parse(
    runExperiment(JSON.stringify(payload), onProgress),
  ) as ClusterPipelineResult;

const memberPayload = (payload: ClusterPayload, member: MemberId) => {
  const copy: Partial<ClusterPayload> = { ...payload };
  delete copy.roster;
  return { ...copy, member };
};

const segmentos = () => prepared(kitCsv("segmentos-clientes.csv"));
/** Las filas de las columnas de la distancia (lo que se puntúa). */
const scoreRows = (
  payload: ClusterPayload,
  schema: ClusterModelSchema,
  rows: number[],
) => {
  const features = [...schema.numeric, ...schema.categorical];
  const idx = features.map((f) => payload.headers.indexOf(f));
  return {
    headers: features,
    rows: rows.map((i) => idx.map((j) => payload.rows[i]![j]!)),
  };
};

describe("paridad TS ↔ Python en el runtime real (agrupar)", () => {
  it("pipeline.py conoce EXACTAMENTE los agrupadores de engine/roster.ts", () => {
    const ids = JSON.parse(
      pyFunction(py, "roster_ids")(JSON.stringify({ task: "agrupar" })),
    ) as string[];
    expect(ids).toEqual([...CLUSTER_MEMBER_IDS].sort());
  });
});

describe("la lectura contra la referencia nula (decisión 5 del STOP de la F0)", () => {
  it("segmentos: los 3 grupos plantados dan k = 3 por consenso y «los grupos existen»", () => {
    const run = segmentos();
    const details: unknown[] = [];
    const result = league(run.payload, (d) => details.push(JSON.parse(d)));
    expect(details.map(validateProgressDetail).every((c) => c.ok)).toBe(true);
    expect(validateClusterResult(result, clusterSent(run.payload)).ok).toBe(
      true,
    );
    expect(result.consensus.k).toBe(3);
    expect(result.reading.level).toBe("exist");
    expect(result.profiles.groups).toHaveLength(3);
    // El identificador del cliente no forma parte (lo saca el saneamiento) y la
    // categórica solo describe: con 3 numéricas, la distancia es numérica.
    expect(result.distance).toBe("numeric");
  });

  it("sin-grupos: «no hay estructura» (el ganador no supera a su referencia nula)", () => {
    const run = prepared(kitCsv("sin-grupos.csv"));
    const result = league(run.payload);
    expect(validateClusterResult(result, clusterSent(run.payload)).ok).toBe(
      true,
    );
    expect(result.reading.level).toBe("none");
    expect(result.reading.gap).toBeLessThan(0.1);
  });

  it("el k y el puntaje son reproducibles con la semilla (dos corridas, la misma liga)", () => {
    const run = segmentos();
    const strip = (r: ClusterPipelineResult) =>
      r.league.map((row) => ({ ...row, elapsed_ms: 0 }));
    const a = league(run.payload);
    const b = league(run.payload);
    expect(strip(a)).toEqual(strip(b));
    expect(a.reading).toEqual(b.reading);
    expect(a.profiles).toEqual(b.profiles);
  });
});

describe("cada agrupador en el runtime real", () => {
  it("los cuatro corren sobre nulos y categóricas; uno roto no tumba la liga y solo viaja el TIPO", () => {
    const run = prepared(kitCsv("consumo-energia.csv"));
    py.runPython(`
_REAL_GMM = _CLUSTERERS["gmm"]
def _broken(ctx):
    raise ValueError("valor-secreto-del-dataset 4321")
_CLUSTERERS["gmm"] = _broken
`);
    let result: ClusterPipelineResult;
    try {
      result = league(run.payload);
    } finally {
      py.runPython(`_CLUSTERERS["gmm"] = _REAL_GMM`);
    }
    const broken = result.league.find((r) => r.name === "gmm")!;
    expect(broken.status).toBe("error");
    expect(broken.error_type).toBe("ValueError");
    expect(JSON.stringify(result)).not.toContain("valor-secreto");
    expect(result.winner).not.toBe("gmm");
    for (const row of result.league.filter((r) => r.name !== "gmm"))
      expect(row.status, row.name).not.toBe("error");
    expect(validateClusterResult(result, clusterSent(run.payload)).ok).toBe(
      true,
    );
  });

  it("fit_member reproduce la fila de cada agrupador (mismo k, mismo puntaje)", () => {
    const run = segmentos();
    const result = league(run.payload);
    const sent = clusterSent(run.payload);
    for (const row of result.league.filter((r) => r.status === "ok")) {
      const fit = JSON.parse(
        fitMember(JSON.stringify(memberPayload(run.payload, row.name))),
      ) as ClusterMemberFitResult;
      const checked = validateClusterMemberFit(fit, {
        ...sent,
        member: row.name,
        row,
      });
      expect(checked.ok, row.name).toBe(true);
      expect(fit.k).toBe(row.k);
      expect(fit.score).toBe(row.score);
    }
  });
});

describe("HDBSCAN: «fuera de todo grupo»", () => {
  it("deja filas fuera de todo grupo, y puntuar respeta su radio", () => {
    const run = prepared(nubes({ n: 1_200, seed: 804 }));
    const fit = JSON.parse(
      fitMember(JSON.stringify(memberPayload(run.payload, "hdbscan"))),
    ) as ClusterMemberFitResult;
    expect(fit.profiles.noise?.size ?? 0).toBeGreaterThan(0);
    expect(fit.assignment.method).toBe("centroid-radius");
    const exported = JSON.parse(exportModel("{}")) as ExportResult;
    const schema = exported.schema as ClusterModelSchema;
    expect(schema.noise).toBe(true);
    // Una fila conocida y una absurdamente lejos de todo grupo.
    const payload = scoreRows(run.payload, schema, [0]);
    payload.rows.push(
      payload.headers.map((h) =>
        schema.numeric.includes(h)
          ? "1000000"
          : payload.rows[0]![payload.headers.indexOf(h)]!,
      ),
    );
    const score = JSON.parse(
      scoreNewData(JSON.stringify(payload)),
    ) as ClusterScoreResult;
    expect(validateClusterScore(score, schema).ok).toBe(true);
    expect(score.predictions[1]).toBe(-1);
    expect(score.probabilities).toBeNull();
  });
});

/** Tres nubes 2D que se solapan (separación 1,8): HDBSCAN deja mucho ruido. Generador
 *  sembrado, como la sonda del auditor B (AU-S7-02). */
function nubesSolapadas(n: number): string {
  let a = 1_000 + n;
  const rng = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () =>
    Math.sqrt(-2 * Math.log(Math.max(rng(), 1e-12))) *
    Math.cos(2 * Math.PI * rng());
  const lines = ["x,y"];
  for (let i = 0; i < n; i++) {
    const g = i % 3;
    lines.push(
      `${(g * 1.8 + gauss()).toFixed(4)},${((g % 2) * 1.8 + gauss()).toFixed(4)}`,
    );
  }
  return lines.join("\n");
}

describe("HDBSCAN: la referencia nula con su propia regla de tamaño (decisión 1 de la Fase 2)", () => {
  // S7 (AU-S7-02): con más de 2.000 filas, la nula se mide sobre la muestra de la silueta. Con
  // el tamaño mínimo del TOTAL (n/50) no encontraba ningún grupo y valía 0: la lectura
  // «existen» se daba sin comparar contra datos sin estructura.
  it("con 6.000 filas, la nula de HDBSCAN no vale 0 y la lectura sale de ella", () => {
    const run = prepared(nubesSolapadas(6_000));
    const fit = JSON.parse(
      fitMember(JSON.stringify(memberPayload(run.payload, "hdbscan"))),
    ) as ClusterMemberFitResult;
    expect(fit.score, "HDBSCAN no encontró grupos en las nubes").not.toBeNull();
    expect(
      fit.reading.null_score,
      "la referencia nula de HDBSCAN vale 0 con más de 2.000 filas",
    ).toBeGreaterThan(0);
    expect(fit.reading.level).toBe(
      computeClusterReading(fit.reading.gap, fit.reading.stability.ari_mean),
    );
  });

  // S7 (AU-S7-30): menos filas que el tamaño mínimo de un grupo (5): todo queda fuera de
  // todo grupo, «sin estructura», en vez de un error.
  it("con 4 filas, HDBSCAN dice «sin estructura» y no «error»", () => {
    const run = prepared("x,y\n0,0\n0,1\n5,5\n5,6", ["kmeans", "hdbscan"]);
    const result = league(run.payload);
    const row = result.league.find((r) => r.name === "hdbscan")!;
    expect(row.status, `HDBSCAN con 4 filas: ${row.error_type}`).toBe(
      "no-structure",
    );
    expect(row.sizes).toEqual([]);
    expect(row.noise_share).toBe(1);
  });
});

describe("Agglomerative en modo muestra (decisión 8 del STOP de la F0)", () => {
  it(`con más de ${AGGLO_MAX_ROWS} filas se ajusta sobre una muestra de ${AGGLO_MAX_ROWS} y lo declara`, () => {
    const run = prepared(nubes({ n: AGGLO_MAX_ROWS + 1_000, seed: 811 }), [
      "kmeans",
      "agglomerative",
    ]);
    const result = league(run.payload);
    expect(validateClusterResult(result, clusterSent(run.payload)).ok).toBe(
      true,
    );
    const agglo = result.league.find((r) => r.name === "agglomerative")!;
    expect(agglo.sample_rows).toBe(AGGLO_MAX_ROWS);
    // Sus grupos cubren TODAS las filas (las de fuera de la muestra, al más cercano).
    expect(agglo.sizes!.reduce((a, b) => a + b, 0)).toBe(result.n_rows);
    const fit = JSON.parse(
      fitMember(JSON.stringify(memberPayload(run.payload, "agglomerative"))),
    ) as ClusterMemberFitResult;
    expect(fit.assignment.sample_rows).toBe(AGGLO_MAX_ROWS);
    const exported = JSON.parse(exportModel("{}")) as ExportResult;
    expect((exported.schema as ClusterModelSchema).assign.sample_rows).toBe(
      AGGLO_MAX_ROWS,
    );
  });
});

describe("P13: las etiquetas por fila no viajan", () => {
  it("ni en el resultado, ni en el esquema, ni en el archivo: solo cluster_labels las da", () => {
    const run = segmentos();
    const result = league(run.payload);
    const text = JSON.stringify(result);
    expect(text).not.toContain('"labels"');
    const exported = JSON.parse(exportModel("{}")) as ExportResult;
    expect(JSON.stringify(exported.schema)).not.toContain('"labels"');
    const labels = JSON.parse(clusterLabels("{}"));
    const schema = exported.schema as ClusterModelSchema;
    expect(
      validateClusterLabels(labels, {
        n_rows: result.n_rows,
        groups: schema.groups,
        noise: schema.noise,
      }).ok,
    ).toBe(true);
    // Un modelo importado no trae las etiquetas de su entrenamiento.
    resetModel();
    importModel(
      JSON.stringify({
        payload_b64: exported.payload_b64,
        expected_schema: exported.schema,
      }),
    );
    expect(() => clusterLabels("{}")).toThrow(/no-labels/);
  });
});

describe("export → import → puntuar al agrupar", () => {
  it.each(["kmeans", "hdbscan", "gmm"] as MemberId[])(
    "con %s: los mismos grupos antes y después",
    (member) => {
      const run = segmentos();
      JSON.parse(fitMember(JSON.stringify(memberPayload(run.payload, member))));
      const exported = JSON.parse(exportModel("{}")) as ExportResult;
      expect(validateExportResult(exported).ok).toBe(true);
      const schema = exported.schema as ClusterModelSchema;
      const rows = scoreRows(run.payload, schema, [0, 5, 10, 50, 100, 200]);
      const before = JSON.parse(
        scoreNewData(JSON.stringify(rows)),
      ) as ClusterScoreResult;
      expect(validateClusterScore(before, schema).ok).toBe(true);
      resetModel();
      importModel(
        JSON.stringify({
          payload_b64: exported.payload_b64,
          expected_schema: exported.schema,
        }),
      );
      const after = JSON.parse(scoreNewData(JSON.stringify(rows)));
      expect(after).toEqual(before);
      // Solo la mezcla gaussiana da una probabilidad.
      expect(before.probabilities === null).toBe(member !== "gmm");
    },
  );
});

describe("TS → Python: _cluster_validate rechaza cada carnada de agrupar NOMBRANDO el campo", () => {
  type Bait = [
    field: string,
    fn: "train" | "fit",
    mutate: (p: Record<string, unknown>) => void,
  ];

  it("detecta las carnadas (sin objetivo ni partición, roster, k, estabilidad, distancia, miembro)", () => {
    const base = segmentos().payload;
    const baits: Bait[] = [
      ["task", "train", (p) => (p.task = "serie-tiempo")],
      // Agrupar no tiene objetivo ni prueba: si llegan, se nombran.
      ["target", "train", (p) => (p.target = base.headers[1])],
      ["train_idx", "train", (p) => (p.train_idx = [0, 1, 2])],
      ["test_idx", "train", (p) => (p.test_idx = [3, 4])],
      ["primary_metric", "train", (p) => (p.primary_metric = "auc")],
      ["cv_k", "train", (p) => (p.cv_k = 5)],
      ["classes", "train", (p) => (p.classes = ["a", "b", "c"])],
      ["roster", "train", (p) => (p.roster = ["kmeans", "logistic"])],
      ["roster", "train", (p) => (p.roster = [])],
      ["k_range", "train", (p) => (p.k_range = [1, 10])],
      ["k_range", "train", (p) => (p.k_range = [5, 3])],
      ["k_range", "train", (p) => (p.k_range = [2, 11])],
      ["stability_runs", "train", (p) => (p.stability_runs = 5)],
      // Con 3 numéricas la distancia es numérica: «all» la contradice.
      ["distance", "train", (p) => (p.distance = "all")],
      ["numeric", "train", (p) => (p.numeric = ["no-existe"])],
      ["member", "fit", (p) => (p.member = "logistic")],
    ];
    const missed: string[] = [];
    for (const [field, fn, mutate] of baits) {
      const copy: Record<string, unknown> =
        fn === "train"
          ? structuredClone({ ...base, roster: ["kmeans"] })
          : structuredClone(memberPayload(base, "kmeans"));
      mutate(copy);
      let got: string | null = "aceptada";
      try {
        (fn === "train" ? runExperiment : fitMember)(JSON.stringify(copy));
      } catch (error) {
        got = pythonContractField(String((error as Error).message));
      }
      if (got !== field) missed.push(`${fn}:${field} → ${got}`);
    }
    console.log(
      `[contrato TS→Python agrupar] detectó ${baits.length - missed.length} de ${baits.length} carnadas`,
    );
    expect(missed).toEqual([]);
  });
});

describe("cruce de punta a punta: prepareClusterRun → Pyodide → contract.ts → assembleClusterResult", () => {
  it("segmentos: consenso, lectura, perfiles y «elegido por ti»", () => {
    const run = segmentos();
    const checked = validateClusterResult(
      league(run.payload),
      clusterSent(run.payload),
    );
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const result = assembleClusterResult(checked.value, run.smallSample);
    expect(result.selection.by).toBe("consensus");
    expect(result.modelName).toBe(result.selection.consensusWinner);
    expect(result.profiles.separating.length).toBeGreaterThan(0);

    // Elegir a mano otro agrupador que vota: su lectura y sus perfiles pasan a mandar.
    const other = result.league.find(
      (r) => r.status === "ok" && r.name !== result.modelName,
    )!;
    const fit = validateClusterMemberFit(
      JSON.parse(
        fitMember(JSON.stringify(memberPayload(run.payload, other.name))),
      ),
      { ...clusterSentOf(result), member: other.name, row: other },
    );
    expect(fit.ok).toBe(true);
    if (!fit.ok) return;
    const chosen = applyClusterMemberFit(result, fit.value);
    expect(chosen.selection.by).toBe("user");
    expect(chosen.modelName).toBe(other.name);
    expect(chosen.reading.score).toBe(other.score);
  });
});

// --- Fixtures del contrato de agrupar (emisor real) --------------------------

const FIXTURES = resolve(process.cwd(), "tests/fixtures/contrato");
const UPDATE = process.env.CONTRATO_ACTUALIZAR === "1";

function shape(value: unknown): unknown {
  if (Array.isArray(value))
    return value.length ? ["array", shape(value[0])] : ["array"];
  if (value === null) return "null";
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((k) => [k, shape((value as Record<string, unknown>)[k])]),
    );
  }
  return typeof value;
}

function emit(name: string, value: unknown) {
  const file = resolve(FIXTURES, `${name}.json`);
  if (UPDATE) {
    mkdirSync(FIXTURES, { recursive: true });
    writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
    return;
  }
  expect(
    existsSync(file),
    `falta el fixture ${name}.json (CONTRATO_ACTUALIZAR=1)`,
  ).toBe(true);
  expect(
    shape(value),
    `la forma de ${name} cambió: regenera con CONTRATO_ACTUALIZAR=1 y revisa las carnadas`,
  ).toEqual(shape(JSON.parse(readFileSync(file, "utf8"))));
}

describe("fixtures del contrato de agrupar (emisor real: pipeline.py en Pyodide)", () => {
  it("train + su export, fit-member + su score, el export y el score con ruido, y el payload de TS", () => {
    // Datasets del kit y sintéticos sembrados: sin datos de usuarios en el fixture.
    const run = segmentos();
    const train = league(run.payload);
    // El export del GANADOR de esa liga (el que un archivo de esta corrida lleva).
    const exported = JSON.parse(exportModel("{}"));
    const fit = JSON.parse(
      fitMember(JSON.stringify(memberPayload(run.payload, "gmm"))),
    );
    const gmmSchema = (JSON.parse(exportModel("{}")) as ExportResult)
      .schema as ClusterModelSchema;
    const score = JSON.parse(
      scoreNewData(JSON.stringify(scoreRows(run.payload, gmmSchema, [0, 1, 2]))),
    );
    // HDBSCAN: la regla con radio y una fila «fuera de todo grupo».
    const noisy = prepared(nubes({ n: 1_200, seed: 804 }));
    JSON.parse(fitMember(JSON.stringify(memberPayload(noisy.payload, "hdbscan"))));
    const exportedNoise = JSON.parse(exportModel("{}"));
    const far = scoreRows(noisy.payload, exportedNoise.schema as ClusterModelSchema, [0, 1]);
    far.rows.push(far.headers.map(() => "1000000"));
    const scoreNoise = JSON.parse(scoreNewData(JSON.stringify(far)));
    for (const e of [exported, exportedNoise])
      e.payload_b64 = String(e.payload_b64).slice(0, 64);
    emit("train-result-agrupar", train);
    emit("export-result-agrupar", exported);
    emit("fit-member-result-agrupar", fit);
    emit("score-result-agrupar", score);
    emit("export-result-agrupar-ruido", exportedNoise);
    emit("score-result-agrupar-ruido", scoreNoise);
    emit("payload-agrupar", {
      ...run.payload,
      rows: run.payload.rows.slice(0, 5),
      n_rows: run.payload.rows.length,
    });
  });
});
