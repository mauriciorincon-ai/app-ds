// S18: el margen de error de la cifra (IntervaloPanel) y la exploración (ExploracionPanel). Lo que estas pruebas hacen FALLAR:
//  · el intervalo se pide solo, con el comando «interval» y sin payload, con un id negativo (la máquina de estados no lo toma);
//  · la línea dice la cifra, el intervalo del 95 %, los remuestreos y la semilla del experimento; con pocas filas, avisa;
//  · una respuesta que el lector rechaza no se pinta; «no-eval» y agrupar se dicen en vez de callar;
//  · mientras el worker ajusta otro modelo no se pide; con otro resultado, la lectura vieja no se enseña;
//  · la exploración no calcula hasta pulsar, trae el resumen verificado y la matriz con signos, y un resumen que no cuadra no se
//    enseña (las tablas sí); los dos idiomas.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCALE_STORAGE_KEY } from "@/i18n/config";
import { parseCsvWithLimits, type CsvTable } from "@/lib/ds/csv";
import type { RunnerResponse } from "@/workers/protocol";

vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}));

const { I18nProvider } = await import("@/i18n/provider");
const { IntervaloPanel } =
  await import("@/components/resultados/IntervaloPanel");
const { ExploracionPanel } =
  await import("@/components/exploracion/ExploracionPanel");

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixture JSON
const fixture = (nombre: string): any =>
  JSON.parse(
    readFileSync(
      resolve(__dirname, `../fixtures/contrato/${nombre}.json`),
      "utf8",
    ),
  );
const BIN = fixture("interval-result");
const NUM = fixture("interval-result-numerica");

function doble(respuesta: (id: number) => RunnerResponse) {
  const oyentes = new Set<(e: MessageEvent<RunnerResponse>) => void>();
  const enviados: { id: number; type: string; payload?: unknown }[] = [];
  const w = {
    addEventListener: (
      _: string,
      f: (e: MessageEvent<RunnerResponse>) => void,
    ) => oyentes.add(f),
    removeEventListener: (
      _: string,
      f: (e: MessageEvent<RunnerResponse>) => void,
    ) => oyentes.delete(f),
    postMessage: (m: { id: number; type: string; payload?: unknown }) => {
      enviados.push(m);
      const r = respuesta(m.id);
      for (const f of [...oyentes])
        f({ data: { ...r, id: m.id } } as MessageEvent<RunnerResponse>);
    },
  };
  return { worker: { current: w as unknown as Worker }, enviados };
}
const lista = (result: unknown): RunnerResponse => ({
  id: 0,
  type: "result",
  command: "interval",
  result,
});
const fallo = (message: string): RunnerResponse => ({
  id: 0,
  type: "error",
  message,
});

const DE_BIN = (result: object = {}) => ({
  result,
  task: "binaria" as const,
  metric: BIN.metric,
  nTest: BIN.n,
  nClasses: null,
  seed: 42,
  unit: null,
});
const pintar = (ui: React.ReactElement) =>
  render(<I18nProvider>{ui}</I18nProvider>);

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, "es"));
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("el margen de error de la cifra", () => {
  it("se pide solo al estar el modelo quieto: comando «interval», sin payload, id negativo; la línea trae cifra, intervalo, remuestreos y semilla", async () => {
    const { worker, enviados } = doble(() => lista(BIN));
    pintar(<IntervaloPanel de={DE_BIN()} worker={worker} />);
    await screen.findByTestId("intervalo-linea");
    expect(enviados).toHaveLength(1);
    expect(enviados[0]!.type).toBe("interval");
    expect(enviados[0]!.payload).toBeUndefined();
    expect(enviados[0]!.id).toBeLessThan(0);
    const linea = screen.getByTestId("intervalo-linea").textContent!;
    expect(linea).toMatch(
      /con un intervalo del 95 % de \d\.\d\d a \d\.\d\d\.$/,
    );
    expect(
      screen.getByText(
        /1000 veces, con la semilla 42|1,000 veces, con la semilla 42/,
      ),
    ).toBeTruthy();
  });

  it("con pocas filas de prueba avisa de que la cifra dice poco, y con las suficientes no", async () => {
    const pocas = {
      ...BIN,
      n: 20,
      y: BIN.y.slice(0, 20),
      pred: BIN.pred.slice(0, 20),
      score: BIN.score.slice(0, 20),
    };
    const { worker } = doble(() => lista(pocas));
    pintar(<IntervaloPanel de={{ ...DE_BIN(), nTest: 20 }} worker={worker} />);
    await screen.findByTestId("intervalo-linea");
    expect(
      screen.getByText(/Con solo 20 filas de prueba el intervalo es muy ancho/),
    ).toBeTruthy();
    cleanup();
    const bastantes = doble(() => lista(BIN));
    pintar(<IntervaloPanel de={DE_BIN()} worker={bastantes.worker} />);
    await screen.findByTestId("intervalo-linea");
    expect(screen.queryByText(/el intervalo es muy ancho/)).toBeNull();
  });

  it("estimar un número lo escribe con las unidades y los decimales del objetivo", async () => {
    const { worker } = doble(() => lista(NUM));
    pintar(
      <IntervaloPanel
        de={{
          result: {},
          task: "numerica",
          metric: NUM.metric,
          nTest: NUM.n,
          nClasses: null,
          seed: 42,
          unit: { symbol: "kWh" },
        }}
        worker={worker}
      />,
    );
    await screen.findByTestId("intervalo-linea");
    expect(screen.getByTestId("intervalo-linea").textContent).toMatch(/kWh/);
  });

  it("una respuesta que el lector rechaza no se pinta: se dice que no se pudo", async () => {
    const { worker } = doble(() => lista({ ...BIN, y: BIN.y.slice(1) }));
    pintar(<IntervaloPanel de={DE_BIN()} worker={worker} />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByTestId("intervalo-linea")).toBeNull();
  });

  it("un modelo importado («no-eval») lo dice, y agrupar dice que no hay prueba", async () => {
    const { worker } = doble(() => fallo("Error: no-eval"));
    pintar(<IntervaloPanel de={DE_BIN()} worker={worker} />);
    expect(
      await screen.findByText(/no trae la prueba con la que se midió/),
    ).toBeTruthy();
    cleanup();
    pintar(<IntervaloPanel de={null} />);
    expect(
      screen.getByText(/Agrupar no tiene objetivo ni prueba/),
    ).toBeTruthy();
  });

  it("no se pide mientras el worker ajusta otro modelo, y se pide al quedar libre", async () => {
    const { worker, enviados } = doble(() => lista(BIN));
    const de = DE_BIN();
    const { rerender } = pintar(
      <IntervaloPanel de={de} worker={worker} ocupado />,
    );
    expect(enviados).toHaveLength(0);
    rerender(
      <I18nProvider>
        <IntervaloPanel de={de} worker={worker} />
      </I18nProvider>,
    );
    await screen.findByTestId("intervalo-linea");
    expect(enviados).toHaveLength(1);
  });

  it("la lectura es del resultado que la pidió: con otro resultado se vuelve a pedir y la vieja no se enseña", async () => {
    const { worker, enviados } = doble(() => lista(BIN));
    const { rerender } = pintar(
      <IntervaloPanel de={DE_BIN({ a: 1 })} worker={worker} />,
    );
    await screen.findByTestId("intervalo-linea");
    rerender(
      <I18nProvider>
        <IntervaloPanel de={DE_BIN({ b: 2 })} worker={worker} />
      </I18nProvider>,
    );
    await waitFor(() => expect(enviados).toHaveLength(2));
    await screen.findByTestId("intervalo-linea");
  });

  it("en inglés, en inglés", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    const { worker } = doble(() => lista(BIN));
    pintar(<IntervaloPanel de={DE_BIN()} worker={worker} />);
    await screen.findByTestId("intervalo-linea");
    expect(screen.getByTestId("intervalo-linea").textContent).toMatch(
      /with a 95 % interval from/,
    );
  });
});

describe("la exploración", () => {
  const tabla = (): CsvTable => {
    const l = parseCsvWithLimits(
      readFileSync(
        resolve(process.cwd(), "docs/kit-de-prueba/marketing-campania.csv"),
        "utf8",
      ),
    );
    if (!l.ok) throw new Error("kit");
    return l.table;
  };

  it("no calcula hasta pulsar «Explorar»", () => {
    const getTable = vi.fn(tabla);
    pintar(<ExploracionPanel getTable={getTable} />);
    expect(getTable).not.toHaveBeenCalled();
    expect(screen.queryByTestId("exploracion-resumen")).toBeNull();
  });

  it("trae el resumen verificado, las distribuciones desplegables y la matriz con signo", async () => {
    pintar(<ExploracionPanel getTable={tabla} />);
    fireEvent.click(screen.getByRole("button", { name: "Explorar" }));
    const resumen = await screen.findByTestId("exploracion-resumen");
    expect(resumen.textContent).toMatch(/^Tu tabla tiene 200 filas\./);
    expect(screen.getByText(/Verificado contra tus números/)).toBeTruthy();
    // una distribución por columna, cerradas al principio
    expect(document.querySelectorAll("details").length).toBe(7);
    // la matriz: región con nombre, la diagonal en 1.00 y cada otra celda con su signo
    const region = screen.getByRole("region", {
      name: /Correlación entre columnas numéricas/,
    });
    expect(region.textContent).toContain("1.00");
    expect(region.textContent).toMatch(/[+−]\d\.\d\d|–/);
    expect(
      screen.getByRole("button", { name: "Ocultar la exploración" }),
    ).toBeTruthy();
  });

  it("un resumen que no cuadra no se enseña, pero las tablas sí", async () => {
    vi.resetModules();
    vi.doMock("@/lib/narration/exploracion", async (original) => ({
      ...(await original<typeof import("@/lib/narration/exploracion")>()),
      resumenVerificado: () => ({
        texto: null,
        verificado: false,
        fallos: [{ tipo: "cifra-falta", clave: "filas" }],
      }),
    }));
    const { ExploracionPanel: Panel } =
      await import("@/components/exploracion/ExploracionPanel");
    const { I18nProvider: Proveedor } = await import("@/i18n/provider");
    render(
      <Proveedor>
        <Panel getTable={tabla} />
      </Proveedor>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Explorar" }));
    expect(await screen.findByText(/no cuadró con los números/)).toBeTruthy();
    expect(screen.queryByTestId("exploracion-resumen")).toBeNull();
    expect(
      screen.getByRole("region", {
        name: /Correlación entre columnas numéricas/,
      }),
    ).toBeTruthy();
    vi.doUnmock("@/lib/narration/exploracion");
  });

  it("en inglés, el resumen y los títulos en inglés", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    pintar(<ExploracionPanel getTable={tabla} />);
    fireEvent.click(screen.getByRole("button", { name: "Explore" }));
    const resumen = await screen.findByTestId("exploracion-resumen");
    expect(resumen.textContent).toMatch(/^Your table has 200 rows\./);
    expect(screen.getByText("How each column is spread")).toBeTruthy();
  });
});
