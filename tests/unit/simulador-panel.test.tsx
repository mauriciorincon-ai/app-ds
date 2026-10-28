// S19 (ADR 027): el panel «¿Qué pasaría si?». Lo que estas pruebas hacen FALLAR:
//  · «Simular» lleva su icono de trazo a la izquierda del texto; no se pide nada hasta pulsarlo;
//  · al pulsar viaja al worker SOLO lo del modelo (las columnas de su esquema) y la columna ya cambiada, y la lectura dice cuántas
//    decisiones cambian, con la insignia «Verificada contra tus números» (símbolo + palabra);
//  · con costos escritos hay dinero; sin ellos el panel lo dice; con los costos de la etapa 1 no los vuelve a pedir;
//  · un segmento mal escrito se dice y no llega al worker; una categoría que no existe no se puede elegir;
//  · una respuesta que el lector rechaza se dice sin valores; mientras se reajusta al ganador se avisa; una lectura de otro
//    modelo no se enseña; los dos idiomas.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCALE_STORAGE_KEY } from "@/i18n/config";
import type { CsvTable } from "@/lib/ds/csv";
import type { SimulatePayload, SimulateResult } from "@/workers/protocol";

vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}));

const { I18nProvider } = await import("@/i18n/provider");
const { SimuladorPanel } = await import(
  "@/components/simulador/SimuladorPanel"
);

const TABLA: CsvTable = {
  headers: ["precio", "region", "edad", "id"],
  rows: [
    ["100", "norte", "30", "a"],
    ["200", "sur", "40", "b"],
    ["300", "norte", "50", "c"],
    ["400", "sur", "60", "d"],
  ],
};

/** Un worker de mentira: dice «sí» a las filas de la mitad de arriba antes y a todas después. */
function responder(p: SimulatePayload): SimulateResult {
  const n = p.rows.length;
  return {
    task: "binaria",
    n,
    column: p.column,
    positive_class: "si",
    base: {
      pred: Array.from({ length: n }, (_, i) => (i < n / 2 ? "si" : "no")),
      proba: Array.from({ length: n }, (_, i) => (i < n / 2 ? 0.8 : 0.2)),
    },
    changed: {
      pred: Array.from({ length: n }, () => "si"),
      proba: Array.from({ length: n }, () => 0.8),
    },
    outside: { before: 0, after: 0 },
    elapsed_ms: 1,
  };
}

const propsBase = (simular = vi.fn(async (p: SimulatePayload) => responder(p))) => ({
  tabla: TABLA,
  tarea: "binaria" as const,
  numericas: ["precio", "edad"],
  categoricas: ["region"],
  clases: ["no", "si"],
  positiva: "si",
  semilla: 42,
  simular,
  modelo: {},
});

const pintar = (ui: React.ReactElement) => render(<I18nProvider>{ui}</I18nProvider>);

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, "es"));
afterEach(() => {
  cleanup();
  localStorage.clear();
});

const escribir = (etiqueta: RegExp, valor: string) =>
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });

describe("el panel «¿Qué pasaría si?»", () => {
  it("«Simular» lleva su icono a la izquierda y no se pide nada hasta pulsarlo", () => {
    const simular = vi.fn(async (p: SimulatePayload) => responder(p));
    pintar(<SimuladorPanel {...propsBase(simular)} />);
    const boton = screen.getByRole("button", { name: /Simular/ });
    expect(boton.firstElementChild?.tagName.toLowerCase()).toBe("svg");
    expect(simular).not.toHaveBeenCalled();
  });

  it("al pulsar viaja solo lo del modelo y la columna cambiada; la lectura dice las decisiones que cambian, verificada", async () => {
    const simular = vi.fn(async (p: SimulatePayload) => responder(p));
    pintar(<SimuladorPanel {...propsBase(simular)} />);
    const vivo = screen.getByTestId("simulador-vivo"); // S21 (lote 19-13): la región viva ya está antes del resultado
    expect(vivo.getAttribute("aria-live")).toBe("polite");
    escribir(/Porcentaje/, "50");
    fireEvent.click(screen.getByRole("button", { name: /Simular/ }));
    await screen.findByTestId("simulador-lectura");
    expect(vivo.contains(screen.getByTestId("simulador-lectura"))).toBe(true);
    expect(simular).toHaveBeenCalledTimes(1);
    const [payload, sent] = simular.mock.calls[0]! as unknown as [SimulatePayload, { n: number }];
    expect(payload.headers).toEqual(["precio", "edad", "region"]);
    expect(payload.headers).not.toContain("id");
    expect(payload.column).toBe("precio");
    expect(payload.values).toEqual(["150", "300", "450", "600"]);
    expect(sent.n).toBe(4);
    const resumen = screen.getByTestId("simulador-resumen").textContent!;
    expect(resumen).toContain("De 4 filas");
    expect(resumen).toContain("cambian 2 decisiones");
    const insignia = screen.getByTestId("simulador-verificada");
    expect(insignia.textContent).toContain("Verificada contra tus números");
    expect(insignia.textContent).toContain("✓");
  });

  it("con costos hay dinero; sin ellos el panel dice por qué no", async () => {
    pintar(<SimuladorPanel {...propsBase()} />);
    fireEvent.click(screen.getByRole("button", { name: /Simular/ }));
    expect((await screen.findByTestId("simulador-resumen")).textContent).toContain(
      "Sin tus costos no hay cifra en dinero",
    );
    cleanup();
    pintar(<SimuladorPanel {...propsBase()} />);
    escribir(/falso positivo/, "10");
    escribir(/falso negativo/, "30");
    escribir(/Unidad/, "USD");
    fireEvent.click(screen.getByRole("button", { name: /Simular/ }));
    const texto = (await screen.findByTestId("simulador-resumen")).textContent!;
    // antes: dos filas actúan con p=.8 → .2·10=2 cada una; dos no actúan con p=.2 → .2·30=6 cada una → media 4 → 400 por 100
    // después: las cuatro actúan con p=.8 → 2 cada una → media 2 → 200 por 100
    expect(texto).toContain("de 400 USD a 200 USD (-200 USD)");
  });

  it("con los costos de la etapa 1 no los vuelve a pedir y lo dice", async () => {
    pintar(
      <SimuladorPanel
        {...propsBase()}
        costosEscritos={{ costos: { task: "binaria", fp: 10, fn: 30 }, unidad: "USD" }}
        notaEntrenamiento
      />,
    );
    expect(screen.queryByLabelText(/falso positivo/)).toBeNull();
    expect(screen.getByText(/Son los costos que escribiste en la etapa 1/)).toBeTruthy();
    expect(screen.getByText(/la prueba se abrió una vez en la etapa 8 y no se vuelve a abrir/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Simular/ }));
    expect((await screen.findByTestId("simulador-resumen")).textContent).toContain("USD");
  });

  it("un segmento mal escrito se dice y no llega al worker; uno bueno solo mueve a los suyos", async () => {
    const simular = vi.fn(async (p: SimulatePayload) => responder(p));
    pintar(<SimuladorPanel {...propsBase(simular)} />);
    fireEvent.click(screen.getByLabelText(/Solo a un segmento/));
    fireEvent.click(screen.getByRole("button", { name: /Simular/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("El segmento no está bien escrito");
    expect(simular).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Columna del segmento/), { target: { value: "region" } });
    escribir(/^Valor$/, "norte");
    escribir(/Porcentaje/, "100");
    fireEvent.click(screen.getByRole("button", { name: /Simular/ }));
    await waitFor(() => expect(simular).toHaveBeenCalledTimes(1));
    expect(simular.mock.calls[0]![0].values).toEqual(["200", "200", "600", "400"]);
  });

  it("una categoría que no existe no se puede elegir: el selector solo trae las de la columna", () => {
    pintar(<SimuladorPanel {...propsBase()} />);
    fireEvent.change(screen.getByLabelText(/Columna a cambiar/), { target: { value: "region" } });
    // S21 (lote 19-02): el selector lleva su propia etiqueta («Categoría»), no la de la opción de arriba
    const opciones = [...screen.getByLabelText(/^Categoría$/).querySelectorAll("option")].map((o) => o.textContent);
    expect(opciones).toEqual(["norte", "sur"]);
  });

  it("un costo que no es mayor que cero se dice, y no se calla (S21, lote 19-03/04)", async () => {
    pintar(<SimuladorPanel {...propsBase()} />);
    expect(screen.queryByText("Escribe un número mayor que cero.")).toBeNull();
    escribir(/falso positivo/, "0");
    escribir(/falso negativo/, "30");
    expect(screen.getByText("Escribe un número mayor que cero.")).toBeTruthy();
    escribir(/falso positivo/, "10");
    expect(screen.queryByText("Escribe un número mayor que cero.")).toBeNull();
  });

  it("con varias clases, si falta el costo de alguna lo dice (S21, lote 19-03/04)", () => {
    pintar(<SimuladorPanel {...propsBase()} tarea="multiclase" clases={["a", "b", "c"]} positiva={null} />);
    expect(screen.queryByText(/Escribe el costo de todas las clases/)).toBeNull();
    escribir(/la clase real es «a»/, "5");
    expect(screen.getByText("Escribe el costo de todas las clases para ver el dinero.")).toBeTruthy();
    escribir(/la clase real es «b»/, "7");
    escribir(/la clase real es «c»/, "9");
    expect(screen.queryByText(/Escribe el costo de todas las clases/)).toBeNull();
  });

  it("la respuesta de la columna de antes no pisa el reinicio cuando se cambia de columna (S21, lote 19-11)", async () => {
    let responderPendiente: () => void = () => undefined;
    const simular = vi.fn(
      (p: SimulatePayload) =>
        new Promise<SimulateResult>((res) => {
          responderPendiente = () => res(responder(p));
        }),
    );
    pintar(<SimuladorPanel {...propsBase(simular)} />);
    fireEvent.click(screen.getByRole("button", { name: /Simular/ }));
    await waitFor(() => expect(simular).toHaveBeenCalledTimes(1));
    // el usuario cambia de columna mientras la primera respuesta viaja: el panel vuelve a empezar
    fireEvent.change(screen.getByLabelText(/Columna a cambiar/), { target: { value: "edad" } });
    responderPendiente();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("simulador-lectura")).toBeNull();
    expect((screen.getByRole("button", { name: /Simular/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("un valor que no es número se dice sin llamar al worker", async () => {
    const simular = vi.fn(async (p: SimulatePayload) => responder(p));
    pintar(<SimuladorPanel {...propsBase(simular)} />);
    escribir(/Porcentaje/, "mucho");
    fireEvent.click(screen.getByRole("button", { name: /Simular/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("Escribe un número");
    expect(simular).not.toHaveBeenCalled();
  });

  it("una respuesta rechazada por el lector se dice sin valores; el botón queda para reintentar", async () => {
    const simular = vi.fn(async () => {
      throw new Error("contrato: base.proba");
    });
    pintar(<SimuladorPanel {...propsBase(simular)} />);
    fireEvent.click(screen.getByRole("button", { name: /Simular/ }));
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toContain("contrato: base.proba");
    expect(screen.queryByTestId("simulador-lectura")).toBeNull();
    expect((screen.getByRole("button", { name: /Simular/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("avisa mientras se reajusta al ganador y mientras calcula", async () => {
    pintar(<SimuladorPanel {...propsBase()} ajustando />);
    expect(screen.getByRole("status").textContent).toContain("La prueba no se abre");
  });

  it("una lectura de otro modelo no se enseña", async () => {
    const modeloA = {};
    const modeloB = {};
    const { rerender } = pintar(<SimuladorPanel {...propsBase()} modelo={modeloA} />);
    fireEvent.click(screen.getByRole("button", { name: /Simular/ }));
    await screen.findByTestId("simulador-lectura");
    rerender(
      <I18nProvider>
        <SimuladorPanel {...propsBase()} modelo={modeloB} />
      </I18nProvider>,
    );
    expect(screen.queryByTestId("simulador-lectura")).toBeNull();
  });

  it("en inglés", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    pintar(<SimuladorPanel {...propsBase()} />);
    expect(screen.getByText("What if?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Simulate/ }));
    expect((await screen.findByTestId("simulador-resumen")).textContent).toContain("Of 4 rows");
    expect(screen.getByTestId("simulador-verificada").textContent).toContain("Checked against your numbers");
  });

  it("varias clases con costos por clase y la tabla de filas por opción", async () => {
    const simular = vi.fn(async (p: SimulatePayload): Promise<SimulateResult> => ({
      task: "multiclase",
      n: p.rows.length,
      column: p.column,
      classes: ["a", "b"],
      base: { pred: ["a", "a", "b", "b"], proba: [[0.9, 0.1], [0.8, 0.2], [0.3, 0.7], [0.2, 0.8]] },
      changed: { pred: ["a", "b", "b", "b"], proba: [[0.9, 0.1], [0.4, 0.6], [0.3, 0.7], [0.2, 0.8]] },
      outside: { before: 0, after: 1 },
      elapsed_ms: 1,
    }));
    pintar(
      <SimuladorPanel
        {...propsBase(simular)}
        tarea="multiclase"
        clases={["a", "b"]}
        positiva={null}
      />,
    );
    escribir(/clase real es «a»/, "10");
    escribir(/clase real es «b»/, "40");
    fireEvent.click(screen.getByRole("button", { name: /Simular/ }));
    const resumen = (await screen.findByTestId("simulador-resumen")).textContent!;
    expect(resumen).toContain("1 cambia de opción");
    // costo de elegir mal: elegir a cuesta p(b)·40; elegir b cuesta p(a)·10. Antes: .1·40=4, .2·40=8, .3·10=3, .2·10=2 → 4.25
    // después: 4, .4·10=4, 3, 2 → 3.25 → por 100: 425 → 325
    expect(resumen).toContain("de 425 a 325 (-100)");
    expect(screen.getByRole("table").textContent).toContain("Filas por opción");
    expect(screen.getByText(/1 fila queda fuera de lo que el modelo vio/)).toBeTruthy();
  });
});
