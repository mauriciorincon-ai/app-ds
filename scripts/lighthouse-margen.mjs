#!/usr/bin/env node
// Kit v1.37.0 (planlang S2, ADR-011): dos cosas que `lhci assert` no dice.
// (1) MARGEN: una URL cuya mediana queda a menos del 10 % de su presupuesto da rojos sin cambios (Lighthouse sobre
//     localhost es bimodal: ~1,96 s o ~2,65 s con los mismos bytes). Se AVISA (exit 0) con la cifra, para que el
//     ajuste sea una decisión y no una sorpresa en el commit de cierre.
// (2) PRESUPUESTO POR URL MEDIDA: toda URL de lighthouse-urls.json debe caer bajo UN `path` de perf-budget.json;
//     una URL medida sin presupuesto es un gate que no vigila nada, y una que cae bajo varios recibe todos los límites
//     (LHCI los aplica todos: el `/*` del S13 le exigía a /protocolo el límite de `/`) (exit 1). Ver scripts/lhci-rutas.mjs.
// Uso: node scripts/lighthouse-margen.mjs [dir-lhr=.lighthouseci] [umbral=0.10]
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { coincide, revisarPresupuestos } from "./lhci-rutas.mjs";

const dir = process.argv[2] ?? ".lighthouseci";
const umbral = Number(process.argv[3] ?? "0.10");
const urls = JSON.parse(readFileSync("lighthouse-urls.json", "utf8"));
const budgets = JSON.parse(readFileSync("perf-budget.json", "utf8"));

let fallo = false;
for (const p of revisarPresupuestos(budgets, urls)) {
  fallo = true;
  console.error(
    p.tipo === "sin-presupuesto"
      ? `✗ lighthouse-margen: la URL medida ${p.url} no cae bajo ningún path de perf-budget.json`
      : `✗ lighthouse-margen: la URL medida ${p.url} cae bajo ${p.paths.length} paths de perf-budget.json (${p.paths.join(", ")}); LHCI le aplica todos: deja uno`,
  );
}
if (fallo) process.exit(1);

if (!existsSync(dir)) { console.log(`lighthouse-margen: sin ${dir}; nada que leer (¿corrió lhci collect?)`); process.exit(0); }
const lhrs = readdirSync(dir).filter((f) => /^lhr-.*\.json$/.test(f)).map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
const porUrl = new Map();
for (const r of lhrs) {
  const ruta = new URL(r.requestedUrl ?? r.finalUrl).pathname;
  if (!porUrl.has(ruta)) porUrl.set(ruta, []);
  porUrl.get(ruta).push(r);
}
const mediana = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
let avisos = 0;
for (const [ruta, corridas] of porUrl) {
  const b = budgets.find((x) => coincide(x.path, ruta));
  if (!b) continue;
  for (const t of b.timings ?? []) {
    const vals = corridas.map((r) => r.audits?.[t.metric]?.numericValue).filter((v) => typeof v === "number");
    if (!vals.length) continue;
    const med = mediana(vals);
    const margen = (t.budget - med) / t.budget;
    if (margen >= 0 && margen < umbral) {
      avisos++;
      console.log(`⚠ lighthouse-margen: ${ruta} · ${t.metric} mediana ${Math.round(med)} vs presupuesto ${t.budget} (margen ${(margen * 100).toFixed(1)} % < ${umbral * 100} %): un rojo sin cambios es cuestión de tiempo — decide el margen por ADR o baja el modo alto`);
    }
  }
}
console.log(avisos ? `lighthouse-margen: ${avisos} aviso(s)` : `✓ lighthouse-margen: ninguna mediana a menos del ${umbral * 100} % de su presupuesto; ${urls.length} URL con presupuesto`);
