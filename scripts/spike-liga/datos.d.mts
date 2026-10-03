// Tipos del generador determinista de sintéticos (datos.mjs) para los tests en TS.
export declare function mulberry32(seed: number): () => number;
export declare function ligaSintetica(options: {
  n: number;
  seed: number;
  numericas?: number;
  cardinalidades?: number[];
}): string;
