// Generador de datasets sintéticos para la liga (S5): con categóricas, nulos y señal no
// lineal — lo que el spike de la planeadora NO tenía (make_classification: solo numéricas
// limpias). Determinista por semilla: el mismo comando produce siempre el mismo CSV.
// Lo usan el spike de costos (F0) y, en la F2, el `liga-mediana.csv` del kit de prueba.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const round = (x, d = 0) => Number(x.toFixed(d));

function toCsv(headers, rows) {
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n") + "\n";
}

/**
 * Dataset binario sintético: `numericas` columnas numéricas (las 4 primeras con señal,
 * una con interacción), categóricas con cardinalidades dadas (una con señal), ~5 % de
 * nulos en dos columnas y ~30 % de positivos. Objetivo: `objetivo` = si/no.
 */
export function ligaSintetica({
  n,
  seed,
  numericas = 8,
  cardinalidades = [4, 6, 15],
}) {
  const rng = mulberry32(seed);
  const headers = [
    ...Array.from({ length: numericas }, (_, i) => `x${i + 1}`),
    ...cardinalidades.map((_, i) => `c${i + 1}`),
    "objetivo",
  ];
  const rows = [];
  for (let r = 0; r < n; r++) {
    const x = Array.from({ length: numericas }, () => (rng() - 0.5) * 4);
    const c = cardinalidades.map((k) => Math.floor(rng() * k));
    const logit =
      -1.2 +
      1.1 * x[0] -
      0.8 * x[1] +
      (x[2] > 0.5 ? 0.9 : -0.3) * (x[3] > 0 ? 1 : -1) + // interacción (no lineal)
      (c[0] === 1 ? 1.0 : 0) -
      (c[0] === 3 ? 0.8 : 0) +
      (rng() - 0.5) * 1.2;
    const y = rng() < sigmoid(logit) ? "si" : "no";
    const cells = [
      ...x.map((v, i) => (i < 2 && rng() < 0.05 ? "" : String(round(v, 3)))),
      ...c.map((v, i) => (i === 1 && rng() < 0.05 ? "" : `cat${i + 1}_${v}`)),
      y,
    ];
    rows.push(cells);
  }
  return toCsv(headers, rows);
}
