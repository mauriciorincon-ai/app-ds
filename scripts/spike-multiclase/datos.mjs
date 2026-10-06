// Generador de datasets sintéticos MULTICLASE para el spike del S7 (F0): la misma forma que la
// liga del S5 (8 numéricas + categóricas de 4, 6 y 15 → 33 columnas tras one-hot), ~5 % de
// nulos, K clases DESBALANCEADAS (pesos 1/(i+1)) con señal real y solapada. Así los coeficientes
// de costo multiclase se comparan con los binarios a igual forma, y el factor de K se mide
// variando solo K. Determinista por semilla.
import { mulberry32 } from "../spike-liga/datos.mjs";

const round = (x, d = 0) => Number(x.toFixed(d));

function toCsv(headers, rows) {
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n") + "\n";
}

/** Normal aproximada (suma de 4 uniformes, varianza 1/3 → escalada a 1). */
const gauss = (rng) => (rng() + rng() + rng() + rng() - 2) * Math.sqrt(3);

/**
 * Objetivo `objetivo` con `clases` categorías `clase_1…clase_K` (la 1 la más frecuente).
 * Las numéricas x1–x3 llevan el centro de cada clase (en un círculo, con ruido que solapa),
 * c1 lleva una preferencia por clase; el resto no aporta señal.
 */
export function multiclaseSintetica({
  n,
  seed,
  clases = 5,
  numericas = 8,
  cardinalidades = [4, 6, 15],
}) {
  const rng = mulberry32(seed);
  const pesos = Array.from({ length: clases }, (_, i) => 1 / (i + 1));
  const total = pesos.reduce((a, b) => a + b, 0);
  const headers = [
    ...Array.from({ length: numericas }, (_, i) => `x${i + 1}`),
    ...cardinalidades.map((_, i) => `c${i + 1}`),
    "objetivo",
  ];
  const rows = [];
  for (let r = 0; r < n; r++) {
    let u = rng() * total;
    let k = 0;
    while (k < clases - 1 && (u -= pesos[k]) >= 0) k += 1;
    const angulo = (2 * Math.PI * k) / clases;
    const x = Array.from({ length: numericas }, (_, i) => {
      const centro =
        i === 0 ? 1.6 * Math.cos(angulo) : i === 1 ? 1.6 * Math.sin(angulo) : i === 2 ? 0.8 * (k % 3) : 0;
      return centro + gauss(rng);
    });
    const c = cardinalidades.map((card, i) =>
      i === 0 && rng() < 0.6 ? k % card : Math.floor(rng() * card),
    );
    rows.push([
      ...x.map((v, i) => (i < 2 && rng() < 0.05 ? "" : String(round(v, 3)))),
      ...c.map((v, i) => (i === 1 && rng() < 0.05 ? "" : `cat${i + 1}_${v}`)),
      `clase_${k + 1}`,
    ]);
  }
  return toCsv(headers, rows);
}
