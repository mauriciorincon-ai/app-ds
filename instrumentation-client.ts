import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/sentry-scrub";

// Observabilidad client-only (esta app no tiene backend en S1). Privacidad al
// máximo (regla dura 2: los datos del usuario nunca salen del navegador y los
// reportes jamás incluyen contenido del dataset):
//   - sin PII, sin tracing ni replay;
//   - beforeSend elimina `request`, los breadcrumbs (console/fetch/xhr) que
//     pudieran arrastrar valores y el mensaje de las excepciones (solo el tipo).
// Si no hay DSN configurado, no se inicializa (dev sin Sentry sigue funcionando).
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    // Limpieza compartida y probada (src/lib/sentry-scrub.ts): sin request, sin
    // breadcrumbs de consola/red y SIN el mensaje de las excepciones (kit v1.33.0).
    beforeSend: (event) => scrubSentryEvent(event),
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
