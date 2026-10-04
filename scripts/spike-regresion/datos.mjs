// Generador de datasets sintéticos de REGRESIÓN para el spike del S6 (F0): el mismo ancho que
// los de la liga del S5 (8 numéricas + categóricas de 4, 6 y 15 → 33 columnas tras one-hot), con
// ~5 % de nulos, una interacción y una no linealidad. Así los coeficientes de costo de regresión
// se comparan con los de clasificación a igual forma. Determinista por semilla.
import { mulberry32 } from "../spike-liga/datos.mjs";

const round = (x, d = 0) => Number(x.toFixed(d));

function toCsv(headers, rows) {
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n") + "\n";
}

/**
 * Objetivo continuo `objetivo` (≈ 50 ± 20): lineal en x1, x2 · interacción x3×x4 · seno de x5 ·
 * efecto de la categoría c1 · ruido gaussiano aproximado. El resto de columnas no aporta señal.
 */
export function regresionSintetica({
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
    const noise = (rng() + rng() + rng() + rng() - 2) * 6;
    const y =
      50 +
      9 * x[0] -
      6 * x[1] +
      (x[2] > 0.5 ? 8 : -3) * (x[3] > 0 ? 1 : -1) +
      6 * Math.sin(2 * x[4]) +
      (c[0] === 1 ? 7 : 0) -
      (c[0] === 3 ? 5 : 0) +
      noise;
    rows.push([
      ...x.map((v, i) => (i < 2 && rng() < 0.05 ? "" : String(round(v, 3)))),
      ...c.map((v, i) => (i === 1 && rng() < 0.05 ? "" : `cat${i + 1}_${v}`)),
      String(round(y, 2)),
    ]);
  }
  return toCsv(headers, rows);
}
