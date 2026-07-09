// Self-host de los assets de Pyodide: los copia desde node_modules a
// public/pyodide/ para servirlos del mismo origen (sin depender de CDN en
// runtime, CSP simple del tipo `'self'`). Se ejecuta en "prebuild" y "predev".
// public/pyodide/ está gitignored (se regenera en cada build).
//
// Copia el runtime core + las wheels de pandas + scikit-learn y sus
// dependencias (cierre resuelto desde pyodide-lock.json). Las wheels ya
// cacheadas en node_modules se copian; las que falten (CI fresco) se descargan
// del CDN de Pyodide. Decisión registrada en el ADR del motor de cómputo.
import { cp, mkdir, readFile, writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dest = resolve(root, "public", "pyodide");

// Paquetes que la app carga en el worker; sus dependencias se resuelven solas.
const REQUIRED = ["pandas", "scikit-learn"];

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function normalize(name) {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

// Cierre de dependencias: los file_name de todas las wheels necesarias.
function resolveWheels(lock) {
  const index = new Map();
  for (const key of Object.keys(lock.packages)) {
    index.set(normalize(key), lock.packages[key]);
  }
  const needed = new Map();
  const stack = REQUIRED.map(normalize);
  while (stack.length > 0) {
    const name = stack.pop();
    if (needed.has(name)) continue;
    const pkg = index.get(name);
    if (!pkg) throw new Error(`[copy-pyodide] paquete no encontrado en el lock: ${name}`);
    needed.set(name, pkg.file_name);
    for (const dep of pkg.depends ?? []) stack.push(normalize(dep));
  }
  return [...needed.values()];
}

async function main() {
  let pyodideDir;
  try {
    pyodideDir = dirname(require.resolve("pyodide/package.json"));
  } catch {
    console.warn("[copy-pyodide] paquete 'pyodide' no instalado — omito copia.");
    return;
  }

  const version = require("pyodide/package.json").version;
  await mkdir(dest, { recursive: true });

  // Runtime core (wasm, loader, stdlib, lock, tipos) — copia todo el paquete;
  // trae también las wheels que el loader de Node haya cacheado.
  await cp(pyodideDir, dest, { recursive: true });

  const lock = JSON.parse(await readFile(join(pyodideDir, "pyodide-lock.json"), "utf8"));
  const wheels = resolveWheels(lock);

  let downloaded = 0;
  for (const file of wheels) {
    const target = join(dest, file);
    if (await exists(target)) continue;
    const url = `https://cdn.jsdelivr.net/pyodide/v${version}/full/${file}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`[copy-pyodide] fallo al descargar ${file}: ${response.status}`);
    await writeFile(target, Buffer.from(await response.arrayBuffer()));
    downloaded += 1;
  }

  // El worker fetchea el pipeline anti-fuga desde /pyodide/pipeline.py
  // (fuente única en src/lib/ds/pipeline.py, también leída por el test de integración).
  await cp(resolve(root, "src", "lib", "ds", "pipeline.py"), join(dest, "pipeline.py"));

  console.log(
    `[copy-pyodide] listo en ${dest} — ${wheels.length} wheels (${downloaded} descargadas del CDN) + pipeline.py.`,
  );
}

main().catch((error) => {
  console.error("[copy-pyodide] falló:", error);
  process.exit(1);
});
