// Runtime de Pyodide para los tests de integración, cargado EXACTAMENTE como el
// runner del navegador (public/pyodide-runner.js): los paquetes de
// scripts/pyodide-paquetes.mjs, y los de LOAD_WITHOUT_DEPS por la URL de su wheel
// (sin el cierre declarado en el lock — xgboost sin setuptools/pyparsing). Si una
// versión futura de xgboost necesitara esas dependencias, el import fallaría aquí
// y no en el navegador del usuario (regla 11: el gate corre en el modo real).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { loadPyodide, type PyodideInterface } from "pyodide";
import {
  LOAD_WITHOUT_DEPS,
  REQUIRED,
} from "../../scripts/pyodide-paquetes.mjs";

const require = createRequire(import.meta.url);

export async function loadRuntime({
  pipeline = true,
}: { pipeline?: boolean } = {}): Promise<PyodideInterface> {
  const pyodide = await loadPyodide();
  await pyodide.loadPackage(
    REQUIRED.filter((name) => !LOAD_WITHOUT_DEPS.includes(name)),
  );
  const lock = require("pyodide/pyodide-lock.json") as {
    packages: Record<string, { file_name: string }>;
  };
  const version = (require("pyodide/package.json") as { version: string })
    .version;
  for (const name of LOAD_WITHOUT_DEPS) {
    const file = lock.packages[name]!.file_name;
    await pyodide.loadPackage(
      `https://cdn.jsdelivr.net/pyodide/v${version}/full/${file}`,
    );
  }
  if (pipeline) {
    pyodide.runPython(
      readFileSync(resolve(process.cwd(), "src/lib/ds/pipeline.py"), "utf8"),
    );
  }
  return pyodide;
}

/** Una función de pipeline.py como función JS (string JSON ↔ string JSON). */
export function pyFunction<A extends unknown[] = [string]>(
  pyodide: PyodideInterface,
  name: string,
): (...args: A) => string {
  return pyodide.globals.get(name) as unknown as (...args: A) => string;
}

/**
 * Payloads armados a mano por los tests de S1–S4 (no son tests de la liga): una
 * liga chica, k=2 y AUC por defecto (lo que H1 asumía). Lo explícito del payload
 * manda sobre estos valores. S6: la tarea es obligatoria en el contrato (P1); lo
 * que H1 asumía era clasificación binaria.
 */
export function withLeague<T extends object>(
  payload: T,
  roster: readonly string[] = ["logistic", "forest", "hgb"],
): T & {
  task: string;
  roster: readonly string[];
  cv_k: number;
  primary_metric: string;
} {
  return {
    task: "binaria",
    primary_metric: "auc",
    roster,
    cv_k: 2,
    ...payload,
  };
}
