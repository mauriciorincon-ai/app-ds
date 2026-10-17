// Protocolo DS (S8): la ruta /protocolo en jsdom (sin IndexedDB: el almacén cae a memoria y
// la UI lo dice). Las diez etapas se ven con su estado y criterio, no hay control para
// saltar, el glosario se consulta entero, y el breadcrumb del modo lleva solo dos claves.
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const addBreadcrumb = vi.fn();
const captureMessage = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: (...args: unknown[]) => addBreadcrumb(...args),
  captureMessage: (...args: unknown[]) => captureMessage(...args),
}));

const { I18nProvider } = await import("@/i18n/provider");
const { ProtocoloApp } = await import("@/components/protocolo/ProtocoloApp");
const { GLOSARIO } = await import("@/content/glosario");
const { TERMINO_IDS, ETAPA_IDS } = await import("@/engine/protocolo/ids");
const { recordProtocolStep, reportProtocolError } =
  await import("@/lib/observability");

function montar() {
  return render(
    <I18nProvider>
      <ProtocoloApp />
    </I18nProvider>,
  );
}

const CSV =
  "id,fecha,renovo\n1,2026-01-05,si\n1,2026-02-05,no\n2,2026-01-09,si\n";

describe("/protocolo", () => {
  beforeEach(() => {
    addBreadcrumb.mockClear();
    captureMessage.mockClear();
  });

  it("muestra las diez etapas en orden, cada una con su estado y su criterio", async () => {
    montar();
    await screen.findByText(/no deja guardar el cuaderno/);
    const lista =
      screen.getByRole("list", { name: "" }).closest("ol") ??
      screen.getAllByRole("list")[0]!;
    const etapas = within(lista as HTMLElement).getAllByRole("listitem");
    expect(etapas).toHaveLength(ETAPA_IDS.length);
    etapas.forEach((li, i) => {
      expect(li.textContent).toContain(`Etapa ${i + 1}`);
      expect(li.textContent).toContain("Para abrir la siguiente");
    });
  });

  it("no existe un control para saltar una etapa", async () => {
    montar();
    await screen.findByText(/no deja guardar el cuaderno/);
    const controles = [
      ...screen.queryAllByRole("button"),
      ...screen.queryAllByRole("link"),
    ];
    expect(controles.length).toBeGreaterThan(0);
    for (const control of controles)
      expect(control.textContent ?? "").not.toMatch(/saltar|omitir|skip/i);
  });

  it("sin IndexedDB, avisa que el cuaderno vive solo en la pestaña", async () => {
    montar();
    expect(
      await screen.findByText(/Exporta tu cuaderno antes de irte/),
    ).toBeTruthy();
  });

  it("el glosario se consulta entero, con un ancla por término", async () => {
    const { container } = montar();
    await screen.findByText(/no deja guardar el cuaderno/);
    for (const id of TERMINO_IDS) {
      const entrada = container.querySelector(`#termino-${id}`);
      expect(entrada, id).not.toBeNull();
      expect(entrada!.textContent).toContain(GLOSARIO[id].termino.es);
    }
  });

  it("cargar el CSV muestra su huella y lo anota en el cuaderno", async () => {
    montar();
    await screen.findByText(/no deja guardar el cuaderno/);
    const input = screen.getByTestId("protocolo-csv");
    const file = new File([CSV], "renovaciones.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });
    const datos = await screen.findByTestId("protocolo-datos");
    expect(datos.textContent).toMatch(
      /renovaciones\.csv · 3 filas × 3 columnas · huella [0-9a-f]{12}/,
    );
    expect(screen.getByText("Datos con que se trabajó")).toBeTruthy();
  });

  it("un cuaderno importado que no es válido se rechaza nombrando el campo", async () => {
    montar();
    await screen.findByText(/no deja guardar el cuaderno/);
    const input = screen.getByTestId("protocolo-importar");
    const malo = JSON.stringify({
      formato: "protocolo-ds",
      version: 1,
      exportado: "ayer",
      cuaderno: {},
    });
    fireEvent.change(input, {
      target: { files: [new File([malo], "c.protocolo.json")] },
    });
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("«exportado»"),
    );
    expect(captureMessage).toHaveBeenCalledWith(
      "protocol-error:import-rejected",
      {
        level: "error",
        tags: { area: "protocol", kind: "import-rejected" },
      },
    );
  });
});

describe("observabilidad del Protocolo (regla dura 2)", () => {
  it("el breadcrumb lleva SOLO la etapa y el resultado", () => {
    addBreadcrumb.mockClear();
    recordProtocolStep(2, "closed");
    expect(addBreadcrumb).toHaveBeenCalledTimes(1);
    const [crumb] = addBreadcrumb.mock.calls[0] as [
      { category: string; data: object },
    ];
    expect(crumb.category).toBe("probeta.protocol");
    expect(Object.keys(crumb.data).sort()).toEqual(["outcome", "stage"]);
  });

  it("las fallas llevan solo su tipo", () => {
    captureMessage.mockClear();
    reportProtocolError("storage-write");
    expect(captureMessage).toHaveBeenCalledWith(
      "protocol-error:storage-write",
      {
        level: "error",
        tags: { area: "protocol", kind: "storage-write" },
      },
    );
  });
});
