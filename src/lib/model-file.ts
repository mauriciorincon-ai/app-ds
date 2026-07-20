// Archivo de modelo `.probeta.json` (ADR-007): manifiesto honesto + payload.
//
// El manifiesto es la cara legible del archivo (qué aprendió el modelo, de qué
// dataset, con qué métricas y veredicto, bajo qué versiones) y su guardia de
// integridad: el import valida forma, versión de formato y SHA-256 del payload
// ANTES de que el payload (pickle) toque Pyodide. Un archivo ajeno o corrupto
// se rechaza aquí, en TS puro, sin deserializar nada.
import type { LeakageFinding } from "@/engine/leakage";
import type { SanitationReport } from "@/engine/sanitize";
import type { Metrics, Verdict } from "@/engine/verdict";
import type {
  ExperimentResult,
  ExportResult,
  ModelCandidate,
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
} as const;

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
  // aditivo-opcional NO sube format_version. `model_name` nombra al candidato
  // ganador; `sanitation` deja constancia honesta de qué se saneó al entrenar.
  model_name?: ModelCandidate["name"];
  sanitation?: Pick<
    SanitationReport,
    "duplicateRowsRemoved" | "exclusions" | "coercions"
  >;
};

export type ModelFile = {
  format_version: typeof MODEL_FILE_FORMAT_VERSION;
  manifest: ModelManifest;
  payload: string;
};

// --- Validación estructural (rechazo claro de archivos ajenos/corruptos) ----
// A mano, en TS puro: zod vive del lado servidor (lección S2 de bundle — aquí
// rompía el budget de script de 300KB). La forma es fija y pequeña; los tests
// de model-file cubren cada rechazo.

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === "string";
const isNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every(isString);

const isMetrics = (v: unknown): v is Metrics =>
  isRecord(v) &&
  (["accuracy", "precision", "recall", "f1", "auc"] as const).every((k) =>
    isNumber(v[k]),
  );

function isModelSchema(v: unknown): v is ModelSchema {
  return (
    isRecord(v) &&
    isStringArray(v.numeric) &&
    isStringArray(v.categorical) &&
    isString(v.target) &&
    isStringArray(v.classes) &&
    v.classes.length === 2 &&
    isString(v.positive_class)
  );
}

function isTrainingProfile(v: unknown): v is TrainingProfile {
  if (!isRecord(v) || !isRecord(v.numeric) || !isRecord(v.categorical)) {
    return false;
  }
  return (
    Object.values(v.numeric).every(
      (bounds) =>
        isRecord(bounds) &&
        (bounds.min === null || isNumber(bounds.min)) &&
        (bounds.max === null || isNumber(bounds.max)),
    ) && Object.values(v.categorical).every(isStringArray)
  );
}

function isVerdict(v: unknown): v is Verdict {
  return (
    isRecord(v) &&
    isString(v.level) &&
    ["beats", "ties", "loses"].includes(v.level) &&
    isString(v.primaryMetric) &&
    ["accuracy", "precision", "recall", "f1", "auc"].includes(
      v.primaryMetric,
    ) &&
    isNumber(v.modelScore) &&
    isNumber(v.baselineScore) &&
    isNumber(v.delta)
  );
}

function isLeakage(v: unknown): v is LeakageFinding[] {
  return (
    Array.isArray(v) &&
    v.every(
      (finding) =>
        isRecord(finding) &&
        isString(finding.column) &&
        isNumber(finding.score) &&
        isString(finding.reason) &&
        ["near-perfect-separation", "category-purity"].includes(finding.reason),
    )
  );
}

function isManifest(v: unknown): v is ModelManifest {
  return (
    isRecord(v) &&
    isRecord(v.app) &&
    v.app.name === APP_NAME &&
    isString(v.app.version) &&
    isString(v.created_at) &&
    isRecord(v.dataset) &&
    isString(v.dataset.name) &&
    isNumber(v.dataset.n_train) &&
    isNumber(v.dataset.n_test) &&
    isModelSchema(v.schema) &&
    isTrainingProfile(v.training_profile) &&
    isRecord(v.metrics) &&
    isMetrics(v.metrics.model) &&
    isRecord(v.metrics.baselines) &&
    isMetrics(v.metrics.baselines.majority) &&
    isMetrics(v.metrics.baselines.logistic) &&
    isNumber(v.positive_rate) &&
    isVerdict(v.verdict) &&
    isLeakage(v.leakage) &&
    isRecord(v.versions) &&
    isString(v.versions.pyodide) &&
    isString(v.versions.sklearn) &&
    isString(v.versions.python) &&
    isString(v.payload_sha256) &&
    v.payload_encoding === PAYLOAD_ENCODING
  );
}

function isModelFile(v: unknown): v is ModelFile {
  return (
    isRecord(v) &&
    v.format_version === MODEL_FILE_FORMAT_VERSION &&
    isManifest(v.manifest) &&
    isString(v.payload) &&
    v.payload.length > 0
  );
}

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
  component: "pyodide" | "sklearn";
  file: string;
  runtime: string;
};

export type ModelFileValidation =
  | { ok: true; file: ModelFile; warnings: VersionWarning[] }
  | { ok: false; error: ModelFileErrorKind };

function versionWarnings(versions: RuntimeVersions): VersionWarning[] {
  const warnings: VersionWarning[] = [];
  for (const component of ["pyodide", "sklearn"] as const) {
    if (versions[component] !== RUNTIME_VERSIONS[component]) {
      warnings.push({
        component,
        file: versions[component],
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
  if (!isRecord(raw) || !isNumber(raw.format_version)) {
    return { ok: false, error: "invalid-format" };
  }
  if (raw.format_version !== MODEL_FILE_FORMAT_VERSION) {
    return { ok: false, error: "unsupported-version" };
  }

  if (!isModelFile(raw)) return { ok: false, error: "invalid-format" };
  const file = raw;

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
