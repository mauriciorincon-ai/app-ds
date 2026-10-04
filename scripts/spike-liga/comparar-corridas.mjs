// ¿La carga (o el navegador, o la versión del runtime) cambia los RESULTADOS, o solo los tiempos?
// Compara, por dataset, TODAS las corridas de varios archivos resultados-<etiqueta>.json (la primera
// de cada celda y sus repeticiones) quitando los campos de tiempo, memoria y carga.
// Uso: node scripts/spike-liga/comparar-corridas.mjs <dir> <etiqueta1> <etiqueta2> [...]
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [dir, ...tags] = process.argv.slice(2);
if (!dir || tags.length < 2) {
  console.error("uso: comparar-corridas.mjs <dir> <etiqueta1> <etiqueta2> [...]");
  process.exit(2);
}
// Lo que describe la corrida y no su resultado.
const META = new Set([
  "id", "rows", "wallMs", "heapMB", "load", "reps", "wallMsRuns", "resRuns",
  "attempt", "attemptTag", "conCarga",
]);
const TIMING = /(_s|_ms|Ms|seconds|secs|wall|heap|load|when|time)$/i;
const strip = (o) => JSON.stringify(o, (k, v) => (TIMING.test(k) ? undefined : v));
const runsOf = (d) =>
  [Object.fromEntries(Object.entries(d).filter(([k]) => !META.has(k))), ...(d.resRuns ?? [])].map(strip);

const files = tags
  .map((t) => join(dir, `resultados-${t}.json`))
  .filter(existsSync)
  .map((f) => JSON.parse(readFileSync(f, "utf8")));
const ids = [...new Set(files.flatMap((r) => r.datasets.map((d) => d.id)))];
let same = 0;
let total = 0;
const differ = [];
for (const id of ids) {
  const all = files.flatMap((r) => {
    const d = r.datasets.find((x) => x.id === id);
    return d && !d.error ? runsOf(d) : [];
  });
  total += all.length;
  if (all.length > 1 && all.every((x) => x === all[0])) same += 1;
  else differ.push(`${id} (${all.length} corridas, ${new Set(all).size} resultados distintos)`);
}
console.log(
  `${same} de ${ids.length} datasets con el MISMO resultado en todas sus corridas (${total} corridas en ${files.length} archivos: ${tags.join(", ")}).` +
    (differ.length ? ` Distintos o con una sola corrida: ${differ.join("; ")}.` : ""),
);
process.exit(differ.length ? 1 : 0);
