// S19 (ADR 027): vigilar el desempeño. Puro. Pone la cifra de HOY —la métrica primaria del modelo sobre un CSV nuevo que trae el
// resultado real, con su margen del 95 % (el bootstrap del S18)— junto a la cifra de su PRUEBA, y dice con las palabras del chequeo
// de deriva de la etapa 10 si el modelo `sigue`, hay que `revisar` o hay que `reentrenar`. La regla usa la del veredicto
// (`METRIC_RULES`: dirección y tolerancia de empate de cada métrica), no una nueva:
//  · reentrenar: TODO el intervalo de hoy queda peor que la cifra de la prueba más allá del empate;
//  · sigue: la cifra de hoy no es peor que la de la prueba más allá del empate;
//  · revisar: en medio, y siempre con menos de FILAS_PRUEBA_POCAS filas con resultado real (con pocas filas nada se decide) o cuando la
//    métrica no está definida en esas filas (sin las dos clases no hay curva, sin positivos reales no hay recall ni F1): la cifra de hoy
//    sería un valor por defecto (0,5 o 0), no una medición, y decir «reentrenar» por eso sería una mentira.
// La cifra de la prueba es un punto: el archivo del modelo no guarda su margen, así que solo la de hoy lo lleva.
import {
  calcularIntervalo,
  FILAS_PRUEBA_POCAS,
  type Intervalo,
} from "@/engine/intervalo";
import { matchTask } from "@/engine/despacho";
import { METRIC_RULES, type PrimaryMetric } from "@/engine/verdict";
import type { EvaluateNewResult } from "@/workers/protocol";

export const VEREDICTOS_VIGILANCIA = ["sigue", "revisar", "reentrenar"] as const;
export type VeredictoVigilancia = (typeof VEREDICTOS_VIGILANCIA)[number];

/** La cifra de la prueba con que se compara lo de hoy. */
export type ReferenciaVigilancia = {
  readonly metric: PrimaryMetric;
  readonly valor: number;
  /** Las filas de esa prueba, si se conocen. */
  readonly nPrueba: number | null;
};

export type LecturaVigilancia = {
  readonly veredicto: VeredictoVigilancia;
  readonly hoy: Intervalo;
  readonly referencia: ReferenciaVigilancia;
  /** hoy − prueba, crudo (con MAE, negativo = hoy se equivoca menos). */
  readonly diferencia: number;
  /** Cuánto cuenta como empate, en las unidades de la métrica. */
  readonly empate: number;
  /** Menos de FILAS_PRUEBA_POCAS filas con resultado real: el veredicto es «revisar» pase lo que pase. */
  readonly pocas: boolean;
  /** La métrica no está definida en estas filas (falta una clase, o no hay positivos): el veredicto es «revisar» pase lo que pase. */
  readonly indefinida: boolean;
};

/** El empate de la métrica en SUS unidades: absoluto en las de clasificación, relativo a la cifra de la prueba con MAE. */
export function empateDe(metric: PrimaryMetric, referencia: number): number {
  const t = METRIC_RULES[metric].tolerance;
  return t.kind === "absolute" ? t.value : Math.abs(referencia) * t.value;
}

/**
 * ¿La métrica no existe en estas filas? Con dos clases: la AUC pide las dos clases en lo real; el recall y el F1, algún positivo real;
 * la precisión, alguna predicción positiva. La exactitud, la balanceada y el error medio siempre están definidos.
 */
export function metricaIndefinida(
  datos: Pick<EvaluateNewResult, "task" | "y" | "pred">,
  metric: PrimaryMetric,
): boolean {
  return matchTask(datos.task, {
    binaria: () => {
      const positivos = datos.y.filter((v) => v === 1).length;
      if (metric === "auc")
        return positivos === 0 || positivos === datos.y.length;
      if (metric === "recall" || metric === "f1") return positivos === 0;
      if (metric === "precision") return !datos.pred.some((v) => v === 1);
      return false;
    },
    multiclase: () => false,
    numerica: () => false,
  });
}

export function veredictoDe(
  hoy: Intervalo,
  referencia: ReferenciaVigilancia,
  indefinida = false,
): VeredictoVigilancia {
  if (indefinida || hoy.n < FILAS_PRUEBA_POCAS) return "revisar";
  const regla = METRIC_RULES[referencia.metric];
  const empate = empateDe(referencia.metric, referencia.valor);
  const peor = (v: number) =>
    regla.direction === "higher"
      ? v < referencia.valor - empate
      : v > referencia.valor + empate;
  // el extremo del intervalo que MÁS favorece al modelo: si hasta ese queda peor, no es azar
  const mejorExtremo = regla.direction === "higher" ? hoy.alto : hoy.bajo;
  if (peor(mejorExtremo)) return "reentrenar";
  return peor(hoy.valor) ? "revisar" : "sigue";
}

/** Lo de hoy (ya puntuado por el worker) frente a la prueba. Lanza si la métrica pide un puntaje que el modelo no dio. */
export function vigilar(
  datos: EvaluateNewResult,
  referencia: ReferenciaVigilancia,
  opciones: { readonly clases?: number; readonly semilla: number },
): LecturaVigilancia {
  const hoy = calcularIntervalo({
    task: datos.task,
    metric: referencia.metric,
    y: datos.y,
    pred: datos.pred,
    score: datos.score,
    clases: opciones.clases,
    semilla: opciones.semilla,
  });
  const indefinida = metricaIndefinida(datos, referencia.metric);
  return {
    veredicto: veredictoDe(hoy, referencia, indefinida),
    hoy,
    referencia,
    diferencia: hoy.valor - referencia.valor,
    empate: empateDe(referencia.metric, referencia.valor),
    pocas: hoy.n < FILAS_PRUEBA_POCAS,
    indefinida,
  };
}
