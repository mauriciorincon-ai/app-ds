// S20 (ADR 028): lo que decide TypeScript del pronóstico, con el cálculo que hizo el worker ya validado. El veredicto compara al
// ganador de la liga con el MEJOR MÉTODO SIMPLE (la media, el ingenuo, el ingenuo estacional o la deriva) con el empate de
// `METRIC_RULES.mae` (1 % relativo): contra el ingenuo estacional a secas, en ruido blanco la media le gana por ~29 % y «en una serie
// sin estructura no le gana nadie» no se podría decir. Aquí también se arma el CSV que el usuario se lleva.
import { computeVerdict } from "@/engine/verdict";
import { etiquetasDe, periodosFuturos, type Serie } from "@/engine/serie";
import { buildCsv } from "@/lib/scored-csv";
import type {
  ForecastLeagueRow,
  ForecastMethod,
  ForecastResult,
} from "@/workers/protocol";

export type PronosticoViable = Extract<ForecastResult, { viable: true }>;

/** Los seis competidores, del más simple al más elaborado: el orden en que la regla de un error estándar desempata. */
export const METODOS: readonly ForecastMethod[] = [
  "media",
  "ingenuo",
  "ingenuo_estacional",
  "deriva",
  "holt_winters",
  "rezagos",
];
/** Los que no aprenden nada de la serie más allá de repetirla o promediarla: la vara del veredicto. */
export const METODOS_SIMPLES: readonly ForecastMethod[] = [
  "media",
  "ingenuo",
  "ingenuo_estacional",
  "deriva",
];

export const esSimple = (m: ForecastMethod): boolean =>
  METODOS_SIMPLES.includes(m);

/** Espejo de `select_one_se` (pipeline.py) para el MAE: el mejor es el mínimo; gana el primero del orden a menos de un error estándar. */
export function unErrorEstandar(
  liga: readonly ForecastLeagueRow[],
  pliegues: number,
): { best: ForecastMethod; winner: ForecastMethod; se: number } | null {
  const aptos = liga.filter(
    (
      r,
    ): r is ForecastLeagueRow & { cv: NonNullable<ForecastLeagueRow["cv"]> } =>
      r.status === "ok" && r.cv !== null,
  );
  if (aptos.length === 0) return null;
  const mejor = aptos.reduce((a, b) => (b.cv.mean < a.cv.mean ? b : a));
  const se = mejor.cv.std / Math.sqrt(pliegues);
  const ganador = aptos.find((r) => r.cv.mean <= mejor.cv.mean + se)!;
  return { best: mejor.name, winner: ganador.name, se };
}

/** El mejor método simple de la liga (empate → el primero del orden). */
export function mejorSimple(
  liga: readonly ForecastLeagueRow[],
): ForecastMethod | null {
  const simples = liga.filter(
    (r) => r.status === "ok" && r.cv !== null && esSimple(r.name),
  );
  if (simples.length === 0) return null;
  return simples.reduce((a, b) => (b.cv!.mean < a.cv!.mean ? b : a)).name;
}

export type CasoVeredicto =
  /** Un método elaborado le gana al mejor simple por más del empate. */
  | "supera"
  /** Un método elaborado queda dentro del empate del mejor simple. */
  | "empata"
  /** Gana uno simple (no la media): el que se elige es el más simple dentro de un error estándar. */
  | "simple"
  /** Gana la media: la serie no muestra nada que proyectar más allá de su nivel. */
  | "sin_estructura";

export type VeredictoPronostico = {
  caso: CasoVeredicto;
  ganador: ForecastMethod;
  referencia: ForecastMethod;
  maeGanador: number;
  maeReferencia: number;
  /** Cuánto menos se equivoca el ganador que la referencia, como fracción de la referencia (0 si no hay referencia que medir). */
  mejora: number;
};

const maeDe = (liga: readonly ForecastLeagueRow[], m: ForecastMethod): number =>
  liga.find((r) => r.name === m)!.cv!.mean;

export function veredictoDe(r: PronosticoViable): VeredictoPronostico {
  const ganador = r.winner;
  const referencia = r.best_simple;
  const maeGanador = maeDe(r.league, ganador);
  const maeReferencia = maeDe(r.league, referencia);
  const mejora =
    maeReferencia === 0 ? 0 : (maeReferencia - maeGanador) / maeReferencia;
  if (esSimple(ganador))
    return {
      caso: ganador === "media" ? "sin_estructura" : "simple",
      ganador,
      referencia,
      maeGanador,
      maeReferencia,
      mejora,
    };
  const v = computeVerdict({ mae: maeGanador }, { mae: maeReferencia }, "mae");
  return {
    caso: v.level === "beats" ? "supera" : "empata",
    ganador,
    referencia,
    maeGanador,
    maeReferencia,
    mejora,
  };
}

/** Las etiquetas del CSV, en el idioma de la pantalla. */
export type EtiquetasCsv = {
  readonly periodo: string;
  readonly tipo: string;
  readonly valor: string;
  readonly inferior80: string;
  readonly superior80: string;
  readonly inferior95: string;
  readonly superior95: string;
  readonly completado: string;
  readonly historia: string;
  readonly pronostico: string;
  readonly si: string;
  readonly no: string;
};

const cifra = (v: number): string => String(Number(v.toPrecision(8)));

/**
 * El CSV del pronóstico: la historia (con una marca en los periodos que se completaron) y los `h` periodos que vienen, con las
 * bandas del 80 y del 95 %. `completado[i]` dice si el periodo `i` de la serie se rellenó con la recta entre sus vecinos.
 */
export function csvDelPronostico(
  serie: Serie,
  valores: readonly number[],
  completado: readonly boolean[],
  r: PronosticoViable,
  e: EtiquetasCsv,
): string {
  const historia = etiquetasDe(serie).map((periodo, i) => [
    periodo,
    e.historia,
    cifra(valores[i]!),
    "",
    "",
    "",
    "",
    completado[i] ? e.si : e.no,
  ]);
  const futuro = periodosFuturos(serie, r.horizon).map((periodo, i) => [
    periodo,
    e.pronostico,
    cifra(r.forecast[i]!),
    cifra(r.lo80[i]!),
    cifra(r.hi80[i]!),
    cifra(r.lo95[i]!),
    cifra(r.hi95[i]!),
    e.no,
  ]);
  return buildCsv(
    [
      e.periodo,
      e.tipo,
      e.valor,
      e.inferior80,
      e.superior80,
      e.inferior95,
      e.superior95,
      e.completado,
    ],
    [...historia, ...futuro],
  );
}
