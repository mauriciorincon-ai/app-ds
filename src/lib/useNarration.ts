"use client";

// Estado de la narración del "¿por qué?": sin consentimiento ⇒ plantilla local
// (cero red); con consentimiento ⇒ POST /api/narrate y, pase lo que pase
// (kill-switch, proveedor caído, verificación fallida), SIEMPRE hay texto —
// nunca sección vacía ni spinner infinito.
//
// "Cargando" es estado DERIVADO (hay consentimiento y aún no hay respuesta
// para ESTE payload): el efecto solo dispara el fetch y guarda la respuesta en
// el callback — sin setState síncrono en el cuerpo (regla set-state-in-effect).
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n/provider";
import {
  narrateResponseSchema,
  type FallbackReason,
  type NarrationPayload,
} from "@/lib/ia/schemas";
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

export function useNarration(input: {
  result: ExperimentResult;
  target: string;
  cols: number;
  consent: boolean;
}): NarrationState {
  const { result, target, cols, consent } = input;
  const { locale } = useI18n();

  const payload = useMemo(
    () => buildNarrationPayload({ result, target, cols, locale }),
    [result, target, cols, locale],
  );
  const template = useMemo(() => buildTemplateNarrative(payload), [payload]);

  const [response, setResponse] = useState<RemoteResponse | null>(null);

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
      .then((json: unknown) => {
        const parsed = narrateResponseSchema.safeParse(json);
        if (!parsed.success) {
          done({ kind: "failed", reason: "provider-error" });
        } else if (parsed.data.status === "verified") {
          done({ kind: "verified", text: parsed.data.narrative });
        } else {
          done({ kind: "failed", reason: parsed.data.reason });
        }
      })
      .catch(() => done({ kind: "failed", reason: "provider-error" }));

    return () => {
      cancelled = true;
    };
  }, [consent, payload, response]);

  if (!consent) {
    return { kind: "template", text: template, reason: "no-consent" };
  }
  if (response === null || response.for !== payload) {
    return { kind: "loading" };
  }
  if (response.outcome.kind === "verified") {
    return { kind: "verified", text: response.outcome.text };
  }
  return { kind: "template", text: template, reason: response.outcome.reason };
}
