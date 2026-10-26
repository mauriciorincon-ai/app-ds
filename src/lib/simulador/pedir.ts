// S19 (ADR 027): los pedidos del simulador al worker que tiene el modelo. Una función por comando: pone un oyente con un id
// propio (negativo y único: `ids-panel.ts`), manda el envío, valida la respuesta con su lector ANTES de usarla y quita el oyente.
// Sirven igual a Probeta (el worker del modelo entrenado o importado) y a la etapa 9 del Protocolo (el worker del ganador
// reajustado). Un error dice solo el campo del contrato o «worker»: nunca un mensaje que pueda traer valores (regla dura 2).
import type { EnvioGanador } from "@/lib/protocolo/ganador";
import { pythonContractField } from "@/workers/contract";
import {
  validateFitWinnerResult,
} from "@/workers/contrato-ganador";
import {
  validateForecastResult,
  type PronosticoSent,
} from "@/workers/contrato-pronostico";
import { validateRulesResult, type ReglasSent } from "@/workers/contrato-reglas";
import {
  validateSimulateResult,
  type SimuladorSent,
} from "@/workers/contrato-simulador";
import {
  validateEvaluateResult,
  type VigilanciaSent,
} from "@/workers/contrato-vigilancia";
import { siguienteIdDePanel } from "@/workers/ids-panel";
import type {
  EvaluateNewPayload,
  EvaluateNewResult,
  FitWinnerResult,
  ForecastPayload,
  ForecastResult,
  RulesPayload,
  RulesResult,
  RunnerResponse,
  SimulatePayload,
  SimulateResult,
} from "@/workers/protocol";
import type { Checked } from "@/lib/validate";

/** El motivo corto de un fallo: el campo del contrato que se rompió, o «worker». */
export function motivoDeFallo(mensaje: string): string {
  const campo = pythonContractField(mensaje);
  if (campo) return `contrato: ${campo}`;
  // las palabras con que pipeline.py dice lo que falta (sin valores): el panel las traduce a lo que el usuario puede hacer
  const conocida = MOTIVOS_CONOCIDOS.find((m) => mensaje.includes(m));
  return conocida ?? "worker";
}

const MOTIVOS_CONOCIDOS = [
  "no-rows",
  "too-few-rows",
  "no-eval",
  "no-model",
  "not-applicable",
];

function pedir<T>(
  worker: Worker,
  comando: "simulate" | "fit-winner" | "rules" | "evaluate-new" | "forecast",
  payload:
    | SimulatePayload
    | EnvioGanador["payload"]
    | EvaluateNewPayload
    | ForecastPayload
    | RulesPayload
    | undefined,
  validar: (crudo: unknown) => Checked<T>,
): Promise<T> {
  return new Promise((ok, no) => {
    const id = siguienteIdDePanel();
    const alResponder = (event: MessageEvent<RunnerResponse>) => {
      const m = event.data;
      if (m.id !== id || m.type === "progress") return;
      worker.removeEventListener("message", alResponder);
      if (m.type === "error") {
        no(new Error(motivoDeFallo(m.message)));
        return;
      }
      if (m.command !== comando) {
        no(new Error("worker"));
        return;
      }
      const r = validar(m.result);
      if (!r.ok) {
        no(new Error(`contrato: ${r.field}`));
        return;
      }
      ok(r.value);
    };
    worker.addEventListener("message", alResponder);
    worker.postMessage(
      payload === undefined ? { id, type: comando } : { id, type: comando, payload },
    );
  });
}

/** Puntúa las mismas filas como están y con una columna cambiada, con el modelo que el worker tiene. */
export const pedirSimulacion = (
  worker: Worker,
  payload: SimulatePayload,
  sent: SimuladorSent,
): Promise<SimulateResult> =>
  pedir(worker, "simulate", payload, (c) => validateSimulateResult(c, sent));

/** Protocolo: vuelve a ajustar al ganador SOLO con el entrenamiento (sin la prueba) y lo deja en el worker. */
export const pedirAjuste = (
  worker: Worker,
  envio: EnvioGanador,
): Promise<FitWinnerResult> =>
  pedir(worker, "fit-winner", envio.payload, (c) =>
    validateFitWinnerResult(c, envio.sent),
  );

/**
 * El modelo en reglas del modelo retenido. Sin filas, con las de entrenamiento que el modelo conserva; con `payload` (S20), con las
 * que sube el usuario: entonces `sent.source` es «uploaded» y `sent.truthAsked` dice si se pidió medir contra su objetivo.
 */
export const pedirReglas = (
  worker: Worker,
  sent: ReglasSent,
  payload?: RulesPayload,
): Promise<RulesResult> =>
  pedir(worker, "rules", payload, (c) => validateRulesResult(c, sent));

/** Puntúa un CSV nuevo que trae el resultado real y devuelve lo real y lo predicho como números. */
export const pedirEvaluacion = (
  worker: Worker,
  payload: EvaluateNewPayload,
  sent: VigilanciaSent,
): Promise<EvaluateNewResult> =>
  pedir(worker, "evaluate-new", payload, (c) => validateEvaluateResult(c, sent));

/** S20: el pronóstico de una serie regular; no usa el modelo que el worker tenga retenido. */
export const pedirPronostico = (
  worker: Worker,
  payload: ForecastPayload,
  sent: PronosticoSent,
): Promise<ForecastResult> =>
  pedir(worker, "forecast", payload, (c) => validateForecastResult(c, sent));

export type PedirSimulacion = (
  payload: SimulatePayload,
  sent: SimuladorSent,
) => Promise<SimulateResult>;
