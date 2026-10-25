// S17 (ADR 023): el panel «Estrésalo» de Probeta y su vista. Ningún worker de verdad: un doble entrega lo que
// pipeline.py escribió (los fixtures del contrato). Lo que estas pruebas hacen FALLAR si se rompe:
//  · nada se mide hasta pulsar el botón, y el comando es «stress» sin payload;
//  · la frase dice cuánto cae y de dónde a dónde, y el ✓ / ⚠ lleva su palabra (el color nunca solo);
//  · una respuesta que el lector rechaza no se pinta: se dice que no se pudo;
//  · un modelo importado («no-eval») y agrupar lo dicen en pantalla en vez de callar;
//  · la lectura es del RESULTADO que la pidió: con otro resultado, no se enseña;
//  · mientras el worker ajusta otro modelo, no se mide;
//  · los dos idiomas.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EstresDe } from "@/components/estres/EstresPanel";
import { LOCALE_STORAGE_KEY } from "@/i18n/config";
import type { RunnerResponse } from "@/workers/protocol";

vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}));

const { I18nProvider } = await import("@/i18n/provider");
const { EstresPanel } = await import("@/components/estres/EstresPanel");

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixture JSON
const fixture = (name: string): any =>
  JSON.parse(
    readFileSync(
      resolve(__dirname, `../fixtures/contrato/${name}.json`),
      "utf8",
    ),
  );

const FIX = fixture("estres-result");
const columnas = (kind: string) =>
  FIX.shuffle
    .filter((e: { kind: string }) => e.kind === kind)
    .map((e: { column: string }) => e.column);

const RESULTADO = {}; // la identidad del resultado que se estresa
const DE: EstresDe = {
  result: RESULTADO,
  task: FIX.task,
  metric: FIX.metric.name,
  nTest: FIX.n_test,
  numeric: columnas("numeric"),
  categorical: columnas("categorical"),
  rival: 0.4,
  unit: null,
};

/** Un worker de mentira: al recibir el comando entrega la respuesta a quien escucha, como el real. */
function doble(respuesta: RunnerResponse | ((id: number) => RunnerResponse)) {
  const oyentes = new Set<(e: MessageEvent<RunnerResponse>) => void>();
  const enviados: { id: number; type: string }[] = [];
  const w = {
    addEventListener: (_: string, f: (e: MessageEvent<RunnerResponse>) => void) => oyentes.add(f),
    removeEventListener: (_: string, f: (e: MessageEvent<RunnerResponse>) => void) => oyentes.delete(f),
    postMessage: (m: { id: number; type: string }) => {
      enviados.push(m);
      const r = typeof respuesta === "function" ? respuesta(m.id) : respuesta;
      const respondida = { ...r, id: m.id } as RunnerResponse;
      for (const f of [...oyentes]) f({ data: respondida } as MessageEvent<RunnerResponse>);
    },
  };
  return { worker: { current: w as unknown as Worker }, enviados, oyentes };
}
const resultado = (result: unknown): RunnerResponse => ({
  id: 1,
  type: "result",
  command: "stress",
  result,
});

const pintar = (ui: React.ReactElement) => render(<I18nProvider>{ui}</I18nProvider>);

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("el panel «Estrésalo»", () => {
  it("no mide hasta pulsar; el comando es «stress» sin payload; la lectura trae la frase, el ✓/⚠ con su palabra y las tres tablas", async () => {
    const { worker, enviados } = doble(resultado(FIX));
    pintar(<EstresPanel de={DE} worker={worker} />);
    expect(enviados).toHaveLength(0);
    expect(screen.queryByTestId("estres-lectura")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Estrésalo" }));
    expect(enviados).toHaveLength(1);
    expect(enviados[0]!.type).toBe("stress");
    // el id del panel es negativo: la máquina de estados del hook (ids ≥ 0) no lo toma por suyo
    expect(enviados[0]!.id).toBeLessThan(0);

    const lectura = await screen.findByTestId("estres-lectura");
    // 10 % de ruido: F1 de 0.68 a 0.65 (fixture escrito por Python)
    expect(screen.getByTestId("estres-frase").textContent).toBe(
      "Con 10 % de ruido en los números, tu F1 cae de 0.68 a 0.65.",
    );
    // el criterio dice SIEMPRE su palabra, además del símbolo
    expect(screen.getByTestId("estres-sello").textContent).toMatch(
      /^(✓ Con 10 % de ruido sigue ganándole|⚠ Con 10 % de ruido deja de ganarle)/,
    );
    // tres tablas con sus encabezados, y cada fila con símbolo + palabra
    expect(within(lectura).getAllByRole("table")).toHaveLength(3);
    expect(within(lectura).getAllByText(/^▼ peor$/).length).toBeGreaterThan(0);
    // la columna que más duele aparece en la tabla del barajado
    expect(within(lectura).getByRole("rowheader", { name: FIX.shuffle[0].column })).toBeTruthy();
    // el botón pasa a «Volver a medir»
    expect(screen.getByRole("button", { name: "Volver a medir" })).toBeTruthy();
  });

  it("el rival sin modelo decide el ✓: ganándole sale ✓, si no ⚠ (y la cifra se ve igual)", async () => {
    const gana = doble(resultado(FIX));
    pintar(<EstresPanel de={{ ...DE, rival: 0.3 }} worker={gana.worker} />);
    fireEvent.click(screen.getByRole("button", { name: "Estrésalo" }));
    expect((await screen.findByTestId("estres-sello")).textContent).toContain("✓ Con 10 % de ruido sigue ganándole");
    cleanup();

    const pierde = doble(resultado(FIX));
    pintar(<EstresPanel de={{ ...DE, rival: 0.641 }} worker={pierde.worker} />);
    fireEvent.click(screen.getByRole("button", { name: "Estrésalo" }));
    const sello = await screen.findByTestId("estres-sello");
    expect(sello.textContent).toContain("⚠ Con 10 % de ruido deja de ganarle");
    expect(sello.textContent).toContain("0.65 contra 0.64");
  });

  it("una respuesta que el lector rechaza no se pinta: se dice que no se pudo", async () => {
    const mala = { ...FIX, n_test: FIX.n_test + 1 };
    const { worker } = doble(resultado(mala));
    pintar(<EstresPanel de={DE} worker={worker} />);
    fireEvent.click(screen.getByRole("button", { name: "Estrésalo" }));
    expect((await screen.findByRole("alert")).textContent).toContain("No se pudo estresar el modelo");
    expect(screen.queryByTestId("estres-lectura")).toBeNull();
  });

  it("un modelo importado dice que no trae la prueba; otro error, que se vuelva a intentar", async () => {
    const importado = doble({ id: 1, type: "error", message: "RuntimeError: no-eval" });
    pintar(<EstresPanel de={DE} worker={importado.worker} />);
    fireEvent.click(screen.getByRole("button", { name: "Estrésalo" }));
    expect((await screen.findByRole("alert")).textContent).toContain("no trae la prueba");
    cleanup();

    const otro = doble({ id: 1, type: "error", message: "boom" });
    pintar(<EstresPanel de={DE} worker={otro.worker} />);
    fireEvent.click(screen.getByRole("button", { name: "Estrésalo" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Vuelve a intentarlo");
  });

  it("agrupar no tiene prueba: lo dice y no ofrece el botón", () => {
    pintar(<EstresPanel de={null} />);
    expect(screen.getByText(/Agrupar no tiene objetivo ni prueba/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("mientras el worker ajusta otro modelo no se mide; y la lectura de otro resultado no se enseña", async () => {
    const { worker } = doble(resultado(FIX));
    const { rerender } = pintar(<EstresPanel de={DE} worker={worker} ocupado />);
    expect((screen.getByRole("button", { name: "Estrésalo" }) as HTMLButtonElement).disabled).toBe(true);
    rerender(
      <I18nProvider>
        <EstresPanel de={DE} worker={worker} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Estrésalo" }));
    await screen.findByTestId("estres-lectura");
    // otro modelo elegido ⇒ otro resultado ⇒ la lectura vieja no aplica
    rerender(
      <I18nProvider>
        <EstresPanel de={{ ...DE, result: {} }} worker={worker} />
      </I18nProvider>,
    );
    await waitFor(() => expect(screen.queryByTestId("estres-lectura")).toBeNull());
    expect(screen.getByRole("button", { name: "Estrésalo" })).toBeTruthy();
  });

  it("en inglés, los mismos textos", async () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    const { worker } = doble(resultado(FIX));
    pintar(<EstresPanel de={DE} worker={worker} />);
    fireEvent.click(await screen.findByRole("button", { name: "Stress it" }));
    expect((await screen.findByTestId("estres-frase")).textContent).toBe(
      "With 10 % noise in the numbers, your F1 falls from 0.68 to 0.65.",
    );
    expect(screen.getByRole("button", { name: "Measure again" })).toBeTruthy();
  });
});
