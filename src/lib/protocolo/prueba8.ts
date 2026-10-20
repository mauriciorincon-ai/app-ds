// Protocolo DS (S13), etapa 8 — LO QUE VIAJA AL WORKER AL ABRIR LA PRUEBA. Es el único envío con filas de la
// prueba, y sale solo si el sello que da la tabla hoy es el que registró la etapa 6 (`plan.selloOk`) y la
// huella es la del archivo cargado: si no, `null` y la prueba no se abre. La etapa 8 solo está abierta con
// las etapas 1–7 cumplidas con ESA huella (compuerta.ts), así que la huella que llega aquí ya está
// verificada. Viajan solo las columnas en «usar» y el objetivo: las filas del entrenamiento sellado (sin el
// hueco del horizonte ni lo que quedó fuera) y las de la prueba, en su orden. El ganador y la métrica son
// los que registró la etapa 7. Vive fuera del motor y lo importa solo el hook diferido de la etapa 8.
import { matchTask } from "@/engine/despacho";
import type { Plan8 } from "@/engine/protocolo/etapa8";
import { SEMILLA_7 } from "@/engine/protocolo/pliegues";
import { isMemberOf } from "@/engine/roster";
import { METRIC_RULES, type PrimaryMetric } from "@/engine/verdict";
import type { CsvTable } from "@/lib/ds/csv";
import type { TestSent } from "@/workers/contrato-prueba";
import type { TestPayload } from "@/workers/protocol";

const HEX64 = /^[0-9a-f]{64}$/;
const esMetrica = (m: string): m is PrimaryMetric =>
  Object.hasOwn(METRIC_RULES, m);

export type Envio8 = {
  readonly payload: TestPayload;
  /** Lo que el lector del resultado coteja (contrato-prueba.ts). */
  readonly sent: TestSent;
};

/** El payload que abre la prueba, o `null` si el sello no cuadra o falta algo de la etapa 7. */
export function envio8(
  tabla: CsvTable,
  plan: Plan8,
  huella: string | null,
): Envio8 | null {
  const p7 = plan.plan7;
  if (!plan.selloOk || huella === null || !HEX64.test(huella)) return null;
  const { ganador, metrica } = plan;
  if (
    ganador === null ||
    metrica === null ||
    !isMemberOf(p7.forma, ganador) ||
    !esMetrica(metrica)
  )
    return null;
  const numeric = [...p7.numericas];
  const categorical = [...p7.categoricas];
  if (numeric.length + categorical.length === 0) return null;
  const { entrenamiento, prueba } = p7.particion;
  if (entrenamiento.length < 2 || prueba.length === 0) return null;
  const headers = [...numeric, ...categorical, p7.objetivo];
  const columnas = headers.map((h) => tabla.headers.indexOf(h));
  // la clase de cada fila con el nombre que le da el Protocolo («1.0» y «1» son la misma clase), como en la 7
  const clases = p7.diseno.clases;
  const fila = (f: number) =>
    columnas.map((j, i) =>
      i === columnas.length - 1 && clases ? clases[f]! : tabla.rows[f]![j]!,
    );
  const classes = matchTask(p7.forma, {
    binaria: () => undefined,
    multiclase: () =>
      [...new Set(entrenamiento.map((f) => clases![f]!))].sort(),
    numerica: () => undefined,
  });
  const positive = matchTask(p7.forma, {
    binaria: () => p7.diseno.positivo ?? undefined,
    multiclase: () => undefined,
    numerica: () => undefined,
  });
  const sello = p7.sello6;
  const payload: TestPayload = {
    task: p7.forma,
    headers,
    train: entrenamiento.map(fila),
    test: prueba.map(fila),
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
  const sent: TestSent = {
    task: p7.forma,
    winner: ganador,
    primary_metric: metrica,
    n_train: entrenamiento.length,
    n_test: prueba.length,
    huella,
    sello,
    ...(classes ? { classes } : {}),
    ...(positive !== undefined ? { positive } : {}),
  };
  return { payload, sent };
}
