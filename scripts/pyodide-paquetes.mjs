// Fuente ÚNICA de qué paquetes de Pyodide carga la app (la leen copy-pyodide.mjs, que los
// self-hostea, y verificar-peso-pyodide.mjs, que vigila cuánto pesan). El runner del worker
// (public/pyodide-runner.js) los carga con loadPackage; un test unit coteja esa lista con esta.
//
// S5 (La liga honesta): + xgboost y lightgbm, wheels del propio lockfile de Pyodide 314.0.2
// (verificados en el runtime real por la planeadora: cargan, entrenan y sobreviven al pickle).
export const REQUIRED = ["pandas", "scikit-learn", "xgboost", "lightgbm"];

// Paquetes cuyo cierre DECLARADO en el lock no se sigue: el runner los carga por la URL de su
// wheel (`loadPackage(url)` no resuelve dependencias). xgboost 2.1.4 declara `setuptools`
// (→ `pyparsing`) en el lock de Pyodide 314.0.2, pero su wheel no los importa en ninguna parte:
// verificado en el runtime real (S5 F0, 2026-10-02) — sin ellos entrena, sobrevive al pickle y
// `setuptools`/`pyparsing` no aparecen en sys.modules. Ahorra 0,84 MiB a cada usuario y deja el
// crecimiento del S5 dentro de la DoD (≤ 2 MB). El test de integración del runtime lo vigila: si
// una versión futura de xgboost los necesitara, el import fallaría ahí, no en el navegador.
export const LOAD_WITHOUT_DEPS = ["xgboost"];

// Archivos del runtime core que el navegador descarga siempre (el resto del paquete npm
// — .d.ts, mapas, consolas HTML — se copia pero nadie lo pide).
export const CORE_FILES = [
  "pyodide.asm.mjs",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
  "pyodide.mjs",
  "pyodide-lock.json",
];

export function normalize(name) {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

// Cierre de dependencias: los file_name de todas las wheels necesarias para `required`.
export function resolveWheels(lock, required = REQUIRED) {
  const index = new Map();
  for (const key of Object.keys(lock.packages)) {
    index.set(normalize(key), lock.packages[key]);
  }
  const needed = new Map();
  const stack = required.map(normalize);
  while (stack.length > 0) {
    const name = stack.pop();
    if (needed.has(name)) continue;
    const pkg = index.get(name);
    if (!pkg) throw new Error(`[pyodide] paquete no encontrado en el lock: ${name}`);
    needed.set(name, pkg.file_name);
    if (LOAD_WITHOUT_DEPS.includes(name)) continue; // se carga por URL: su cierre declarado no viaja
    for (const dep of pkg.depends ?? []) stack.push(normalize(dep));
  }
  return [...needed.values()];
}
