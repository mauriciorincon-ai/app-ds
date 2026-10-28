// @vitest-environment node
//
// S19 (ADR 027): el modelo en reglas y vigilar el desempeño en el Pyodide REAL. Garantías que estos tests hacen FALLAR si se rompen:
//  - el EMISOR real (`run_rules`, `run_evaluate`) y los lectores se entienden en las tareas que corresponden; este test escribe los
//    fixtures del contrato (CONTRATO_ACTUALIZAR=1 los regenera) y tests/unit/contract-reglas.test.ts corre sus carnadas;
//  - el evaluador de TypeScript, las reglas de Python y —en CPython, tests/python/test_reglas.py— el SQL dan LA MISMA predicción en
//    cada fila de la tabla, en las cuatro tareas: este test deja en tests/integration/.salida-reglas/ lo que ese gate necesita;
//  - el ajuste es determinista; las filas de entrenamiento viven solo en memoria (el pickle conserva sus tres claves) y un modelo
//    importado o el ganador del Protocolo dicen `no-rows` en vez de inventar un árbol;
//  - el CSV de resultados con el objetivo corrido da «reentrenar» y el que viene del mismo mundo da «sigue»;
//  - las filas sin resultado y las clases nunca vistas se cuentan y se dejan fuera; agrupar dice `not-applicable`.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PyodideInterface } from "pyodide";
import { plan7 } from "@/engine/protocolo/etapa7";
import {
  evaluarReglas,
  fidelidadSuficiente,
  hojasDe,
} from "@/engine/reglas";
import { sanitizeTable } from "@/engine/sanitize";
import { vigilar } from "@/engine/vigilancia";
import { parseCsvWithLimits, type CsvTable } from "@/lib/ds/csv";
import { prepareClusterRun, prepareRun } from "@/lib/experiment";
import { sqlDeReglas, etiquetaDe } from "@/lib/narration/reglas";
import { clasesDelGanador, envioGanador } from "@/lib/protocolo/ganador";
import { pythonContractField } from "@/workers/contract";
import { validateRulesResult } from "@/workers/contrato-reglas";
import { validateEvaluateResult } from "@/workers/contrato-vigilancia";
import type { RulesResult } from "@/workers/protocol";
import { HUELLA, armarCredito7 } from "../unit/protocolo-etapa8-helpers";
import { loadRuntime, pyFunction } from "./runtime";

let py: PyodideInterface;
beforeAll(async () => {
  py = await loadRuntime();
}, 300_000);

const call = (fn: string, payload: unknown = {}): unknown =>
  JSON.parse(pyFunction(py, fn)(JSON.stringify(payload)));

function failure(fn: string, payload: unknown = {}): string {
  try {
    call(fn, payload);
  } catch (error) {
    return String((error as Error).message);
  }
  return "";
}

// --- el EMISOR escribe los fixtures del contrato Python → TS -------------------------------------

const FIXTURES = resolve(process.cwd(), "tests/fixtures/contrato");
const UPDATE = process.env.CONTRATO_ACTUALIZAR === "1";

function shape(value: unknown): unknown {
  if (Array.isArray(value))
    return value.length ? ["array", shape(value[0])] : ["array"];
  if (value === null) return "null";
  if (typeof value === "object")
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((k) => [k, shape((value as Record<string, unknown>)[k])]),
    );
  return typeof value;
}

function emit(name: string, value: unknown) {
  const file = resolve(FIXTURES, `${name}.json`);
  if (UPDATE) {
    mkdirSync(FIXTURES, { recursive: true });
    writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
    return;
  }
  expect(
    existsSync(file),
    `falta el fixture ${name}.json (CONTRATO_ACTUALIZAR=1)`,
  ).toBe(true);
  expect(
    shape(value),
    `la forma de ${name} cambió: regenera con CONTRATO_ACTUALIZAR=1 y revisa las carnadas`,
  ).toEqual(shape(JSON.parse(readFileSync(file, "utf8"))));
}

/** Lo que el gate de CPython lee: las filas del modelo, lo que predicen las reglas en Python y el SQL de TypeScript. */
const SALIDA = resolve(process.cwd(), "tests/integration/.salida-reglas");
beforeAll(() => {
  rmSync(SALIDA, { recursive: true, force: true });
  mkdirSync(SALIDA, { recursive: true });
});

// --- Probeta: entrenar por el camino real de la app ----------------------------------------------

const csv = (file: string) =>
  readFileSync(resolve(process.cwd(), "public/datasets", file), "utf8");
const csvKit = (file: string) =>
  readFileSync(resolve(process.cwd(), "docs/kit-de-prueba", file), "utf8");

const LIGA_CHICA = ["logistic", "forest", "hgb"] as const;
const LIGA_NUMERICA = ["linear", "forest", "hgb"] as const;

type Modelo = {
  readonly tabla: CsvTable;
  readonly headers: string[];
  readonly numericas: string[];
  readonly categoricas: string[];
  readonly clases: string[] | null;
  readonly tarea: RulesResult["task"];
  readonly metrica?: string;
  readonly referencia?: number;
  readonly nPrueba?: number;
};

function cargar(texto: string): CsvTable {
  const parsed = parseCsvWithLimits(texto);
  if (!parsed.ok) throw new Error("parse failed");
  return parsed.table;
}

function entrenar(file: string, target: string): Modelo {
  const tabla = cargar(csv(file));
  const prepared = prepareRun(tabla, target, 42);
  if (!prepared.ok) throw new Error(`prepare failed: ${file}`);
  const p = prepared.payload;
  const roster = p.task === "numerica" ? LIGA_NUMERICA : LIGA_CHICA;
  const result = call("run_experiment", { ...p, roster }) as {
    model: Record<string, number>;
  };
  const { schema } = call("export_model") as { schema: { classes?: string[] } };
  return {
    tabla,
    headers: tabla.headers,
    numericas: p.numeric,
    categoricas: p.categorical,
    clases: schema.classes ?? null,
    tarea: p.task,
    metrica: p.primary_metric,
    referencia: result.model[p.primary_metric],
  };
}

function entrenarGrupos(file: string): Modelo {
  const tabla = sanitizeTable(cargar(csv(file))).table;
  const run = prepareClusterRun(tabla, 42);
  if (!run.ok) throw new Error("prepare failed");
  call("run_experiment", run.payload);
  return {
    tabla,
    headers: tabla.headers,
    numericas: run.payload.numeric,
    categoricas: run.payload.categorical,
    clases: null,
    tarea: "agrupar",
  };
}

const sinTiempo = (r: RulesResult): RulesResult => ({ ...r, elapsed_ms: 0 });

/** Las filas del modelo con la lectura de Python y lo que las reglas de Python predicen en CADA fila de la tabla. */
function filasYPrediccion(m: Modelo, r: RulesResult) {
  py.globals.set("RJ_HEADERS", JSON.stringify(m.headers));
  py.globals.set("RJ_ROWS", JSON.stringify(m.tabla.rows));
  py.globals.set("RJ_NUMERIC", JSON.stringify(m.numericas));
  py.globals.set("RJ_CATEGORICAL", JSON.stringify(m.categoricas));
  py.globals.set("RJ_TREE", JSON.stringify(r.tree));
  py.globals.set("RJ_MEDIANS", JSON.stringify(r.numeric));
  const salida = py.runPython(`
import json
_f = json.loads(RJ_NUMERIC) + json.loads(RJ_CATEGORICAL)
_X = _build_frame(json.loads(RJ_HEADERS), json.loads(RJ_ROWS), json.loads(RJ_NUMERIC))[_f]
_med = {c["column"]: c["median"] for c in json.loads(RJ_MEDIANS)}
_pred = _rules_apply(json.loads(RJ_TREE), _X, _med)
_cell = lambda v: None if (v is None or (isinstance(v, float) and v != v)) else v
json.dumps({
  "columns": _f,
  "rows": [[_cell(v) for v in row] for row in _X.astype(object).itertuples(index=False, name=None)],
  "pred": [x.item() if hasattr(x, "item") else x for x in _pred],
})`) as string;
  return JSON.parse(salida) as {
    columns: string[];
    rows: (string | number | null)[][];
    pred: (string | number)[];
  };
}

function verificarYGuardar(nombre: string, m: Modelo, r: RulesResult) {
  const { columns, rows, pred } = filasYPrediccion(m, r);
  // el evaluador de TypeScript dice lo mismo que las reglas de Python, en cada fila
  const tipos = new Map([
    ...m.numericas.map((c) => [c, "numeric"] as const),
    ...m.categoricas.map((c) => [c, "categorical"] as const),
  ]);
  const desdeTs = rows.map((fila) =>
    evaluarReglas(
      r,
      Object.fromEntries(
        columns.map((c, i) => [c, fila[i] as number | string | null]),
      ),
    ),
  );
  expect(desdeTs).toEqual(pred);
  // y el gate de CPython recibe lo que necesita para correr el SQL
  const columnas = columns.map((name) => ({ name, kind: tipos.get(name) }));
  const sql = sqlDeReglas(r, "es", "tu_tabla", "prediccion");
  const esperado = pred.map((p) => etiquetaDe(r.task, p, "es"));
  writeFileSync(
    resolve(SALIDA, `${nombre}.json`),
    JSON.stringify({ tarea: r.task, columns: columnas, rows, esperado, sql }),
  );
  return { desdeTs, esperado, sql };
}

/** Nombres y categorías con comillas de las dos clases, y vacíos en las dos columnas: el SQL tiene que escaparlos y tratarlos igual. */
describe("el SQL con nombres hostiles", () => {
  it("escapa las comillas y trata el vacío como el evaluador: lo comprueba el gate de CPython", () => {
    const r: RulesResult = {
      task: "binaria",
      source: "training",
      tree: {
        leaf: false,
        column: 'ed"ad',
        kind: "numeric",
        threshold: 30.5,
        left: { leaf: true, pred: "bajo '1'", n: 10 },
        right: {
          leaf: false,
          column: "ciu'dad",
          kind: "categorical",
          category: "O'Brien",
          left: { leaf: true, pred: "otro", n: 5 },
          right: { leaf: true, pred: 'a"b', n: 5 },
        },
      },
      numeric: [{ column: 'ed"ad', median: 35 }],
      fidelity: { metric: "agreement", value: 1, n: 20 },
      truth: { metric: "accuracy", rules: 1, model: 1, n: 20 },
      depth: 2,
      leaves: 3,
      n_fit: 20,
      elapsed_ms: 0,
    };
    const columns = [
      { name: 'ed"ad', kind: "numeric" },
      { name: "ciu'dad", kind: "categorical" },
    ];
    const rows: (number | string | null)[][] = [
      [20, "O'Brien"],
      [null, "O'Brien"],
      [null, null],
      [31, null],
      [31, "O'Brien"],
      [30.5, "Lima"],
      [30.6, "Lima"],
      [40, ""],
    ];
    const esperado = rows.map((f) =>
      evaluarReglas(r, { 'ed"ad': f[0] as number | null, "ciu'dad": f[1] as string | null }),
    );
    // la mediana (35) manda a los vacíos numéricos a la derecha; un vacío categórico es «no es»
    expect(esperado).toEqual(["bajo '1'", "a\"b", "otro", "otro", "a\"b", "bajo '1'", "otro", "otro"]);
    writeFileSync(
      resolve(SALIDA, "hostil.json"),
      JSON.stringify({
        tarea: "binaria",
        columns,
        rows,
        esperado,
        sql: sqlDeReglas(r, "es", "tu_tabla", "prediccion"),
      }),
    );
  });
});

describe("el modelo en reglas (Pyodide)", () => {
  it("dos clases: el emisor y el lector se entienden; es determinista; TypeScript y Python dicen lo mismo en cada fila", () => {
    const m = entrenar("marketing-campania.csv", "convirtio");
    const sent = {
      task: m.tarea,
      numeric: m.numericas,
      categorical: m.categoricas,
      classes: m.clases,
    };
    const raw = call("run_rules");
    emit("rules-result-binaria", raw);
    const v = validateRulesResult(raw, sent);
    if (!v.ok) throw new Error(`el lector rechazó el resultado: ${v.field}`);
    const r = v.value;
    expect(r.fidelity.metric).toBe("agreement");
    expect(r.fidelity.value).toBeGreaterThan(0);
    expect(r.truth?.metric).toBe("accuracy");
    expect(r.depth).toBeLessThanOrEqual(4);
    expect(hojasDe(r.tree)).toHaveLength(r.leaves);
    // el árbol solo pregunta por columnas del modelo
    for (const c of new Set(hojasDe(r.tree).flatMap((h) => h.condiciones.map((x) => x.column))))
      expect([...m.numericas, ...m.categoricas]).toContain(c);
    // determinista: el mismo modelo, el mismo árbol
    const otra = validateRulesResult(call("run_rules"), sent);
    expect(otra.ok && sinTiempo(otra.value)).toEqual(sinTiempo(r));
    const { esperado } = verificarYGuardar("binaria", m, r);
    // las hojas dicen una de las dos clases del modelo
    expect(new Set(esperado)).toEqual(
      new Set(esperado.filter((e) => m.clases!.includes(e as string))),
    );
    // el nivel de fidelidad es una propiedad del resultado, no un adorno
    expect(typeof fidelidadSuficiente(r)).toBe("boolean");
  }, 300_000);

  it("las filas de entrenamiento no entran al pickle ni al export", () => {
    entrenar("marketing-campania.csv", "convirtio");
    call("run_rules");
    const exportado = call("export_model") as { payload_b64: string };
    py.globals.set("PAYLOAD_B64", exportado.payload_b64);
    const claves = py.runPython(
      `import base64, pickle, zlib\nsorted(pickle.loads(zlib.decompress(base64.b64decode(PAYLOAD_B64))).keys())`,
    ) as { toJs: () => string[] };
    expect(claves.toJs()).toEqual(["pipe", "schema", "training_profile"]);
  }, 300_000);

  it("varias categorías: las hojas son nombres de clase del modelo", () => {
    const m = entrenar("planes-suscripcion.csv", "plan");
    const sent = {
      task: m.tarea,
      numeric: m.numericas,
      categorical: m.categoricas,
      classes: m.clases,
    };
    const raw = call("run_rules");
    emit("rules-result-multiclase", raw);
    const v = validateRulesResult(raw, sent);
    if (!v.ok) throw new Error(`el lector rechazó el resultado: ${v.field}`);
    verificarYGuardar("multiclase", m, v.value);
    for (const h of hojasDe(v.value.tree)) expect(m.clases).toContain(h.pred);
  }, 300_000);

  it("estimar un número: el R² frente al modelo y el error frente a la verdad, con los números de las hojas", () => {
    const m = entrenar("consumo-energia.csv", "consumo_kwh");
    const sent = {
      task: m.tarea,
      numeric: m.numericas,
      categorical: m.categoricas,
      classes: null,
    };
    const raw = call("run_rules");
    emit("rules-result-numerica", raw);
    const v = validateRulesResult(raw, sent);
    if (!v.ok) throw new Error(`el lector rechazó el resultado: ${v.field}`);
    expect(v.value.fidelity.metric).toBe("r2");
    expect(v.value.truth?.metric).toBe("mae");
    verificarYGuardar("numerica", m, v.value);
    for (const h of hojasDe(v.value.tree)) expect(typeof h.pred).toBe("number");
  }, 300_000);

  it("agrupar: las reglas dicen el grupo, sin verdad contra la cual medirse", () => {
    const m = entrenarGrupos("segmentos-clientes.csv");
    const sent = {
      task: m.tarea,
      numeric: m.numericas,
      categorical: m.categoricas,
      classes: null,
    };
    const raw = call("run_rules");
    emit("rules-result-agrupar", raw);
    const v = validateRulesResult(raw, sent);
    if (!v.ok) throw new Error(`el lector rechazó el resultado: ${v.field}`);
    expect(v.value.truth).toBeNull();
    expect(v.value.fidelity.metric).toBe("agreement");
    verificarYGuardar("agrupar", m, v.value);
  }, 300_000);

  it("un modelo importado, el ganador del Protocolo o ninguno dicen lo que falta en vez de inventar un árbol", () => {
    call("reset_model");
    expect(failure("run_rules")).toContain("no-model");
    entrenar("marketing-campania.csv", "convirtio");
    const exportado = call("export_model") as {
      payload_b64: string;
      schema: unknown;
    };
    call("reset_model");
    call("import_model", {
      payload_b64: exportado.payload_b64,
      expected_schema: exportado.schema,
    });
    expect(failure("run_rules")).toContain("no-rows");
    // el ganador del Protocolo (reajustado solo con el entrenamiento) tampoco conserva filas
    const a = armarCredito7();
    call("run_fit_winner", envioGanador(a.tabla, a.previas, HUELLA)!.payload);
    expect(failure("run_rules")).toContain("no-rows");
    // un payload de más rompe el contrato nombrándolo
    entrenar("marketing-campania.csv", "convirtio");
    expect(pythonContractField(failure("run_rules", { extra: 1 }))).toBe(
      "extra",
    );
  }, 300_000);
});

// --- S20: las reglas con las filas que sube el usuario -----------------------------------------

describe("las reglas con filas que subes (Pyodide)", () => {
  const filasKit = () => cargar(csvKit("marketing-filas-para-reglas.csv"));
  const conObjetivo = () => cargar(csvKit("marketing-resultados-sin-cambio.csv"));
  const enviado = (m: Modelo, extra: { truthAsked?: boolean } = {}) => ({
    task: m.tarea,
    numeric: m.numericas,
    categorical: m.categoricas,
    classes: m.clases,
    source: "uploaded" as const,
    truthAsked: extra.truthAsked ?? false,
  });
  const pedir = (tabla: CsvTable, truth?: boolean) =>
    call("run_rules", { headers: tabla.headers, rows: tabla.rows, ...(truth === undefined ? {} : { truth }) });
  /** La tabla del usuario como «tabla del modelo» para el gate de TypeScript ↔ Python ↔ SQL. */
  const conTabla = (m: Modelo, tabla: CsvTable): Modelo => ({ ...m, tabla, headers: tabla.headers });

  it("un modelo entrenado: el árbol se arma con las filas del archivo, sin objetivo no hay verdad, y el SQL coincide con el árbol", () => {
    const m = entrenar("marketing-campania.csv", "convirtio");
    const tabla = filasKit();
    const raw = pedir(tabla);
    emit("rules-result-subidas", raw);
    const v = validateRulesResult(raw, enviado(m));
    if (!v.ok) throw new Error(`el lector rechazó el resultado: ${v.field}`);
    expect(v.value.source).toBe("uploaded");
    expect(v.value.truth).toBeNull();
    // 300 filas: 75 % arma el árbol y 25 % mide; el árbol no usa las filas de entrenamiento del modelo
    expect(v.value.n_fit).toBe(225);
    expect(v.value.fidelity.n).toBe(75);
    // determinista
    const otra = validateRulesResult(pedir(tabla), enviado(m));
    expect(otra.ok && sinTiempo(otra.value)).toEqual(sinTiempo(v.value));
    // el árbol de las filas del archivo no es el de las del entrenamiento (otro conjunto de filas)
    verificarYGuardar("subidas-binaria", conTabla(m, tabla), v.value);
  }, 300_000);

  it("si lo pides y el archivo trae el objetivo, mide contra la verdad; si no lo pides, no", () => {
    const m = entrenar("marketing-campania.csv", "convirtio");
    const tabla = conObjetivo();
    const midiendo = validateRulesResult(pedir(tabla, true), enviado(m, { truthAsked: true }));
    if (!midiendo.ok) throw new Error(`el lector rechazó el resultado: ${midiendo.field}`);
    expect(midiendo.value.truth?.metric).toBe("accuracy");
    expect(midiendo.value.truth!.n).toBeGreaterThan(0);
    // sin pedirlo, aunque el archivo traiga el objetivo, la verdad no se mide
    const sinPedir = validateRulesResult(pedir(tabla), enviado(m));
    if (!sinPedir.ok) throw new Error(`el lector rechazó el resultado: ${sinPedir.field}`);
    expect(sinPedir.value.truth).toBeNull();
    // pedirlo sin el objetivo en el archivo: nada que medir, no es un error
    const sinObjetivo = validateRulesResult(pedir(filasKit(), true), enviado(m, { truthAsked: true }));
    expect(sinObjetivo.ok && sinObjetivo.value.truth).toBeNull();
  }, 300_000);

  it("un modelo importado ya no dice «sin filas»: las reglas se arman con el archivo", () => {
    const m = entrenar("marketing-campania.csv", "convirtio");
    const exportado = call("export_model") as { payload_b64: string; schema: unknown };
    call("reset_model");
    call("import_model", { payload_b64: exportado.payload_b64, expected_schema: exportado.schema });
    expect(failure("run_rules")).toContain("no-rows");
    const tabla = filasKit();
    const v = validateRulesResult(pedir(tabla), enviado(m));
    if (!v.ok) throw new Error(`el lector rechazó el resultado: ${v.field}`);
    verificarYGuardar("subidas-importado", conTabla(m, tabla), v.value);
  }, 300_000);

  it("el ganador del Protocolo reajustado: las reglas con las filas subidas, la prueba sin abrir y la verdad vacía", () => {
    const a = armarCredito7();
    const envio = envioGanador(a.tabla, a.previas, HUELLA)!;
    call("run_fit_winner", envio.payload);
    const { numeric, categorical } = envio.payload;
    const usadas = [...numeric, ...categorical];
    const indices = usadas.map((c) => a.tabla.headers.indexOf(c));
    const rows = a.tabla.rows.map((fila) => indices.map((i) => fila[i]!));
    const raw = call("run_rules", { headers: usadas, rows });
    const v = validateRulesResult(raw, {
      task: envio.sent.task,
      numeric,
      categorical,
      classes: clasesDelGanador(a.tabla, a.previas, HUELLA),
      source: "uploaded",
      truthAsked: false,
    });
    if (!v.ok) throw new Error(`el lector rechazó el resultado: ${v.field}`);
    expect(v.value.source).toBe("uploaded");
    expect(v.value.truth).toBeNull();
    // la prueba sigue sin existir en el worker: lo que la lee dice «no-eval»
    expect(failure("run_stress")).toContain("no-eval");
    // S21 (lote 20-12): el worker mismo se niega a medir la verdad con el ganador reajustado (hoy lo impide TypeScript; ahora lo impide también Python)
    expect(failure("run_rules", { headers: usadas, rows, truth: true })).toContain("contract:truth");
  }, 300_000);

  it("pocas filas, una columna que el modelo lee y falta, y claves de más se dicen por su nombre", () => {
    entrenar("marketing-campania.csv", "convirtio");
    const tabla = filasKit();
    expect(failure("run_rules", { headers: tabla.headers, rows: tabla.rows.slice(0, 30) })).toContain("too-few-rows");
    // el borde es el que la pantalla dice (Etapa10Reglas.FILAS_MINIMAS): se aparta el 25 %, así que 40 de ajuste piden 53 en total (con 52 quedan 39)
    expect(failure("run_rules", { headers: tabla.headers, rows: tabla.rows.slice(0, 52) })).toContain("too-few-rows");
    const justas = call("run_rules", { headers: tabla.headers, rows: tabla.rows.slice(0, 53) }) as { source: string };
    expect(justas.source).toBe("uploaded");
    const sinColumna = { headers: tabla.headers.slice(1), rows: tabla.rows.map((f) => f.slice(1)) };
    expect(pythonContractField(failure("run_rules", sinColumna))).toBe("headers");
    expect(pythonContractField(failure("run_rules", { headers: tabla.headers, rows: tabla.rows, extra: 1 }))).toBe("extra");
    expect(pythonContractField(failure("run_rules", { headers: tabla.headers, rows: tabla.rows, truth: "si" }))).toBe("truth");
    expect(pythonContractField(failure("run_rules", { headers: tabla.headers, rows: [] }))).toBe("rows");
  }, 300_000);
});

// --- vigilar el desempeño -------------------------------------------------------------------------

describe("vigilar el desempeño (Pyodide)", () => {
  const sent = (m: Modelo, filas: number) => ({
    task: m.tarea as "binaria" | "multiclase" | "numerica",
    rows: filas,
    n_classes: m.clases?.length ?? null,
  });
  const evaluar = (m: Modelo, nuevo: CsvTable) => {
    const raw = call("run_evaluate", {
      headers: nuevo.headers,
      rows: nuevo.rows,
    });
    const v = validateEvaluateResult(raw, sent(m, nuevo.rows.length));
    if (!v.ok) throw new Error(`el lector rechazó el resultado: ${v.field}`);
    return { raw, datos: v.value };
  };
  const lectura = (m: Modelo, nuevo: CsvTable) => {
    const { datos } = evaluar(m, nuevo);
    return vigilar(
      datos,
      { metric: m.metrica as never, valor: m.referencia!},
      { clases: m.clases?.length, semilla: 42 },
    );
  };

  it("el CSV del mismo mundo da «sigue»; el del objetivo corrido, «reentrenar»", () => {
    const m = entrenar("marketing-campania.csv", "convirtio");
    const igual = lectura(
      m,
      cargar(csvKit("marketing-resultados-sin-cambio.csv")),
    );
    const corrido = lectura(
      m,
      cargar(csvKit("marketing-resultados-corridos.csv")),
    );
    expect(corrido.veredicto).toBe("reentrenar");
    expect(igual.veredicto).toBe("sigue");
    // el corrido está claramente peor que la prueba y el del mismo mundo no lo está
    expect(corrido.hoy.valor).toBeLessThan(igual.hoy.valor);
    // y es determinista: la misma cifra y el mismo margen dos veces
    expect(
      lectura(m, cargar(csvKit("marketing-resultados-corridos.csv"))).hoy,
    ).toEqual(corrido.hoy);
  }, 300_000);

  it("emite el fixture del contrato en las tres tareas con objetivo", () => {
    const m = entrenar("marketing-campania.csv", "convirtio");
    emit("evaluate-result-binaria", evaluar(m, m.tabla).raw);
    const n = entrenar("consumo-energia.csv", "consumo_kwh");
    emit("evaluate-result-numerica", evaluar(n, n.tabla).raw);
    const k = entrenar("planes-suscripcion.csv", "plan");
    emit("evaluate-result-multiclase", evaluar(k, k.tabla).raw);
  }, 300_000);

  it("las filas sin resultado y las clases nunca vistas se cuentan y se dejan fuera", () => {
    const m = entrenar("marketing-campania.csv", "convirtio");
    const j = m.headers.indexOf("convirtio");
    const filas = m.tabla.rows.map((r) => [...r]);
    filas[0]![j] = "";
    filas[1]![j] = "quizas";
    filas[2]![j] = "quizas";
    const { datos } = evaluar(m, { headers: m.headers, rows: filas });
    expect(datos.dropped).toEqual({ empty: 1, unknown: 2 });
    expect(datos.n_used).toBe(filas.length - 3);
    expect(datos.y).toHaveLength(datos.n_used);
  }, 300_000);

  it("sin la columna del objetivo, o con un envío mal formado, el contrato se rompe nombrando el campo; agrupar no aplica", () => {
    const m = entrenar("marketing-campania.csv", "convirtio");
    const campo = (p: unknown) =>
      pythonContractField(failure("run_evaluate", p));
    const sinObjetivo = m.headers.filter((h) => h !== "convirtio");
    expect(
      campo({
        headers: sinObjetivo,
        rows: m.tabla.rows.map((r) => r.slice(0, -1)),
      }),
    ).toBe("target");
    expect(campo({ headers: m.headers, rows: [] })).toBe("rows");
    expect(campo({ headers: m.headers, rows: m.tabla.rows, extra: 1 })).toBe(
      "extra",
    );
    expect(
      campo({
        headers: m.headers.slice(1),
        rows: m.tabla.rows.map((r) => r.slice(1)),
      }),
    ).toBe("headers");
    entrenarGrupos("segmentos-clientes.csv");
    expect(
      failure("run_evaluate", { headers: ["a"], rows: [["1"]] }),
    ).toContain("not-applicable");
    call("reset_model");
    expect(failure("run_evaluate", {})).toContain("no-model");
  }, 300_000);

  it("sirve también con un modelo importado y con el ganador del Protocolo", () => {
    const m = entrenar("marketing-campania.csv", "convirtio");
    const exportado = call("export_model") as {
      payload_b64: string;
      schema: unknown;
    };
    call("reset_model");
    call("import_model", {
      payload_b64: exportado.payload_b64,
      expected_schema: exportado.schema,
    });
    expect(evaluar(m, m.tabla).datos.n_used).toBe(m.tabla.rows.length);
    // el Protocolo: reajustado solo con el entrenamiento, evalúa la tabla del crédito con su objetivo
    const a = armarCredito7();
    const envio = envioGanador(a.tabla, a.previas, HUELLA)!;
    call("run_fit_winner", envio.payload);
    const p7 = plan7(a.tabla, a.previas, HUELLA)!;
    const salida = call("run_evaluate", {
      headers: a.tabla.headers,
      rows: a.tabla.rows,
    }) as { n_used: number };
    expect(salida.n_used).toBe(a.tabla.rows.length);
    expect(p7.forma).toBe("binaria");
  }, 300_000);
});
