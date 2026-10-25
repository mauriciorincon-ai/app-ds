// @vitest-environment node
//
// S18 (ADR 026): el plan de limpieza aprobado, en el Pyodide REAL. Garantías que estos tests hacen FALLAR si se rompen:
//  - lo aprobado llega al preprocesador (la marca de vacío, «sin dato» y los cuantiles) y el modelo entrena;
//  - es anti-fuga POR CONSTRUCCIÓN: los cuantiles y la mediana se ajustan con las filas de train. El test planta un valor
//    extremo SOLO en las filas de prueba: si el preprocesador lo viera, el máximo de los cuantiles lo delataría;
//  - es determinista: dos corridas con el mismo plan dan las mismas métricas;
//  - sin plan, el payload y el modelo son los de siempre (nada cambia para quien no aprueba nada);
//  - el modelo con plan se exporta, se importa y puntúa lo mismo (el plan viaja en el modelo, no en otro lado);
//  - el contrato rechaza un plan mal formado nombrando el campo, y el de agrupar acepta uno y lo filtra a lo que usa.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PyodideInterface } from "pyodide";
import { aplicarDecisiones } from "@/engine/limpieza-plan";
import { proponerPlan } from "@/engine/limpieza";
import { parseCsvWithLimits, type CsvTable } from "@/lib/ds/csv";
import { prepareClusterRun, prepareRun } from "@/lib/experiment";
import type { ExportResult, ScoreResult } from "@/workers/protocol";
import { loadRuntime, pyFunction } from "./runtime";

let py: PyodideInterface;
beforeAll(async () => {
  py = await loadRuntime();
}, 300_000);

const call = <T = unknown>(fn: string, payload: unknown = {}): T =>
  JSON.parse(pyFunction(py, fn)(JSON.stringify(payload))) as T;

const LIGA = ["logistic", "forest", "hgb"] as const;

/** La campaña de marketing con huecos y atípicos plantados donde el plan de limpieza los va a proponer. */
function tablaSucia(): { table: CsvTable } {
  const csv = readFileSync(
    resolve(process.cwd(), "public/datasets/marketing-campania.csv"),
    "utf8",
  );
  const parsed = parseCsvWithLimits(csv);
  if (!parsed.ok) throw new Error("no parsea");
  const table: CsvTable = {
    headers: [...parsed.table.headers],
    rows: parsed.table.rows.map((r) => [...r]),
  };
  const ingreso = table.headers.indexOf("ingreso_mensual");
  const region = table.headers.indexOf("region");
  table.rows.forEach((fila, i) => {
    if (i % 7 === 0) fila[ingreso] = ""; // ≈ 14 % de vacíos en una numérica
    if (i % 9 === 0) fila[region] = ""; // ≈ 11 % de vacíos en una categórica
  });
  return { table };
}

function entrenar(
  aprobar: boolean,
  seed = 42,
  tablaOriginal?: CsvTable,
): {
  payload: ReturnType<typeof prepareRun> & { ok: true };
  result: { model: Record<string, number> };
  plan: ReturnType<typeof aplicarDecisiones>;
} {
  const { table } = tablaOriginal ? { table: tablaOriginal } : tablaSucia();
  const propuesta = proponerPlan(table);
  const plan = aplicarDecisiones(
    propuesta,
    aprobar
      ? Object.fromEntries(propuesta.map((p) => [p.id, "aprobado" as const]))
      : {},
    "convirtio",
  );
  const prepared = prepareRun(table, "convirtio", seed, { plan });
  if (!prepared.ok) throw new Error(`prepare: ${prepared.error}`);
  const result = call<{ model: Record<string, number> }>("run_experiment", {
    ...prepared.payload,
    roster: LIGA,
  });
  return { payload: prepared as never, result, plan };
}

describe("el plan aprobado llega al preprocesador", () => {
  it("la marca de vacío, «sin dato» y los cuantiles están en el pipeline ajustado, y el modelo entrena", () => {
    const { table } = tablaSucia();
    // plantamos atípicos en una numérica para que el plan proponga los cuantiles
    const visitas = table.headers.indexOf("visitas_web");
    for (let i = 0; i < 6; i++) table.rows[i * 3 + 1]![visitas] = "100000";
    const propuesta = proponerPlan(table);
    expect(propuesta.map((p) => p.id)).toEqual(
      expect.arrayContaining([
        "vacio-indicador:ingreso_mensual",
        "vacio-categoria:region",
        "atipicos-cuantiles:visitas_web",
      ]),
    );
    const { payload, result, plan } = entrenar(true, 42, table);
    expect(plan.limpieza).toEqual({
      indicador_vacio: ["ingreso_mensual"],
      sin_dato: ["region"],
      cuantiles: ["visitas_web"],
    });
    expect((payload.payload as { limpieza?: unknown }).limpieza).toEqual(
      plan.limpieza,
    );
    expect(result.model.auc ?? result.model.f1).toBeGreaterThan(0);

    const nombres = py.runPython(
      'str([n for n, _, c in _MODEL["pipe"].named_steps["prep"].transformers_ if len(c)])',
    ) as string;
    expect(nombres).toContain("num_marca");
    expect(nombres).toContain("num_cuantiles");
    expect(nombres).toContain("cat_sin_dato");
  }, 300_000);

  it("sin plan aprobado el payload no lleva la clave y el preprocesador es el de siempre", () => {
    const { payload } = entrenar(false);
    expect("limpieza" in (payload.payload as object)).toBe(false);
    const nombres = py.runPython(
      'str([n for n, _, c in _MODEL["pipe"].named_steps["prep"].transformers_])',
    ) as string;
    expect(nombres).toBe("['num', 'cat']");
  }, 300_000);
});

describe("anti-fuga por construcción", () => {
  it("un valor extremo que solo está en la prueba NO llega a los cuantiles ni a la mediana", () => {
    const { table } = tablaSucia();
    const visitas = table.headers.indexOf("visitas_web");
    const objetivo = table.headers.indexOf("convirtio");
    // el reparto estratificado con semilla: se pide primero y se planta después en las filas de PRUEBA
    const previo = prepareRun(table, "convirtio", 42);
    if (!previo.ok) throw new Error("prepare");
    const filasValidas = table.rows
      .map((fila, i) => ({ fila, i }))
      .filter(({ fila }) => fila[objetivo] !== "");
    const prueba = previo.payload.test_idx.slice(0, 8);
    for (const k of prueba) filasValidas[k]!.fila[visitas] = "100000";
    // y se proponen los cuantiles con ESA tabla: el plan ve el extremo (propone), el pipeline NO debe verlo
    const propuesta = proponerPlan(table);
    const paso = propuesta.find(
      (p) => p.id === "atipicos-cuantiles:visitas_web",
    );
    expect(
      paso,
      "el plan debe proponer los cuantiles de visitas_web",
    ).toBeDefined();
    const plan = aplicarDecisiones(
      propuesta,
      { [paso!.id]: "aprobado" },
      "convirtio",
    );
    const prepared = prepareRun(table, "convirtio", 42, { plan });
    if (!prepared.ok) throw new Error("prepare");
    expect(prepared.payload.test_idx).toEqual(previo.payload.test_idx);
    call("run_experiment", { ...prepared.payload, roster: LIGA });

    const maximoCuantiles = py.runPython(`
t = dict((n, tr) for n, tr, _ in _MODEL["pipe"].named_steps["prep"].transformers_)["num_cuantiles"]
float(t.named_steps["quantil"].quantiles_.max())
`) as number;
    // los cuantiles se ajustaron SOLO con train: el 100000 de las filas de prueba no está
    expect(maximoCuantiles).toBeLessThan(100000);
    expect(maximoCuantiles).toBeGreaterThan(0);
  }, 300_000);
});

describe("determinismo", () => {
  it("dos corridas con el mismo plan dan las mismas métricas", () => {
    const a = entrenar(true).result.model;
    const b = entrenar(true).result.model;
    expect(b).toEqual(a);
  }, 300_000);
});

describe("export e import", () => {
  it("el modelo con plan se exporta, se importa y puntúa lo mismo", () => {
    entrenar(true);
    const nuevos = {
      headers: [
        "edad",
        "ingreso_mensual",
        "visitas_web",
        "correos_abiertos",
        "region",
        "dispositivo",
      ],
      rows: [
        ["30", "", "10", "5", "", "movil"],
        ["55", "4000", "30", "12", "norte", "escritorio"],
        ["41", "2500", "100000", "2", "sur", "movil"],
      ],
    };
    const antes = call<ScoreResult>("score_new_data", nuevos);
    const exportado = call<ExportResult>("export_model");
    call("reset_model");
    call("import_model", { payload_b64: exportado.payload_b64 });
    const despues = call<ScoreResult>("score_new_data", nuevos);
    expect(despues).toEqual(antes);
  }, 300_000);
});

describe("el contrato", () => {
  const base = () => {
    const { table } = tablaSucia();
    const prepared = prepareRun(table, "convirtio", 42);
    if (!prepared.ok) throw new Error("prepare");
    return { ...prepared.payload, roster: LIGA };
  };
  const falla = (payload: object): string => {
    try {
      call("run_experiment", payload);
    } catch (error) {
      return String((error as Error).message);
    }
    return "";
  };

  it("un plan mal formado se rechaza nombrando el campo, sin valores", () => {
    const p = base();
    expect(falla({ ...p, limpieza: { cuantiles: [] } })).toContain(
      "contract:limpieza",
    );
    expect(
      falla({
        ...p,
        limpieza: { indicador_vacio: "edad", sin_dato: [], cuantiles: [] },
      }),
    ).toContain("contract:limpieza");
    // una columna que no está donde dice: «region» es categórica, no admite la marca de vacío
    expect(
      falla({
        ...p,
        limpieza: { indicador_vacio: ["region"], sin_dato: [], cuantiles: [] },
      }),
    ).toContain("contract:limpieza");
    expect(
      falla({
        ...p,
        limpieza: {
          indicador_vacio: [],
          sin_dato: ["inventada"],
          cuantiles: [],
        },
      }),
    ).toContain("contract:limpieza");
  }, 300_000);

  it("agrupar acepta el plan y se queda con las columnas que usa", () => {
    const { table } = tablaSucia();
    const propuesta = proponerPlan(table);
    const plan = aplicarDecisiones(
      propuesta,
      Object.fromEntries(propuesta.map((p) => [p.id, "aprobado" as const])),
      null,
    );
    const prepared = prepareClusterRun(table, 42, { plan });
    if (!prepared.ok) throw new Error(`cluster: ${prepared.error}`);
    expect(prepared.payload.limpieza).toEqual(plan.limpieza);
    const resultado = call<{ league: unknown[] }>("run_experiment", {
      ...prepared.payload,
      roster: ["kmeans"],
    });
    expect(resultado.league.length).toBeGreaterThan(0);
  }, 300_000);
});
