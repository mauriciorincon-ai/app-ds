"use client";

// La prueba de estrés en los resultados de Probeta (S17, ADR 023). Bajo demanda: nada se mide hasta pulsar el botón, y
// la medida corre en el worker que ya tiene el modelo y su prueba (no reentrena). Un modelo importado no trae la prueba
// con la que se midió (`no-eval`) y agrupar no tiene ninguna (`not-applicable`): los dos lo dicen en pantalla en vez
// de callar. La lectura pertenece al RESULTADO que la pidió: si cambias de modelo (o corres otra liga), se va.
import { useState } from "react";
import { useTextosEtapa } from "@/i18n/textos-etapa";
import { Button, Card } from "@/components/ui";
import type { RunnerCall, RunnerResponse, StressResult, TargetUnit } from "@/workers/protocol";
import type { PrimaryMetric } from "@/engine/verdict";
import type { SupervisedTask } from "@/engine/tarea";
import {
  validateStressResult,
  type StressSent,
} from "@/workers/contrato-estres";
import { EstresVista } from "./EstresVista";
import { TEXTOS_ESTRES } from "./textos";

export type Ask = (
  call: RunnerCall,
  onResponse: (message: RunnerResponse) => void,
) => void;

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
  ask,
  ocupado = false,
}: {
  /** `null` al agrupar: no hay objetivo ni prueba. */
  de: EstresDe | null;
  ask?: Ask;
  /** El worker está ajustando otro modelo: no se mide mientras tanto. */
  ocupado?: boolean;
}) {
  const t = useTextosEtapa(TEXTOS_ESTRES);
  const [estado, setEstado] = useState<Estado>({ tipo: "inactivo" });

  const medir = () => {
    if (!de || !ask) return;
    setEstado({ tipo: "midiendo" });
    const sent: StressSent = {
      task: de.task,
      primary_metric: de.metric,
      n_test: de.nTest,
      numeric: de.numeric,
      categorical: de.categorical,
    };
    ask({ type: "stress" }, (message) => {
      if (message.type === "progress") return;
      if (message.type === "error") {
        setEstado({
          tipo: "error",
          motivo: message.message.includes("no-eval") ? "need-test" : "error",
        });
        return;
      }
      if (message.type !== "result" || message.command !== "stress") return;
      const checked = validateStressResult(message.result, sent);
      setEstado(
        checked.ok
          ? { tipo: "lista", de: de.result, r: checked.value }
          : { tipo: "error", motivo: "error" },
      );
    });
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
                disabled={ocupado || estado.tipo === "midiendo" || !ask}
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
