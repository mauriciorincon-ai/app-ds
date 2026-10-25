// S19 (ADR 027): el `.probeta.json` del ganador del Protocolo. Es una VARIANTE del archivo de modelo (`origin: "protocolo"`, mismo formato
// 1, mismo payload y mismo hash) que NO inventa lo que el Protocolo nunca midió —sin baselines, sin fuga, sin liga ni selección— y
// trae en su lugar un bloque `protocol` con lo que SÍ midió: el ganador, la métrica y su cifra en la prueba que la etapa 8 abrió una
// vez, las filas, la huella de los datos y el sello de la partición. Puntúa y se vigila en Probeta como cualquier otro. Vive en su
// propio módulo (se importa con `import()` al elegir un archivo de este tipo, o desde la etapa 10): ni la portada ni `/protocolo`
// cargan su validador. Una versión de la app anterior al S19 lo rechaza por su forma, que es lo correcto.
import { matchByTask, taskOf } from "@/engine/despacho";
import { isMemberOf, type MemberId } from "@/engine/roster";
import type { SupervisedTask } from "@/engine/tarea";
import { METRIC_RULES, type PrimaryMetric } from "@/engine/verdict";
import {
  APP_NAME,
  APP_VERSION,
  MAX_MODEL_FILE_BYTES,
  MODEL_FILE_FORMAT_VERSION,
  METRIC_NAMES,
  PAYLOAD_ENCODING,
  base64ToBytes,
  schemaV,
  versionWarnings,
  versionsV,
  type ModelFileErrorKind,
  type VersionWarning,
} from "@/lib/model-file";
import { sha256Hex } from "@/lib/sha256";
import {
  arr,
  check,
  int,
  isRecord,
  num,
  obj,
  oneOf,
  refine,
  str,
  type Validator,
} from "@/lib/validate";
import {
  multiclassClassesV,
  targetStatsV,
  trainingProfileV,
} from "@/workers/contract";
import type {
  BinaryModelSchema,
  ExportResult,
  MulticlassModelSchema,
  RegressionModelSchema,
  RuntimeVersions,
  TrainingProfile,
} from "@/workers/protocol";

export { MAX_MODEL_FILE_BYTES };

/**
 * Lo que el Protocolo midió del ganador. La cifra es la de la prueba que la etapa 8 abrió UNA vez (un punto: el archivo no guarda su
 * margen); la huella y el sello atan el archivo a los datos y a la partición del cuaderno.
 */
export type ProtocolBlock = {
  winner: MemberId;
  metric: PrimaryMetric;
  test_value: number;
  n_train: number;
  n_test: number;
  huella: string;
  sello: string;
};

export type ProtocolManifest = {
  origin: "protocolo";
  task: SupervisedTask;
  app: { name: typeof APP_NAME; version: string };
  created_at: string;
  dataset: { name: string; n_train: number; n_test: number };
  schema: BinaryModelSchema | MulticlassModelSchema | RegressionModelSchema;
  training_profile: TrainingProfile;
  protocol: ProtocolBlock;
  versions: RuntimeVersions;
  payload_sha256: string;
  payload_encoding: typeof PAYLOAD_ENCODING;
  model_name: MemberId;
};

export type ProtocolModelFile = {
  format_version: typeof MODEL_FILE_FORMAT_VERSION;
  manifest: ProtocolManifest;
  payload: string;
};

/** ¿Es de este tipo el texto de un `.probeta.json`? Mira solo el inicio: el manifiesto va antes del payload. */
export const esArchivoDelProtocolo = (texto: string): boolean =>
  /"origin"\s*:\s*"protocolo"/.test(texto.slice(0, 20_000));

// --- validar (import) — ANTES de deserializar ------------------------------------------------------

type ProtocolTask = Extract<
  SupervisedTask,
  "binaria" | "multiclase" | "numerica"
>;
const TAREAS: readonly ProtocolTask[] = ["binaria", "multiclase", "numerica"];
const HEX64 = /^[0-9a-f]{64}$/;

const ESQUEMA_V: Record<ProtocolTask, Validator> = {
  binaria: schemaV,
  multiclase: obj({
    numeric: arr(str),
    categorical: arr(str),
    target: str,
    classes: multiclassClassesV,
    task: oneOf(["multiclase"]),
  }),
  numerica: obj({
    numeric: arr(str),
    categorical: arr(str),
    target: str,
    task: oneOf(["numerica"]),
    target_stats: targetStatsV,
  }),
};

/** Las métricas con que el Protocolo mide el ganador de cada tarea. */
const METRICAS: Record<ProtocolTask, readonly string[]> = {
  binaria: METRIC_NAMES,
  multiclase: ["balanced_accuracy"],
  numerica: ["mae"],
};

const bloqueV = obj({
  winner: str,
  metric: oneOf(Object.keys(METRIC_RULES)),
  test_value: num,
  n_train: refine(int, (v) => (v as number) >= 1),
  n_test: refine(int, (v) => (v as number) >= 1),
  huella: refine(str, (v) => HEX64.test(v as string)),
  sello: refine(str, (v) => HEX64.test(v as string)),
});

const manifiestoV: Validator = (v, path) => {
  const en = (campo: string) => (path ? `${path}.${campo}` : campo);
  if (!isRecord(v)) return path;
  const tarea = v.task;
  if (
    typeof tarea !== "string" ||
    !(TAREAS as readonly string[]).includes(tarea)
  )
    return en("task");
  const k = tarea as ProtocolTask;
  const forma = obj({
    origin: oneOf(["protocolo"]),
    app: obj({ name: oneOf([APP_NAME]), version: str }),
    created_at: str,
    dataset: obj({ name: str, n_train: num, n_test: num }),
    schema: ESQUEMA_V[k],
    training_profile: trainingProfileV,
    protocol: bloqueV,
    versions: versionsV,
    payload_sha256: str,
    payload_encoding: oneOf([PAYLOAD_ENCODING]),
    model_name: (valor, p) => (isMemberOf(k, valor) ? null : p),
  })(v, path);
  if (forma) return forma;
  const m = v as unknown as ProtocolManifest;
  // lo que el resumen MUESTRA tiene que ser lo que el archivo puntúa
  if (m.protocol.winner !== m.model_name) return en("protocol.winner");
  if (!METRICAS[k].includes(m.protocol.metric)) return en("protocol.metric");
  return null;
};

const archivoV = obj({
  format_version: oneOf([MODEL_FILE_FORMAT_VERSION]),
  manifest: manifiestoV,
  payload: refine(str, (v) => (v as string).length > 0),
});

export type ProtocolFileValidation =
  | { ok: true; file: ProtocolModelFile; warnings: VersionWarning[] }
  | { ok: false; error: ModelFileErrorKind; field?: string };

export async function validateProtocolModelFile(
  texto: string,
): Promise<ProtocolFileValidation> {
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return { ok: false, error: "invalid-json" };
  }
  if (!isRecord(crudo)) return { ok: false, error: "invalid-format" };
  if (crudo.format_version !== MODEL_FILE_FORMAT_VERSION)
    return {
      ok: false,
      error:
        typeof crudo.format_version === "number"
          ? "unsupported-version"
          : "invalid-format",
    };
  const forma = check<ProtocolModelFile>(archivoV, crudo);
  if (!forma.ok)
    return { ok: false, error: "invalid-format", field: forma.field };
  const file = forma.value;
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(file.payload);
  } catch {
    return { ok: false, error: "invalid-format" };
  }
  if ((await sha256Hex(bytes)) !== file.manifest.payload_sha256)
    return { ok: false, error: "hash-mismatch" };
  return { ok: true, file, warnings: versionWarnings(file.manifest.versions) };
}

// --- empaquetar (la etapa 10) -----------------------------------------------------------------------

export type PackProtocolInput = {
  datasetName: string;
  /** Lo que el worker entregó al exportar el ganador reajustado (esquema, perfil de entrenamiento y payload). */
  exported: ExportResult;
  protocol: ProtocolBlock;
  /** Inyectable para tests deterministas. */
  date?: Date;
};

/**
 * El archivo del ganador del Protocolo. El esquema exportado tiene que ser de una tarea con objetivo y el ganador del bloque es el
 * modelo del archivo. No lleva una sola fila: el esquema, el perfil de entrenamiento (rangos y categorías, como todo archivo de
 * modelo), el modelo y las cifras del bloque.
 */
export async function packProtocolModelFile(
  input: PackProtocolInput,
): Promise<ProtocolModelFile> {
  const { exported, protocol } = input;
  const schema = matchByTask(exported.schema, {
    binaria: (s) => s,
    multiclase: (s) => s,
    numerica: (s) => s,
    agrupar: (): never => {
      throw new Error("packProtocolModelFile: el Protocolo no agrupa");
    },
  });
  const manifest: ProtocolManifest = {
    origin: "protocolo",
    task: taskOf(exported.schema) as SupervisedTask,
    app: { name: APP_NAME, version: APP_VERSION },
    created_at: (input.date ?? new Date()).toISOString(),
    dataset: {
      name: input.datasetName,
      n_train: protocol.n_train,
      n_test: protocol.n_test,
    },
    schema,
    training_profile: exported.training_profile,
    protocol,
    versions: exported.versions,
    payload_sha256: await sha256Hex(base64ToBytes(exported.payload_b64)),
    payload_encoding: PAYLOAD_ENCODING,
    model_name: protocol.winner,
  };
  return {
    format_version: MODEL_FILE_FORMAT_VERSION,
    manifest,
    payload: exported.payload_b64,
  };
}
