// S19 (ADR 027): el lector de lo que `evaluate-new` entrega para vigilar el desempeño. Vive aparte de contract.ts (que ya llega al
// bundle inicial de `/`): solo lo importa el panel diferido de la vigilancia. Además de la forma cruza lo que solo el lector puede
// comprobar: es de la tarea y de las filas enviadas; las que se usan más las que se dejaron fuera suman las enviadas; lo real y lo
// predicho tienen una por fila usada; las etiquetas de dos clases son 0 o 1, las de varias son enteros dentro de 0..K−1, y el
// puntaje de dos clases viene por fila. Rechaza nombrando el campo, jamás con un valor (regla dura 2).
import { matchTask } from "@/engine/despacho";
import type { SupervisedTask } from "@/engine/tarea";
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
import type { EvaluateNewResult } from "@/workers/protocol";

export type VigilanciaSent = {
  readonly task: SupervisedTask;
  /** Las filas del CSV nuevo que se enviaron. */
  readonly rows: number;
  /** Solo varias categorías: cuántas clases (las etiquetas van de 0 a K−1). */
  readonly n_classes: number | null;
};

const cuenta = refine(int, (v) => (v as number) >= 0);

export function validateEvaluateResult(
  raw: unknown,
  sent: VigilanciaSent,
): Checked<EvaluateNewResult> {
  const shaped = check<EvaluateNewResult>(
    obj({
      task: oneOf([sent.task]),
      n_rows: refine(int, (v) => v === sent.rows),
      n_used: cuenta,
      dropped: obj({ empty: cuenta, unknown: cuenta }),
      y: arr(num),
      pred: arr(num),
      score: nullable(arr(num)),
      elapsed_ms: num,
    }),
    raw,
  );
  if (!shaped.ok) return shaped;
  const r = shaped.value;
  if (r.n_used + r.dropped.empty + r.dropped.unknown !== r.n_rows)
    return { ok: false, field: "n_used" };
  if (r.y.length !== r.n_used) return { ok: false, field: "y" };
  if (r.pred.length !== r.n_used) return { ok: false, field: "pred" };
  const dentro = (v: number, k: number) =>
    Number.isInteger(v) && v >= 0 && v < k;
  const falla = matchTask(sent.task, {
    binaria: () => {
      if (!r.y.every((v) => dentro(v, 2))) return "y";
      if (!r.pred.every((v) => dentro(v, 2))) return "pred";
      if (r.n_used > 0 && (r.score === null || r.score.length !== r.n_used))
        return "score";
      return null;
    },
    multiclase: () => {
      const k = sent.n_classes ?? 0;
      if (r.score !== null) return "score";
      if (!r.y.every((v) => dentro(v, k))) return "y";
      if (!r.pred.every((v) => dentro(v, k))) return "pred";
      return null;
    },
    numerica: () => (r.score !== null ? "score" : null),
  });
  return falla === null ? shaped : { ok: false, field: falla };
}
