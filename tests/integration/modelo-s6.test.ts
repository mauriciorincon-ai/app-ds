// Un archivo de modelo del S6 (estimar una cantidad) sigue importando y puntuando igual
// (S7, D1). Mismo molde que el archivo del S5: el fixture lo emitió el código del S6
// (`pipeline.py` sin cambios desde el cierre del S6) ANTES de que el S7 tocara el pipeline,
// con su propio serializador y por el camino real de la app (prepareRun → liga → contrato →
// assembleRegressionResult → export_model → packModelFile).
//
// Emitir (solo con el código del S6): MODELO_S6_EMITIR=1 pnpm exec vitest run \
//   --config vitest.integration.config.ts tests/integration/modelo-s6.test.ts
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PyodideInterface } from "pyodide";
import { sanitizeTable } from "@/engine/sanitize";
import { parseCsvWithLimits } from "@/lib/ds/csv";
import { assembleRegressionResult, prepareRun } from "@/lib/experiment";
import {
  manifestTask,
  packModelFile,
  validateModelFile,
} from "@/lib/model-file";
import { validateScoreResult, validateTrainResult } from "@/workers/contract";
import type {
  ExportResult,
  RegressionPipelineResult,
  RegressionScoreResult,
} from "@/workers/protocol";
import { loadRuntime, pyFunction } from "./runtime";

const MODEL = resolve(
  process.cwd(),
  "tests/fixtures/modelos/modelo-s6.probeta.json",
);
const EXPECTED = resolve(
  process.cwd(),
  "tests/fixtures/modelos/modelo-s6.esperado.json",
);
const EMIT = process.env.MODELO_S6_EMITIR === "1";

let py: PyodideInterface;
let runExperiment: (payload: string) => string;
let scoreNewData: (payload: string) => string;
let exportModel: (payload?: string) => string;
let importModel: (payload: string) => string;
let resetModel: (payload?: string) => string;

beforeAll(async () => {
  py = await loadRuntime();
  runExperiment = pyFunction(py, "run_experiment");
  scoreNewData = pyFunction(py, "score_new_data");
  exportModel = pyFunction(py, "export_model");
  importModel = pyFunction(py, "import_model");
  resetModel = pyFunction(py, "reset_model");
}, 300_000);

/** Las casas nuevas del kit, como las lee la pantalla de puntuar. */
function newHouses() {
  const parsed = parseCsvWithLimits(
    readFileSync(
      resolve(process.cwd(), "docs/kit-de-prueba/casas-nuevas.csv"),
      "utf8",
    ),
  );
  if (!parsed.ok) throw new Error(`parse: ${parsed.error.kind}`);
  return { headers: parsed.table.headers, rows: parsed.table.rows };
}

describe.runIf(EMIT)(
  "emisor del fixture del S6 (solo con el código del S6)",
  () => {
    it("consumo con la liga de un solo miembro (`linear`): archivo y estimaciones", async () => {
      const parsed = parseCsvWithLimits(
        readFileSync(
          resolve(process.cwd(), "public/datasets/consumo-energia.csv"),
          "utf8",
        ),
      );
      if (!parsed.ok) throw new Error(`parse: ${parsed.error.kind}`);
      const run = prepareRun(
        sanitizeTable(parsed.table).table,
        "consumo_kwh",
        42,
      );
      if (!run.ok) throw new Error(`prepare: ${run.error}`);
      // Liga de un solo miembro, como el fixture del S5 (solo `logistic`): un archivo chico.
      const payload = { ...run.payload, roster: ["linear" as const] };
      const raw = JSON.parse(
        runExperiment(JSON.stringify(payload)),
      ) as RegressionPipelineResult;
      const checked = validateTrainResult(raw, {
        task: "numerica",
        roster: payload.roster,
        cv_k: payload.cv_k,
        primary_metric: payload.primary_metric,
      });
      expect(checked.ok).toBe(true);
      if (!checked.ok) return;
      const result = assembleRegressionResult(
        checked.value,
        run.leakage,
        payload.target,
        run.smallSample,
      );
      const exported = JSON.parse(exportModel("{}")) as ExportResult;
      const file = await packModelFile({
        datasetName: "consumo-energia.csv",
        result,
        exported,
        date: new Date("2026-10-04T12:00:00Z"),
      });
      writeFileSync(MODEL, `${JSON.stringify(file, null, 2)}\n`);
      const score_payload = newHouses();
      const score = JSON.parse(scoreNewData(JSON.stringify(score_payload)));
      writeFileSync(
        EXPECTED,
        `${JSON.stringify(
          {
            emitted_by:
              "pipeline.py del S6 (main 6f50c43, sin cambios en pipeline.py), 2026-10-04",
            score_payload,
            score,
          },
          null,
          2,
        )}\n`,
      );
    });
  },
);

describe("un archivo del S6 importa (S7, D1)", () => {
  it("valida, se restaura y puntúa las casas nuevas EXACTAMENTE como en el S6", async () => {
    const validation = await validateModelFile(readFileSync(MODEL, "utf8"));
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(manifestTask(validation.file.manifest)).toBe("numerica");
    expect(validation.warnings).toEqual([]);
    const expected = JSON.parse(readFileSync(EXPECTED, "utf8")) as {
      score_payload: unknown;
      score: RegressionScoreResult;
    };

    resetModel();
    importModel(
      JSON.stringify({
        payload_b64: validation.file.payload,
        expected_schema: validation.file.manifest.schema,
      }),
    );
    const score = JSON.parse(
      scoreNewData(JSON.stringify(expected.score_payload)),
    );
    expect(validateScoreResult(score, { task: "numerica" }).ok).toBe(true);
    expect(score.predictions).toEqual(expected.score.predictions);
    expect(score.probabilities).toBeNull();
    expect(score.novelty).toEqual(expected.score.novelty);
  });
});
