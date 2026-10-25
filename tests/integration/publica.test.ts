// @vitest-environment node
//
// S17 (ADR 024): lo que el usuario se LLEVA, probado con el Pyodide REAL y, en la CI, con CPython. Este test:
//  · exporta CADA modelo del roster de las tres tareas con objetivo con el empaquetado real (`packModelFile`, el mismo de
//    «Exportar»), y los cuatro agrupadores;
//  · comprueba en Pyodide que `puntuar.py` (el motor del puntuador y del servicio) puntúa EXACTAMENTE como `score_new_data` de
//    la app: mismas etiquetas, mismas probabilidades, misma novedad;
//  · arma la receta, el servicio (ZIP) y el puntuador con los MISMOS ensambladores que la pantalla, y los deja en
//    tests/integration/.salida/ para que la CI los ejecute en CPython 3.14 con las versiones fijas (tests/python/test_publica.py):
//    la receta del kit reproduce, el servicio puntúa el kit como Pyodide;
//  · vigila que lo que se arma sin el modelo (la receta y las plantillas) no lleve un valor del kit.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PyodideInterface } from "pyodide";
import {
  CLUSTER_MEMBER_IDS,
  ROSTER_BY_TASK,
  type MemberId,
} from "@/engine/roster";
import { sanitizeTable } from "@/engine/sanitize";
import type { SupervisedTask } from "@/engine/tarea";
import { parseCsvWithLimits } from "@/lib/ds/csv";
import {
  assembleMulticlassResult,
  assembleRegressionResult,
  assembleResult,
  prepareClusterRun,
  prepareRun,
} from "@/lib/experiment";
import { RUNTIME_VERSIONS, packModelFile } from "@/lib/model-file";
import { declaracionDe } from "@/lib/publica/declaracion";
import {
  armarPuntuador,
  armarReceta,
  armarServicio,
} from "@/lib/publica/ensamblar";
import { esServible } from "@/lib/publica/no-servibles";
import { validateExportResult } from "@/workers/contract";
import type {
  ExportResult,
  MulticlassPipelineResult,
  PipelinePayload,
  PipelineResult,
  RegressionPipelineResult,
  SupervisedResult,
} from "@/workers/protocol";
import { loadRuntime, pyFunction } from "./runtime";

const RAIZ = process.cwd();
const SALIDA = resolve(RAIZ, "tests/integration/.salida");
const leer = (ruta: string) => readFileSync(resolve(RAIZ, ruta), "utf8");
const PLANTILLAS = "src/lib/ds/plantillas";
const PIPELINE = leer("src/lib/ds/pipeline.py");
const RECETA_TPL = leer(`${PLANTILLAS}/receta.py`);
const PUNTUAR = leer(`${PLANTILLAS}/puntuar.py`);
const SERVICIO = leer(`${PLANTILLAS}/servicio.py`);
const PUNTUADOR_TPL = leer(`${PLANTILLAS}/puntuador.html`);
const README = leer(`${PLANTILLAS}/README-servicio.md`);
const REQ_RECETA = leer(`${PLANTILLAS}/requirements-receta.txt`);
const REQ_SERVICIO = leer(`${PLANTILLAS}/requirements-servicio.txt`);
const FECHA = new Date("2026-10-24T12:00:00Z");

const KIT: [SupervisedTask, string, string][] = [
  ["binaria", "marketing-campania.csv", "convirtio"],
  ["multiclase", "planes-suscripcion.csv", "plan"],
  ["numerica", "consumo-energia.csv", "consumo_kwh"],
];

let py: PyodideInterface;
beforeAll(async () => {
  py = await loadRuntime();
  py.FS.writeFile("/home/pyodide/puntuar.py", PUNTUAR);
  py.runPython("import json, puntuar");
  rmSync(SALIDA, { recursive: true, force: true });
  for (const carpeta of ["recetas", "servicios", "esperados", "puntuadores"])
    mkdirSync(resolve(SALIDA, carpeta), { recursive: true });
}, 300_000);

const llamar = (fn: string, payload: unknown): unknown =>
  JSON.parse(pyFunction(py, fn)(JSON.stringify(payload)));

type Caso = {
  id: string;
  tarea: SupervisedTask;
  miembro: string;
  csv: string;
  servible: boolean;
  receta: string;
  servicio: string;
  esperado: string;
};
const matriz: Caso[] = [];

/** Las filas del kit tal cual (con su cabecera): lo que alguien le mandaría al servicio. */
function tablaCruda(csv: string) {
  const parsed = parseCsvWithLimits(leer(`public/datasets/${csv}`));
  if (!parsed.ok) throw new Error(`parse: ${csv}`);
  return parsed.table;
}

function exportar(): ExportResult {
  const r = validateExportResult(llamar("export_model", {}));
  if (!r.ok) throw new Error(`contrato: ${r.field}`);
  return r.value;
}

/** puntuar.py en Pyodide contra score_new_data: lo mismo, dato por dato. Devuelve lo que puntúa la app. */
function paridadDePuntuar(
  exportado: ExportResult,
  headers: string[],
  rows: string[][],
): unknown {
  const app = llamar("score_new_data", { headers, rows });
  py.globals.set("PAYLOAD", exportado.payload_b64);
  py.globals.set("CABECERA", JSON.stringify(headers));
  py.globals.set("FILAS", JSON.stringify(rows));
  const nuestro = JSON.parse(
    py.runPython(
      "m = puntuar.load_model(PAYLOAD)\njson.dumps(puntuar.score(m, json.loads(CABECERA), json.loads(FILAS)))",
    ) as string,
  );
  expect(nuestro).toEqual(app);
  return app;
}

describe("lo que el usuario se lleva: un modelo por miembro del roster, de punta a punta", () => {
  for (const [tarea, csv, objetivo] of KIT) {
    const miembros = ROSTER_BY_TASK[tarea] as readonly MemberId[];
    it(`${tarea}: ${miembros.length} miembros — empaquetado real, puntuar.py = score_new_data, receta y servicio armados`, async () => {
      const cruda = tablaCruda(csv);
      const sanea = sanitizeTable(cruda);
      const prep = prepareRun(sanea.table, objetivo, 42);
      if (!prep.ok) throw new Error(`prepare: ${prep.error}`);
      for (const miembro of miembros) {
        const payload: PipelinePayload = { ...prep.payload, roster: [miembro] };
        const bruto = llamar("run_experiment", payload);
        const result: SupervisedResult =
          tarea === "binaria"
            ? assembleResult(
                bruto as PipelineResult,
                prep.leakage,
                prep.smallSample,
              )
            : tarea === "multiclase"
              ? assembleMulticlassResult(
                  bruto as MulticlassPipelineResult,
                  prep.leakage,
                  prep.smallSample,
                )
              : assembleRegressionResult(
                  bruto as RegressionPipelineResult,
                  prep.leakage,
                  objetivo,
                  prep.smallSample,
                );
        expect(result.modelName, `${tarea}/${miembro}`).toBe(miembro);

        const exportado = exportar();
        const archivo = await packModelFile({
          datasetName: csv,
          result,
          exported: exportado,
          sanitation: sanea.report,
          date: FECHA,
        });
        expect(archivo.manifest.versions.sklearn).toBe(
          RUNTIME_VERSIONS.sklearn,
        );
        const texto = JSON.stringify(archivo, null, 2);
        const esperado = paridadDePuntuar(exportado, cruda.headers, cruda.rows);

        const id = `${tarea}__${miembro}`;
        const receta = armarReceta(
          PIPELINE,
          RECETA_TPL,
          declaracionDe({
            result,
            target: objetivo,
            seed: 42,
            datasetName: csv,
            sanitation: sanea.report,
            appVersion: "prueba",
            idioma: miembro.length % 2 === 0 ? "es" : "en", // los dos idiomas de la receta pasan por la CI
          }),
          REQ_RECETA,
        );
        writeFileSync(resolve(SALIDA, `recetas/${id}.py`), receta);
        writeFileSync(
          resolve(SALIDA, `esperados/${id}.json`),
          JSON.stringify(esperado),
        );
        writeFileSync(
          resolve(SALIDA, `servicios/${id}.zip`),
          armarServicio(
            {
              servicio: SERVICIO,
              puntuar: PUNTUAR,
              requirements: REQ_SERVICIO,
              readme: README,
              modelo: texto,
            },
            FECHA,
          ),
        );
        if (miembro === "forest" || miembro === "linear") {
          const html = armarPuntuador(PUNTUADOR_TPL, PUNTUAR, texto);
          writeFileSync(resolve(SALIDA, `puntuadores/${id}.html`), html);
          // lo que va dentro del <script type="application/json"> es el archivo, completo y legible
          const dentro =
            /<script type="application\/json" id="modelo">([\s\S]*?)<\/script>/.exec(
              html,
            )![1]!;
          expect(JSON.parse(dentro)).toEqual(JSON.parse(texto));
        }
        matriz.push({
          id,
          tarea,
          miembro,
          csv: `public/datasets/${csv}`,
          servible: esServible(miembro),
          receta: `recetas/${id}.py`,
          servicio: `servicios/${id}.zip`,
          esperado: `esperados/${id}.json`,
        });
      }
    }, 900_000);
  }
});

describe("los agrupadores: puntuar.py puntúa como score_new_data (el servicio no los ofrece)", () => {
  it("los cuatro, en Pyodide", () => {
    const cruda = tablaCruda("segmentos-clientes.csv");
    const run = prepareClusterRun(sanitizeTable(cruda).table, 42);
    if (!run.ok) throw new Error("prepare");
    for (const miembro of CLUSTER_MEMBER_IDS) {
      llamar("run_experiment", { ...run.payload, roster: [miembro] });
      const esperado = paridadDePuntuar(
        exportar(),
        cruda.headers,
        cruda.rows,
      ) as {
        task: string;
      };
      expect(esperado.task).toBe("agrupar");
    }
  }, 600_000);
});

describe("lo que se arma sin el modelo no lleva un valor del kit", () => {
  it("ni la receta ni las plantillas traen entre comillas una celda de texto de los tres archivos", () => {
    const celdas = new Set<string>();
    for (const [, csv] of KIT) {
      const t = tablaCruda(csv);
      for (const fila of t.rows)
        for (const v of fila)
          if (
            v.length >= 3 &&
            Number.isNaN(Number(v)) &&
            !t.headers.includes(v)
          )
            celdas.add(v);
    }
    expect(celdas.size).toBeGreaterThan(5);
    const textos: [string, string][] = [
      ["plantilla receta", RECETA_TPL],
      ["plantilla servicio", SERVICIO],
      ["plantilla puntuador", PUNTUADOR_TPL],
      ["puntuar.py", PUNTUAR],
      ...matriz.map((m): [string, string] => [
        m.receta,
        readFileSync(resolve(SALIDA, m.receta), "utf8"),
      ]),
    ];
    expect(matriz.length).toBeGreaterThan(30);
    const hallazgos: string[] = [];
    for (const [nombre, texto] of textos)
      for (const v of celdas)
        if (texto.includes(`"${v}"`) || texto.includes(`'${v}'`))
          hallazgos.push(`${nombre}: «${v}»`);
    expect(hallazgos.slice(0, 5)).toEqual([]);
  });

  it("al terminar queda la matriz para los pasos de Python de la CI", () => {
    writeFileSync(
      resolve(SALIDA, "matriz.json"),
      JSON.stringify({ casos: matriz }, null, 1),
    );
    expect(matriz.length).toBeGreaterThan(30);
  });
});
