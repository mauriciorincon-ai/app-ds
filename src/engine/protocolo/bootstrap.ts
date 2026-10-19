// Protocolo DS (S13), etapa 8 — el intervalo de un costo medio por decisión EN LA PRUEBA. Bootstrap de
// percentiles (2,5 % y 97,5 %) que remuestrea CONGLOMERADOS, no filas, cuando el esquema de la etapa 6 dice
// que las filas no son independientes: por grupo, la unidad entera; por tiempo, la fecha entera; estratificada,
// la fila. Remuestrear filas sueltas de una misma unidad haría el intervalo más angosto de lo que es. Con
// semilla: el mismo archivo da siempre el mismo intervalo. Con una prueba chica, el intervalo es ancho, y es
// lo honesto.
import { mulberry32 } from "@/engine/split";
import { cuantilEmpirico } from "./tabla";

export const SEMILLA_8 = 20261101;
export const REMUESTREOS = 1000;

export type Intervalo = {
  /** El costo medio por decisión en las filas medidas. */
  readonly media: number;
  readonly bajo: number;
  readonly alto: number;
};

/** A qué conglomerado pertenece cada posición (0, 1, 2… en el orden en que aparece cada clave). */
export function conglomeradosDe(claves: readonly string[]): number[] {
  const indice = new Map<string, number>();
  return claves.map((k) => {
    let i = indice.get(k);
    if (i === undefined) indice.set(k, (i = indice.size));
    return i;
  });
}

/**
 * El intervalo del 95 % del costo medio, remuestreando conglomerados con reemplazo. `grupos[i]` es el
 * conglomerado del valor i (de `conglomeradosDe`). Cada réplica suma los valores y las filas de los
 * conglomerados que salieron, y su media es el cociente (un conglomerado grande pesa más).
 */
export function intervaloBootstrap(
  valores: readonly number[],
  grupos: readonly number[],
  remuestreos = REMUESTREOS,
  semilla = SEMILLA_8,
): Intervalo {
  const n = valores.length;
  if (n === 0) return { media: 0, bajo: 0, alto: 0 };
  const c = 1 + Math.max(...grupos);
  const [suma, filas] = [new Float64Array(c), new Float64Array(c)];
  let total = 0;
  for (let i = 0; i < n; i++) {
    suma[grupos[i]!]! += valores[i]!;
    filas[grupos[i]!]! += 1;
    total += valores[i]!;
  }
  const rng = mulberry32(semilla);
  const medias = new Float64Array(remuestreos);
  for (let b = 0; b < remuestreos; b++) {
    let [s, m] = [0, 0];
    for (let j = 0; j < c; j++) {
      const g = Math.floor(rng() * c);
      s += suma[g]!;
      m += filas[g]!;
    }
    medias[b] = s / m;
  }
  const ordenadas = Array.from(medias).sort((a, b) => a - b);
  return {
    media: total / n,
    bajo: cuantilEmpirico(ordenadas, 0.025),
    alto: cuantilEmpirico(ordenadas, 0.975),
  };
}
