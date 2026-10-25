"use client";

// Protocolo DS (S19, ADR 027), etapa 9 — «¿Qué pasaría si?». El mismo panel de Probeta, con los costos de la etapa 1 y SOLO las filas de
// entrenamiento: la prueba se abrió una vez en la etapa 8 y no se vuelve a abrir. El ganador de la etapa 7 se vuelve a ajustar con ese
// entrenamiento en un worker que se crea al pulsar «Simular» (no antes), no cuenta como apertura y no toca el cuaderno ni la compuerta:
// lo que se simula aquí informa la decisión, no es evidencia. Se carga con la etapa 9 (diferida).
import { useMemo } from "react";
import { SimuladorPanel } from "@/components/simulador/SimuladorPanel";
import { costosDe } from "@/engine/protocolo/comparacion";
import { plan7 } from "@/engine/protocolo/etapa7";
import type { Previas } from "@/engine/protocolo/etapas";
import { textoLleno } from "@/engine/protocolo/valores";
import type { CostosSimulador } from "@/engine/simulador";
import { envioGanador, tablaDeEntrenamiento } from "@/lib/protocolo/ganador";
import { lecturaDeEnvio } from "@/lib/protocolo/prueba8";
import { useGanador } from "@/lib/protocolo/useGanador";
import type { PedirSimulacion } from "@/lib/simulador/pedir";
import { matchByTask } from "@/engine/despacho";
import type { DatosCargados } from "@/lib/protocolo/useProtocolo";

export function Etapa9Simulador({
  datos,
  previas,
}: {
  datos: DatosCargados;
  previas: Previas;
}) {
  const huella = datos.carga.sha256;
  const { estado, simular } = useGanador();
  const preparado = useMemo(() => {
    const p7 = plan7(datos.tabla, previas, huella);
    const envio = envioGanador(datos.tabla, previas, huella);
    if (!p7 || !envio) return null;
    const { classes, positive } = lecturaDeEnvio(datos.tabla, p7);
    const costos = costosDe(previas);
    const simulador: CostosSimulador | null = costos
      ? matchByTask(costos, {
          binaria: (c) => ({ task: "binaria" as const, fp: c.fp, fn: c.fn }),
          multiclase: (c) => ({
            task: "multiclase" as const,
            costoClase: c.costoClase,
          }),
          numerica: () => null,
        })
      : null;
    return {
      p7,
      envio,
      tabla: tablaDeEntrenamiento(datos.tabla, p7.particion.entrenamiento),
      clases: classes ?? null,
      positiva: positive ?? null,
      costos: { costos: simulador, unidad: textoLleno(previas[1]?.respuestas ?? {}, "unidad") },
    };
  }, [datos.tabla, previas, huella]);

  if (!preparado) return null;
  const pedir: PedirSimulacion = (payload, sent) =>
    simular(preparado.envio, payload, sent);
  return (
    <SimuladorPanel
      tabla={preparado.tabla}
      tarea={preparado.p7.forma}
      numericas={preparado.p7.numericas}
      categoricas={preparado.p7.categoricas}
      clases={preparado.clases}
      positiva={preparado.positiva}
      semilla={preparado.envio.payload.seed}
      simular={pedir}
      costosEscritos={preparado.costos}
      notaEntrenamiento
      ajustando={estado.tipo === "ajustando"}
      modelo={preparado.p7}
    />
  );
}
