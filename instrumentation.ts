// Registro de instrumentación de Next: inicializa Sentry en el runtime de
// servidor (S2 — primera superficie server-side: el route /api/narrate).
// El cliente se inicializa aparte en instrumentation-client.ts (S1).
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
}

// Errores no capturados de route handlers → Sentry (los esperados ya se
// reportan como metadatos vía reportNarrationError).
export const onRequestError = Sentry.captureRequestError;
