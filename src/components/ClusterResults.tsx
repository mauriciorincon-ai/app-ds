"use client";

import type { Placement, RouteProfile, Routing } from "@/engine/encarrilador";
import type { MemberId } from "@/engine/roster";
import type { SanitationReport } from "@/engine/sanitize";
import {
  AGGLO_MAX_ROWS,
  CLUSTER_GAP_MIN,
  CLUSTER_STABILITY_MIN,
  hasConsensus,
} from "@/engine/verdict";
import { useI18n } from "@/i18n/provider";
import { formatEstimate } from "@/lib/duration";
import { buildClusterCard } from "@/lib/modelcard";
import { formatQuantity, quantityDecimals, thousands } from "@/lib/quantity";
import type {
  ChoiceState,
  ExportState,
  LabelsNames,
  LabelsState,
  Level2State,
  RunMeta,
} from "@/lib/useExperiment";
import type {
  ClusterMemberRow,
  ClusterResult,
  GroupProfile,
} from "@/workers/protocol";
import { FichaButton } from "./FichaButton";
import type { FichaStatus } from "./FichaModelo";
import { Level2Card } from "./Level2Card";
import { ModelCardView } from "./ModelCardView";
import { Badge, Button, Card, Icon } from "./ui";
import { VerdictCard, type Banner } from "./VerdictCard";

// S7 (ADR 016): Resultados al AGRUPAR, sin objetivo. No hay conjunto de prueba ni
// veredicto contra un baseline: lo que sirve para creer es la LECTURA (el puntaje
// contra el mismo agrupador sobre datos sin estructura + la estabilidad al
// re-muestrear); la tabla de agrupadores sirve para elegir. Los perfiles, las
// medias y las modas son datos del usuario: viven solo en memoria (P13). Las
// etiquetas por fila ni siquiera llegan aquí: se piden al worker al descargar.

type T = (key: string, params?: Record<string, string | number>) => string;

const two = (value: number) => value.toFixed(2);
const pct = (share: number) => Math.round(share * 100);

/** Una cifra de un perfil en las unidades del usuario: con los decimales que pide
 *  su columna, y en notación científica si es diminuta (~1e-11 no es «0»). */
function profileNumber(value: number, decimals: number): string {
  const abs = Math.abs(value);
  return abs > 0 && abs < 1e-4
    ? value.toExponential(2)
    : formatQuantity(value, decimals);
}

/** El número de un grupo para una persona: del 1 en adelante. */
const groupLabel = (t: T, group: number) =>
  t("cluster.group", { n: group + 1 });

export type ClusterResultsProps = {
  result: ClusterResult;
  datasetName: string | null;
  cols: number;
  runMeta: RunMeta;
  sanitation: SanitationReport | null;
  onAgain: () => void;
  onUseModel: () => void;
  onExportModel: () => void;
  exportState: ExportState;
  routing: Routing | null;
  choice: ChoiceState;
  onChoose: (member: MemberId) => void;
  modelReady?: boolean;
  profile?: RouteProfile | null;
  forced?: readonly MemberId[];
  level2?: Level2State;
  onRunLevel2?: (extraForced: MemberId[]) => void;
  labels?: LabelsState;
  onDownloadLabels?: (names: LabelsNames) => void;
};

export function ClusterResults({
  result,
  datasetName,
  cols,
  runMeta,
  sanitation,
  onAgain,
  onUseModel,
  onExportModel,
  exportState,
  routing,
  choice,
  onChoose,
  modelReady = true,
  profile = null,
  forced = [],
  level2 = { status: "idle" },
  onRunLevel2,
  labels = "idle",
  onDownloadLabels,
}: ClusterResultsProps) {
  const { t } = useI18n();
  const n = (value: number) => thousands(value);
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {t("cluster.title")}
        </p>
        {datasetName && (
          <p className="font-mono text-sm tabular-nums text-ink-muted">
            {t("results.dataset", { name: datasetName, rows: result.nRows })}
          </p>
        )}
      </header>

      <ClusterReading result={result} n={n} />

      <GroupProfiles result={result} n={n} />

      <ClusterLeague
        result={result}
        routing={routing}
        choice={choice}
        onChoose={onChoose}
        n={n}
      />
      {profile && onRunLevel2 && (
        <Level2Card
          result={result}
          profile={profile}
          forced={forced}
          level2={level2}
          busy={!modelReady || choice.status === "fitting"}
          onRun={onRunLevel2}
        />
      )}

      {onDownloadLabels && (
        <LabelsDownload
          labels={labels}
          disabled={!modelReady}
          onDownload={onDownloadLabels}
        />
      )}

      <ClusterUse
        result={result}
        modelReady={modelReady}
        exportState={exportState}
        onUseModel={onUseModel}
        onExportModel={onExportModel}
      />

      <ModelCardView
        datasetName={datasetName ?? "dataset"}
        build={(cardLocale) =>
          buildClusterCard({
            locale: cardLocale,
            datasetName: datasetName ?? "dataset",
            cols,
            seed: runMeta.seed,
            excluded: runMeta.excluded ?? [],
            result,
            sanitation,
          })
        }
      />

      <div>
        <Button variant="secondary" icon="plus" onClick={onAgain}>
          {t("results.again")}
        </Button>
      </div>
    </div>
  );
}

/** La lectura del agrupamiento retenido: la pieza jerárquica (su h1). */
export function ClusterReading({
  result,
  n,
}: {
  result: ClusterResult;
  n: (value: number) => string;
}) {
  const { t } = useI18n();
  const { reading, modelName, assignment } = result;
  const row = result.league.find((r) => r.name === modelName);
  const k = row?.k ?? result.profiles.groups.length;
  const params = {
    k,
    model: t(`results.candidates.short.${modelName}`),
    score: two(reading.score),
    nullScore: two(reading.null_score),
    gap: two(reading.gap),
    gapMin: two(CLUSTER_GAP_MIN),
    ari: two(reading.stability.ari_mean),
    ariMin: two(CLUSTER_STABILITY_MIN),
    runs: reading.stability.runs,
    fraction: pct(reading.stability.fraction),
  };
  // ● / ⚠ / ○: un disco lleno para «existen» y uno vacío para «no hay estructura».
  // ◆ está reservado para «Elegido por ti» en toda la app (design-system).
  const MARKS = {
    exist: { tone: "positive", mark: "●" },
    fragile: { tone: "caution", mark: "⚠" },
    none: { tone: "ink", mark: "○" },
  } as const;
  const banner: Banner = {
    ...MARKS[reading.level],
    headline: t(`cluster.reading.${reading.level}`, params),
    detail: t(`cluster.reading.${reading.level}Detail`, params),
  };
  return (
    <VerdictCard banner={banner}>
      <p className="mt-2 text-sm text-ink-muted">{t("cluster.noTest")}</p>
      {result.selection.by === "user" && (
        <p className="mt-2 text-sm font-medium">{t("cluster.chosenNote")}</p>
      )}
      {/* Decisión 8 del usuario: la muestra del jerárquico, visible y explicada. */}
      {assignment.sample_rows !== null && (
        <AggloSampleNote
          sample={assignment.sample_rows}
          rows={result.nRows}
          n={n}
        />
      )}
    </VerdictCard>
  );
}

/**
 * Decisión 8 del usuario (STOP de la F0): por encima de AGGLO_MAX_ROWS filas, el
 * agrupamiento jerárquico se ajusta sobre una muestra sembrada y asigna el resto
 * al grupo más cercano. Se dice siempre que pasa, con el porqué en llano.
 */
export function AggloSampleNote({
  sample,
  rows,
  n,
}: {
  sample: number;
  rows: number;
  n: (value: number) => string;
}) {
  const { t } = useI18n();
  return (
    <div className="mt-3 flex items-start gap-2 rounded-md border border-hairline bg-sunken p-3 text-sm">
      <Icon name="info" className="mt-0.5 shrink-0 text-ink-muted" />
      <p>
        <span className="font-medium">
          {t("cluster.sample.title", { sample: n(sample), rows: n(rows) })}
        </span>{" "}
        {t("cluster.sample.why", { max: n(AGGLO_MAX_ROWS) })}
      </p>
    </div>
  );
}

/** Qué distingue a cada grupo, en las unidades del usuario. */
function GroupProfiles({
  result,
  n,
}: {
  result: ClusterResult;
  n: (value: number) => string;
}) {
  const { t } = useI18n();
  const { groups, noise, separating } = result.profiles;
  // Decimales por columna: los que piden sus valores juntos (R9 del S6).
  const numericColumns = Object.keys(groups[0]?.numeric ?? {});
  const decimalsOf = Object.fromEntries(
    numericColumns.map((column) => [
      column,
      quantityDecimals(
        groups.flatMap((g) => {
          const v = g.numeric[column];
          return v === null || v === undefined ? [] : [v];
        }),
      ),
    ]),
  );
  // El promedio de los grupos (pesado por su tamaño): la referencia de cada media.
  const weighted = (column: string) => {
    let sum = 0;
    let weight = 0;
    for (const g of groups) {
      const v = g.numeric[column];
      if (v === null || v === undefined) continue;
      sum += v * g.size;
      weight += g.size;
    }
    return weight > 0 ? sum / weight : null;
  };
  const strengthName = (kind: "numeric" | "categorical") =>
    t(`cluster.profiles.strength.${kind}`);
  return (
    <section aria-labelledby="profiles-title" className="flex flex-col gap-3">
      <h2 id="profiles-title" className="text-base font-semibold">
        {t("cluster.profiles.title", { count: groups.length })}
      </h2>
      {separating.length > 0 ? (
        <p className="text-sm">
          {t("cluster.profiles.separating", {
            list: separating
              .map(
                (s) =>
                  `«${s.column}» (${strengthName(s.kind)} ${two(s.strength)})`,
              )
              .join(", "),
          })}
        </p>
      ) : (
        <p className="text-sm text-ink-muted">
          {t("cluster.profiles.noSeparating")}
        </p>
      )}
      <p className="text-xs text-ink-muted">{t("cluster.profiles.how")}</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {groups.map((group) => (
          <li key={group.group}>
            <GroupCard
              group={group}
              separating={separating}
              decimalsOf={decimalsOf}
              average={weighted}
              n={n}
            />
          </li>
        ))}
        {noise && (
          <li>
            <Card className="flex h-full flex-col gap-1 border-dashed p-4">
              <h3 className="text-sm font-semibold">
                <span aria-hidden className="mr-1 text-ink-muted">
                  ○
                </span>
                {t("cluster.noise.title")}
              </h3>
              <p className="font-mono text-sm tabular-nums">
                {t("cluster.profiles.size", {
                  size: n(noise.size),
                  share: pct(noise.share),
                })}
              </p>
              <p className="text-sm text-ink-muted">
                {t("cluster.noise.desc")}
              </p>
            </Card>
          </li>
        )}
      </ul>
    </section>
  );
}

function GroupCard({
  group,
  separating,
  decimalsOf,
  average,
  n,
}: {
  group: GroupProfile;
  separating: ClusterResult["profiles"]["separating"];
  decimalsOf: Record<string, number>;
  average: (column: string) => number | null;
  n: (value: number) => string;
}) {
  const { t } = useI18n();
  const id = `group-${group.group}`;
  const numericLine = (column: string) => {
    const value = group.numeric[column];
    const avg = average(column);
    const decimals = decimalsOf[column] ?? 0;
    return value === null || value === undefined
      ? t("cluster.profiles.noValue", { column })
      : t("cluster.profiles.numeric", {
          column,
          value: profileNumber(value, decimals),
          average: avg === null ? "—" : profileNumber(avg, decimals),
        });
  };
  const categoricalLine = (column: string) => {
    const mode = group.categorical[column];
    return mode
      ? t("cluster.profiles.categorical", {
          column,
          mode: mode.mode,
          share: pct(mode.share),
        })
      : t("cluster.profiles.noValue", { column });
  };
  const line = (column: string, kind: "numeric" | "categorical") =>
    kind === "numeric" ? numericLine(column) : categoricalLine(column);
  const shown = new Set(separating.map((s) => s.column));
  const rest = [
    ...Object.keys(group.numeric).map((c) => [c, "numeric"] as const),
    ...Object.keys(group.categorical).map((c) => [c, "categorical"] as const),
  ].filter(([c]) => !shown.has(c));
  return (
    <Card className="flex h-full flex-col gap-2 p-4">
      <section aria-labelledby={id} className="flex flex-col gap-2">
        <h3 id={id} className="text-sm font-semibold">
          {groupLabel(t, group.group)}
        </h3>
        <p className="font-mono text-sm tabular-nums">
          {t("cluster.profiles.size", {
            size: n(group.size),
            share: pct(group.share),
          })}
        </p>
        {separating.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm">
            {separating.map((s) => (
              <li key={s.column} className="break-words">
                {line(s.column, s.kind)}
              </li>
            ))}
          </ul>
        )}
        {rest.length > 0 && (
          <details className="text-sm">
            <summary className="min-h-11 cursor-pointer py-2 text-ink-muted underline-offset-4 hover:underline">
              {t("cluster.profiles.all", { count: rest.length })}
            </summary>
            <ul className="flex flex-col gap-1 text-ink-muted">
              {rest.map(([column, kind]) => (
                <li key={column} className="break-words">
                  {line(column, kind)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </Card>
  );
}

// Al agrupar ningún agrupador queda «fuera» (no hay reglas de exclusión): los que
// no corrieron son los pendientes del Nivel 2.
type Entry =
  | { kind: "ran"; row: ClusterMemberRow }
  | { kind: "pending"; placement: Placement };

/** La tabla de agrupadores: sirve para ELEGIR (no para creer). */
function ClusterLeague({
  result,
  routing,
  choice,
  onChoose,
  n,
}: {
  result: ClusterResult;
  routing: Routing | null;
  choice: ChoiceState;
  onChoose: (member: MemberId) => void;
  n: (value: number) => string;
}) {
  const { t } = useI18n();
  const { league, selection } = result;
  const consensus = hasConsensus(selection);
  const short = (id: MemberId) => t(`results.candidates.short.${id}`);
  const ran = league.map((r) => r.name);
  const placementOf = (id: MemberId) =>
    routing!.placements.find((p) => p.id === id)!;
  // Los que votan, por puntaje (mayor es mejor); después, los que no dieron grupos.
  const scoreKey = (row: ClusterMemberRow) => row.score ?? -Infinity;
  const entries: Entry[] = [
    ...[...league]
      .sort((a, b) => scoreKey(b) - scoreKey(a))
      .map((row): Entry => ({ kind: "ran", row })),
    ...(routing?.level2 ?? [])
      .filter((id) => !ran.includes(id))
      .map((id): Entry => ({ kind: "pending", placement: placementOf(id) })),
  ];
  const fitting = choice.status === "fitting";
  const ficha = (id: MemberId, status: FichaStatus, emphasis: string) => (
    <FichaButton
      target={{ id, status, task: "agrupar" }}
      label={t("league.fichaAria", { model: short(id) })}
      className={emphasis}
    >
      {short(id)}
    </FichaButton>
  );
  const kText = (row: ClusterMemberRow) =>
    row.k === null ? "—" : t(`cluster.league.kBy.${row.k_by}`, { k: row.k });
  const noiseText = (row: ClusterMemberRow) =>
    row.noise_share === null ? "—" : `${pct(row.noise_share)} %`;
  const statusText = (row: ClusterMemberRow) =>
    t(`cluster.league.status.${row.status}`, { type: row.error_type ?? "" });

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-col gap-1">
        <h2 id="cluster-league-title" className="text-base font-semibold">
          {t("cluster.league.title", { count: league.length })}
        </h2>
        <p className="text-sm">
          {t("cluster.league.rule", { sample: n(result.silhouetteSample) })}
        </p>
        <p className="text-sm text-ink-muted">
          <span aria-hidden className="mr-1 text-accent">
            ★
          </span>
          {consensus
            ? t("cluster.league.consensus", {
                k: selection.k,
                votes: selection.votes,
                voters: selection.voters,
              })
            : t("cluster.league.noConsensus")}
        </p>
      </div>
      {/* relative: un sr-only sin bloque contenedor estira la página (S5 F2). */}
      <div
        className="relative overflow-x-auto"
        role="region"
        tabIndex={0}
        aria-labelledby="cluster-league-title"
      >
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
              <th
                scope="col"
                className="border-b border-hairline px-2 py-2 font-semibold"
              >
                {t("cluster.league.cols.model")}
              </th>
              <th
                scope="col"
                className="border-b border-hairline px-2 py-2 font-semibold"
              >
                {t("cluster.league.cols.k")}
              </th>
              <th
                scope="col"
                className="hidden border-b border-hairline px-2 py-2 font-semibold sm:table-cell"
              >
                {t("cluster.league.cols.silhouette")}
              </th>
              <th
                scope="col"
                className="hidden border-b border-hairline px-2 py-2 font-semibold sm:table-cell"
              >
                {t("cluster.league.cols.noise")}
              </th>
              <th
                scope="col"
                className="border-b border-hairline px-2 py-2 font-semibold"
              >
                {t("cluster.league.cols.score")}
              </th>
              <th
                scope="col"
                className="hidden border-b border-hairline px-2 py-2 font-semibold sm:table-cell"
              >
                {t("league.cols.use")}
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => {
              if (entry.kind !== "ran") {
                const p = entry.placement;
                return (
                  <tr
                    key={p.id}
                    className="border-b border-hairline text-ink-muted"
                  >
                    <th
                      scope="row"
                      colSpan={6}
                      className="px-2 py-2 text-left font-normal"
                    >
                      {ficha(p.id, { kind: "pending" }, "")}
                      <div className="text-xs">
                        {t("league.status.pending", {
                          time: formatEstimate(p.estimateS),
                        })}
                      </div>
                    </th>
                  </tr>
                );
              }
              const row = entry.row;
              const isWinner = row.name === selection.consensusWinner;
              const isActive = row.name === result.modelName;
              const isChosen = isActive && selection.by === "user";
              const canChoose =
                (row.status === "ok" || row.status === "no-converge") &&
                !isActive;
              const thisFitting =
                choice.status === "fitting" && choice.member === row.name;
              const action = isActive ? (
                <Badge tone="positive">
                  <span aria-hidden>✓</span> {t("league.inUse")}
                </Badge>
              ) : canChoose ? (
                <Button
                  variant="secondary"
                  icon={isWinner ? "back" : "check"}
                  disabled={fitting}
                  aria-label={
                    isWinner
                      ? t("cluster.league.backToWinner")
                      : t("league.chooseAria", { model: short(row.name) })
                  }
                  onClick={() => onChoose(row.name)}
                  className="text-left sm:whitespace-nowrap"
                >
                  {thisFitting
                    ? t("league.fitting")
                    : isWinner
                      ? t("cluster.league.backToWinner")
                      : t("league.choose")}
                </Button>
              ) : null;
              return (
                <tr
                  key={row.name}
                  className={`border-b border-hairline ${
                    isWinner
                      ? "border-l-4 border-l-accent bg-accent/5"
                      : isChosen
                        ? "border-l-4 border-l-ink bg-sunken"
                        : ""
                  }`}
                >
                  <th
                    scope="row"
                    className="px-2 py-2 text-left align-top font-normal"
                  >
                    {ficha(
                      row.name,
                      isWinner
                        ? { kind: consensus ? "consensus" : "score" }
                        : isChosen
                          ? { kind: "chosen" }
                          : row.score === null
                            ? { kind: "failed" }
                            : {
                                kind: "competitor",
                                rank: index + 1,
                                total: league.length,
                              },
                      isWinner || isChosen ? "font-semibold" : "font-medium",
                    )}
                    <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs">
                      {isWinner && (
                        <span className="inline-flex items-center gap-1 font-semibold text-accent">
                          <span
                            aria-hidden
                            className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[0.625rem] text-accent-ink"
                          >
                            ★
                          </span>
                          {t(
                            consensus
                              ? "cluster.league.mark.winner"
                              : "cluster.league.mark.winnerScore",
                          )}
                        </span>
                      )}
                      {isChosen && (
                        <span className="inline-flex items-center gap-1 font-semibold">
                          <span
                            aria-hidden
                            className="flex h-4 w-4 items-center justify-center rounded-full bg-ink text-[0.625rem] text-bg"
                          >
                            ◆
                          </span>
                          {t("league.mark.chosen")}
                        </span>
                      )}
                      {row.status !== "ok" && (
                        <span
                          className={
                            row.status === "error"
                              ? "text-negative"
                              : "text-caution"
                          }
                        >
                          {statusText(row)}
                        </span>
                      )}
                      {/* Móvil: la silueta y el ruido, en su propia línea. */}
                      <span className="text-ink-muted sm:hidden">
                        {t("cluster.league.mobile", {
                          silhouette:
                            row.silhouette === null ? "—" : two(row.silhouette),
                          noise: noiseText(row),
                        })}
                      </span>
                    </div>
                    {/* Decisión 8: la muestra del jerárquico, en su fila. */}
                    {row.sample_rows !== null && (
                      <p className="mt-1 flex items-start gap-1 text-xs">
                        <Icon
                          name="info"
                          className="mt-0.5 shrink-0 text-ink-muted"
                        />
                        {t("cluster.sample.title", {
                          sample: n(row.sample_rows),
                          rows: n(result.nRows),
                        })}
                      </p>
                    )}
                    <div className="mt-1.5 sm:hidden">{action}</div>
                  </th>
                  <td className="px-2 py-2 align-top font-mono tabular-nums">
                    {kText(row)}
                  </td>
                  <td className="hidden px-2 py-2 align-top font-mono tabular-nums sm:table-cell">
                    {row.silhouette === null ? "—" : two(row.silhouette)}
                  </td>
                  <td className="hidden px-2 py-2 align-top font-mono tabular-nums sm:table-cell">
                    {noiseText(row)}
                  </td>
                  <td className="px-2 py-2 align-top font-mono tabular-nums">
                    {row.score === null ? "—" : two(row.score)}
                  </td>
                  <td className="hidden px-2 py-2 text-right align-top sm:table-cell">
                    {action}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {choice.status === "error" && (
        <p role="alert" className="text-sm text-negative">
          <span aria-hidden className="mr-1">
            ✕
          </span>
          {t("league.chooseError", { model: short(choice.member) })}
        </p>
      )}
      <p className="text-sm text-ink-muted">{t("cluster.league.scoreHow")}</p>
      {result.smallSample && (
        <p className="text-sm text-caution">
          <span aria-hidden className="mr-1">
            ⚠
          </span>
          {t("roster.cluster.smallSample", { rows: result.nRows })}
        </p>
      )}
      <p className="font-mono text-xs tabular-nums text-ink-muted">
        {t("cluster.league.time", {
          seconds: (selection.elapsedMs / 1000).toFixed(1),
        })}
      </p>
    </Card>
  );
}

/** P13: tus filas con su grupo, como CSV local. */
function LabelsDownload({
  labels,
  disabled,
  onDownload,
}: {
  labels: LabelsState;
  disabled: boolean;
  onDownload: (names: LabelsNames) => void;
}) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="labels-title">
      <Card className="p-5">
        <h2 id="labels-title" className="text-sm font-semibold">
          {t("cluster.labels.title")}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          {t("cluster.labels.desc")}
        </p>
        <div className="mt-3">
          <Button
            icon="download"
            disabled={disabled || labels === "fetching"}
            onClick={() =>
              onDownload({
                column: t("cluster.labels.column"),
                noise: t("cluster.noise.label"),
                fileSuffix: t("cluster.labels.fileSuffix"),
              })
            }
          >
            {labels === "fetching"
              ? t("cluster.labels.fetching")
              : t("cluster.labels.button")}
          </Button>
        </div>
        {(labels === "error" || labels === "unavailable") && (
          <p role="alert" className="mt-2 text-sm text-negative">
            <span aria-hidden className="mr-1">
              ✕
            </span>
            {t(`cluster.labels.${labels}`)}
          </p>
        )}
      </Card>
    </section>
  );
}

/** Usar el agrupamiento: asignar filas nuevas con la misma regla, o exportarlo. */
function ClusterUse({
  result,
  modelReady,
  exportState,
  onUseModel,
  onExportModel,
}: {
  result: ClusterResult;
  modelReady: boolean;
  exportState: ExportState;
  onUseModel: () => void;
  onExportModel: () => void;
}) {
  const { t } = useI18n();
  const { assignment } = result;
  return (
    <section aria-labelledby="use-model-title">
      <Card className="p-5">
        <h2 id="use-model-title" className="text-sm font-semibold">
          {t("cluster.use.title")}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          {t(`cluster.assign.${assignment.method}`)}{" "}
          {t("cluster.assign.agreement", {
            pct: pct(assignment.train_agreement),
          })}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button icon="table" onClick={onUseModel} disabled={!modelReady}>
            {t("cluster.use.button")}
          </Button>
          <Button
            variant="secondary"
            icon="download"
            onClick={onExportModel}
            disabled={exportState === "exporting" || !modelReady}
          >
            {exportState === "exporting"
              ? t("results.export.exporting")
              : t("results.export.button")}
          </Button>
        </div>
        {exportState === "error" && (
          <p role="alert" className="mt-2 text-sm text-negative">
            <span aria-hidden className="mr-1">
              ✕
            </span>
            {t("results.export.error")}
          </p>
        )}
        <p className="mt-3 max-w-prose text-xs text-ink-muted">
          {t("cluster.use.contents")}
        </p>
      </Card>
    </section>
  );
}
