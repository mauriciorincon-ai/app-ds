// E1 — encarrilador de la TAREA (S5, ADR-010): mira la columna objetivo y decide
// qué tipo de problema es, con su razón. Determinista y puro (no entrena nada;
// solo cuenta valores distintos de la columna elegida). Solo la clasificación
// binaria entrena en el S5; las demás tareas se nombran con honestidad («llega
// en el S6/S7») en vez de esconder la columna.
import { isNullToken, parseNumber } from "@/lib/ds/csv";

export type Task =
  "binaria" | "multiclase" | "numerica" | "sin-objetivo" | "ambigua";

export type TaskReason =
  /** Exactamente dos valores distintos. */
  | "two-values"
  /** Texto con pocas categorías (3..MULTICLASS_MAX_CLASSES). */
  | "few-categories"
  /** Números con muchos valores distintos: se predice una cantidad. */
  | "many-numbers"
  /** Números con pocos valores distintos (p. ej. una nota de 1 a 5): podría ser
   *  clases o cantidad — la app pregunta, con una respuesta sugerida. */
  | "few-numbers"
  /** Texto con demasiadas categorías para ser clases (identificador, texto libre). */
  | "too-many-categories"
  /** Un solo valor: no hay nada que predecir. */
  | "constant"
  /** Todo nulo. */
  | "empty";

export type TaskDetection = {
  task: Task;
  reason: TaskReason;
  /** Valores distintos no nulos. */
  distinct: number;
  /** Solo en `ambigua`: la lectura más probable. */
  suggested?: "multiclase" | "numerica";
};

/** Números con a lo sumo tantos valores distintos son ambiguos (clases o cantidad). */
export const AMBIGUOUS_MAX_DISTINCT = 10;
/** Texto con más categorías que esto no se trata como clases. */
export const MULTICLASS_MAX_CLASSES = 20;

/** Las tareas que el S5 sabe entrenar. */
export const TRAINABLE_TASKS: readonly Task[] = ["binaria"];

export function detectTask(values: readonly string[]): TaskDetection {
  const distinct = new Set<string>();
  const numbers = new Set<number>();
  let nonNull = 0;
  let numeric = 0;
  for (const raw of values) {
    if (isNullToken(raw)) continue;
    nonNull += 1;
    const value = raw.trim();
    distinct.add(value);
    const n = parseNumber(value);
    if (n !== null) {
      numeric += 1;
      numbers.add(n);
    }
  }

  if (nonNull === 0)
    return { task: "sin-objetivo", reason: "empty", distinct: 0 };
  const isNumeric = numeric === nonNull;
  // En una columna numérica «1» y «1.0» son el mismo valor.
  const count = isNumeric ? numbers.size : distinct.size;
  if (count === 1)
    return { task: "sin-objetivo", reason: "constant", distinct: 1 };
  if (count === 2)
    return { task: "binaria", reason: "two-values", distinct: count };

  if (isNumeric) {
    if (count <= AMBIGUOUS_MAX_DISTINCT) {
      const integers = [...numbers].every((n) => Number.isInteger(n));
      return {
        task: "ambigua",
        reason: "few-numbers",
        distinct: count,
        suggested: integers ? "multiclase" : "numerica",
      };
    }
    return { task: "numerica", reason: "many-numbers", distinct: count };
  }

  if (count <= MULTICLASS_MAX_CLASSES) {
    return { task: "multiclase", reason: "few-categories", distinct: count };
  }
  return {
    task: "sin-objetivo",
    reason: "too-many-categories",
    distinct: count,
  };
}

export function isTrainable(detection: TaskDetection): boolean {
  return TRAINABLE_TASKS.includes(detection.task);
}
