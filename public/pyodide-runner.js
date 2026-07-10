// Runner de Pyodide — module worker autónomo (servido desde public/, NO pasa por
// el bundler, así que es un module worker de verdad: Pyodide carga su runtime ESM
// sin el error "classic web workers are not supported"). Solo entrena y devuelve
// métricas; la orquestación pura (split/veredicto/fuga) vive en el hilo principal.
//
// Mensajes:  in  { id, payload }
//            out { id, type: "progress"|"result"|"error", ... }

let runExperiment = null;

async function ensureRuntime(post, id) {
  if (runExperiment) return runExperiment;

  const base = new URL("/pyodide/", self.location.origin).href;
  post({ id, type: "progress", stage: "loading-runtime" });
  const { loadPyodide } = await import(`${base}pyodide.mjs`);
  const pyodide = await loadPyodide({ indexURL: base });

  post({ id, type: "progress", stage: "loading-packages" });
  await pyodide.loadPackage(["pandas", "scikit-learn"]);

  const source = await (await fetch(`${base}pipeline.py`)).text();
  pyodide.runPython(source);
  runExperiment = pyodide.globals.get("run_experiment");
  return runExperiment;
}

self.onmessage = async (event) => {
  const { id, payload } = event.data;
  const post = (message) => self.postMessage(message);
  try {
    const run = await ensureRuntime(post, id);
    post({ id, type: "progress", stage: "training" });
    const result = JSON.parse(run(JSON.stringify(payload)));
    post({ id, type: "result", result });
  } catch (error) {
    post({
      id,
      type: "error",
      message: error && error.message ? error.message : String(error),
    });
  }
};
