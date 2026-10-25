// S17 (ADR 024): los modelos que el SERVICIO no ofrece, con su razón. El modelo se entrena en el navegador (Pyodide, 32 bits) y
// el servicio lo abre en CPython de 64 bits: la mayoría de los modelos de scikit-learn, LightGBM y XGBoost cruzan sin una
// diferencia, pero el de vecinos más cercanos guarda su estructura de búsqueda con enteros de 32 bits y no se abre. La lista no
// es una opinión: la CI exporta CADA modelo del roster desde Pyodide y lo abre en CPython (tests/integration/publica.test.ts y
// tests/python/test_publica.py); un modelo que falla ahí tiene que estar aquí, y uno que no falla no puede estar.
// El puntuador portátil sí sirve a todos: corre en Pyodide, donde se entrenó.
import type { MemberId } from "@/engine/roster";

export const NO_SERVIBLES: Readonly<Partial<Record<MemberId, true>>> = {
  knn: true,
};

export function esServible(modelName: string): boolean {
  return !Object.hasOwn(NO_SERVIBLES, modelName);
}
