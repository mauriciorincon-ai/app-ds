// EDA mínima con alertas honestas — pura, determinista.
//
// Corre al ELEGIR el objetivo (necesita el target para fuga y desbalance). Emite
// tres clases de alerta, cada una con su umbral documentado:
//
//   • possible-leak  — una feature con relación univariada casi perfecta con el
//     objetivo. Es un AVISO EXPLORATORIO PRE-SPLIT (misma heurística que
//     engine/leakage pero sobre TODO el dataset); la GARANTÍA anti-fuga sigue
//     siendo el pipeline train-only + detectLeakage(train) de prepareRun.
//   • id-like        — columna casi-única (parece identificador). Se reporta como
//     ID, NO como fuga (un identificador no "filtra el objetivo").
//   • class-imbalance — la clase minoritaria es rara; el veredicto lo tendrá en
//     cuenta (métrica primaria AUC), pero el usuario merece saberlo de frente.
//
// `EdaAlert` es un tipo DISTINTO de `LeakageFinding`: no toca el array `leakage`
// del manifiesto ni la validación `isLeakage` del archivo exportado.

import {
  DEFAULT_LEAKAGE_THRESHOLD,
  detectLeakage,
  type LeakageColumn,
} from "@/engine/leakage";
import {
  isNullToken,
  parseNumber,
  profileColumn,
  targetClasses,
  type CsvTable,
} from "@/lib/ds/csv";

export type EdaAlert =
  | { kind: "possible-leak"; column: string; score: number }
  | { kind: "id-like"; column: string; score: number }
  | { kind: "class-imbalance"; minorityRate: number };

// Casi-ID: al menos este 95% de las filas con un valor distinto. La exclusión
// DURA de sanitize exige unicidad exacta (=1); este umbral atrapa la casi-ID que
// sanitize conserva.
export const EDA_ID_RATIO_THRESHOLD = 0.95;
// Desbalance: clase minoritaria por debajo del 15% (mismo corte que la elección
// de métrica primaria en verdict.ts — coherencia de una sola frontera).
export const EDA_IMBALANCE_THRESHOLD = 0.15;

/**
 * Alertas EDA para un objetivo dado. Vacío si el objetivo no es binario (mismo
 * criterio que el resto del pipeline). Orden: fuga (lo más serio) → id-like →
 * desbalance.
 */
export function computeEdaAlerts(
  table: CsvTable,
  targetColumn: string,
): EdaAlert[] {
  const targetIndex = table.headers.indexOf(targetColumn);
  if (targetIndex < 0) return [];

  const rowsWithTarget = table.rows.filter(
    (row) => !isNullToken(row[targetIndex]),
  );
  const labels = rowsWithTarget.map((row) => row[targetIndex]);
  const classes = targetClasses(labels).sort();
  if (classes.length !== 2) return [];

  const n = rowsWithTarget.length;
  if (n === 0) return [];

  const leakAlerts: EdaAlert[] = [];
  const idAlerts: EdaAlert[] = [];

  // 1) Columnas casi-únicas (id-like) — target-independiente; se excluyen del
  //    escaneo de fuga para no confundir "identificador" con "proxy del objetivo".
  //    Solo NO numéricas: una feature continua tiene alta cardinalidad natural y
  //    NO es un identificador (coherente con la exclusión de sanitize).
  const idLike = new Set<string>();
  table.headers.forEach((name, index) => {
    if (index === targetIndex) return;
    const cells = rowsWithTarget.map((row) => row[index]);
    if (profileColumn(name, cells).kind === "numeric") return;
    const distinct = new Set<string>();
    let nonNull = 0;
    for (const cell of cells) {
      if (isNullToken(cell)) continue;
      nonNull += 1;
      distinct.add(cell.trim());
    }
    if (nonNull === 0) return;
    const ratio = distinct.size / n;
    if (ratio >= EDA_ID_RATIO_THRESHOLD) {
      idLike.add(name);
      idAlerts.push({ kind: "id-like", column: name, score: ratio });
    }
  });

  // 2) Fuga exploratoria (pre-split, sobre todo el dataset).
  const target01 = labels.map((v) => (v.trim() === classes[1] ? 1 : 0)) as (
    0 | 1
  )[];

  const columns: LeakageColumn[] = [];
  table.headers.forEach((name, index) => {
    if (index === targetIndex || idLike.has(name)) return;
    const cells = rowsWithTarget.map((row) => row[index]);
    const profile = profileColumn(name, cells);
    if (profile.looksLikeDate) return; // las fechas no son features (S1)
    if (profile.kind === "numeric") {
      columns.push({
        name,
        kind: "numeric",
        values: cells.map((c) => parseNumber(c)),
      });
    } else {
      columns.push({
        name,
        kind: "categorical",
        values: cells.map((c) => (isNullToken(c) ? null : c.trim())),
      });
    }
  });

  for (const finding of detectLeakage(
    columns,
    target01,
    DEFAULT_LEAKAGE_THRESHOLD,
  )) {
    leakAlerts.push({
      kind: "possible-leak",
      column: finding.column,
      score: finding.score,
    });
  }

  // 3) Desbalance de clases.
  const minorityCount = Math.min(
    target01.filter((t) => t === 1).length,
    target01.filter((t) => t === 0).length,
  );
  const minorityRate = minorityCount / n;
  const imbalanceAlerts: EdaAlert[] =
    minorityRate < EDA_IMBALANCE_THRESHOLD
      ? [{ kind: "class-imbalance", minorityRate }]
      : [];

  return [...leakAlerts, ...idAlerts, ...imbalanceAlerts];
}
