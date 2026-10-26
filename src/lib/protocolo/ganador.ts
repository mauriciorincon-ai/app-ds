// Protocolo DS (S19, ADR 027) — LO QUE VIAJA AL WORKER PARA VOLVER A AJUSTAR AL GANADOR. Es el envío de la etapa 8 SIN la prueba:
// las mismas filas de entrenamiento sellado, el mismo ganador, la misma métrica y la misma semilla, pero ninguna fila de la
// prueba. Lo usan el simulador de la etapa 9 y el archivo del modelo de la etapa 10. Sale solo si el sello que da la tabla hoy es el
// que registró la etapa 6 y la huella es la del archivo cargado; si no, `null`. Se arma desde el plan de la etapa 7 (`plan7`), que
// solo mira el entrenamiento: NO desde el de la 8, que mide etiquetas de la prueba. Vive fuera del motor y lo importan solo los
// ganchos diferidos de las etapas 9 y 10.
import type { Previas } from "@/engine/protocolo/etapas";
import { plan7 } from "@/engine/protocolo/etapa7";
import { SEMILLA_7 } from "@/engine/protocolo/pliegues";
import { texto } from "@/engine/protocolo/valores";
import { isMemberOf } from "@/engine/roster";
import { byCodePoint } from "@/engine/tarea";
import { METRIC_RULES, type PrimaryMetric } from "@/engine/verdict";
import type { CsvTable } from "@/lib/ds/csv";
import type { GanadorSent } from "@/workers/contrato-ganador";
import type { FitWinnerPayload } from "@/workers/protocol";
import { lecturaDeEnvio } from "./prueba8";

const HEX64 = /^[0-9a-f]{64}$/;
const esMetrica = (m: string): m is PrimaryMetric =>
  Object.hasOwn(METRIC_RULES, m);

export type EnvioGanador = {
  readonly payload: FitWinnerPayload;
  /** Lo que el lector del resultado coteja (contrato-ganador.ts). */
  readonly sent: GanadorSent;
};

export function envioGanador(
  tabla: CsvTable,
  previas: Previas,
  huella: string | null,
): EnvioGanador | null {
  if (huella === null || !HEX64.test(huella)) return null;
  const p7 = plan7(tabla, previas, huella);
  const [e6, e7] = [previas[6], previas[7]];
  if (!p7 || !e6 || !e7 || p7.sello6 !== e6.chequeos.sello) return null;
  const ganador = texto(e7.chequeos, "ganador");
  const metrica = texto(e7.chequeos, "metrica");
  if (
    ganador === null ||
    metrica === null ||
    !isMemberOf(p7.forma, ganador) ||
    !esMetrica(metrica)
  )
    return null;
  const { numeric, categorical, headers, fila, classes, positive } =
    lecturaDeEnvio(tabla, p7);
  if (numeric.length + categorical.length === 0) return null;
  const { entrenamiento } = p7.particion;
  if (entrenamiento.length < 2) return null;
  const sello = p7.sello6;
  const payload: FitWinnerPayload = {
    task: p7.forma,
    headers,
    train: entrenamiento.map(fila),
    target: p7.objetivo,
    numeric,
    categorical,
    seed: SEMILLA_7,
    winner: ganador,
    primary_metric: metrica,
    huella,
    sello,
    ...(classes ? { classes } : {}),
    ...(positive !== undefined ? { positive } : {}),
  };
  const sent: GanadorSent = {
    task: p7.forma,
    winner: ganador,
    n_train: entrenamiento.length,
    huella,
    sello,
  };
  return { payload, sent };
}

/**
 * S20: las clases que el ganador reajustado conoce (las del entrenamiento sellado, en orden de punto de código), para que el lector
 * de las reglas compruebe que cada hoja dice una de ellas. `null` al estimar una cantidad o si el envío no sale.
 */
export function clasesDelGanador(
  tabla: CsvTable,
  previas: Previas,
  huella: string | null,
): string[] | null {
  const envio = envioGanador(tabla, previas, huella);
  const p7 = envio ? plan7(tabla, previas, huella!) : null;
  const clases = p7?.diseno.clases;
  if (!p7 || !clases) return null;
  return [...new Set(p7.particion.entrenamiento.map((f) => clases[f]!))].sort(
    byCodePoint,
  );
}

/** Las filas de entrenamiento de la partición sellada, con TODAS las columnas de la tabla (un segmento puede usar cualquiera). */
export function tablaDeEntrenamiento(
  tabla: CsvTable,
  entrenamiento: readonly number[],
): CsvTable {
  return {
    headers: tabla.headers,
    rows: entrenamiento.map((f) => tabla.rows[f]!),
  };
}
