"use client";

// Estado de la narración del "¿por qué?": sin consentimiento ⇒ plantilla local
// (cero red); con consentimiento ⇒ POST /api/narrate y, pase lo que pase
// (kill-switch, proveedor caído, verificación fallida), SIEMPRE hay texto —
// nunca sección vacía ni spinner infinito.
//
// "Cargando" es estado DERIVADO (hay consentimiento y aún no hay respuesta
// para ESTE payload): el efecto solo dispara el fetch y guarda la respuesta en
// el callback — sin setState síncrono en el cuerpo (regla set-state-in-effect).
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

export type NarrationState =
  | { kind: "loading" }
  | { kind: "verified"; text: string }
  | { kind: "template"; text: string; reason: FallbackReason | "no-consent" };

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
  consent: boolean;
  /** Alertas EDA del objetivo (S4). Referencia estable ⇒ no re-dispara el fetch. */
  edaAlerts?: EdaAlert[] | null;
}): { narration: NarrationState; retryNarration: () => void } {
  const { result, target, cols, consent, edaAlerts } = input;
  const { locale } = useI18n();

  const payload = useMemo(
    () => buildNarrationPayload({ result, target, cols, locale, edaAlerts }),
    [result, target, cols, locale, edaAlerts],
  );
  const template = useMemo(() => buildTemplateNarrative(payload), [payload]);

  const [response, setResponse] = useState<RemoteResponse | null>(null);

  // Reintento manual (p. ej. al re-activar el consentimiento): descarta la
  // respuesta previa; el efecto vuelve a pedir. Iniciado por el usuario y
  // protegido por el rate limit del route — no es un retry automático.
  const retryNarration = useCallback(() => setResponse(null), []);

  useEffect(() => {
    if (!consent) return;
    // Ya hay respuesta para este payload exacto (p. ej. toggle off→on): no
    // repetir. Al setearse `response`, el efecto re-corre y sale por aquí.
    if (response?.for === payload) return;

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
  }, [consent, payload, response]);

  let narration: NarrationState;
  if (!consent) {
    narration = { kind: "template", text: template, reason: "no-consent" };
  } else if (response === null || response.for !== payload) {
    narration = { kind: "loading" };
  } else if (response.outcome.kind === "verified") {
    narration = { kind: "verified", text: response.outcome.text };
  } else {
    narration = {
      kind: "template",
      text: template,
      reason: response.outcome.reason,
    };
  }
  return { narration, retryNarration };
}
