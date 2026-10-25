// @vitest-environment node
//
// S18: la explicación verificada en las CUATRO tareas, con resultados REALES de Pyodide. Garantías que estos tests hacen FALLAR:
//  - el texto estándar que la app muestra hoy en cada tarea (la plantilla de dos clases, de varias, de estimar, y la de los grupos)
//    PASA la comprobación contra el resultado, en los dos idiomas y con avisos de EDA de por medio;
//  - una narración ALTERADA cae al texto mínimo de cifras en cada tarea: una cifra cambiada, una cifra inventada, las columnas
//    que más pesan en otro orden, una variable inventada en lugar de la primera;
//  - el texto mínimo, a su vez, contiene las cifras verdaderas (nunca las alteradas).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PyodideInterface } from "pyodide";
import type { EdaAlert } from "@/engine/eda";
import { sanitizeTable } from "@/engine/sanitize";
import { parseCsvWithLimits } from "@/lib/ds/csv";
import {
  assembleClusterResult,
  assembleMulticlassResult,
  assembleRegressionResult,
  assembleResult,
  prepareClusterRun,
  prepareRun,
} from "@/lib/experiment";
import {
  explicarGrupos,
  explicarSupervisada,
  armarTextoGrupos,
} from "@/lib/narration/explicacion";
import { buildNarrationPayload } from "@/lib/narration/payload";
import {
  buildMulticlassTemplate,
  buildRegressionTemplate,
  buildTemplateNarrative,
} from "@/lib/narration/templates";
import type {
  ClusterPipelineResult,
  MulticlassPipelineResult,
  PipelineResult,
  RegressionPipelineResult,
  SupervisedResult,
} from "@/workers/protocol";
import type { Locale } from "@/i18n/config";
import { registrarDiccionario } from "@/i18n/dictionaries";
import en from "../../messages/en.json";
import { loadRuntime, pyFunction } from "./runtime";

let py: PyodideInterface;
beforeAll(async () => {
  registrarDiccionario("en", en);
  py = await loadRuntime();
}, 300_000);

const call = (fn: string, payload: unknown = {}): unknown =>
  JSON.parse(pyFunction(py, fn)(JSON.stringify(payload)));
const csv = (file: string) =>
  readFileSync(resolve(process.cwd(), "public/datasets", file), "utf8");
const tabla = (file: string) => {
  const parsed = parseCsvWithLimits(csv(file));
  if (!parsed.ok) throw new Error(file);
  return sanitizeTable(parsed.table).table;
};

const LIGA = ["logistic", "forest", "hgb"] as const;
const LIGA_NUMERICA = ["linear", "forest", "hgb"] as const;
const ALERTAS_CLASIFICACION: EdaAlert[] = [
  { kind: "id-like", column: "cliente_id", score: 1 },
  { kind: "class-imbalance", minorityRate: 0.1234 },
];
const ALERTAS_NUMERO: EdaAlert[] = [
  { kind: "target-skewed", skew: 2.34 },
  { kind: "target-outliers", share: 0.034 },
];

type Caso = { result: SupervisedResult; plantilla: (l: Locale) => string; alertas: EdaAlert[] };

function binaria(): Caso {
  const t = tabla("marketing-campania.csv");
  const prep = prepareRun(t, "convirtio", 42);
  if (!prep.ok) throw new Error("prepare");
  const bruto = call("run_experiment", { ...prep.payload, roster: LIGA }) as PipelineResult;
  const result = assembleResult(bruto, prep.leakage, prep.smallSample);
  return {
    result,
    alertas: ALERTAS_CLASIFICACION,
    plantilla: (locale) =>
      buildTemplateNarrative(
        buildNarrationPayload({ result, target: "convirtio", cols: t.headers.length, locale, edaAlerts: ALERTAS_CLASIFICACION }),
      ),
  };
}
function multiclase(): Caso {
  const t = tabla("planes-suscripcion.csv");
  const prep = prepareRun(t, "plan", 42);
  if (!prep.ok) throw new Error("prepare");
  const bruto = call("run_experiment", { ...prep.payload, roster: LIGA }) as MulticlassPipelineResult;
  const result = assembleMulticlassResult(bruto, prep.leakage, prep.smallSample);
  return {
    result,
    alertas: ALERTAS_CLASIFICACION,
    plantilla: (locale) => buildMulticlassTemplate({ result, locale, edaAlerts: ALERTAS_CLASIFICACION }),
  };
}
function numerica(): Caso {
  const t = tabla("consumo-energia.csv");
  const prep = prepareRun(t, "consumo_kwh", 42);
  if (!prep.ok) throw new Error("prepare");
  const bruto = call("run_experiment", { ...prep.payload, roster: LIGA_NUMERICA }) as RegressionPipelineResult;
  const result = assembleRegressionResult(bruto, prep.leakage, "consumo_kwh", prep.smallSample);
  return {
    result,
    alertas: ALERTAS_NUMERO,
    plantilla: (locale) => buildRegressionTemplate({ result, locale, edaAlerts: ALERTAS_NUMERO }),
  };
}

const TAREAS: [string, () => Caso][] = [
  ["dos clases", binaria],
  ["varias categorías", multiclase],
  ["estimar un número", numerica],
];

describe.each(TAREAS)("la explicación en %s", (_nombre, armar) => {
  let caso: Caso;
  beforeAll(() => {
    caso = armar();
  }, 300_000);

  const explicar = (locale: Locale, candidata: string) =>
    explicarSupervisada({ result: caso.result, locale, edaAlerts: caso.alertas, candidata });

  it.each(["es", "en"] as const)("el texto estándar de hoy pasa la comprobación (%s)", (locale) => {
    const texto = caso.plantilla(locale);
    const r = explicar(locale, texto);
    expect(r.fallos).toEqual([]);
    expect(r.verificada).toBe(true);
    expect(r.texto).toBe(texto);
  });

  it("una cifra del veredicto cambiada cae al texto mínimo, que trae las cifras verdaderas", () => {
    const texto = caso.plantilla("es");
    // la primera cifra del texto es la del modelo en el veredicto (dos decimales, o los de las unidades al estimar)
    const verdadera = /\d[\d,]*(?:\.\d+)?/.exec(texto)![0];
    const alterada = texto.replace(verdadera, "9.99");
    expect(alterada).not.toBe(texto);
    const r = explicar("es", alterada);
    expect(r.verificada).toBe(false);
    expect(r.fallos.map((f) => f.tipo)).toContain("cifra-ajena");
    expect(r.texto).not.toContain("9.99");
    expect(r.texto).toContain(caso.result.explainability.features[0]!.name);
  });

  it("una cifra inventada, las columnas en otro orden o una variable inventada también caen", () => {
    const texto = caso.plantilla("es");
    expect(explicar("es", `${texto} Además, el 87 % de tus clientes lo agradecerá.`).verificada).toBe(false);

    const [a, b] = caso.result.explainability.features.map((f) => f.name);
    const cambiado = texto.replace(a!, "@@").replace(b!, a!).replace("@@", b!);
    const orden = explicar("es", cambiado);
    expect(orden.verificada).toBe(false);
    expect(orden.fallos.map((f) => f.tipo)).toContain("orden");

    const inventada = explicar("es", texto.replace(a!, "ingreso_inventado"));
    expect(inventada.verificada).toBe(false);
    expect(inventada.texto).not.toContain("ingreso_inventado");
  });

  it("lo que falta también falla: un texto sin las cifras del veredicto no pasa", () => {
    const r = explicar("es", `Tu modelo es bueno. ${caso.result.explainability.features.map((f) => f.name).join(" ")}`);
    expect(r.verificada).toBe(false);
    expect(r.fallos.map((f) => f.tipo)).toContain("cifra-falta");
  });
});

describe("la explicación al agrupar", () => {
  let resultado: ReturnType<typeof assembleClusterResult>;
  beforeAll(() => {
    const t = tabla("segmentos-clientes.csv");
    const run = prepareClusterRun(t, 42);
    if (!run.ok) throw new Error("prepare");
    const bruto = call("run_experiment", run.payload) as ClusterPipelineResult;
    resultado = assembleClusterResult(bruto, run.smallSample);
  }, 300_000);

  it.each(["es", "en"] as const)("describe cada grupo contra su media y el promedio, y pasa la comprobación (%s)", (locale) => {
    const r = explicarGrupos({ result: resultado, locale });
    expect(r.fallos).toEqual([]);
    expect(r.verificada).toBe(true);
    const k = resultado.profiles.groups.length;
    expect(r.texto.split(locale === "es" ? "El grupo " : "Group ").length - 1).toBe(k);
  });

  it("una cifra de un grupo cambiada, un grupo con otro tamaño o las columnas en otro orden caen al texto mínimo", () => {
    const { texto } = armarTextoGrupos(resultado, "es");
    const cifra = /\((\d+) %, /.exec(texto)![1]!;
    const alterada = explicarGrupos({ result: resultado, locale: "es", candidata: texto.replace(`(${cifra} %, `, "(77 %, ") });
    expect(alterada.verificada).toBe(false);
    expect(alterada.texto).toMatch(/Se formaron \d+ grupos/);

    const filas = resultado.profiles.groups[0]!.size;
    const otroTamano = texto.replace(/(\d[\d,]*) filas/, `${filas + 1000} filas`);
    expect(explicarGrupos({ result: resultado, locale: "es", candidata: otroTamano }).verificada).toBe(false);

    const separan = resultado.profiles.separating.map((s) => s.column);
    if (separan.length >= 2) {
      const cambiado = texto.replace(separan[0]!, "@@").replace(separan[1]!, separan[0]!).replace("@@", separan[1]!);
      const r = explicarGrupos({ result: resultado, locale: "es", candidata: cambiado });
      expect(r.verificada).toBe(false);
      expect(r.fallos.map((f) => f.tipo)).toContain("frase-falta");
    }
  });
});
