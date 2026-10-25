// Protocolo DS (S9, deuda M2/M3 del S8): lo que reemplaza el cuaderno pide un sí. Importar un
// cuaderno sobre uno con entradas, «otro proyecto» y «empezar otro cuaderno» abren un diálogo
// con nombre, descripción y foco; Escape y el fondo cancelan, nunca confirman; un archivo
// inválido sigue fallando de inmediato y un cuaderno vacío se reemplaza sin preguntar.
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}));

const { I18nProvider } = await import("@/i18n/provider");
const { ProtocoloApp } = await import("@/components/protocolo/ProtocoloApp");
const { registrar } = await import("@/engine/protocolo/compuerta");
const { agregarCarga, cuadernoVacio } =
  await import("@/engine/protocolo/cuaderno");
const { chequeos1 } = await import("@/engine/protocolo/etapa1");
const { datosEtapa2 } = await import("@/engine/protocolo/etapa2");
const { PROTOCOLO_DS } = await import("@/engine/protocolo/protocolo-ds");
const { parseCsvWithLimits } = await import("@/lib/ds/csv");
const { empaquetar } = await import("@/lib/protocolo/archivo");
const { sha256Hex } = await import("@/lib/sha256");

const AHORA = new Date("2026-10-18T12:00:00.000Z");
const APUESTA = "probeta-protocolo:apuesta";
const CSV_A =
  "id,fecha,renovo\n1,2026-01-05,si\n1,2026-02-05,no\n2,2026-01-09,si\n";
const CSV_B = "id,fecha,renovo\n9,2026-03-05,no\n9,2026-04-05,si\n";

// jsdom no implementa <dialog>.showModal/close: lo mínimo para que el componente real corra
// (el navegador real lo cubren los e2e).
const proto = HTMLDialogElement.prototype as HTMLDialogElement & {
  showModal: () => void;
  close: () => void;
};
const original = { showModal: proto.showModal, close: proto.close };
beforeAll(() => {
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
afterAll(() => {
  proto.showModal = original.showModal;
  proto.close = original.close;
});

const RESPUESTAS_1 = (decision: string) =>
  ({
    decision,
    decisor: "Jefa de retención",
    cuando: "El día 25",
    hoy: "Se llama a todos",
    unidad: "US$",
    forma: "binaria",
    c_fp: 10,
    c_fn: 50,
  }) as const;

function etapa1(decision: string) {
  const respuestas = RESPUESTAS_1(decision);
  return { respuestas, chequeos: chequeos1(respuestas) ?? {} };
}

/** El texto de un `.protocolo.json` con `n` entradas de la etapa 1 (la última se corrige). */
function archivo(n: number): File {
  let cuaderno = cuadernoVacio(AHORA);
  for (let i = 0; i < n; i++) {
    const r = registrar(
      PROTOCOLO_DS,
      cuaderno,
      1,
      etapa1(`Decisión ${i + 1}`),
      { huella: null, ahora: AHORA },
    );
    if (!r.ok) throw new Error(JSON.stringify(r.rechazo));
    cuaderno = r.cuaderno;
  }
  return new File([empaquetar(cuaderno, AHORA)], `c${n}.protocolo.json`);
}

/** Un cuaderno con la etapa 1 y la 2 hechas sobre CSV_A (una etapa que usa los datos). */
async function archivoConDatos(): Promise<File> {
  const bytes = new TextEncoder().encode(CSV_A);
  const huella = await sha256Hex(bytes);
  const parsed = parseCsvWithLimits(CSV_A);
  if (!parsed.ok) throw new Error("CSV ilegible");
  const e1 = etapa1("Llamar o no");
  let cuaderno = agregarCarga(cuadernoVacio(AHORA), {
    fecha: AHORA.toISOString(),
    sha256: huella,
    nombre: "a.csv",
    filas: 3,
    columnas: 3,
  });
  const ctx = { huella, tabla: parsed.table, ahora: AHORA };
  const uno = registrar(PROTOCOLO_DS, cuaderno, 1, e1, ctx);
  if (!uno.ok) throw new Error(JSON.stringify(uno.rechazo));
  const e2 = datosEtapa2(
    parsed.table,
    {
      objetivo: "renovo",
      positivo: "si",
      unidadColumna: "id",
      momentoColumna: "fecha",
      momentoTexto: "",
      ordenFecha: null,
    },
    e1,
  );
  const dos = registrar(PROTOCOLO_DS, uno.cuaderno, 2, e2, ctx);
  if (!dos.ok) throw new Error(JSON.stringify(dos.rechazo));
  cuaderno = dos.cuaderno;
  return new File([empaquetar(cuaderno, AHORA)], "con-datos.protocolo.json");
}

function montar() {
  return render(
    <I18nProvider>
      <ProtocoloApp />
    </I18nProvider>,
  );
}

async function listo() {
  await screen.findByText(/no deja guardar el cuaderno/);
}

async function importar(file: File) {
  await act(async () => {
    fireEvent.change(screen.getByTestId("protocolo-importar"), {
      target: { files: [file] },
    });
  });
}

function entradas(): number {
  return screen.queryByTestId("cuaderno-evidencias")?.children.length ?? 0;
}

function escape(dialogo: HTMLElement) {
  fireEvent(dialogo, new Event("cancel", { cancelable: true }));
}

beforeEach(() => window.localStorage.clear());

describe("importar un cuaderno (M3)", () => {
  it("sobre un cuaderno vacío reemplaza sin preguntar", async () => {
    montar();
    await listo();
    await importar(archivo(1));
    await waitFor(() => expect(entradas()).toBe(1));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("sobre uno con entradas abre un diálogo con nombre y descripción, y el actual no cambia", async () => {
    montar();
    await listo();
    await importar(archivo(1));
    await waitFor(() => expect(entradas()).toBe(1));

    await importar(archivo(2));
    const dialogo = await screen.findByRole("alertdialog", {
      name: "¿Reemplazar tu cuaderno por el del archivo?",
    });
    expect(dialogo.getAttribute("aria-describedby")).toBeTruthy();
    // S16 (S9 B1): singular
    expect(dialogo.textContent).toContain("tiene 1 entrada y");
    expect(dialogo.textContent).toContain("el del archivo, 2");
    // el foco entra en lo menos destructivo
    expect(document.activeElement).toBe(
      within(dialogo).getByRole("button", { name: "Cancelar" }),
    );
    expect(entradas()).toBe(1);
  });

  it("Escape cancela: el cuaderno sigue igual y el foco vuelve a «Importar cuaderno»", async () => {
    montar();
    await listo();
    await importar(archivo(1));
    await waitFor(() => expect(entradas()).toBe(1));
    await importar(archivo(2));
    escape(await screen.findByRole("alertdialog"));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(entradas()).toBe(1);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Importar cuaderno" }),
    );
  });

  it("«Sí, reemplazar» sí reemplaza y lo dice", async () => {
    montar();
    await listo();
    await importar(archivo(1));
    await waitFor(() => expect(entradas()).toBe(1));
    await importar(archivo(2));
    window.sessionStorage.setItem(APUESTA, "{}");
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Sí, reemplazar",
      }),
    );
    await waitFor(() => expect(entradas()).toBe(2));
    expect(window.sessionStorage.getItem(APUESTA)).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText(/Cuaderno importado/)).toBeTruthy();
  });

  it("un clic en el fondo cancela, no confirma", async () => {
    montar();
    await listo();
    await importar(archivo(1));
    await waitFor(() => expect(entradas()).toBe(1));
    await importar(archivo(2));
    fireEvent.click(await screen.findByRole("alertdialog"));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(entradas()).toBe(1);
  });

  it("un archivo inválido falla de inmediato, sin pedir confirmación", async () => {
    montar();
    await listo();
    await importar(archivo(1));
    await waitFor(() => expect(entradas()).toBe(1));
    await importar(new File(["no es json"], "malo.protocolo.json"));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("no es JSON"),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(entradas()).toBe(1);
  });
});

describe("empezar otro cuaderno", () => {
  it("el diálogo tiene nombre, Cancelar no borra y el sí vacía el cuaderno", async () => {
    montar();
    await listo();
    await importar(archivo(1));
    await waitFor(() => expect(entradas()).toBe(1));

    fireEvent.click(
      screen.getByRole("button", { name: "Empezar otro cuaderno" }),
    );
    let dialogo = await screen.findByRole("alertdialog", {
      name: "Empezar otro cuaderno",
    });
    expect(document.activeElement).toBe(
      within(dialogo).getByRole("button", { name: "Cancelar" }),
    );
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(entradas()).toBe(1);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Empezar otro cuaderno" }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Empezar otro cuaderno" }),
    );
    dialogo = await screen.findByRole("alertdialog");
    // un cuaderno nuevo no hereda la apuesta de la etapa 4 del anterior
    window.sessionStorage.setItem(APUESTA, "{}");
    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Sí, empezar otro" }),
    );
    await waitFor(() => expect(entradas()).toBe(0));
    expect(window.sessionStorage.getItem(APUESTA)).toBeNull();
  });
});

describe("un archivo CSV distinto del del cuaderno (M2 y «otro proyecto»)", () => {
  async function conCuadernoDeA() {
    montar();
    await listo();
    await importar(await archivoConDatos());
    await waitFor(() => expect(entradas()).toBe(2));
    await act(async () => {
      fireEvent.change(screen.getByTestId("protocolo-csv"), {
        target: { files: [new File([CSV_B], "b.csv", { type: "text/csv" })] },
      });
    });
    return screen.findByRole("alertdialog", {
      name: "Este archivo no es el del cuaderno",
    });
  }

  it("el diálogo tiene nombre y descripción, y el foco entra en «No cargarlo»", async () => {
    const dialogo = await conCuadernoDeA();
    expect(dialogo.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.activeElement).toBe(
      within(dialogo).getByRole("button", { name: "No cargarlo" }),
    );
  });

  it("Escape lo descarta y el foco vuelve al botón de cargar", async () => {
    const dialogo = await conCuadernoDeA();
    escape(dialogo);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(entradas()).toBe(2);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Cargar mi CSV" }),
    );
  });

  it("«Otro proyecto» pide un segundo sí, con Volver, antes de reemplazar el cuaderno", async () => {
    const dialogo = await conCuadernoDeA();
    fireEvent.click(
      within(dialogo).getByRole("button", {
        name: "Otro proyecto: cuaderno nuevo",
      }),
    );
    const segundo = await screen.findByRole("alertdialog", {
      name: "¿Empezar un cuaderno nuevo con este archivo?",
    });
    expect(segundo.textContent).toContain("2 entradas");
    expect(entradas()).toBe(2);
    expect(document.activeElement).toBe(
      within(segundo).getByRole("button", { name: "Volver" }),
    );

    // Escape en el segundo paso vuelve al primero, no cierra todo
    escape(segundo);
    await screen.findByRole("alertdialog", {
      name: "Este archivo no es el del cuaderno",
    });
    expect(entradas()).toBe(2);

    fireEvent.click(
      screen.getByRole("button", { name: "Otro proyecto: cuaderno nuevo" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Sí, empezar otro" }),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(entradas()).toBe(0);
    expect(screen.getByTestId("protocolo-datos").textContent).toContain(
      "b.csv",
    );
  });
});
