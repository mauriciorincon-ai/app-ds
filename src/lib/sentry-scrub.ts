// Limpieza de privacidad de TODO evento que sale hacia Sentry (cliente y servidor).
// Regla dura 2: los reportes jamás llevan contenido del dataset. Una sola función
// pura, compartida por instrumentation-client.ts y sentry.server.config.ts, para
// que la garantía tenga un test y no dos copias que divergen.
//
//  - `request`: fuera entera (el body del route de narración lleva nombres de
//    columnas del usuario).
//  - breadcrumbs: solo quedan los PROPIOS de la app (categoría `probeta.*`, solo
//    metadatos). Todo breadcrumb automático sale: consola y red (pueden arrastrar
//    valores) y también los de la UI (`ui.click`, `ui.input`), porque su mensaje es
//    el selector del elemento CON su `aria-label`, y aquí hay aria-labels con cifras
//    del objetivo (el gráfico estimado frente a real lleva el MAE en unidades) y con
//    nombres de columna (las barras de importancia). Es una lista de PERMITIDOS: una
//    categoría nueva de Sentry nace fuera (ds S6, AU-S6-01).
//  - kit v1.33.0 (Big-D S1, B-10): el MENSAJE de una excepción puede arrastrar
//    contenido del usuario — aquí, un traceback de pandas/sklearn cita el valor
//    de celda que no pudo convertir. Queda solo el TIPO de la excepción.

type ScrubbableEvent = {
  request?: unknown;
  breadcrumbs?: { category?: string }[];
  exception?: { values?: { type?: string; value?: string }[] };
};

const APP_BREADCRUMB = /^probeta\./;

export function scrubSentryEvent<E extends ScrubbableEvent>(event: E): E {
  delete event.request;
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.filter((b) =>
      APP_BREADCRUMB.test(b.category ?? ""),
    );
  }
  for (const v of event.exception?.values ?? []) v.value = v.type;
  return event;
}
