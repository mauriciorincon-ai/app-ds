// La prueba de estrés (S17, ADR 023) — lo MÍNIMO que comparten el motor de la etapa 8 (que viaja con la página del
// Protocolo) y la lectura (que viaja con su pantalla): las constantes de la receta y el renglón de un nivel. Vive aparte
// de `estres.ts` para que el peso inicial de `/protocolo` no cargue la lectura entera (ADR 023, consecuencias).
import type { StressResult } from "@/workers/protocol";

/** Espejo de pipeline.py (STRESS_*): paridad vigilada en tests/unit/estres.test.ts. */
export const NOISE_LEVELS = [0.05, 0.1, 0.2] as const;
export const SHIFT_LEVELS = [0.5, 1] as const;
export const SHUFFLE_REPEATS = 5;
export const SHIFT_COLUMNS = 3;
/** El nivel con que se juzga y con que se escribe el sello de la ficha: 10 % de la desviación (ADR 023). */
export const SEAL_NOISE_LEVEL = 0.1;

/** El renglón de ruido de un nivel, o `undefined` si ese nivel no se midió. */
export function noiseAt(r: StressResult, level: number) {
  return r.noise.find((n) => n.level === level);
}
