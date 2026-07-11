// Runner de Pyodide — module worker autónomo (servido desde public/, NO pasa por
// el bundler, así que es un module worker de verdad: Pyodide carga su runtime ESM
// sin el error "classic web workers are not supported"). Solo cómputo pesado:
// entrenar, puntuar, exportar e importar el modelo; la orquestación pura
// (split/veredicto/fuga/esquema/manifiesto) vive en el hilo principal.
//
// Mensajes:  in  { id, type: "train"|"score"|"export-model"|"import-model", payload? }
//            out { id, type: "progress"|"result"|"error", ... }  (result lleva command)
//
// El estado Python (_MODEL en pipeline.py) vive lo que viva este worker: tras
// entrenar o importar, score/export operan sin re-entrenar.

let runtimePromise = null;

// Etapa de progreso que se anuncia antes de ejecutar cada comando.
const STAGE = {
  train: "training",
  score: "scoring",
  "export-model": "exporting",
  "import-model": "importing",
};

function ensureRuntime(post, id) {
  // Se cachea la PROMESA (no el resultado): mensajes encolados durante la
  // carga comparten un único Pyodide en vez de doble-cargarlo.
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const base = new URL("/pyodide/", self.location.origin).href;
      post({ id, type: "progress", stage: "loading-runtime" });
      const { loadPyodide } = await import(`${base}pyodide.mjs`);
      const pyodide = await loadPyodide({ indexURL: base });

      post({ id, type: "progress", stage: "loading-packages" });
      await pyodide.loadPackage(["pandas", "scikit-learn"]);

      const source = await (await fetch(`${base}pipeline.py`)).text();
      pyodide.runPython(source);
      return {
        train: pyodide.globals.get("run_experiment"),
        score: pyodide.globals.get("score_new_data"),
        "export-model": pyodide.globals.get("export_model"),
        "import-model": pyodide.globals.get("import_model"),
      };
    })();
    // Si la carga falla (red), se limpia para que un reintento re-cargue.
    runtimePromise.catch(() => {
      runtimePromise = null;
    });
  }
  return runtimePromise;
}

self.onmessage = async (event) => {
  const { id, type, payload } = event.data;
  const post = (message) => self.postMessage(message);
  try {
    const commands = await ensureRuntime(post, id);
    const run = commands[type];
    if (!run) throw new Error(`unknown-command:${type}`);
    post({ id, type: "progress", stage: STAGE[type] });
    // Interop uniforme: toda función Python recibe y devuelve string JSON.
    const result = JSON.parse(run(JSON.stringify(payload ?? {})));
    post({ id, type: "result", command: type, result });
  } catch (error) {
    post({
      id,
      type: "error",
      message: error && error.message ? error.message : String(error),
    });
  }
};
