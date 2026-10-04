// E2 — encarrilador de MODELOS (S5, ADR-010): decide quién compite y en qué
// nivel, con una razón por modelo. Determinista y puro: mira la FORMA del dataset
// (filas, ancho tras one-hot, proporción de la clase minoritaria en train) — nunca
// ajusta nada sobre lo que se evalúa, mismo criterio que pickPrimaryMetric.
// Python recibe la lista resultante y no la re-deriva.
//
// La honestidad acompaña y etiqueta; no bloquea ni esconde (regla dura 3):
// «fuera» es una RECOMENDACIÓN con su razón, forzable en el Nivel 2 (U3), y solo
// existe donde el spike de la F0 la respaldó con números (D9).
import {
  calibrationFactor,
  estimateMemberSeconds,
  type CostInput,
} from "@/engine/costos";
import {
  byPriority,
  MEMBERS,
  ROSTER_BY_TASK,
  type MemberId,
} from "@/engine/roster";
import type { TrainTask } from "@/engine/tarea";

/** Techo del Nivel 1 en segundos del equipo de referencia (F0-1, fijado por el usuario). */
export const LEVEL1_CEILING_S = 5;
/** Con menos filas, la red neuronal no aprende nada estable (F0: mala con 200 filas). */
export const MLP_MIN_ROWS = 500;
/** Con la minoritaria ≥ 40 %, la variante balanceada repite a su modelo base. */
export const BALANCED_MIN_MINORITY = 0.4;
/** Pliegues de la CV (F0-6): 5, y 3 por encima de 20.000 filas. */
export const CV_K = 5;
export const CV_K_LARGE = 3;
export const CV_LARGE_FROM_ROWS = 20_001;
/** Por debajo, la tabla avisa «muestra pequeña: la CV varía mucho». */
export const SMALL_SAMPLE_ROWS = 200;

export type RouteProfile = {
  /** S6: la tarea (roster y costos son por tarea). Ausente = binaria (S5). */
  task?: TrainTask;
  /** Filas del dataset con objetivo (train + test). */
  rows: number;
  nTrain: number;
  /** Columnas tras one-hot (estimadas). */
  width: number;
  /** Proporción de la clase minoritaria en train (0..0,5); null sin clases (numérica). */
  minorityShare: number | null;
  /** Pliegues de la CV. */
  k: number;
};

export type OutReason = "mlp-few-rows" | "balanced-not-needed";

export type RouteReason =
  /** Cabe en el techo del Nivel 1. */
  | "fits-ceiling"
  /** El primero del orden entra siempre: nunca hay liga vacía. */
  | "always-first"
  /** No cabe en el techo: queda para el Nivel 2. */
  | "over-ceiling"
  /** Estaba fuera y el usuario lo incluyó de todos modos (U3). */
  | "forced"
  | OutReason;

export type Placement = {
  id: MemberId;
  level: 1 | 2 | "out";
  reason: RouteReason;
  /** Segundos estimados en el equipo de referencia. */
  estimateS: number;
  /** Solo con `forced`: por qué el encarrilador lo dejaba fuera. */
  outReason?: OutReason;
};

export type Routing = {
  /** Uno por miembro del roster, en orden de prioridad. */
  placements: Placement[];
  level1: MemberId[];
  level2: MemberId[];
  out: MemberId[];
  level1EstimateS: number;
  /** El Nivel 2 re-corre la unión (D5): Nivel 1 ∪ Nivel 2. */
  unionEstimateS: number;
};

/** k de la CV: 5 (3 con muchas filas), acotado a la minoritaria de train. null ⇒ no alcanza.
 *  S6: en regresión no hay clases; el tope es el número de filas de train. */
export function chooseCvK(
  rows: number,
  minorityTrainCount: number,
): number | null {
  const k = Math.min(
    rows >= CV_LARGE_FROM_ROWS ? CV_K_LARGE : CV_K,
    minorityTrainCount,
  );
  return k >= 2 ? k : null;
}

function outReasonFor(id: MemberId, profile: RouteProfile): OutReason | null {
  if (id === "mlp" && profile.rows < MLP_MIN_ROWS) return "mlp-few-rows";
  if (
    MEMBERS[id].balanced &&
    profile.minorityShare !== null &&
    profile.minorityShare >= BALANCED_MIN_MINORITY
  ) {
    return "balanced-not-needed";
  }
  return null;
}

/**
 * Reparte el roster: lo que tiene razón medida para quedar fuera, fuera (salvo
 * que el usuario lo fuerce: entonces Nivel 2); el resto, en orden de prioridad,
 * al Nivel 1 mientras quepa en el techo — lo que no cabe, al Nivel 2 (D3). El
 * primero del orden entra siempre.
 */
export function routeModels(
  profile: RouteProfile,
  ceilingS: number = LEVEL1_CEILING_S,
  forced: readonly MemberId[] = [],
): Routing {
  const cost: CostInput = {
    nTrain: profile.nTrain,
    width: profile.width,
    k: profile.k,
  };
  const task = profile.task ?? "binaria";
  const forcedSet = new Set(forced);
  const placements: Placement[] = [];
  let used = 0;
  for (const id of ROSTER_BY_TASK[task]) {
    const estimateS = estimateMemberSeconds(id, cost, task);
    const out = outReasonFor(id, profile);
    if (out) {
      placements.push(
        forcedSet.has(id)
          ? { id, level: 2, reason: "forced", estimateS, outReason: out }
          : { id, level: "out", reason: out, estimateS },
      );
      continue;
    }
    if (!placements.some((p) => p.level === 1)) {
      placements.push({
        id,
        level: 1,
        reason: estimateS <= ceilingS ? "fits-ceiling" : "always-first",
        estimateS,
      });
      used += estimateS;
    } else if (used + estimateS <= ceilingS) {
      placements.push({ id, level: 1, reason: "fits-ceiling", estimateS });
      used += estimateS;
    } else {
      placements.push({ id, level: 2, reason: "over-ceiling", estimateS });
    }
  }
  const level = (l: Placement["level"]) =>
    placements.filter((p) => p.level === l).map((p) => p.id);
  const level1 = level(1);
  const level2 = level(2);
  const sum = (ids: MemberId[]) =>
    ids.reduce(
      (acc, id) => acc + placements.find((p) => p.id === id)!.estimateS,
      0,
    );
  return {
    placements,
    level1,
    level2,
    out: level("out"),
    level1EstimateS: sum(level1),
    unionEstimateS: sum([...level1, ...level2]),
  };
}

/** Roster que viaja a Python para un nivel: el 1, o la unión 1 ∪ 2 (D5). */
export function rosterFor(routing: Routing, level: 1 | 2): MemberId[] {
  return level === 1
    ? byPriority(routing.level1)
    : byPriority([...routing.level1, ...routing.level2]);
}

export type Level2Plan = {
  /** Lo que correría: la unión Nivel 1 ∪ Nivel 2 ∪ forzados, en orden (D5). */
  roster: MemberId[];
  /** Los que se SUMAN a la liga que ya corrió. */
  added: MemberId[];
  /**
   * Los «fuera» que todavía no corrieron (incluidos los ya forzados en `forced`):
   * se pueden incluir de todos modos (U3) — o volver a dejar fuera.
   */
  forceable: Placement[];
  /** Segundos estimados EN ESTE EQUIPO para correr `roster` entero. */
  estimateS: number;
};

/** Lo que tardó DE VERDAD la corrida anterior, en ms. */
export type MeasuredRun = {
  /** La corrida entera (preparar, baselines, liga, detalles del ganador). */
  totalMs: number;
  /** La suma de lo que tardó cada miembro (`league[].elapsed_ms`). */
  membersMs: number;
};

/** Lo medido de una liga: el total y la suma por miembro. */
export function measuredRun(
  totalMs: number,
  league: readonly { elapsed_ms: number }[],
): MeasuredRun {
  return {
    totalMs,
    membersMs: league.reduce((acc, row) => acc + row.elapsed_ms, 0),
  };
}

/**
 * El Nivel 2 tras una corrida (D5 + U3 + ADR-010): re-corre la unión, así que la
 * estimación es la del roster entero. El factor de este equipo sale de lo que
 * tardaron DE VERDAD los miembros que corrieron frente a lo que se estimó para
 * ellos; la parte fija de la corrida (total − miembros) se suma una vez.
 */
export function planLevel2(
  profile: RouteProfile,
  ran: readonly MemberId[],
  measured: MeasuredRun,
  forced: readonly MemberId[] = [],
  ceilingS: number = LEVEL1_CEILING_S,
): Level2Plan {
  const routing = routeModels(profile, ceilingS, forced);
  const estimateOf = (id: MemberId) =>
    routing.placements.find((p) => p.id === id)!.estimateS;
  const ranSet = new Set(ran);
  const ranEstimateS = [...ranSet].reduce((acc, id) => acc + estimateOf(id), 0);
  const factor = calibrationFactor(measured.membersMs, ranEstimateS);
  const fixedS = Math.max(0, measured.totalMs - measured.membersMs) / 1000;
  const roster = rosterFor(routing, 2);
  return {
    roster,
    added: roster.filter((id) => !ranSet.has(id)),
    forceable: routing.placements.filter(
      (p) => (p.level === "out" || p.reason === "forced") && !ranSet.has(p.id),
    ),
    estimateS:
      factor * roster.reduce((acc, id) => acc + estimateOf(id), 0) + fixedS,
  };
}
