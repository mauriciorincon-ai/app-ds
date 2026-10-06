// Arma las tablas del spike MULTICLASE (S7 F0) a partir de resultados-<etiqueta>.json y deja lo
// que el STOP decide:
// 1. costos por miembro (mediana de las repeticiones) y el modelo t_cv5 ≈ t0 + a·(n/1000)^b·
//    (ancho/33)^c·(K/5)^d — la forma del S5/S6 más el factor de K;
// 2. la regla de un error estándar con f1_macro y con exactitud balanceada: quién elige cada
//    una, y cuánto cambia el ganador entre particiones (semillas 42–46 de `planes-200`);
// 3. el veredicto contra el mejor baseline con tolerancia absoluta 0,01 / 0,02 / 0,05;
// 4. la fuga POR CLASE: el máximo de cada medida en columnas legítimas (por soporte) frente a la
//    plantada, las falsas alarmas por azar de cada medida categórica (simulación) y la
//    probabilidad EXACTA de que |AUC − ½| ≥ 0,48 por azar según el soporte (Mann-Whitney sin
//    empates, por la función generadora del estadístico U);
// 5. quién entra al Nivel 1 con el techo de 5 s.
// Uso: SPIKE_OUT=<dir> node scripts/spike-multiclase/tabla.mjs [etiqueta=chromium] > tablas.md
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const out = process.env.SPIKE_OUT ?? "/tmp/spike-multiclase";
const load = (tag) => {
  const f = join(out, `resultados-${tag}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
};
const tags = (process.argv[2] ?? "chromium,webkit").split(",");
const runs = tags.map(load).filter(Boolean);
const ref = runs[0];
const DS = ref.datasets.filter((d) => d.members);

// Prioridad de la liga binaria (engine/roster.ts MEMBER_IDS): desempate de 1 EE y orden de llenado.
const PRIORIDAD = [
  "logistic", "logistic_balanced", "ridge", "naive_bayes", "linear_svc", "decision_tree", "knn",
  "hgb", "lightgbm", "xgboost", "extra_trees", "forest", "forest_balanced", "mlp",
];
const PLANTED = { "planes-fuga-200": "cargo_corporativo_usd" };
const CEILING_S = 5;
const MLP_MIN_ROWS = 500;

const s = (x, d = 2) => (x == null ? "—" : Number(x).toFixed(d));
const med = (xs) => {
  const v = xs.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const lines = [];
const p = (l = "") => lines.push(l);
/** Todas las corridas de un dataset (la primera y las repeticiones). */
const allRes = (d) => [d, ...(d.resRuns ?? [])];
/** Mediana de un campo de tiempo de un miembro sobre las repeticiones. */
const medTime = (d, name, field) => med(allRes(d).map((r) => r.members?.[name]?.[field]));

/** Regla de un error estándar (mayor es mejor) con el campo de CV dado. */
function oneSe(d, field, k) {
  const m = d.members;
  const ok = PRIORIDAD.filter((n) => m[n]?.[`cv${k}_${field}_mean`] != null && !m[n].error);
  if (!ok.length) return null;
  const best = ok.reduce((a, n) => (m[n][`cv${k}_${field}_mean`] > m[a][`cv${k}_${field}_mean`] ? n : a), ok[0]);
  const se = m[best][`cv${k}_${field}_std`] / Math.sqrt(k);
  const thr = m[best][`cv${k}_${field}_mean`] - se;
  return { best, pick: ok.find((n) => m[n][`cv${k}_${field}_mean`] >= thr), se };
}

// 0) Condiciones del molde: carga de la máquina por lote y por dataset.
for (const r of runs) {
  p(`### ${r.browser} ${r.version} · Pyodide ${r.pyodide} — condiciones (${r.when.slice(0, 16)})`);
  p();
  p(`Carga del lote (load average de 1 min; umbral ${r.machine?.before?.threshold}): antes ${r.machine?.before?.load1} → después ${r.machine?.after?.load1}.`);
  p();
  p("| Paquetes | Runtime (ms) | Paquetes (ms) | Total (ms) |");
  p("| --- | ---: | ---: | ---: |");
  for (const [k, v] of Object.entries(r.load)) p(`| ${k.replace("_", " ")} | ${v.runtimeMs} | ${v.packagesMs} | ${v.totalMs} |`);
  p();
  p("| Dataset | Filas | K | Train | Ancho | Corridas (s) | Mediana (s) | Carga antes → después |");
  p("| --- | ---: | ---: | ---: | ---: | --- | ---: | --- |");
  for (const d of r.datasets) {
    if (!d.members) {
      p(`| ${d.id} | | | | | ERROR ${d.error} | | ${d.load?.before?.load1} → ${d.load?.after?.load1} |`);
      continue;
    }
    const w = (d.wallMsRuns ?? [d.wallMs]).map((x) => x / 1000);
    const over = d.load && (d.load.before.load1 > d.load.before.threshold || d.load.after.load1 > d.load.after.threshold);
    p(`| ${d.id} | ${d.rows} | ${d.K} | ${d.n_train} | ${d.width} | ${w.map((x) => x.toFixed(1)).join(" / ")} | ${s(med(w), 1)} | ${d.load?.before?.load1} → ${d.load?.after?.load1}${over ? " ⚠ sobre el umbral" : ""} |`);
  }
  p();
}

// 1) Costo por miembro (CV k=5, mediana de las repeticiones) en la referencia.
p(`### ${ref.browser} — costo por miembro: CV k=5 (s, mediana) · ⚠ no-convergencia · ✗ error`);
p();
p(`| Miembro | ${DS.map((d) => d.id).join(" | ")} |`);
p(`| --- | ${DS.map(() => "---:").join(" | ")} |`);
for (const name of PRIORIDAD) {
  const cells = DS.map((d) => {
    const x = d.members[name];
    if (!x) return "—";
    const mark = x.error ? ` ✗${x.error}` : x.convergence_warning ? " ⚠" : "";
    const k3 = x.cv3_s != null ? ` (k=3: ${s(medTime(d, name, "cv3_s"))})` : "";
    return `${s(medTime(d, name, "cv5_s"))}${k3}${mark}`;
  });
  p(`| ${name} | ${cells.join(" | ")} |`);
}
p();

// 2) Regla de 1 EE con cada métrica + baselines + veredicto.
p("### La regla de un error estándar con f1_macro y con exactitud balanceada (CV k=5 dentro de train)");
p();
p("| Dataset | K | ★ máx f1 | ◆ 1 EE f1 | ◆ 1 EE exact. bal. | ¿mismo? | f1 prueba ◆ | mayoritaria | logística | Δ vs mejor baseline | tol 0,01 | tol 0,02 | tol 0,05 |");
p("| --- | ---: | --- | --- | --- | :---: | ---: | ---: | ---: | ---: | --- | --- | --- |");
const verdict = (delta, tol) => (delta > tol ? "supera" : delta < -tol ? "NO supera" : "empata");
for (const d of DS) {
  const k = d.ks?.[0] ?? 5;
  const f = oneSe(d, "f1", k);
  const b = oneSe(d, "bal", k);
  if (!f) continue;
  const test = d.members[f.pick]?.test?.f1_macro;
  const maj = d.baselines.majority?.test?.f1_macro;
  const log = d.baselines.logistic?.test?.f1_macro;
  const delta = test - Math.max(maj, log);
  p(`| ${d.id} | ${d.K} | ${f.best} | ${f.pick} | ${b?.pick} | ${f.pick === b?.pick ? "✓" : "✗"} | ${s(test, 3)} | ${s(maj, 3)} | ${s(log, 3)} | ${s(delta, 3)} | ${verdict(delta, 0.01)} | ${verdict(delta, 0.02)} | ${verdict(delta, 0.05)} |`);
}
p();
// La misma vara con la exactitud balanceada como primaria: su elegido, su prueba y su veredicto.
p("**Con la exactitud balanceada como primaria** (el elegido por 1 EE con esa métrica, su prueba y el veredicto contra el mejor baseline en esa métrica; «¿mismo veredicto?» lo compara con el de f1_macro a tolerancia 0,01):");
p();
p("| Dataset | ◆ 1 EE exact. bal. | exact. bal. prueba ◆ | mayoritaria (= 1/K) | logística | Δ | tol 0,01 | tol 0,02 | tol 0,05 | ¿mismo veredicto? |");
p("| --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- | :---: |");
for (const d of DS) {
  const k = d.ks?.[0] ?? 5;
  const f = oneSe(d, "f1", k);
  const b = oneSe(d, "bal", k);
  if (!b || !f) continue;
  const test = d.members[b.pick]?.test?.balanced_accuracy;
  const maj = d.baselines.majority?.test?.balanced_accuracy;
  const log = d.baselines.logistic?.test?.balanced_accuracy;
  const delta = test - Math.max(maj, log);
  const fDelta = d.members[f.pick].test.f1_macro - Math.max(d.baselines.majority.test.f1_macro, d.baselines.logistic.test.f1_macro);
  p(`| ${d.id} | ${b.pick} | ${s(test, 3)} | ${s(maj, 3)} | ${s(log, 3)} | ${s(delta, 3)} | ${verdict(delta, 0.01)} | ${verdict(delta, 0.02)} | ${verdict(delta, 0.05)} | ${verdict(delta, 0.01) === verdict(fDelta, 0.01) ? "✓" : "✗"} |`);
}
p();
const seeds = DS.filter((d) => /^planes-200(-s\d+)?$/.test(d.id));
if (seeds.length > 1) {
  const pf = seeds.map((d) => oneSe(d, "f1", 5)?.pick);
  const pb = seeds.map((d) => oneSe(d, "bal", 5)?.pick);
  const count = (xs) => Object.entries(xs.reduce((a, x) => ({ ...a, [x]: (a[x] ?? 0) + 1 }), {})).map(([k, v]) => `${k} ×${v}`).join(", ");
  p(`**Estabilidad del ganador entre ${seeds.length} particiones de \`planes-200\` (semillas ${seeds.map((d) => d.id.match(/s(\d+)$/)?.[1] ?? "42").join(", ")}):** con f1_macro → ${count(pf)}; con exactitud balanceada → ${count(pb)}.`);
  p();
}

// 3) Convergencia del MLP.
p("### MLP con parada temprana: convergencia");
p();
p("| Dataset | Filas | iteraciones / máx | aviso | f1 CV | f1 prueba |");
p("| --- | ---: | --- | :---: | ---: | ---: |");
for (const d of DS) {
  const x = d.members.mlp;
  if (!x) continue;
  p(`| ${d.id} | ${d.rows} | ${x.n_iter ?? "—"} / ${x.max_iter ?? "—"} | ${x.convergence_warning ? "⚠" : "—"} | ${s(x.cv5_f1_mean, 3)} | ${s(x.test?.f1_macro, 3)} |`);
}
p();

// 4) Fuga por clase.
const measures = [
  ["auc", "numérica · AUC uno-contra-resto"],
  ["purity", "categórica · pureza cruda (la fórmula binaria de hoy)"],
  ["purity_norm", "categórica · pureza normalizada"],
  ["auc_rate", "categórica · AUC de la tasa por categoría"],
];
p("### Fuga por clase sobre train: el máximo de cada medida en columnas LEGÍTIMAS, por soporte mín(clase, resto)");
p();
p(`| Medida | soporte < 5 | 5–9 | 10–19 | ≥ 20 | ≥ 0,98 en legítimas | plantada (${Object.values(PLANTED).join(", ")}) |`);
p("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
const bucket = (m) => (m < 5 ? 0 : m < 10 ? 1 : m < 20 ? 2 : 3);
for (const [key, label] of measures) {
  const maxes = [null, null, null, null];
  let alarms = 0;
  let total = 0;
  let planted = null;
  for (const d of DS) {
    for (const e of d.leak ?? []) {
      if (e[key] == null) continue;
      const support = Math.min(e.n_c, e.n_rest);
      if (PLANTED[d.id] === e.column) {
        planted = Math.max(planted ?? 0, e[key]);
        continue;
      }
      const b = bucket(support);
      maxes[b] = Math.max(maxes[b] ?? -Infinity, e[key]);
      total += 1;
      if (e[key] >= 0.98) alarms += 1;
    }
  }
  p(`| ${label} | ${maxes.map((x) => s(x, 3)).join(" | ")} | ${alarms} de ${total} | ${s(planted, 3)} |`);
}
p();
const legitAlarms = [];
for (const d of DS)
  for (const e of d.leak ?? [])
    for (const [key] of measures)
      if (e[key] != null && e[key] >= 0.98 && PLANTED[d.id] !== e.column)
        legitAlarms.push(`${d.id} · ${e.column} → ${e.class} (${key} ${e[key]}, soporte ${Math.min(e.n_c, e.n_rest)})`);
if (legitAlarms.length) {
  p("**Falsas alarmas en columnas legítimas (≥ 0,98):**");
  p();
  for (const a of legitAlarms.slice(0, 30)) p(`- ${a}`);
  if (legitAlarms.length > 30) p(`- … y ${legitAlarms.length - 30} más`);
  p();
}
const nullSim = DS.find((d) => d.null_categorical)?.null_categorical;
if (nullSim) {
  p("### Falsas alarmas POR AZAR de cada medida categórica (simulación: categoría y clase sorteadas sin relación; fracción de sorteos ≥ 0,98)");
  p();
  p("| Filas de train | Cuota de la clase | Categorías | Sorteos | Pureza cruda | Pureza normalizada | AUC de la tasa |");
  p("| ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const c of nullSim) p(`| ${c.n} | ${(c.share * 100).toFixed(0)} % | ${c.categories} | ${c.sims} | ${(c.purity * 100).toFixed(1)} % | ${(c.purity_norm * 100).toFixed(1)} % | ${(c.auc_rate * 100).toFixed(1)} % |`);
  p();
}

// Probabilidad EXACTA de |AUC − ½| ≥ 0,48 por azar, sin empates: el estadístico U de
// Mann-Whitney con n1 y n0 tiene por función generadora el coeficiente q-binomial
// [n1+n0 choose n1]_q (Gauss). Se arma con BigInt y se divide al final.
function uDistribution(n1, n0) {
  // Producto ∏_{i=1..n1} (1 − q^{n0+i}) / (1 − q^i), como polinomio en q.
  let poly = [1n];
  for (let i = 1; i <= n1; i++) {
    const mul = new Array(poly.length + n0 + i).fill(0n);
    for (let j = 0; j < poly.length; j++) {
      mul[j] += poly[j];
      mul[j + n0 + i] -= poly[j];
    }
    // Dividir por (1 − q^i): suma acumulada con paso i.
    for (let j = i; j < mul.length; j++) mul[j] += mul[j - i];
    poly = mul.slice(0, n1 * n0 + 1);
  }
  return poly;
}
function tail(n1, n0, thr = 0.98) {
  const f = uDistribution(n1, n0);
  const total = f.reduce((a, b) => a + b, 0n);
  const N = n1 * n0;
  let hit = 0n;
  for (let u = 0; u <= N; u++) if (u >= thr * N || u <= (1 - thr) * N) hit += f[u];
  return Number((hit * 10n ** 12n) / total) / 1e12;
}
p("### Falsa alarma EXACTA por azar de una numérica (|AUC − ½| ≥ 0,48), según el soporte de la clase más chica — el peor caso sobre el tamaño del otro lado");
p();
const others = [5, 10, 20, 50, 100, 200, 400];
p(`| Soporte m | ${others.map((o) => `otro lado ${o}`).join(" | ")} | peor caso |`);
p(`| ---: | ${others.map(() => "---:").join(" | ")} | ---: |`);
for (let m = 1; m <= 12; m++) {
  const vals = others.filter((o) => o >= m).map((o) => tail(m, o));
  const worst = Math.max(...vals);
  const cells = others.map((o) => (o >= m ? `${(tail(m, o) * 100).toFixed(3)} %` : "—"));
  p(`| ${m} | ${cells.join(" | ")} | ${(worst * 100).toFixed(3)} % |`);
}
p();

// 5) Modelo de costos con el factor de K.
const byId = Object.fromEntries(DS.map((d) => [d.id, d]));
const coef = {};
const fitLog = (xs, ys) => {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const b = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  return { b, a: Math.exp(my - b * mx) };
};
for (const name of PRIORIDAD) {
  const t0 = med(["planes-200", "planes-sin-fuga-200", "ocupantes-200", "departamento-200"].map((id) => byId[id] && medTime(byId[id], name, "cv5_s")));
  const sizes = ["sintetico-2000-k5", "sintetico-5000-k5", "sintetico-20000-k5"]
    .map((id) => [byId[id]?.n_train / 1000, byId[id] && medTime(byId[id], name, "cv5_s")])
    .filter(([n, t]) => n && t != null && t > t0);
  if (sizes.length < 2 || t0 == null) continue;
  const { a, b } = fitLog(sizes.map(([n]) => Math.log(n)), sizes.map(([, t]) => Math.log(t - t0)));
  const narrow = medTime(byId["sintetico-2000-k5"], name, "cv5_s");
  const wide = medTime(byId["ancho-2000-k5"], name, "cv5_s");
  const c = wide && narrow && wide > t0 && narrow > t0
    ? Math.log((wide - t0) / (narrow - t0)) / Math.log(byId["ancho-2000-k5"].width / byId["sintetico-2000-k5"].width) : 0;
  const ks = [["sintetico-2000-k3", 3], ["sintetico-2000-k5", 5], ["sintetico-2000-k10", 10], ["sintetico-2000-k20", 20]]
    .map(([id, K]) => [K, byId[id] && medTime(byId[id], name, "cv5_s")])
    .filter(([, t]) => t != null && t > t0);
  const dfit = ks.length >= 2 ? fitLog(ks.map(([K]) => Math.log(K / 5)), ks.map(([, t]) => Math.log(t - t0))).b : 0;
  coef[name] = { t0: +t0.toFixed(3), a: +a.toFixed(4), b: +b.toFixed(3), c: +c.toFixed(3), d: +dfit.toFixed(3) };
}
p("### Modelo de costos multiclase: t_cv5 ≈ t0 + a·(n_train/1000)^b·(ancho/33)^c·(K/5)^d (segundos, en " + ref.browser + ")");
p();
p("| Miembro | t0 | a | b | c | d (K) |");
p("| --- | ---: | ---: | ---: | ---: | ---: |");
for (const [n, c] of Object.entries(coef)) p(`| ${n} | ${c.t0} | ${c.a} | ${c.b} | ${c.c} | ${c.d} |`);
p();
p("```json");
p(JSON.stringify(coef));
p("```");
p();

// 6) Nivel 1 con el techo: miembros en orden de prioridad mientras la suma medida (CV + fit + prueba) cabe.
p(`### ¿Quién entra al Nivel 1 con el techo de ${CEILING_S} s? (tiempos medidos, en orden de prioridad; MLP fuera con < ${MLP_MIN_ROWS} filas; balanceadas fuera si minoritaria × K ≥ 0,8)`);
p();
p("| Dataset | Entran | Quedan para el Nivel 2 | Σ Nivel 1 (s) |");
p("| --- | --- | --- | ---: |");
for (const d of DS.filter((x) => !/-s\d+$/.test(x.id))) {
  const counts = Object.values(d.class_counts_train);
  const minority = Math.min(...counts) / counts.reduce((a, b) => a + b, 0);
  const balancedOut = minority * d.K >= 0.8;
  let sum = 0;
  const inn = [];
  const outL = [];
  for (const name of PRIORIDAD) {
    const x = d.members[name];
    if (!x || x.error) continue;
    if (name === "mlp" && d.rows < MLP_MIN_ROWS) continue;
    if (balancedOut && name.endsWith("_balanced")) continue;
    const t = (medTime(d, name, "cv5_s") ?? medTime(d, name, "cv3_s") ?? 0) + (medTime(d, name, "fit_s") ?? 0) + (medTime(d, name, "test_s") ?? 0);
    if (sum + t <= CEILING_S) {
      sum += t;
      inn.push(name);
    } else outL.push(name);
  }
  p(`| ${d.id} | ${inn.length}: ${inn.join(", ")} | ${outL.join(", ") || "—"} | ${s(sum, 1)} |`);
}
p();
console.log(lines.join("\n"));
