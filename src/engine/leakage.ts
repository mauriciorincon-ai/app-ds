// Heurística de fuga de datos — honesta, NO exhaustiva.
//
// Marca features cuya relación univariada con el target es sospechosamente alta
// (una sola columna que casi separa el objetivo suele ser un proxy/fuga). No
// promete atrapar todos los casos: es una advertencia ("esta columna podría ser
// un proxy del objetivo"), no una garantía. Se calcula SOLO sobre train.

export type LeakageColumn =
  | { name: string; kind: "numeric"; values: readonly (number | null)[] }
  | { name: string; kind: "categorical"; values: readonly (string | null)[] };

export type LeakageReason =
  | "near-perfect-separation"
  | "category-purity"
  // S6 (objetivo continuo): una numérica que ORDENA el objetivo casi igual que él
  // (|Spearman|), o una categórica que lo explica casi entero (η²).
  | "near-perfect-rank-correlation"
  | "category-determines-target";

export type LeakageFinding = {
  column: string;
  score: number; // 0..1 — mayor = más sospechoso
  reason: LeakageReason;
};

// Umbral por defecto: relación univariada casi perfecta. Deliberadamente alto
// para minimizar falsos positivos (una advertencia de fuga debe ser creíble).
export const DEFAULT_LEAKAGE_THRESHOLD = 0.98;

/** S6 (fijado por el usuario en el STOP de la F0): umbral de fuga con objetivo
 *  continuo, en |Spearman| y en η². Medido: la columna legítima más fuerte dio
 *  0,839 (superficie → precio) y la plantada 1,000. */
export const CONTINUOUS_LEAKAGE_THRESHOLD = 0.98;
/** S6: con η², una categoría con pocas filas «explica» su propio valor por
 *  construcción (una fila ⇒ η² = 1). Las que tienen menos filas que esto se
 *  agrupan en una sola, como el min_frequency del preprocesador. */
export const ETA_MIN_SUPPORT = 5;
/** S6 (D8, AU-S6-11): pares no nulos mínimos en train para evaluar la fuga de una
 *  columna con objetivo continuo. Con pocos pares, un |Spearman| ≥ 0,98 sale por
 *  AZAR: la probabilidad exacta (enumerando permutaciones) es 1/3 con 3 pares,
 *  1/60 con 5, 1/20 160 con 8 y 1/181 440 con 10 — donde cae un orden más. Una
 *  columna casi vacía ya no cambia el veredicto a «sospechoso» por nada. Decidido
 *  por delegación del usuario (bitácora, D8). */
export const LEAKAGE_MIN_PAIRS = 10;

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

// --- S6: objetivo continuo -------------------------------------------------

/** Rangos 1-based con promedio en empates (los de rankAuc, reusables). */
function averageRanks(values: readonly number[]): number[] {
  const n = values.length;
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => values[a] - values[b],
  );
  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && values[order[j + 1]] === values[order[i]]) j += 1;
    const averageRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[order[k]] = averageRank;
    i = j + 1;
  }
  return ranks;
}

/**
 * |Spearman| entre una numérica y el objetivo: Pearson sobre los rangos
 * (agnóstico a la dirección y a que la relación sea lineal). 0 si alguno es
 * constante o hay menos de 3 pares.
 */
export function spearmanAbs(
  values: readonly number[],
  target: readonly number[],
): number {
  const n = values.length;
  if (n < 3 || n !== target.length) return 0;
  const rx = averageRanks(values);
  const ry = averageRanks(target);
  const mean = (n + 1) / 2;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let k = 0; k < n; k++) {
    const dx = rx[k] - mean;
    const dy = ry[k] - mean;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return 0;
  return Math.min(1, Math.abs(sxy / Math.sqrt(sxx * syy)));
}

/**
 * η² (razón de correlación): qué fracción de la varianza del objetivo explica
 * la categoría. Las categorías con menos de `minSupport` filas se agrupan en
 * una sola (si no, un identificador explica «todo» trivialmente). 0 si el
 * objetivo es constante.
 */
export function etaSquared(
  categories: readonly string[],
  target: readonly number[],
  minSupport: number = ETA_MIN_SUPPORT,
): number {
  const n = categories.length;
  if (n === 0 || n !== target.length) return 0;
  const counts = new Map<string, number>();
  for (const c of categories) counts.set(c, (counts.get(c) ?? 0) + 1);
  const RARE = "\u0000rara";
  const groups = new Map<string, { sum: number; count: number }>();
  let total = 0;
  for (let k = 0; k < n; k++) {
    const key =
      (counts.get(categories[k]) ?? 0) < minSupport ? RARE : categories[k];
    const g = groups.get(key) ?? { sum: 0, count: 0 };
    g.sum += target[k];
    g.count += 1;
    groups.set(key, g);
    total += target[k];
  }
  const grand = total / n;
  let ssTotal = 0;
  for (const y of target) ssTotal += (y - grand) ** 2;
  if (ssTotal === 0) return 0;
  let ssBetween = 0;
  for (const { sum, count } of groups.values()) {
    ssBetween += count * (sum / count - grand) ** 2;
  }
  return Math.min(1, ssBetween / ssTotal);
}

/**
 * Fuga con objetivo CONTINUO (S6), sobre train: una numérica con |Spearman| ≥
 * umbral, o una categórica con η² ≥ umbral (soporte mínimo por categoría), es
 * sospechosa. Misma honestidad que la binaria: avisa, no promete atraparlo todo.
 */
export function detectLeakageContinuous(
  columns: readonly LeakageColumn[],
  target: readonly number[],
  threshold: number = CONTINUOUS_LEAKAGE_THRESHOLD,
): LeakageFinding[] {
  const findings: LeakageFinding[] = [];
  for (const column of columns) {
    if (column.kind === "numeric") {
      const values: number[] = [];
      const ys: number[] = [];
      column.values.forEach((value, i) => {
        if (value !== null && Number.isFinite(value)) {
          values.push(value);
          ys.push(target[i]);
        }
      });
      if (values.length < LEAKAGE_MIN_PAIRS) continue;
      const score = spearmanAbs(values, ys);
      if (score >= threshold) {
        findings.push({
          column: column.name,
          score,
          reason: "near-perfect-rank-correlation",
        });
      }
    } else {
      const values: string[] = [];
      const ys: number[] = [];
      column.values.forEach((value, i) => {
        if (value !== null) {
          values.push(value);
          ys.push(target[i]);
        }
      });
      if (values.length < LEAKAGE_MIN_PAIRS) continue;
      const score = etaSquared(values, ys);
      if (score >= threshold) {
        findings.push({
          column: column.name,
          score,
          reason: "category-determines-target",
        });
      }
    }
  }
  return findings.sort((a, b) => b.score - a.score);
}
