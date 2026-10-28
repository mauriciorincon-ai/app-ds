"use client";

// El margen de error de la cifra del veredicto en Probeta (S18). Se calcula solo, cuando el modelo está quieto: pide al worker lo
// real, lo predicho y el puntaje de la prueba retenida (solo números) y hace el bootstrap aquí, con la semilla del experimento.
// Un modelo importado no trae la prueba (`no-eval`) y agrupar no la tiene: los dos lo dicen en pantalla en vez de callar. La
// lectura es del RESULTADO que la pidió: con otro resultado, no se enseña.
import { useEffect, useRef, useState, type RefObject } from "react";
import { Card } from "@/components/ui";
import { matchTask } from "@/engine/despacho";
import {
  calcularIntervalo,
  FILAS_PRUEBA_POCAS,
  type Intervalo,
} from "@/engine/intervalo";
import type { SupervisedTask } from "@/engine/tarea";
import type { PrimaryMetric } from "@/engine/verdict";
import { useTextosEtapa } from "@/i18n/textos-etapa";
import { formatQuantity, quantityDecimals, withUnit } from "@/lib/quantity";
import {
  validateIntervalData,
  type IntervaloSent,
} from "@/workers/contrato-intervalo";
import { siguienteIdDePanel } from "@/workers/ids-panel";
import type { RunnerResponse, TargetUnit } from "@/workers/protocol";
import { TEXTOS_RESULTADOS } from "@/lib/narration/textos-resultados";

export type IntervaloDe = {
  /** La identidad del resultado: una lectura de otro resultado no se enseña. */
  readonly result: object;
  readonly task: SupervisedTask;
  readonly metric: PrimaryMetric;
  readonly nTest: number;
  /** Solo varias categorías. */
  readonly nClasses: number | null;
  readonly seed: number;
  readonly unit: TargetUnit | null;
};

type Estado =
  | { readonly tipo: "inactivo" }
  | { readonly tipo: "midiendo" }
  | { readonly tipo: "lista"; readonly de: object; readonly r: Intervalo }
  | { readonly tipo: "error"; readonly motivo: "error" | "sin_prueba" };

export function IntervaloPanel({
  de,
  worker,
  ocupado = false,
}: {
  /** `null` al agrupar: no hay objetivo ni prueba. */
  de: IntervaloDe | null;
  /** El worker del modelo activo: se lee al pedir, no antes (puede haberse reiniciado). */
  worker?: RefObject<Worker | null>;
  /** El worker está ajustando otro modelo: no se pide mientras tanto. */
  ocupado?: boolean;
}) {
  const t = useTextosEtapa(TEXTOS_RESULTADOS);
  const [estado, setEstado] = useState<Estado>({ tipo: "inactivo" });
  const quitar = useRef<(() => void) | null>(null);
  const pedido = useRef<object | null>(null);
  useEffect(() => () => quitar.current?.(), []);

  const result = de?.result ?? null;
  useEffect(() => {
    if (!de || ocupado || !worker?.current) return;
    if (pedido.current === de.result) return; // este resultado ya se pidió
    pedido.current = de.result;
    quitar.current?.(); // un pedido anterior que siga en vuelo ya no importa: su respuesta no debe quitar el manejador de este
    const w = worker.current;
    setEstado({ tipo: "midiendo" });
    const sent: IntervaloSent = {
      task: de.task,
      primary_metric: de.metric,
      n_test: de.nTest,
      n_classes: de.nClasses,
      seed: de.seed,
    };
    const id = siguienteIdDePanel();
    const alResponder = (event: MessageEvent<RunnerResponse>) => {
      const message = event.data;
      if (message.id !== id || message.type === "progress") return;
      quitarEste();
      if (message.type === "error") {
        setEstado({
          tipo: "error",
          motivo: message.message.includes("no-eval") ? "sin_prueba" : "error",
        });
        return;
      }
      if (message.command !== "interval") return;
      const datos = validateIntervalData(message.result, sent);
      if (!datos.ok) {
        setEstado({ tipo: "error", motivo: "error" });
        return;
      }
      // fuera del manejador del mensaje: que la pantalla pinte «calculando» antes de las 1 000 repeticiones
      setTimeout(() => {
        try {
          const r = calcularIntervalo({
            task: datos.value.task,
            metric: datos.value.metric,
            y: datos.value.y,
            pred: datos.value.pred,
            score: datos.value.score,
            clases: de.nClasses ?? undefined,
            semilla: de.seed,
          });
          setEstado({ tipo: "lista", de: de.result, r });
        } catch {
          setEstado({ tipo: "error", motivo: "error" });
        }
      }, 0);
    };
    const quitarEste = () => {
      w.removeEventListener("message", alResponder);
      if (quitar.current === quitarEste) quitar.current = null;
    };
    w.addEventListener("message", alResponder);
    quitar.current = quitarEste;
    w.postMessage({ id, type: "interval" });
    // `result` identifica la corrida; `ocupado` la reabre cuando el worker queda libre
  }, [de, ocupado, worker, result]);

  const lectura =
    estado.tipo === "lista" && de && estado.de === de.result ? estado.r : null;

  const cifras = (r: Intervalo, d: IntervaloDe) => {
    const dosDecimales = () => {
      const f = (v: number) => v.toFixed(2);
      return { valor: f(r.valor), bajo: f(r.bajo), alto: f(r.alto) };
    };
    return matchTask(d.task, {
      binaria: dosDecimales,
      multiclase: dosDecimales,
      // el error medio, en las unidades del objetivo y con los decimales que piden sus tres cifras
      numerica: () => {
        const decimales = quantityDecimals([r.valor, r.bajo, r.alto]);
        const q = (v: number) =>
          withUnit(formatQuantity(v, decimales), d.unit ?? { symbol: null });
        return { valor: q(r.valor), bajo: q(r.bajo), alto: q(r.alto) };
      },
    });
  };

  return (
    <section aria-labelledby="intervalo-title" data-testid="intervalo-panel">
      <Card className="p-5">
        <h2 id="intervalo-title" className="text-sm font-semibold">
          {t("resultados.intervalo.titulo")}
        </h2>
        {de === null ? (
          <p className="mt-1 text-sm text-ink-muted">
            {t("resultados.intervalo.no_aplica")}
          </p>
        ) : (
          <>
            {estado.tipo === "midiendo" && (
              <p role="status" className="mt-1 text-sm text-ink-muted">
                {t("resultados.intervalo.midiendo")}
              </p>
            )}
            {estado.tipo === "error" && (
              <p role="alert" className="mt-1 text-sm text-ink-muted">
                <span aria-hidden className="mr-1">
                  ·
                </span>
                {t(`resultados.intervalo.${estado.motivo}`)}
              </p>
            )}
            {lectura && (
              <div className="mt-1 flex flex-col gap-1">
                <p
                  className="text-sm font-medium tabular-nums"
                  data-testid="intervalo-linea"
                >
                  {t("resultados.intervalo.linea", {
                    metric: t(`results.metrics.${de.metric}`),
                    ...cifras(lectura, de),
                  })}
                </p>
                <p className="text-sm text-ink-muted">
                  {t("resultados.intervalo.detalle", {
                    n: formatQuantity(lectura.n, 0),
                    remuestreos: formatQuantity(lectura.remuestreos, 0),
                    semilla: lectura.semilla,
                  })}
                </p>
                {lectura.n < FILAS_PRUEBA_POCAS && (
                  <p className="text-sm text-caution">
                    <span aria-hidden className="mr-1">
                      ⚠
                    </span>
                    {t("resultados.intervalo.pocas", { n: formatQuantity(lectura.n, 0) })}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </Card>
    </section>
  );
}
