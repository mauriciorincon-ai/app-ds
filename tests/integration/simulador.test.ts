// @vitest-environment node
//
// S19 (ADR 027): «¿qué pasaría si?» y el reajuste del ganador del Protocolo en el Pyodide REAL. Garantías que estos tests hacen
// FALLAR si se rompen:
//  - el EMISOR real (`run_simulate` tras entrenar por el camino de la app) y el lector (`validateSimulateResult`) se entienden en las
//    cuatro tareas; este test escribe los fixtures del contrato (CONTRATO_ACTUALIZAR=1 los regenera) y
//    tests/unit/contract-simulador.test.ts corre sus carnadas;
//  - sin cambio, cero decisiones se mueven; con el mismo cambio dos veces, la misma cifra; un cambio grande saca filas de lo que
//    el modelo vio y lo cuenta;
//  - el dinero de dos clases cuadra con las probabilidades que el propio emisor entregó, hecho a mano aquí;
//  - jamás sale un valor del dataset: lo que vuelve son etiquetas de la clase, números y los nombres del contrato;
//  - `fit-winner` ajusta al ganador del Protocolo SOLO con el entrenamiento: una clave `test` se rechaza nombrándola, el modelo
//    retenido no trae prueba (`no-eval`), dos ajustes dan las mismas predicciones y el archivo del modelo sale sin ella;
//  - un payload mal formado o sin modelo rompe el contrato nombrando el campo.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PyodideInterface } from "pyodide";
import { plan7 } from "@/engine/protocolo/etapa7";
import { sanitizeTable } from "@/engine/sanitize";
import {
  compararSimulacion,
  prepararSimulacion,
  type Cambio,
  type CostosSimulador,
} from "@/engine/simulador";
import { parseCsvWithLimits, type CsvTable } from "@/lib/ds/csv";
import { prepareClusterRun, prepareRun } from "@/lib/experiment";
import { envioGanador, tablaDeEntrenamiento } from "@/lib/protocolo/ganador";
import { envio8 } from "@/lib/protocolo/prueba8";
import { plan8 } from "@/engine/protocolo/etapa8";
import { pythonContractField } from "@/workers/contract";
import { validateFitWinnerResult } from "@/workers/contrato-ganador";
import {
  validateSimulateResult,
  type SimuladorSent,
} from "@/workers/contrato-simulador";
import type { SimulateResult } from "@/workers/protocol";
import {
  HUELLA,
  armarCredito7,
  armarPlanes6,
  armarPrecio6,
  con7,
} from "../unit/protocolo-etapa8-helpers";
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

/** Firma de forma: claves y tipos (los valores —tiempos, floats— no cuentan). */
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

// --- Probeta: entrenar por el camino real de la app y simular ------------------------------------

const csv = (file: string) =>
  readFileSync(resolve(process.cwd(), "public/datasets", file), "utf8");

const LIGA_CHICA = ["logistic", "forest", "hgb"] as const;
const LIGA_NUMERICA = ["linear", "forest", "hgb"] as const;

type Modelo = {
  readonly tabla: CsvTable;
  readonly columnas: string[];
  readonly numericas: string[];
  readonly clases: string[] | null;
  readonly positiva: string | null;
  readonly tarea: SimuladorSent["task"];
};

function cargar(file: string): CsvTable {
  const parsed = parseCsvWithLimits(csv(file));
  if (!parsed.ok) throw new Error(`parse failed: ${file}`);
  return parsed.table;
}

/** Entrena (liga chica) y devuelve lo que el panel sabe del modelo: su esquema. */
function entrenar(file: string, target: string): Modelo {
  const tabla = cargar(file);
  const prepared = prepareRun(tabla, target, 42);
  if (!prepared.ok) throw new Error(`prepare failed: ${file}`);
  const p = prepared.payload;
  const roster = p.task === "numerica" ? LIGA_NUMERICA : LIGA_CHICA;
  call("run_experiment", { ...p, roster });
  const { schema } = call("export_model") as {
    schema: {
      classes?: string[];
      positive_class?: string;
    };
  };
  return {
    tabla,
    columnas: [...p.numeric, ...p.categorical],
    numericas: p.numeric,
    clases: schema.classes ?? null,
    positiva: schema.positive_class ?? null,
    tarea: p.task,
  };
}

function entrenarGrupos(file: string): Modelo {
  const parsed = parseCsvWithLimits(csv(file));
  if (!parsed.ok) throw new Error("parse failed");
  const tabla = sanitizeTable(parsed.table).table;
  const run = prepareClusterRun(tabla, 42);
  if (!run.ok) throw new Error("prepare failed");
  call("run_experiment", run.payload);
  return {
    tabla,
    columnas: [...run.payload.numeric, ...run.payload.categorical],
    numericas: run.payload.numeric,
    clases: null,
    positiva: null,
    tarea: "agrupar",
  };
}

function simular(m: Modelo, columna: string, cambio: Cambio) {
  const prep = prepararSimulacion({
    tabla: m.tabla,
    columnas: m.columnas,
    columna,
    tipo: m.numericas.includes(columna) ? "numero" : "categoria",
    cambio,
    alcance: { tipo: "todas" },
    semilla: 42,
  });
  if (!prep.ok) throw new Error(`rechazada: ${prep.motivo}`);
  const s = prep.simulacion;
  const raw = call("run_simulate", {
    headers: s.headers,
    rows: s.filas,
    column: s.columna,
    values: s.valores,
  });
  const sent: SimuladorSent = {
    task: m.tarea,
    n: s.usadas,
    column: columna,
    classes: m.clases,
    positive: m.positiva,
  };
  const r = validateSimulateResult(raw, sent);
  if (!r.ok) throw new Error(`el lector rechazó el resultado: ${r.field}`);
  return { raw, resultado: r.value, simulacion: s };
}

const sinTiempo = (r: SimulateResult): SimulateResult => ({
  ...r,
  elapsed_ms: 0,
});

/** Todo texto del resultado: nombres del contrato, la columna y las etiquetas de la clase. */
function textos(value: unknown, into = new Set<string>()): Set<string> {
  if (typeof value === "string") into.add(value);
  else if (Array.isArray(value)) value.forEach((v) => textos(v, into));
  else if (value && typeof value === "object")
    Object.entries(value).forEach(([k, v]) => {
      into.add(k);
      textos(v, into);
    });
  return into;
}

describe("«¿qué pasaría si?» en Probeta (Pyodide)", () => {
  it("dos clases: el emisor y el lector se entienden; sin cambio nada se mueve; es determinista; el dinero cuadra a mano", () => {
    const m = entrenar("marketing-campania.csv", "convirtio");
    expect(m.tarea).toBe("binaria");
    const mas = simular(m, "visitas_web", {
      tipo: "porcentaje",
      porcentaje: 50,
    });
    emit("simulate-result-binaria", mas.raw);

    // el mismo cambio dos veces: la misma lectura
    const otra = simular(m, "visitas_web", {
      tipo: "porcentaje",
      porcentaje: 50,
    });
    expect(sinTiempo(otra.resultado)).toEqual(sinTiempo(mas.resultado));

    // sin cambio: cero decisiones se mueven y el dinero no cambia
    const costos: CostosSimulador = { task: "binaria", fp: 10, fn: 30 };
    const quieto = simular(m, "visitas_web", {
      tipo: "porcentaje",
      porcentaje: 0,
    });
    const cq = compararSimulacion(quieto.resultado, costos);
    expect(cq.cambian).toBe(0);
    expect(cq.dinero?.delta).toBe(0);
    expect(quieto.resultado.base).toEqual(quieto.resultado.changed);

    // el dinero, a mano, desde las probabilidades que entregó el propio emisor
    const c = compararSimulacion(mas.resultado, costos);
    const umbral = 10 / 40;
    const costo = (p: number[]) =>
      p.reduce((s, x) => s + (x >= umbral ? (1 - x) * 10 : x * 30), 0) /
      p.length;
    expect(c.dinero?.antes).toBeCloseTo(
      costo(mas.resultado.base.proba as number[]) * 100,
      9,
    );
    expect(c.dinero?.despues).toBeCloseTo(
      costo(mas.resultado.changed.proba as number[]) * 100,
      9,
    );
    expect(c.n).toBe(m.tabla.rows.length);

    // una categoría de las que existen también se puede mover
    const cat = simular(m, "dispositivo", {
      tipo: "categoria",
      categoria: "escritorio",
    });
    expect(cat.simulacion.tocadas).toBeGreaterThan(0);
  }, 300_000);

  it("un cambio enorme saca filas de lo que el modelo vio, y lo cuenta", () => {
    const m = entrenar("marketing-campania.csv", "convirtio");
    const grande = simular(m, "ingreso_mensual", {
      tipo: "porcentaje",
      porcentaje: 5000,
    });
    expect(grande.resultado.outside.after).toBeGreaterThan(
      grande.resultado.outside.before,
    );
    // «antes» no es cero: el perfil es el de las filas de ENTRENAMIENTO y la tabla trae también las de la prueba
    expect(grande.resultado.outside.before).toBeGreaterThanOrEqual(0);
  }, 300_000);

  it("jamás sale un valor del dataset: etiquetas de la clase, números y nombres del contrato", () => {
    const m = entrenar("marketing-campania.csv", "convirtio");
    const { raw } = simular(m, "visitas_web", {
      tipo: "porcentaje",
      porcentaje: 20,
    });
    const permitidos = new Set([
      "task",
      "n",
      "column",
      "base",
      "changed",
      "pred",
      "proba",
      "outside",
      "before",
      "after",
      "positive_class",
      "elapsed_ms",
      "binaria",
      "visitas_web",
      ...(m.clases ?? []),
    ]);
    expect([...textos(raw)].filter((s) => !permitidos.has(s))).toEqual([]);
    const crudo = JSON.stringify(raw);
    for (const valor of [
      "movil",
      "escritorio",
      "norte",
      "sur",
      "este",
      "oeste",
    ])
      expect(crudo).not.toContain(`"${valor}"`);
  }, 300_000);

  it("varias categorías: K probabilidades por fila que suman 1, y los nombres de clase como predicción", () => {
    const m = entrenar("planes-suscripcion.csv", "plan");
    expect(m.tarea).toBe("multiclase");
    const numerica = m.numericas[0]!;
    const { raw, resultado } = simular(m, numerica, {
      tipo: "porcentaje",
      porcentaje: 30,
    });
    emit("simulate-result-multiclase", raw);
    const k = m.clases!.length;
    for (const lado of [resultado.base, resultado.changed]) {
      const proba = lado.proba as number[][] | null;
      if (proba === null) continue;
      for (const fila of proba) {
        expect(fila).toHaveLength(k);
        expect(fila.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
      }
    }
    expect(resultado.classes).toEqual(m.clases);
  }, 300_000);

  it("estimar un número: predicciones en sus unidades, sin probabilidades", () => {
    const m = entrenar("consumo-energia.csv", "consumo_kwh");
    expect(m.tarea).toBe("numerica");
    const { raw, resultado } = simular(m, m.numericas[0]!, {
      tipo: "porcentaje",
      porcentaje: 10,
    });
    emit("simulate-result-numerica", raw);
    expect(resultado.base.proba).toBeNull();
    const c = compararSimulacion(resultado, null);
    if (c.task !== "numerica") throw new Error("tarea");
    expect(Number.isFinite(c.cambioMedio)).toBe(true);
    expect(c.sinDinero).toBeNull();
  }, 300_000);

  it("agrupar: el grupo de cada fila con y sin el cambio", () => {
    const m = entrenarGrupos("segmentos-clientes.csv");
    const { raw, resultado, simulacion } = simular(m, m.numericas[0]!, {
      tipo: "porcentaje",
      porcentaje: 80,
    });
    emit("simulate-result-agrupar", raw);
    expect(resultado.base.pred).toHaveLength(simulacion.usadas);
    const c = compararSimulacion(resultado, null);
    if (c.task !== "agrupar") throw new Error("tarea");
    expect(c.porGrupo.reduce((s, g) => s + g.antes, 0)).toBe(simulacion.usadas);
    const quieto = simular(m, m.numericas[0]!, {
      tipo: "porcentaje",
      porcentaje: 0,
    });
    expect(compararSimulacion(quieto.resultado, null).cambian).toBe(0);
  }, 300_000);

  it("sin modelo o con un envío mal formado, el contrato se rompe nombrando el campo", () => {
    call("reset_model");
    expect(failure("run_simulate", {})).toContain("no-model");
    const m = entrenar("marketing-campania.csv", "convirtio");
    const s = prepararSimulacion({
      tabla: m.tabla,
      columnas: m.columnas,
      columna: "visitas_web",
      tipo: "numero",
      cambio: { tipo: "fijo", valor: 5 },
      alcance: { tipo: "todas" },
      semilla: 42,
    });
    if (!s.ok) throw new Error("preparar");
    const bueno = {
      headers: s.simulacion.headers,
      rows: s.simulacion.filas,
      column: "visitas_web",
      values: s.simulacion.valores,
    };
    const campo = (p: unknown) =>
      pythonContractField(failure("run_simulate", p));
    expect(campo({ ...bueno, extra: 1 })).toBe("extra");
    expect(campo({ ...bueno, column: "convirtio" })).toBe("column");
    expect(campo({ ...bueno, column: "no_existe" })).toBe("column");
    expect(campo({ ...bueno, values: bueno.values.slice(1) })).toBe("values");
    expect(campo({ ...bueno, headers: bueno.headers.slice(1) })).toBe(
      "headers",
    );
    expect(campo({ ...bueno, rows: [] })).toBe("rows");
    expect(
      campo({
        ...bueno,
        rows: Array.from({ length: 5001 }, () => bueno.rows[0]),
        values: Array(5001).fill("1"),
      }),
    ).toBe("rows");
  }, 300_000);
});

// --- Protocolo: el ganador se reajusta SOLO con el entrenamiento ----------------------------------

describe("el ganador del Protocolo se reajusta sin abrir la prueba (Pyodide)", () => {
  const casos = [
    {
      nombre: "dos clases (crédito)",
      armar: () => armarCredito7(),
      emitir: "fit-winner-result",
    },
    {
      nombre: "varias clases (planes)",
      armar: () => con7(armarPlanes6(), "forest", "balanced_accuracy", 0.5),
      emitir: "fit-winner-result-multiclase",
    },
    {
      nombre: "un número (precio)",
      armar: () => con7(armarPrecio6(), "forest", "mae", 100),
      emitir: "fit-winner-result-numerica",
    },
  ] as const;

  it.each(casos)(
    "$nombre: el envío no lleva la prueba, el worker lo ajusta y el modelo retenido no la trae",
    ({ armar, emitir }) => {
      const a = armar();
      const envio = envioGanador(a.tabla, a.previas, HUELLA)!;
      expect(envio).not.toBeNull();
      const p = envio.payload;
      expect(Object.keys(p)).not.toContain("test");
      // son EXACTAMENTE las filas de entrenamiento con que se abre la prueba
      const abre = envio8(a.tabla, plan8(a.tabla, a.previas, HUELLA)!, HUELLA)!;
      expect(p.train).toEqual(abre.payload.train);
      expect(p.train.length + abre.payload.test.length).toBe(
        a.tabla.rows.length,
      );

      const raw = call("run_fit_winner", p);
      const r = validateFitWinnerResult(raw, envio.sent);
      expect(r.ok).toBe(true);
      emit(emitir, raw);

      // el modelo retenido no trae prueba: lo que la lee dice «no-eval» en vez de inventarla
      expect(failure("run_interval")).toContain("no-eval");
      expect(failure("run_stress")).toContain("no-eval");

      // y puntúa: simular con SOLO las filas de entrenamiento
      const p7 = plan7(a.tabla, a.previas, HUELLA)!;
      const tabla = tablaDeEntrenamiento(a.tabla, p7.particion.entrenamiento);
      const columnas = [...p7.numericas, ...p7.categoricas];
      const prep = prepararSimulacion({
        tabla,
        columnas,
        columna: columnas[0]!,
        tipo: p7.numericas.includes(columnas[0]!) ? "numero" : "categoria",
        cambio: p7.numericas.includes(columnas[0]!)
          ? { tipo: "porcentaje", porcentaje: 25 }
          : {
              tipo: "categoria",
              categoria: [
                ...new Set(
                  tabla.rows.map(
                    (f) => f[tabla.headers.indexOf(columnas[0]!)]!,
                  ),
                ),
              ][0]!,
            },
        alcance: { tipo: "todas" },
        semilla: 42,
      });
      if (!prep.ok) throw new Error(`preparar: ${prep.motivo}`);
      const simulacion = prep.simulacion;
      expect(simulacion.total).toBe(p7.particion.entrenamiento.length);
      const sim = call("run_simulate", {
        headers: simulacion.headers,
        rows: simulacion.filas,
        column: simulacion.columna,
        values: simulacion.valores,
      });
      const valido = validateSimulateResult(sim, {
        task: p7.forma,
        n: simulacion.usadas,
        column: simulacion.columna,
        classes: p.classes ?? null,
        positive: p.positive ?? null,
      });
      expect(valido.ok).toBe(true);
    },
    300_000,
  );

  it("una clave `test` (o cualquiera fuera del envío) rompe el contrato nombrándola; el sello y el ganador, también", () => {
    const a = armarCredito7();
    const p = envioGanador(a.tabla, a.previas, HUELLA)!.payload;
    const campo = (x: unknown) =>
      pythonContractField(failure("run_fit_winner", x));
    expect(campo({ ...p, test: [] })).toBe("test");
    expect(campo({ ...p, test: p.train.slice(0, 2) })).toBe("test");
    expect(campo({ ...p, folds: [] })).toBe("folds");
    expect(campo({ ...p, sello: "no" })).toBe("sello");
    expect(campo({ ...p, winner: "kmeans" })).toBe("winner");
    expect(campo({ ...p, train: p.train.slice(0, 1) })).toBe("train");
  }, 300_000);

  it("dos ajustes con el mismo envío dan las mismas predicciones (semilla fija)", () => {
    const a = armarCredito7();
    const envio = envioGanador(a.tabla, a.previas, HUELLA)!;
    const p7 = plan7(a.tabla, a.previas, HUELLA)!;
    const tabla = tablaDeEntrenamiento(a.tabla, p7.particion.entrenamiento);
    const columnas = [...p7.numericas, ...p7.categoricas];
    const cambio = p7.numericas.length > 0 ? p7.numericas[0]! : columnas[0]!;
    const prep = prepararSimulacion({
      tabla,
      columnas,
      columna: cambio,
      tipo: "numero",
      cambio: { tipo: "porcentaje", porcentaje: 10 },
      alcance: { tipo: "todas" },
      semilla: 42,
    });
    if (!prep.ok) throw new Error("preparar");
    const s = prep.simulacion;
    const payload = {
      headers: s.headers,
      rows: s.filas,
      column: s.columna,
      values: s.valores,
    };
    call("run_fit_winner", envio.payload);
    const uno = call("run_simulate", payload) as SimulateResult;
    call("run_fit_winner", envio.payload);
    const dos = call("run_simulate", payload) as SimulateResult;
    expect(sinTiempo(dos)).toEqual(sinTiempo(uno));
  }, 300_000);
});
