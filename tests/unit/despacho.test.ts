import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  byTask,
  declaredTask,
  matchByTask,
  matchTask,
  pendingSurface,
  taskOf,
} from "@/engine/despacho";
import {
  TRAIN_TASKS,
  TRAINABLE_TASKS,
  type TrainTask,
} from "@/engine/tarea";

/**
 * S7 (P2 del plan, R1): el despacho por tarea es EXHAUSTIVO. Tres gates, cada uno
 * nacido en rojo con scripts/demo-rojo.sh (bitácora del S7, F1):
 *   1. tipos — un despacho al que le falta una rama no compila (`@ts-expect-error`
 *      abajo: si el tipo se afloja a ramas opcionales, `pnpm typecheck` cae
 *      nombrando este archivo);
 *   2. fuente — ninguna comparación de tareas fuera de engine/despacho.ts (TS) ni de
 *      `_by_task`/`_task_of` (Python), y cada `_by_task` de pipeline.py escribe
 *      TODAS las tareas registradas; el fallo nombra archivo:línea;
 *   3. conducta — cada rama recibe su variante y una tarea desconocida falla
 *      nombrándola (más los cerrojos por tarea de las pruebas de cada superficie).
 */

// --- 1. Tipos ----------------------------------------------------------------

type Resultado =
  | { task?: "binaria"; auc: number }
  | { task: "numerica"; mae: number };

describe("despacho exhaustivo — tipos (gate 1)", () => {
  it("un despacho incompleto no compila", () => {
    // Solo tipos: la función no se ejecuta; el gate es `pnpm typecheck`, que cae
    // («Unused '@ts-expect-error' directive») si las ramas se vuelven opcionales.
    const soloTipos = (task: TrainTask, r: Resultado) => [
      // @ts-expect-error — falta la rama «numerica»
      matchTask(task, { binaria: () => 1 }),
      // @ts-expect-error — lo mismo con valores
      byTask(task, { binaria: 1 }),
      // @ts-expect-error — un resultado de estimar sin su rama
      matchByTask(r, { binaria: (b) => b.auc }),
    ];
    expect(soloTipos).toBeTypeOf("function");
  });
});

// --- 3. Conducta -------------------------------------------------------------

describe("despacho exhaustivo — conducta (gate 3)", () => {
  it("sin tarea es binaria (el único «?? binaria» de la app)", () => {
    expect(taskOf({})).toBe("binaria");
    expect(taskOf({ task: "numerica" })).toBe("numerica");
    expect(declaredTask({})).toBe("binaria");
    expect(declaredTask({ task: "multiclase" })).toBe("multiclase");
  });

  it("cada rama recibe SU variante", () => {
    type R =
      | { task?: "binaria"; positiveClass: string }
      | { task: "numerica"; unit: string };
    const binary: R = { positiveClass: "sí" };
    const regression: R = { task: "numerica", unit: "kWh" };
    const read = (r: R) =>
      matchByTask(r, {
        binaria: (b) => `clase ${b.positiveClass}`,
        numerica: (n) => `unidad ${n.unit}`,
      });
    expect(read(binary)).toBe("clase sí");
    expect(read(regression)).toBe("unidad kWh");
    expect(
      byTask("numerica", { binaria: "a", multiclase: "c", numerica: "b" }),
    ).toBe("b");
    expect(
      matchTask("multiclase", {
        binaria: () => "a",
        multiclase: () => "c",
        numerica: () => "b",
      }),
    ).toBe("c");
  });

  it("una tarea sin rama falla NOMBRÁNDOLA (un dato que llegó igual)", () => {
    const unknown = "serie-tiempo" as TrainTask;
    const branches = {
      binaria: () => 1,
      multiclase: () => 3,
      numerica: () => 2,
      agrupar: () => 4,
    };
    expect(() => matchTask(unknown, branches)).toThrow(
      "tarea sin rama propia: serie-tiempo",
    );
    expect(() => matchByTask({ task: unknown }, branches)).toThrow(
      "serie-tiempo",
    );
  });

  it("TRAIN_TASKS sale de un Record completo (no de una lista a mano)", () => {
    expect([...TRAIN_TASKS].sort()).toEqual([
      "agrupar",
      "binaria",
      "multiclase",
      "numerica",
    ]);
  });

  it("S7 (D3): una superficie pendiente falla nombrando superficie y tarea", () => {
    expect(() => pendingSurface("ResultsScreen", "multiclase")).toThrow(
      "superficie sin rama todavía: ResultsScreen (multiclase)",
    );
  });

  it("S7 (F3): la UI ofrece entrenar las tres tareas con objetivo", () => {
    // Cambio esperado (D3 cumplida): la multiclase llega a la UI con sus
    // pantallas. Agrupar no es una tarea de columna: se elige aparte.
    expect(TRAINABLE_TASKS).toEqual(["binaria", "multiclase", "numerica"]);
  });
});

// --- 2. Fuente ---------------------------------------------------------------

/** Todos los archivos de código de src/ (TS, TSX y Python). */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|py)$/.test(name) ? [path] : [];
  });
}

const TASKS = "(binaria|numerica|multiclase|agrupar)";
/** Formas de decidir por tarea a mano: comparar, caer por defecto, `case`. */
const TS_FORBIDDEN: { rule: string; re: RegExp }[] = [
  { rule: "comparación", re: new RegExp(`[!=]==\\s*"${TASKS}"`) },
  { rule: "comparación", re: new RegExp(`"${TASKS}"\\s*[!=]==`) },
  { rule: "«?? binaria»", re: /\?\?\s*"binaria"/ },
  { rule: "valor por defecto", re: /\btask\s*=\s*"binaria"/ },
  { rule: "case", re: new RegExp(`case\\s+"${TASKS}"\\s*:`) },
];
const PY_FORBIDDEN: { rule: string; re: RegExp }[] = [
  { rule: "comparación", re: new RegExp(`(==|!=)\\s*"${TASKS}"`) },
  { rule: "comparación", re: new RegExp(`"${TASKS}"\\s*(==|!=)`) },
  { rule: "_is_regression", re: /_is_regression/ },
  {
    rule: "«sin tarea = binaria»",
    re: /\.get\(\s*"task"\s*,\s*"binaria"\s*\)/,
  },
];
/** Los únicos sitios donde esas formas viven a propósito, con su razón. */
const ALLOWED: { file: string; text: string; reason: string }[] = [
  {
    file: "src/engine/despacho.ts",
    text: '?? "binaria"',
    reason: "taskOf/declaredTask: el único «sin tarea = binaria» de TS",
  },
  {
    file: "src/lib/ds/pipeline.py",
    text: 'return record.get("task", "binaria")',
    reason: "_task_of: el único «sin tarea = binaria» de Python",
  },
];

function violations(
  files: readonly string[],
  rules: readonly { rule: string; re: RegExp }[],
): string[] {
  return files.flatMap((file) =>
    readFileSync(file, "utf8")
      .split("\n")
      .flatMap((line, i) => {
        const hit = rules.find(({ re }) => re.test(line));
        if (!hit) return [];
        const allowed = ALLOWED.some(
          (a) => a.file === file && line.includes(a.text),
        );
        return allowed
          ? []
          : [`${file}:${i + 1} (${hit.rule}): ${line.trim()}`];
      }),
  );
}

/** Las claves de primer nivel del diccionario de cada `_by_task(tarea, {...})`. */
function byTaskCalls(
  source: string,
): { line: number; keys: string[] }[] {
  const calls: { line: number; keys: string[] }[] = [];
  const re = /_by_task\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const open = source.indexOf("{", match.index);
    // La definición (`def _by_task(task, branches):`) no lleva diccionario.
    if (source.slice(match.index - 4, match.index) === "def ") continue;
    let depth = 0;
    let end = open;
    for (; end < source.length; end++) {
      if (source[end] === "{") depth += 1;
      if (source[end] === "}") depth -= 1;
      if (depth === 0) break;
    }
    const body = source.slice(open, end + 1);
    const keys: string[] = [];
    let level = 0;
    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (ch === "{" || ch === "(" || ch === "[") level += 1;
      else if (ch === "}" || ch === ")" || ch === "]") level -= 1;
      else if (ch === '"' && level === 1) {
        const close = body.indexOf('"', i + 1);
        const key = body.slice(i + 1, close);
        if (/^\s*:/.test(body.slice(close + 1))) keys.push(key);
        i = close;
      }
    }
    calls.push({
      line: source.slice(0, match.index).split("\n").length,
      keys,
    });
  }
  return calls;
}

describe("despacho exhaustivo — fuente (gate 2)", () => {
  const files = sourceFiles("src");
  const ts = files.filter((f) => /\.tsx?$/.test(f));
  const py = files.filter((f) => f.endsWith(".py"));

  it("ningún archivo de TS decide por tarea fuera de engine/despacho.ts", () => {
    const found = violations(ts, TS_FORBIDDEN);
    expect(found, `decisiones por tarea a mano:\n${found.join("\n")}`).toEqual(
      [],
    );
  });

  it("Python tampoco: todo pasa por _by_task / _task_of", () => {
    const found = violations(py, PY_FORBIDDEN);
    expect(found, `decisiones por tarea a mano:\n${found.join("\n")}`).toEqual(
      [],
    );
  });

  it("cada _by_task de pipeline.py escribe la rama de TODAS las tareas registradas", () => {
    const source = readFileSync("src/lib/ds/pipeline.py", "utf8");
    const registered = /_FACTORIES_BY_TASK = \{([^}]*)\}/.exec(source)![1]!;
    const tasks = [...registered.matchAll(/"(\w+)"\s*:/g)].map((m) => m[1]!);
    const calls = byTaskCalls(source);
    // Sin ningún _by_task el gate no probaría nada (¿puede fallar siquiera?).
    expect(calls.length).toBeGreaterThanOrEqual(10);
    const incomplete = calls
      .filter((c) => [...c.keys].sort().join() !== [...tasks].sort().join())
      .map(
        (c) =>
          `src/lib/ds/pipeline.py:${c.line} escribe [${c.keys.join(", ")}], registradas [${tasks.join(", ")}]`,
      );
    expect(incomplete, incomplete.join("\n")).toEqual([]);
  });

  it("S7 (D3): una superficie pendiente vive solo en la UI o la model card", () => {
    // El MOTOR entrena la multiclase de punta a punta desde la F1: ninguna rama
    // del motor, del contrato ni del hook puede quedar «pendiente». La F3 retira
    // las de la UI una a una.
    const PENDING_ALLOWED = ["src/components/", "src/lib/modelcard.ts"];
    const calls = ts
      .filter((f) => f !== "src/engine/despacho.ts")
      .flatMap((file) =>
        readFileSync(file, "utf8")
          .split("\n")
          .flatMap((line, i) =>
            line.includes("pendingSurface(") ? [`${file}:${i + 1}`] : [],
          ),
      );
    const outside = calls.filter(
      (c) => !PENDING_ALLOWED.some((prefix) => c.startsWith(prefix)),
    );
    expect(outside, `superficies pendientes fuera de la UI:\n${outside.join("\n")}`).toEqual([]);
  });

  it("las excepciones permitidas siguen existiendo (no son decorado)", () => {
    for (const a of ALLOWED) {
      expect(readFileSync(a.file, "utf8"), a.reason).toContain(a.text);
    }
  });
});
