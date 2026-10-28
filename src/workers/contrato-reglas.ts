// S19 (ADR 027): el lector de lo que `rules` entrega para «el modelo en reglas». Vive aparte de contract.ts (que ya llega al bundle
// inicial de `/`): solo lo importa el panel diferido de las reglas. Además de la forma cruza lo que solo el lector puede comprobar:
// es de la tarea enviada; el árbol usa solo columnas del modelo y cada una con su tipo (una numérica pregunta por un corte, una
// categórica por «es / no es»); las hojas dicen una clase del modelo (dos y varias clases), un número (estimar) o un grupo entero
// (agrupar); la profundidad y el número de hojas son los del árbol y no pasan del tope; las filas de las hojas suman las del ajuste; las
// medianas son las de las numéricas del esquema; la fidelidad es acuerdo (o R² al estimar) y la verdad, de la tarea. Rechaza nombrando
// el campo, jamás con un valor (regla dura 2).
import { matchTask } from "@/engine/despacho";
import type { TrainTask } from "@/engine/tarea";
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
} from "@/lib/validate";
import type { RuleNode, RulesResult } from "@/workers/protocol";

/** La profundidad máxima del árbol que pide `pipeline.py` (RULES_DEPTH). */
export const REGLAS_PROFUNDIDAD_MAX = 4;

export type ReglasSent = {
  readonly task: TrainTask;
  readonly numeric: readonly string[];
  readonly categorical: readonly string[];
  /** Las clases del modelo (dos y varias clases); `null` en las otras tareas. */
  readonly classes: readonly string[] | null;
  /** S20: de dónde deben venir las filas del árbol (por omisión, las de entrenamiento del modelo). */
  readonly source?: "training" | "uploaded";
  /** S20: con filas del usuario, ¿se pidió medir contra el objetivo del archivo? Si no, la verdad tiene que venir vacía. */
  readonly truthAsked?: boolean;
};

const probabilidad = refine(num, (v) => (v as number) <= 1);

export function validateRulesResult(
  raw: unknown,
  sent: ReglasSent,
): Checked<RulesResult> {
  const shaped = check<RulesResult>(
    obj({
      task: oneOf([sent.task]),
      source: oneOf([sent.source ?? "training"]),
      tree: (v, path) => (isRecord(v) ? null : path),
      numeric: arr(obj({ column: str, median: num })),
      fidelity: obj({
        metric: oneOf(["agreement", "r2"]),
        value: probabilidad,
        n: refine(int, (v) => (v as number) >= 1),
      }),
      truth: nullable(
        obj({
          metric: oneOf(["accuracy", "mae"]),
          rules: num,
          model: num,
          n: refine(int, (v) => (v as number) >= 1),
        }),
      ),
      depth: refine(int, (v) => (v as number) >= 0 && (v as number) <= REGLAS_PROFUNDIDAD_MAX),
      leaves: refine(int, (v) => (v as number) >= 1),
      n_fit: refine(int, (v) => (v as number) >= 1),
      elapsed_ms: num,
    }),
    raw,
  );
  if (!shaped.ok) return shaped;
  const r = shaped.value;

  // las medianas: exactamente las numéricas del esquema, en su orden
  if (r.numeric.map((c) => c.column).join("\u0000") !== sent.numeric.join("\u0000"))
    return { ok: false, field: "numeric" };

  const tarea = matchTask(sent.task, {
    binaria: () => "clase" as const,
    multiclase: () => "clase" as const,
    numerica: () => "cantidad" as const,
    agrupar: () => "grupo" as const,
  });
  const clases = new Set(sent.classes ?? []);
  const numericas = new Set(sent.numeric);
  const categoricas = new Set(sent.categorical);
  let hojas = 0;
  let filas = 0;
  let profundidad = 0;
  let falla: string | null = null;
  const caer = (campo: string) => {
    falla ??= campo;
  };

  const recorrer = (nodo: unknown, nivel: number, ruta: string): void => {
    if (falla || !isRecord(nodo) || typeof nodo.leaf !== "boolean") return caer(ruta);
    if (nodo.leaf) {
      const n = nodo.n;
      if (typeof n !== "number" || !Number.isInteger(n) || n < 0) return caer(`${ruta}.n`);
      const pred = nodo.pred;
      const bien =
        tarea === "clase"
          ? typeof pred === "string" && clases.has(pred)
          : tarea === "cantidad"
            ? typeof pred === "number" && Number.isFinite(pred)
            : typeof pred === "number" && Number.isInteger(pred) && pred >= -1;
      if (!bien) return caer(`${ruta}.pred`);
      hojas += 1;
      filas += n;
      profundidad = Math.max(profundidad, nivel);
      return;
    }
    if (nivel >= REGLAS_PROFUNDIDAD_MAX) return caer(`${ruta}.leaf`);
    const columna = nodo.column;
    if (typeof columna !== "string") return caer(`${ruta}.column`);
    if (nodo.kind === "numeric") {
      if (!numericas.has(columna)) return caer(`${ruta}.column`);
      if (typeof nodo.threshold !== "number" || !Number.isFinite(nodo.threshold))
        return caer(`${ruta}.threshold`);
    } else if (nodo.kind === "categorical") {
      if (!categoricas.has(columna)) return caer(`${ruta}.column`);
      if (typeof nodo.category !== "string") return caer(`${ruta}.category`);
    } else return caer(`${ruta}.kind`);
    recorrer(nodo.left, nivel + 1, `${ruta}.left`);
    recorrer(nodo.right, nivel + 1, `${ruta}.right`);
  };
  recorrer(r.tree as RuleNode, 0, "tree");
  if (falla) return { ok: false, field: falla };
  if (r.leaves !== hojas) return { ok: false, field: "leaves" };
  if (r.depth !== profundidad) return { ok: false, field: "depth" };
  if (filas !== r.n_fit) return { ok: false, field: "n_fit" };

  const metricaEsperada = tarea === "cantidad" ? "r2" : "agreement";
  if (r.fidelity.metric !== metricaEsperada) return { ok: false, field: "fidelity" };
  // La verdad: con las filas de entrenamiento siempre se mide (agrupar, no); con filas del usuario solo si se pidió y el archivo
  // la trajo — y con filas que no se pidieron medir (la etapa 10 del Protocolo: la prueba ya se abrió una vez) tiene que venir vacía.
  const subidas = (sent.source ?? "training") === "uploaded";
  if (tarea === "grupo") {
    if (r.truth !== null) return { ok: false, field: "truth" };
  } else if (subidas && sent.truthAsked !== true) {
    if (r.truth !== null) return { ok: false, field: "truth" };
  } else if (r.truth !== null || !subidas) {
    const verdad = tarea === "cantidad" ? "mae" : "accuracy";
    if (r.truth === null || r.truth.metric !== verdad) return { ok: false, field: "truth" };
    // la verdad se mide sobre las filas de la fidelidad que traen el objetivo: nunca pueden ser más (S21, lote 20-11)
    if (r.truth.n > r.fidelity.n) return { ok: false, field: "truth" };
    if (tarea === "clase" && (r.truth.rules > 1 || r.truth.model > 1))
      return { ok: false, field: "truth" };
  }
  return shaped;
}
