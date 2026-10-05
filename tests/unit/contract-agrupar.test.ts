// Gate de contrato entre lenguajes (regla 15) para AGRUPAR (S7, ADR 016) — el lado
// que LEE Python → TS. Los fixtures los ESCRIBE el emisor real (pipeline.py en
// Pyodide, desde tests/integration/agrupar.test.ts); aquí el lector de producción
// (contract.ts, model-file.ts) los valida, y cada carnada —una mutación de UN solo
// campo— tiene que rechazarse NOMBRANDO ese campo. Se reporta «detectó k de n».
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isMemberOf, type MemberId } from "@/engine/roster";
import { assembleClusterResult } from "@/lib/experiment";
import {
  manifestTask,
  packModelFile,
  validateModelFile,
} from "@/lib/model-file";
import type { Checked } from "@/lib/validate";
import {
  validateClusterLabels,
  validateClusterMemberFit,
  validateClusterResult,
  validateClusterScore,
  validateExportResult,
  type ClusterSent,
} from "@/workers/contract";
import type {
  ClusterMemberRow,
  ClusterModelSchema,
  ClusterPayload,
  ClusterPipelineResult,
  ExportResult,
} from "@/workers/protocol";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixtures JSON que las carnadas mutan a propósito
type Json = Record<string, any>;

const fixture = <T = Json>(name: string): T =>
  JSON.parse(
    readFileSync(
      resolve(__dirname, `../fixtures/contrato/${name}.json`),
      "utf8",
    ),
  ) as T;

type Bait = [field: string, mutate: (value: Json) => void];

function runBaits(
  label: string,
  base: Json,
  validate: (value: unknown) => Checked<unknown>,
  baits: Bait[],
) {
  const missed: string[] = [];
  for (const [field, mutate] of baits) {
    const copy = structuredClone(base);
    mutate(copy);
    const result = validate(copy);
    if (result.ok || result.field !== field) {
      missed.push(`${field} → ${result.ok ? "aceptada" : result.field}`);
    }
  }
  console.log(
    `[contrato ${label}] detectó ${baits.length - missed.length} de ${baits.length} carnadas`,
  );
  expect(missed).toEqual([]);
}

const PAYLOAD = fixture<ClusterPayload & { n_rows: number }>("payload-agrupar");
const SENT: ClusterSent = {
  roster: PAYLOAD.roster,
  k_range: PAYLOAD.k_range,
  n_rows: PAYLOAD.n_rows,
  distance: PAYLOAD.distance,
  stability_runs: PAYLOAD.stability_runs,
  numeric: PAYLOAD.numeric,
  categorical: PAYLOAD.categorical,
};
const TRAIN = fixture<ClusterPipelineResult>("train-result-agrupar");
const idx = (name: MemberId) => TRAIN.league.findIndex((r) => r.name === name);
/** Otro agrupador que vota y no es el ganador. */
const otherOk = (t: Json): MemberId =>
  t.league.find((r: Json) => r.status === "ok" && r.name !== t.winner).name;

describe("Python → TS: la liga de AGRUPAR", () => {
  it("el fixture real valida; el payload de TS no trae objetivo ni partición", () => {
    expect(validateClusterResult(TRAIN, SENT)).toMatchObject({ ok: true });
    expect(PAYLOAD.task).toBe("agrupar");
    for (const key of [
      "target",
      "train_idx",
      "test_idx",
      "primary_metric",
      "cv_k",
    ])
      expect(PAYLOAD).not.toHaveProperty(key);
    for (const id of PAYLOAD.roster)
      expect(isMemberOf("agrupar", id)).toBe(true);
    // El fixture tiene los cuatro: K-Means, Agglomerative, GMM y HDBSCAN, en orden.
    expect(TRAIN.league.map((r) => r.name)).toEqual([
      "kmeans",
      "agglomerative",
      "gmm",
      "hdbscan",
    ]);
  });

  it("carnadas por campo: se rechazan NOMBRANDO el campo", () => {
    const [km, ag, gm, hd] = (
      ["kmeans", "agglomerative", "gmm", "hdbscan"] as MemberId[]
    ).map(idx);
    runBaits("train-agrupar", TRAIN, (v) => validateClusterResult(v, SENT), [
      ["task", (t) => (t.task = "binaria")],
      // P13: ninguna etiqueta por fila viaja, ni arriba ni en una fila.
      ["labels", (t) => (t.labels = [0, 1, 2])],
      [`league[${km}].labels`, (t) => (t.league[km].labels = [0, 1])],
      ["n_rows", (t) => (t.n_rows += 1)],
      ["distance", (t) => (t.distance = "all")],
      ["k_range", (t) => (t.k_range = [2, 9])],
      ["silhouette_sample", (t) => (t.silhouette_sample += 1)],
      ["league", (t) => t.league.reverse()],
      [`league[${km}].k_by`, (t) => (t.league[km].k_by = "bic")],
      [
        `league[${km}].error_type`,
        (t) => (t.league[km].error_type = "ValueError"),
      ],
      // El k que elige la silueta, y la silueta de ese k.
      [`league[${km}].k`, (t) => (t.league[km].k += 1)],
      [
        `league[${km}].silhouette_by_k`,
        (t) => t.league[km].silhouette_by_k.pop(),
      ],
      [
        `league[${km}].silhouette_by_k[0].silhouette`,
        (t) => (t.league[km].silhouette_by_k[0].silhouette = 2),
      ],
      [`league[${km}].silhouette`, (t) => (t.league[km].silhouette -= 0.01)],
      // El puntaje comparable: silueta × (1 − ruido), recalculado.
      [`league[${km}].score`, (t) => (t.league[km].score -= 0.01)],
      [`league[${km}].sizes`, (t) => t.league[km].sizes.reverse()],
      [`league[${km}].sizes`, (t) => (t.league[km].sizes[0] += 1)],
      // El BIC solo es de GMM, y su k es el del BIC mínimo.
      [`league[${gm}].bic_by_k`, (t) => (t.league[gm].bic_by_k = null)],
      [
        `league[${km}].bic_by_k`,
        (t) => (t.league[km].bic_by_k = [{ k: 2, bic: 1 }]),
      ],
      [
        `league[${gm}].k`,
        (t) => {
          const row = t.league[gm];
          row.bic_by_k = row.bic_by_k.map((x: Json) =>
            x.k === row.k ? { ...x, bic: x.bic + 1e6 } : x,
          );
        },
      ],
      // El ruido es solo de HDBSCAN.
      [`league[${hd}].noise_share`, (t) => (t.league[hd].noise_share = null)],
      [`league[${hd}].noise_share`, (t) => (t.league[hd].noise_share += 0.1)],
      [`league[${ag}].noise_share`, (t) => (t.league[ag].noise_share = 0)],
      // La muestra de Agglomerative, solo por encima de AGGLO_MAX_ROWS.
      [`league[${ag}].sample_rows`, (t) => (t.league[ag].sample_rows = 8000)],
      // El consenso y el ganador, recalculados con la regla de verdict.ts.
      ["consensus", (t) => (t.consensus.votes += 1)],
      ["winner", (t) => (t.winner = otherOk(t))],
      ["model_name", (t) => (t.model_name = otherOk(t))],
      // La lectura del retenido.
      ["reading.score", (t) => (t.reading.score -= 0.01)],
      ["reading.gap", (t) => (t.reading.gap += 0.01)],
      [
        "reading.level",
        (t) =>
          (t.reading.level = t.reading.level === "none" ? "exist" : "none"),
      ],
      ["reading.stability.runs", (t) => (t.reading.stability.runs = 5)],
      [
        "reading.stability.fraction",
        (t) => (t.reading.stability.fraction = 0.5),
      ],
      [
        "reading.stability",
        (t) =>
          (t.reading.stability.ari_min = t.reading.stability.ari_mean + 0.001),
      ],
      [
        "reading.stability.ari_mean",
        (t) => (t.reading.stability.ari_mean = 1.5),
      ],
      // Los perfiles: un grupo por k, con los tamaños de la fila y las columnas enviadas.
      ["profiles.groups", (t) => t.profiles.groups.pop()],
      ["profiles.groups", (t) => (t.profiles.groups[0].size += 1)],
      ["profiles.groups", (t) => (t.profiles.groups[0].share /= 2)],
      ["profiles.groups[0].share", (t) => (t.profiles.groups[0].share = 2)],
      [
        "profiles.groups",
        (t) => {
          const numeric = t.profiles.groups[0].numeric;
          delete numeric[Object.keys(numeric)[0]!];
        },
      ],
      [
        "profiles.noise",
        (t) => (t.profiles.noise = { size: 1, share: 1 / t.n_rows }),
      ],
      [
        "profiles.separating",
        (t) =>
          t.profiles.separating.push(
            ...Array.from({ length: 4 }, () => ({
              ...t.profiles.separating[0],
            })),
          ),
      ],
      [
        "profiles.separating",
        (t) => (t.profiles.separating[0].column = "no-existe"),
      ],
      [
        "profiles.separating",
        (t) => {
          t.profiles.separating[0].strength = 0;
          t.profiles.separating[1].strength = 0.9;
        },
      ],
      // La regla de asignación del retenido.
      ["assignment.method", (t) => (t.assignment.method = "gaussian")],
      ["assignment.sample_rows", (t) => (t.assignment.sample_rows = 8000)],
      [
        "assignment.train_agreement",
        (t) => (t.assignment.train_agreement = 1.5),
      ],
    ]);
  });
});

describe("Python → TS: el agrupador elegido a mano (fit-member)", () => {
  const fit = fixture("fit-member-result-agrupar");
  const row = TRAIN.league[idx(fit.model_name as MemberId)] as ClusterMemberRow;
  const sentFit = { ...SENT, member: fit.model_name as MemberId, row };

  it("el fixture real valida contra SU fila (y tiene que ser el agrupador pedido)", () => {
    expect(validateClusterMemberFit(fit, sentFit).ok).toBe(true);
    expect(
      validateClusterMemberFit(fit, { ...sentFit, member: "kmeans" }),
    ).toEqual({ ok: false, field: "model_name" });
  });

  it("carnadas por campo", () => {
    runBaits(
      "fit-member-agrupar",
      fit,
      (v) => validateClusterMemberFit(v, sentFit),
      [
        ["task", (f) => (f.task = "numerica")],
        ["labels", (f) => (f.labels = [0])],
        ["k", (f) => (f.k += 1)],
        ["score", (f) => (f.score -= 0.01)],
        ["reading.score", (f) => (f.reading.score -= 0.01)],
        ["reading.stability.runs", (f) => (f.reading.stability.runs = 3)],
        ["profiles.groups", (f) => f.profiles.groups.pop()],
        [
          "assignment.method",
          (f) => (f.assignment.method = "nearest-centroid"),
        ],
      ],
    );
  });
});

describe("Python → TS: el export y la puntuación al agrupar", () => {
  const exported = fixture("export-result-agrupar");
  const exportedNoise = fixture("export-result-agrupar-ruido");
  const score = fixture("score-result-agrupar");
  const scoreNoise = fixture("score-result-agrupar-ruido");
  const fit = fixture("fit-member-result-agrupar");
  // El score de la mezcla gaussiana (sin ruido, con probabilidad).
  const gaussian: Pick<ClusterModelSchema, "groups" | "noise" | "assign"> = {
    groups: fit.profiles.groups.length,
    noise: false,
    assign: {
      method: "gaussian",
      centroids: [],
      radii: null,
      sample_rows: null,
    },
  };
  const noiseSchema = exportedNoise.schema as ClusterModelSchema;

  it("los fixtures reales validan", () => {
    expect(validateExportResult(exported).ok).toBe(true);
    expect(validateExportResult(exportedNoise).ok).toBe(true);
    expect(validateClusterScore(score, gaussian).ok).toBe(true);
    expect(validateClusterScore(scoreNoise, noiseSchema).ok).toBe(true);
    // El fixture con ruido trae de verdad una fila fuera de todo grupo.
    expect(scoreNoise.predictions).toContain(-1);
  });

  it("carnadas del export (la regla de asignación con su forma)", () => {
    runBaits("export-agrupar", exportedNoise, validateExportResult, [
      ["schema.task", (e) => (e.schema.task = "serie-tiempo")],
      ["schema.groups", (e) => (e.schema.groups = 1)],
      ["schema.assign.method", (e) => (e.schema.assign.method = "otro")],
      ["schema.assign.centroids", (e) => e.schema.assign.centroids.pop()],
      ["schema.assign.centroids", (e) => e.schema.assign.centroids[0].push(0)],
      ["schema.assign.radii", (e) => (e.schema.assign.radii = null)],
      ["schema.assign.radii", (e) => e.schema.assign.radii.pop()],
      ["schema.noise", (e) => (e.schema.noise = false)],
    ]);
  });

  it("carnadas de la puntuación: un grupo del modelo, −1 solo con ruido, probabilidad solo gaussiana", () => {
    runBaits("score-agrupar", score, (v) => validateClusterScore(v, gaussian), [
      ["task", (s) => (s.task = "multiclase")],
      ["predictions[0]", (s) => (s.predictions[0] = "0")],
      ["predictions", (s) => (s.predictions[0] = gaussian.groups)],
      ["predictions", (s) => (s.predictions[0] = -1)],
      ["predictions", (s) => s.predictions.pop()],
      ["probabilities", (s) => (s.probabilities = null)],
      ["probabilities[0]", (s) => (s.probabilities[0] = 1.5)],
      ["probabilities", (s) => s.probabilities.pop()],
    ]);
    runBaits(
      "score-agrupar-ruido",
      scoreNoise,
      (v) => validateClusterScore(v, noiseSchema),
      [
        ["predictions", (s) => (s.predictions[0] = -2)],
        [
          "probabilities",
          (s) => (s.probabilities = s.predictions.map(() => 0.5)),
        ],
      ],
    );
  });

  it("carnadas de las etiquetas por fila (solo para el CSV local)", () => {
    const labels = { labels: [0, 1, 2, 0] };
    const sent = { n_rows: 4, groups: 3, noise: false };
    expect(validateClusterLabels(labels, sent).ok).toBe(true);
    runBaits("labels-agrupar", labels, (v) => validateClusterLabels(v, sent), [
      ["labels", (l) => l.labels.pop()],
      ["labels", (l) => (l.labels[0] = 3)],
      ["labels", (l) => (l.labels[0] = -1)],
      ["labels[0]", (l) => (l.labels[0] = 0.5)],
    ]);
  });
});

describe("Archivo → import: el manifiesto de AGRUPAR (P9)", () => {
  const DATE = new Date("2026-10-04T12:00:00Z");
  async function packCluster() {
    return packModelFile({
      datasetName: "segmentos-clientes.csv",
      result: assembleClusterResult(TRAIN),
      exported: fixture<ExportResult>("export-result-agrupar"),
      date: DATE,
    });
  }

  it("declara su tarea; sin objetivo, sin métricas, sin etiquetas ni perfiles", async () => {
    const file = await packCluster();
    expect(manifestTask(file.manifest)).toBe("agrupar");
    const text = JSON.stringify(file.manifest);
    for (const key of [
      '"target"',
      '"metrics"',
      '"verdict"',
      '"labels"',
      '"profiles"',
    ])
      expect(text).not.toContain(key);
  });

  it("S7 (F3): la UI lo abre; una versión que no usa la tarea lo rechaza NOMBRÁNDOLA", async () => {
    // Cambio esperado (D3 cumplida): con la pantalla de agrupar, se importa.
    const text = JSON.stringify(await packCluster());
    expect(
      await validateModelFile(text, ["binaria", "multiclase", "numerica"]),
    ).toEqual({
      ok: false,
      error: "unsupported-task",
      task: "agrupar",
    });
    expect((await validateModelFile(text)).ok).toBe(true);
  });

  it("carnadas del manifiesto de agrupar — detectó k de n", async () => {
    const file = await packCluster();
    type Mutation = [field: string, mutate: (m: Json) => void];
    const baits: Mutation[] = [
      // Un objetivo o métricas de una tarea con objetivo: un archivo disfrazado.
      ["manifest.target", (m) => (m.target = "plan")],
      ["manifest.metrics", (m) => (m.metrics = { model: {} })],
      ["manifest.verdict", (m) => (m.verdict = { level: "beats" })],
      ["manifest.leakage", (m) => (m.leakage = [])],
      ["manifest.groups", (m) => (m.groups += 1)],
      ["manifest.groups", (m) => (m.groups = 1)],
      ["manifest.model_name", (m) => (m.model_name = "logistic")],
      ["manifest.dataset.n_rows", (m) => delete m.dataset.n_rows],
      [
        "manifest.reading.level",
        (m) =>
          (m.reading.level = m.reading.level === "none" ? "exist" : "none"),
      ],
      [
        "manifest.reading.stability.ari_mean",
        (m) => delete m.reading.stability.ari_mean,
      ],
      ["manifest.assignment.method", (m) => (m.assignment.method = "otro")],
      ["manifest.selection.by", (m) => (m.selection.by = "user")],
      [
        "manifest.schema.assign.centroids",
        (m) => m.schema.assign.centroids.pop(),
      ],
      ["manifest.league[0].name", (m) => (m.league[0].name = "logistic")],
    ];
    let detected = 0;
    for (const [field, mutate] of baits) {
      const raw = JSON.parse(JSON.stringify(file)) as { manifest: Json };
      mutate(raw.manifest);
      const validation = await validateModelFile(JSON.stringify(raw), [
        "agrupar",
      ]);
      if (
        !validation.ok &&
        validation.error === "invalid-format" &&
        validation.field === field
      ) {
        detected += 1;
      } else {
        console.log(
          `[manifiesto agrupar] carnada NO detectada: ${field}`,
          validation,
        );
      }
    }
    console.log(
      `[contrato manifiesto agrupar] validateModelFile detectó ${detected} de ${baits.length} carnadas`,
    );
    expect(detected).toBe(baits.length);
  });
});
