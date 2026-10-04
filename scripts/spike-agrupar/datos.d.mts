// Tipos de los generadores sin objetivo (datos.mjs) para los tests en TS.
export declare function nubes(options: {
  n: number;
  seed: number;
  k?: number;
  dims?: number;
}): string;

export declare function uniforme(options: {
  n: number;
  seed: number;
  dims: number;
}): string;
