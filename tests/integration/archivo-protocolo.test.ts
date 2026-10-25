// @vitest-environment node
//
// S19 (ADR 027): el ganador del Protocolo guardado como `.probeta.json` y usado en Probeta, en el Pyodide REAL. Garantías que estos
// tests hacen FALLAR si se rompen:
//  - lo que se guarda ES el modelo que se probó: el ganador reajustado solo con el entrenamiento predice, en las filas de la prueba,
//    EXACTAMENTE lo que predijo `run_test` (mismo ganador, mismas filas, misma semilla);
//  - el archivo (variante del Protocolo) se valida, se importa en un modelo vacío (el esquema del manifiesto es el del pickle), puntúa
//    filas nuevas y se puede vigilar: la cifra de referencia sale de su bloque `protocol`;
//  - el pickle conserva sus tres claves (ni una fila de la tabla viaja en el archivo) y el manifiesto no trae filas;
//  - ajustar al ganador no abre la prueba: el modelo retenido no la trae (`no-eval`).
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import type { PyodideInterface } from "pyodide";
import { plan8 } from "@/engine/protocolo/etapa8";
import { vigilar } from "@/engine/vigilancia";
import { referenciaDe } from "@/components/vigilancia/referencia";
import {
  packProtocolModelFile,
  validateProtocolModelFile,
} from "@/lib/model-file-protocolo";
import { envioGanador } from "@/lib/protocolo/ganador";
import { envio8 } from "@/lib/protocolo/prueba8";
import { validateExportResult } from "@/workers/contract";
import { HUELLA, armarCredito7 } from "../unit/protocolo-etapa8-helpers";
import { loadRuntime, pyFunction } from "./runtime";

let py: PyodideInterface;
beforeAll(async () => {
  py = await loadRuntime();
}, 300_000);

const call = (fn: string, payload: unknown = {}): unknown =>
  JSON.parse(pyFunction(py, fn)(JSON.stringify(payload)));

describe("el ganador del Protocolo como archivo (Pyodide)", () => {
  const a = armarCredito7();
  const fit = envioGanador(a.tabla, a.previas, HUELLA)!;
  const abre = envio8(a.tabla, plan8(a.tabla, a.previas, HUELLA)!, HUELLA)!;

  it("lo que se guarda es el modelo que se probó: las mismas predicciones en las filas de la prueba", () => {
    const test = call("run_test", abre.payload) as {
      pred: number[];
      proba: number[] | null;
      metric: { value: number };
    };
    call("reset_model");
    call("run_fit_winner", fit.payload);
    const scored = call("score_new_data", {
      headers: abre.payload.headers,
      rows: abre.payload.test,
    }) as { predictions: string[]; probabilities: number[] | null; positive_class: string };
    // run_test da 1 = «hay que actuar» (la clase positiva del Protocolo); score_new_data da la etiqueta original
    expect(scored.predictions.map((p) => (p === scored.positive_class ? 1 : 0))).toEqual(test.pred);
    if (test.proba && scored.probabilities)
      scored.probabilities.forEach((p, i) => expect(p).toBeCloseTo(test.proba![i]!, 12));
    // y no abre la prueba: el modelo retenido no la trae
    expect(() => call("run_interval")).toThrow(/no-eval/);
  }, 300_000);

  it("se exporta, se valida, se importa en un modelo vacío, puntúa y se vigila", async () => {
    const test = call("run_test", abre.payload) as { metric: { value: number } };
    call("reset_model");
    call("run_fit_winner", fit.payload);
    const exportado = validateExportResult(call("export_model"));
    if (!exportado.ok) throw new Error(`export: ${exportado.field}`);
    const archivo = await packProtocolModelFile({
      datasetName: "credito-fuga-plantada.csv",
      exported: exportado.value,
      protocol: {
        winner: fit.sent.winner,
        metric: abre.payload.primary_metric,
        test_value: test.metric.value,
        n_train: fit.sent.n_train,
        n_test: abre.payload.test.length,
        huella: fit.sent.huella,
        sello: fit.sent.sello,
      },
    });
    const texto = JSON.stringify(archivo);
    // ni una fila de la tabla viaja en el manifiesto
    expect(JSON.stringify(archivo.manifest)).not.toContain(a.tabla.rows[0]!.join(","));
    const v = await validateProtocolModelFile(texto);
    expect(v.ok).toBe(true);
    if (!v.ok) return;

    // un modelo vacío lo importa: el esquema del manifiesto es el del pickle
    call("reset_model");
    call("import_model", {
      payload_b64: v.file.payload,
      expected_schema: v.file.manifest.schema,
    });
    const scored = call("score_new_data", {
      headers: a.tabla.headers,
      rows: a.tabla.rows,
    }) as { predictions: string[] };
    expect(scored.predictions).toHaveLength(a.tabla.rows.length);

    // y se vigila: la cifra de la prueba sale del bloque `protocol` del archivo
    const referencia = referenciaDe({ manifest: v.file.manifest }, null)!;
    expect(referencia).toEqual({
      metric: abre.payload.primary_metric,
      valor: test.metric.value,
      nPrueba: abre.payload.test.length,
    });
    const datos = call("run_evaluate", { headers: a.tabla.headers, rows: a.tabla.rows }) as Parameters<typeof vigilar>[0];
    const lectura = vigilar(datos, referencia, { clases: 2, semilla: 42 });
    expect(["sigue", "revisar", "reentrenar"]).toContain(lectura.veredicto);
    expect(lectura.hoy.n).toBe(a.tabla.rows.length);

    // las claves del pickle: el modelo y su esquema, nada de filas
    const crudo = py.runPython(
      `import base64, pickle, zlib\nsorted(pickle.loads(zlib.decompress(base64.b64decode("${v.file.payload}"))).keys())`,
    ) as { toJs: () => string[] };
    expect(crudo.toJs()).toEqual(["pipe", "schema", "training_profile"]);
  }, 300_000);

  it("el archivo de Probeta del kit sigue siendo el de Probeta", () => {
    const ajeno = readFileSync("docs/kit-de-prueba/modelo-ajeno.json", "utf8");
    expect(ajeno).not.toContain('"origin"');
  });
});
