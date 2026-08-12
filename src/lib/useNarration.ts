"use client";

// Estado de la narración del "¿por qué?". Dos textos SEPARADOS y explícitos:
//
//   · `template` — plantilla determinista local, SIEMPRE disponible, cero red.
//   · `ai`       — narración del LLM, **a demanda**: solo se pide cuando el
//                  usuario pulsa el botón (gate ⭐ S4, bloque C). No hay
//                  interruptor persistente: el consentimiento es el gesto de
//                  pulsar, para ESTE experimento y una vez. Es más estricto que
//                  el opt-in recordado que reemplaza (ADR-006 enmendado).
//
// Cambiar de experimento (payload nuevo) devuelve `ai` a "idle": nada viaja sin
// una pulsación nueva. Pase lo que pase (kill-switch, proveedor caído,
// verificación fallida) SIEMPRE hay texto: la plantilla nunca desaparece.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { EdaAlert } from "@/engine/eda";
import { useI18n } from "@/i18n/provider";
// SOLO tipos: importar el schema Zod aquí metería zod al bundle del cliente
// (reventó el presupuesto de script de la landing por 48 bytes en CI). El
// guardián Zod es el route; en el cliente basta un type-guard defensivo.
import type { FallbackReason, NarrationPayload } from "@/lib/ia/schemas";
import { buildNarrationPayload } from "@/lib/narration/payload";
import { buildTemplateNarrative } from "@/lib/narration/templates";
import type { ExperimentResult } from "@/workers/protocol";

/** Estado del bloque de IA (el bloque de plantilla no tiene estados: existe). */
export type AiNarrationState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "verified"; text: string }
  | { kind: "failed"; reason: FallbackReason };

type RemoteOutcome =
  | { kind: "verified"; text: string }
  | { kind: "failed"; reason: FallbackReason };

type RemoteResponse = { for: NarrationPayload; outcome: RemoteOutcome };

const FALLBACK_REASONS: readonly string[] = [
  "disabled",
  "no-provider",
  "invalid-request",
  "rate-limited",
  "provider-error",
  "verification-failed",
  "grader-rejected",
];

// Type-guard defensivo de la respuesta del route (sin zod en el cliente):
// cualquier forma inesperada se trata como fallo del proveedor ⇒ plantilla.
function toOutcome(json: unknown): RemoteOutcome {
  if (typeof json === "object" && json !== null) {
    const value = json as Record<string, unknown>;
    if (value.status === "verified" && typeof value.narrative === "string") {
      return { kind: "verified", text: value.narrative };
    }
    if (
      value.status === "fallback" &&
      typeof value.reason === "string" &&
      FALLBACK_REASONS.includes(value.reason)
    ) {
      return { kind: "failed", reason: value.reason as FallbackReason };
    }
  }
  return { kind: "failed", reason: "provider-error" };
}

export function useNarration(input: {
  result: ExperimentResult;
  target: string;
  cols: number;
  /** Alertas EDA del objetivo (S4). Referencia estable ⇒ no re-dispara el fetch. */
  edaAlerts?: EdaAlert[] | null;
}): {
  template: string;
  ai: AiNarrationState;
  requestNarration: () => void;
} {
  const { result, target, cols, edaAlerts } = input;
  const { locale } = useI18n();

  const payload = useMemo(
    () => buildNarrationPayload({ result, target, cols, locale, edaAlerts }),
    [result, target, cols, locale, edaAlerts],
  );
  const template = useMemo(() => buildTemplateNarrative(payload), [payload]);

  // `request` guarda PARA QUÉ payload se pidió: si el experimento cambia, la
  // petición vieja deja de aplicar y el bloque vuelve a "idle" solo.
  const [request, setRequest] = useState<NarrationPayload | null>(null);
  const [response, setResponse] = useState<RemoteResponse | null>(null);

  // Iniciado SIEMPRE por el usuario (botón), nunca automático. Descarta la
  // respuesta previa para que "Narrar de nuevo" vuelva a pedir de verdad;
  // el rate limit del route acota los reintentos.
  const requestNarration = useCallback(() => {
    setResponse(null);
    setRequest(payload);
  }, [payload]);

  useEffect(() => {
    if (request !== payload) return; // nadie lo pidió para ESTE experimento
    if (response?.for === payload) return; // ya hay respuesta

    let cancelled = false;
    const done = (outcome: RemoteOutcome) => {
      if (!cancelled) setResponse({ for: payload, outcome });
    };

    fetch("/api/narrate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload }),
    })
      .then((res) => res.json())
      .then((json: unknown) => done(toOutcome(json)))
      .catch(() => done({ kind: "failed", reason: "provider-error" }));

    return () => {
      cancelled = true;
    };
  }, [request, payload, response]);

  let ai: AiNarrationState;
  if (request !== payload) {
    ai = { kind: "idle" };
  } else if (response === null || response.for !== payload) {
    ai = { kind: "loading" };
  } else if (response.outcome.kind === "verified") {
    ai = { kind: "verified", text: response.outcome.text };
  } else {
    ai = { kind: "failed", reason: response.outcome.reason };
  }

  return { template, ai, requestNarration };
}
