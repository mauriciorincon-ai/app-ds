// S13 (Protocolo DS, etapa 8): el lector del resultado de `run_test`, el único comando que recibe filas
// de la prueba. Vive aparte de contract.ts, que ya llega al bundle inicial de /protocolo: a este módulo lo
// importa solo el hook diferido de la etapa 8. Además de la forma, cruza lo que solo el lector puede
// comprobar: el ganador es el de la etapa 7, los tamaños son los enviados, hay una predicción por fila de la
// prueba, la métrica es la de la liga, y el sello y la huella vuelven tal cual se mandaron (el eco: Python
// no puede rehacer el sello, así que TS confirma que habló de la misma prueba).
import { byTask } from "@/engine/despacho";
import { isMemberOf, type MemberId } from "@/engine/roster";
import type { SupervisedTask } from "@/engine/tarea";
import type { PrimaryMetric } from "@/engine/verdict";
import {
  arr,
  check,
  int,
  isRecord,
  nullable,
  num,
  obj,
  oneOf,
  refine,
  str,
  type Checked,
  type Validator,
} from "@/lib/validate";
import type { TestResult } from "./protocol";

/** Lo que el hilo principal envió y el lector tiene que cotejar. */
export type TestSent = {
  readonly task: SupervisedTask;
  readonly winner: MemberId;
  readonly primary_metric: PrimaryMetric;
  readonly n_train: number;
  readonly n_test: number;
  readonly huella: string;
  readonly sello: string;
  readonly classes?: readonly string[];
  readonly positive?: string;
};

const nonNegInt = refine(int, (v) => (v as number) >= 0);
const unit01 = refine(num, (v) => (v as number) >= 0 && (v as number) <= 1);

export function validateTestResult(
  raw: unknown,
  sent: TestSent,
): Checked<TestResult> {
  if (!isRecord(raw) || raw.task !== sent.task)
    return { ok: false, field: "task" };
  const predV: Validator = byTask(sent.task, {
    binaria: oneOf([0, 1]),
    multiclase: oneOf(sent.classes ?? []),
    numerica: num,
  });
  const camposDeTarea: Record<string, Validator> = byTask(sent.task, {
    binaria: { classes: arr(str, 2), positive_class: str } as Record<
      string,
      Validator
    >,
    multiclase: { classes: arr(str, 2) } as Record<string, Validator>,
    numerica: {} as Record<string, Validator>,
  });
  // el AUC, el F1 y la exactitud balanceada van de 0 a 1; el error medio no es negativo
  const valorV: Validator = byTask(sent.task, {
    binaria: unit01,
    multiclase: unit01,
    numerica: refine(num, (v) => (v as number) >= 0),
  });
  const shaped = check<TestResult>(
    obj({
      ...camposDeTarea,
      winner: (v, path) => (isMemberOf(sent.task, v) ? null : path),
      n_train: nonNegInt,
      n_test: nonNegInt,
      pred: arr(predV, 1),
      proba: nullable(arr(unit01, 1)),
      metric: obj({ name: str, value: valorV }),
      huella: str,
      sello: str,
      elapsed_ms: nonNegInt,
    }),
    raw,
  );
  if (!shaped.ok) return shaped;
  const r = shaped.value;
  if (r.winner !== sent.winner) return { ok: false, field: "winner" };
  if (r.n_train !== sent.n_train) return { ok: false, field: "n_train" };
  if (r.n_test !== sent.n_test) return { ok: false, field: "n_test" };
  if (r.pred.length !== sent.n_test) return { ok: false, field: "pred" };
  // una cantidad no trae probabilidades; las clases, una por fila o ninguna
  const conProba = byTask(sent.task, {
    binaria: true,
    multiclase: true,
    numerica: false,
  });
  if (r.proba !== null && (!conProba || r.proba.length !== sent.n_test))
    return { ok: false, field: "proba" };
  if (r.metric.name !== sent.primary_metric)
    return { ok: false, field: "metric.name" };
  if (r.huella !== sent.huella) return { ok: false, field: "huella" };
  if (r.sello !== sent.sello) return { ok: false, field: "sello" };
  const clasesField = byTask(sent.task, {
    binaria: () =>
      r.positive_class !== sent.positive ||
      !(r.classes ?? []).includes(r.positive_class ?? "")
        ? "positive_class"
        : null,
    multiclase: () =>
      (r.classes ?? []).length !== (sent.classes ?? []).length ||
      (r.classes ?? []).some((c, i) => c !== sent.classes?.[i])
        ? "classes"
        : null,
    numerica: () => null,
  })();
  if (clasesField) return { ok: false, field: clasesField };
  return shaped;
}
