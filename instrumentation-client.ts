import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/sentry-scrub";

// Observabilidad client-only (esta app no tiene backend en S1). Privacidad al
// máximo (regla dura 2: los datos del usuario nunca salen del navegador y los
// reportes jamás incluyen contenido del dataset):
//   - sin PII, sin tracing ni replay;
//   - beforeSend elimina `request`, todo breadcrumb que no sea de la app
//     (`probeta.*`): consola, red y clics, cuyo selector copia el aria-label, que
//     aquí puede llevar cifras del objetivo; y el mensaje de las excepciones.
// Si no hay DSN configurado, no se inicializa (dev sin Sentry sigue funcionando).
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    // Limpieza compartida y probada (src/lib/sentry-scrub.ts): sin request, solo
    // breadcrumbs `probeta.*` y SIN el mensaje de las excepciones (kit v1.33.0).
    beforeSend: (event) => scrubSentryEvent(event),
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
