import { describe, expect, it } from "vitest";
import { scrubSentryEvent } from "@/lib/sentry-scrub";

// Kit v1.33.0 (regla dura 2): lo que sale a Sentry es metadata-only. Este test es el
// gate: falla si alguien vuelve a dejar pasar el MENSAJE de una excepción (que en esta
// app puede ser un traceback de pandas citando un valor de celda del usuario).
describe("scrubSentryEvent (privacidad de lo que sale a Sentry)", () => {
  it("reemplaza el mensaje de la excepción por su tipo (nunca el valor de celda)", () => {
    const event = scrubSentryEvent({
      exception: {
        values: [
          {
            type: "ValueError",
            value: "could not convert string to float: 'Juana Pérez'",
          },
          { type: "PythonError", value: "Traceback ... salario=48000" },
        ],
      },
    });
    expect(event.exception?.values).toEqual([
      { type: "ValueError", value: "ValueError" },
      { type: "PythonError", value: "PythonError" },
    ]);
    expect(JSON.stringify(event)).not.toMatch(/Juana|48000/);
  });

  it("elimina la request entera y los breadcrumbs automáticos de consola y red", () => {
    const event = scrubSentryEvent({
      request: { data: '{"target":"renuncio"}' },
      breadcrumbs: [
        { category: "console" },
        { category: "fetch" },
        { category: "xhr" },
        { category: "http" },
        { category: "probeta.league" },
      ],
    });
    expect(event.request).toBeUndefined();
    expect(event.breadcrumbs).toEqual([{ category: "probeta.league" }]);
  });

  it("descarta los breadcrumbs de la UI: su selector copia el aria-label (cifras y columnas)", () => {
    // S6 (AU-S6-01): el clic en el gráfico estimado frente a real deja en el
    // breadcrumb `ui.click` su aria-label, con el MAE en unidades del objetivo; el
    // de una barra de importancia, el nombre de la columna del usuario.
    const event = scrubSentryEvent({
      breadcrumbs: [
        {
          category: "ui.click",
          message: 'svg[aria-label="… a menos de ±33.5 kWh de su valor real."]',
        },
        {
          category: "ui.click",
          message: 'div[aria-label="Importancia de salario_mensual: 61.100"]',
        },
        { category: "ui.input" },
        { category: "navigation" },
        { category: "probeta.league" },
      ],
    });
    expect(event.breadcrumbs).toEqual([{ category: "probeta.league" }]);
    expect(JSON.stringify(event)).not.toMatch(/33\.5|salario_mensual/);
  });

  it("tolera un evento sin excepción ni breadcrumbs", () => {
    expect(scrubSentryEvent({})).toEqual({});
  });
});
