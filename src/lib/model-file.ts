// Archivo de modelo `.probeta.json` (ADR-007): manifiesto honesto + payload.
//
// El manifiesto es la cara legible del archivo (qué aprendió el modelo, de qué
// dataset, con qué métricas y veredicto, bajo qué versiones) y su guardia de
// integridad: el import valida forma, versión de formato y SHA-256 del payload
// ANTES de que el payload (pickle) toque Pyodide. Un archivo ajeno o corrupto
// se rechaza aquí, en TS puro, sin deserializar nada.
import {
  declaredTask,
  matchByTask,
  taskOf,
  type ByTask,
} from "@/engine/despacho";
import type { LeakageFinding } from "@/engine/leakage";
import { isMemberOf, type MemberId } from "@/engine/roster";
import type { SanitationReport } from "@/engine/sanitize";
import { TRAINABLE_TASKS, type Task, type TrainTask } from "@/engine/tarea";
import type {
  MetricName,
  Metrics,
  MulticlassMetrics,
  PrimaryMetric,
  RegressionMetrics,
  Verdict,
} from "@/engine/verdict";
import {
  arr,
  check,
  int,
  isRecord,
  nullable,
  num,
  obj,
  oneOf,
  optional,
  refine,
  str,
  type Validator,
} from "@/lib/validate";
import {
  metricsV,
  multiclassClassesV,
  multiclassMetricsV,
  regressionMetricsV,
  targetStatsV,
  trainingProfileV,
} from "@/workers/contract";
import type {
  BinaryModelSchema,
  ExperimentResult,
  ExportResult,
  MemberStatus,
  MulticlassModelSchema,
  RegressionModelSchema,
  RuntimeVersions,
  TrainingProfile,
} from "@/workers/protocol";
import { datasetSlug } from "@/lib/files";
import { version as APP_VERSION } from "../../package.json";

export const MODEL_FILE_FORMAT_VERSION = 1;
export const MODEL_FILE_EXTENSION = ".probeta.json";
export const PAYLOAD_ENCODING = "pickle+zlib+base64";
const APP_NAME = "probeta-ds";

// Tope del archivo de import (auditoría H1): se chequea con file.size ANTES de
// leerlo a memoria — un archivo absurdo no debe tumbar la pestaña para luego
// rechazarse. Holgado a propósito: muy por encima de cualquier export real de
// esta app (CSV ≤5MB), muy por debajo de lo que revienta atob/hash.
export const MAX_MODEL_FILE_BYTES = 100 * 1024 * 1024;

// Versiones del runtime que ESTA build trae self-hosteado (public/pyodide).
// Permiten advertir de un mismatch de versiones en el import SIN cargar
// Pyodide. Un test de integración las compara contra el runtime real: si
// actualizas Pyodide/sklearn y no esto, ese test falla (honestidad forzada).
export const RUNTIME_VERSIONS = {
  pyodide: "314.0.2",
  sklearn: "1.8.0",
  // S5: el pickle de un booster exige su paquete al importar (R10).
  xgboost: "2.1.4",
  lightgbm: "4.6.0",
} as const;

/** S5: una fila de la liga tal como queda en el manifiesto (snake_case). */
export type ManifestLeagueRow<M = Metrics> = {
  name: MemberId;
  status: MemberStatus;
  cv_mean: number | null;
  cv_std: number | null;
  test: M | null;
};

/** S5: cómo se eligió el modelo del archivo (U1: «elegido por ti»). */
export type ManifestSelection<P extends PrimaryMetric = MetricName> = {
  by: "cv" | "user";
  cv_winner: MemberId;
  k: number;
  metric: P;
  rule: "one-se";
};

/** El manifiesto de clasificación binaria (S3–S5; S6 suma `task` aditivo). */
export type BinaryManifest = {
  /** S6 (P8): aditivo y opcional — ausente = binaria (los archivos del S5). */
  task?: "binaria";
  app: { name: typeof APP_NAME; version: string };
  created_at: string;
  dataset: { name: string; n_train: number; n_test: number };
  schema: BinaryModelSchema;
  training_profile: TrainingProfile;
  metrics: {
    model: Metrics;
    baselines: { majority: Metrics; logistic: Metrics };
  };
  positive_rate: number;
  verdict: Verdict;
  leakage: LeakageFinding[];
  versions: RuntimeVersions;
  payload_sha256: string;
  payload_encoding: typeof PAYLOAD_ENCODING;
  // S4 — campos ADITIVOS OPCIONALES (ADR-007 revisado): un archivo S3 (sin
  // ellos) importa en S4 y viceversa; la validación estructural tolera extras ⇒
  // aditivo-opcional NO sube format_version. `model_name` nombra al modelo del
  // archivo; `sanitation` deja constancia honesta de qué se saneó al entrenar.
  model_name?: MemberId;
  sanitation?: Pick<
    SanitationReport,
    "duplicateRowsRemoved" | "exclusions" | "coercions"
  >;
  // S5 — también aditivos-opcionales (los archivos S3/S4 siguen importando):
  // la liga que compitió y cómo se eligió el modelo. Si vienen, se validan.
  league?: ManifestLeagueRow[];
  selection?: ManifestSelection;
};

/** S6 (P8): el manifiesto de un modelo que estima una cantidad. Nace con la liga y
 *  la selección obligatorias (no hay archivos de regresión anteriores al S6). */
export type RegressionManifest = {
  task: "numerica";
  app: { name: typeof APP_NAME; version: string };
  created_at: string;
  dataset: { name: string; n_train: number; n_test: number };
  schema: RegressionModelSchema;
  training_profile: TrainingProfile;
  metrics: {
    model: RegressionMetrics;
    baselines: { median: RegressionMetrics; linear: RegressionMetrics };
  };
  verdict: Verdict<"mae">;
  leakage: LeakageFinding[];
  versions: RuntimeVersions;
  payload_sha256: string;
  payload_encoding: typeof PAYLOAD_ENCODING;
  model_name: MemberId;
  sanitation?: BinaryManifest["sanitation"];
  league: ManifestLeagueRow<RegressionMetrics>[];
  selection: ManifestSelection<"mae">;
};

/** S7 (P9): el manifiesto de un modelo de VARIAS categorías — sus clases en el
 *  esquema, sin «clase positiva». Nace con la liga y la selección obligatorias. */
export type MulticlassManifest = {
  task: "multiclase";
  app: { name: typeof APP_NAME; version: string };
  created_at: string;
  dataset: { name: string; n_train: number; n_test: number };
  schema: MulticlassModelSchema;
  training_profile: TrainingProfile;
  metrics: {
    model: MulticlassMetrics;
    baselines: { majority: MulticlassMetrics; logistic: MulticlassMetrics };
  };
  verdict: Verdict<"balanced_accuracy">;
  leakage: LeakageFinding[];
  versions: RuntimeVersions;
  payload_sha256: string;
  payload_encoding: typeof PAYLOAD_ENCODING;
  model_name: MemberId;
  sanitation?: BinaryManifest["sanitation"];
  league: ManifestLeagueRow<MulticlassMetrics>[];
  selection: ManifestSelection<"balanced_accuracy">;
};

export type ModelManifest =
  | BinaryManifest
  | MulticlassManifest
  | RegressionManifest;

export function isBinaryManifest(
  manifest: ModelManifest,
): manifest is BinaryManifest {
  return matchByTask(manifest, {
    binaria: () => true,
    multiclase: () => false,
    numerica: () => false,
  });
}

/** La tarea de un manifiesto (sin `task` = binaria, P8). */
export function manifestTask(manifest: ModelManifest): TrainTask {
  return taskOf(manifest);
}

export type ModelFile = {
  format_version: typeof MODEL_FILE_FORMAT_VERSION;
  manifest: ModelManifest;
  payload: string;
};

// --- Validación estructural (rechazo claro de archivos ajenos/corruptos) ----
// A mano, en TS puro (src/lib/validate.ts): zod vive del lado servidor (lección
// S2 de bundle — aquí rompía el budget de script de 300KB). S5: el validador
// devuelve la RUTA del campo que no cuadra (carnadas del contrato, regla 15).

const member: Validator = (v, path) => (isMemberOf("binaria", v) ? null : path);
const multiclassMember: Validator = (v, path) =>
  isMemberOf("multiclase", v) ? null : path;
const regressionMember: Validator = (v, path) =>
  isMemberOf("numerica", v) ? null : path;
const METRIC_NAMES = ["accuracy", "precision", "recall", "f1", "auc"];

const schemaV = obj({
  numeric: arr(str),
  categorical: arr(str),
  target: str,
  classes: refine(arr(str), (v) => (v as string[]).length === 2),
  positive_class: str,
  task: optional(oneOf(["binaria"])),
});

const verdictOf = (metrics: readonly string[]) =>
  obj({
    level: oneOf(["beats", "ties", "loses"]),
    primaryMetric: oneOf(metrics),
    modelScore: num,
    baselineScore: num,
    delta: num,
  });

const leakageV = arr(
  obj({
    column: str,
    score: num,
    reason: oneOf([
      "near-perfect-separation",
      "category-purity",
      "near-perfect-rank-correlation",
      "category-determines-target",
    ]),
  }),
);

const versionsV = obj({
  pyodide: str,
  sklearn: str,
  python: str,
  xgboost: optional(str),
  lightgbm: optional(str),
});

const sanitationV = optional(
  obj({
    duplicateRowsRemoved: num,
    exclusions: arr(obj({ column: str, reason: str })),
    coercions: arr(obj({ column: str })),
  }),
);

const binaryManifestV = obj({
  task: optional(oneOf(["binaria"])),
  app: obj({ name: oneOf([APP_NAME]), version: str }),
  created_at: str,
  dataset: obj({ name: str, n_train: num, n_test: num }),
  schema: schemaV,
  training_profile: trainingProfileV,
  metrics: obj({
    model: metricsV,
    baselines: obj({ majority: metricsV, logistic: metricsV }),
  }),
  positive_rate: num,
  verdict: verdictOf(METRIC_NAMES),
  leakage: leakageV,
  versions: versionsV,
  payload_sha256: str,
  payload_encoding: oneOf([PAYLOAD_ENCODING]),
  model_name: optional(member),
  league: optional(
    arr(
      obj({
        name: member,
        status: oneOf(["ok", "no-converge", "error"]),
        cv_mean: nullable(num),
        cv_std: nullable(num),
        test: nullable(metricsV),
      }),
      1,
    ),
  ),
  selection: optional(
    obj({
      by: oneOf(["cv", "user"]),
      cv_winner: member,
      k: refine(int, (v) => (v as number) >= 2),
      metric: oneOf(METRIC_NAMES),
      rule: oneOf(["one-se"]),
    }),
  ),
});

// S6 (P8): carnadas en tests/unit/model-file.test.ts — una por campo nuevo.
const regressionManifestV = obj({
  task: oneOf(["numerica"]),
  app: obj({ name: oneOf([APP_NAME]), version: str }),
  created_at: str,
  dataset: obj({ name: str, n_train: num, n_test: num }),
  schema: obj({
    numeric: arr(str),
    categorical: arr(str),
    target: str,
    task: oneOf(["numerica"]),
    target_stats: targetStatsV,
  }),
  training_profile: trainingProfileV,
  metrics: obj({
    model: regressionMetricsV,
    baselines: obj({ median: regressionMetricsV, linear: regressionMetricsV }),
  }),
  verdict: verdictOf(["mae"]),
  leakage: leakageV,
  versions: versionsV,
  payload_sha256: str,
  payload_encoding: oneOf([PAYLOAD_ENCODING]),
  model_name: regressionMember,
  sanitation: sanitationV,
  league: arr(
    obj({
      name: regressionMember,
      status: oneOf(["ok", "no-converge", "error"]),
      cv_mean: nullable(num),
      cv_std: nullable(num),
      test: nullable(regressionMetricsV),
    }),
    1,
  ),
  selection: obj({
    by: oneOf(["cv", "user"]),
    cv_winner: regressionMember,
    k: refine(int, (v) => (v as number) >= 2),
    metric: oneOf(["mae"]),
    rule: oneOf(["one-se"]),
  }),
});

// S7 (P9): carnadas en tests/unit/model-file.test.ts — una por campo nuevo.
const multiclassManifestV = obj({
  task: oneOf(["multiclase"]),
  app: obj({ name: oneOf([APP_NAME]), version: str }),
  created_at: str,
  dataset: obj({ name: str, n_train: num, n_test: num }),
  schema: obj({
    numeric: arr(str),
    categorical: arr(str),
    target: str,
    classes: multiclassClassesV,
    task: oneOf(["multiclase"]),
  }),
  training_profile: trainingProfileV,
  metrics: obj({
    model: multiclassMetricsV,
    baselines: obj({
      majority: multiclassMetricsV,
      logistic: multiclassMetricsV,
    }),
  }),
  verdict: verdictOf(["balanced_accuracy"]),
  // La fuga por clase nombra la clase que la columna delata (P6).
  leakage: arr(
    obj({
      column: str,
      score: num,
      reason: oneOf(["near-perfect-separation", "category-purity"]),
      class: optional(str),
    }),
  ),
  versions: versionsV,
  payload_sha256: str,
  payload_encoding: oneOf([PAYLOAD_ENCODING]),
  model_name: multiclassMember,
  sanitation: sanitationV,
  league: arr(
    obj({
      name: multiclassMember,
      status: oneOf(["ok", "no-converge", "error"]),
      cv_mean: nullable(num),
      cv_std: nullable(num),
      test: nullable(multiclassMetricsV),
    }),
    1,
  ),
  selection: obj({
    by: oneOf(["cv", "user"]),
    cv_winner: multiclassMember,
    k: refine(int, (v) => (v as number) >= 2),
    metric: oneOf(["balanced_accuracy"]),
    rule: oneOf(["one-se"]),
  }),
});

/** El validador del manifiesto de cada tarea que el motor entrena. Es un `Record`
 *  completo: sumar una tarea a `TrainTask` sin su validador no compila (AU-S6-03). */
const MANIFEST_V_BY_TASK: ByTask<Validator> = {
  binaria: binaryManifestV,
  multiclase: multiclassManifestV,
  numerica: regressionManifestV,
};

function isKnownManifestTask(task: string): task is TrainTask {
  return Object.hasOwn(MANIFEST_V_BY_TASK, task);
}

/** Sin `task`, el manifiesto binario (archivos del S3–S5); con ella, el de su tarea. */
const manifestV: Validator = (v, path) => {
  if (!isRecord(v)) return path;
  const task = declaredTask(v);
  return typeof task === "string" && isKnownManifestTask(task)
    ? MANIFEST_V_BY_TASK[task](v, path)
    : `${path}.task`;
};

const modelFileV = obj({
  format_version: oneOf([MODEL_FILE_FORMAT_VERSION]),
  manifest: manifestV,
  payload: refine(str, (v) => (v as string).length > 0),
});

// --- Hash ---------------------------------------------------------------

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// --- Empaquetar (export) --------------------------------------------------

export type PackModelInput = {
  datasetName: string;
  result: ExperimentResult;
  exported: ExportResult;
  /** Reporte de saneamiento del entrenamiento (S4) — se registra si no estaba limpio. */
  sanitation?: SanitationReport;
  /** Inyectable para tests deterministas. */
  date?: Date;
};

export async function packModelFile(input: PackModelInput): Promise<ModelFile> {
  const { result, exported, sanitation } = input;
  const payload_sha256 = await sha256Hex(base64ToBytes(exported.payload_b64));
  // Solo se registra el saneamiento si HUBO algo que sanear (dataset limpio ⇒
  // se omite el campo, sin ruido).
  const sanitationSummary =
    sanitation && !sanitation.clean
      ? {
          duplicateRowsRemoved: sanitation.duplicateRowsRemoved,
          exclusions: sanitation.exclusions,
          coercions: sanitation.coercions,
        }
      : undefined;
  const common = {
    app: { name: APP_NAME, version: APP_VERSION },
    created_at: (input.date ?? new Date()).toISOString(),
    dataset: {
      name: input.datasetName,
      n_train: result.nTrain,
      n_test: result.nTest,
    },
    training_profile: exported.training_profile,
    leakage: result.leakage,
    versions: exported.versions,
    payload_sha256,
    payload_encoding: PAYLOAD_ENCODING,
    model_name: result.modelName,
    ...(sanitationSummary ? { sanitation: sanitationSummary } : {}),
  } as const;
  const selection = {
    by: result.selection.by,
    cv_winner: result.selection.cvWinner,
    k: result.selection.k,
    rule: result.selection.rule,
  };
  const league = <M>(
    rows: readonly {
      name: MemberId;
      status: MemberStatus;
      cv: { mean: number; std: number } | null;
      test: M | null;
    }[],
  ) =>
    rows.map((row) => ({
      name: row.name,
      status: row.status,
      cv_mean: row.cv?.mean ?? null,
      cv_std: row.cv?.std ?? null,
      test: row.test,
    }));

  // El esquema exportado tiene que ser de la MISMA tarea que el resultado.
  const mismatch = (): never => {
    throw new Error("packModelFile: el esquema exportado es de otra tarea");
  };
  const manifest: ModelManifest = matchByTask(result, {
    binaria: (binary): BinaryManifest => ({
      task: "binaria",
      ...common,
      schema: matchByTask(exported.schema, {
        binaria: (schema) => schema,
        multiclase: mismatch,
        numerica: mismatch,
      }),
      metrics: { model: binary.model, baselines: binary.baselines },
      positive_rate: binary.positiveRate,
      verdict: binary.verdict,
      league: league(binary.league),
      selection: { ...selection, metric: binary.selection.metric },
    }),
    multiclase: (multi): MulticlassManifest => ({
      task: "multiclase",
      ...common,
      schema: matchByTask(exported.schema, {
        binaria: mismatch,
        multiclase: (schema) => schema,
        numerica: mismatch,
      }),
      metrics: { model: multi.model, baselines: multi.baselines },
      verdict: multi.verdict,
      league: league(multi.league),
      selection: { ...selection, metric: multi.selection.metric },
    }),
    numerica: (regression): RegressionManifest => ({
      task: "numerica",
      ...common,
      schema: matchByTask(exported.schema, {
        binaria: mismatch,
        multiclase: mismatch,
        numerica: (schema) => schema,
      }),
      metrics: { model: regression.model, baselines: regression.baselines },
      verdict: regression.verdict,
      league: league(regression.league),
      selection: { ...selection, metric: "mae" },
    }),
  });
  return {
    format_version: MODEL_FILE_FORMAT_VERSION,
    manifest,
    payload: exported.payload_b64,
  };
}

export function modelFileName(datasetName: string, date?: Date): string {
  const day = (date ?? new Date()).toISOString().slice(0, 10);
  const slug = datasetSlug(datasetName) || "experimento";
  return `modelo-${slug}-${day}${MODEL_FILE_EXTENSION}`;
}

// --- Validar (import) — ANTES de deserializar ------------------------------

export type ModelFileErrorKind =
  | "file-too-large"
  | "invalid-json"
  | "invalid-format"
  | "unsupported-version"
  | "hash-mismatch"
  // S6: el archivo es válido pero de una tarea que esta versión todavía no usa
  // (p. ej. un modelo multiclase abierto en una versión que solo sabe de binaria).
  | "unsupported-task";

/** Largo máximo con que se nombra una tarea desconocida (texto del archivo). */
const MAX_TASK_NAME = 40;

export type VersionWarning = {
  component: "pyodide" | "sklearn" | "xgboost" | "lightgbm";
  file: string;
  runtime: string;
};

export type ModelFileValidation =
  | { ok: true; file: ModelFile; warnings: VersionWarning[] }
  | {
      ok: false;
      error: ModelFileErrorKind;
      /** S5: con invalid-format estructural, el campo que no cuadra (diagnóstico). */
      field?: string;
      /** S6: con unsupported-task, la tarea que declara el archivo (para
       *  nombrarla): puede ser una que esta versión no conoce («multiclase»). */
      task?: string;
    };

function versionWarnings(versions: RuntimeVersions): VersionWarning[] {
  const warnings: VersionWarning[] = [];
  for (const component of [
    "pyodide",
    "sklearn",
    "xgboost",
    "lightgbm",
  ] as const) {
    // Los boosters solo se cotejan si el archivo los declara (S3/S4 no).
    const declared = versions[component];
    if (declared !== undefined && declared !== RUNTIME_VERSIONS[component]) {
      warnings.push({
        component,
        file: declared,
        runtime: RUNTIME_VERSIONS[component],
      });
    }
  }
  return warnings;
}

/**
 * Valida el texto de un `.probeta.json`: JSON → versión de formato → forma
 * (validación estructural) → SHA-256 del payload contra el manifiesto. El
 * payload NUNCA se deserializa aquí; si algo falla, se rechaza sin tocarlo. Un
 * mismatch de versiones de runtime NO bloquea: devuelve warnings (advertencia
 * honesta).
 */
export async function validateModelFile(
  text: string,
  // S6: las tareas que la UI sabe usar (las mismas que ofrece entrenar). Un
  // archivo íntegro de otra tarea se rechaza nombrándola, no se abre a medias.
  usable: readonly Task[] = TRAINABLE_TASKS,
): Promise<ModelFileValidation> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "invalid-json" };
  }

  // La versión de formato se mira ANTES de exigir la forma completa: un
  // archivo de un formato futuro merece "versión no soportada", no "corrupto".
  if (!isRecord(raw) || num(raw.format_version, "") !== null) {
    return { ok: false, error: "invalid-format" };
  }
  if (raw.format_version !== MODEL_FILE_FORMAT_VERSION) {
    return { ok: false, error: "unsupported-version" };
  }

  // S6 (ADR 014 §3): la tarea se mira ANTES que la forma, igual que la versión.
  // Un archivo de una tarea que esta versión no abre, o que no conoce (uno
  // multiclase del S7 abierto aquí), se rechaza NOMBRÁNDOLA, jamás con un
  // engañoso «no parece un modelo de Probeta» (AU-S6-02).
  const declared = isRecord(raw.manifest)
    ? declaredTask(raw.manifest)
    : declaredTask({});
  if (typeof declared !== "string") {
    return { ok: false, error: "invalid-format", field: "manifest.task" };
  }
  if (!isKnownManifestTask(declared) || !usable.includes(declared)) {
    // Recortada: es texto del archivo y solo se muestra (React lo escapa).
    return {
      ok: false,
      error: "unsupported-task",
      task: declared.slice(0, MAX_TASK_NAME),
    };
  }

  const shaped = check<ModelFile>(modelFileV, raw);
  if (!shaped.ok) {
    return { ok: false, error: "invalid-format", field: shaped.field };
  }
  const file = shaped.value;

  let payloadBytes: Uint8Array;
  try {
    payloadBytes = base64ToBytes(file.payload);
  } catch {
    return { ok: false, error: "invalid-format" };
  }
  const digest = await sha256Hex(payloadBytes);
  if (digest !== file.manifest.payload_sha256) {
    return { ok: false, error: "hash-mismatch" };
  }

  return { ok: true, file, warnings: versionWarnings(file.manifest.versions) };
}
