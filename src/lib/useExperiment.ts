"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  matchByTask,
  matchTask,
  taskOf,
} from "@/engine/despacho";
import type { LeakageFinding } from "@/engine/leakage";
import { computeEdaAlerts, idLikeAlerts, type EdaAlert } from "@/engine/eda";
import { sanitizeTable, type SanitationReport } from "@/engine/sanitize";
import { parseCsvWithLimits, type CsvTable } from "@/lib/ds/csv";
import {
  checkSchema,
  modelFeatures,
  type SchemaCheck,
} from "@/lib/ds/schema-check";
import {
  measuredRun,
  planLevel2,
  type RouteProfile,
  type Routing,
} from "@/engine/encarrilador";
import {
  isTrainableTask,
  isTrainTask,
  resolveTask,
  type AmbiguousChoice,
  type SupervisedTask,
  type Task,
  type TaskDetection,
  type TrainTask,
} from "@/engine/tarea";
import {
  applyClusterMemberFit,
  applyMemberFit,
  applyMulticlassMemberFit,
  applyRegressionMemberFit,
  assembleClusterResult,
  assembleMulticlassResult,
  assembleRegressionResult,
  assembleResult,
  clusterScoringSchema,
  clusterSent,
  clusterSentOf,
  inferUnit,
  prepareClusterRun,
  prepareRun,
  summarizeDataset,
  testClassCounts,
  withoutClusterLeague,
  withoutLeague,
  type ClusterExclusion,
  type PreparedClusterRun,
  type PreparedRun,
} from "@/lib/experiment";
import { downloadTextFile } from "@/lib/files";
import { buildScoredCsv, scoredCsvFileName } from "@/lib/scored-csv";
import {
  modelFileName,
  packModelFile,
  type ModelFile,
  type ModelManifest,
} from "@/lib/model-file";
import {
  recordLeagueRun,
  reportExperimentError,
  reportExportError,
  reportImportError,
  reportScoringError,
} from "@/lib/observability";
import { byPriority, type MemberId } from "@/engine/roster";
import {
  pythonContractField,
  pythonLeagueEmpty,
  validateClusterLabels,
  validateClusterMemberFit,
  validateClusterResult,
  validateClusterScore,
  validateExportResult,
  validateMemberFit,
  validateProgressDetail,
  validateScoreResult,
  validateTrainResult,
  type TrainSent,
} from "@/workers/contract";
import type {
  BinaryModelSchema,
  ClusterDistance,
  ClusterPayload,
  DatasetSummary,
  ExperimentResult,
  ExportResult,
  MulticlassModelSchema,
  PipelinePayload,
  ProgressDetail,
  ProgressStage,
  RegressionModelSchema,
  RunnerResponse,
  ScorePayload,
  ScoreResult,
  ScoringSchema,
  TargetUnit,
  WorkerErrorKind,
} from "@/workers/protocol";

export type ExperimentPhase =
  "empty" | "configuring" | "running" | "results" | "error" | "scoring";

/** Metadatos del run que consumen la narración y la model card (S2). */
export type RunMeta = {
  /** S7: null al agrupar (no hay objetivo). */
  target: string | null;
  numericFeatures: number;
  categoricalFeatures: number;
  seed: number;
  /** S7: al agrupar, las columnas que no entraron, con su razón (ninguna se esconde). */
  excluded?: ClusterExclusion[];
};

/** De dónde salió el modelo activo (S3): entrenado aquí o importado. */
export type ModelSource = "trained" | "imported";

export type ModelMeta = {
  source: ModelSource;
  /** S6: por tarea (con clases en binaria; con el objetivo en train al estimar).
   *  S7: al agrupar, la regla sin centroides (viven en el worker, P12). */
  schema: ScoringSchema;
  datasetName: string;
  /** Solo `imported`: manifiesto validado, para el resumen honesto. */
  manifest: ModelManifest | null;
};

export type ScoringErrorKind =
  | "csv-empty"
  | "csv-too-large"
  | "csv-too-many-rows"
  | "csv-ragged"
  | "csv-semicolon"
  | "csv-tab"
  | "runtime"
  | "import-failed";

/** Sub-estado de la pantalla "Usar el modelo" (los 4 estados de la orden). */
export type ScoringState =
  | { status: "idle" }
  | { status: "blocked"; check: SchemaCheck; fileName: string }
  | { status: "running"; progress: ProgressStage | null }
  | {
      status: "scored";
      check: SchemaCheck;
      fileName: string;
      table: CsvTable;
      score: ScoreResult;
    }
  | { status: "error"; kind: ScoringErrorKind };

export type ExportState = "idle" | "exporting" | "error";

/** S5: lo que la app sabe del objetivo ANTES de entrenar (E1 + E2). */
export type TargetPlan = {
  target: string;
  task: TaskDetection;
  /** S6 (D2): la respuesta a «¿clases o cantidad?» (solo en una ambigua). */
  choice: AmbiguousChoice | null;
  /** La tarea con que se entrenaría: la detectada o, si era ambigua, la respondida. */
  resolved: Task;
  /** Solo al estimar: la unidad leída del nombre de la columna (P5). */
  unit: TargetUnit | null;
  /** Solo si la tarea se entrena y prepareRun pudo armarla: quién compite y en qué nivel. */
  routing: Routing | null;
  /** Forma del dataset para E2 (filas, ancho, minoritaria, k). */
  profile: RouteProfile | null;
  smallSample: boolean;
  /** Entrenable pero sin CV honesta posible u otro rechazo de prepareRun. */
  blocked: WorkerErrorKind | null;
  /** S7 (P4): con `too-few-rows-per-class`, la categoría más chica y sus filas de
   *  train — se nombra EN PANTALLA (dato del usuario), jamás en un log. */
  smallestClass: { name: string; trainRows: number } | null;
};

/** S7 (P5): lo que la app sabe de AGRUPAR antes de correr: qué columnas forman la
 *  distancia, cuáles quedan fuera y por qué, y quién compite en qué nivel. */
export type ClusterPlan =
  | {
      ok: true;
      rows: number;
      numeric: string[];
      categorical: string[];
      distance: ClusterDistance;
      excluded: ClusterExclusion[];
      routing: Routing;
      profile: RouteProfile;
      smallSample: boolean;
    }
  | { ok: false; error: WorkerErrorKind };

/** S7 (P13): la descarga de las filas con su grupo. Las etiquetas no se guardan en
 *  el estado: se piden al worker, se escriben al CSV y se olvidan. */
export type LabelsState = "idle" | "fetching" | "error" | "unavailable";

/** Los nombres localizados del CSV con el grupo de cada fila (los pone la UI). */
export type LabelsNames = {
  column: string;
  noise: string;
  fileSuffix: string;
};

/** S5 (U1): elección manual de un miembro de la liga. */
export type ChoiceState =
  | { status: "idle" }
  | { status: "fitting"; member: MemberId }
  | { status: "error"; member: MemberId };

/**
 * S5: el Nivel 2 (D5 + U3 + R1). Mientras corre se puede cancelar; si se cancela
 * o falla, vuelve el resultado del Nivel 1 y su modelo se restaura desde la
 * instantánea exportada ANTES de arrancar.
 */
export type Level2State =
  | { status: "idle" }
  | { status: "running"; count: number; estimateS: number }
  | { status: "cancelled" }
  | { status: "failed" }
  | { status: "restore-failed" };

export type ExperimentState = {
  phase: ExperimentPhase;
  datasetName: string | null;
  dataset: DatasetSummary | null;
  progress: ProgressStage | null;
  /** S5: modelo a modelo durante la liga (validado por contract.ts). */
  progressDetail: ProgressDetail | null;
  result: ExperimentResult | null;
  runMeta: RunMeta | null;
  error: { kind: WorkerErrorKind; message: string } | null;
  // S4 — saneamiento (fijado UNA vez en loadCsv) + alertas EDA por objetivo elegido.
  sanitation: SanitationReport | null;
  edaAlerts: EdaAlert[] | null;
  // S5 — la liga: el plan del objetivo elegido, el reparto con que se entrenó y
  // la elección manual en curso.
  plan: TargetPlan | null;
  /** S7: el plan de agrupar (sin objetivo), si se eligió agrupar. */
  clusterPlan: ClusterPlan | null;
  /** S7 (P13): la descarga de las filas con su grupo. */
  labels: LabelsState;
  routing: Routing | null;
  /** Forma del dataset con que se entrenó (para planear el Nivel 2). */
  profile: RouteProfile | null;
  /** «Fuera» que el usuario incluyó de todos modos en la liga vigente (U3). */
  forced: MemberId[];
  level2: Level2State;
  choice: ChoiceState;
  // S3 — el modelo se usa:
  modelMeta: ModelMeta | null;
  /** false mientras un import está deserializando en el worker. */
  modelReady: boolean;
  scoring: ScoringState;
  exportState: ExportState;
};

const INITIAL: ExperimentState = {
  phase: "empty",
  datasetName: null,
  dataset: null,
  progress: null,
  progressDetail: null,
  result: null,
  runMeta: null,
  error: null,
  sanitation: null,
  edaAlerts: null,
  plan: null,
  clusterPlan: null,
  labels: "idle",
  routing: null,
  profile: null,
  forced: [],
  level2: { status: "idle" },
  choice: { status: "idle" },
  modelMeta: null,
  modelReady: false,
  scoring: { status: "idle" },
  exportState: "idle",
};

const SEED = 42;

const CSV_ERROR: Record<string, WorkerErrorKind & ScoringErrorKind> = {
  empty: "csv-empty",
  "too-large": "csv-too-large",
  "too-many-rows": "csv-too-many-rows",
  ragged: "csv-ragged",
  "semicolon-delimiter": "csv-semicolon",
  "tab-delimiter": "csv-tab",
};

// Qué esperaba cada mensaje en vuelo. Mapa por id (no un único pending): un
// mensaje tardío de un comando viejo no puede pisar el estado del actual.
type ReadyRun = Extract<PreparedRun, { ok: true }>;
type ReadyClusterRun = Extract<PreparedClusterRun, { ok: true }>;

/** El payload de una liga: con objetivo o (S7) agrupando. */
type LeaguePayload = PipelinePayload | ClusterPayload;

type TrainPending = {
  kind: "train";
  /** S6: la tarea (el breadcrumb `probeta.league` la lleva; nunca un valor). */
  task: TrainTask;
  /** Quiénes compiten en ESTA corrida (los cuenta la cancelación). */
  roster: readonly MemberId[];
  smallSample: boolean;
  // S5: el reparto y los forzados de ESTA corrida (se fijan solo si termina).
  level: 1 | 2;
  routing: Routing;
  forced: MemberId[];
  /** Lo que el lector del contrato coteja y con qué se arma el resultado. */
  run:
    | {
        cluster: false;
        leakage: LeakageFinding[];
        features: { numeric: string[]; categorical: string[]; target: string };
        // S5: lo enviado, para que el lector lo coteje (S6: con la tarea).
        sent: TrainSent & { task: SupervisedTask };
      }
    // S7: agrupar — lo enviado (sin objetivo) para el lector y el esquema.
    | { cluster: true; payload: ClusterPayload };
};

type Pending =
  | TrainPending
  // S5 (R1): la instantánea del modelo del Nivel 1, antes de arrancar el Nivel 2.
  | {
      kind: "snapshot";
      next: TrainPending;
      payload: LeaguePayload;
      forced: MemberId[];
    }
  // S5 (R1): restaurar esa instantánea tras cancelar o fallar el Nivel 2.
  | { kind: "restore" }
  | {
      kind: "score";
      /** El esquema del modelo activo: su tarea (y, con varias categorías, sus
       *  clases) dice qué forma exige el lector. */
      schema: ScoringSchema;
      check: SchemaCheck;
      fileName: string;
      table: CsvTable;
    }
  | { kind: "export-model"; datasetName: string; result: ExperimentResult }
  | { kind: "import-model" }
  | { kind: "fit-member"; member: MemberId }
  // S7 (P13): las etiquetas por fila, para el CSV local (y se olvidan).
  | {
      kind: "cluster-labels";
      table: CsvTable;
      datasetName: string;
      groups: number;
      noise: boolean;
      names: LabelsNames;
    };

/** Lo que queda en vuelo al mandar una liga: lo enviado y con qué se armó. */
function trainPending(
  prepared: ReadyRun,
  level: 1 | 2,
  forced: MemberId[],
): TrainPending {
  const { payload } = prepared;
  return {
    kind: "train",
    task: payload.task,
    roster: payload.roster,
    smallSample: prepared.smallSample,
    level,
    routing: prepared.routing,
    forced,
    run: {
      cluster: false,
      leakage: prepared.leakage,
      features: {
        numeric: payload.numeric,
        categorical: payload.categorical,
        target: payload.target,
      },
      sent: {
        task: payload.task,
        roster: payload.roster,
        cv_k: payload.cv_k,
        primary_metric: payload.primary_metric,
        // S7: con varias categorías, las clases enviadas y las filas de prueba de
        // cada una (el lector coteja con ellas la matriz K×K).
        ...(payload.classes
          ? { classes: payload.classes, testCounts: testClassCounts(payload) }
          : {}),
      },
    },
  };
}

/** S7: lo que queda en vuelo al mandar la liga de AGRUPAR. */
function clusterPending(
  prepared: ReadyClusterRun,
  level: 1 | 2,
  forced: MemberId[],
): TrainPending {
  return {
    kind: "train",
    task: prepared.payload.task,
    roster: prepared.payload.roster,
    smallSample: prepared.smallSample,
    level,
    routing: prepared.routing,
    forced,
    run: { cluster: true, payload: prepared.payload },
  };
}

type Accepted =
  | {
      ok: true;
      assembled: ExperimentResult;
      schema: ScoringSchema;
      elapsedMs: number;
    }
  | { ok: false; field: string };

/** El resultado de una liga, validado por el lector del contrato (regla 15) y
 *  ensamblado según su tarea, con el esquema con que se puntuará. */
function acceptTrain(pending: TrainPending, raw: unknown): Accepted {
  const { run } = pending;
  if (run.cluster) {
    const checked = validateClusterResult(raw, clusterSent(run.payload));
    if (!checked.ok) return checked;
    const assembled = assembleClusterResult(checked.value, pending.smallSample);
    return {
      ok: true,
      assembled,
      schema: clusterScoringSchema(assembled, run.payload),
      elapsedMs: checked.value.elapsed_ms,
    };
  }
  const checked = validateTrainResult(raw, run.sent);
  if (!checked.ok) return checked;
  const py = checked.value;
  const { assembled, schema } = matchByTask(py, {
    binaria: (binary) => ({
      assembled: assembleResult(binary, run.leakage, pending.smallSample),
      schema: {
        ...run.features,
        classes: binary.classes,
        positive_class: binary.positive_class,
      } satisfies BinaryModelSchema,
    }),
    multiclase: (multi) => ({
      assembled: assembleMulticlassResult(
        multi,
        run.leakage,
        pending.smallSample,
      ),
      schema: {
        ...run.features,
        classes: multi.classes,
        task: "multiclase",
      } satisfies MulticlassModelSchema,
    }),
    numerica: (regression) => ({
      assembled: assembleRegressionResult(
        regression,
        run.leakage,
        run.features.target,
        pending.smallSample,
      ),
      schema: {
        ...run.features,
        task: "numerica",
        target_stats: regression.target_stats,
      } satisfies RegressionModelSchema,
    }),
  });
  return { ok: true, assembled, schema, elapsedMs: py.elapsed_ms };
}

/** S7: el plan de agrupar, sin el payload (las filas no se guardan dos veces). */
function clusterPlanOf(prepared: PreparedClusterRun): ClusterPlan {
  if (!prepared.ok) return { ok: false, error: prepared.error };
  const { payload } = prepared;
  return {
    ok: true,
    rows: payload.rows.length,
    numeric: payload.numeric,
    categorical: payload.categorical,
    distance: payload.distance,
    excluded: prepared.excluded,
    routing: prepared.routing,
    profile: prepared.profile,
    smallSample: prepared.smallSample,
  };
}

/**
 * S6: el resultado de fit-member, validado por el lector del contrato y aplicado
 * según la tarea del resultado vigente (el veredicto pasa a hablar del elegido).
 */
type Applied =
  | { ok: true; value: ExperimentResult }
  | { ok: false; field: string };

function applyFit(
  current: ExperimentResult,
  raw: unknown,
  member: MemberId,
): Applied {
  return matchByTask(current, {
    binaria: (binary): Applied => {
      const checked = validateMemberFit(raw, { member });
      return checked.ok
        ? { ok: true, value: applyMemberFit(binary, checked.value) }
        : checked;
    },
    multiclase: (multi): Applied => {
      const checked = validateMemberFit(raw, {
        member,
        task: "multiclase",
        nTest: multi.nTest,
        classes: multi.classes,
        // Filas de prueba por clase = filas de la matriz vigente (la partición
        // no cambia al elegir a mano).
        testCounts: multi.perClass.map((c) => c.support),
      });
      return checked.ok
        ? { ok: true, value: applyMulticlassMemberFit(multi, checked.value) }
        : checked;
    },
    numerica: (regression): Applied => {
      const checked = validateMemberFit(raw, {
        member,
        task: "numerica",
        nTest: regression.nTest,
      });
      return checked.ok
        ? {
            ok: true,
            value: applyRegressionMemberFit(regression, checked.value),
          }
        : checked;
    },
    // S7: el elegido se coteja con SU fila de la liga vigente (mismo k y puntaje).
    agrupar: (cluster): Applied => {
      const row = cluster.league.find((r) => r.name === member);
      if (!row) return { ok: false, field: "model_name" };
      const checked = validateClusterMemberFit(raw, {
        ...clusterSentOf(cluster),
        member,
        row,
      });
      return checked.ok
        ? { ok: true, value: applyClusterMemberFit(cluster, checked.value) }
        : checked;
    },
  });
}

/**
 * S5: E1 (tarea) y, si se entrena, E2 (quién compite) para el objetivo elegido.
 * S6: una ambigua se planea con la respuesta del usuario (sin ella, pregunta).
 */
function planTarget(
  table: CsvTable,
  target: string,
  dataset: DatasetSummary,
  choice: AmbiguousChoice | null,
): TargetPlan | null {
  const task = dataset.targetTasks[target];
  if (!task) return null;
  const resolved = resolveTask(task, choice);
  const plan: TargetPlan = {
    target,
    task,
    choice: task.task === "ambigua" ? choice : null,
    resolved,
    unit: isTrainTask(resolved)
      ? matchTask(resolved, {
          binaria: () => null,
          multiclase: () => null,
          numerica: () => inferUnit(target),
        })
      : null,
    routing: null,
    profile: null,
    smallSample: false,
    blocked: null,
    smallestClass: null,
  };
  if (!isTrainableTask(resolved)) return plan;
  const prepared = prepareRun(table, target, SEED, { ambiguousChoice: choice });
  return prepared.ok
    ? {
        ...plan,
        routing: prepared.routing,
        profile: prepared.profile,
        smallSample: prepared.smallSample,
      }
    : {
        ...plan,
        blocked: prepared.error,
        smallestClass: prepared.smallestClass ?? null,
      };
}

/** Las alertas EDA hablan de la tarea con que se entrenaría. Sin una tarea que se
 *  entrene, solo las que no dependen de ella (ninguna se supone por descarte). */
function edaFor(table: CsvTable, plan: TargetPlan | null, target: string) {
  if (!plan || !isTrainTask(plan.resolved)) {
    return idLikeAlerts(table, target);
  }
  return computeEdaAlerts(table, target, plan.resolved);
}

// Gestiona el runner de Pyodide y la máquina de estados del experimento. El
// parseo/perfilado/split/veredicto/fuga/esquema/manifiesto corren aquí (puro,
// testeado); el runner solo entrena, puntúa y (de)serializa el modelo. El
// worker vive toda la sesión: el _MODEL de pipeline.py sobrevive entre fases.
export function useExperiment() {
  const workerRef = useRef<Worker | null>(null);
  const nextId = useRef(0);
  const tableRef = useRef<CsvTable | null>(null);
  // Reporte de saneamiento del dataset activo (para adjuntarlo al export).
  const sanitationRef = useRef<SanitationReport | null>(null);
  const pendingRef = useRef(new Map<number, Pending>());
  // Espejos para leer en callbacks sin closures obsoletas (patrón tableRef).
  const modelRef = useRef<ModelMeta | null>(null);
  const resultRef = useRef<ExperimentResult | null>(null);
  const datasetNameRef = useRef<string | null>(null);
  // S5: el último payload de la liga (para fit-member y el Nivel 2). S7: o el de
  // agrupar.
  const payloadRef = useRef<LeaguePayload | null>(null);
  // S6 (D2): la respuesta a «¿clases o cantidad?» del objetivo elegido.
  const choiceRef = useRef<AmbiguousChoice | null>(null);
  // S5 (R1): lo que vuelve si el Nivel 2 se cancela o falla.
  const level1Ref = useRef<{
    result: ExperimentResult;
    routing: Routing | null;
    forced: MemberId[];
    payload: LeaguePayload;
    meta: ModelMeta;
    snapshot: ExportResult | null;
  } | null>(null);
  const routingRef = useRef<Routing | null>(null);
  const forcedRef = useRef<MemberId[]>([]);
  // El spawn vive dentro del efecto; cancelar lo necesita desde fuera.
  const respawnRef = useRef<(() => void) | null>(null);
  const [state, setState] = useState<ExperimentState>(INITIAL);

  /**
   * S5 (R1): vuelve al resultado del Nivel 1. Si hay instantánea, el modelo se
   * re-importa (el worker pudo morir, ser terminado o quedar con el ganador del
   * Nivel 2); sin instantánea, el worker conserva el del Nivel 1 — salvo que
   * haya muerto (`modelLost`), y entonces se dice que no se pudo recuperar.
   */
  const restoreLevel1 = useCallback(
    (notice: "cancelled" | "failed", modelLost: boolean) => {
      const l1 = level1Ref.current;
      level1Ref.current = null;
      if (!l1) return;
      payloadRef.current = l1.payload;
      resultRef.current = l1.result;
      modelRef.current = l1.meta;
      routingRef.current = l1.routing;
      forcedRef.current = l1.forced;
      if (l1.snapshot) {
        const id = nextId.current++;
        pendingRef.current.set(id, { kind: "restore" });
        workerRef.current?.postMessage({
          id,
          type: "import-model",
          payload: {
            payload_b64: l1.snapshot.payload_b64,
            expected_schema: l1.snapshot.schema,
          },
        });
      }
      setState((s) => ({
        ...s,
        phase: "results",
        progress: null,
        progressDetail: null,
        error: null,
        result: l1.result,
        routing: l1.routing,
        forced: l1.forced,
        modelMeta: l1.meta,
        modelReady: !l1.snapshot && !modelLost,
        level2: {
          status: !l1.snapshot && modelLost ? "restore-failed" : notice,
        },
      }));
    },
    [],
  );

  useEffect(() => {
    const finishExport = async (
      pending: Extract<Pending, { kind: "export-model" }>,
      exported: ExportResult,
    ) => {
      try {
        const file = await packModelFile({
          datasetName: pending.datasetName,
          result: pending.result,
          exported,
          sanitation: sanitationRef.current ?? undefined,
        });
        downloadTextFile(
          modelFileName(pending.datasetName),
          JSON.stringify(file, null, 2),
          "application/json",
        );
        setState((s) => ({ ...s, exportState: "idle" }));
      } catch {
        reportExportError("pack");
        setState((s) => ({ ...s, exportState: "error" }));
      }
    };

    // Solo conteos (regla dura 2).
    const tableSize = () => {
      const table = tableRef.current;
      return table
        ? { rows: table.rows.length, cols: table.headers.length }
        : undefined;
    };

    // Falla honesta del entrenamiento: a Sentry van SOLO el tipo y el tamaño (el
    // campo del contrato es un nombre de la app, nunca un valor del dataset).
    const failTrain = (kind: WorkerErrorKind, message: string) => {
      reportExperimentError(
        kind === "contract" ? `contract:${message}` : kind,
        tableSize(),
      );
      setState((s) => ({
        ...s,
        phase: "error",
        progressDetail: null,
        error: { kind, message },
      }));
    };

    const handleMessage = (event: MessageEvent<RunnerResponse>) => {
      const message = event.data;
      const pending = pendingRef.current.get(message.id);
      if (!pending) return;

      if (message.type === "progress") {
        if (pending.kind === "train") {
          // Un detalle que no cuadra con el contrato no se pinta (se ignora: el
          // progreso es informativo; el resultado sí se rechaza).
          const detail =
            message.detail === undefined
              ? null
              : validateProgressDetail(message.detail);
          setState((s) => ({
            ...s,
            phase: "running",
            progress: message.stage,
            progressDetail: detail?.ok ? detail.value : s.progressDetail,
          }));
        } else if (pending.kind === "score") {
          setState((s) => ({
            ...s,
            scoring: { status: "running", progress: message.stage },
          }));
        } else if (pending.kind === "import-model") {
          setState((s) => ({ ...s, progress: message.stage }));
        }
        return;
      }

      pendingRef.current.delete(message.id);

      if (message.type === "error") {
        console.error("[experiment] runtime", message.message);
        if (pending.kind === "train" && pending.level === 2) {
          // El Nivel 2 falló: vuelve el Nivel 1, no la pantalla de error.
          reportExperimentError("level2-runtime", tableSize());
          restoreLevel1("failed", false);
        } else if (pending.kind === "snapshot") {
          // Sin instantánea no se arranca: el worker conserva el modelo.
          reportExportError("snapshot");
          restoreLevel1("failed", false);
        } else if (pending.kind === "restore") {
          reportImportError("restore");
          setState((s) => ({
            ...s,
            modelReady: false,
            level2: { status: "restore-failed" },
          }));
        } else if (pending.kind === "train") {
          // S5: ninguna fila de la liga concluyó — no hay ganador que defender, y
          // «intenta de nuevo» sería falso (AU-S5-23).
          if (pythonLeagueEmpty(message.message)) {
            failTrain("league-empty", "league-empty");
            return;
          }
          // S5: Python rechazó el payload nombrando el campo (contract:<campo>).
          const field = pythonContractField(message.message);
          failTrain(
            field ? "contract" : "runtime",
            field ? `payload.${field}` : message.message,
          );
        } else if (pending.kind === "score") {
          reportScoringError("runtime", {
            rows: pending.table.rows.length,
            cols: pending.table.headers.length,
          });
          setState((s) => ({
            ...s,
            scoring: { status: "error", kind: "runtime" },
          }));
        } else if (pending.kind === "export-model") {
          reportExportError("runtime");
          setState((s) => ({ ...s, exportState: "error" }));
        } else if (pending.kind === "fit-member") {
          // Python falló ANTES de retener: el modelo activo sigue siendo el de antes.
          reportExperimentError("fit-member");
          setState((s) => ({
            ...s,
            modelReady: true,
            choice: { status: "error", member: pending.member },
          }));
        } else if (pending.kind === "cluster-labels") {
          // S7: tras restaurar el Nivel 1 (o en un modelo importado) el worker no
          // guarda etiquetas: se dice, en vez de un error genérico.
          reportExportError("labels");
          setState((s) => ({
            ...s,
            labels: message.message.includes("no-labels")
              ? "unavailable"
              : "error",
          }));
        } else {
          reportImportError("runtime");
          setState((s) => ({
            ...s,
            progress: null,
            scoring: { status: "error", kind: "import-failed" },
          }));
        }
        return;
      }

      // result — cada comando actualiza SOLO su tajada del estado, y solo
      // después de que contract.ts valide la forma (regla 15).
      if (message.command === "train" && pending.kind === "train") {
        const checked = acceptTrain(pending, message.result);
        if (!checked.ok) {
          console.error("[experiment] contract", checked.field);
          if (pending.level === 2) {
            reportExperimentError(`contract:${checked.field}`, tableSize());
            restoreLevel1("failed", false);
          } else {
            failTrain("contract", checked.field);
          }
          return;
        }
        const { assembled, schema } = checked;
        const meta: ModelMeta = {
          source: "trained",
          schema,
          datasetName: datasetNameRef.current ?? "dataset",
          manifest: null,
        };
        modelRef.current = meta;
        resultRef.current = assembled;
        // El reparto y los forzados quedan fijos solo cuando la corrida termina.
        routingRef.current = pending.routing;
        forcedRef.current = pending.forced;
        level1Ref.current = null;
        recordLeagueRun({
          task: pending.task,
          ...tableSize(),
          competitors: assembled.league.length,
          level: pending.level,
          elapsedMs: checked.elapsedMs,
          cancelled: false,
        });
        setState((s) => ({
          ...s,
          phase: "results",
          progressDetail: null,
          result: assembled,
          routing: pending.routing,
          forced: pending.forced,
          level2: { status: "idle" },
          modelMeta: meta,
          modelReady: true,
          labels: "idle",
        }));
      } else if (
        message.command === "export-model" &&
        pending.kind === "snapshot"
      ) {
        // R1: con la instantánea en mano, recién ahora arranca el Nivel 2.
        const checked = validateExportResult(message.result);
        const l1 = level1Ref.current;
        if (!checked.ok || !l1) {
          reportExportError(
            checked.ok ? "snapshot" : `contract:${checked.field}`,
          );
          restoreLevel1("failed", false);
          return;
        }
        l1.snapshot = checked.value;
        const { next, payload } = pending;
        const trainId = nextId.current++;
        pendingRef.current.set(trainId, next);
        payloadRef.current = payload;
        workerRef.current?.postMessage({
          id: trainId,
          type: "train",
          payload,
        });
      } else if (
        message.command === "import-model" &&
        pending.kind === "restore"
      ) {
        setState((s) => ({ ...s, modelReady: true }));
      } else if (message.command === "score" && pending.kind === "score") {
        // S6: el lector exige la forma de la tarea del modelo activo.
        const checked = matchByTask(pending.schema, {
          binaria: () => validateScoreResult(message.result),
          multiclase: ({ classes }) =>
            validateScoreResult(message.result, {
              task: "multiclase",
              classes,
            }),
          numerica: () =>
            validateScoreResult(message.result, { task: "numerica" }),
          agrupar: (schema) => validateClusterScore(message.result, schema),
        });
        if (!checked.ok) {
          console.error("[experiment] contract", checked.field);
          reportScoringError(`contract:${checked.field}`);
          setState((s) => ({
            ...s,
            scoring: { status: "error", kind: "runtime" },
          }));
          return;
        }
        setState((s) => ({
          ...s,
          scoring: {
            status: "scored",
            check: pending.check,
            fileName: pending.fileName,
            table: pending.table,
            score: checked.value,
          },
        }));
      } else if (
        message.command === "export-model" &&
        pending.kind === "export-model"
      ) {
        const checked = validateExportResult(message.result);
        if (!checked.ok) {
          console.error("[experiment] contract", checked.field);
          reportExportError(`contract:${checked.field}`);
          setState((s) => ({ ...s, exportState: "error" }));
          return;
        }
        void finishExport(pending, checked.value);
      } else if (
        message.command === "import-model" &&
        pending.kind === "import-model"
      ) {
        setState((s) => ({ ...s, progress: null, modelReady: true }));
      } else if (
        message.command === "fit-member" &&
        pending.kind === "fit-member"
      ) {
        const current = resultRef.current;
        const checked = current
          ? applyFit(current, message.result, pending.member)
          : ({ ok: false, field: "result" } as const);
        if (!checked.ok) {
          console.error("[experiment] contract", checked.field);
          failTrain("contract", checked.field);
          return;
        }
        const chosen = checked.value;
        resultRef.current = chosen;
        // S7: al agrupar, el elegido trae su propio k y su regla: el esquema con
        // que se puntúa pasa a ser el suyo (con objetivo, las columnas no cambian).
        const payload = payloadRef.current;
        const meta = modelRef.current;
        const nextMeta =
          meta && payload
            ? matchByTask(chosen, {
                binaria: () => meta,
                multiclase: () => meta,
                numerica: () => meta,
                agrupar: (cluster) =>
                  matchByTask(payload, {
                    binaria: () => meta,
                    multiclase: () => meta,
                    numerica: () => meta,
                    agrupar: (clusterPayload) => ({
                      ...meta,
                      schema: clusterScoringSchema(cluster, clusterPayload),
                    }),
                  }),
              })
            : meta;
        modelRef.current = nextMeta;
        setState((s) => ({
          ...s,
          result: chosen,
          modelMeta: nextMeta,
          modelReady: true,
          choice: { status: "idle" },
          labels: "idle",
        }));
      } else if (
        message.command === "cluster-labels" &&
        pending.kind === "cluster-labels"
      ) {
        // P13: las etiquetas se validan, se escriben al CSV y se olvidan — no
        // pasan por el estado ni por ningún reporte.
        const checked = validateClusterLabels(message.result, {
          n_rows: pending.table.rows.length,
          groups: pending.groups,
          noise: pending.noise,
        });
        if (!checked.ok) {
          reportExportError(`contract:${checked.field}`);
          setState((s) => ({ ...s, labels: "error" }));
          return;
        }
        const { names } = pending;
        const csv = buildScoredCsv(
          pending.table,
          checked.value.labels.map((g) =>
            g === -1 ? names.noise : String(g + 1),
          ),
          null,
          { prediction: names.column, probability: "" },
        );
        downloadTextFile(
          scoredCsvFileName(pending.datasetName, names.fileSuffix),
          csv,
          "text/csv;charset=utf-8",
        );
        setState((s) => ({ ...s, labels: "idle" }));
      }
    };

    // Auditoría H1: si el worker muere no llega NINGÚN mensaje — sin esto la
    // UI quedaba en "running" para siempre. onerror cubre la carga fallida de
    // /pyodide-runner.js y los abortos del runtime WASM (p. ej. sin memoria en
    // un móvil con un dataset grande). Se falla todo comando en vuelo con un
    // error honesto y se re-crea el worker para que reintentar funcione.
    const handleWorkerDeath = (detail: string) => {
      console.error("[experiment] worker-dead", detail);
      const pendings = [...pendingRef.current.values()];
      pendingRef.current.clear();
      workerRef.current?.terminate();
      spawnWorker();
      for (const pending of pendings) {
        if (pending.kind === "train" && pending.level === 2) {
          // Se llevó al Nivel 2; la instantánea trae de vuelta al Nivel 1.
          reportExperimentError("level2-worker-dead", tableSize());
          restoreLevel1("failed", false);
        } else if (pending.kind === "snapshot") {
          // Murió antes de la instantánea: el modelo del Nivel 1 se perdió.
          reportExportError("snapshot-worker-dead");
          restoreLevel1("failed", true);
        } else if (pending.kind === "restore") {
          reportImportError("restore-worker-dead");
          setState((s) => ({
            ...s,
            modelReady: false,
            level2: { status: "restore-failed" },
          }));
        } else if (pending.kind === "train") {
          const table = tableRef.current;
          reportExperimentError(
            "worker-dead",
            table
              ? { rows: table.rows.length, cols: table.headers.length }
              : undefined,
          );
          setState((s) => ({
            ...s,
            phase: "error",
            error: { kind: "worker-dead", message: detail },
          }));
        } else if (pending.kind === "score") {
          reportScoringError("worker-dead", {
            rows: pending.table.rows.length,
            cols: pending.table.headers.length,
          });
          setState((s) => ({
            ...s,
            scoring: { status: "error", kind: "runtime" },
          }));
        } else if (pending.kind === "export-model") {
          reportExportError("worker-dead");
          setState((s) => ({ ...s, exportState: "error" }));
        } else if (pending.kind === "fit-member") {
          // El worker murió: el modelo retenido se perdió con él.
          reportExperimentError("worker-dead");
          setState((s) => ({
            ...s,
            phase: "error",
            error: { kind: "worker-dead", message: detail },
          }));
        } else if (pending.kind === "cluster-labels") {
          reportExportError("labels-worker-dead");
          setState((s) => ({ ...s, labels: "error" }));
        } else {
          reportImportError("worker-dead");
          setState((s) => ({
            ...s,
            progress: null,
            modelReady: false,
            scoring: { status: "error", kind: "import-failed" },
          }));
        }
      }
    };

    // Module worker real servido desde public/ (Pyodide exige module worker).
    function spawnWorker() {
      const worker = new Worker("/pyodide-runner.js", { type: "module" });
      worker.onmessage = handleMessage;
      worker.onerror = (event) =>
        handleWorkerDeath(event.message || "worker-error");
      worker.onmessageerror = () =>
        handleWorkerDeath("message-deserialization-failed");
      workerRef.current = worker;
    }

    spawnWorker();
    respawnRef.current = () => {
      workerRef.current?.terminate();
      spawnWorker();
    };

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      respawnRef.current = null;
    };
  }, [restoreLevel1]);

  const loadCsv = useCallback((csvText: string, name: string) => {
    const parsed = parseCsvWithLimits(csvText);
    if (!parsed.ok) {
      setState({
        ...INITIAL,
        phase: "error",
        datasetName: name,
        error: {
          kind: CSV_ERROR[parsed.error.kind],
          message: parsed.error.kind,
        },
      });
      return;
    }
    // S4: saneamiento estructural pre-split (dedup previene fuga por duplicación,
    // excluye ID/constantes, coacciona numéricas mixtas). Se fija UNA vez aquí.
    const { table, report } = sanitizeTable(parsed.table);
    if (!report.usable) {
      sanitationRef.current = report;
      setState({
        ...INITIAL,
        phase: "error",
        datasetName: name,
        sanitation: report,
        error: { kind: "csv-unusable", message: "csv-unusable" },
      });
      return;
    }
    tableRef.current = table;
    sanitationRef.current = report;
    datasetNameRef.current = name;
    setState({
      ...INITIAL,
      phase: "configuring",
      datasetName: name,
      dataset: summarizeDataset(table),
      sanitation: report,
    });
  }, []);

  // S4: alertas EDA para el objetivo elegido (posible fuga / id-like / desbalance).
  // Puras y baratas sobre la tabla saneada; se recomputan al cambiar el objetivo.
  const selectTarget = useCallback((targetColumn: string) => {
    const table = tableRef.current;
    // Un objetivo nuevo vuelve a preguntar (la respuesta era de la columna anterior).
    choiceRef.current = null;
    setState((s) => {
      const plan =
        table && targetColumn && s.dataset
          ? planTarget(table, targetColumn, s.dataset, null)
          : null;
      return {
        ...s,
        plan,
        clusterPlan: null,
        edaAlerts:
          table && targetColumn ? edaFor(table, plan, targetColumn) : null,
      };
    });
  }, []);

  /**
   * S7 (P5): elegir AGRUPAR en lugar de un objetivo. Se planea aparte (la rama
   * supervisada no se toca): qué columnas forman la distancia, cuáles quedan
   * fuera y por qué, y quién compite. Sin objetivo no hay alertas de objetivo.
   */
  const selectCluster = useCallback(() => {
    const table = tableRef.current;
    choiceRef.current = null;
    setState((s) => ({
      ...s,
      plan: null,
      edaAlerts: null,
      clusterPlan: table ? clusterPlanOf(prepareClusterRun(table, SEED)) : null,
    }));
  }, []);

  /**
   * S6 (D2): la respuesta a «¿clases o cantidad?» de una columna ambigua. Con
   * «cantidad» se planea la regresión; con «clases», la multiclase (S7: entrena).
   * null vuelve a preguntar.
   */
  const answerTask = useCallback((choice: AmbiguousChoice | null) => {
    const table = tableRef.current;
    setState((s) => {
      if (!table || !s.plan || !s.dataset || s.plan.task.task !== "ambigua") {
        return s;
      }
      choiceRef.current = choice;
      const plan = planTarget(table, s.plan.target, s.dataset, choice);
      return { ...s, plan, edaAlerts: edaFor(table, plan, s.plan.target) };
    });
  }, []);

  /** Manda una liga (Nivel 1): con objetivo o agrupando, la misma máquina. */
  const launch = useCallback(
    (
      pending: TrainPending,
      prepared: {
        payload: LeaguePayload;
        routing: Routing;
        profile: RouteProfile;
      },
      runMeta: RunMeta,
    ) => {
      const id = nextId.current++;
      pendingRef.current.set(id, pending);
      modelRef.current = null;
      resultRef.current = null;
      payloadRef.current = prepared.payload;
      routingRef.current = prepared.routing;
      forcedRef.current = [];
      level1Ref.current = null;
      setState((s) => ({
        ...s,
        phase: "running",
        progress: null,
        progressDetail: null,
        error: null,
        result: null,
        routing: prepared.routing,
        profile: prepared.profile,
        forced: [],
        level2: { status: "idle" },
        choice: { status: "idle" },
        modelMeta: null,
        modelReady: false,
        scoring: { status: "idle" },
        exportState: "idle",
        labels: "idle",
        runMeta,
      }));
      workerRef.current?.postMessage({
        id,
        type: "train",
        payload: prepared.payload,
      });
    },
    [],
  );

  const run = useCallback((targetColumn: string) => {
    const table = tableRef.current;
    if (!table) return;

    const prepared = prepareRun(table, targetColumn, SEED, {
      ambiguousChoice: choiceRef.current,
    });
    if (!prepared.ok) {
      setState((s) => ({
        ...s,
        phase: "error",
        error: { kind: prepared.error, message: prepared.error },
      }));
      return;
    }

    launch(trainPending(prepared, 1, []), prepared, {
      target: targetColumn,
      numericFeatures: prepared.payload.numeric.length,
      categoricalFeatures: prepared.payload.categorical.length,
      seed: SEED,
    });
  }, [launch]);

  /** S7 (ADR 016): agrupar las filas, sin objetivo ni partición. */
  const runCluster = useCallback(() => {
    const table = tableRef.current;
    if (!table) return;
    const prepared = prepareClusterRun(table, SEED);
    if (!prepared.ok) {
      setState((s) => ({
        ...s,
        phase: "error",
        error: { kind: prepared.error, message: prepared.error },
      }));
      return;
    }
    launch(clusterPending(prepared, 1, []), prepared, {
      target: null,
      numericFeatures: prepared.payload.numeric.length,
      categoricalFeatures: prepared.payload.categorical.length,
      seed: SEED,
      excluded: prepared.excluded,
    });
  }, [launch]);

  /**
   * S5 (U1): elegir a mano un miembro de la liga. El worker lo ajusta en train
   * completo (mismo split y semilla ⇒ su fila de la liga, exacta) y lo retiene
   * en lugar del ganador; el veredicto pasa a hablar de él, etiquetado «elegido
   * por ti». Elegir al ganador de la CV devuelve la selección a «cv».
   */
  const chooseMember = useCallback((member: MemberId) => {
    const payload = payloadRef.current;
    if (!payload || !resultRef.current) return;
    const id = nextId.current++;
    pendingRef.current.set(id, { kind: "fit-member", member });
    setState((s) => ({
      ...s,
      modelReady: false,
      choice: { status: "fitting", member },
    }));
    workerRef.current?.postMessage({
      id,
      type: "fit-member",
      // S7: al agrupar, el payload de agrupar sin roster.
      payload: matchByTask(payload, {
        binaria: (p) => ({ ...withoutLeague(p), member }),
        multiclase: (p) => ({ ...withoutLeague(p), member }),
        numerica: (p) => ({ ...withoutLeague(p), member }),
        agrupar: (p) => withoutClusterLeague(p, member),
      }),
    });
  }, []);

  /**
   * S5 (D5 + U3): el Nivel 2 re-corre la unión (Nivel 1 ∪ Nivel 2 ∪ los «fuera»
   * que el usuario incluye de todos modos). R1: ANTES de arrancar se exporta una
   * instantánea del modelo vigente — cancelar termina el worker, y sin ella no
   * quedaría modelo que usar ni exportar.
   */
  const runLevel2 = useCallback((extraForced: readonly MemberId[] = []) => {
    const table = tableRef.current;
    const payload = payloadRef.current;
    const result = resultRef.current;
    const meta = modelRef.current;
    if (!table || !payload || !result || !meta) return;
    const forced = byPriority([
      ...new Set([...forcedRef.current, ...extraForced]),
    ]);
    // S7: la unión del Nivel 2 se arma con la entrada de la tarea vigente.
    const supervised = (p: PipelinePayload) => {
      const next = prepareRun(table, p.target, SEED, {
        level: 2,
        forced,
        ambiguousChoice: choiceRef.current,
      });
      return next.ok
        ? {
            pending: trainPending(next, 2, forced),
            payload: next.payload as LeaguePayload,
            profile: next.profile,
          }
        : null;
    };
    const next = matchByTask(payload, {
      binaria: supervised,
      multiclase: supervised,
      numerica: supervised,
      agrupar: () => {
        const prepared = prepareClusterRun(table, SEED, { level: 2, forced });
        return prepared.ok
          ? {
              pending: clusterPending(prepared, 2, forced),
              payload: prepared.payload as LeaguePayload,
              profile: prepared.profile,
            }
          : null;
      },
    });
    // Con los mismos datos esto no falla; si algún día falla, se dice: el botón
    // no queda mudo (AU-S6-16). Sigue vigente el resultado del Nivel 1.
    if (!next) {
      setState((s) => ({ ...s, level2: { status: "failed" } }));
      return;
    }
    const plan = planLevel2(
      next.profile,
      result.league.map((row) => row.name),
      measuredRun(result.selection.elapsedMs, result.league),
      forced,
    );
    level1Ref.current = {
      result,
      routing: routingRef.current,
      forced: forcedRef.current,
      payload,
      meta,
      snapshot: null,
    };
    const id = nextId.current++;
    pendingRef.current.set(id, {
      kind: "snapshot",
      next: next.pending,
      payload: next.payload,
      forced,
    });
    setState((s) => ({
      ...s,
      phase: "running",
      // El runtime ya está cargado: se entra directo a la etapa de la liga.
      progress: "training",
      progressDetail: null,
      choice: { status: "idle" },
      level2: {
        status: "running",
        count: next.pending.roster.length,
        estimateS: plan.estimateS,
      },
    }));
    workerRef.current?.postMessage({ id, type: "export-model" });
  }, []);

  /**
   * S5 (R1): cancelar el Nivel 2. Una llamada síncrona de Python no se puede
   * interrumpir: se termina el worker, se crea otro y se restaura la
   * instantánea. Si la instantánea aún no llegó, el Nivel 2 no arrancó: basta
   * con olvidar el pedido (el worker conserva el modelo).
   */
  const cancelLevel2 = useCallback(() => {
    if (!level1Ref.current) return;
    // Los competidores de la corrida CANCELADA (la unión del Nivel 2), no los de
    // la liga que vuelve — se leen antes de vaciar los pendientes (AU-S5-19).
    const inFlight = [...pendingRef.current.values()];
    const level2Train = inFlight.find(
      (p) => p.kind === "train" && p.level === 2,
    );
    const snapshot = inFlight.find((p) => p.kind === "snapshot");
    const competitors =
      level2Train?.kind === "train"
        ? level2Train.roster.length
        : snapshot?.kind === "snapshot"
          ? snapshot.next.roster.length
          : level1Ref.current.result.league.length;
    const snapshotPending = [...pendingRef.current.entries()].find(
      ([, pending]) => pending.kind === "snapshot",
    );
    if (snapshotPending) {
      pendingRef.current.delete(snapshotPending[0]);
    } else {
      pendingRef.current.clear();
      respawnRef.current?.();
    }
    const table = tableRef.current;
    recordLeagueRun({
      task: taskOf(level1Ref.current.result),
      rows: table?.rows.length,
      cols: table?.headers.length,
      competitors,
      level: 2,
      elapsedMs: null,
      cancelled: true,
    });
    restoreLevel1("cancelled", false);
  }, [restoreLevel1]);

  // --- S3: usar el modelo ---------------------------------------------------

  const goToScoring = useCallback(() => {
    setState((s) => (s.modelMeta ? { ...s, phase: "scoring" } : s));
  }, []);

  const backToResults = useCallback(() => {
    setState((s) => (s.result ? { ...s, phase: "results" } : s));
  }, []);

  /** Vuelve al estado vacío de la pantalla de scoring (probar otro CSV). */
  const resetScoring = useCallback(() => {
    setState((s) => ({ ...s, scoring: { status: "idle" } }));
  }, []);

  const scoreCsv = useCallback((csvText: string, fileName: string) => {
    const meta = modelRef.current;
    if (!meta) return;

    const parsed = parseCsvWithLimits(csvText);
    if (!parsed.ok) {
      const kind = CSV_ERROR[parsed.error.kind];
      reportScoringError(kind);
      setState((s) => ({ ...s, scoring: { status: "error", kind } }));
      return;
    }

    const check = checkSchema(parsed.table.headers, meta.schema);
    if (!check.ok) {
      // Bloqueo honesto en TS puro: no se postea NADA al worker.
      setState((s) => ({
        ...s,
        scoring: { status: "blocked", check, fileName },
      }));
      return;
    }

    // Solo las columnas del modelo, en el orden del esquema (Python no adivina).
    const features = modelFeatures(meta.schema);
    const indices = features.map((f) => parsed.table.headers.indexOf(f));
    const payload: ScorePayload = {
      headers: features,
      rows: parsed.table.rows.map((row) => indices.map((i) => row[i]!)),
    };
    const id = nextId.current++;
    pendingRef.current.set(id, {
      kind: "score",
      schema: meta.schema,
      check,
      fileName,
      table: parsed.table,
    });
    setState((s) => ({
      ...s,
      scoring: { status: "running", progress: null },
    }));
    workerRef.current?.postMessage({ id, type: "score", payload });
  }, []);

  const exportModel = useCallback(() => {
    const result = resultRef.current;
    const datasetName = datasetNameRef.current;
    if (!result || !datasetName) return;
    const id = nextId.current++;
    pendingRef.current.set(id, { kind: "export-model", datasetName, result });
    setState((s) => ({ ...s, exportState: "exporting" }));
    workerRef.current?.postMessage({ id, type: "export-model" });
  }, []);

  /**
   * S7 (P13): tus filas con el grupo de cada una, como CSV local. Las etiquetas
   * se piden al worker en ese momento, se escriben al archivo y se olvidan: no
   * viven en el estado, ni en el resultado, ni en el archivo del modelo.
   */
  const downloadClusterLabels = useCallback((names: LabelsNames) => {
    const table = tableRef.current;
    const meta = modelRef.current;
    const datasetName = datasetNameRef.current;
    if (!table || !meta || !datasetName) return;
    const groups = matchByTask(meta.schema, {
      binaria: () => null,
      multiclase: () => null,
      numerica: () => null,
      agrupar: (schema) => schema,
    });
    if (!groups) return;
    const id = nextId.current++;
    pendingRef.current.set(id, {
      kind: "cluster-labels",
      table,
      datasetName,
      groups: groups.groups,
      noise: groups.noise,
      names,
    });
    setState((s) => ({ ...s, labels: "fetching" }));
    workerRef.current?.postMessage({ id, type: "cluster-labels" });
  }, []);

  /** Activa un modelo importado (el archivo YA pasó validateModelFile). */
  const activateImportedModel = useCallback((file: ModelFile) => {
    // validateModelFile solo deja pasar tareas que la UI sabe usar (S6).
    const meta: ModelMeta = {
      source: "imported",
      schema: file.manifest.schema,
      datasetName: file.manifest.dataset.name,
      manifest: file.manifest,
    };
    modelRef.current = meta;
    resultRef.current = null;
    datasetNameRef.current = file.manifest.dataset.name;
    tableRef.current = null;
    const id = nextId.current++;
    pendingRef.current.set(id, { kind: "import-model" });
    setState({
      ...INITIAL,
      phase: "scoring",
      datasetName: file.manifest.dataset.name,
      modelMeta: meta,
      modelReady: false,
    });
    workerRef.current?.postMessage({
      id,
      type: "import-model",
      payload: {
        payload_b64: file.payload,
        // El esquema del manifiesto (el que la UI muestra y usa para el gate
        // de columnas) DEBE ser el del pickle: pipeline.py los coteja.
        expected_schema: file.manifest.schema,
      },
    });
  }, []);

  const reset = useCallback(() => {
    // R15: si quedaba cómputo en vuelo (p. ej. un Nivel 2), se corta de verdad
    // — antes seguía corriendo y el experimento nuevo esperaba detrás de él.
    if (pendingRef.current.size > 0) respawnRef.current?.();
    tableRef.current = null;
    payloadRef.current = null;
    choiceRef.current = null;
    modelRef.current = null;
    resultRef.current = null;
    datasetNameRef.current = null;
    routingRef.current = null;
    forcedRef.current = [];
    level1Ref.current = null;
    pendingRef.current.clear();
    setState(INITIAL);
  }, []);

  return {
    state,
    loadCsv,
    selectTarget,
    selectCluster,
    answerTask,
    run,
    runCluster,
    downloadClusterLabels,
    reset,
    goToScoring,
    backToResults,
    resetScoring,
    scoreCsv,
    exportModel,
    activateImportedModel,
    chooseMember,
    runLevel2,
    cancelLevel2,
  };
}
