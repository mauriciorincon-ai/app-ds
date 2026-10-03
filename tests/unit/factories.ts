// Fábricas de resultados de la liga para los tests unit (S5): producen formas que
// PASAN el lector del contrato (contract.ts) — liga en el orden del roster, k
// folds, ganador = regla de un error estándar —, así los tests de UI y de estado
// no se escriben con un contrato que la app rechazaría.
import { selectOneSe, type MemberId } from "@/engine/roster";
import type { Metrics } from "@/engine/verdict";
import type {
  ExperimentResult,
  LeagueRow,
  PipelinePayload,
  PipelineResult,
} from "@/workers/protocol";

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
  sent: Pick<PipelinePayload, "roster" | "cv_k"> = {
    roster: ["logistic", "forest"],
    cv_k: 5,
  },
  cvMeans: Partial<Record<MemberId, number>> = {},
): PipelineResult {
  const league = leagueRows(sent.roster, sent.cv_k, cvMeans);
  const selection = selectOneSe(league, sent.cv_k)!;
  const winner = league.find((row) => row.name === selection.winner)!;
  return {
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
      scoring: "roc_auc",
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

/**
 * Los campos S5 de un ExperimentResult armado a mano por los tests H1: la liga
 * con `modelName` como ganador de la CV (y, si se pasan, otros competidores).
 */
export function leagueFields(
  modelName: MemberId = "forest",
  others: readonly MemberId[] = [],
): Pick<ExperimentResult, "league" | "selection" | "smallSample"> {
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
