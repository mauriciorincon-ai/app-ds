"use client";

// La prueba de estrés en los resultados de Probeta (S17, ADR 023). Bajo demanda: nada se mide hasta pulsar el botón, y
// la medida corre en el worker que ya tiene el modelo y su prueba (no reentrena). Un modelo importado no trae la prueba
// con la que se midió (`no-eval`) y agrupar no tiene ninguna (`not-applicable`): los dos lo dicen en pantalla en vez
// de callar. La lectura pertenece al RESULTADO que la pidió: si cambias de modelo (o corres otra liga), se va.
import { useEffect, useRef, useState, type RefObject } from "react";
import { useTextosEtapa } from "@/i18n/textos-etapa";
import { Button, Card } from "@/components/ui";
import type { RunnerResponse, StressResult, TargetUnit } from "@/workers/protocol";
import type { PrimaryMetric } from "@/engine/verdict";
import type { SupervisedTask } from "@/engine/tarea";
import {
  validateStressResult,
  type StressSent,
} from "@/workers/contrato-estres";
import { EstresVista } from "./EstresVista";
import { TEXTOS_ESTRES } from "./textos";

/** Los ids del panel son negativos: la máquina de estados del hook (ids ≥ 0) ignora lo que no pidió ella. */
let ultimoId = 0;

/** Lo que el panel necesita saber del resultado supervisado que estresa (el lector lo coteja con la respuesta). */
export type EstresDe = {
  /** La identidad del resultado: una lectura de otro resultado no se enseña. */
  readonly result: object;
  readonly task: SupervisedTask;
  readonly metric: PrimaryMetric;
  readonly nTest: number;
  readonly numeric: readonly string[];
  readonly categorical: readonly string[];
  /** El mejor rival sin modelo en la métrica primaria (el del veredicto). */
  readonly rival: number;
  readonly unit: TargetUnit | null;
};

type Estado =
  | { readonly tipo: "inactivo" }
  | { readonly tipo: "midiendo" }
  | { readonly tipo: "lista"; readonly de: object; readonly r: StressResult }
  | { readonly tipo: "error"; readonly motivo: "error" | "need-test" };

export function EstresPanel({
  de,
  worker,
  ocupado = false,
}: {
  /** `null` al agrupar: no hay objetivo ni prueba. */
  de: EstresDe | null;
  /** El worker del modelo activo: se lee al pulsar, no antes (puede haberse reiniciado). */
  worker?: RefObject<Worker | null>;
  /** El worker está ajustando otro modelo: no se mide mientras tanto. */
  ocupado?: boolean;
}) {
  const t = useTextosEtapa(TEXTOS_ESTRES);
  const [estado, setEstado] = useState<Estado>({ tipo: "inactivo" });
  // el oyente en curso, para quitarlo si el panel se va antes de la respuesta
  const quitar = useRef<(() => void) | null>(null);
  useEffect(() => () => quitar.current?.(), []);

  const medir = () => {
    const w = worker?.current;
    if (!de || !w) {
      setEstado({ tipo: "error", motivo: "error" });
      return;
    }
    setEstado({ tipo: "midiendo" });
    const sent: StressSent = {
      task: de.task,
      primary_metric: de.metric,
      n_test: de.nTest,
      numeric: de.numeric,
      categorical: de.categorical,
    };
    const id = --ultimoId;
    const alResponder = (event: MessageEvent<RunnerResponse>) => {
      const message = event.data;
      if (message.id !== id || message.type === "progress") return;
      quitar.current?.();
      if (message.type === "error") {
        setEstado({
          tipo: "error",
          motivo: message.message.includes("no-eval") ? "need-test" : "error",
        });
        return;
      }
      if (message.command !== "stress") return;
      const checked = validateStressResult(message.result, sent);
      setEstado(
        checked.ok
          ? { tipo: "lista", de: de.result, r: checked.value }
          : { tipo: "error", motivo: "error" },
      );
    };
    w.addEventListener("message", alResponder);
    quitar.current = () => {
      w.removeEventListener("message", alResponder);
      quitar.current = null;
    };
    w.postMessage({ id, type: "stress" });
  };

  const lectura =
    estado.tipo === "lista" && de && estado.de === de.result ? estado : null;

  return (
    <section aria-labelledby="estres-title" data-testid="estres-panel">
      <Card className="p-5">
        <h2 id="estres-title" className="text-sm font-semibold">
          {t("stress.title")}
        </h2>
        {de === null ? (
          <p className="mt-1 text-sm text-ink-muted">
            {t("stress.not-applicable")}
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-ink-muted">{t("stress.desc")}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button
                icon={lectura ? "retry" : "play"}
                variant={lectura ? "secondary" : "primary"}
                onClick={medir}
                disabled={ocupado || estado.tipo === "midiendo" || !worker}
              >
                {lectura ? t("stress.retry") : t("stress.button")}
              </Button>
              {estado.tipo === "midiendo" && (
                <span
                  role="status"
                  className="text-sm text-ink-muted"
                  data-testid="estres-midiendo"
                >
                  {t("stress.running")}
                </span>
              )}
            </div>
            {estado.tipo === "error" && (
              <p role="alert" className="mt-2 text-sm text-negative">
                <span aria-hidden className="mr-1">
                  ✕
                </span>
                {t(`stress.${estado.motivo === "need-test" ? "need-test" : "error"}`)}
              </p>
            )}
            {lectura && (
              <div className="mt-4">
                <EstresVista
                  result={lectura.r}
                  rival={de.rival}
                  unit={de.unit}
                  t={t}
                />
              </div>
            )}
          </>
        )}
      </Card>
    </section>
  );
}
