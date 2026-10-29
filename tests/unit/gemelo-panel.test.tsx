// S20 (ADR 029): el panel del gemelo sintético. Lo que estas pruebas hacen FALLAR:
//  · mientras el aviso de datos personales se arma, no se puede generar nada; no se pide nada al worker hasta pulsar;
//  · lo marcado como dato personal (y el texto libre, los identificadores y las fechas) NO viaja y la pantalla lo nombra con su motivo;
//  · lo que viaja son las columnas del plan, con su tipo, las filas, cuántas pedir y la semilla fija: nada más;
//  · el veredicto sale con símbolo y palabra («se puede compartir» ✓, «revisar» ⚠, «no compartir» ✕) y el informe dice las tres cosas;
//  · una copia exacta (que el lector recuenta) da «no compartir» con su motivo;
//  · la descarga lleva el CSV del gemelo; una respuesta rechazada por el lector se dice sin valores; los dos idiomas.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCALE_STORAGE_KEY } from "@/i18n/config";
import { parseCsvWithLimits, type CsvTable } from "@/lib/ds/csv";
import type { RunnerResponse } from "@/workers/protocol";

vi.mock("@sentry/nextjs", () => ({ addBreadcrumb: vi.fn(), captureMessage: vi.fn() }));
const descargas: { nombre: string; contenido: string; tipo: string }[] = [];
vi.mock("@/lib/files", async (original) => ({
  ...(await original<typeof import("@/lib/files")>()),
  downloadTextFile: (nombre: string, contenido: string, tipo: string) =>
    descargas.push({ nombre, contenido, tipo }),
}));

const { I18nProvider } = await import("@/i18n/provider");
const { GemeloPanel } = await import("@/components/gemelo/GemeloPanel");

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixtures JSON
const fixture = (): any =>
  JSON.parse(readFileSync(resolve(__dirname, "../fixtures/contrato/synthesize-result.json"), "utf8"));
const TABLA: CsvTable = (() => {
  const p = parseCsvWithLimits(readFileSync(resolve(__dirname, "../../docs/kit-de-prueba/marketing-campania.csv"), "utf8"));
  if (!p.ok) throw new Error("csv");
  return p.table;
})();

type Pedido = { id: number; type: string; payload?: Record<string, unknown> };
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
          f({ data: { id: m.id, type: "result", command: "synthesize", result: respuesta() } } as MessageEvent<RunnerResponse>);
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

const panel = (worker: ReturnType<typeof doble>["worker"], personales: string[] | null, tabla: CsvTable = TABLA) =>
  pintar(<GemeloPanel getTable={() => tabla} personales={personales} worker={worker} datasetName="marketing-campania.csv" />);

describe("antes de generar", () => {
  it("mientras el aviso de datos personales se arma, no se puede generar", () => {
    const { worker, enviados } = doble(() => fixture());
    panel(worker, null);
    expect(screen.getByTestId("gemelo-revisando")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar el gemelo" })).toBeDisabled();
    expect(enviados).toHaveLength(0);
  });

  it("lo marcado como dato personal no viaja y se nombra con su motivo; lo demás viaja", () => {
    const { worker, enviados } = doble(() => fixture());
    panel(worker, ["region"]);
    const fuera = screen.getByTestId("gemelo-fuera").textContent!;
    expect(fuera).toContain("«region»: marcada como posible dato personal");
    expect(screen.getByTestId("gemelo-plan").textContent).toContain("Viajan 6 columnas");
    expect(screen.getByTestId("gemelo-plan").textContent).not.toMatch(/Viajan 6 columnas:[^.]*region/);
    expect(screen.getByRole("button", { name: "Generar el gemelo" })).toBeEnabled();
    expect(enviados).toHaveLength(0);
  });

  it("con muy pocas filas dice cuántas hacen falta y no deja generar", () => {
    const chica: CsvTable = { headers: TABLA.headers, rows: TABLA.rows.slice(0, 12) };
    const { worker } = doble(() => fixture());
    panel(worker, [], chica);
    expect(screen.getByText(/hacen falta al menos 20/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar el gemelo" })).toBeDisabled();
  });

  it("si ninguna columna puede viajar lo dice", () => {
    const { worker } = doble(() => fixture());
    const t: CsvTable = { headers: ["id"], rows: Array.from({ length: 30 }, (_, i) => [String(i)]) };
    panel(worker, [], t);
    expect(screen.getByText(/Ninguna columna puede viajar al gemelo/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar el gemelo" })).toBeDisabled();
  });
});

describe("el gemelo y su informe", () => {
  it("manda solo las columnas del plan con la semilla fija y enseña el veredicto con símbolo y palabra, y el informe", async () => {
    const { worker, enviados } = doble(() => fixture());
    panel(worker, []);
    const vivo = screen.getByTestId("gemelo-vivo"); // S21 (lote 20-B): la región viva ya está antes del resultado
    expect(vivo.getAttribute("aria-live")).toBe("polite");
    fireEvent.click(screen.getByRole("button", { name: "Generar el gemelo" }));
    await screen.findByTestId("gemelo-lectura");
    expect(vivo.contains(screen.getByTestId("gemelo-lectura"))).toBe(true);
    expect(enviados).toHaveLength(1);
    expect(enviados[0]!.type).toBe("synthesize");
    expect(Object.keys(enviados[0]!.payload!).sort()).toEqual(["headers", "kinds", "n_rows", "rows", "seed"]);
    expect(enviados[0]!.payload).toMatchObject({ n_rows: 200, seed: 42 });
    const veredicto = screen.getByTestId("gemelo-veredicto").textContent!;
    expect(veredicto).toContain("✓");
    expect(veredicto).toContain("Se puede compartir");
    expect(veredicto).toContain("Semilla fija: 42. 200 filas sintéticas a partir de 200 filas tuyas.");
    expect(screen.getByTestId("gemelo-columnas").textContent).toMatch(/Columna por columna · ✓ bien/);
    expect(screen.getByTestId("gemelo-relaciones").textContent).toMatch(/Relaciones entre columnas · ✓ bien/);
    expect(screen.getByTestId("gemelo-cercania").textContent).toMatch(/Qué tan cerca queda de tus filas · ✓ bien/);
    expect(screen.getByTestId("gemelo-copias").textContent).toContain("Ninguna fila sintética es idéntica a una tuya");
  });

  it("una copia exacta que el lector recuenta da «no compartir», con su símbolo y su motivo", async () => {
    const r = fixture();
    const real = TABLA.rows[5]!;
    r.rows[0] = r.headers.map((h: string) => real[TABLA.headers.indexOf(h)]);
    r.copies = 1;
    const { worker } = doble(() => r);
    panel(worker, []);
    fireEvent.click(screen.getByRole("button", { name: "Generar el gemelo" }));
    await screen.findByTestId("gemelo-lectura");
    const veredicto = screen.getByTestId("gemelo-veredicto").textContent!;
    expect(veredicto).toContain("✕");
    expect(veredicto).toContain("No compartir");
    expect(veredicto).toContain("quedaron filas idénticas a las tuyas");
    expect(screen.getByTestId("gemelo-copias").textContent).toMatch(/Exactas?.*✕ mal|Copias exactas · ✕ mal/);
  });

  it("la descarga lleva el gemelo como CSV, con los encabezados de las columnas que viajaron", async () => {
    const { worker } = doble(() => fixture());
    panel(worker, []);
    fireEvent.click(screen.getByRole("button", { name: "Generar el gemelo" }));
    await screen.findByTestId("gemelo-descargar");
    fireEvent.click(screen.getByTestId("gemelo-descargar"));
    expect(descargas).toHaveLength(1);
    expect(descargas[0]!.nombre).toBe("gemelo-marketing-campania.csv");
    expect(descargas[0]!.tipo).toBe("text/csv;charset=utf-8");
    const lineas = descargas[0]!.contenido.trimEnd().split("\n");
    expect(lineas[0]).toBe(fixture().headers.join(","));
    expect(lineas).toHaveLength(1 + 200);
  });

  it("cambiar las filas del gemelo borra la lectura anterior", async () => {
    const { worker } = doble(() => fixture());
    panel(worker, []);
    fireEvent.click(screen.getByRole("button", { name: "Generar el gemelo" }));
    await screen.findByTestId("gemelo-lectura");
    fireEvent.change(screen.getByLabelText("Filas del gemelo"), { target: { value: "500" } });
    expect(screen.queryByTestId("gemelo-lectura")).toBeNull();
  });

  it("el campo de filas se teclea dígito a dígito: lo escrito no salta al mínimo mientras se escribe, y se ajusta al salir", async () => {
    const { worker, enviados } = doble(() => fixture());
    panel(worker, []);
    const campo = screen.getByLabelText("Filas del gemelo") as HTMLInputElement;
    for (const parcial of ["5", "50", "500"]) {
      fireEvent.change(campo, { target: { value: parcial } });
      expect(campo.value).toBe(parcial);
    }
    fireEvent.change(campo, { target: { value: "3" } });
    expect(campo.value).toBe("3");
    fireEvent.blur(campo);
    expect(campo.value).toBe("10");
    fireEvent.change(campo, { target: { value: "" } });
    expect(campo.value).toBe("");
    fireEvent.change(campo, { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Generar el gemelo" }));
    // la respuesta de la fixture trae 200 filas y el lector la rechaza (pidió 120): lo que se prueba aquí es lo que SALE
    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0]!.payload).toMatchObject({ n_rows: 120 });
  });

  it("una respuesta que el lector rechaza se dice sin valores", async () => {
    const mala = fixture();
    mala.copies = 3;
    const { worker } = doble(() => mala);
    panel(worker, []);
    fireEvent.click(screen.getByRole("button", { name: "Generar el gemelo" }));
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toContain("contrato: copies");
    expect(screen.queryByTestId("gemelo-lectura")).toBeNull();
  });

  it("en inglés", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    const { worker } = doble(() => fixture());
    panel(worker, []);
    expect(screen.getByRole("heading", { name: "A synthetic twin of your data" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate the twin" }));
    await waitFor(() => expect(screen.getByTestId("gemelo-veredicto").textContent).toContain("Safe to share"));
  });
});
