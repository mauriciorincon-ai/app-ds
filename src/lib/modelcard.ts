// Ensamblador determinista de la model card (markdown descargable): la
// constancia del experimento — datos, partición, método, métricas en test,
// veredicto, fuga, explicabilidad y límites. Se genera 100% client-side desde
// el estado del experimento (aquí SÍ puede aparecer la clase positiva: el
// documento nunca sale del equipo salvo que el usuario lo comparta). Cita la
// narración IA SOLO si quedó verificada. Strings en messages/{es,en}.json.
//
// S6: una model card por tarea. Al estimar una cantidad, las métricas van en las
// unidades del objetivo contra la mediana y la lineal, hay una sección
// «Estimación» (tarea, unidad, el objetivo en train y cómo se reparten los
// errores) y la narración con IA se declara «no aplica».
import type { Locale } from "@/i18n/config";
import { translate, type TParams } from "@/i18n/translate";
import { matchByTask, taskOf } from "@/engine/despacho";
import { SMALL_SAMPLE_ROWS } from "@/engine/encarrilador";
import { memberNameKey, type MemberId } from "@/engine/roster";
import type { SanitationReport } from "@/engine/sanitize";
import type { MetricName } from "@/engine/verdict";
import { datasetSlug } from "@/lib/files";
import { formatQuantity, withUnit } from "@/lib/quantity";
import {
  importanceFormatter,
  quantityFormatter,
  regressionVerdictText,
} from "@/lib/regression-text";
import { thousands } from "@/content/modelos";
import {
  AGGLO_MAX_ROWS,
  CLUSTER_GAP_MIN,
  CLUSTER_K_MIN,
  CLUSTER_STABILITY_MIN,
  SILHOUETTE_SAMPLE,
} from "@/engine/verdict";
import type { ClusterExclusion } from "@/lib/experiment";
import type {
  BinaryResult,
  ClusterResult,
  MulticlassResult,
  SupervisedResult,
  RegressionResult,
} from "@/workers/protocol";

export type ModelCardInput = {
  locale: Locale;
  datasetName: string;
  /** Columnas totales de la tabla (incluye objetivo y fechas ignoradas). */
  cols: number;
  numericFeatures: number;
  categoricalFeatures: number;
  target: string;
  seed: number;
  result: SupervisedResult;
  /** Saneamiento del dataset (S4) — cifras exactas en la constancia. */
  sanitation?: SanitationReport | null;
  /** Narración IA que PASÓ la verificación numérica; null ⇒ no se cita. */
  verifiedNarrative: string | null;
  /** Inyectable para tests deterministas. */
  date?: Date;
};

const METRICS: MetricName[] = ["accuracy", "precision", "recall", "f1", "auc"];

const fmt = (value: number) => value.toFixed(2);

const DIRECTION_KEY: Record<string, string> = {
  positive: "positive",
  negative: "negative",
};

type T = (key: string, params?: TParams) => string;

/** Las piezas que cambian con la tarea (el resto de la constancia es común). */
type TaskBlocks = {
  target: string;
  split: string;
  baselines: string;
  metricsTable: string;
  testNote: string;
  verdict: string;
  estimate: string[];
  direction: (key: string) => string;
  /** La importancia de una columna (al estimar, en las unidades del objetivo). */
  importance: (value: number) => string;
  narrative: string;
};

function binaryBlocks(
  result: BinaryResult,
  input: ModelCardInput,
  t: T,
): TaskBlocks {
  const metricsTable = [
    `| ${t("modelcard.metrics.metric")} | ${t("modelcard.metrics.model")} | ${t("results.baselines.majority")} | ${t("results.baselines.logistic")} |`,
    "| --- | --- | --- | --- |",
    ...METRICS.map(
      (metric) =>
        `| ${t(`results.metrics.${metric}`)} | ${fmt(result.model[metric])} | ${fmt(result.baselines.majority[metric])} | ${fmt(result.baselines.logistic[metric])} |`,
    ),
  ].join("\n");
  const verdictHeadline = t(`results.verdict.${result.verdict.level}`, {
    name: t(`results.candidates.short.${result.modelName}`),
  });
  const verdictDetail = t(`results.verdict.${result.verdict.level}Detail`, {
    delta: `+${fmt(result.verdict.delta)}`,
    metric: t(`results.metrics.${result.verdict.primaryMetric}`),
    model: fmt(result.verdict.modelScore),
    baseline: fmt(result.verdict.baselineScore),
  });
  return {
    target: t("modelcard.data.target", {
      target: input.target,
      positive: result.positiveClass,
    }),
    split: t("modelcard.split.sizes", {
      train: result.nTrain,
      test: result.nTest,
      seed: input.seed,
    }),
    baselines: t("modelcard.method.baselines"),
    metricsTable,
    testNote: t("results.testNote"),
    verdict: [
      `**${verdictHeadline}** — ${verdictDetail}`,
      "",
      t("modelcard.verdict.primary", {
        metric: t(`results.metrics.${result.verdict.primaryMetric}`),
      }),
    ].join("\n"),
    estimate: [],
    direction: (key) => t(`narration.template.direction.${key}`),
    importance: (value) => value.toFixed(4),
    narrative:
      input.verifiedNarrative !== null
        ? `> ${input.verifiedNarrative}`
        : t("modelcard.explainability.notVerified"),
  };
}

/** S7 (ADR 015): varias categorías — exactitud balanceada contra la mayoritaria y
 *  la logística multinomial, la matriz K×K y las métricas por clase. Las clases
 *  SÍ aparecen (como la clase positiva en la binaria): el documento no sale del
 *  equipo salvo que el usuario lo comparta. */
function multiclassBlocks(
  result: MulticlassResult,
  input: ModelCardInput,
  t: T,
): TaskBlocks {
  const { model, baselines, classes, confusionMatrix, perClass } = result;
  const maybe = (value: number | null) => (value === null ? "—" : fmt(value));
  const rows: [string, (m: MulticlassResult["model"]) => string][] = [
    ["balanced_accuracy", (m) => fmt(m.balanced_accuracy)],
    ["f1_macro", (m) => fmt(m.f1_macro)],
    ["accuracy", (m) => fmt(m.accuracy)],
    ["log_loss", (m) => maybe(m.log_loss)],
    ["auc_ovr", (m) => maybe(m.auc_ovr)],
  ];
  const metricsTable = [
    `| ${t("modelcard.metrics.metric")} | ${t("modelcard.metrics.model")} | ${t("results.baselines.majority")} | ${t("results.baselines.logistic")} |`,
    "| --- | --- | --- | --- |",
    ...rows.map(
      ([key, show]) =>
        `| ${t(`results.metrics.${key}`)} | ${show(model)} | ${show(baselines.majority)} | ${show(baselines.logistic)} |`,
    ),
  ].join("\n");
  const verdictHeadline = t(`results.verdict.${result.verdict.level}`, {
    name: t(`results.candidates.short.${result.modelName}`),
  });
  const verdictDetail = t(`results.verdict.${result.verdict.level}Detail`, {
    delta: `+${fmt(result.verdict.delta)}`,
    metric: t(`results.metrics.${result.verdict.primaryMetric}`),
    model: fmt(result.verdict.modelScore),
    baseline: fmt(result.verdict.baselineScore),
  });
  // Una celda de tabla markdown no admite «|» ni saltos: el nombre se escapa.
  const cell = (name: string) => name.replace(/\|/g, "\\|").replace(/\s+/g, " ");
  const perClassTable = [
    `| ${t("results.multiclass.class")} | ${t("results.metrics.precision")} | ${t("results.metrics.recall")} | ${t("results.metrics.f1")} | ${t("results.multiclass.support")} |`,
    "| --- | --- | --- | --- | --- |",
    ...perClass.map(
      (c, i) =>
        `| ${cell(classes[i]!)} | ${fmt(c.precision)} | ${fmt(c.recall)} | ${fmt(c.f1)} | ${c.support} |`,
    ),
  ].join("\n");
  const confusion = [
    `| ${t("results.multiclass.realPredicted")} | ${classes.map(cell).join(" | ")} |`,
    `| --- |${" --- |".repeat(classes.length)}`,
    ...confusionMatrix.map(
      (row, i) => `| ${cell(classes[i]!)} | ${row.join(" | ")} |`,
    ),
  ].join("\n");
  return {
    target: t("modelcard.data.targetMulticlass", {
      target: input.target,
      count: classes.length,
    }),
    split: t("modelcard.split.sizes", {
      train: result.nTrain,
      test: result.nTest,
      seed: input.seed,
    }),
    baselines: t("modelcard.method.baselinesMulticlass"),
    metricsTable,
    testNote: t("results.multiclass.testNote"),
    verdict: [
      `**${verdictHeadline}** — ${verdictDetail}`,
      "",
      t("modelcard.verdict.primaryMulticlass", {
        k: classes.length,
        chance: fmt(1 / classes.length),
      }),
    ].join("\n"),
    estimate: [
      `## ${t("modelcard.sections.multiclass")}`,
      "",
      perClassTable,
      "",
      t("modelcard.multiclass.confusion"),
      "",
      confusion,
      "",
    ],
    direction: (key) =>
      key === "categorical"
        ? t("narration.template.direction.categorical")
        : t("modelcard.multiclass.direction"),
    importance: (value) => value.toFixed(4),
    narrative: t("modelcard.multiclass.noAi"),
  };
}

function regressionBlocks(
  result: RegressionResult,
  input: ModelCardInput,
  t: T,
): TaskBlocks {
  const { model, baselines, targetStats, residuals } = result;
  const q = quantityFormatter(result, [
    model.mae,
    model.medae,
    baselines.median.mae,
    baselines.linear.mae,
  ]);
  const pct = (value: number | null) =>
    value === null ? "—" : `${(value * 100).toFixed(1)} %`;
  const rows: [string, (m: RegressionResult["model"]) => string][] = [
    ["mae", (m) => q(m.mae)],
    ["rmse", (m) => q(m.rmse)],
    ["r2", (m) => m.r2.toFixed(2)],
    ["medae", (m) => q(m.medae)],
    ["mape", (m) => pct(m.mape)],
  ];
  const metricsTable = [
    `| ${t("modelcard.metrics.metric")} | ${t("modelcard.metrics.model")} | ${t("results.baselines.median")} | ${t("results.baselines.linear")} |`,
    "| --- | --- | --- | --- |",
    ...rows.map(
      ([key, show]) =>
        `| ${t(`results.metrics.${key}`)} | ${show(model)} | ${show(baselines.median)} | ${show(baselines.linear)} |`,
    ),
  ].join("\n");
  const text = regressionVerdictText(result, t);
  // El objetivo en TRAIN con los decimales con que el usuario lo escribió.
  const stat = (value: number) =>
    withUnit(formatQuantity(value, targetStats.decimals), result.unit);
  const err = quantityFormatter(result, [residuals.p25, residuals.p75]);
  return {
    target: t("modelcard.data.targetQuantity", { target: input.target }),
    split: t("modelcard.split.sizesQuantity", {
      train: result.nTrain,
      test: result.nTest,
      seed: input.seed,
    }),
    baselines: t("modelcard.method.baselinesQuantity"),
    metricsTable,
    testNote: t("results.regression.testNote"),
    verdict: [
      `**${text.headline}** — ${text.detail}`,
      "",
      t("modelcard.verdict.primaryQuantity"),
    ].join("\n"),
    estimate: [
      `## ${t("modelcard.sections.estimate")}`,
      "",
      `- ${t("modelcard.estimate.task")}`,
      `- ${
        result.unit.symbol
          ? t("modelcard.estimate.unit", { unit: result.unit.symbol })
          : t("modelcard.estimate.noUnit", { column: input.target })
      }`,
      `- ${t("modelcard.estimate.targetStats", {
        mean: stat(targetStats.mean),
        std: stat(targetStats.std),
        min: stat(targetStats.min),
        median: stat(targetStats.median),
        max: stat(targetStats.max),
        count: targetStats.decimals,
      })}`,
      `- ${t("modelcard.estimate.errors", {
        p25: err(residuals.p25),
        p75: err(residuals.p75),
        abs90: quantityFormatter(result, [residuals.abs_p90])(
          residuals.abs_p90,
        ),
        total: result.predVsReal.n_total,
      })}`,
      `- ${t("modelcard.estimate.noAi")}`,
      "",
    ],
    direction: (key) =>
      key === "positive" || key === "negative"
        ? t(`narration.template.regression.direction.${key}`)
        : t(`narration.template.direction.${key}`),
    importance: importanceFormatter(
      result,
      result.explainability.features.map((f) => f.importance),
    ),
    narrative: t("modelcard.estimate.noAi"),
  };
}

export function buildModelCard(input: ModelCardInput): string {
  const { locale, result } = input;
  const t = (key: string, params?: TParams) => translate(locale, key, params);
  const section = (key: string) => `## ${t(`modelcard.sections.${key}`)}`;
  const task = taskOf(result);
  const blocks = matchByTask(result, {
    binaria: (binary) => binaryBlocks(binary, input, t),
    multiclase: (multi) => multiclassBlocks(multi, input, t),
    numerica: (regression) => regressionBlocks(regression, input, t),
  });

  const date = (input.date ?? new Date()).toLocaleDateString(
    locale === "es" ? "es-ES" : "en-US",
    { year: "numeric", month: "long", day: "numeric" },
  );

  const explainTable = [
    `| ${t("modelcard.explainability.feature")} | ${t("modelcard.explainability.kind")} | ${t("modelcard.explainability.importance")} | ${t("modelcard.explainability.direction")} |`,
    "| --- | --- | --- | --- |",
    ...result.explainability.features.map((feature) => {
      const kind = t(`config.profile.${feature.kind}`);
      const directionKey =
        feature.kind === "categorical"
          ? "categorical"
          : (DIRECTION_KEY[feature.direction ?? ""] ?? "unclear");
      const direction = blocks.direction(directionKey);
      return `| ${feature.name} | ${kind} | ${blocks.importance(feature.importance)} | ${direction} |`;
    }),
  ].join("\n");

  const leakageBlock =
    result.leakage.length > 0
      ? t("modelcard.leakage.found", {
          columns: result.leakage.map((f) => `«${f.column}»`).join(", "),
        })
      : t("modelcard.leakage.none");

  const narrativeBlock = `${section("narrative")}\n\n${blocks.narrative}`;

  // S4 — nombre del modelo ganador y candidatos comparados (parametrizados; ya
  // no se hardcodea "Random Forest").
  const modelLabel = (name: MemberId) => t(memberNameKey(name, task));
  const candidatesList = result.candidates
    .map((c) => modelLabel(c.name))
    .join(" · ");

  // S5 — la liga: cuántos compitieron, cómo se eligió y si lo eligió el usuario.
  const sel = result.selection;
  const short = (name: MemberId) => t(`results.candidates.short.${name}`);
  const selectionSection = [
    section("selection"),
    "",
    `- ${t("modelcard.selection.league", {
      count: sel.competitors,
      k: sel.k,
      metric: t(`results.metrics.${sel.metric}`),
    })}`,
    `- ${t("modelcard.selection.rule", { best: short(sel.best) })}`,
    `- ${t(`modelcard.selection.${sel.by}`, {
      model: modelLabel(result.modelName),
      winner: modelLabel(sel.cvWinner),
    })}`,
    `- ${t("modelcard.selection.time", {
      seconds: (sel.elapsedMs / 1000).toFixed(1),
    })}`,
    ...(result.smallSample
      ? [
          `- ${t("modelcard.selection.smallSample", {
            rows: SMALL_SAMPLE_ROWS,
          })}`,
        ]
      : []),
    "",
  ];

  // S4 — categorías raras agrupadas por el pipeline (si las hubo).
  const rareEntries = Object.entries(result.rareCategories ?? {});
  const rareLine =
    rareEntries.length > 0
      ? [
          `- ${t("modelcard.method.rareCategories", {
            cols: rareEntries
              .map(([col, cats]) => `«${col}» (${cats.join(", ")})`)
              .join("; "),
          })}`,
        ]
      : [];

  // S4 — sección de saneamiento: cifras EXACTAS y deterministas (nunca del LLM).
  const san = input.sanitation;
  const sanitationSection =
    san && !san.clean
      ? [
          section("sanitation"),
          "",
          ...(san.duplicateRowsRemoved > 0
            ? [
                `- ${t("modelcard.sanitation.duplicates", {
                  count: san.duplicateRowsRemoved,
                })}`,
              ]
            : []),
          ...san.exclusions.map(
            (ex) =>
              `- ${t(`modelcard.sanitation.exclusion.${ex.reason}`, {
                column: ex.column,
              })}`,
          ),
          ...san.coercions.map(
            (co) =>
              `- ${t("modelcard.sanitation.coercion", {
                column: co.column,
                count: co.cellsNulled,
              })}`,
          ),
          "",
        ]
      : [section("sanitation"), "", t("modelcard.sanitation.none"), ""];

  return [
    `# ${t("modelcard.title", { name: input.datasetName })}`,
    "",
    t("modelcard.generated", { date }),
    "",
    section("data"),
    "",
    `- ${t("modelcard.data.dataset", { name: input.datasetName })}`,
    `- ${t("modelcard.data.shape", {
      rows: result.nTrain + result.nTest,
      cols: input.cols,
      numeric: input.numericFeatures,
      categorical: input.categoricalFeatures,
    })}`,
    `- ${blocks.target}`,
    "",
    ...blocks.estimate,
    ...sanitationSection,
    section("split"),
    "",
    `- ${blocks.split}`,
    `- ${t("modelcard.split.rule")}`,
    "",
    section("method"),
    "",
    `- ${t("modelcard.method.pipeline")}`,
    `- ${blocks.baselines} ${t("modelcard.method.models", {
      model: modelLabel(result.modelName),
      candidates: candidatesList,
    })}`,
    ...rareLine,
    "",
    ...selectionSection,
    section("metrics"),
    "",
    blocks.metricsTable,
    "",
    blocks.testNote,
    "",
    section("verdict"),
    "",
    blocks.verdict,
    "",
    section("leakage"),
    "",
    leakageBlock,
    "",
    section("explainability"),
    "",
    t("modelcard.explainability.method", {
      scoring: result.explainability.scoring,
      repeats: result.explainability.n_repeats,
    }),
    "",
    explainTable,
    "",
    narrativeBlock,
    "",
    section("limits"),
    "",
    `- ${t("modelcard.limits.tasks")}`,
    `- ${t("modelcard.limits.leakage")}`,
    `- ${t("modelcard.limits.explainability")}`,
    `- ${t("modelcard.limits.dates")}`,
    "",
  ].join("\n");
}

export function modelCardFileName(datasetName: string): string {
  return `model-card-${datasetSlug(datasetName) || "experimento"}.md`;
}

// --- S7: la model card de AGRUPAR (ADR 016) ----------------------------------

export type ClusterCardInput = {
  locale: Locale;
  datasetName: string;
  cols: number;
  seed: number;
  /** Las columnas que no entraron, con su razón (P5). */
  excluded: readonly ClusterExclusion[];
  result: ClusterResult;
  sanitation?: SanitationReport | null;
  date?: Date;
};

/**
 * La constancia de un AGRUPAMIENTO: sin objetivo, sin prueba y sin veredicto
 * contra un baseline. Lo que sirve para creer es la lectura (contra datos sin
 * estructura + la estabilidad). Los perfiles (medias, modas, columnas) aparecen,
 * como la clase positiva en la binaria: el documento no sale del equipo salvo que
 * el usuario lo comparta. Las etiquetas por fila, jamás (P13).
 */
export function buildClusterCard(input: ClusterCardInput): string {
  const { locale, result } = input;
  const t = (key: string, params?: TParams) => translate(locale, key, params);
  const section = (key: string) => `## ${t(`modelcard.sections.${key}`)}`;
  const n = (value: number) => thousands(value, locale === "es" ? "." : ",");
  const two = (value: number) => value.toFixed(2);
  const pct = (share: number) => Math.round(share * 100);
  const short = (id: MemberId) => t(`results.candidates.short.${id}`);
  const modelLabel = (id: MemberId) => t(memberNameKey(id, "agrupar"));
  const date = (input.date ?? new Date()).toLocaleDateString(
    locale === "es" ? "es-ES" : "en-US",
    { year: "numeric", month: "long", day: "numeric" },
  );
  const { reading, selection, profiles, assignment, league } = result;
  const retained = league.find((r) => r.name === result.modelName);
  const k = retained?.k ?? profiles.groups.length;
  const first = profiles.groups[0];
  const numeric = first ? Object.keys(first.numeric) : [];
  const categorical = first ? Object.keys(first.categorical) : [];
  const readingParams = {
    k,
    model: short(result.modelName),
    score: two(reading.score),
    nullScore: two(reading.null_score),
    gap: two(reading.gap),
    gapMin: two(CLUSTER_GAP_MIN),
    ari: two(reading.stability.ari_mean),
    ariMin: two(CLUSTER_STABILITY_MIN),
    runs: reading.stability.runs,
    fraction: pct(reading.stability.fraction),
  };
  const cell = (text: string) => text.replace(/\|/g, "\\|");

  const leagueTable = [
    `| ${t("cluster.league.cols.model")} | ${t("cluster.league.cols.k")} | ${t("cluster.league.cols.silhouette")} | ${t("cluster.league.cols.noise")} | ${t("cluster.league.cols.score")} |`,
    "| --- | --- | --- | --- | --- |",
    ...league.map(
      (row) =>
        `| ${modelLabel(row.name)} | ${
          row.k === null
            ? "—"
            : t(`cluster.league.kBy.${row.k_by}`, { k: row.k })
        } | ${row.silhouette === null ? "—" : two(row.silhouette)} | ${
          row.noise_share === null ? "—" : `${pct(row.noise_share)} %`
        } | ${row.score === null ? t(`cluster.league.status.${row.status}`, { type: row.error_type ?? "" }) : two(row.score)} |`,
    ),
  ].join("\n");

  const groupLines = profiles.groups.map((group) => {
    const parts = profiles.separating.map((s) => {
      if (s.kind === "numeric") {
        const value = group.numeric[s.column];
        return `«${cell(s.column)}» ${value === null || value === undefined ? "—" : formatQuantity(value, 2)}`;
      }
      const mode = group.categorical[s.column];
      return `«${cell(s.column)}» ${mode ? `${cell(mode.mode)} (${pct(mode.share)} %)` : "—"}`;
    });
    return `- ${t("cluster.group", { n: group.group + 1 })}: ${t(
      "cluster.profiles.size",
      { size: n(group.size), share: pct(group.share) },
    )}${parts.length ? ` — ${parts.join("; ")}` : ""}`;
  });

  const san = input.sanitation;
  const sanitationSection =
    san && !san.clean
      ? [
          section("sanitation"),
          "",
          ...(san.duplicateRowsRemoved > 0
            ? [
                `- ${t("modelcard.sanitation.duplicates", {
                  count: san.duplicateRowsRemoved,
                })}`,
              ]
            : []),
          ...san.exclusions.map(
            (ex) =>
              `- ${t(`modelcard.sanitation.exclusion.${ex.reason}`, {
                column: ex.column,
              })}`,
          ),
          ...san.coercions.map(
            (co) =>
              `- ${t("modelcard.sanitation.coercion", {
                column: co.column,
                count: co.cellsNulled,
              })}`,
          ),
          "",
        ]
      : [section("sanitation"), "", t("modelcard.sanitation.none"), ""];

  const sampled = league.find((row) => row.sample_rows !== null);

  return [
    `# ${t("modelcard.title", { name: input.datasetName })}`,
    "",
    t("modelcard.generated", { date }),
    "",
    section("data"),
    "",
    `- ${t("modelcard.data.dataset", { name: input.datasetName })}`,
    `- ${t("modelcard.cluster.shape", { rows: n(result.nRows), cols: input.cols })}`,
    `- ${t("modelcard.cluster.task")}`,
    `- ${
      result.distance === "numeric"
        ? t("modelcard.cluster.distanceNumeric", {
            count: numeric.length,
            columns: numeric.map((c) => `«${c}»`).join(", "),
            categorical: categorical.length
              ? categorical.map((c) => `«${c}»`).join(", ")
              : "—",
          })
        : t("modelcard.cluster.distanceAll", {
            columns: [...numeric, ...categorical].map((c) => `«${c}»`).join(", "),
          })
    }`,
    ...input.excluded.map(
      (ex) =>
        `- ${t(`cluster.plan.excluded.${ex.reason}`, { column: ex.column })}`,
    ),
    "",
    ...sanitationSection,
    section("method"),
    "",
    `- ${t("modelcard.cluster.pipeline", { seed: input.seed })}`,
    `- ${t("modelcard.cluster.members", {
      count: selection.competitors,
      sample: n(result.silhouetteSample),
      min: CLUSTER_K_MIN,
      max: result.kRange[1],
    })}`,
    `- ${
      selection.by === "user"
        ? t("modelcard.cluster.chosen", {
            model: modelLabel(result.modelName),
            winner: modelLabel(selection.consensusWinner),
          })
        : t("modelcard.cluster.consensus", {
            votes: selection.votes,
            voters: selection.voters,
            k: selection.k,
            model: modelLabel(result.modelName),
          })
    }`,
    ...(sampled && sampled.sample_rows !== null
      ? [
          `- ${t("cluster.sample.title", {
            sample: n(sampled.sample_rows),
            rows: n(result.nRows),
          })} ${t("cluster.sample.why", { max: n(AGGLO_MAX_ROWS) })}`,
        ]
      : []),
    `- ${t("modelcard.selection.time", {
      seconds: (selection.elapsedMs / 1000).toFixed(1),
    })}`,
    ...(result.smallSample
      ? [`- ${t("modelcard.selection.smallSample", { rows: SMALL_SAMPLE_ROWS })}`]
      : []),
    "",
    section("clusterLeague"),
    "",
    leagueTable,
    "",
    t("cluster.league.scoreHow"),
    "",
    section("clusterReading"),
    "",
    `**${t(`cluster.reading.${reading.level}`, readingParams)}** — ${t(
      `cluster.reading.${reading.level}Detail`,
      readingParams,
    )}`,
    "",
    t("cluster.noTest"),
    "",
    section("clusterGroups"),
    "",
    ...groupLines,
    ...(profiles.noise
      ? [
          `- ${t("cluster.noise.title")}: ${t("cluster.profiles.size", {
            size: n(profiles.noise.size),
            share: pct(profiles.noise.share),
          })}`,
        ]
      : []),
    "",
    section("clusterAssign"),
    "",
    `- ${t(`cluster.assign.${assignment.method}`)}`,
    `- ${t("cluster.assign.agreement", { pct: pct(assignment.train_agreement) })}`,
    "",
    section("leakage"),
    "",
    t("modelcard.cluster.noLeakage"),
    "",
    section("narrative"),
    "",
    t("modelcard.cluster.noAi"),
    "",
    section("limits"),
    "",
    `- ${t("modelcard.cluster.limits.cause")}`,
    `- ${t("modelcard.cluster.limits.silhouette", { sample: n(SILHOUETTE_SAMPLE) })}`,
    `- ${t("modelcard.cluster.limits.agglomerative", { max: n(AGGLO_MAX_ROWS) })}`,
    `- ${t("modelcard.limits.dates")}`,
    "",
  ].join("\n");
}
