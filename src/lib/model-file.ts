// Archivo de modelo `.probeta.json` (ADR-007): manifiesto honesto + payload.
//
// El manifiesto es la cara legible del archivo (qué aprendió el modelo, de qué
// dataset, con qué métricas y veredicto, bajo qué versiones) y su guardia de
// integridad: el import valida forma, versión de formato y SHA-256 del payload
// ANTES de que el payload (pickle) toque Pyodide. Un archivo ajeno o corrupto
// se rechaza aquí, en TS puro, sin deserializar nada.
import type { LeakageFinding } from "@/engine/leakage";
import { isMemberId, type MemberId } from "@/engine/roster";
import type { SanitationReport } from "@/engine/sanitize";
import type { MetricName, Metrics, Verdict } from "@/engine/verdict";
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
import { metricsV, trainingProfileV } from "@/workers/contract";
import type {
  ExperimentResult,
  ExportResult,
  MemberStatus,
  ModelSchema,
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
export type ManifestLeagueRow = {
  name: MemberId;
  status: MemberStatus;
  cv_mean: number | null;
  cv_std: number | null;
  test: Metrics | null;
};

/** S5: cómo se eligió el modelo del archivo (U1: «elegido por ti»). */
export type ManifestSelection = {
  by: "cv" | "user";
  cv_winner: MemberId;
  k: number;
  metric: MetricName;
  rule: "one-se";
};

export type ModelManifest = {
  app: { name: typeof APP_NAME; version: string };
  created_at: string;
  dataset: { name: string; n_train: number; n_test: number };
  schema: ModelSchema;
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

export type ModelFile = {
  format_version: typeof MODEL_FILE_FORMAT_VERSION;
  manifest: ModelManifest;
  payload: string;
};

// --- Validación estructural (rechazo claro de archivos ajenos/corruptos) ----
// A mano, en TS puro (src/lib/validate.ts): zod vive del lado servidor (lección
// S2 de bundle — aquí rompía el budget de script de 300KB). S5: el validador
// devuelve la RUTA del campo que no cuadra (carnadas del contrato, regla 15).

const member: Validator = (v, path) => (isMemberId(v) ? null : path);
const METRIC_NAMES = ["accuracy", "precision", "recall", "f1", "auc"];

const schemaV = obj({
  numeric: arr(str),
  categorical: arr(str),
  target: str,
  classes: refine(arr(str), (v) => (v as string[]).length === 2),
  positive_class: str,
});

const verdictV = obj({
  level: oneOf(["beats", "ties", "loses"]),
  primaryMetric: oneOf(METRIC_NAMES),
  modelScore: num,
  baselineScore: num,
  delta: num,
});

const leakageV = arr(
  obj({
    column: str,
    score: num,
    reason: oneOf(["near-perfect-separation", "category-purity"]),
  }),
);

const manifestV = obj({
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
  verdict: verdictV,
  leakage: leakageV,
  versions: obj({
    pyodide: str,
    sklearn: str,
    python: str,
    xgboost: optional(str),
    lightgbm: optional(str),
  }),
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
  return {
    format_version: MODEL_FILE_FORMAT_VERSION,
    manifest: {
      app: { name: APP_NAME, version: APP_VERSION },
      created_at: (input.date ?? new Date()).toISOString(),
      dataset: {
        name: input.datasetName,
        n_train: result.nTrain,
        n_test: result.nTest,
      },
      schema: exported.schema,
      training_profile: exported.training_profile,
      metrics: { model: result.model, baselines: result.baselines },
      positive_rate: result.positiveRate,
      verdict: result.verdict,
      leakage: result.leakage,
      versions: exported.versions,
      payload_sha256,
      payload_encoding: PAYLOAD_ENCODING,
      model_name: result.modelName,
      ...(sanitationSummary ? { sanitation: sanitationSummary } : {}),
      league: result.league.map((row) => ({
        name: row.name,
        status: row.status,
        cv_mean: row.cv?.mean ?? null,
        cv_std: row.cv?.std ?? null,
        test: row.test,
      })),
      selection: {
        by: result.selection.by,
        cv_winner: result.selection.cvWinner,
        k: result.selection.k,
        metric: result.selection.metric,
        rule: result.selection.rule,
      },
    },
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
  | "hash-mismatch";

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
