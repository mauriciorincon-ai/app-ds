// Fábricas de resultados de la liga para los tests unit (S5): producen formas que
// PASAN el lector del contrato (contract.ts) — liga en el orden del roster, k
// folds, ganador = regla de un error estándar —, así los tests de UI y de estado
// no se escriben con un contrato que la app rechazaría.
import { selectOneSe, type MemberId } from "@/engine/roster";
import type { Metrics, RegressionMetrics } from "@/engine/verdict";
import { assembleRegressionResult } from "@/lib/experiment";
import type {
  BinaryResult,
  LeagueRow,
  MemberFitResult,
  PipelinePayload,
  PipelineResult,
  RegressionMemberFitResult,
  RegressionPipelineResult,
  RegressionResult,
} from "@/workers/protocol";
import { SCORER } from "@/workers/contract";

export function metrics(overrides: Partial<Metrics> = {}): Metrics {
  return {
    accuracy: 0.71,
    precision: 0.62,
    recall: 0.55,
    f1: 0.58,
    auc: 0.81,
    ...overrides,
  };
}

/**
 * Una fila por miembro. Por defecto el primero gana con holgura (CV 0,80 y cada
 * siguiente 0,05 menos, std 0,01): la regla de un error estándar lo elige.
 * `cvMeans` fija la media de CV por miembro.
 */
export function leagueRows(
  roster: readonly MemberId[],
  k = 5,
  cvMeans: Partial<Record<MemberId, number>> = {},
): LeagueRow[] {
  return roster.map((name, i) => {
    const mean = cvMeans[name] ?? 0.8 - 0.05 * i;
    return {
      name,
      status: "ok",
      cv: { mean, std: 0.01, folds: Array.from({ length: k }, () => mean) },
      test: metrics({ auc: mean, f1: mean - 0.2 }),
      elapsed_ms: 40 + i,
      error_type: null,
    };
  });
}

/** Resultado de Python coherente con lo enviado (lo que el FakeWorker responde). */
export function pipelineResult(
  sent: Pick<PipelinePayload, "roster" | "cv_k"> &
    Partial<Pick<PipelinePayload, "primary_metric">> = {
    roster: ["logistic", "forest"],
    cv_k: 5,
  },
  cvMeans: Partial<Record<MemberId, number>> = {},
): PipelineResult {
  const league = leagueRows(sent.roster, sent.cv_k, cvMeans);
  const selection = selectOneSe(league, sent.cv_k, "higher")!;
  const winner = league.find((row) => row.name === selection.winner)!;
  return {
    // S6: Python devuelve la tarea (aditivo en la binaria).
    task: "binaria",
    classes: ["0", "1"],
    positive_class: "1",
    positive_rate: 0.3,
    n_train: 150,
    n_test: 50,
    baselines: {
      majority: metrics({ auc: 0.5 }),
      logistic: metrics({ auc: 0.6 }),
    },
    model: winner.test!,
    model_name: selection.winner,
    winner: selection.winner,
    league,
    cv: {
      k: sent.cv_k,
      // Como Python: la CV puntúa con la métrica enviada (lo cruza contract.ts).
      scoring: SCORER[sent.primary_metric ?? "auc"],
      rule: "one-se",
      best: selection.best,
      se: selection.se,
    },
    elapsed_ms: 1234,
    confusion_matrix: [
      [1, 0],
      [0, 1],
    ],
    explainability: {
      method: "permutation_importance",
      scoring: "roc_auc",
      n_repeats: 10,
      features: [
        {
          name: "x",
          kind: "numeric",
          importance: 0.2,
          std: 0.01,
          direction: "positive",
        },
      ],
    },
    preprocessing: { numeric_medians: { x: 1 }, rare_categories: {} },
  };
}

/** Lo que Python devuelve al ajustar a mano un miembro de esa liga (U1). */
export function memberFit(
  result: PipelineResult,
  member: MemberId,
): MemberFitResult {
  const row = result.league.find((r) => r.name === member);
  return {
    task: "binaria",
    model: row?.test ?? metrics(),
    model_name: member,
    confusion_matrix: result.confusion_matrix,
    explainability: result.explainability,
    preprocessing: result.preprocessing,
  };
}

/**
 * Los campos S5 de un BinaryResult armado a mano por los tests H1: la liga
 * con `modelName` como ganador de la CV (y, si se pasan, otros competidores).
 */
export function leagueFields(
  modelName: MemberId = "forest",
  others: readonly MemberId[] = [],
): Pick<BinaryResult, "league" | "selection" | "smallSample"> {
  const league = leagueRows([modelName, ...others]);
  return {
    league,
    selection: {
      by: "cv",
      cvWinner: modelName,
      best: modelName,
      k: 5,
      metric: "auc",
      rule: "one-se",
      se: 0.01 / Math.sqrt(5),
      competitors: league.length,
      elapsedMs: 1234,
    },
    smallSample: false,
  };
}

// --- S6: estimar una cantidad ----------------------------------------------

export function regressionMetrics(
  overrides: Partial<RegressionMetrics> = {},
): RegressionMetrics {
  return {
    mae: 33.5,
    rmse: 44.5,
    r2: 0.8,
    medae: 27,
    mape: 0.09,
    ...overrides,
  };
}

const REAL = [150, 250, 350, 450, 550];
const PREDICTED = [170, 240, 400, 445, 600];

/**
 * Liga de regresión coherente con lo enviado: MAE en kWh, menor es mejor. Por
 * defecto el primero gana con holgura (CV 35 y cada siguiente 3 más, std 1).
 */
export function regressionPipelineResult(
  sent: Pick<PipelinePayload, "roster" | "cv_k"> = {
    roster: ["linear", "ridge", "extra_trees"],
    cv_k: 5,
  },
  cvMeans: Partial<Record<MemberId, number>> = {},
): RegressionPipelineResult {
  const league: LeagueRow<RegressionMetrics>[] = sent.roster.map((name, i) => {
    const mean = cvMeans[name] ?? 35 + 3 * i;
    return {
      name,
      status: "ok",
      cv: {
        mean,
        std: 1,
        folds: Array.from({ length: sent.cv_k }, () => mean),
      },
      test: regressionMetrics({ mae: mean - 1.5, rmse: mean + 9 }),
      elapsed_ms: 40 + i,
      error_type: null,
    };
  });
  const selection = selectOneSe(league, sent.cv_k, "lower")!;
  const winner = league.find((row) => row.name === selection.winner)!;
  return {
    task: "numerica",
    target_stats: {
      mean: 374.7,
      std: 114.2,
      min: 148.8,
      max: 840.5,
      median: 365.4,
      decimals: 1,
    },
    n_train: 150,
    n_test: 50,
    baselines: {
      median: regressionMetrics({ mae: 80.9, rmse: 99.9, r2: 0, medae: 64 }),
      linear: regressionMetrics({
        mae: 43.8,
        rmse: 51.8,
        r2: 0.73,
        medae: 42.3,
      }),
    },
    model: winner.test!,
    model_name: selection.winner,
    winner: selection.winner,
    league,
    cv: {
      k: sent.cv_k,
      scoring: SCORER.mae,
      rule: "one-se",
      best: selection.best,
      se: selection.se,
    },
    elapsed_ms: 2345,
    // La muestra trae TODOS los puntos de la prueba (hasta el tope): el lector lo
    // exige (AU-S6-10). Cinco formas repetidas, corridas juntas: 3 de cada 5
    // dentro de ±33.5 (+20, −10, +5) y 2 fuera (+50, +50).
    pred_vs_real: {
      real: Array.from(
        { length: 50 },
        (_, i) => REAL[i % 5]! + Math.floor(i / 5),
      ),
      predicted: Array.from(
        { length: 50 },
        (_, i) => PREDICTED[i % 5]! + Math.floor(i / 5),
      ),
      n_total: 50,
    },
    residuals: { p05: -40, p25: -20, p50: 5, p75: 25, p95: 60, abs_p90: 55 },
    explainability: {
      method: "permutation_importance",
      scoring: "neg_mean_absolute_error",
      n_repeats: 10,
      features: [
        {
          name: "ocupantes",
          kind: "numeric",
          importance: 61.1,
          std: 2,
          direction: "positive",
        },
        {
          name: "calefaccion",
          kind: "categorical",
          importance: 9.5,
          std: 1,
          direction: null,
        },
      ],
    },
    preprocessing: { numeric_medians: { ocupantes: 3 }, rare_categories: {} },
  };
}

/** Lo que Python devuelve al ajustar a mano un miembro de una liga de regresión. */
export function regressionMemberFit(
  result: RegressionPipelineResult,
  member: MemberId,
): RegressionMemberFitResult {
  const row = result.league.find((r) => r.name === member);
  return {
    task: "numerica",
    model: row?.test ?? regressionMetrics(),
    model_name: member,
    pred_vs_real: result.pred_vs_real,
    residuals: result.residuals,
    explainability: result.explainability,
    preprocessing: result.preprocessing,
  };
}

/** Un RegressionResult ensamblado como en producción (objetivo «consumo_kwh»). */
export function regressionResult(
  py: RegressionPipelineResult = regressionPipelineResult(),
  target = "consumo_kwh",
): RegressionResult {
  return assembleRegressionResult(py, [], target);
}
