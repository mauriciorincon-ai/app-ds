// S21 (ADR 030): el panel «Pregúntale a tus datos». Lo que estos tests hacen FALLAR si se rompe:
//  · espera al aviso de datos personales antes de leer nada; no corre nada hasta pulsar «Correr la consulta»;
//  · antes de correr enseña la consulta en palabras, en SQL y lo que se comprobó con símbolo y palabra (✓ ⚠ ✕), y lo PROPUESTO marcado;
//  · lo ambiguo se pregunta con opciones y la respuesta cierra la duda; lo que no se leyó se dice; lo que no se entiende se dice;
//  · una consulta con un error de validación no se puede correr;
//  · el resultado trae su frase (verificada), su gráfico, su tabla y un CSV que se descarga con la protección contra fórmulas;
//  · NADA sale del navegador: ningún Worker, ningún fetch, ningún sendBeacon, ningún breadcrumb ni mensaje de Sentry;
//  · los dos idiomas.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCALE_STORAGE_KEY } from "@/i18n/config";
import type { CsvTable } from "@/lib/ds/csv";
import { tablaDelKit } from "../fixtures/preguntas/ayudas";

const sentry = vi.hoisted(() => ({ addBreadcrumb: vi.fn(), captureMessage: vi.fn(), captureException: vi.fn() }));
vi.mock("@sentry/nextjs", () => sentry);
const descargas: { nombre: string; contenido: string; tipo: string }[] = [];
vi.mock("@/lib/files", async (original) => ({
  ...(await original<typeof import("@/lib/files")>()),
  downloadTextFile: (nombre: string, contenido: string, tipo: string) => descargas.push({ nombre, contenido, tipo }),
}));

const { I18nProvider } = await import("@/i18n/provider");
const { PreguntaPanel } = await import("@/components/pregunta/PreguntaPanel");

const pintar = (tabla: CsvTable, personales: string[] | null = [], nombre = "ventas-por-region.csv") =>
  render(
    <I18nProvider>
      <PreguntaPanel getTable={() => tabla} personales={personales} datasetName={nombre} />
    </I18nProvider>,
  );

const preguntar = async (texto: string) => {
  const campo = await screen.findByTestId("pregunta-input");
  fireEvent.change(campo, { target: { value: texto } });
  fireEvent.click(screen.getByTestId("pregunta-entender"));
};

const espias = {
  worker: vi.fn(),
  fetch: vi.fn(),
  beacon: vi.fn(),
};
beforeEach(() => {
  localStorage.setItem(LOCALE_STORAGE_KEY, "es");
  vi.stubGlobal("Worker", espias.worker);
  vi.stubGlobal("fetch", espias.fetch);
  Object.defineProperty(navigator, "sendBeacon", { value: espias.beacon, configurable: true });
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  descargas.length = 0;
  vi.unstubAllGlobals();
  for (const f of [...Object.values(espias), ...Object.values(sentry)]) f.mockClear();
});

const TABLA = tablaDelKit("ventas-por-region.csv");

describe("antes de preguntar", () => {
  it("mientras el aviso de datos personales se arma, no se lee nada", async () => {
    pintar(TABLA, null);
    expect(screen.getByTestId("pregunta-revisando")).toBeInTheDocument();
    fireEvent.change(await screen.findByTestId("pregunta-input"), { target: { value: "ventas por región" } });
    expect(screen.getByTestId("pregunta-entender")).toBeDisabled();
  });

  it("ofrece ejemplos armados con las columnas de la tabla, y uno se lee de una vez", async () => {
    pintar(TABLA);
    const ejemplos = await screen.findByTestId("pregunta-ejemplos");
    const botones = within(ejemplos).getAllByRole("button");
    expect(botones.length).toBeGreaterThanOrEqual(2);
    expect(botones[0]!.textContent).toMatch(/ventas usd por region/);
    fireEvent.click(botones[0]!);
    expect(await screen.findByTestId("pregunta-entendida")).toBeInTheDocument();
    expect(screen.queryByTestId("pregunta-resultado")).toBeNull();
  });
});

describe("la consulta se enseña antes de correr", () => {
  it("«ventas del último trimestre por región»: palabras, SQL, lo comprobado y lo propuesto; no corre sola", async () => {
    pintar(TABLA);
    await preguntar("ventas del último trimestre por región");
    const palabras = (await screen.findByTestId("pregunta-palabras")).textContent!;
    expect(palabras).toContain("la suma de «ventas_usd»");
    expect(palabras).toContain("«region»");
    expect(palabras).toContain("del 2025-10-01 al 2025-12-31");
    const sql = screen.getByTestId("pregunta-sql").textContent!;
    expect(sql).toContain('SELECT "region" AS "region", SUM("ventas_usd") AS "suma_ventas_usd"');
    expect(sql).toContain("\"fecha\" >= '2025-10-01'");
    const validacion = screen.getByTestId("pregunta-validacion").textContent!;
    expect(validacion).toContain("✓");
    expect(validacion).toContain("⚠");
    expect(validacion).toContain("la tabla llega hasta el 2025-12-22");
    // la agregación no estaba en la pregunta: viene PROPUESTA y se puede cambiar
    const propuestos = screen.getByTestId("pregunta-propuestos");
    expect(propuestos.textContent).toContain("propuesto");
    expect(screen.queryByTestId("pregunta-resultado")).toBeNull();
  });

  it("cambiar lo propuesto cambia la consulta, dice «cambiado por ti» y el control sigue a la mano (auditoría A-16)", async () => {
    pintar(TABLA);
    await preguntar("ventas por región");
    const select = within(await screen.findByTestId("pregunta-propuestos")).getByRole("combobox");
    expect(within(screen.getByTestId("pregunta-propuestos")).getByText("propuesto")).toBeTruthy();
    fireEvent.change(select, { target: { value: "promedio" } });
    expect(screen.getByTestId("pregunta-palabras").textContent).toContain("el promedio de «ventas_usd»");
    const marco = screen.getByTestId("pregunta-propuestos");
    expect(within(marco).getByText("cambiado por ti")).toBeTruthy();
    expect(within(marco).queryByText("propuesto")).toBeNull();
    // se puede volver a cambiar sin repetir la pregunta
    fireEvent.change(within(marco).getByRole("combobox"), { target: { value: "suma" } });
    expect(screen.getByTestId("pregunta-palabras").textContent).toContain("la suma de «ventas_usd»");
  });

  it("lo que no se leyó se dice, y la consulta mostrada no lo usa", async () => {
    pintar(TABLA);
    await preguntar("ventas por clima");
    expect((await screen.findByTestId("pregunta-sin-leer")).textContent).toContain("«clima»");
    expect(screen.getByTestId("pregunta-palabras").textContent).not.toContain("clima");
  });

  it("lo que no se entiende lo dice y no enseña ninguna consulta", async () => {
    pintar(TABLA);
    await preguntar("hola, qué tal");
    expect(await screen.findByText(/No encontré en tu pregunta nada que reconozca/)).toBeInTheDocument();
    expect(screen.queryByTestId("pregunta-entendida")).toBeNull();
  });
});

describe("lo ambiguo se pregunta", () => {
  it("un valor que está en dos columnas pregunta de cuál; la respuesta lo cierra", async () => {
    pintar(TABLA);
    await preguntar("ventas de norte");
    const abiertas = await screen.findByTestId("pregunta-abiertas");
    expect(abiertas.textContent).toContain("«norte» está en más de una columna");
    expect(screen.queryByTestId("pregunta-correr")).toBeNull();
    fireEvent.click(within(abiertas).getByLabelText("bodega"));
    expect(await screen.findByTestId("pregunta-entendida")).toBeInTheDocument();
    expect(screen.getByTestId("pregunta-palabras").textContent).toContain("«bodega» es «norte»");
  });

  it("un mes sin año, con dos años en la tabla, pregunta el año", async () => {
    pintar(TABLA);
    await preguntar("ventas en marzo");
    const abiertas = await screen.findByTestId("pregunta-abiertas");
    expect(abiertas.textContent).toContain("¿De qué año es marzo?");
    fireEvent.click(within(abiertas).getByLabelText("2024"));
    expect((await screen.findByTestId("pregunta-palabras")).textContent).toContain("del 2024-03-01 al 2024-03-31");
  });

  it("un orden día/mes ambiguo se pregunta antes de nada y, sin él, la consulta no se puede correr", async () => {
    const latina: CsvTable = {
      headers: ["fecha", "monto"],
      rows: ["05/06/2026", "07/06/2026", "01/05/2026", "03/04/2026"].map((f, i) => [f, String(i + 1)]),
    };
    pintar(latina);
    const orden = await screen.findByTestId("pregunta-orden");
    await preguntar("monto por mes");
    expect(await screen.findByTestId("pregunta-correr")).toBeDisabled();
    expect(screen.getByTestId("pregunta-validacion").textContent).toContain("✕");
    fireEvent.click(within(orden).getByLabelText(/Día, mes, año/));
    await vi.waitFor(() => expect(screen.getByTestId("pregunta-correr")).toBeEnabled());
  });

  it("una columna marcada como dato personal no se agrupa: la consulta no se puede correr", async () => {
    pintar(tablaDelKit("clientes-con-datos-personales.csv"), ["plan"], "clientes.csv");
    await preguntar("promedio de reclamos por plan");
    expect(await screen.findByTestId("pregunta-correr")).toBeDisabled();
    expect(screen.getByTestId("pregunta-validacion").textContent).toContain("posible dato personal");
  });
});

describe("el resultado", () => {
  it("corre al pulsar: trae su frase verificada, su gráfico, su tabla y su CSV", async () => {
    pintar(TABLA);
    await preguntar("promedio de ventas por producto");
    fireEvent.click(await screen.findByTestId("pregunta-correr"));
    const resultado = await screen.findByTestId("pregunta-resultado");
    const frase = within(resultado).getByTestId("pregunta-frase");
    expect(frase.getAttribute("data-verificada")).toBe("si");
    expect(frase.textContent).toMatch(/Por «producto», el promedio de «ventas_usd»/);
    expect(within(resultado).getByTestId("pregunta-grafico").getAttribute("data-modo")).toBe("barras");
    const filas = within(within(resultado).getByTestId("pregunta-tabla")).getAllByRole("row");
    expect(filas).toHaveLength(1 + 3);
    fireEvent.click(within(resultado).getByTestId("pregunta-descargar"));
    expect(descargas).toHaveLength(1);
    expect(descargas[0]!.nombre).toBe("consulta-ventas-por-region.csv");
    const lineas = descargas[0]!.contenido.trimEnd().split("\n");
    expect(lineas[0]).toBe("producto,promedio_ventas_usd,filas");
    expect(lineas).toHaveLength(1 + 3);
  });

  it("por periodo dibuja una línea con las cifras de los extremos escritas", async () => {
    pintar(TABLA);
    await preguntar("total de unidades por mes");
    fireEvent.click(await screen.findByTestId("pregunta-correr"));
    const grafico = await screen.findByTestId("pregunta-grafico");
    expect(grafico.getAttribute("data-modo")).toBe("linea");
    expect(within(grafico).getByRole("img").getAttribute("aria-label")).toMatch(/Línea de unidades: 24 periodos/);
    expect(screen.getByTestId("pregunta-frase").textContent).toMatch(/pasa de .* en 2024-01 a .* en 2025-12/);
  });

  it("cambiar la pregunta o una respuesta borra el resultado anterior", async () => {
    pintar(TABLA);
    await preguntar("ventas por región");
    fireEvent.click(await screen.findByTestId("pregunta-correr"));
    expect(await screen.findByTestId("pregunta-resultado")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("pregunta-input"), { target: { value: "ventas por producto" } });
    expect(screen.queryByTestId("pregunta-resultado")).toBeNull();
    expect(screen.queryByTestId("pregunta-entendida")).toBeNull();
  });

  it("el CSV neutraliza una celda que empieza como una fórmula", async () => {
    const hostil: CsvTable = {
      headers: ["grupo", "monto"],
      rows: [["=CMD()", "5"], ["=CMD()", "7"], ["+x", "1"]],
    };
    pintar(hostil, [], "hostil.csv");
    await preguntar("monto por grupo");
    fireEvent.click(await screen.findByTestId("pregunta-correr"));
    fireEvent.click(await screen.findByTestId("pregunta-descargar"));
    expect(descargas[0]!.contenido).toContain("'=CMD()");
    expect(descargas[0]!.contenido).not.toMatch(/^=CMD/m);
  });
});

describe("nada sale del navegador", () => {
  it("de la pregunta al CSV no se crea un Worker ni se hace una petición ni se registra nada", async () => {
    pintar(TABLA);
    await preguntar("promedio de ventas por región del último trimestre");
    fireEvent.click(await screen.findByTestId("pregunta-correr"));
    await screen.findByTestId("pregunta-resultado");
    fireEvent.click(screen.getByTestId("pregunta-descargar"));
    expect(espias.worker).not.toHaveBeenCalled();
    expect(espias.fetch).not.toHaveBeenCalled();
    expect(espias.beacon).not.toHaveBeenCalled();
    expect(sentry.addBreadcrumb).not.toHaveBeenCalled();
    expect(sentry.captureMessage).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });
});

describe("los dos idiomas", () => {
  it("en inglés lee «sales by region last quarter» y habla en inglés", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    pintar(tablaDelKit("sales-by-region.csv"), [], "sales-by-region.csv");
    expect(await screen.findByText("Ask your data")).toBeInTheDocument();
    await preguntar("sales by region last quarter");
    expect((await screen.findByTestId("pregunta-palabras")).textContent).toBe(
      "I will calculate the sum of «sales_usd», split by «region», in the last quarter of the table (from 2025-10-01 to 2025-12-31).",
    );
    expect(screen.getByTestId("pregunta-validacion").textContent).toContain("careful: the table ends on 2025-12-22");
    fireEvent.click(screen.getByTestId("pregunta-correr"));
    expect((await screen.findByTestId("pregunta-frase")).textContent).toMatch(/^By «region», the sum of «sales_usd» was/);
  });
});
