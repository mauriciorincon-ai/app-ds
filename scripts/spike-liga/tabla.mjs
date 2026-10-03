// Arma la tabla de costos del spike (S5 F0) a partir de resultados-<navegador>.json y propone los
// coeficientes del modelo de costos: t_cv5(modelo) ≈ t0 + a · (n_train/1000)^b · (ancho/33)^c,
// ajustado en log-log con los sintéticos (mismo ancho a 2.000 / 5.000 / 20.000 filas → b; el
// ANCHO a 2.000 filas → c). Uso: SPIKE_OUT=<dir> node scripts/spike-liga/tabla.mjs > salida.md
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const out = process.env.SPIKE_OUT ?? "/tmp/spike-liga";
const load = (b) => {
  const f = join(out, `resultados-${b}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
};
const browsers = ["chromium", "webkit"].map(load).filter(Boolean);
const ref = browsers[0];
const MEMBERS = Object.keys(ref.datasets.find((d) => d.members).members);

// Roster PROPUESTO para la F1: el MLP pasa a early_stopping (medido aparte con SPIKE_VARIANTS=1:
// converge siempre y cuesta ~8× menos). La simulación de niveles, el modelo de costos y el
// antes/después «propuesto» usan este roster; las tablas crudas de arriba quedan como se midieron.
const variantes = load(`${ref.browser}-variantes`);
const prop = JSON.parse(JSON.stringify(ref));
if (variantes) {
  for (const d of prop.datasets) {
    const v = variantes.datasets.find((x) => x.id === d.id)?.members
      ?.mlp_early_stopping;
    if (d.members && v) d.members.mlp = v;
  }
}
const PRIORIDAD = [
  "logistic",
  "logistic_balanced",
  "ridge",
  "naive_bayes",
  "linear_svc",
  "decision_tree",
  "knn",
  "hgb",
  "lightgbm",
  "xgboost",
  "extra_trees",
  "forest",
  "forest_balanced",
  "mlp",
];
// Regla de un error estándar (ESL §7.10): entre los que quedan a < 1 EE del mejor, el más simple.
function oneSe(d, k = 5) {
  const m = d.members;
  const ok = PRIORIDAD.filter(
    (n) => m[n]?.[`cv${k}_mean`] != null && !m[n].error,
  );
  const best = ok.reduce(
    (a, n) => (m[n][`cv${k}_mean`] > m[a][`cv${k}_mean`] ? n : a),
    ok[0],
  );
  const thr = m[best][`cv${k}_mean`] - m[best][`cv${k}_std`] / Math.sqrt(k);
  return {
    best,
    pick: ok.find((n) => m[n][`cv${k}_mean`] >= thr),
    se: m[best][`cv${k}_std`] / Math.sqrt(k),
  };
}
const s = (x, d = 1) => (x == null ? "—" : Number(x).toFixed(d));
const lines = [];
const p = (l = "") => lines.push(l);

for (const r of browsers) {
  p(
    `### ${r.browser} ${r.version} — carga del runtime en frío (localhost, ${r.when.slice(0, 10)})`,
  );
  p();
  p("| Paquetes | Runtime (ms) | Paquetes (ms) | Total (ms) |");
  p("| --- | ---: | ---: | ---: |");
  for (const [k, v] of Object.entries(r.load)) {
    p(
      `| ${k.replace("_", " ")} | ${v.runtimeMs} | ${v.packagesMs} | ${v.totalMs} |`,
    );
  }
  p();
  p(
    `### ${r.browser} — la liga completa por dataset (${MEMBERS.length} modelos, CV k=5 + fit en train + test de todos + explicabilidad del ganador)`,
  );
  p();
  p(
    "| Dataset | Filas | Train | Ancho tras one-hot | Métrica | Liga completa (s) | Σ CV k=5 (s) | Σ fit+test (s) | Explicabilidad (s) | Heap (MB) |",
  );
  p("| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |");
  for (const d of r.datasets) {
    if (!d.members) {
      p(`| ${d.id} | — | — | — | — | ERROR ${d.error} | | | | |`);
      continue;
    }
    const m = Object.values(d.members);
    const cv = m.reduce((a, x) => a + (x.cv5_s ?? 0), 0);
    const ft = m.reduce((a, x) => a + (x.fit_s ?? 0) + (x.test_s ?? 0), 0);
    p(
      `| ${d.id} | ${d.rows} | ${d.n_train} | ${d.width} | ${d.metric} | ${s(d.wallMs / 1000)} | ${s(cv)} | ${s(ft)} | ${s(d.s5?.explain_s, 2)} | ${d.heapMB} |`,
    );
  }
  p();
  p(
    `### ${r.browser} — costo por modelo: CV k=5 (s) · ⚠ = aviso de no-convergencia · ✗ = error`,
  );
  p();
  const ds = r.datasets.filter((d) => d.members);
  p(`| Modelo | ${ds.map((d) => d.id).join(" | ")} |`);
  p(`| --- | ${ds.map(() => "---:").join(" | ")} |`);
  for (const name of MEMBERS) {
    const cells = ds.map((d) => {
      const x = d.members[name];
      if (!x) return "—";
      const mark = x.error ? ` ✗${x.error}` : x.convergence_warning ? " ⚠" : "";
      const k3 = x.cv3_s != null ? ` (k=3: ${s(x.cv3_s)})` : "";
      return `${s(x.cv5_s, 2)}${k3}${mark}`;
    });
    p(`| ${name} | ${cells.join(" | ")} |`);
  }
  p();
  p(
    `### ${r.browser} — puntaje por modelo: CV k=5 media (test entre paréntesis — «no sirve para elegir»)`,
  );
  p();
  p(`| Modelo | ${ds.map((d) => d.id).join(" | ")} |`);
  p(`| --- | ${ds.map(() => "---:").join(" | ")} |`);
  for (const name of MEMBERS) {
    const cells = ds.map((d) => {
      const x = d.members[name];
      if (!x || x.cv5_mean == null) return "—";
      const win = d.s5?.winner === name ? "★ " : "";
      return `${win}${s(x.cv5_mean, 3)} (${s(x.test, 3)})`;
    });
    p(`| ${name} | ${cells.join(" | ")} |`);
  }
  p();
}

// Antes/después H1 → S5 (referencia: primer navegador).
p(
  `### Antes / después — H1 (argmax sobre TEST entre forest y hgb) frente a S5 (argmax sobre CV entre ${MEMBERS.length})`,
);
p();
const verdictOf = (t, bb) =>
  t - bb > 0.01 ? "beats" : t - bb < -0.01 ? "loses" : "ties";
p(
  "| Dataset | Mejor baseline (test) | H1: ganador · test · veredicto | S5 máximo de CV: ganador · CV · test · veredicto | S5 PROPUESTO (1 EE + MLP early stopping): ganador · test · veredicto |",
);
p("| --- | ---: | --- | --- | --- |");
for (const d of ref.datasets.filter((x) => x.members)) {
  const bb = Math.max(...Object.values(d.baselines));
  const dp = prop.datasets.find((x) => x.id === d.id);
  const { pick, se } = oneSe(dp);
  const t = dp.members[pick].test;
  p(
    `| ${d.id} | ${s(bb, 3)} | ${d.h1?.winner} · ${s(d.h1?.test, 3)} · ${d.h1?.verdict} | ${d.s5?.winner} · ${s(d.s5?.cv, 3)} · ${s(d.s5?.test, 3)} · ${d.s5?.verdict} | ${pick} · ${s(t, 3)} · ${verdictOf(t, bb)} (EE ${s(se, 3)}) |`,
  );
}
p();

// Ajuste del modelo de costos (referencia).
const synth = prop.datasets.filter(
  (d) => d.members && /^sintetico-/.test(d.id),
);
const wide = prop.datasets.find((d) => d.id === "ancho-2000");
const narrow = prop.datasets.find((d) => d.id === "sintetico-2000");
const small = prop.datasets.filter((d) => d.members && d.rows <= 200);
p(
  "### Modelo de costos propuesto (para `engine/costos.ts`, roster propuesto): t_cv5 ≈ t0 + a · (n_train/1000)^b · (ancho/33)^c",
);
p();
p(
  "| Modelo | t0 (s) | a (s) | b (filas) | c (ancho) | error máx. en los sintéticos |",
);
p("| --- | ---: | ---: | ---: | ---: | ---: |");
const coef = {};
for (const name of MEMBERS) {
  const t0 = Math.min(...small.map((d) => d.members[name]?.cv5_s ?? Infinity));
  const pts = synth
    .map((d) => [d.n_train / 1000, d.members[name]?.cv5_s])
    .filter(([, t]) => t != null && t > t0);
  if (pts.length < 2) {
    p(`| ${name} | ${s(t0, 3)} | — | — | — | puntos insuficientes |`);
    continue;
  }
  const X = pts.map(([n]) => Math.log(n));
  const Y = pts.map(([, t]) => Math.log(t - t0));
  const mx = X.reduce((a, b) => a + b) / X.length;
  const my = Y.reduce((a, b) => a + b) / Y.length;
  const b =
    X.reduce((acc, x, i) => acc + (x - mx) * (Y[i] - my), 0) /
    X.reduce((acc, x) => acc + (x - mx) ** 2, 0);
  const a = Math.exp(my - b * mx);
  let c = 0;
  if (wide?.members[name]?.cv5_s && narrow?.members[name]?.cv5_s) {
    const ratio =
      (wide.members[name].cv5_s - t0) /
      Math.max(narrow.members[name].cv5_s - t0, 1e-3);
    c = Math.log(Math.max(ratio, 1e-3)) / Math.log(wide.width / narrow.width);
  }
  const err = Math.max(
    ...synth.map((d) => {
      const pred = t0 + a * (d.n_train / 1000) ** b * (d.width / 33) ** c;
      return Math.abs(pred - d.members[name].cv5_s) / d.members[name].cv5_s;
    }),
  );
  coef[name] = {
    t0: +t0.toFixed(3),
    a: +a.toFixed(4),
    b: +b.toFixed(3),
    c: +c.toFixed(3),
  };
  p(
    `| ${name} | ${s(t0, 3)} | ${s(a, 4)} | ${s(b, 2)} | ${s(c, 2)} | ${s(err * 100, 0)} % |`,
  );
}
p();
p("```json");
p(JSON.stringify(coef, null, 1));
p("```");
// Simulación del reparto por techo (D3: entra al Nivel 1, en orden de prioridad, todo lo que
// quepa en el techo; el resto al Nivel 2, que re-corre la unión — D5). Costo por modelo =
// CV k=5 + fit + test medidos. La explicabilidad del ganador va APARTE (depende de quién gane,
// que no se sabe antes de entrenar: ≈ 10 repeticiones × variables × predicción en test).
p(
  "### Simulación: ¿quién entra al Nivel 1 según el techo? (roster propuesto, costos medidos en " +
    ref.browser +
    ")",
);
p();
p(
  "| Dataset | Techo | Nivel 1 (modelos · s) | Queda para el Nivel 2 | Nivel 2 = unión (s) | Explicabilidad del ganador S5 (s) |",
);
p("| --- | ---: | --- | --- | ---: | ---: |");
for (const d of prop.datasets.filter((x) => x.members)) {
  const cost = (n) => {
    const x = d.members[n];
    return (x.cv5_s ?? 0) + (x.fit_s ?? 0) + (x.test_s ?? 0);
  };
  const all = PRIORIDAD.filter((n) => d.members[n]);
  const totalAll = all.reduce((a, n) => a + cost(n), 0);
  for (const techo of [5, 10, 20]) {
    let used = 0;
    const n1 = [];
    const n2 = [];
    for (const n of all) {
      if (used + cost(n) <= techo) {
        n1.push(n);
        used += cost(n);
      } else n2.push(n);
    }
    p(
      `| ${d.id} | ${techo} s | ${n1.length} · ${s(used)} | ${n2.length ? n2.join(", ") : "— (la liga completa cabe)"} | ${n2.length ? s(totalAll) : "—"} | ${s(d.s5?.explain_s, 2)} (${d.s5?.winner}) |`,
    );
  }
}
p();
console.log(lines.join("\n"));
