// S18: el lector de lo que `run_interval` entrega para el intervalo de la métrica en Probeta. Vive aparte de contract.ts (que
// ya llega al bundle inicial de `/`): solo lo importa el panel diferido del intervalo. Además de la forma cruza lo que solo el
// lector puede comprobar: es de la tarea y la métrica enviadas, tiene tantas filas como la prueba, las etiquetas de dos
// clases son 0 o 1, las de varias son enteros dentro de 0..K−1 y el puntaje de dos clases viene por fila. Rechaza
// nombrando el campo, jamás con un valor (regla dura 2).
import { matchTask } from "@/engine/despacho";
import type { SupervisedTask } from "@/engine/tarea";
import type { PrimaryMetric } from "@/engine/verdict";
import {
  arr,
  check,
  int,
  nullable,
  num,
  obj,
  oneOf,
  refine,
  type Checked,
} from "@/lib/validate";

/** Lo que el hilo principal conoce y el lector coteja. */
export type IntervaloSent = {
  readonly task: SupervisedTask;
  readonly primary_metric: PrimaryMetric;
  readonly n_test: number;
  /** Solo en varias categorías: cuántas clases (las etiquetas van de 0 a K−1). */
  readonly n_classes: number | null;
  /** La semilla del experimento: el worker la devuelve y tiene que ser la misma (S21, lote 18-11). */
  readonly seed: number;
};

export type DatosIntervalo = {
  task: SupervisedTask;
  metric: PrimaryMetric;
  n: number;
  seed: number;
  /** Lo real: 0/1 (dos clases), 0..K−1 (varias) o la cantidad en sus unidades. */
  y: number[];
  pred: number[];
  /** Solo dos clases: el puntaje de la clase positiva por fila. */
  score: number[] | null;
};

export function validateIntervalData(
  raw: unknown,
  sent: IntervaloSent,
): Checked<DatosIntervalo> {
  const shaped = check<DatosIntervalo>(
    obj({
      task: oneOf([sent.task]),
      metric: oneOf([sent.primary_metric]),
      n: refine(int, (v) => v === sent.n_test),
      seed: refine(int, (v) => v === sent.seed),
      y: arr(num),
      pred: arr(num),
      score: nullable(arr(num)),
    }),
    raw,
  );
  if (!shaped.ok) return shaped;
  const { y, pred, score, n } = shaped.value;
  if (y.length !== n) return { ok: false, field: "y" };
  if (pred.length !== n) return { ok: false, field: "pred" };
  const dentro = (v: number, k: number) =>
    Number.isInteger(v) && v >= 0 && v < k;
  const falla = matchTask(sent.task, {
    binaria: () => {
      if (!y.every((v) => dentro(v, 2))) return "y";
      if (!pred.every((v) => dentro(v, 2))) return "pred";
      if (score === null || score.length !== n) return "score";
      return null;
    },
    multiclase: () => {
      const k = sent.n_classes ?? 0;
      if (score !== null) return "score";
      if (!y.every((v) => dentro(v, k))) return "y";
      if (!pred.every((v) => dentro(v, k))) return "pred";
      return null;
    },
    numerica: () => (score !== null ? "score" : null),
  });
  if (falla !== null) return { ok: false, field: falla };
  return shaped;
}
