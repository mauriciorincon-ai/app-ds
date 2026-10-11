import * as Sentry from "@sentry/browser";
import { scrubSentryEvent } from "@/lib/sentry-scrub";

// Observabilidad client-only (esta app no tiene backend en S1). Privacidad al
// máximo (regla dura 2: los datos del usuario nunca salen del navegador y los
// reportes jamás incluyen contenido del dataset):
//   - sin PII, sin tracing ni replay;
//   - beforeSend elimina `request`, todo breadcrumb que no sea de la app
//     (`probeta.*`): consola, red y clics, cuyo selector copia el aria-label, que
//     aquí puede llevar cifras del objetivo; y el mensaje de las excepciones.
// Si no hay DSN configurado, no se inicializa (dev sin Sentry sigue funcionando).
//
// S7 (ADR 018): el cliente se inicia con `@sentry/browser`, no con
// `@sentry/nextjs`. El `init` de Next suma por defecto el trazado del navegador y
// la instrumentación del router (≈ 50 KB gzip en la portada), que con
// `tracesSampleRate: 0` no mandan nada. Es la MISMA versión que `@sentry/nextjs`
// trae por dentro (lo vigila sentry-cliente.test.ts): una sola instancia, así que
// los `captureMessage` y `addBreadcrumb` de src/lib/observability.ts llegan a este
// cliente. Del `init` de Next se conserva el entorno (`vercel-<entorno>`).
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV;

if (dsn) {
  Sentry.init({
    dsn,
    environment: vercelEnv ? `vercel-${vercelEnv}` : process.env.NODE_ENV,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    // Limpieza compartida y probada (src/lib/sentry-scrub.ts): sin request, solo
    // breadcrumbs `probeta.*` y SIN el mensaje de las excepciones (kit v1.33.0).
    beforeSend: (event) => scrubSentryEvent(event),
  });
}
