"use client";

// Protocolo DS (S12), etapa 7 — el worker de Pyodide para la liga sin prueba. Se crea al pulsar «Correr la
// liga» (no al abrir la página: Pyodide pesa) y se reutiliza mientras la pantalla siga abierta; cancelar
// lo termina. El progreso y el resultado se validan con el lector del contrato (contract.ts) ANTES de
// usarse; un error dice solo el campo del contrato o «worker», nunca un mensaje que pueda traer valores.
// No escribe en consola ni en Sentry.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Corrida7 } from "@/engine/protocolo/etapa7";
import {
  pythonContractField,
  validateProgressDetail,
  validateValidationResult,
} from "@/workers/contract";
import type { RunnerResponse } from "@/workers/protocol";
import type { Envio7 } from "./liga7";

export type EstadoValidacion =
  | { readonly tipo: "inactiva" }
  | { readonly tipo: "cargando" }
  | {
      readonly tipo: "corriendo";
      readonly fase: "cv" | "perm";
      /** Base 1. */
      readonly i: number;
      readonly n: number;
      readonly modelo: string;
    }
  | { readonly tipo: "lista"; readonly corrida: Corrida7 }
  | { readonly tipo: "cancelada" }
  | { readonly tipo: "error"; readonly motivo: string };

export type Oyente = { current: ((m: RunnerResponse) => void) | null };

/**
 * El worker se crea una vez y delega cada mensaje en el oyente de la corrida en curso (un ref): una corrida
 * nueva no toca el worker, y Pyodide no se vuelve a cargar. S13: lo usa también la etapa 8 (usePrueba.ts).
 */
export function crearWorker(oyente: Oyente, alMorir: () => void): Worker {
  const worker = new Worker("/pyodide-runner.js", { type: "module" });
  worker.onmessage = (event: MessageEvent<RunnerResponse>) =>
    oyente.current?.(event.data);
  worker.onerror = alMorir;
  return worker;
}

/** Un error dice solo el campo del contrato o «worker»: nunca un mensaje que pueda traer valores. */
export function motivoDe(mensaje: string): string {
  const campo = pythonContractField(mensaje);
  return campo ? `contrato: ${campo}` : "worker";
}

export function useValidacion() {
  const [estado, setEstado] = useState<EstadoValidacion>({ tipo: "inactiva" });
  const workerRef = useRef<Worker | null>(null);
  const oyenteRef = useRef<((m: RunnerResponse) => void) | null>(null);
  const idRef = useRef(0);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    },
    [],
  );

  const cancelar = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    // lo que todavía estuviera en camino de esta corrida ya no cuenta
    oyenteRef.current = null;
    idRef.current += 1;
    setEstado({ tipo: "cancelada" });
  }, []);

  const correr = useCallback((envio: Envio7) => {
    const id = (idRef.current += 1);
    setEstado({ tipo: "cargando" });
    oyenteRef.current = (m) => {
      // solo la corrida vigente: una cancelada o reemplazada no escribe el estado
      if (m.id !== id || id !== idRef.current) return;
      if (m.type === "progress") {
        if (m.detail === undefined) return;
        const d = validateProgressDetail(m.detail);
        if (d.ok && (d.value.phase === "cv" || d.value.phase === "perm"))
          setEstado({
            tipo: "corriendo",
            fase: d.value.phase,
            i: d.value.index + 1,
            n: d.value.total,
            modelo: d.value.member,
          });
        return;
      }
      if (m.type === "error") {
        setEstado({ tipo: "error", motivo: motivoDe(m.message) });
        return;
      }
      if (m.command !== "validate") return;
      const r = validateValidationResult(m.result, envio.sent);
      setEstado(
        r.ok
          ? {
              tipo: "lista",
              corrida: {
                metrica: envio.metrica,
                roster: envio.roster,
                resultado: r.value,
              },
            }
          : { tipo: "error", motivo: `contrato: ${r.field}` },
      );
    };
    const worker =
      workerRef.current ??
      crearWorker(oyenteRef, () => {
        workerRef.current = null;
        setEstado({ tipo: "error", motivo: "worker" });
      });
    workerRef.current = worker;
    worker.postMessage({ id, type: "validate", payload: envio.payload });
  }, []);

  return { estado, correr, cancelar };
}
