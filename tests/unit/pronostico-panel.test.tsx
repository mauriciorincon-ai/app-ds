// S20 (ADR 028): el panel «Pronosticar una serie» y su opción en la pantalla de configuración. Lo que estas pruebas hacen FALLAR:
//  · no se pide nada al worker hasta pulsar «Pronosticar»; lo que viaja son SOLO números (la serie, la temporada, el horizonte y el
//    periodo): ninguna fecha, ninguna columna, ningún nombre;
//  · los huecos se nombran y el botón espera la decisión del usuario; con demasiados no se ofrecen;
//  · una fecha ambigua (05/06) PREGUNTA el orden antes de armar nada;
//  · el resultado dice el veredicto con símbolo y palabra, la liga con la marca del ganador y del mejor simple, el gráfico con su
//    equivalente en tabla, y la descarga lleva la historia y el pronóstico;
//  · una respuesta que el lector rechaza se dice sin valores; un cambio de entrada borra la lectura anterior;
//  · la opción de pronosticar solo se ofrece con una fecha, un número y el worker, y no cambia el flujo de las otras tareas;
//  · los dos idiomas.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCALE_STORAGE_KEY } from "@/i18n/config";
import { parseCsvWithLimits, type CsvTable } from "@/lib/ds/csv";
import { summarizeDataset } from "@/lib/experiment";
import type { RunnerResponse } from "@/workers/protocol";

vi.mock("@sentry/nextjs", () => ({ addBreadcrumb: vi.fn(), captureMessage: vi.fn() }));
const descargas: { nombre: string; contenido: string; tipo: string }[] = [];
vi.mock("@/lib/files", async (original) => ({
  ...(await original<typeof import("@/lib/files")>()),
  downloadTextFile: (nombre: string, contenido: string, tipo: string) =>
    descargas.push({ nombre, contenido, tipo }),
}));

const { I18nProvider } = await import("@/i18n/provider");
const { PronosticoPanel } = await import("@/components/pronostico/PronosticoPanel");
const { ConfigScreen } = await import("@/components/ConfigScreen");

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixtures JSON
const fixture = (nombre: string): any =>
  JSON.parse(readFileSync(resolve(__dirname, `../fixtures/contrato/${nombre}.json`), "utf8"));
const kit = (archivo: string): CsvTable => {
  const p = parseCsvWithLimits(readFileSync(resolve(__dirname, `../../docs/kit-de-prueba/${archivo}`), "utf8"));
  if (!p.ok) throw new Error("csv");
  return p.table;
};

type Pedido = { id: number; type: string; payload?: { y: number[]; season: number; horizon: number; period: string } };
function doble(respuesta: () => unknown) {
  const oyentes = new Set<(e: MessageEvent<RunnerResponse>) => void>();
  const enviados: Pedido[] = [];
  const w = {
    addEventListener: (_: string, f: (e: MessageEvent<RunnerResponse>) => void) => oyentes.add(f),
    removeEventListener: (_: string, f: (e: MessageEvent<RunnerResponse>) => void) => oyentes.delete(f),
    postMessage: (m: Pedido) => {
      enviados.push(m);
      queueMicrotask(() => {
        for (const f of [...oyentes])
          f({ data: { id: m.id, type: "result", command: "forecast", result: respuesta() } } as MessageEvent<RunnerResponse>);
      });
    },
  };
  return { worker: { current: w as unknown as Worker }, enviados };
}

const pintar = (ui: React.ReactElement) => render(<I18nProvider>{ui}</I18nProvider>);
beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, "es"));
afterEach(() => {
  cleanup();
  localStorage.clear();
  descargas.length = 0;
});

function panel(tabla: CsvTable, worker: ReturnType<typeof doble>["worker"] | undefined) {
  return pintar(
    <PronosticoPanel getTable={() => tabla} worker={worker} datasetName="serie-ventas-mensual.csv" />,
  );
}

describe("el flujo del panel", () => {
  it("arma la serie, propone el periodo y no pide nada hasta pulsar", () => {
    const { worker, enviados } = doble(() => fixture("forecast-result"));
    panel(kit("serie-ventas-mensual.csv"), worker);
    expect(screen.getByTestId("pronostico-serie").textContent).toContain("60 periodos, de 2021-01 a 2025-12");
    expect((screen.getByLabelText("Un valor por…") as HTMLSelectElement).value).toBe("mes");
    expect((screen.getByLabelText("Periodos a pronosticar") as HTMLInputElement).value).toBe("12");
    expect(enviados).toHaveLength(0);
  });

  it("al pulsar manda SOLO números (sin fechas ni nombres de columna) y enseña veredicto, liga, gráfico y tabla", async () => {
    const { worker, enviados } = doble(() => fixture("forecast-result"));
    panel(kit("serie-ventas-mensual.csv"), worker);
    fireEvent.click(screen.getByRole("button", { name: "Pronosticar" }));
    await waitFor(() => expect(screen.getByTestId("pronostico-lectura")).toBeInTheDocument());
    expect(enviados).toHaveLength(1);
    const { type, payload } = enviados[0]!;
    expect(type).toBe("forecast");
    expect(Object.keys(payload!).sort()).toEqual(["horizon", "period", "season", "y"]);
    expect(payload).toMatchObject({ season: 12, horizon: 12, period: "mes" });
    expect(payload!.y).toHaveLength(60);
    expect(payload!.y.every((v) => typeof v === "number")).toBe(true);
    expect(JSON.stringify(enviados)).not.toMatch(/\d{4}-\d{2}|ventas|"mes":/);

    const veredicto = screen.getByTestId("pronostico-veredicto").textContent!;
    expect(veredicto).toContain("✓");
    expect(veredicto).toContain("Supera al mejor método simple");
    const liga = screen.getByTestId("pronostico-liga");
    expect(liga.textContent).toContain("★");
    expect(liga.textContent).toContain("◆");
    expect(liga.querySelectorAll("tbody tr")).toHaveLength(6);
    expect(screen.getByRole("img", { name: /Gráfico de la serie y su pronóstico: 60 periodos de historia y 12 de pronóstico/ })).toBeInTheDocument();
    expect(screen.getByText("Ver el pronóstico en una tabla")).toBeInTheDocument();
  });

  it("la descarga lleva la historia y el pronóstico, en el idioma de la pantalla", async () => {
    const { worker } = doble(() => fixture("forecast-result"));
    panel(kit("serie-ventas-mensual.csv"), worker);
    fireEvent.click(screen.getByRole("button", { name: "Pronosticar" }));
    await waitFor(() => screen.getByTestId("pronostico-descargar"));
    fireEvent.click(screen.getByTestId("pronostico-descargar"));
    expect(descargas).toHaveLength(1);
    expect(descargas[0]!.nombre).toBe("pronostico-serie-ventas-mensual.csv");
    const lineas = descargas[0]!.contenido.trimEnd().split("\n");
    expect(lineas[0]).toBe("periodo,tipo,valor,inferior_80,superior_80,inferior_95,superior_95,completado");
    expect(lineas).toHaveLength(1 + 60 + 12);
    expect(lineas[1]).toMatch(/^2021-01,historia,/);
    expect(lineas[61]).toMatch(/^2026-01,pronostico,/);
  });

  it("cambiar una entrada borra la lectura anterior", async () => {
    const { worker } = doble(() => fixture("forecast-result"));
    panel(kit("serie-ventas-mensual.csv"), worker);
    fireEvent.click(screen.getByRole("button", { name: "Pronosticar" }));
    await waitFor(() => screen.getByTestId("pronostico-lectura"));
    fireEvent.change(screen.getByLabelText("Periodos a pronosticar"), { target: { value: "6" } });
    expect(screen.queryByTestId("pronostico-lectura")).toBeNull();
  });

  it("el horizonte se puede borrar y teclear de nuevo: lo escrito no salta al mínimo mientras se escribe", async () => {
    const { worker, enviados } = doble(() => fixture("forecast-result"));
    panel(kit("serie-ventas-mensual.csv"), worker);
    const campo = screen.getByLabelText("Periodos a pronosticar") as HTMLInputElement;
    fireEvent.change(campo, { target: { value: "" } });
    expect(campo.value).toBe("");
    fireEvent.change(campo, { target: { value: "2" } });
    expect(campo.value).toBe("2");
    fireEvent.change(campo, { target: { value: "24" } });
    expect(campo.value).toBe("24");
    fireEvent.click(screen.getByRole("button", { name: "Pronosticar" }));
    // la respuesta de la fixture es de 12 periodos y el lector la rechaza (pidió 24): lo que se prueba aquí es lo que SALE
    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0]!.payload).toMatchObject({ horizon: 24 });
    // un valor fuera de rango se ajusta al salir del campo
    fireEvent.change(campo, { target: { value: "0" } });
    fireEvent.blur(campo);
    expect(campo.value).toBe("1");
  });

  it("una respuesta que el lector rechaza se dice sin valores", async () => {
    const mala = fixture("forecast-result");
    mala.league[3].cv.mean *= 1.5;
    const { worker } = doble(() => mala);
    panel(kit("serie-ventas-mensual.csv"), worker);
    fireEvent.click(screen.getByRole("button", { name: "Pronosticar" }));
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toContain("contrato: league[3].cv.mean");
    expect(screen.queryByTestId("pronostico-lectura")).toBeNull();
  });

  it("sin el worker el botón no se puede pulsar", () => {
    panel(kit("serie-ventas-mensual.csv"), undefined);
    expect(screen.getByRole("button", { name: "Pronosticar" })).toBeDisabled();
  });

  it("en inglés", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    const { worker } = doble(() => fixture("forecast-result"));
    panel(kit("serie-ventas-mensual.csv"), worker);
    expect(screen.getByRole("heading", { name: "Forecast a series" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Forecast" }));
    await waitFor(() => screen.getByTestId("pronostico-veredicto"));
    expect(screen.getByTestId("pronostico-veredicto").textContent).toContain("Beats the best simple method");
  });
});

describe("las preguntas", () => {
  it("con huecos los nombra y el botón espera la decisión; completar manda la serie entera", async () => {
    const { worker, enviados } = doble(() => fixture("forecast-result"));
    panel(kit("serie-ventas-con-huecos.csv"), worker);
    const huecos = screen.getByTestId("pronostico-huecos");
    expect(huecos.textContent).toContain("Faltan 3 periodos: 2022-06, 2022-07, 2024-05");
    const boton = screen.getByRole("button", { name: "Pronosticar" });
    expect(boton).toBeDisabled();
    expect(huecos.textContent).toContain("no se rellenan solos");
    fireEvent.click(screen.getByRole("checkbox"));
    expect(boton).toBeEnabled();
    fireEvent.click(boton);
    await waitFor(() => screen.getByTestId("pronostico-lectura"));
    expect(enviados[0]!.payload!.y).toHaveLength(60);
    // lo completado es la recta entre los vecinos
    const y = enviados[0]!.payload!.y;
    expect(y[17]).toBeCloseTo(y[16]! + (y[19]! - y[16]!) / 3, 9);
    // y el gráfico lo marca con palabras
    expect(screen.getByText(/Un punto hueco marca un periodo que se completó/)).toBeInTheDocument();
  });

  it("con demasiados huecos no se ofrece completar", () => {
    const tabla: CsvTable = {
      headers: ["mes", "ventas"],
      rows: [["2021-01-01", "1"], ["2021-04-01", "2"], ["2021-08-01", "3"]],
    };
    const { worker } = doble(() => fixture("forecast-result"));
    panel(tabla, worker);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByTestId("pronostico-huecos").textContent).toContain("Faltan demasiados periodos");
    expect(screen.getByRole("button", { name: "Pronosticar" })).toBeDisabled();
  });

  it("una fecha ambigua (05/06/2026) pregunta el orden antes de armar la serie", () => {
    const tabla: CsvTable = {
      headers: ["dia", "ventas"],
      rows: [["01/02/2026", "1"], ["02/02/2026", "2"], ["03/02/2026", "3"], ["04/02/2026", "4"]],
    };
    const { worker, enviados } = doble(() => fixture("forecast-result"));
    panel(tabla, worker);
    expect(screen.getByTestId("pronostico-orden").textContent).toContain("¿En qué orden vienen?");
    expect(screen.queryByTestId("pronostico-serie")).toBeNull();
    expect(screen.getByRole("button", { name: "Pronosticar" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /Día, mes, año/ }));
    expect(screen.getByTestId("pronostico-serie").textContent).toContain("4 periodos");
    expect(enviados).toHaveLength(0);
  });

  it("una serie corta se dice con lo que falta y sin inventar un pronóstico", async () => {
    const { worker } = doble(() => ({ viable: false, n: 60, needed: 77, horizon: 12 }));
    panel(kit("serie-ventas-mensual.csv"), worker);
    fireEvent.click(screen.getByRole("button", { name: "Pronosticar" }));
    const corta = await screen.findByTestId("pronostico-corta");
    expect(corta.textContent).toContain("tiene 60 y hacen falta al menos 77");
    expect(screen.queryByTestId("pronostico-veredicto")).toBeNull();
  });
});

describe("la opción en la pantalla de configuración", () => {
  const props = (dataset: ReturnType<typeof summarizeDataset>) => ({
    dataset,
    sanitation: null,
    edaAlerts: null,
    plan: null,
    onSelectTarget: vi.fn(),
    onSelectCluster: vi.fn(),
    onRun: vi.fn(),
    onBack: vi.fn(),
  });

  it("se ofrece con una fecha, un número y el worker, y abre el panel sin tocar el objetivo", async () => {
    const tabla = kit("serie-ventas-mensual.csv");
    const p = props(summarizeDataset(tabla));
    const { worker } = doble(() => ({}));
    pintar(<ConfigScreen {...p} getTable={() => tabla} getRawTable={() => tabla} worker={worker} datasetName="s.csv" />);
    const select = screen.getByLabelText("¿Qué quieres predecir?") as HTMLSelectElement;
    const opcion = [...select.options].find((o) => o.value === "__pronosticar__");
    expect(opcion?.textContent).toBe("Con una fecha: pronosticar una serie");
    fireEvent.change(select, { target: { value: "__pronosticar__" } });
    expect(await screen.findByTestId("pronostico-panel")).toBeInTheDocument();
    expect(p.onSelectTarget).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Entrenar" })).toBeNull();
    // volver a una columna devuelve el flujo de siempre
    fireEvent.change(select, { target: { value: "ventas" } });
    expect(p.onSelectTarget).toHaveBeenCalledWith("ventas");
    expect(screen.queryByTestId("pronostico-panel")).toBeNull();
  });

  it("un archivo que es solo una serie ofrece únicamente pronosticar, con el panel ya abierto", async () => {
    const tabla = kit("serie-ventas-mensual.csv");
    const { worker } = doble(() => ({}));
    pintar(
      <ConfigScreen
        {...props(summarizeDataset(tabla))}
        soloSerie
        getRawTable={() => tabla}
        worker={worker}
        datasetName="s.csv"
      />,
    );
    const select = screen.getByLabelText("¿Qué quieres predecir?") as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["", "__pronosticar__"]);
    expect(select.value).toBe("__pronosticar__");
    expect(await screen.findByTestId("pronostico-panel")).toBeInTheDocument();
    expect(screen.getByText(/Este archivo es una serie/)).toBeInTheDocument();
    expect(screen.queryByText(/parecen fecha/)).toBeNull();
  });

  it("no se ofrece sin fecha, ni sin número, ni sin worker", () => {
    const sinFecha: CsvTable = { headers: ["x", "y"], rows: [["1", "0"], ["2", "1"], ["3", "0"]] };
    const { worker } = doble(() => ({}));
    pintar(<ConfigScreen {...props(summarizeDataset(sinFecha))} getTable={() => sinFecha} getRawTable={() => sinFecha} worker={worker} />);
    expect([...(screen.getByLabelText("¿Qué quieres predecir?") as HTMLSelectElement).options].map((o) => o.value)).not.toContain("__pronosticar__");
    cleanup();
    const conFecha = kit("serie-ventas-mensual.csv");
    pintar(<ConfigScreen {...props(summarizeDataset(conFecha))} getTable={() => conFecha} getRawTable={() => conFecha} />);
    expect([...(screen.getByLabelText("¿Qué quieres predecir?") as HTMLSelectElement).options].map((o) => o.value)).not.toContain("__pronosticar__");
  });
});
