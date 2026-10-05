// Despacho EXHAUSTIVO por tarea (S7, P2 del plan; ADR 015). Hasta el S6 el código
// decidía por tarea con ternarios «si es numérica, X; si no, la binaria»: una tarea
// nueva caía en silencio en la rama binaria. Aquí cada decisión escribe la rama de
// CADA tarea posible: si la unión crece, la que falta no compila (tipos mapeados
// sobre la unión) y, si llega igual en runtime (un archivo, un resultado), falla
// nombrándola.
//
// Qué ramas se exigen lo dice el TIPO de lo que se despacha: una `TrainTask`, todas;
// una `SupervisedTask`, las que tienen objetivo; un resultado, las de su unión
// etiquetada. Ningún `default` y ningún «lo demás es binaria».
//
// Es también el ÚNICO sitio donde la ausencia de tarea se lee como binaria: los
// resultados, esquemas y archivos del S5 no la traían. El tripwire de fuente de
// tests/unit/despacho.test.ts prohíbe comparar tareas fuera de este archivo.
import type { TrainTask } from "@/engine/tarea";

/** Un valor por cada tarea de K (por defecto, todas las que el motor entrena). */
export type ByTask<T, K extends TrainTask = TrainTask> = {
  readonly [P in K]: T;
};

/** Algo que dice su tarea, o que no la dice porque es del S5 (= binaria). */
export type Tasked = { readonly task?: TrainTask };

/** Las tareas que admite la etiqueta de T (una sin `task` es binaria). */
export type TagOf<T> = T extends { readonly task?: infer U }
  ? Extract<NonNullable<U> | (undefined extends U ? "binaria" : never), TrainTask>
  : never;

/** La variante de una unión etiquetada que corresponde a la tarea K. */
export type OfTask<T, K extends TrainTask> = T extends unknown
  ? K extends TagOf<T>
    ? T
    : never
  : never;

/** Las ramas de un despacho sobre un valor: una por tarea de su unión, cada una
 *  con el valor ya estrechado a su variante. */
export type TaskBranches<T, R> = {
  readonly [K in TagOf<T>]: (value: OfTask<T, K>) => R;
};

/** EL único `?? "binaria"`: sin tarea, un dato es del S5 (clasificación binaria).
 *  El tipo es el de la etiqueta del valor: lo que solo puede ser supervisado
 *  devuelve una `SupervisedTask`, y su despacho no pide la rama de agrupar. */
export function taskOf<T extends Tasked>(value: T): TagOf<T> {
  return (value.task ?? "binaria") as TagOf<T>;
}

/** Lo mismo para un registro sin validar (un manifiesto, antes de mirar su forma):
 *  devuelve lo que declare, que puede no ser una tarea; quien llama lo coteja. */
export function declaredTask(
  record: Readonly<Record<string, unknown>>,
): unknown {
  return record.task ?? "binaria";
}

function branchOf<B>(branches: object, task: string): B {
  if (!Object.hasOwn(branches, task)) {
    throw new Error(`tarea sin rama propia: ${task}`);
  }
  return (branches as Readonly<Record<string, B>>)[task]!;
}

/** El valor que le toca a una tarea (el tipo es la unión de los de todas). */
export function byTask<
  K extends TrainTask,
  V extends ByTask<unknown, NoInfer<K>>,
>(task: K, values: V): V[keyof V] {
  return branchOf<V[keyof V]>(values, task);
}

type Fn = (...args: never[]) => unknown;
type Returned<B> = { [P in keyof B]: B[P] extends Fn ? ReturnType<B[P]> : never }[keyof B];

/** Ejecuta la rama de una tarea (el tipo es la unión de lo que devuelven todas). */
export function matchTask<
  K extends TrainTask,
  B extends ByTask<() => unknown, NoInfer<K>>,
>(task: K, branches: B): Returned<B> {
  return branchOf<() => Returned<B>>(branches, task)();
}

/** Ejecuta la rama de la tarea de un valor, con el valor ya estrechado. */
export function matchByTask<
  T extends Tasked,
  B extends TaskBranches<T, unknown>,
>(value: T, branches: B): Returned<B> {
  return branchOf<(value: T) => Returned<B>>(branches, taskOf<Tasked>(value))(
    value,
  );
}

/**
 * S7 (D3 del plan): una superficie de la UI que todavía no sabe mostrar una tarea
 * que el MOTOR ya entrena. La UI no puede llegar a ella (TRAINABLE_TASKS cierra el
 * entrenamiento y validateModelFile el import); si llega igual, falla NOMBRANDO la
 * superficie y la tarea, en vez de pintar la rama de otra tarea. La F3 las retira
 * una a una (tests/unit/despacho.test.ts dice dónde quedan).
 */
export function pendingSurface(surface: string, task: TrainTask): never {
  throw new Error(`superficie sin rama todavía: ${surface} (${task})`);
}
