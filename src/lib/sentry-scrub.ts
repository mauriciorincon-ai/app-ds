// Limpieza de privacidad de TODO evento que sale hacia Sentry (cliente y servidor).
// Regla dura 2: los reportes jamás llevan contenido del dataset. Una sola función
// pura, compartida por instrumentation-client.ts y sentry.server.config.ts, para
// que la garantía tenga un test y no dos copias que divergen.
//
//  - `request`: fuera entera (el body del route de narración lleva nombres de
//    columnas del usuario).
//  - breadcrumbs automáticos de consola/red: fuera (pueden arrastrar valores). Los
//    breadcrumbs PROPIOS de la app (categoría `probeta.*`, solo metadatos) quedan.
//  - kit v1.33.0 (Big-D S1, B-10): el MENSAJE de una excepción puede arrastrar
//    contenido del usuario — aquí, un traceback de pandas/sklearn cita el valor
//    de celda que no pudo convertir. Queda solo el TIPO de la excepción.

type ScrubbableEvent = {
  request?: unknown;
  breadcrumbs?: { category?: string }[];
  exception?: { values?: { type?: string; value?: string }[] };
};

const DROPPED_BREADCRUMBS = new Set(["console", "fetch", "xhr", "http"]);

export function scrubSentryEvent<E extends ScrubbableEvent>(event: E): E {
  delete event.request;
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.filter(
      (b) => !DROPPED_BREADCRUMBS.has(b.category ?? ""),
    );
  }
  for (const v of event.exception?.values ?? []) v.value = v.type;
  return event;
}
