// S20 (ADR 028): el lector de lo que `forecast` entrega. Vive aparte de contract.ts (que ya llega al bundle inicial de `/`): solo lo
// importa el panel diferido del pronóstico. Además de la forma cruza lo que solo el lector puede comprobar: es de la serie enviada
// (periodo, temporada, horizonte, cuántos periodos); los orígenes del origen móvil son crecientes, de a `step`, y el último deja justo
// `horizon` periodos para medir; la liga trae los seis métodos en su orden, con un error por pliegue, su media y su desviación; el
// ingenuo estacional compite si y solo si hay dos temporadas; el ganador, el mejor y el mejor método simple son los que salen de
// recalcular la regla de un error estándar; y las bandas contienen al pronóstico, el del 95 % contiene al del 80 % y ninguna se
// angosta al alejarse. Rechaza nombrando el campo, jamás con un valor (regla dura 2).
import { METODOS, mejorSimple, unErrorEstandar } from "@/engine/pronostico";
import {
  arr,
  bool,
  check,
  int,
  nullable,
  num,
  obj,
  oneOf,
  refine,
  type Checked,
} from "@/lib/validate";
import type { ForecastPeriod, ForecastResult } from "@/workers/protocol";

/** Lo que `pipeline.py` fija y el lector comprueba (FORECAST_MAX_PERIODS, FORECAST_MAX_FOLDS, FORECAST_MIN_FOLDS). */
export const PRONOSTICO_PERIODOS_MAX = 2000;
export const PRONOSTICO_PLIEGUES_MAX = 12;
export const PRONOSTICO_PLIEGUES_MIN = 3;

export type PronosticoSent = {
  /** Cuántos periodos trae la serie que se envió. */
  readonly n: number;
  readonly season: number;
  readonly horizon: number;
  readonly period: ForecastPeriod;
};

const TOL = 1e-9;
const casi = (a: number, b: number) =>
  Math.abs(a - b) <= TOL * Math.max(1, Math.abs(a), Math.abs(b));

const positivo = refine(num, (v) => (v as number) >= 0);

export function validateForecastResult(
  raw: unknown,
  sent: PronosticoSent,
): Checked<ForecastResult> {
  const quien = check<{ viable: boolean }>(obj({ viable: bool }), raw);
  if (!quien.ok) return quien;

  if (!quien.value.viable) {
    const corto = check<Extract<ForecastResult, { viable: false }>>(
      obj({ n: int, needed: int, horizon: int }),
      raw,
    );
    if (!corto.ok) return corto;
    const r = corto.value;
    if (r.n !== sent.n) return { ok: false, field: "n" };
    if (r.horizon !== sent.horizon) return { ok: false, field: "horizon" };
    if (r.needed <= r.n) return { ok: false, field: "needed" };
    return corto;
  }

  const vector = arr(num);
  const shaped = check<Extract<ForecastResult, { viable: true }>>(
    obj({
      n: refine(int, (v) => (v as number) >= 1),
      n_input: refine(int, (v) => (v as number) >= 1),
      truncated: bool,
      season: refine(int, (v) => (v as number) >= 1),
      seasonal_ok: bool,
      seasonal_reason: oneOf(["ok", "short", "no_season"]),
      period: oneOf(["dia", "semana", "mes"]),
      horizon: refine(int, (v) => (v as number) >= 1),
      step: refine(int, (v) => (v as number) >= 1),
      origins: arr(int),
      scale: nullable(refine(num, (v) => (v as number) > 0)),
      league: arr(
        obj({
          name: oneOf(METODOS),
          status: oneOf(["ok", "skipped"]),
          reason: nullable(oneOf(["short", "no_season", "numeric"])),
          cv: nullable(
            obj({ mean: positivo, std: positivo, folds: arr(positivo, 1) }),
          ),
          mase: nullable(positivo),
        }),
      ),
      best: oneOf(METODOS),
      winner: oneOf(METODOS),
      best_simple: oneOf(METODOS),
      se: positivo,
      forecast: vector,
      lo80: vector,
      hi80: vector,
      lo95: vector,
      hi95: vector,
      elapsed_ms: num,
    }),
    raw,
  );
  if (!shaped.ok) return shaped;
  const r = shaped.value;

  // es de la serie que se envió
  if (r.n_input !== sent.n) return { ok: false, field: "n_input" };
  if (r.n !== Math.min(sent.n, PRONOSTICO_PERIODOS_MAX))
    return { ok: false, field: "n" };
  if (r.truncated !== sent.n > PRONOSTICO_PERIODOS_MAX)
    return { ok: false, field: "truncated" };
  if (r.period !== sent.period) return { ok: false, field: "period" };
  if (r.season !== sent.season) return { ok: false, field: "season" };
  if (r.horizon !== sent.horizon) return { ok: false, field: "horizon" };

  // el origen móvil
  const k = r.origins.length;
  if (k < PRONOSTICO_PLIEGUES_MIN || k > PRONOSTICO_PLIEGUES_MAX)
    return { ok: false, field: "origins" };
  if (r.origins.at(-1) !== r.n - r.horizon)
    return { ok: false, field: "origins" };
  for (let i = 1; i < k; i++)
    if (r.origins[i]! - r.origins[i - 1]! !== r.step)
      return { ok: false, field: "origins" };
  if (r.step !== Math.max(1, Math.floor(r.horizon / 4)))
    return { ok: false, field: "step" };
  if (r.origins[0]! < 1) return { ok: false, field: "origins" };
  // con dos temporadas en el entrenamiento más corto, la temporada es de verdad; sin ellas, no
  if (r.seasonal_ok) {
    if (
      r.season <= 1 ||
      r.origins[0]! < 2 * r.season ||
      r.seasonal_reason !== "ok"
    )
      return { ok: false, field: "seasonal_ok" };
  } else if (
    r.season > 1
      ? r.seasonal_reason !== "short"
      : r.seasonal_reason !== "no_season"
  ) {
    return { ok: false, field: "seasonal_reason" };
  }

  // la liga: seis métodos en su orden
  if (r.league.length !== METODOS.length) return { ok: false, field: "league" };
  let falla: string | null = null;
  r.league.forEach((row, i) => {
    if (falla) return;
    const ruta = `league[${i}]`;
    if (row.name !== METODOS[i]) falla = `${ruta}.name`;
    else if (row.status === "ok") {
      if (row.cv === null || row.reason !== null) falla = `${ruta}.cv`;
      else if (row.cv.folds.length !== k) falla = `${ruta}.cv.folds`;
      else {
        const media = row.cv.folds.reduce((a, b) => a + b, 0) / k;
        const varianza =
          row.cv.folds.reduce((a, b) => a + (b - media) ** 2, 0) / k;
        if (!casi(row.cv.mean, media)) falla = `${ruta}.cv.mean`;
        else if (!casi(row.cv.std, Math.sqrt(varianza)))
          falla = `${ruta}.cv.std`;
        else if (
          r.scale === null
            ? row.mase !== null
            : row.mase === null || !casi(row.mase, row.cv.mean / r.scale)
        )
          falla = `${ruta}.mase`;
      }
    } else if (row.cv !== null || row.reason === null || row.mase !== null)
      falla = `${ruta}.status`;
    // el ingenuo estacional compite si y solo si hay dos temporadas
    if (
      !falla &&
      row.name === "ingenuo_estacional" &&
      (row.status === "ok") !== r.seasonal_ok
    )
      falla = `${ruta}.status`;
  });
  if (falla) return { ok: false, field: falla };

  // la selección: la misma regla, recalculada
  const seleccion = unErrorEstandar(r.league, k);
  if (!seleccion || seleccion.best !== r.best)
    return { ok: false, field: "best" };
  if (seleccion.winner !== r.winner) return { ok: false, field: "winner" };
  if (!casi(seleccion.se, r.se)) return { ok: false, field: "se" };
  if (mejorSimple(r.league) !== r.best_simple)
    return { ok: false, field: "best_simple" };

  // el pronóstico y sus bandas
  for (const campo of ["forecast", "lo80", "hi80", "lo95", "hi95"] as const)
    if (r[campo].length !== r.horizon) return { ok: false, field: campo };
  for (let i = 0; i < r.horizon; i++) {
    const [f, l8, h8, l95, h95] = [
      r.forecast[i]!,
      r.lo80[i]!,
      r.hi80[i]!,
      r.lo95[i]!,
      r.hi95[i]!,
    ];
    if (!(l95 <= l8 && l8 <= f)) return { ok: false, field: "lo80" };
    if (!(f <= h8 && h8 <= h95)) return { ok: false, field: "hi80" };
    // las bandas (lo que se aleja del pronóstico) nunca se angostan al alejarse del origen
    if (i > 0) {
      const [pf, pl, ph] = [r.forecast[i - 1]!, r.lo95[i - 1]!, r.hi95[i - 1]!];
      if (l95 - f > pl - pf + TOL * Math.max(1, Math.abs(l95)) || h95 - f < ph - pf - TOL * Math.max(1, Math.abs(h95)))
        return { ok: false, field: "lo95" };
    }
  }
  return shaped;
}
