// Arma las tablas del spike de REGRESIÓN (S6 F0) a partir de resultados-<navegador>.json y
// propone: coeficientes del modelo de costos (misma forma que el S5:
// t_cv5 ≈ t0 + a · (n_train/1000)^b · (ancho/33)^c), el efecto de la regla de un error estándar
// con MAE (menor es mejor), la sensibilidad del veredicto a la tolerancia relativa, la
// comparación media/mediana como baseline, la distribución de |Spearman| y η² de columnas
// legítimas frente a la fuga plantada, y la forma del objetivo (sesgo, atípicos).
// Uso: SPIKE_OUT=<dir> node scripts/spike-regresion/tabla.mjs > salida.md
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const out = process.env.SPIKE_OUT ?? "/tmp/spike-regresion";
const load = (b) => {
  const f = join(out, `resultados-${b}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
};
const browsers = ["chromium", "webkit"].map(load).filter(Boolean);
const ref = browsers[0];
const variantes = load(`${ref.browser}-variantes`);
const DS = ref.datasets.filter((d) => d.members);

// Prioridad PROPUESTA (más simple/barato primero): desempate de la regla de 1 EE y orden de llenado.
const PRIORIDAD = [
  "linear",
  "ridge",
  "lasso",
  "decision_tree",
  "knn",
  "hgb",
  "lightgbm",
  "xgboost",
  "extra_trees",
  "forest",
  "mlp",
];
const MEMBERS = PRIORIDAD.filter((n) => DS[0].members[n]);
const PLANTED = { "precio-fuga-200": "impuesto_transferencia_usd" };

const s = (x, d = 1) => (x == null ? "—" : Number(x).toFixed(d));
const pct = (x, d = 1) => (x == null ? "—" : `${(100 * x).toFixed(d)} %`);
const lines = [];
const p = (l = "") => lines.push(l);

/** Regla de un error estándar con MAE (menor es mejor): el más simple a ≤ 1 EE del mínimo. */
function oneSe(d, k = 5) {
  const m = d.members;
  const ok = PRIORIDAD.filter((n) => m[n]?.[`cv${k}_mean`] != null && !m[n].error);
  const best = ok.reduce(
    (a, n) => (m[n][`cv${k}_mean`] < m[a][`cv${k}_mean`] ? n : a),
    ok[0],
  );
  const se = m[best][`cv${k}_std`] / Math.sqrt(k);
  const thr = m[best][`cv${k}_mean`] + se;
  return { best, pick: ok.find((n) => m[n][`cv${k}_mean`] <= thr), se };
}
/** Veredicto con tolerancia RELATIVA al MAE del mejor baseline. */
const verdict = (model, baseline, tol) => {
  const rel = (baseline - model) / baseline;
  return rel > tol ? "supera" : rel < -tol ? "NO supera" : "empata";
};

for (const r of browsers) {
  p(`### ${r.browser} ${r.version} — carga del runtime en frío (localhost, ${r.when.slice(0, 10)})`);
  p();
  p("| Paquetes | Runtime (ms) | Paquetes (ms) | Total (ms) |");
  p("| --- | ---: | ---: | ---: |");
  for (const [k, v] of Object.entries(r.load))
    p(`| ${k.replace("_", " ")} | ${v.runtimeMs} | ${v.packagesMs} | ${v.totalMs} |`);
  p();
  p(
    `### ${r.browser} — la liga de regresión por dataset (${MEMBERS.length} modelos + 3 baselines; CV k=5 + fit + test de todos + explicabilidad del ganador)`,
  );
  p();
  p(
    "| Dataset | Filas | Train | Ancho tras one-hot | Corrida completa (s) | Σ CV k=5 de la liga (s) | Σ fit+test (s) | Explicabilidad (s) | Heap (MB) |",
  );
  p("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const d of r.datasets) {
    if (!d.members) {
      p(`| ${d.id} | — | — | — | ERROR ${d.error} | | | | |`);
      continue;
    }
    const m = Object.values(d.members);
    const cv = m.reduce((a, x) => a + (x.cv5_s ?? 0), 0);
    const ft = m.reduce((a, x) => a + (x.fit_s ?? 0) + (x.test_s ?? 0), 0);
    p(
      `| ${d.id} | ${d.rows} | ${d.n_train} | ${d.width} | ${s(d.wallMs / 1000)} | ${s(cv)} | ${s(ft)} | ${s(d.explain_s, 2)} (${d.winner}) | ${d.heapMB} |`,
    );
  }
  p();
  p(`### ${r.browser} — costo por modelo: CV k=5 (s) · ⚠ = aviso de no-convergencia · ✗ = error`);
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
}

// --- Lo que sigue usa el navegador de referencia -------------------------------------------
p(
  `### MAE por modelo: CV k=5 media (MAE de prueba entre paréntesis — «no sirve para elegir») · ★ mínimo de CV · ◆ elegido por la regla de 1 EE`,
);
p();
p(`| Modelo | ${DS.map((d) => d.id).join(" | ")} |`);
p(`| --- | ${DS.map(() => "---:").join(" | ")} |`);
const picks = Object.fromEntries(DS.map((d) => [d.id, oneSe(d)]));
for (const name of MEMBERS) {
  const cells = DS.map((d) => {
    const x = d.members[name];
    if (!x || x.cv5_mean == null) return "—";
    const marks = `${picks[d.id].best === name ? "★" : ""}${picks[d.id].pick === name ? "◆" : ""}`;
    const dec = x.cv5_mean >= 1000 ? 0 : 2;
    return `${marks}${marks ? " " : ""}${s(x.cv5_mean, dec)} (${s(x.test?.mae, dec)})`;
  });
  p(`| ${name} | ${cells.join(" | ")} |`);
}
p();

p("### Regla de un error estándar con MAE (menor es mejor)");
p();
p(
  "| Dataset | Mínimo de CV | MAE CV | EE (σ/√5) | EE / MAE | Elegido por 1 EE | MAE CV del elegido | Diferencia CV | MAE de prueba: mínimo → elegido |",
);
p("| --- | --- | ---: | ---: | ---: | --- | ---: | ---: | --- |");
for (const d of DS) {
  const { best, pick, se } = picks[d.id];
  const mb = d.members[best];
  const mp = d.members[pick];
  p(
    `| ${d.id} | ${best} | ${s(mb.cv5_mean, 2)} | ${s(se, 2)} | ${pct(se / mb.cv5_mean)} | ${pick} | ${s(mp.cv5_mean, 2)} | ${pct((mp.cv5_mean - mb.cv5_mean) / mb.cv5_mean)} | ${s(mb.test.mae, 2)} → ${s(mp.test.mae, 2)} |`,
  );
}
p();

p("### Baselines en prueba (MAE; R² entre paréntesis) y la pregunta media frente a mediana");
p();
p(
  "| Dataset | Media | Mediana | Lineal | Mediana vs media | Elegido (1 EE) | R² del elegido |",
);
p("| --- | ---: | ---: | ---: | ---: | --- | ---: |");
for (const d of DS) {
  const b = d.baselines;
  const pick = d.members[picks[d.id].pick];
  p(
    `| ${d.id} | ${s(b.mean.mae, 2)} (${s(b.mean.r2, 3)}) | ${s(b.median.mae, 2)} (${s(b.median.r2, 3)}) | ${s(b.linear.mae, 2)} (${s(b.linear.r2, 3)}) | ${pct((b.median.mae - b.mean.mae) / b.mean.mae)} | ${picks[d.id].pick} · ${s(pick.test.mae, 2)} | ${s(pick.test.r2, 3)} |`,
  );
}
p();

p(
  "### Sensibilidad del veredicto a la tolerancia relativa (elegido por 1 EE contra el mejor baseline, MAE de prueba)",
);
p();
const sets = {
  "media + lineal": ["mean", "linear"],
  "mediana + lineal": ["median", "linear"],
};
p(
  `| Dataset | Mejora relativa vs media+lineal | ${["1 %", "2 %", "5 %"].map((t) => `tol ${t}`).join(" | ")} | Mejora relativa vs mediana+lineal | ¿cambia el veredicto (1 %)? |`,
);
p("| --- | ---: | --- | --- | --- | ---: | --- |");
for (const d of DS) {
  const pick = d.members[picks[d.id].pick].test.mae;
  const bb = (set) => Math.min(...set.map((n) => d.baselines[n].mae));
  const b1 = bb(sets["media + lineal"]);
  const b2 = bb(sets["mediana + lineal"]);
  p(
    `| ${d.id} | ${pct((b1 - pick) / b1)} | ${[0.01, 0.02, 0.05].map((t) => verdict(pick, b1, t)).join(" | ")} | ${pct((b2 - pick) / b2)} | ${verdict(pick, b1, 0.01) === verdict(pick, b2, 0.01) ? "no" : `**sí**: ${verdict(pick, b1, 0.01)} → ${verdict(pick, b2, 0.01)}`} |`,
  );
}
p();

p("### MLP con parada temprana y objetivo estandarizado: convergencia");
p();
p("| Dataset | Iteraciones (máx. 500) | Aviso de no-convergencia | MAE CV | MAE CV del mínimo |");
p("| --- | ---: | --- | ---: | ---: |");
for (const d of DS) {
  const m = d.members.mlp;
  p(
    `| ${d.id} | ${m.n_iter ?? "—"} | ${m.convergence_warning ? "⚠ sí" : "no"} | ${s(m.cv5_mean, 2)} | ${s(d.members[picks[d.id].best].cv5_mean, 2)} |`,
  );
}
p();
if (variantes) {
  p("### Variantes (evidencia de por qué Lasso y MLP estandarizan el objetivo)");
  p();
  const vnames = Object.keys(variantes.datasets.find((d) => d.members).members);
  p(`| Variante | ${DS.map((d) => d.id).join(" | ")} |`);
  p(`| --- | ${DS.map(() => "---:").join(" | ")} |`);
  for (const v of [...vnames, "lasso", "mlp"]) {
    const cells = DS.map((d) => {
      const vd = variantes.datasets.find((x) => x.id === d.id);
      const x = vnames.includes(v) ? vd?.members?.[v] : d.members[v];
      if (!x || x.cv5_mean == null) return x?.error ? `✗${x.error}` : "—";
      const it = x.n_iter != null ? ` · ${x.n_iter} it` : "";
      return `${s(x.cv5_mean, 2)}${x.convergence_warning ? " ⚠" : ""}${it} · ${s(x.cv5_s, 2)} s`;
    });
    p(`| ${vnames.includes(v) ? v : `${v} (roster)`} | ${cells.join(" | ")} |`);
  }
  p();
}

p("### Fuga continua: |Spearman| (numéricas) y η² (categóricas) de cada columna con el objetivo, en train");
p();
p("| Dataset | Columna | Tipo | Distintos | |Spearman| | η² | η² (soporte ≥ 5) | ¿Plantada? |");
p("| --- | --- | --- | ---: | ---: | ---: | ---: | --- |");
const legitNum = [];
const legitCat = [];
for (const d of DS) {
  const cols = Object.entries(d.columns).sort(
    (a, b) => (b[1].spearman_abs ?? b[1].eta2 ?? 0) - (a[1].spearman_abs ?? a[1].eta2 ?? 0),
  );
  for (const [name, c] of cols) {
    const planted = PLANTED[d.id] === name;
    if (!planted) {
      if (c.spearman_abs != null) legitNum.push([c.spearman_abs, `${d.id}·${name}`]);
      if (c.eta2 != null) legitCat.push([c.eta2, c.eta2_support5, `${d.id}·${name}`]);
    }
    if (!/^(x|c)\d+$/.test(name) || (c.spearman_abs ?? c.eta2 ?? 0) > 0.3)
      p(
        `| ${d.id} | ${name} | ${c.kind === "numeric" ? "num" : "cat"} | ${c.distinct} | ${s(c.spearman_abs, 3)} | ${s(c.eta2, 3)} | ${s(c.eta2_support5, 3)} | ${planted ? "**sí**" : ""} |`,
      );
  }
}
p();
const q = (arr, f) => {
  const v = [...arr].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(f * (v.length - 1)))];
};
const maxNum = legitNum.reduce((a, b) => (b[0] > a[0] ? b : a));
const maxCat = legitCat.reduce((a, b) => (b[0] > a[0] ? b : a));
p(
  `**Columnas legítimas:** |Spearman| en ${legitNum.length} numéricas → mediana ${s(q(legitNum.map((x) => x[0]), 0.5), 3)} · p95 ${s(q(legitNum.map((x) => x[0]), 0.95), 3)} · máximo ${s(maxNum[0], 3)} (${maxNum[1]}). η² en ${legitCat.length} categóricas → máximo ${s(maxCat[0], 3)} (${maxCat[2]}; con soporte ≥ 5: ${s(maxCat[1], 3)}).`,
);
for (const [id, col] of Object.entries(PLANTED)) {
  const d = DS.find((x) => x.id === id);
  if (d) p(`**Plantada:** ${id}·${col} → |Spearman| ${s(d.columns[col].spearman_abs, 4)}.`);
}
p();

p("### Forma del objetivo en train (para los avisos de EDA)");
p();
p(
  "| Dataset | Media | Mediana | Desv. | Sesgo | Fuera de 1,5·IQR | Fuera de 3·IQR | |z robusto| > 3,5 | Ceros |",
);
p("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
for (const d of DS) {
  const t = d.target_train;
  p(
    `| ${d.id} | ${s(t.mean, 1)} | ${s(t.median, 1)} | ${s(t.std, 1)} | ${s(t.skew, 2)} | ${pct(t.share_iqr15)} | ${pct(t.share_iqr3)} | ${pct(t.share_robust_z35)} | ${t.zeros} |`,
  );
}
p();

// Ajuste del modelo de costos (misma forma y procedimiento que el S5).
const synth = DS.filter((d) => /^sintetico-/.test(d.id));
const wide = DS.find((d) => d.id === "ancho-2000");
const narrow = DS.find((d) => d.id === "sintetico-2000");
const small = DS.filter((d) => d.rows <= 200);
p("### Modelo de costos propuesto (regresión): t_cv5 ≈ t0 + a · (n_train/1000)^b · (ancho/33)^c");
p();
p("| Modelo | t0 (s) | a (s) | b (filas) | c (ancho) | error máx. en los sintéticos | consumo-5000: medido → estimado (s) |");
p("| --- | ---: | ---: | ---: | ---: | ---: | --- |");
const coef = {};
const real = DS.find((d) => d.id === "consumo-5000");
for (const name of MEMBERS) {
  const t0 = Math.min(...small.map((d) => d.members[name]?.cv5_s ?? Infinity));
  const pts = synth
    .map((d) => [d.n_train / 1000, d.members[name]?.cv5_s])
    .filter(([, t]) => t != null && t > t0);
  if (pts.length < 2) {
    p(`| ${name} | ${s(t0, 3)} | — | — | — | puntos insuficientes | |`);
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
      (wide.members[name].cv5_s - t0) / Math.max(narrow.members[name].cv5_s - t0, 1e-3);
    c = Math.log(Math.max(ratio, 1e-3)) / Math.log(wide.width / narrow.width);
  }
  const predict = (d) => t0 + a * (d.n_train / 1000) ** b * (d.width / 33) ** c;
  const err = Math.max(
    ...synth.map((d) => Math.abs(predict(d) - d.members[name].cv5_s) / d.members[name].cv5_s),
  );
  coef[name] = { t0: +t0.toFixed(3), a: +a.toFixed(4), b: +b.toFixed(3), c: +c.toFixed(3) };
  p(
    `| ${name} | ${s(t0, 3)} | ${s(a, 4)} | ${s(b, 2)} | ${s(c, 2)} | ${s(err * 100, 0)} % | ${real ? `${s(real.members[name].cv5_s, 2)} → ${s(predict(real), 2)}` : "—"} |`,
  );
}
p();
p("```json");
p(JSON.stringify(coef, null, 1));
p("```");
p();
p(`### Simulación: ¿quién entra al Nivel 1 según el techo? (costos medidos en ${ref.browser})`);
p();
p("| Dataset | Techo | Nivel 1 (modelos · s) | Queda para el Nivel 2 | Liga completa (s) |");
p("| --- | ---: | --- | --- | ---: |");
for (const d of DS) {
  const cost = (n) => {
    const x = d.members[n];
    return (x.cv5_s ?? 0) + (x.fit_s ?? 0) + (x.test_s ?? 0);
  };
  const all = PRIORIDAD.filter((n) => d.members[n]);
  const totalAll = all.reduce((a, n) => a + cost(n), 0);
  for (const techo of [5, 10]) {
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
      `| ${d.id} | ${techo} s | ${n1.length} · ${s(used)} | ${n2.length ? n2.join(", ") : "— (la liga completa cabe)"} | ${s(totalAll)} |`,
    );
  }
}
p();
console.log(lines.join("\n"));
