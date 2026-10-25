// S19 (ADR 027): el lector de lo que `fit-winner` entrega al volver a ajustar al ganador del Protocolo con el ENTRENAMIENTO.
// Cruza lo que solo el lector puede comprobar: es del ganador, la tarea y las filas de entrenamiento enviados, y devuelve el eco
// de la huella y del sello (la misma disciplina que la apertura de la prueba, pero aquí no se abre nada). Vive aparte de
// contract.ts: solo lo importan los ganchos diferidos de las etapas 9 y 10 (peso de `/protocolo`). Rechaza nombrando el campo.
import type { SupervisedTask } from "@/engine/tarea";
import type { MemberId } from "@/engine/roster";
import {
  check,
  int,
  num,
  obj,
  oneOf,
  refine,
  type Checked,
} from "@/lib/validate";
import type { FitWinnerResult } from "@/workers/protocol";

export type GanadorSent = {
  readonly task: SupervisedTask;
  readonly winner: MemberId;
  readonly n_train: number;
  readonly huella: string;
  readonly sello: string;
};

export function validateFitWinnerResult(
  raw: unknown,
  sent: GanadorSent,
): Checked<FitWinnerResult> {
  return check<FitWinnerResult>(
    obj({
      task: oneOf([sent.task]),
      winner: oneOf([sent.winner]),
      n_train: refine(int, (v) => v === sent.n_train),
      huella: oneOf([sent.huella]),
      sello: oneOf([sent.sello]),
      elapsed_ms: num,
    }),
    raw,
  );
}
