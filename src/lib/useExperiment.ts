"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LeakageFinding } from "@/engine/leakage";
import { computeEdaAlerts, type EdaAlert } from "@/engine/eda";
import { sanitizeTable, type SanitationReport } from "@/engine/sanitize";
import { parseCsvWithLimits, type CsvTable } from "@/lib/ds/csv";
import {
  checkSchema,
  modelFeatures,
  type SchemaCheck,
} from "@/lib/ds/schema-check";
import {
  planLevel2,
  type RouteProfile,
  type Routing,
} from "@/engine/encarrilador";
import type { TaskDetection } from "@/engine/tarea";
import {
  applyMemberFit,
  assembleResult,
  prepareRun,
  summarizeDataset,
  withoutLeague,
} from "@/lib/experiment";
import { downloadTextFile } from "@/lib/files";
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
  validateExportResult,
  validateMemberFit,
  validateProgressDetail,
  validateScoreResult,
  validateTrainResult,
} from "@/workers/contract";
import type {
  DatasetSummary,
  ExperimentResult,
  ExportResult,
  ModelSchema,
  PipelinePayload,
  ProgressDetail,
  ProgressStage,
  RunnerResponse,
  ScorePayload,
  ScoreResult,
  WorkerErrorKind,
} from "@/workers/protocol";

export type ExperimentPhase =
  "empty" | "configuring" | "running" | "results" | "error" | "scoring";

/** Metadatos del run que consumen la narración y la model card (S2). */
export type RunMeta = {
  target: string;
  numericFeatures: number;
  categoricalFeatures: number;
  seed: number;
};

/** De dónde salió el modelo activo (S3): entrenado aquí o importado. */
export type ModelSource = "trained" | "imported";

export type ModelMeta = {
  source: ModelSource;
  schema: ModelSchema;
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
  /** Solo binaria y preparable: quién compite y en qué nivel. */
  routing: Routing | null;
  /** Forma del dataset para E2 (filas, ancho, minoritaria, k). */
  profile: RouteProfile | null;
  smallSample: boolean;
  /** Binaria pero sin CV honesta posible u otro rechazo de prepareRun. */
  blocked: WorkerErrorKind | null;
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
type Pending =
  | {
      kind: "train";
      leakage: LeakageFinding[];
      schema: Pick<ModelSchema, "numeric" | "categorical" | "target">;
      // S5: lo enviado, para que el lector del contrato lo coteje.
      sent: { roster: MemberId[]; cv_k: number };
      smallSample: boolean;
      // S5: el reparto y los forzados de ESTA corrida (se fijan solo si termina).
      level: 1 | 2;
      routing: Routing;
      forced: MemberId[];
    }
  // S5 (R1): la instantánea del modelo del Nivel 1, antes de arrancar el Nivel 2.
  | {
      kind: "snapshot";
      next: Extract<ReturnType<typeof prepareRun>, { ok: true }>;
      forced: MemberId[];
    }
  // S5 (R1): restaurar esa instantánea tras cancelar o fallar el Nivel 2.
  | { kind: "restore" }
  | { kind: "score"; check: SchemaCheck; fileName: string; table: CsvTable }
  | { kind: "export-model"; datasetName: string; result: ExperimentResult }
  | { kind: "import-model" }
  | { kind: "fit-member"; member: MemberId };

/** S5: E1 (tarea) y, si es binaria, E2 (quién compite) para el objetivo elegido. */
function planTarget(
  table: CsvTable,
  target: string,
  dataset: DatasetSummary,
): TargetPlan | null {
  const task = dataset.targetTasks[target];
  if (!task) return null;
  if (task.task !== "binaria") {
    return {
      target,
      task,
      routing: null,
      profile: null,
      smallSample: false,
      blocked: null,
    };
  }
  const prepared = prepareRun(table, target, SEED);
  return prepared.ok
    ? {
        target,
        task,
        routing: prepared.routing,
        profile: prepared.profile,
        smallSample: prepared.smallSample,
        blocked: null,
      }
    : {
        target,
        task,
        routing: null,
        profile: null,
        smallSample: false,
        blocked: prepared.error,
      };
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
  // S5: el último payload de la liga (para fit-member y el Nivel 2).
  const payloadRef = useRef<PipelinePayload | null>(null);
  // S5 (R1): lo que vuelve si el Nivel 2 se cancela o falla.
  const level1Ref = useRef<{
    result: ExperimentResult;
    routing: Routing | null;
    forced: MemberId[];
    payload: PipelinePayload;
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
        const checked = validateTrainResult(message.result, pending.sent);
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
        const assembled = assembleResult(
          checked.value,
          pending.leakage,
          pending.smallSample,
        );
        const meta: ModelMeta = {
          source: "trained",
          schema: {
            ...pending.schema,
            classes: checked.value.classes,
            positive_class: checked.value.positive_class,
          },
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
          ...tableSize(),
          competitors: assembled.league.length,
          level: pending.level,
          elapsedMs: checked.value.elapsed_ms,
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
        const { next, forced } = pending;
        const trainId = nextId.current++;
        pendingRef.current.set(trainId, {
          kind: "train",
          leakage: next.leakage,
          schema: {
            numeric: next.payload.numeric,
            categorical: next.payload.categorical,
            target: next.payload.target,
          },
          sent: { roster: next.payload.roster, cv_k: next.payload.cv_k },
          smallSample: next.smallSample,
          level: 2,
          routing: next.routing,
          forced,
        });
        payloadRef.current = next.payload;
        workerRef.current?.postMessage({
          id: trainId,
          type: "train",
          payload: next.payload,
        });
      } else if (
        message.command === "import-model" &&
        pending.kind === "restore"
      ) {
        setState((s) => ({ ...s, modelReady: true }));
      } else if (message.command === "score" && pending.kind === "score") {
        const checked = validateScoreResult(message.result);
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
        const checked = validateMemberFit(message.result, {
          member: pending.member,
        });
        const current = resultRef.current;
        if (!checked.ok || !current) {
          console.error(
            "[experiment] contract",
            checked.ok ? "result" : checked.field,
          );
          failTrain("contract", checked.ok ? "result" : checked.field);
          return;
        }
        const chosen = applyMemberFit(current, checked.value);
        resultRef.current = chosen;
        setState((s) => ({
          ...s,
          result: chosen,
          modelReady: true,
          choice: { status: "idle" },
        }));
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
    setState((s) => ({
      ...s,
      edaAlerts:
        table && targetColumn ? computeEdaAlerts(table, targetColumn) : null,
      plan:
        table && targetColumn && s.dataset
          ? planTarget(table, targetColumn, s.dataset)
          : null,
    }));
  }, []);

  const run = useCallback((targetColumn: string) => {
    const table = tableRef.current;
    if (!table) return;

    const prepared = prepareRun(table, targetColumn, SEED);
    if (!prepared.ok) {
      setState((s) => ({
        ...s,
        phase: "error",
        error: { kind: prepared.error, message: prepared.error },
      }));
      return;
    }

    const id = nextId.current++;
    pendingRef.current.set(id, {
      kind: "train",
      leakage: prepared.leakage,
      schema: {
        numeric: prepared.payload.numeric,
        categorical: prepared.payload.categorical,
        target: targetColumn,
      },
      sent: { roster: prepared.payload.roster, cv_k: prepared.payload.cv_k },
      smallSample: prepared.smallSample,
      level: 1,
      routing: prepared.routing,
      forced: [],
    });
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
      runMeta: {
        target: targetColumn,
        numericFeatures: prepared.payload.numeric.length,
        categoricalFeatures: prepared.payload.categorical.length,
        seed: SEED,
      },
    }));
    workerRef.current?.postMessage({
      id,
      type: "train",
      payload: prepared.payload,
    });
  }, []);

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
      payload: { ...withoutLeague(payload), member },
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
    const next = prepareRun(table, payload.target, SEED, { level: 2, forced });
    if (!next.ok) return;
    const plan = planLevel2(
      next.profile,
      result.league.map((row) => row.name),
      result.selection.elapsedMs,
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
    pendingRef.current.set(id, { kind: "snapshot", next, forced });
    setState((s) => ({
      ...s,
      phase: "running",
      // El runtime ya está cargado: se entra directo a la etapa de la liga.
      progress: "training",
      progressDetail: null,
      choice: { status: "idle" },
      level2: {
        status: "running",
        count: next.payload.roster.length,
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
    const competitors = level1Ref.current.result.league.length;
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

  /** Activa un modelo importado (el archivo YA pasó validateModelFile). */
  const activateImportedModel = useCallback((file: ModelFile) => {
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
    run,
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
