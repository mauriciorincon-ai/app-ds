// Arma las tablas del spike de AGRUPAR (S7 F0) a partir de resultados-<etiqueta>.json y deja lo
// que el STOP decide:
// 1. por dataset, preprocesamiento y agrupador: el k elegido (silueta / BIC / densidad), su
//    puntaje (silueta × (1 − ruido)), la referencia nula, el gap, la estabilidad (ARI) y el costo;
// 2. el k que elegiría cada criterio (silueta, gap, BIC) frente a la verdad plantada;
// 3. las reglas de lectura candidatas («los grupos existen / son frágiles / no hay estructura»)
//    contra la verdad de cada dataset (plantados: existen; ruido y uniformes: no hay estructura);
// 4. el ganador entre agrupadores por puntaje y por gap;
// 5. costos: ajuste por k, estabilidad, el linkage de Agglomerative y las sondas de memoria.
// Uso: SPIKE_OUT=<dir> node scripts/spike-agrupar/tabla.mjs [etiqueta=chromium] > tablas.md
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const out = process.env.SPIKE_OUT ?? "/tmp/spike-agrupar";
const tags = (process.argv[2] ?? "chromium").split(",");
const runs = tags
  .map((t) => join(out, `resultados-${t}.json`))
  .filter(existsSync)
  .map((f) => JSON.parse(readFileSync(f, "utf8")));
const ref = runs[0];

// La verdad de cada dataset (lo que la lectura debería decir).
const TRUTH = {
  "segmentos-300": { k: 3, structure: true },
  "nubes-2000-k4": { k: 4, structure: true },
  "nubes-5000-k4": { k: 4, structure: true },
  "nubes-20000-k4": { k: 4, structure: true },
  "sin-grupos-300": { structure: false },
  "uniforme-500-1d": { structure: false },
  "uniforme-500-2d": { structure: false },
  "uniforme-2000-4d": { structure: false },
};
const ALGOS = ["kmeans", "agglomerative", "gmm", "hdbscan"];
const s = (x, d = 3) => (x == null ? "—" : Number(x).toFixed(d));
const med = (xs) => {
  const v = xs.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const lines = [];
const p = (l = "") => lines.push(l);
const variantsOf = (d) => Object.entries(d.variants ?? {});
const gapOf = (c) => (c?.score != null && c?.null_score != null ? c.score - c.null_score : null);

// 0) Condiciones del molde.
for (const r of runs) {
  p(`### ${r.browser} ${r.version} · Pyodide ${r.pyodide} — condiciones (${r.when.slice(0, 16)})`);
  p();
  p(`Carga del lote (load average de 1 min; umbral ${r.machine?.before?.threshold}): antes ${r.machine?.before?.load1} → después ${r.machine?.after?.load1}.`);
  p();
  p("| Dataset | Filas | Corridas (s) | Mediana (s) | Carga antes → después |");
  p("| --- | ---: | --- | ---: | --- |");
  for (const d of r.datasets) {
    const w = (d.wallMsRuns ?? (d.wallMs != null ? [d.wallMs] : [])).map((x) => x / 1000);
    const over = d.load && (d.load.before.load1 > d.load.before.threshold || d.load.after.load1 > d.load.after.threshold);
    p(`| ${d.id} | ${d.rows ?? ""} | ${d.error ? `ERROR ${d.error}` : w.map((x) => x.toFixed(1)).join(" / ")} | ${s(med(w), 1)} | ${d.load?.before?.load1} → ${d.load?.after?.load1}${over ? " ⚠ sobre el umbral" : ""} |`);
  }
  p();
}

// 1) Por dataset · preprocesamiento · agrupador.
p(`### ${ref.browser} — agrupadores por dataset y preprocesamiento («completo» = numéricas + one-hot; «numericas» = solo numéricas)`);
p();
p("| Dataset | Prepro. | Agrupador | k (criterio) | silueta | ruido | puntaje | nulo | gap | ARI media / mín (R=10) | ARI media / mín (R=5) | ajuste total (s) | estabilidad (s) |");
p("| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: |");
for (const d of ref.datasets) {
  for (const [v, e] of variantsOf(d)) {
    for (const a of ALGOS) {
      const x = e.algos?.[a];
      if (!x || (!x.chosen && !x.error)) continue;
      if (x.error) {
        p(`| ${d.id} | ${v} | ${a} | ✗ ${x.error} | | | | | | | | | |`);
        continue;
      }
      const c = x.chosen;
      const crit = a === "gmm" ? "BIC" : a === "hdbscan" ? `mcs ${c.min_cluster_size}` : "silueta";
      const fit = a === "hdbscan" ? c.fit_s : a === "agglomerative" ? x.linkage_s : (x.per_k ?? []).reduce((t, r) => t + (r.fit_s ?? 0), 0);
      const st = x.stability;
      p(`| ${d.id} | ${v} | ${a} | ${c.k} (${crit}) | ${s(c.silhouette ?? c.silhouette_non_noise)} | ${s(c.noise_share)} | ${s(c.score)} | ${s(c.null_score)} | ${s(gapOf(c))} | ${st ? `${st.mean} / ${st.min}` : "—"} | ${st ? `${st.mean_first5} / ${st.min_first5}` : "—"} | ${s(fit, 2)} | ${s(st?.seconds, 2)} |`);
    }
  }
}
p();

// 2) El k de cada criterio frente a la verdad.
p("### El k que elige cada criterio (★ = coincide con los grupos plantados)");
p();
p("| Dataset | Prepro. | K-Means silueta | K-Means gap | Agglom. silueta | Agglom. gap | GMM BIC | GMM silueta | GMM gap | HDBSCAN |");
p("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
const argmax = (rows, f) => rows?.reduce((b, r) => (r[f] != null && (b == null || r[f] > b[f]) ? r : b), null)?.k;
for (const d of ref.datasets) {
  const t = TRUTH[d.id]?.k;
  const mark = (k) => (k == null ? "—" : `${k}${t && k === t ? " ★" : ""}`);
  for (const [v, e] of variantsOf(d)) {
    const A = e.algos ?? {};
    if (!A.kmeans) continue;
    p(`| ${d.id} | ${v} | ${mark(argmax(A.kmeans.per_k, "silhouette"))} | ${mark(argmax(A.kmeans.per_k, "gap"))} | ${mark(argmax(A.agglomerative?.per_k, "silhouette"))} | ${mark(argmax(A.agglomerative?.per_k, "gap"))} | ${mark(A.gmm?.chosen?.k)} | ${mark(argmax(A.gmm?.per_k, "silhouette"))} | ${mark(argmax(A.gmm?.per_k, "gap"))} | ${mark(A.hdbscan?.chosen?.k)} |`);
  }
}
p();

// 3) Reglas de lectura candidatas contra la verdad (sobre el agrupador GANADOR por gap).
const winnerByGap = (e) =>
  ALGOS.map((a) => [a, e.algos?.[a]?.chosen])
    .filter(([, c]) => c && gapOf(c) != null)
    .reduce((b, x) => (b == null || gapOf(x[1]) > gapOf(b[1]) ? x : b), null);
const winnerByScore = (e) =>
  ALGOS.map((a) => [a, e.algos?.[a]?.chosen])
    .filter(([, c]) => c?.score != null)
    .reduce((b, x) => (b == null || x[1].score > b[1].score ? x : b), null);
const rules = [
  ["silueta ≥ 0,25 y ARI ≥ 0,8 (sin referencia nula)", (c, st) => c.score >= 0.25 && st >= 0.8, "score"],
  ...[0.05, 0.1, 0.15].flatMap((g) => [0.6, 0.7, 0.8].map((a) => [`gap ≥ ${g} y ARI ≥ ${a}`, (c, st) => gapOf(c) >= g && st >= a, "gap"])),
];
p("### Reglas de lectura candidatas contra la verdad («existen» con grupos plantados; «no hay estructura» con ruido y uniformes)");
p();
p(`| Regla | Prepro. | ${Object.keys(TRUTH).join(" | ")} | aciertos |`);
p(`| --- | --- | ${Object.keys(TRUTH).map(() => ":---:").join(" | ")} | ---: |`);
for (const v of ["completo", "numericas"]) {
  for (const [label, fn, by] of rules) {
    let hits = 0;
    let n = 0;
    const cells = Object.keys(TRUTH).map((id) => {
      const d = ref.datasets.find((x) => x.id === id);
      const e = d?.variants?.[v] ?? (v === "numericas" ? d?.variants?.completo : null);
      if (!e) return "—";
      const w = by === "gap" ? winnerByGap(e) : winnerByScore(e);
      if (!w) return "—";
      const st = e.algos[w[0]].stability?.mean ?? 0;
      const says = fn(w[1], st);
      n += 1;
      const ok = says === TRUTH[id].structure;
      if (ok) hits += 1;
      return `${says ? "existen" : "no hay"} ${ok ? "✓" : "✗"}`;
    });
    p(`| ${label} | ${v} | ${cells.join(" | ")} | ${hits} de ${n} |`);
  }
}
p();

// 4) Ganador entre agrupadores.
p("### El ganador entre agrupadores: por puntaje y por gap");
p();
p("| Dataset | Prepro. | Por puntaje | Por gap |");
p("| --- | --- | --- | --- |");
for (const d of ref.datasets) {
  for (const [v, e] of variantsOf(d)) {
    const a = winnerByScore(e);
    const b = winnerByGap(e);
    if (!a && !b) continue;
    p(`| ${d.id} | ${v} | ${a ? `${a[0]} k=${a[1].k} (${s(a[1].score)})` : "—"} | ${b ? `${b[0]} k=${b[1].k} (gap ${s(gapOf(b[1]))})` : "—"} |`);
  }
}
p();

// 5) Costos de Agglomerative y sondas de memoria.
p("### Agglomerative: el linkage (O(n²)) y las sondas de tamaño");
p();
p("| Dataset | Filas | linkage (s) | resultado |");
p("| --- | ---: | ---: | --- |");
for (const d of ref.datasets) {
  for (const [, e] of variantsOf(d).slice(0, 1)) {
    const x = e.algos?.agglomerative;
    if (!x) continue;
    p(`| ${d.id} | ${d.n ?? d.rows} | ${s(x.linkage_s, 2)} | ${x.error ? `✗ ${x.error}` : x.skipped ?? "cabe"} |`);
  }
  if (d.error) p(`| ${d.id} | ${d.rows ?? ""} | — | ✗ ${d.error} |`);
}
p();

// 6) HDBSCAN por min_cluster_size.
p("### HDBSCAN según min_cluster_size (prepro. «numericas» si existe)");
p();
p("| Dataset | mcs | k | ruido | silueta sin ruido | puntaje | ajuste (s) |");
p("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
for (const d of ref.datasets) {
  const e = d.variants?.numericas ?? d.variants?.completo;
  for (const r of e?.algos?.hdbscan?.per_mcs ?? [])
    p(`| ${d.id} | ${r.min_cluster_size} | ${r.k} | ${s(r.noise_share)} | ${s(r.silhouette_non_noise)} | ${s(r.score)} | ${s(r.fit_s, 3)} |`);
}
p();

// 7) k en 2..10 y tres maneras de elegir el ganador, con la lectura «gap ≥ 0,10 y ARI ≥ 0,7» sobre él.
//    - puntaje: el de mayor silueta × (1 − ruido) (P11 del plan);
//    - gap: el de mayor puntaje − nulo;
//    - consenso: el k en el que coinciden más agrupadores (empate → el k cuyo mejor miembro tiene más
//      puntaje); gana el de mayor puntaje entre los que eligieron ese k. Sin parámetro nuevo.
// K-Means y Agglomerative re-eligen k por silueta y GMM por BIC DENTRO de 2..10; HDBSCAN no usa k.
const K_MAX = 10;
const pickK = (a, x) => {
  if (a === "hdbscan") return x.chosen?.k > 0 ? { ...x.chosen } : null;
  const rows = (x.per_k ?? []).filter((r) => r.k <= K_MAX);
  if (!rows.length) return null;
  const best =
    a === "gmm"
      ? rows.reduce((b, r) => (r.bic != null && (b == null || r.bic < b.bic) ? r : b), null)
      : rows.reduce((b, r) => (r.silhouette != null && (b == null || r.silhouette > b.silhouette) ? r : b), null);
  if (!best) return null;
  const st = best.k === x.chosen?.k ? x.stability : null;
  return { ...best, score: best.silhouette, null_score: best.null_score ?? best.null, stability: st };
};
const gap7 = (c) => (c?.gap != null ? c.gap : gapOf(c));
const read7 = (c, st) => {
  const g = gap7(c);
  if (g == null) return "—";
  if (g < 0.1) return "no hay";
  if (st == null) return "ARI no medido";
  return st >= 0.7 ? "existen" : "frágiles";
};
p(`### k en 2..${K_MAX}: el ganador por puntaje, por gap y por consenso, y la lectura «gap ≥ 0,10 y ARI ≥ 0,7» sobre cada uno`);
p();
p("| Dataset | Prepro. | k por agrupador (KM · AG · GMM · HDB) | Por puntaje | Por gap | Por consenso | Verdad |");
p("| --- | --- | --- | --- | --- | --- | --- |");
for (const d of ref.datasets) {
  for (const [v, e] of variantsOf(d)) {
    const cands = ALGOS.map((a) => [a, e.algos?.[a] ? pickK(a, e.algos[a]) : null]).filter(([, c]) => c);
    if (!cands.length) continue;
    const stOf = (a, c) => (a === "hdbscan" ? e.algos[a].stability?.mean : c.stability?.mean);
    const fmtW = ([a, c]) => `${a} k=${c.k} · ${read7(c, stOf(a, c))}`;
    const byScore = cands.reduce((b, x) => (b == null || (x[1].score ?? -1) > (b[1].score ?? -1) ? x : b), null);
    const byGap = cands.filter(([, c]) => gap7(c) != null).reduce((b, x) => (b == null || gap7(x[1]) > gap7(b[1]) ? x : b), null);
    const votes = new Map();
    for (const [a, c] of cands) votes.set(c.k, [...(votes.get(c.k) ?? []), [a, c]]);
    const groups = [...votes.entries()].map(([k, xs]) => ({ k, xs, best: xs.reduce((b, x) => ((x[1].score ?? -1) > (b[1].score ?? -1) ? x : b)) }));
    groups.sort((g1, g2) => g2.xs.length - g1.xs.length || (g2.best[1].score ?? -1) - (g1.best[1].score ?? -1));
    const cons = groups[0];
    const ks = ALGOS.map((a) => cands.find(([x]) => x === a)?.[1]?.k ?? "—").join(" · ");
    const t = TRUTH[d.id];
    p(`| ${d.id} | ${v} | ${ks} | ${fmtW(byScore)} | ${byGap ? fmtW(byGap) : "—"} | ${fmtW(cons.best)} (${cons.xs.length} de ${cands.length}) | ${t ? (t.structure ? `k=${t.k}` : "sin estructura") : "—"} |`);
  }
}
p();
console.log(lines.join("\n"));
