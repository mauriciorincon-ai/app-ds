// Archivo de modelo `.probeta.json` (ADR-007): manifiesto honesto + payload.
//
// El manifiesto es la cara legible del archivo (qué aprendió el modelo, de qué
// dataset, con qué métricas y veredicto, bajo qué versiones) y su guardia de
// integridad: el import valida forma, versión de formato y SHA-256 del payload
// ANTES de que el payload (pickle) toque Pyodide. Un archivo ajeno o corrupto
// se rechaza aquí, en TS puro, sin deserializar nada.
import { z } from "zod";
import type { LeakageFinding } from "@/engine/leakage";
import type { Metrics, Verdict } from "@/engine/verdict";
import type {
  ExperimentResult,
  ExportResult,
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
};

export type ModelFile = {
  format_version: typeof MODEL_FILE_FORMAT_VERSION;
  manifest: ModelManifest;
  payload: string;
};

// --- Esquemas zod (rechazo claro de archivos ajenos/corruptos) --------------

const metricsSchema = z.object({
  accuracy: z.number(),
  precision: z.number(),
  recall: z.number(),
  f1: z.number(),
  auc: z.number(),
});

const manifestSchema = z.object({
  app: z.object({ name: z.literal(APP_NAME), version: z.string() }),
  created_at: z.string(),
  dataset: z.object({
    name: z.string(),
    n_train: z.number().int(),
    n_test: z.number().int(),
  }),
  schema: z.object({
    numeric: z.array(z.string()),
    categorical: z.array(z.string()),
    target: z.string(),
    classes: z.array(z.string()).length(2),
    positive_class: z.string(),
  }),
  training_profile: z.object({
    numeric: z.record(
      z.string(),
      z.object({ min: z.number().nullable(), max: z.number().nullable() }),
    ),
    categorical: z.record(z.string(), z.array(z.string())),
  }),
  metrics: z.object({
    model: metricsSchema,
    baselines: z.object({ majority: metricsSchema, logistic: metricsSchema }),
  }),
  positive_rate: z.number(),
  verdict: z.object({
    level: z.enum(["beats", "ties", "loses"]),
    primaryMetric: z.enum(["accuracy", "precision", "recall", "f1", "auc"]),
    modelScore: z.number(),
    baselineScore: z.number(),
    delta: z.number(),
  }),
  leakage: z.array(
    z.object({
      column: z.string(),
      score: z.number(),
      reason: z.enum(["near-perfect-separation", "category-purity"]),
    }),
  ),
  versions: z.object({
    pyodide: z.string(),
    sklearn: z.string(),
    python: z.string(),
  }),
  payload_sha256: z.string(),
  payload_encoding: z.literal(PAYLOAD_ENCODING),
});

const modelFileSchema = z.object({
  format_version: z.literal(MODEL_FILE_FORMAT_VERSION),
  manifest: manifestSchema,
  payload: z.string().min(1),
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
  /** Inyectable para tests deterministas. */
  date?: Date;
};

export async function packModelFile(input: PackModelInput): Promise<ModelFile> {
  const { result, exported } = input;
  const payload_sha256 = await sha256Hex(base64ToBytes(exported.payload_b64));
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
  "invalid-json" | "invalid-format" | "unsupported-version" | "hash-mismatch";

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
 * (zod) → SHA-256 del payload contra el manifiesto. El payload NUNCA se
 * deserializa aquí; si algo falla, se rechaza sin tocarlo. Un mismatch de
 * versiones de runtime NO bloquea: devuelve warnings (advertencia honesta).
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
  const probe = z.object({ format_version: z.number() }).safeParse(raw);
  if (!probe.success) return { ok: false, error: "invalid-format" };
  if (probe.data.format_version !== MODEL_FILE_FORMAT_VERSION) {
    return { ok: false, error: "unsupported-version" };
  }

  const parsed = modelFileSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid-format" };
  const file = parsed.data;

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
