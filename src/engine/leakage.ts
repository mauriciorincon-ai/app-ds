// Heurística de fuga de datos — honesta, NO exhaustiva.
//
// Marca features cuya relación univariada con el target es sospechosamente alta
// (una sola columna que casi separa el objetivo suele ser un proxy/fuga). No
// promete atrapar todos los casos: es una advertencia ("esta columna podría ser
// un proxy del objetivo"), no una garantía. Se calcula SOLO sobre train.

export type LeakageColumn =
  | { name: string; kind: "numeric"; values: readonly (number | null)[] }
  | { name: string; kind: "categorical"; values: readonly (string | null)[] };

export type LeakageReason = "near-perfect-separation" | "category-purity";

export type LeakageFinding = {
  column: string;
  score: number; // 0..1 — mayor = más sospechoso
  reason: LeakageReason;
};

// Umbral por defecto: relación univariada casi perfecta. Deliberadamente alto
// para minimizar falsos positivos (una advertencia de fuga debe ser creíble).
export const DEFAULT_LEAKAGE_THRESHOLD = 0.98;

/**
 * AUC univariada por rangos (equivalente al estadístico de Mann-Whitney U
 * normalizado). Mide qué tan bien una sola feature numérica ordena el target
 * binario. 0.5 = azar; cerca de 0 o 1 = separación casi perfecta. Maneja empates
 * con rangos promedio.
 */
export function rankAuc(
  values: readonly number[],
  target: readonly (0 | 1)[],
): number {
  const n = values.length;
  if (n === 0 || n !== target.length) {
    return 0.5;
  }

  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => values[a] - values[b],
  );

  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && values[order[j + 1]] === values[order[i]]) {
      j += 1;
    }
    const averageRank = (i + j) / 2 + 1; // rangos 1-based, promedio en empates
    for (let k = i; k <= j; k++) {
      ranks[order[k]] = averageRank;
    }
    i = j + 1;
  }

  let sumPositiveRanks = 0;
  let nPositive = 0;
  let nNegative = 0;
  for (let k = 0; k < n; k++) {
    if (target[k] === 1) {
      sumPositiveRanks += ranks[k];
      nPositive += 1;
    } else {
      nNegative += 1;
    }
  }

  if (nPositive === 0 || nNegative === 0) {
    return 0.5;
  }
  return (
    (sumPositiveRanks - (nPositive * (nPositive + 1)) / 2) /
    (nPositive * nNegative)
  );
}

/**
 * Pureza ponderada de una feature categórica frente al target binario: qué
 * fracción de las filas cae en categorías que apuntan casi siempre a la misma
 * clase. 1.0 = cada categoría determina el target (proxy perfecto).
 */
export function categoryPurity(
  values: readonly string[],
  target: readonly (0 | 1)[],
): number {
  const n = values.length;
  if (n === 0 || n !== target.length) {
    return 0;
  }

  const counts = new Map<string, { positive: number; total: number }>();
  for (let k = 0; k < n; k++) {
    const category = values[k];
    const entry = counts.get(category) ?? { positive: 0, total: 0 };
    entry.total += 1;
    if (target[k] === 1) {
      entry.positive += 1;
    }
    counts.set(category, entry);
  }

  let purity = 0;
  for (const { positive, total } of counts.values()) {
    const majority = Math.max(positive, total - positive);
    purity += majority;
  }
  return purity / n;
}

/**
 * Recorre las columnas y devuelve las sospechosas de fuga (score ≥ threshold),
 * ordenadas de más a menos sospechosa. Ignora nulos por columna emparejando
 * cada valor con su target.
 */
export function detectLeakage(
  columns: readonly LeakageColumn[],
  target: readonly (0 | 1)[],
  threshold: number = DEFAULT_LEAKAGE_THRESHOLD,
): LeakageFinding[] {
  const findings: LeakageFinding[] = [];

  for (const column of columns) {
    if (column.kind === "numeric") {
      const values: number[] = [];
      const labels: (0 | 1)[] = [];
      column.values.forEach((value, i) => {
        if (value !== null && Number.isFinite(value)) {
          values.push(value);
          labels.push(target[i]);
        }
      });
      const auc = rankAuc(values, labels);
      const score = Math.max(auc, 1 - auc); // agnóstico a la dirección
      if (score >= threshold) {
        findings.push({
          column: column.name,
          score,
          reason: "near-perfect-separation",
        });
      }
    } else {
      const values: string[] = [];
      const labels: (0 | 1)[] = [];
      column.values.forEach((value, i) => {
        if (value !== null) {
          values.push(value);
          labels.push(target[i]);
        }
      });
      const purity = categoryPurity(values, labels);
      if (purity >= threshold) {
        findings.push({
          column: column.name,
          score: purity,
          reason: "category-purity",
        });
      }
    }
  }

  return findings.sort((a, b) => b.score - a.score);
}
