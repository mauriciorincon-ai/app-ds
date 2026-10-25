// S19 (ADR 027): el modelo en reglas. Puro. Recibe el árbol sustituto que el worker ajustó (`RulesResult`: ya en la forma que se
// descarga, con cortes a 6 cifras significativas y valores de hoja a 8) y lo convierte en lo que el usuario se lleva:
//  · las hojas, una por regla, cada una con las condiciones que llevan hasta ella;
//  · un evaluador en TypeScript (la misma función que el texto y el SQL: un vacío numérico toma la mediana de entrenamiento y un
//    vacío en una categoría cuenta como «no es»);
//  · el SQL: un `CASE WHEN … THEN … END` con los identificadores entre comillas dobles (`"` duplicada), los literales entre comillas
//    simples (`'` duplicada) y `COALESCE` igual a la imputación. El gate lo corre `sqlite3` de CPython sobre las filas que predijo
//    Pyodide y exige la misma predicción en cada una.
//
// «Es el modelo en reglas» solo si la fidelidad —medida en filas que el árbol no vio, con ESTAS reglas— llega al umbral de abajo;
// debajo se da la cifra y se llama «un árbol que se parece al modelo». Los umbrales son convenciones fijadas por diseño en el ADR
// 027 (como la brecha de 0,10 y la estabilidad de 0,7 de agrupar, ADR 016).
import { matchTask } from "@/engine/despacho";
import type { TrainTask } from "@/engine/tarea";
import type { RuleNode, RulesResult } from "@/workers/protocol";

/** Acuerdo mínimo con el modelo (dos clases, varias clases y agrupar) para llamarlo «el modelo en reglas». */
export const FIDELIDAD_MIN_ACUERDO = 0.9;
/** R² mínimo frente a lo que el modelo estima (estimar una cantidad). */
export const FIDELIDAD_MIN_R2 = 0.8;

export type CondicionRegla =
  | {
      readonly kind: "numeric";
      readonly column: string;
      /** «≤ valor» o «> valor». */
      readonly op: "<=" | ">";
      readonly valor: number;
    }
  | {
      readonly kind: "categorical";
      readonly column: string;
      readonly op: "es" | "no-es";
      readonly categoria: string;
    };

export type Hoja = {
  readonly condiciones: readonly CondicionRegla[];
  readonly pred: string | number;
  readonly n: number;
};

/** Las hojas del árbol de izquierda a derecha, cada una con su camino de condiciones. */
export function hojasDe(raiz: RuleNode): Hoja[] {
  const salida: Hoja[] = [];
  const camino: CondicionRegla[] = [];
  const recorrer = (nodo: RuleNode) => {
    if (nodo.leaf) {
      salida.push({ condiciones: [...camino], pred: nodo.pred, n: nodo.n });
      return;
    }
    const [izq, der]: [CondicionRegla, CondicionRegla] =
      nodo.kind === "numeric"
        ? [
            {
              kind: "numeric",
              column: nodo.column,
              op: "<=",
              valor: nodo.threshold,
            },
            {
              kind: "numeric",
              column: nodo.column,
              op: ">",
              valor: nodo.threshold,
            },
          ]
        : [
            {
              kind: "categorical",
              column: nodo.column,
              op: "no-es",
              categoria: nodo.category,
            },
            {
              kind: "categorical",
              column: nodo.column,
              op: "es",
              categoria: nodo.category,
            },
          ];
    camino.push(izq);
    recorrer(nodo.left);
    camino.pop();
    camino.push(der);
    recorrer(nodo.right);
    camino.pop();
  };
  recorrer(raiz);
  return salida;
}

/** Las columnas que las reglas usan, en el orden en que aparecen. */
export function columnasDe(raiz: RuleNode): string[] {
  const vistas = new Set<string>();
  for (const hoja of hojasDe(raiz))
    for (const c of hoja.condiciones) vistas.add(c.column);
  return [...vistas];
}

/** ¿Llegan las reglas al umbral de fidelidad para llamarse «el modelo en reglas»? */
export function fidelidadSuficiente(r: RulesResult): boolean {
  return r.fidelity.metric === "r2"
    ? r.fidelity.value >= FIDELIDAD_MIN_R2
    : r.fidelity.value >= FIDELIDAD_MIN_ACUERDO;
}

/**
 * Lo que las reglas dicen de una fila: la misma función que el texto y el SQL. `fila` da el valor de cada columna del modelo:
 * un número (o `null` si está vacío) en las numéricas, un texto (o `null`) en las categóricas. Un vacío numérico toma la mediana
 * de entrenamiento; un vacío en una categoría cuenta como «no es».
 */
export function evaluarReglas(
  r: RulesResult,
  fila: Readonly<Record<string, number | string | null>>,
): string | number {
  const medianas = new Map(r.numeric.map((c) => [c.column, c.median]));
  let nodo = r.tree;
  while (!nodo.leaf) {
    if (nodo.kind === "numeric") {
      const v = fila[nodo.column];
      const x =
        typeof v === "number" && Number.isFinite(v)
          ? v
          : (medianas.get(nodo.column) ?? 0);
      nodo = x <= nodo.threshold ? nodo.left : nodo.right;
    } else {
      nodo = fila[nodo.column] === nodo.category ? nodo.right : nodo.left;
    }
  }
  return nodo.pred;
}

// --- el SQL -------------------------------------------------------------------------------------------

/** Un identificador de SQL: entre comillas dobles, con las comillas dobles duplicadas. */
export const identificadorSql = (nombre: string): string =>
  `"${nombre.replaceAll('"', '""')}"`;

/** Un texto de SQL: entre comillas simples, con las comillas simples duplicadas. */
export const literalSql = (texto: string): string =>
  `'${texto.replaceAll("'", "''")}'`;

/** Un número como literal de SQL: la forma más corta que lee igual (`0.1`, `1e-7`). */
export const numeroSql = (valor: number): string => String(valor);

function condicionSql(
  c: CondicionRegla,
  medianas: ReadonlyMap<string, number>,
): string {
  const col = identificadorSql(c.column);
  if (c.kind === "numeric")
    return `COALESCE(${col}, ${numeroSql(medianas.get(c.column) ?? 0)}) ${c.op} ${numeroSql(c.valor)}`;
  return c.op === "es"
    ? `${col} = ${literalSql(c.categoria)}`
    : `(${col} IS NULL OR ${col} <> ${literalSql(c.categoria)})`;
}

export type OpcionesSql = {
  /** El nombre de la tabla del usuario. */
  readonly tabla: string;
  /** El nombre de la columna que recibe la predicción. */
  readonly alias: string;
  /** Cómo se escribe una predicción (la etiqueta de la clase o del grupo; un número se escribe tal cual). */
  readonly etiqueta: (pred: string | number) => string | number;
};

/**
 * `SELECT t.*, CASE WHEN … THEN … END AS "<alias>" FROM "<tabla>" t;`. Las hojas se parten el espacio sin huecos ni cruces, así que
 * a cada fila le corresponde exactamente una; no lleva `ELSE`: una fila sin hoja (imposible) saldría vacía, no inventada.
 */
export function sqlDe(r: RulesResult, opciones: OpcionesSql): string {
  const medianas = new Map(r.numeric.map((c) => [c.column, c.median]));
  const cuando = hojasDe(r.tree).map((hoja) => {
    const condiciones =
      hoja.condiciones.length === 0
        ? "1 = 1"
        : hoja.condiciones.map((c) => condicionSql(c, medianas)).join(" AND ");
    const valor = opciones.etiqueta(hoja.pred);
    return `    WHEN ${condiciones} THEN ${typeof valor === "number" ? numeroSql(valor) : literalSql(valor)}`;
  });
  return [
    "SELECT t.*,",
    "  CASE",
    ...cuando,
    `  END AS ${identificadorSql(opciones.alias)}`,
    `FROM ${identificadorSql(opciones.tabla)} t;`,
  ].join("\n");
}

/** Cómo se llama la predicción de una hoja según la tarea: la clase, el grupo (1, 2… o «fuera de todo grupo») o la cantidad. */
export function tipoDePrediccion(
  tarea: TrainTask,
): "clase" | "grupo" | "cantidad" {
  return matchTask(tarea, {
    binaria: () => "clase" as const,
    multiclase: () => "clase" as const,
    numerica: () => "cantidad" as const,
    agrupar: () => "grupo" as const,
  });
}
