// Self-host de los assets de Pyodide: los copia desde node_modules a
// public/pyodide/ para servirlos del mismo origen (sin depender de CDN, CSP
// simple). Se ejecuta en "prebuild" y "predev". public/pyodide/ está gitignored.
//
// Fase 0: el paquete `pyodide` aún NO está instalado — el script es un no-op
// guardado para no romper el build. En la Fase 1 (spike) se instala `pyodide`
// y el ADR del motor de cómputo define QUÉ wheels curar (pandas + scikit-learn
// y sus transitivas) para respetar el límite de tamaño de Vercel.
import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dest = resolve(root, "public", "pyodide");

async function main() {
  let pyodideDir;
  try {
    pyodideDir = dirname(require.resolve("pyodide/package.json"));
  } catch {
    console.warn("[copy-pyodide] paquete 'pyodide' no instalado — omito copia (Fase 0).");
    return;
  }

  await mkdir(dest, { recursive: true });
  await cp(pyodideDir, dest, { recursive: true });
  console.log(`[copy-pyodide] assets copiados a ${dest}`);
}

main().catch((error) => {
  console.error("[copy-pyodide] falló:", error);
  process.exit(1);
});
