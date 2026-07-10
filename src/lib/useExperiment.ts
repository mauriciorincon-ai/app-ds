"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LeakageFinding } from "@/engine/leakage";
import { parseCsvWithLimits, type CsvTable } from "@/lib/ds/csv";
import { assembleResult, prepareRun, summarizeDataset } from "@/lib/experiment";
import { reportExperimentError } from "@/lib/observability";
import type {
  DatasetSummary,
  ExperimentResult,
  ProgressStage,
  RunnerResponse,
  WorkerErrorKind,
} from "@/workers/protocol";

export type ExperimentPhase =
  "empty" | "configuring" | "running" | "results" | "error";

export type ExperimentState = {
  phase: ExperimentPhase;
  datasetName: string | null;
  dataset: DatasetSummary | null;
  progress: ProgressStage | null;
  result: ExperimentResult | null;
  error: { kind: WorkerErrorKind; message: string } | null;
};

const INITIAL: ExperimentState = {
  phase: "empty",
  datasetName: null,
  dataset: null,
  progress: null,
  result: null,
  error: null,
};

const SEED = 42;

const CSV_ERROR: Record<string, WorkerErrorKind> = {
  empty: "csv-empty",
  "too-large": "csv-too-large",
  "too-many-rows": "csv-too-many-rows",
  ragged: "csv-ragged",
};

// Gestiona el runner de Pyodide y la máquina de estados del experimento. El
// parseo/perfilado/split/veredicto/fuga corren aquí (puro, testeado); el runner
// solo entrena.
export function useExperiment() {
  const workerRef = useRef<Worker | null>(null);
  const nextId = useRef(0);
  const tableRef = useRef<CsvTable | null>(null);
  const pendingRef = useRef<{ id: number; leakage: LeakageFinding[] } | null>(
    null,
  );
  const [state, setState] = useState<ExperimentState>(INITIAL);

  useEffect(() => {
    // Module worker real servido desde public/ (Pyodide exige module worker).
    const worker = new Worker("/pyodide-runner.js", { type: "module" });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<RunnerResponse>) => {
      const message = event.data;
      const pending = pendingRef.current;
      if (!pending || message.id !== pending.id) return;

      if (message.type === "progress") {
        setState((s) => ({ ...s, phase: "running", progress: message.stage }));
      } else if (message.type === "result") {
        setState((s) => ({
          ...s,
          phase: "results",
          result: assembleResult(message.result, pending.leakage),
        }));
      } else {
        console.error("[experiment] runtime", message.message);
        const table = tableRef.current;
        reportExperimentError(
          "runtime",
          table ? { rows: table.rows.length, cols: table.headers.length } : undefined,
        );
        setState((s) => ({
          ...s,
          phase: "error",
          error: { kind: "runtime", message: message.message },
        }));
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

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
    tableRef.current = parsed.table;
    setState({
      ...INITIAL,
      phase: "configuring",
      datasetName: name,
      dataset: summarizeDataset(parsed.table),
    });
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
    pendingRef.current = { id, leakage: prepared.leakage };
    setState((s) => ({ ...s, phase: "running", progress: null, error: null }));
    workerRef.current?.postMessage({ id, payload: prepared.payload });
  }, []);

  const reset = useCallback(() => {
    tableRef.current = null;
    pendingRef.current = null;
    setState(INITIAL);
  }, []);

  return { state, loadCsv, run, reset };
}
