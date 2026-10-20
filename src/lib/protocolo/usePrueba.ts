"use client";

// Protocolo DS (S13), etapa 8 — el worker de Pyodide que abre la prueba sellada. Se crea al pulsar «Abrir la
// prueba» (no antes: hasta ese clic ninguna fila de la prueba sale del hilo principal) y se reutiliza mientras
// la pantalla siga abierta; cancelar lo termina. El resultado se valida con su lector (contrato-prueba.ts)
// ANTES de usarse, y solo un resultado válido cuenta como apertura: `alAbrir` la anota en el cuaderno. Un
// error dice solo el campo del contrato o «worker». No escribe en consola ni en Sentry.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Corrida8 } from "@/engine/protocolo/etapa8";
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

export function usePrueba() {
  const [estado, setEstado] = useState<EstadoPrueba>({ tipo: "inactiva" });
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

  return { estado, abrir, cancelar };
}
