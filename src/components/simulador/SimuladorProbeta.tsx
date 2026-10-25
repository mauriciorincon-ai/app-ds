"use client";

// S19 (ADR 027): el panel «¿Qué pasaría si?» de Probeta. Toma del esquema del modelo ACTIVO (entrenado aquí o importado) las
// columnas, las clases y la positiva, y le pide al worker que lo tiene —por el asignador único de ids de los paneles— que puntúe las
// filas como están y con el cambio. Sirve a las cuatro tareas, a la pantalla de resultados (sobre el CSV cargado) y al modo «score»
// (sobre el CSV nuevo). El Protocolo tiene el suyo (`Etapa9Simulador`): allí el modelo hay que reajustarlo con el entrenamiento.
import type { RefObject } from "react";
import { matchByTask } from "@/engine/despacho";
import { SEMILLA_SIMULACION } from "@/engine/simulador";
import type { CsvTable } from "@/lib/ds/csv";
import { pedirSimulacion, type PedirSimulacion } from "@/lib/simulador/pedir";
import type { ScoringSchema } from "@/workers/protocol";
import { SimuladorPanel } from "./SimuladorPanel";

export type SimuladorProbetaProps = {
  readonly schema: ScoringSchema;
  readonly tabla: CsvTable | null;
  readonly worker?: RefObject<Worker | null>;
  readonly semilla?: number;
  /** La identidad del modelo activo (el resultado o el archivo): otra identidad borra la lectura. */
  readonly modelo: object;
  readonly ocupado?: boolean;
  /** Estimar una cantidad: la unidad del objetivo («kWh»). */
  readonly unidadObjetivo?: string | null;
};

export function SimuladorProbeta({
  schema,
  tabla,
  worker,
  semilla = SEMILLA_SIMULACION,
  modelo,
  ocupado = false,
  unidadObjetivo = null,
}: SimuladorProbetaProps) {
  if (!tabla) return null;
  const simular: PedirSimulacion = (payload, sent) => {
    const w = worker?.current;
    return w ? pedirSimulacion(w, payload, sent) : Promise.reject(new Error("worker"));
  };
  const tarea = matchByTask(schema, {
    binaria: () => "binaria" as const,
    multiclase: () => "multiclase" as const,
    numerica: () => "numerica" as const,
    agrupar: () => "agrupar" as const,
  });
  const clases = matchByTask(schema, {
    binaria: (s) => s.classes,
    multiclase: (s) => s.classes,
    numerica: () => null,
    agrupar: () => null,
  });
  const positiva = matchByTask(schema, {
    binaria: (s) => s.positive_class,
    multiclase: () => null,
    numerica: () => null,
    agrupar: () => null,
  });
  return (
    <SimuladorPanel
      tabla={tabla}
      tarea={tarea}
      numericas={schema.numeric}
      categoricas={schema.categorical}
      clases={clases}
      positiva={positiva}
      semilla={semilla}
      simular={simular}
      unidadObjetivo={unidadObjetivo}
      ocupado={ocupado || !worker}
      modelo={modelo}
    />
  );
}
