"use client";

// Protocolo DS (S13), etapa 8 — el worker de Pyodide que abre la prueba sellada. Se crea al pulsar «Abrir la
// prueba» (no antes: hasta ese clic ninguna fila de la prueba sale del hilo principal) y se reutiliza mientras
// la pantalla siga abierta; cancelar lo termina. El resultado se valida con su lector (contrato-prueba.ts)
// ANTES de usarse, y solo un resultado válido cuenta como apertura: `alAbrir` la anota en el cuaderno. Un
// error dice solo el campo del contrato o «worker». No escribe en consola ni en Sentry.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Corrida8 } from "@/engine/protocolo/etapa8";
import { validateStressResult } from "@/workers/contrato-estres";
import { validateTestResult } from "@/workers/contrato-prueba";
import type { RunnerResponse } from "@/workers/protocol";
import type { Envio8 } from "./prueba8";
import { crearWorker, motivoDe } from "./useValidacion";

export type EstadoPrueba =
  | { readonly tipo: "inactiva" }
  | { readonly tipo: "cargando" }
  | { readonly tipo: "midiendo" }
  | { readonly tipo: "lista"; readonly corrida: Corrida8 }
  | { readonly tipo: "cancelada" }
  | { readonly tipo: "error"; readonly motivo: string };

/** S17: la lectura de estrés pide aparte, sobre la apertura en pantalla; su resultado se cuelga de la `corrida`. */
export type EstadoEstres =
  | { readonly tipo: "inactivo" }
  | { readonly tipo: "midiendo" }
  | { readonly tipo: "error"; readonly motivo: string };

export function usePrueba() {
  const [estado, setEstado] = useState<EstadoPrueba>({ tipo: "inactiva" });
  const [estres, setEstres] = useState<EstadoEstres>({ tipo: "inactivo" });
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
    oyenteRef.current = null;
    idRef.current += 1;
    setEstado({ tipo: "cancelada" });
  }, []);

  /** Abre la prueba con el envío de hoy; `alAbrir` se llama una vez, con el resultado ya validado. */
  const abrir = useCallback((envio: Envio8, alAbrir: () => void) => {
    const id = (idRef.current += 1);
    setEstres({ tipo: "inactivo" });
    setEstado({ tipo: "cargando" });
    oyenteRef.current = (m) => {
      if (m.id !== id || id !== idRef.current) return;
      if (m.type === "progress") {
        if (m.stage === "scoring") setEstado({ tipo: "midiendo" });
        return;
      }
      if (m.type === "error") {
        setEstado({ tipo: "error", motivo: motivoDe(m.message) });
        return;
      }
      if (m.command !== "test") return;
      const r = validateTestResult(m.result, envio.sent);
      if (!r.ok) {
        setEstado({ tipo: "error", motivo: `contrato: ${r.field}` });
        return;
      }
      alAbrir();
      setEstado({ tipo: "lista", corrida: { resultado: r.value } });
    };
    const worker =
      workerRef.current ??
      crearWorker(oyenteRef, () => {
        workerRef.current = null;
        setEstado({ tipo: "error", motivo: "worker" });
      });
    workerRef.current = worker;
    worker.postMessage({ id, type: "test", payload: envio.payload });
  }, []);

  /**
   * S17 (ADR 023): estresa LA MISMA prueba que se abrió, con el mismo envío (mismo sello y ganador). No es una apertura
   * nueva: no llama a `alAbrir`. Solo con una corrida en pantalla; el resultado pasa por su lector (con el eco del sello,
   * la huella y el ganador) antes de colgarse de la corrida.
   */
  const estresar = useCallback((envio: Envio8) => {
    const id = (idRef.current += 1);
    setEstres({ tipo: "midiendo" });
    oyenteRef.current = (m) => {
      if (m.id !== id || id !== idRef.current) return;
      if (m.type === "progress") return;
      if (m.type === "error") {
        setEstres({ tipo: "error", motivo: motivoDe(m.message) });
        return;
      }
      if (m.command !== "stress-test") return;
      const r = validateStressResult(m.result, {
        task: envio.sent.task,
        primary_metric: envio.sent.primary_metric,
        n_test: envio.sent.n_test,
        numeric: envio.payload.numeric,
        categorical: envio.payload.categorical,
        echo: {
          winner: envio.sent.winner,
          huella: envio.sent.huella,
          sello: envio.sent.sello,
        },
      });
      if (!r.ok) {
        setEstres({ tipo: "error", motivo: `contrato: ${r.field}` });
        return;
      }
      setEstado((e) =>
        e.tipo === "lista"
          ? { tipo: "lista", corrida: { ...e.corrida, estres: r.value } }
          : e,
      );
      setEstres({ tipo: "inactivo" });
    };
    const worker =
      workerRef.current ??
      crearWorker(oyenteRef, () => {
        workerRef.current = null;
        setEstres({ tipo: "error", motivo: "worker" });
      });
    workerRef.current = worker;
    worker.postMessage({ id, type: "stress-test", payload: envio.payload });
  }, []);

  return { estado, abrir, cancelar, estres, estresar };
}
