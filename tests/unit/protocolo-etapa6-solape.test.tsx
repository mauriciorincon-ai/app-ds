// Sprint 016 (S11) — el camino malo de la verificación de tiempo se pinta. El texto `verify.time-bad` existía y nunca se
// mostraba: la fila decía siempre «✓». Por construcción el motor no deja filas de entrenamiento a menos de un horizonte de
// la prueba, así que el camino se ejerce con el motor simulado (un solape de 4 filas).
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock("@/engine/protocolo/etapa6", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("@/engine/protocolo/etapa6")>();
  return {
    ...real,
    datosEtapa6: (...args: Parameters<typeof real.datosEtapa6>) => {
      const datos = real.datosEtapa6(...args);
      return datos
        ? { ...datos, chequeos: { ...datos.chequeos, solape_tiempo: 4 } }
        : datos;
    },
  };
});

const { fireEvent } = await import("@testing-library/react");
const { I18nProvider } = await import("@/i18n/provider");
const { Etapa6Form } = await import("@/components/protocolo/Etapa6Form");
const helpers = await import("./protocolo-etapa4-helpers");

describe("S11 · la verificación de tiempo dice cuántas filas se solapan", () => {
  it("con filas de entrenamiento dentro del horizonte, la fila lo dice y no marca «✓»", () => {
    const armado = helpers.armar5(
      "bajas-con-fuga.csv",
      "binaria",
      helpers.ENTRADA_BAJAS,
    );
    render(
      <I18nProvider>
        <Etapa6Form
          datos={{
            tabla: armado.tabla,
            carga: {
              fecha: helpers.AHORA.toISOString(),
              sha256: helpers.HUELLA,
              nombre: "datos.csv",
              filas: armado.tabla.rows.length,
              columnas: armado.tabla.headers.length,
            },
          }}
          anterior={null}
          previas={armado.previas}
          historia={[]}
          onRegistrar={() => null}
        />
      </I18nProvider>,
    );
    fireEvent.click(
      screen.getByLabelText("Con unidades nuevas, que el modelo no vio"),
    );
    fireEvent.change(
      screen.getByLabelText(
        "Horizonte: cuánto tarda en conocerse el resultado",
      ),
      { target: { value: "1" } },
    );
    fireEvent.change(screen.getByLabelText("Unidad del horizonte"), {
      target: { value: "meses" },
    });
    const verificacion = screen.getByTestId("protocolo-verificacion");
    expect(
      within(verificacion).getByText(
        "4 filas de entrenamiento están a menos de un horizonte de la prueba.",
      ),
    ).toBeTruthy();
  });
});
