// Tabla y ajuste del modelo de costos de AGRUPAR (S7 F2) sobre lo que midió medir.py en el
// navegador (flujo real del producto). Dos partes por agrupador, la misma forma y el mismo
// procedimiento que el S5 y el S6:
//   t ≈ t0 + a · (filas/1000)^b · (ancho/5)^c      [segundos]
// - BARRIDO: el `elapsed_ms` de su fila en el flujo entero (corre siempre);
// - LECTURA: lo que `fit_member` tarda de más (referencia nula + estabilidad + perfiles; solo la
//   del retenido corre).
// t0 = el mínimo en los datasets chicos del kit; b y a por regresión log-log sobre los `nubes`
// (ancho 5); c con `nubes-ancho-2000` (ancho 13) contra `nubes-2000`. Agglomerative cuesta como
// con min(filas, AGGLO_MAX_ROWS) (modo muestra). Uso:
//   node scripts/costos-agrupar/tabla.mjs <resultados.json> [<resultados-2.json> …]
//   (con varios, por dataset se toma el primero que lo midió SIN carga; si ninguno, el de menor
//   carga máxima, marcado ⚠ — la regla de elegir-intento.mjs)
import { readFileSync } from "node:fs";

const files = process.argv.slice(2);
const MEMBERS = ["kmeans", "agglomerative", "gmm", "hdbscan"];
const AGGLO_MAX_ROWS = 8000;
const REF_WIDTH = 5;
const CEILING_S = 5;
const med = (xs) => {
  const s = [...xs].filter((x) => x != null).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
const s = (x, d = 2) => (x == null ? "—" : Number(x).toFixed(d));
const loaded = (d) =>
  d.load.before.load1 > d.load.before.threshold ||
  d.load.after.load1 > d.load.after.threshold;

const refs = files.map((f) => ({ file: f, ...JSON.parse(readFileSync(f, "utf8")) }));
const payloads = JSON.parse(
  readFileSync(files[0].replace(/resultados-[^/]*\.json$/, "payloads.json"), "utf8"),
);
const ids = payloads.map((p) => p.id);

const DS = ids.flatMap((id) => {
  const candidates = refs
    .map((r) => ({ tag: r.file.match(/resultados-(.*)\.json$/)[1], d: r.datasets.find((x) => x.id === id) }))
    .filter((c) => c.d && !c.d.error);
  if (!candidates.length) return [];
  const clean = candidates.find((c) => !loaded(c.d));
  const pick =
    clean ??
    candidates.reduce((a, b) =>
      Math.max(b.d.load.before.load1, b.d.load.after.load1) <
      Math.max(a.d.load.before.load1, a.d.load.after.load1)
        ? b
        : a,
    );
  const d = pick.d;
  const runs = [d, ...(d.resRuns ?? [])];
  const sweep = Object.fromEntries(
    MEMBERS.map((m) => [m, med(runs.map((r) => (r.flow?.sweep_ms?.[m] ?? null) / 1000))]),
  );
  const member = Object.fromEntries(
    MEMBERS.map((m) => [m, med(runs.map((r) => r.members?.[m]?.seconds))]),
  );
  // La lectura solo existe si el agrupador encontró grupos (si no, fit_member no la mide).
  const reading = Object.fromEntries(
    MEMBERS.map((m) => [
      m,
      runs[0].members?.[m]?.error ? null : med(runs.map((r) => r.members?.[m]?.seconds - (r.flow?.sweep_ms?.[m] ?? 0) / 1000)),
    ]),
  );
  return [
    {
      id,
      tag: pick.tag,
      rows: d.rows,
      width: payloads.find((p) => p.id === id).width,
      sweep,
      member,
      reading,
      flow: med(runs.map((r) => r.flow?.seconds)),
      winner: d.flow?.winner,
      reading_level: d.flow?.reading,
      k: d.flow?.k,
      load: d.load,
      conCarga: loaded(d),
    },
  ];
});

const lines = [];
const p = (x = "") => lines.push(x);
for (const r of refs) {
  p(`- \`${r.file.split("/").pop()}\`: ${r.browser} ${r.version}, ${r.when}; carga del lote ${r.machine.before.load1} → ${r.machine.after?.load1 ?? "—"} (umbral ${r.machine.before.threshold}).`);
}
p();
p("#### Medido por agrupador: barrido · lectura (s, mediana de las corridas) y el flujo entero");
p();
p("| Dataset | Filas | Ancho | K-Means | Agglomerative | GMM | HDBSCAN | Flujo entero (s) | Ganador · k · lectura | Intento · carga antes → después |");
p("| --- | ---: | ---: | --- | --- | --- | --- | ---: | --- | --- |");
for (const d of DS) {
  p(
    `| ${d.id} | ${d.rows} | ${d.width} | ${MEMBERS.map((m) => `${s(d.sweep[m])} · ${s(d.reading[m])}`).join(" | ")} | ${s(d.flow)} | ${d.winner} · ${d.k} · ${d.reading_level} | ${d.tag} · ${d.load.before.load1} → ${d.load.after.load1}${d.conCarga ? " ⚠" : ""} |`,
  );
}
p();

const small = DS.filter((d) => d.rows <= 300);
const nubes = DS.filter((d) => /^nubes-\d+$/.test(d.id));
const wide = DS.find((d) => d.id === "nubes-ancho-2000");
const narrow = DS.find((d) => d.id === "nubes-2000");
const eff = (name, d) => (name === "agglomerative" ? Math.min(d.rows, AGGLO_MAX_ROWS) : d.rows);

function fit(part, name) {
  const t0 = Math.min(...small.map((d) => d[part][name]).filter((t) => t != null && t > 0));
  const pts = nubes
    .filter((d) => name !== "agglomerative" || d.rows <= AGGLO_MAX_ROWS)
    .map((d) => [eff(name, d) / 1000, d[part][name]])
    .filter(([, t]) => t != null && t > t0);
  if (pts.length < 2) return null;
  const X = pts.map(([n]) => Math.log(n));
  const Y = pts.map(([, t]) => Math.log(t - t0));
  const mx = X.reduce((a, b) => a + b) / X.length;
  const my = Y.reduce((a, b) => a + b) / Y.length;
  const b =
    X.reduce((acc, x, i) => acc + (x - mx) * (Y[i] - my), 0) /
    X.reduce((acc, x) => acc + (x - mx) ** 2, 0);
  const a = Math.exp(my - b * mx);
  let c = 0;
  if (wide?.[part][name] != null && narrow?.[part][name] != null) {
    const ratio = (wide[part][name] - t0) / Math.max(narrow[part][name] - t0, 1e-3);
    c = Math.log(Math.max(ratio, 1e-3)) / Math.log(wide.width / narrow.width);
  }
  const predict = (d) => t0 + a * (eff(name, d) / 1000) ** b * (d.width / REF_WIDTH) ** c;
  const errs = nubes
    .filter((d) => d[part][name] != null)
    .map((d) => Math.abs(predict(d) - d[part][name]) / d[part][name]);
  return {
    coef: { t0: +t0.toFixed(3), a: +a.toFixed(4), b: +b.toFixed(3), c: +c.toFixed(3) },
    predict,
    err: Math.max(...errs),
  };
}

const model = { sweep: {}, reading: {} };
for (const part of ["sweep", "reading"]) {
  p(`#### Modelo de costos de agrupar — ${part === "sweep" ? "BARRIDO" : "LECTURA"}: t ≈ t0 + a·(filas/1000)^b·(ancho/5)^c (s; Agglomerative con min(filas, ${AGGLO_MAX_ROWS}))`);
  p();
  p("| Agrupador | t0 | a | b | c | error máx. en los `nubes` |");
  p("| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const name of MEMBERS) {
    const f = fit(part, name);
    model[part][name] = f;
    p(
      f
        ? `| ${name} | ${s(f.coef.t0, 3)} | ${s(f.coef.a, 4)} | ${s(f.coef.b, 3)} | ${s(f.coef.c, 3)} | ${s(f.err * 100, 0)} % |`
        : `| ${name} | — | — | — | — | puntos insuficientes |`,
    );
  }
  p();
  p("```json");
  p(JSON.stringify(Object.fromEntries(MEMBERS.map((m) => [m, model[part][m]?.coef ?? null])), null, 1));
  p("```");
  p();
}

p(`#### Verificación contra el flujo real (techo del Nivel 1: ${CEILING_S} s)`);
p();
p("| Dataset | Estimado con la reserva (Σ barridos + la lectura más cara) | Estimado con la lectura del ganador real | Flujo medido | Error con el ganador real | Nivel 1 estimado |");
p("| --- | ---: | ---: | ---: | ---: | --- |");
for (const d of DS) {
  const sw = (m) => model.sweep[m]?.predict(d) ?? 0;
  const rd = (m) => model.reading[m]?.predict(d) ?? 0;
  const all = MEMBERS.reduce((a, m) => a + sw(m), 0);
  const withReserve = all + Math.max(...MEMBERS.map(rd));
  const withWinner = all + rd(d.winner);
  // El reparto de routeModels: en orden, mientras Σ barridos + la lectura más cara quepa.
  const level1 = [];
  for (const m of MEMBERS) {
    const next = [...level1, m];
    const cost = next.reduce((a, x) => a + sw(x), 0) + Math.max(...next.map(rd));
    if (level1.length === 0 || cost <= CEILING_S) level1.push(m);
  }
  const l1cost = level1.reduce((a, x) => a + sw(x), 0) + Math.max(...level1.map(rd));
  p(
    `| ${d.id} | ${s(withReserve)} | ${s(withWinner)} | ${s(d.flow)} | ${s(((withWinner - d.flow) / d.flow) * 100, 0)} % | ${level1.join(", ")} (${s(l1cost)} s) |`,
  );
}
console.log(lines.join("\n"));
