"use client";

// Consentimiento de narración IA: OPT-IN explícito, default OFF, recordado en
// localStorage (mismo patrón useSyncExternalStore del i18n — SSR-safe). Sin
// consentimiento la UI jamás llama al route: plantilla local, cero red (ADR-006).
import { useCallback, useSyncExternalStore } from "react";

export const CONSENT_STORAGE_KEY = "probeta-ds.narration-consent";

const listeners = new Set<() => void>();

function readConsent(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(CONSENT_STORAGE_KEY) === "true";
}

function getServerConsent(): boolean {
  return false;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function writeConsent(next: boolean): void {
  window.localStorage.setItem(CONSENT_STORAGE_KEY, String(next));
  for (const listener of listeners) listener();
}

export function useConsent(): {
  consent: boolean;
  setConsent: (next: boolean) => void;
} {
  const consent = useSyncExternalStore(
    subscribe,
    readConsent,
    getServerConsent,
  );
  const setConsent = useCallback((next: boolean) => writeConsent(next), []);
  return { consent, setConsent };
}
