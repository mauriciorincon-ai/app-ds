// S18: el intervalo de la métrica del ganador en la prueba de Probeta — bootstrap por filas, 1 000 remuestreos, semilla fija. Puro
// y determinista: la misma prueba y la misma semilla dan la misma cifra. Reusa el generador (`mulberry32`) y el cuantil
// (`cuantilEmpirico`) que la etapa 8 del Protocolo ya usa, y resuelve CADA métrica primaria de las tres tareas con objetivo
// (el `intervaloBootstrap` del Protocolo solo sirve para cantidades aditivas, como el costo).
//
// Qué dice y qué no: es la variación de la métrica si la prueba hubiera sido otra muestra de las mismas filas. No incluye la
// variación de entrenar con otras filas, ni cubre un cambio en los datos de mañana (eso es la prueba de estrés).
import { matchTask } from "@/engine/despacho";
import { mulberry32 } from "@/engine/split";
import { cuantilEmpirico } from "@/engine/protocolo/tabla";
import type { SupervisedTask } from "@/engine/tarea";
import type { PrimaryMetric } from "@/engine/verdict";

export const REMUESTREOS = 1000;
export const NIVEL = 0.95;
/** Con menos filas de prueba el intervalo es tan ancho que casi no dice nada: la pantalla lo avisa. */
export const FILAS_PRUEBA_POCAS = 50;

export type Intervalo = {
  /** La métrica sobre la prueba tal cual (la del veredicto). */
  valor: number;
  bajo: number;
  alto: number;
  remuestreos: number;
  semilla: number;
  n: number;
};

type Datos = {
  readonly y: readonly number[];
  readonly pred: readonly number[];
  readonly score: readonly number[] | null;
};

/** Una métrica calculada sobre una muestra con REPETICIONES: `peso[i]` = cuántas veces entró la fila i. */
type Medida = (peso: Int32Array | Float64Array) => number;

function medidaDe(
  task: SupervisedTask,
  metric: PrimaryMetric,
  datos: Datos,
  clases: number,
): Medida {
  const { y, pred, score } = datos;
  const n = y.length;

  // MAE: el error absoluto medio en las unidades del objetivo
  const numerica = (): Medida => (peso) => {
    let suma = 0;
    let total = 0;
    for (let i = 0; i < n; i++) {
      suma += peso[i]! * Math.abs(y[i]! - pred[i]!);
      total += peso[i]!;
    }
    return total > 0 ? suma / total : 0;
  };

  // exactitud balanceada: el promedio del recall de cada clase PRESENTE en la muestra
  const multiclase = (): Medida => (peso) => {
    const verdaderos = new Float64Array(clases);
    const aciertos = new Float64Array(clases);
    for (let i = 0; i < n; i++) {
      const k = y[i]!;
      verdaderos[k]! += peso[i]!;
      if (pred[i] === k) aciertos[k]! += peso[i]!;
    }
    let suma = 0;
    let presentes = 0;
    for (let k = 0; k < clases; k++) {
      if (verdaderos[k]! > 0) {
        suma += aciertos[k]! / verdaderos[k]!;
        presentes += 1;
      }
    }
    return presentes > 0 ? suma / presentes : 0;
  };

  // dos clases: la positiva es 1
  const binaria = (): Medida => {
    if (metric === "auc") {
      if (score === null) throw new Error("score");
      // las filas ordenadas UNA vez por puntaje; cada remuestreo recorre ese orden con los pesos
      const orden = Array.from({ length: n }, (_, i) => i).sort(
        (a, b) => score[a]! - score[b]!,
      );
      return (peso) => {
        let positivos = 0;
        let negativos = 0;
        for (let i = 0; i < n; i++) {
          if (y[i] === 1) positivos += peso[i]!;
          else negativos += peso[i]!;
        }
        // como _metrics en pipeline.py: sin las dos clases no hay curva
        if (positivos === 0 || negativos === 0) return 0.5;
        let numerador = 0;
        let negativosAntes = 0;
        let g = 0;
        while (g < n) {
          let h = g;
          let pos = 0;
          let neg = 0;
          while (h < n && score[orden[h]!] === score[orden[g]!]) {
            const fila = orden[h]!;
            if (y[fila] === 1) pos += peso[fila]!;
            else neg += peso[fila]!;
            h += 1;
          }
          numerador += pos * (negativosAntes + 0.5 * neg);
          negativosAntes += neg;
          g = h;
        }
        return numerador / (positivos * negativos);
      };
    }
    return (peso) => {
      let tp = 0;
      let fp = 0;
      let fn = 0;
      let tn = 0;
      for (let i = 0; i < n; i++) {
        const w = peso[i]!;
        if (y[i] === 1) {
          if (pred[i] === 1) tp += w;
          else fn += w;
        } else if (pred[i] === 1) fp += w;
        else tn += w;
      }
      const total = tp + fp + fn + tn;
      if (metric === "accuracy") return total > 0 ? (tp + tn) / total : 0;
      if (metric === "precision") return tp + fp > 0 ? tp / (tp + fp) : 0;
      if (metric === "recall") return tp + fn > 0 ? tp / (tp + fn) : 0;
      // f1
      return 2 * tp + fp + fn > 0 ? (2 * tp) / (2 * tp + fp + fn) : 0;
    };
  };

  return matchTask(task, { binaria, multiclase, numerica });
}

export function calcularIntervalo(entrada: {
  task: SupervisedTask;
  metric: PrimaryMetric;
  y: readonly number[];
  pred: readonly number[];
  score: readonly number[] | null;
  /** Solo varias categorías. */
  clases?: number;
  semilla: number;
  remuestreos?: number;
}): Intervalo {
  const n = entrada.y.length;
  const remuestreos = entrada.remuestreos ?? REMUESTREOS;
  const medida = medidaDe(
    entrada.task,
    entrada.metric,
    entrada,
    entrada.clases ?? 2,
  );
  const valor = medida(new Int32Array(n).fill(1));
  const rng = mulberry32(entrada.semilla);
  const peso = new Int32Array(n);
  const valores: number[] = [];
  for (let r = 0; r < remuestreos; r++) {
    peso.fill(0);
    for (let i = 0; i < n; i++) peso[Math.floor(rng() * n)]! += 1;
    valores.push(medida(peso));
  }
  valores.sort((a, b) => a - b);
  const cola = (1 - NIVEL) / 2;
  return {
    valor,
    bajo: cuantilEmpirico(valores, cola),
    alto: cuantilEmpirico(valores, 1 - cola),
    remuestreos,
    semilla: entrada.semilla,
    n,
  };
}
