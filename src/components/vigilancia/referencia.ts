// S19 (ADR 027): la cifra de la PRUEBA con que se compara lo de hoy al vigilar el desempeño. Sale del modelo que se está usando: de su
// manifiesto si se importó (el veredicto del archivo de Probeta, o el bloque `protocol` del archivo del Protocolo) o del resultado
// recién entrenado. Agrupar no tiene prueba ni objetivo: no hay desempeño que vigilar.
import { matchByTask } from "@/engine/despacho";
import type { ReferenciaVigilancia } from "@/engine/vigilancia";
import { esManifiestoDelProtocolo } from "@/lib/model-file";
import type { ModelMeta } from "@/lib/useExperiment";
import type { ExperimentResult } from "@/workers/protocol";

export function referenciaDe(
  meta: Pick<ModelMeta, "manifest">,
  result: ExperimentResult | null,
): ReferenciaVigilancia | null {
  const m = meta.manifest;
  if (m) {
    if (esManifiestoDelProtocolo(m))
      return {
        metric: m.protocol.metric,
        valor: m.protocol.test_value,
        nPrueba: m.protocol.n_test,
      };
    return matchByTask(m, {
      binaria: (b) => ({
        metric: b.verdict.primaryMetric,
        valor: b.verdict.modelScore,
        nPrueba: b.dataset.n_test,
      }),
      multiclase: (b) => ({
        metric: b.verdict.primaryMetric,
        valor: b.verdict.modelScore,
        nPrueba: b.dataset.n_test,
      }),
      numerica: (b) => ({
        metric: b.verdict.primaryMetric,
        valor: b.verdict.modelScore,
        nPrueba: b.dataset.n_test,
      }),
      agrupar: () => null,
    });
  }
  if (!result) return null;
  return matchByTask(result, {
    binaria: (r) => ({
      metric: r.verdict.primaryMetric,
      valor: r.verdict.modelScore,
      nPrueba: r.nTest,
    }),
    multiclase: (r) => ({
      metric: r.verdict.primaryMetric,
      valor: r.verdict.modelScore,
      nPrueba: r.nTest,
    }),
    numerica: (r) => ({
      metric: r.verdict.primaryMetric,
      valor: r.verdict.modelScore,
      nPrueba: r.nTest,
    }),
    agrupar: () => null,
  });
}
