// Corredor del spike EN EL NAVEGADOR REAL (S5 F0): Playwright abre la app servida (`pnpm start`,
// build de producción) y crea un module worker que carga Pyodide desde /pyodide/ EXACTAMENTE como
// el runner (PACKAGES + PACKAGES_WITHOUT_DEPS por URL), ejecuta el pipeline.py real y luego
// spike.py sobre los payloads armados por prepareRun. Mide en Chromium (referencia) y WebKit
// (motor de Safari/iPhone). Uso:
//   SPIKE_OUT=<dir> node scripts/spike-liga/correr.mjs chromium|webkit [ids,separados,por,coma]
//   SPIKE_PY=scripts/spike-regresion/spike.py SPIKE_OUT=<dir> node scripts/spike-liga/correr.mjs chromium   (S6)
// S7 (molde del spike de costos, kit v1.38.0):
//   SPIKE_REPS=3 → cada celda se corre N veces (la tabla usa la mediana; un payload puede fijar `reps`).
//   La CARGA de la máquina (os.loadavg) se registra antes y después de cada dataset y del lote.
//   SPIKE_OPTS='{"k_max":12}' → opciones extra para run_spike (agrupar).
//   SPIKE_PYODIDE_DIR=<dir> → Pyodide servido desde una carpeta local (p. ej. otra versión del
//   runtime sacada con `npm pack`), sin tocar public/pyodide/; SPIKE_TAG nombra la salida.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, loadavg } from "node:os";
import { extname, join } from "node:path";
import { chromium, webkit } from "@playwright/test";

const BASE = process.env.SPIKE_BASE ?? "http://localhost:3000";
const out = process.env.SPIKE_OUT ?? "/tmp/spike-liga";
const browserName = process.argv[2] ?? "chromium";
const onlyIds = process.argv[3]?.split(",");
// SPIKE_VARIANTS=1 mide las variantes de spike_variants() en vez del roster (salida aparte).
const variants = process.env.SPIKE_VARIANTS === "1";
const tag =
  process.env.SPIKE_TAG ?? (variants ? `${browserName}-variantes` : browserName);
const REPS = Number(process.env.SPIKE_REPS ?? 1);
const EXTRA_OPTS = JSON.parse(process.env.SPIKE_OPTS ?? "{}");
const PYODIDE_DIR = process.env.SPIKE_PYODIDE_DIR;
/** Carga de la máquina: load average de 1 minuto y el umbral del molde (núcleos / 2). */
const machineLoad = () => ({
  load1: Number(loadavg()[0].toFixed(2)),
  threshold: cpus().length / 2,
});
const payloads = JSON.parse(
  readFileSync(join(out, "payloads.json"), "utf8"),
).filter((p) => !onlyIds || onlyIds.includes(p.id));
// S6: SPIKE_PY apunta a otro spike (p. ej. scripts/spike-regresion/spike.py) con el mismo corredor.
const spikePy = readFileSync(
  process.env.SPIKE_PY ?? new URL("./spike.py", import.meta.url),
  "utf8",
);

// Código del worker (module worker desde un Blob). Repite la carga del runner a propósito.
const WORKER = `
let py;
async function boot(base, full) {
  const t0 = performance.now();
  const { loadPyodide } = await import(base + "pyodide.mjs");
  py = await loadPyodide({ indexURL: base });
  const tRuntime = performance.now();
  await py.loadPackage(full ? ["pandas", "scikit-learn", "lightgbm"] : ["pandas", "scikit-learn"]);
  if (full) {
    const lock = await (await fetch(base + "pyodide-lock.json")).json();
    await py.loadPackage(base + lock.packages.xgboost.file_name);
  }
  const tPackages = performance.now();
  // S7: la versión que se CARGÓ (no la carpeta de origen), para comparar runtimes sin deducirla.
  const versions = JSON.parse(py.runPython("import json, numpy, sklearn; json.dumps({'numpy': numpy.__version__, 'sklearn': sklearn.__version__})"));
  return { runtimeMs: Math.round(tRuntime - t0), packagesMs: Math.round(tPackages - tRuntime), totalMs: Math.round(tPackages - t0),
           pyodideVersion: py.version, ...versions, loaded: Object.keys(py.loadedPackages).sort() };
}
const heapMB = () => Math.round(py._module.HEAP8.buffer.byteLength / 1048576);
self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === "boot") return self.postMessage({ ok: true, ...(await boot(m.base, m.full)) });
    if (m.type === "load-code") {
      py.runPython(await (await fetch(m.base + "pipeline.py")).text());
      py.runPython(m.spike);
      return self.postMessage({ ok: true, heapMB: heapMB() });
    }
    if (m.type === "spike") {
      const t = performance.now();
      const res = JSON.parse(py.globals.get("run_spike")(m.payload, m.options));
      return self.postMessage({ ok: true, wallMs: Math.round(performance.now() - t), heapMB: heapMB(), res });
    }
  } catch (err) { self.postMessage({ ok: false, error: String(err && err.message || err).slice(0, 300) }); }
};`;

const launcher = browserName === "webkit" ? webkit : chromium;
const browser = await launcher.launch();

// La app sirve CSP `worker-src 'self'`, que (bien) bloquea workers desde Blob. El arnés NO toca
// la CSP del producto: Playwright intercepta una página y un script de worker del MISMO origen
// (nunca llegan al servidor ni existen en public/), así el worker importa /pyodide/ igual que el
// runner. Lección del primer intento: sin onerror ni timeout, un worker bloqueado colgó el spike
// 10 minutos en silencio — aquí todo mensaje tiene tiempo límite y todo error se reporta.
const SPIKE_PAGE = `${BASE}/__spike-liga.html`;
const SPIKE_WORKER = `${BASE}/__spike-liga-worker.js`;
const ASK_TIMEOUT_MS = Number(process.env.SPIKE_TIMEOUT_MS ?? 900_000);

async function freshWorkerPage() {
  const context = await browser.newContext(); // contexto nuevo = caché HTTP en frío
  await context.route(SPIKE_PAGE, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>spike</title>",
    }),
  );
  await context.route(SPIKE_WORKER, (route) =>
    route.fulfill({ contentType: "text/javascript", body: WORKER }),
  );
  if (PYODIDE_DIR) {
    const TYPES = {
      ".mjs": "text/javascript",
      ".js": "text/javascript",
      ".wasm": "application/wasm",
      ".json": "application/json",
      ".py": "text/plain",
    };
    await context.route(`${BASE}/__pyodide-alt/**`, (route) => {
      const file = join(
        PYODIDE_DIR,
        new URL(route.request().url()).pathname.replace("/__pyodide-alt/", ""),
      );
      if (!existsSync(file)) return route.fulfill({ status: 404, body: "" });
      return route.fulfill({
        contentType: TYPES[extname(file)] ?? "application/octet-stream",
        body: readFileSync(file),
      });
    });
  }
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error")
      console.log(`[${browserName}] consola: ${m.text()}`);
  });
  await page.goto(SPIKE_PAGE);
  await page.evaluate(
    ({ url, timeoutMs }) => {
      window.__w = new Worker(url, { type: "module" });
      window.__ask = (msg) =>
        new Promise((resolve) => {
          const timer = setTimeout(
            () => resolve({ ok: false, error: `timeout ${timeoutMs} ms` }),
            timeoutMs,
          );
          window.__w.onmessage = (e) => {
            clearTimeout(timer);
            resolve(e.data);
          };
          window.__w.onerror = (e) => {
            clearTimeout(timer);
            resolve({
              ok: false,
              error: `worker onerror: ${e.message || "sin mensaje"}`,
            });
          };
          window.__w.postMessage(msg);
        });
    },
    { url: SPIKE_WORKER, timeoutMs: ASK_TIMEOUT_MS },
  );
  const ask = async (msg) => {
    const r = await page.evaluate((m) => window.__ask(m), msg);
    if (!r.ok) console.log(`[${browserName}] ✗ ${msg.type}: ${r.error}`);
    return r;
  };
  return { context, page, ask };
}

const pyBase = PYODIDE_DIR ? `${BASE}/__pyodide-alt/` : `${BASE}/pyodide/`;
const result = {
  browser: browserName,
  version: browser.version(),
  when: new Date().toISOString(),
  pyodide: PYODIDE_DIR ?? "public/pyodide",
  machine: { before: machineLoad() },
  load: {},
  datasets: [],
};

// 1) Costo de carga del runtime, en frío: antes (pandas + sklearn) y después (+ boosters).
for (const full of [false, true]) {
  const w = await freshWorkerPage();
  const r = await w.ask({ type: "boot", base: pyBase, full });
  result.load[full ? "con_boosters" : "sin_boosters"] = r;
  console.log(
    `[${browserName}] carga ${full ? "CON" : "SIN"} boosters:`,
    JSON.stringify(r),
  );
  await w.context.close();
}

// 2) La liga sobre cada dataset (un worker, runtime completo).
const w = await freshWorkerPage();
const booted = await w.ask({ type: "boot", base: pyBase, full: true });
if (!booted.ok) process.exit(1);
const loaded = await w.ask({ type: "load-code", base: pyBase, spike: spikePy });
if (!loaded.ok) process.exit(1);
console.log(
  `[${browserName}] pipeline.py + spike.py cargados · heap ${loaded.heapMB} MB`,
);
for (const p of payloads) {
  const ks = p.rows >= 20_000 ? [5, 3] : [5];
  const reps = p.reps ?? REPS;
  const before = machineLoad();
  const runs = [];
  let failed = null;
  for (let rep = 0; rep < reps; rep++) {
    const r = await w.ask({
      type: "spike",
      payload: JSON.stringify(p.payload),
      options: JSON.stringify({ ks, variants, ...EXTRA_OPTS }),
    });
    if (!r.ok) {
      failed = r.error;
      break;
    }
    runs.push({ wallMs: r.wallMs, heapMB: r.heapMB, res: r.res });
  }
  const after = machineLoad();
  if (failed !== null) {
    console.log(`[${browserName}] ${p.id}: ERROR ${failed}`);
    result.datasets.push({ id: p.id, error: failed, load: { before, after } });
    // Un worker que murió (p. ej. sin memoria) no sirve para el resto: se levanta otro.
    if (/timeout|onerror|memory|abort/i.test(String(failed))) {
      await w.context.close();
      Object.assign(w, await freshWorkerPage());
      if (!(await w.ask({ type: "boot", base: pyBase, full: true })).ok) process.exit(1);
      if (!(await w.ask({ type: "load-code", base: pyBase, spike: spikePy })).ok) process.exit(1);
    }
    continue;
  }
  const r = runs[0];
  result.datasets.push({
    id: p.id,
    rows: p.rows,
    wallMs: r.wallMs,
    heapMB: r.heapMB,
    load: { before, after },
    reps: runs.length,
    wallMsRuns: runs.map((x) => x.wallMs),
    resRuns: runs.slice(1).map((x) => x.res),
    ...r.res,
  });
  console.log(
    `[${browserName}] ${p.id}: ${runs.map((x) => (x.wallMs / 1000).toFixed(1)).join(" / ")} s · heap ${r.heapMB} MB · carga ${before.load1} → ${after.load1}${r.res.winner ? ` · ganador ${r.res.winner}` : ""}`,
  );
  writeFileSync(
    join(out, `resultados-${tag}.json`),
    JSON.stringify(result, null, 2),
  );
}
await w.context.close();
await browser.close();
result.machine.after = machineLoad();
writeFileSync(
  join(out, `resultados-${tag}.json`),
  JSON.stringify(result, null, 2),
);
console.log(`[${browserName}] listo → ${join(out, `resultados-${tag}.json`)}`);
