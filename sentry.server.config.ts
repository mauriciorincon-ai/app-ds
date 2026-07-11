// Sentry del runtime de servidor — misma disciplina de privacidad que el
// cliente (regla dura 2): sin PII, sin tracing, y `beforeSend` elimina la
// request entera (el body del route contiene nombres de columnas del usuario;
// jamás deben llegar a un log). Si no hay DSN (CI), no se inicializa.
import * as Sentry from "@sentry/nextjs";

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
          (b) =>
            b.category !== "console" &&
            b.category !== "fetch" &&
            b.category !== "http",
        );
      }
      return event;
    },
  });
}
