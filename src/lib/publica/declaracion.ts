// S17 (ADR 024): la declaración de la receta, armada del resultado que está en pantalla. Solo nombres de columnas y números
// del modelo: ninguna fila, ninguna etiqueta de clase, ningún valor del objetivo (la clase positiva y las clases las deriva la
// receta del archivo del usuario al correr).
import { taskOf } from "@/engine/despacho";
import type { SanitationReport } from "@/engine/sanitize";
import type { SupervisedResult } from "@/workers/protocol";
import type { Declaracion, Tolerancia } from "./ensamblar";

/**
 * Los modelos cuyo resultado puede cambiar un poco entre el navegador (Pyodide, 32 bits) y Python de 64 bits: los bosques de
 * árboles son discontinuos y una diferencia de coma flotante en un empate cambia uno o dos de sus 200 árboles (medido en el
 * kit: la mitad de un punto de AUC, o hasta una fila de la prueba). Los demás reproducen con 1e-6. La CI lo mide (ADR 024).
 */
export const AZAR_SENSIBLE: ReadonlySet<string> = new Set([
  "forest",
  "forest_balanced",
  "extra_trees",
]);
export const TOLERANCIA_APROXIMADA: Tolerancia = {
  tipo: "aproximada",
  relativa: 0.1,
  absoluta: 0.03,
};

/** Espejo de TEST_SIZE de src/lib/experiment.ts (que no la exporta): un test las compara. */
export const FRACCION_PRUEBA = 0.25;

export function declaracionDe(entrada: {
  readonly result: SupervisedResult;
  readonly target: string;
  readonly seed: number;
  readonly datasetName: string;
  readonly sanitation: SanitationReport | null;
  readonly appVersion: string;
  readonly idioma: "es" | "en";
}): Declaracion {
  const { result, sanitation } = entrada;
  const columnas = result.explainability.features;
  const metricas: Record<string, number | null> = {};
  for (const [nombre, valor] of Object.entries(result.model))
    metricas[nombre] = typeof valor === "number" ? valor : null;
  return {
    formato: "probeta-receta/1",
    app: `probeta-ds ${entrada.appVersion}`,
    idioma: entrada.idioma,
    archivo: entrada.datasetName,
    tarea: taskOf(result),
    objetivo: entrada.target,
    numericas: columnas.filter((c) => c.kind === "numeric").map((c) => c.name),
    categoricas: columnas
      .filter((c) => c.kind === "categorical")
      .map((c) => c.name),
    excluidas: sanitation?.exclusions.map((e) => e.column) ?? [],
    semilla: entrada.seed,
    fraccion_prueba: FRACCION_PRUEBA,
    metrica: result.verdict.primaryMetric,
    miembro: result.modelName,
    tolerancia: AZAR_SENSIBLE.has(result.modelName)
      ? TOLERANCIA_APROXIMADA
      : { tipo: "exacta" },
    esperado: {
      n_entrenamiento: result.nTrain,
      n_prueba: result.nTest,
      metricas,
    },
  };
}
