// Split estratificado train/test, determinista y seeded.
//
// Es la garantía anti-fuga a nivel de partición: devuelve ÍNDICES, y el
// preprocesamiento (en el pipeline de sklearn) se ajusta SOLO sobre `trainIdx`.
// La UI no ofrece ningún otro camino. Un test unit verifica estratificación,
// cero solapamiento y determinismo; si alguien rompe la partición, falla.

export type SplitResult = {
  trainIdx: number[];
  testIdx: number[];
};

// mulberry32: PRNG determinista de 32 bits. Reproducible dado un seed → el
// mismo split siempre, condición para experimentos reproducibles.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates con PRNG inyectado (no muta la entrada).
function shuffle(indices: readonly number[], rng: () => number): number[] {
  const arr = indices.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Particiona los índices [0, labels.length) en train/test preservando la
 * proporción de cada clase (estratificado). Cada clase con ≥2 muestras aporta
 * al menos 1 a train y 1 a test; una clase con 1 sola muestra va a train
 * (no se puede estratificar honestamente con una sola observación).
 */
export function stratifiedSplit(
  labels: readonly (string | number)[],
  testSize: number,
  seed: number,
): SplitResult {
  if (labels.length === 0) {
    throw new Error("stratifiedSplit: labels no puede estar vacío");
  }
  if (!Number.isFinite(testSize) || testSize <= 0 || testSize >= 1) {
    throw new Error("stratifiedSplit: testSize debe estar en (0, 1)");
  }

  const rng = mulberry32(seed);

  const byClass = new Map<string | number, number[]>();
  labels.forEach((label, index) => {
    const bucket = byClass.get(label);
    if (bucket) {
      bucket.push(index);
    } else {
      byClass.set(label, [index]);
    }
  });

  const trainIdx: number[] = [];
  const testIdx: number[] = [];

  for (const indices of byClass.values()) {
    const shuffled = shuffle(indices, rng);
    let nTest: number;
    if (shuffled.length >= 2) {
      nTest = Math.round(shuffled.length * testSize);
      nTest = Math.min(Math.max(nTest, 1), shuffled.length - 1);
    } else {
      nTest = 0;
    }
    for (let i = 0; i < shuffled.length; i++) {
      if (i < nTest) {
        testIdx.push(shuffled[i]);
      } else {
        trainIdx.push(shuffled[i]);
      }
    }
  }

  trainIdx.sort((a, b) => a - b);
  testIdx.sort((a, b) => a - b);
  return { trainIdx, testIdx };
}
