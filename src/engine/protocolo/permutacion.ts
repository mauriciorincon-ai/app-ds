// Protocolo DS (S12), etapa 7 — ¿HAY SEÑAL O SOLO AZAR? (VISION v2.0.0 § 8, «¿Hay señal real?»). El worker
// baraja las etiquetas DEL ENTRENAMIENTO y vuelve a correr la validación cruzada del ganador con los mismos
// pliegues; aquí se cuenta: el valor p es la fracción de barajados que lo hacen igual o mejor que el real,
// con el +1 de la propia observación (Phipson y Smyth, 2010), así que nunca es cero y su resolución es
// 1/(N + 1). El 0,05 es una CONVENCIÓN, no una prueba de que el modelo sirva.

/** Cuántas permutaciones pide la etapa: el presupuesto de tiempo entre lo que tarda la CV del ganador. */
export const PERMUTACIONES = {
  presupuestoMs: 20_000,
  min: 20,
  max: 200,
} as const;

/** El umbral del valor p, una convención. */
export const UMBRAL_SENAL = 0.05;

export type Direccion = "higher" | "lower";
export type Senal = "senal" | "sin-senal";

/** Cuántos barajados lo hacen igual o mejor que el observado. */
export function igualOMejor(
  observado: number,
  nulos: readonly number[],
  direccion: Direccion,
): number {
  return nulos.filter((x) =>
    direccion === "higher" ? x >= observado : x <= observado,
  ).length;
}

/** El valor p de la permutación: (1 + igual o mejor) / (N + 1), con N los barajados que se pudieron puntuar. */
export function valorP(mejores: number, n: number): number {
  return (1 + mejores) / (n + 1);
}

/** El menor valor p posible con N permutaciones. */
export const resolucion = (n: number): number => 1 / (n + 1);

export const senalDe = (p: number): Senal =>
  p <= UMBRAL_SENAL ? "senal" : "sin-senal";
