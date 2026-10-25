// S19 (ADR 027): el lector de lo que `simulate` entrega para «¿qué pasaría si?». Vive aparte de contract.ts (que ya llega al bundle
// inicial de `/`): solo lo importan los paneles diferidos. Además de la forma cruza lo que solo el lector puede comprobar: es de la
// tarea, la columna y el número de filas enviados; las etiquetas son las clases del modelo (dos clases: la positiva es la enviada;
// varias: las mismas K clases en el mismo orden); las probabilidades están en [0, 1] y, en varias clases, tienen K por fila;
// agrupar da grupos enteros; estimar da números finitos. Rechaza nombrando el campo, jamás con un valor (regla dura 2).
import { matchTask } from "@/engine/despacho";
import type { TrainTask } from "@/engine/tarea";
import {
  arr,
  check,
  int,
  nullable,
  num,
  obj,
  oneOf,
  optional,
  refine,
  str,
  type Checked,
  type Validator,
} from "@/lib/validate";
import type { SimulateResult } from "@/workers/protocol";

/** Lo que el hilo principal conoce y el lector coteja. */
export type SimuladorSent = {
  readonly task: TrainTask;
  readonly n: number;
  readonly column: string;
  /** Las clases del modelo (dos o varias); `null` al estimar y al agrupar. */
  readonly classes: readonly string[] | null;
  /** Solo dos clases: la clase positiva del esquema. */
  readonly positive: string | null;
};

const escalar: Validator = (v, path) =>
  typeof v === "string" || (typeof v === "number" && Number.isFinite(v))
    ? null
    : path;

/** El resultado de puntuar unas filas: `proba` es una lista de números o una de listas (varias clases). */
const puntaje = obj({
  pred: arr(escalar),
  proba: nullable(arr((v, path) => (Array.isArray(v) ? arr(num)(v, path) : num(v, path)))),
});

const enUnidad = (v: number) => v >= 0 && v <= 1;

export function validateSimulateResult(
  raw: unknown,
  sent: SimuladorSent,
): Checked<SimulateResult> {
  const shaped = check<SimulateResult>(
    obj({
      task: oneOf([sent.task]),
      n: refine(int, (v) => v === sent.n),
      column: oneOf([sent.column]),
      base: puntaje,
      changed: puntaje,
      outside: obj({
        before: refine(int, (v) => (v as number) >= 0 && (v as number) <= sent.n),
        after: refine(int, (v) => (v as number) >= 0 && (v as number) <= sent.n),
      }),
      positive_class: optional(str),
      classes: optional(arr(str)),
      elapsed_ms: num,
    }),
    raw,
  );
  if (!shaped.ok) return shaped;
  const r = shaped.value;
  const clases = sent.classes ?? [];
  const falla = matchTask(sent.task, {
    binaria: () => {
      if (r.positive_class !== sent.positive) return "positive_class";
      if (r.classes !== undefined) return "classes";
      // las dos clases: las del esquema si se conocen; si no, a lo sumo dos etiquetas distintas entre las dos versiones
      const etiquetas = new Set([...r.base.pred, ...r.changed.pred]);
      if (clases.length === 0 && etiquetas.size > 2) return "base.pred";
      for (const lado of ["base", "changed"] as const) {
        const { pred, proba } = r[lado];
        if (
          pred.length !== sent.n ||
          !pred.every(
            (v) => typeof v === "string" && (clases.length === 0 || clases.includes(v)),
          )
        )
          return `${lado}.pred`;
        if (
          proba !== null &&
          (proba.length !== sent.n ||
            !(proba as unknown[]).every((v) => typeof v === "number" && enUnidad(v)))
        )
          return `${lado}.proba`;
      }
      // sin probabilidades en una versión, sin ellas en la otra: es una propiedad del modelo, no de las filas
      return (r.base.proba === null) !== (r.changed.proba === null) ? "proba" : null;
    },
    multiclase: () => {
      if (r.positive_class !== undefined) return "positive_class";
      if (!r.classes || r.classes.join("\u0000") !== clases.join("\u0000")) return "classes";
      for (const lado of ["base", "changed"] as const) {
        const { pred, proba } = r[lado];
        if (pred.length !== sent.n || !pred.every((v) => typeof v === "string" && clases.includes(v)))
          return `${lado}.pred`;
        if (
          proba !== null &&
          (proba.length !== sent.n ||
            !(proba as unknown[]).every(
              (fila) =>
                Array.isArray(fila) &&
                fila.length === clases.length &&
                fila.every((v) => typeof v === "number" && enUnidad(v)),
            ))
        )
          return `${lado}.proba`;
      }
      return (r.base.proba === null) !== (r.changed.proba === null) ? "proba" : null;
    },
    numerica: () => {
      if (r.positive_class !== undefined) return "positive_class";
      if (r.classes !== undefined) return "classes";
      for (const lado of ["base", "changed"] as const) {
        const { pred, proba } = r[lado];
        if (pred.length !== sent.n || !pred.every((v) => typeof v === "number")) return `${lado}.pred`;
        if (proba !== null) return `${lado}.proba`;
      }
      return null;
    },
    agrupar: () => {
      if (r.positive_class !== undefined) return "positive_class";
      if (r.classes !== undefined) return "classes";
      for (const lado of ["base", "changed"] as const) {
        const { pred, proba } = r[lado];
        if (pred.length !== sent.n || !pred.every((v) => Number.isInteger(v))) return `${lado}.pred`;
        if (proba !== null) return `${lado}.proba`;
      }
      return null;
    },
  });
  return falla === null ? shaped : { ok: false, field: falla };
}
