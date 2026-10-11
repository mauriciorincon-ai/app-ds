// Generadores SIN objetivo para el spike de agrupar (S7 F0). Deterministas por semilla.
// - `nubes`: k grupos plantados (centros separados ~3 desviaciones) en `dims` numéricas, más
//   una categórica con preferencia por grupo y una numérica de ruido común.
// - `uniforme`: sin ninguna estructura, en `dims` numéricas (el caso que la lectura debe llamar
//   «no hay estructura»; K-Means sobre datos uniformes puede salir «estable» igual).
import { mulberry32 } from "../spike-liga/datos.mjs";

const round = (x, d = 0) => Number(x.toFixed(d));
const gauss = (rng) => (rng() + rng() + rng() + rng() - 2) * Math.sqrt(3);

function toCsv(headers, rows) {
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n") + "\n";
}

export function nubes({ n, seed, k = 4, dims = 4 }) {
  const rng = mulberry32(seed);
  const centros = Array.from({ length: k }, () =>
    Array.from({ length: dims }, () => (rng() - 0.5) * 12),
  );
  const headers = [
    ...Array.from({ length: dims }, (_, i) => `x${i + 1}`),
    "ruido",
    "c1",
  ];
  const rows = [];
  for (let r = 0; r < n; r++) {
    const g = Math.floor(rng() * k);
    rows.push([
      ...centros[g].map((c) => String(round(c + gauss(rng), 3))),
      String(round(gauss(rng), 3)),
      rng() < 0.6 ? `cat_${g}` : `cat_${Math.floor(rng() * k)}`,
    ]);
  }
  return toCsv(headers, rows);
}

export function uniforme({ n, seed, dims }) {
  const rng = mulberry32(seed);
  const headers = Array.from({ length: dims }, (_, i) => `u${i + 1}`);
  const rows = [];
  for (let r = 0; r < n; r++)
    rows.push(Array.from({ length: dims }, () => String(round(rng() * 10, 3))));
  return toCsv(headers, rows);
}
