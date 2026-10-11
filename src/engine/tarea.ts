// E1 — encarrilador de la TAREA (S5, ADR-010): mira la columna objetivo y decide
// qué tipo de problema es, con su razón. Determinista y puro (no entrena nada;
// solo cuenta valores distintos de la columna elegida). Desde el S7 se entrenan
// las tres tareas con objetivo; una columna que no sirve como objetivo se nombra
// con su razón en vez de esconderla.
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
/** S7: con dos valores es binaria; varias categorías empiezan en tres (espejo de
 *  MULTICLASS_MIN_CLASSES en pipeline.py, paridad en tests/unit/roster.test.ts). */
export const MULTICLASS_MIN_CLASSES = 3;

/**
 * S7: orden de las clases por punto de código — el de `sorted()` de Python, que
 * las codifica 0..K−1 y las coteja con las que manda TS. (El `sort()` de JS compara
 * unidades UTF-16 y difiere fuera del plano básico: un emoji contra «ﬀ».) Lo usan la
 * partición, la EDA y la fuga por clase (AU-S7-29): con un empate, la clase que se
 * nombra es la misma en todos lados.
 */
export function byCodePoint(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i]!.codePointAt(0)! - y[i]!.codePointAt(0)!;
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

/** Todas las tareas que E1 nombra. Un `Record` completo: sumar una tarea a `Task`
 *  sin listarla aquí no compila. */
const TASK_NAMES: Record<Task, true> = {
  binaria: true,
  multiclase: true,
  numerica: true,
  "sin-objetivo": true,
  ambigua: true,
};

/** ¿Es un nombre de tarea de esta versión? (p. ej. el que declara un archivo). */
export function isTask(name: string): name is Task {
  return Object.hasOwn(TASK_NAMES, name);
}

/** Cierre exhaustivo de un `switch` por tarea: si la unión crece, el caso que
 *  falta no compila; si llega igual en runtime, falla nombrándola (AU-S6-03). */
export function assertNever(value: never): never {
  throw new Error(`tarea sin rama propia: ${String(value)}`);
}

/** Las tareas CON objetivo que el motor sabe entrenar (S6: también estimar una
 *  cantidad). S7 (P1): lo que depende de tener un objetivo (la EDA supervisada, el
 *  veredicto contra un baseline) va por esta unión. */
export type SupervisedTask = "binaria" | "multiclase" | "numerica";

/** S7 (ADR 016): agrupar filas parecidas, SIN objetivo. No es lo que E1 detecta en
 *  una columna (`Task` no cambia): es una elección sobre el dataset entero. */
export type ClusterTask = "agrupar";
/** La etiqueta con que viaja (la cotejan los lectores de agrupar). */
export const CLUSTER_TASK = "agrupar" satisfies ClusterTask;

/** Todas las tareas que el MOTOR sabe entrenar. Toda decisión por tarea pasa por
 *  engine/despacho.ts, que obliga a escribir la rama de cada una (S7, P2). */
export type TrainTask = SupervisedTask | ClusterTask;

/** Un `Record` completo: sumar una tarea a `TrainTask` sin listarla aquí no compila. */
const TRAIN_TASK_NAMES: Record<TrainTask, true> = {
  binaria: true,
  multiclase: true,
  numerica: true,
  agrupar: true,
};
export const TRAIN_TASKS = Object.keys(TRAIN_TASK_NAMES) as TrainTask[];

/** Las tareas de una columna que la UI ofrece entrenar: las tres con objetivo (S7
 *  F3: la multiclase llega a la UI). Agrupar no es una tarea de columna: se elige
 *  sobre el dataset entero (ConfigScreen). */
export const TRAINABLE_TASKS: readonly Task[] = [
  "binaria",
  "multiclase",
  "numerica",
];

/** Respuesta del usuario a la pregunta de una columna ambigua (D2 del S6). */
export type AmbiguousChoice = "multiclase" | "numerica";

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
  return isTrainableTask(detection.task);
}

/** S6: lo mismo para una tarea ya resuelta (la ambigua, tras la respuesta del usuario). */
export function isTrainableTask(task: Task): boolean {
  return TRAINABLE_TASKS.includes(task);
}

/**
 * La tarea con que se entrena: la detectada, salvo que sea ambigua y el usuario
 * haya respondido «¿clases o cantidad?» (D2 del S6). Sin respuesta, una ambigua
 * sigue siendo ambigua: la app pregunta, no adivina.
 */
export function resolveTask(
  detection: TaskDetection,
  choice?: AmbiguousChoice | null,
): Task {
  return detection.task === "ambigua" && choice ? choice : detection.task;
}

/** ¿Entrena el motor esta tarea detectada? (Las de una columna son con objetivo:
 *  agrupar no se detecta, se elige.) */
export function isTrainTask(task: Task): task is SupervisedTask {
  return (TRAIN_TASKS as readonly string[]).includes(task);
}
