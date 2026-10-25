// La prueba de estrés (S17, ADR 023) — lo MÍNIMO que el motor de la etapa 8 (que viaja con la página del Protocolo)
// necesita de ella: el nivel del sello y el renglón de ese nivel. Todo lo demás vive en `estres.ts` y viaja con la
// lectura, para que el peso inicial de `/protocolo` no cargue constantes que solo usa la pantalla.
import type { StressResult } from "@/workers/protocol";

/** El nivel con que se juzga y con que se escribe el sello de la ficha: 10 % de la desviación (ADR 023). */
export const SEAL_NOISE_LEVEL = 0.1;

/** El renglón de ruido de un nivel, o `undefined` si ese nivel no se midió. */
export function noiseAt(r: StressResult, level: number) {
  return r.noise.find((n) => n.level === level);
}
