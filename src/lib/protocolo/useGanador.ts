"use client";

// Protocolo DS (S19, ADR 027), etapas 9 y 10 — el worker que vuelve a ajustar al ganador. Se crea al pulsar (no antes: hasta ese
// clic ni una fila sale del hilo principal) y se reutiliza mientras la pantalla siga abierta. El reajuste usa SOLO el entrenamiento
// sellado (`envioGanador`: el envío de la etapa 8 sin la prueba), no abre la prueba, no cuenta como apertura y no escribe en el
// cuaderno. Un mismo ajuste (misma huella, mismo sello, mismo ganador) se hace una sola vez; si el worker muere, se rehace.
import { useCallback, useEffect, useRef, useState } from "react";
import { pedirExport } from "@/lib/publica/modelo";
import { pedirAjuste, pedirSimulacion } from "@/lib/simulador/pedir";
import type { SimuladorSent } from "@/workers/contrato-simulador";
import type {
  ExportResult,
  SimulatePayload,
  SimulateResult,
} from "@/workers/protocol";
import type { EnvioGanador } from "./ganador";

export type EstadoGanador =
  | { readonly tipo: "inactivo" }
  | { readonly tipo: "ajustando" }
  | { readonly tipo: "listo" }
  | { readonly tipo: "error"; readonly motivo: string };

const claveDe = (envio: EnvioGanador) =>
  [envio.sent.huella, envio.sent.sello, envio.sent.winner].join(":");

export function useGanador() {
  const [estado, setEstado] = useState<EstadoGanador>({ tipo: "inactivo" });
  const workerRef = useRef<Worker | null>(null);
  const ajustadoRef = useRef<string | null>(null);
  const enCursoRef = useRef<Promise<void> | null>(null);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    },
    [],
  );

  /** El worker del ganador, creado al primer uso. */
  const workerDe = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current;
    const worker = new Worker("/pyodide-runner.js", { type: "module" });
    worker.onerror = () => {
      workerRef.current = null;
      ajustadoRef.current = null;
      setEstado({ tipo: "error", motivo: "worker" });
    };
    workerRef.current = worker;
    return worker;
  }, []);

  /** Deja al ganador ajustado con el entrenamiento; si ya está así, no hace nada. */
  const ajustar = useCallback(
    (envio: EnvioGanador): Promise<Worker> => {
      const clave = claveDe(envio);
      if (ajustadoRef.current === clave && workerRef.current)
        return Promise.resolve(workerRef.current);
      const worker = workerDe();
      if (enCursoRef.current === null || ajustadoRef.current !== clave) {
        setEstado({ tipo: "ajustando" });
        enCursoRef.current = pedirAjuste(worker, envio).then(
          () => {
            ajustadoRef.current = clave;
            enCursoRef.current = null;
            setEstado({ tipo: "listo" });
          },
          (e: unknown) => {
            ajustadoRef.current = null;
            enCursoRef.current = null;
            setEstado({
              tipo: "error",
              motivo: e instanceof Error ? e.message : "worker",
            });
            throw e;
          },
        );
      }
      return enCursoRef.current.then(() => worker);
    },
    [workerDe],
  );

  /** Ajusta (si hace falta) y puntúa las filas como están y con el cambio. */
  const simular = useCallback(
    async (
      envio: EnvioGanador,
      payload: SimulatePayload,
      sent: SimuladorSent,
    ): Promise<SimulateResult> => {
      const worker = await ajustar(envio);
      return pedirSimulacion(worker, payload, sent);
    },
    [ajustar],
  );

  /** Ajusta (si hace falta) y entrega el modelo para el archivo de la etapa 10: esquema, perfil de entrenamiento y payload. */
  const exportar = useCallback(
    async (envio: EnvioGanador): Promise<ExportResult> => {
      const worker = await ajustar(envio);
      return pedirExport(worker);
    },
    [ajustar],
  );

  return { estado, ajustar, simular, exportar };
}
