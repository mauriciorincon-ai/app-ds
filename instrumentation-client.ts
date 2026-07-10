import * as Sentry from "@sentry/nextjs";

// Observabilidad client-only (esta app no tiene backend en S1). Privacidad al
// máximo (regla dura 2: los datos del usuario nunca salen del navegador y los
// reportes jamás incluyen contenido del dataset):
//   - sin PII, sin tracing ni replay;
//   - beforeSend elimina `request` y los breadcrumbs (console/fetch/xhr) que
//     pudieran arrastrar valores.
// Si no hay DSN configurado, no se inicializa (dev sin Sentry sigue funcionando).
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      delete event.request;
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.filter(
          (b) => b.category !== "console" && b.category !== "fetch" && b.category !== "xhr",
        );
      }
      return event;
    },
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
