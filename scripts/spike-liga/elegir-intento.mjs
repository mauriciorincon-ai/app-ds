// Molde del spike de costos (kit v1.38.0, K-S6-3): si un dataset corrió con carga, el lote se
// repite. Este script arma, por dataset, la corrida que usan las tablas a partir de VARIOS intentos
// con una regla fijada ANTES de mirar los tiempos: el intento MÁS RECIENTE con la carga antes y
// después ≤ el umbral; si ninguno quedó bajo el umbral, el de menor carga máxima, marcado
// `conCarga: true`. Nunca el más rápido. Cada dataset lleva el intento del que viene.
// Uso: node scripts/spike-liga/elegir-intento.mjs <dir> <salida> <intento1> <intento2> [...]
//   (etiquetas en orden cronológico; lee y escribe <dir>/resultados-<etiqueta>.json)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [dir, outTag, ...tags] = process.argv.slice(2);
if (!dir || !outTag || tags.length < 2) {
  console.error("uso: elegir-intento.mjs <dir> <salida> <intento1> <intento2> [...]");
  process.exit(2);
}
const read = (t) => JSON.parse(readFileSync(join(dir, `resultados-${t}.json`), "utf8"));
const attempts = tags.map((tag, i) => ({ n: i + 1, tag, r: read(tag) }));

/** Carga máxima (antes, después) de un dataset y si quedó bajo el umbral. */
const loadOf = (d) => {
  const b = d.load?.before;
  const a = d.load?.after;
  if (!b || !a) return { max: Infinity, clean: false };
  const max = Math.max(b.load1, a.load1);
  return { max, clean: b.load1 <= b.threshold && a.load1 <= a.threshold };
};

const ids = [...new Set(attempts.flatMap((a) => a.r.datasets.map((d) => d.id)))];
const datasets = [];
const report = [];
for (const id of ids) {
  const cands = attempts
    .map((a) => ({ a, d: a.r.datasets.find((x) => x.id === id) }))
    .filter((c) => c.d && !c.d.error);
  const clean = cands.filter((c) => loadOf(c.d).clean);
  const pick = clean.length
    ? clean[clean.length - 1]
    : cands.reduce((b, c) => (loadOf(c.d).max < loadOf(b.d).max ? c : b), cands[0]);
  const conCarga = !clean.length;
  datasets.push({ ...pick.d, attempt: pick.a.n, attemptTag: pick.a.tag, conCarga });
  report.push(
    `${id}: intento ${pick.a.n}${conCarga ? " (CON CARGA: ningún intento bajo el umbral)" : ""} · carga ${pick.d.load?.before?.load1} → ${pick.d.load?.after?.load1} · limpios en ${clean.map((c) => c.a.n).join(", ") || "ninguno"}`,
  );
}
const first = attempts[0].r;
const merged = {
  ...first,
  when: attempts[attempts.length - 1].r.when,
  attempts: attempts.map((a) => ({ n: a.n, tag: a.tag, when: a.r.when, machine: a.r.machine })),
  datasets,
};
writeFileSync(join(dir, `resultados-${outTag}.json`), JSON.stringify(merged, null, 1));
console.log(report.join("\n"));
