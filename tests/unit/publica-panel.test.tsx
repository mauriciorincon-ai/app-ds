// S17 (ADR 024): el panel «Llévatelo». Sin worker ni red: el modelo y las plantillas se doblan; lo que se comprueba es la pantalla.
//  · ANTES de descargar se dice qué lleva cada archivo (aviso con símbolo y palabra), en los dos idiomas;
//  · la receta NO pide el modelo (no lleva pickle) y su declaración no trae filas; el puntuador y el servicio sí lo piden;
//  · el servicio no se ofrece para un modelo de vecinos más cercanos ni para agrupar, y lo dice; la receta no se ofrece al agrupar;
//  · un bosque de árboles avisa que su receta reproduce de forma aproximada;
//  · lo que falla se dice, y mientras algo se prepara no se pide otra cosa.
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
import type { ExperimentResult } from "@/workers/protocol";

vi.mock("@sentry/nextjs", () => ({ addBreadcrumb: vi.fn(), captureMessage: vi.fn() }));

const leer = (ruta: string) => readFileSync(resolve(__dirname, "../..", ruta), "utf8");
const descargas = vi.hoisted(() => ({
  texto: vi.fn(),
  bytes: vi.fn(),
  modelo: vi.fn(),
  plantilla: vi.fn(),
}));
vi.mock("@/lib/files", async (original) => ({
  ...(await original<typeof import("@/lib/files")>()),
  downloadTextFile: descargas.texto,
}));
vi.mock("@/lib/publica/descargar", () => ({ descargarBytes: descargas.bytes }));
vi.mock("@/lib/publica/modelo", () => ({ pedirModelo: descargas.modelo }));
vi.mock("@/lib/publica/plantillas", () => ({
  plantilla: descargas.plantilla,
  pipelinePy: async () => leer("src/lib/ds/pipeline.py"),
}));

const { I18nProvider } = await import("@/i18n/provider");
const { PublicaPanel } = await import("@/components/publica/PublicaPanel");

const supervisado = (modelName: string, task: "binaria" | "numerica" = "binaria") =>
  ({
    task,
    modelName,
    nTrain: 150,
    nTest: 50,
    model: task === "binaria" ? { accuracy: 0.8, precision: 0.7, recall: 0.6, f1: 0.65, auc: 0.9 } : { mae: 12.5, rmse: 15, r2: 0.8, medae: 10, mape: null },
    verdict: { primaryMetric: task === "binaria" ? "auc" : "mae" },
    explainability: { features: [{ name: "edad", kind: "numeric" }, { name: "región", kind: "categorical" }] },
  }) as unknown as ExperimentResult;
const agrupado = { task: "agrupar", modelName: "kmeans", nRows: 100 } as unknown as ExperimentResult;

const MODELO = { format_version: 1, manifest: { model_name: "forest" }, payload: "AAAA" };
const pintar = (result: ExperimentResult, extra: Partial<React.ComponentProps<typeof PublicaPanel>> = {}) =>
  render(
    <I18nProvider>
      <PublicaPanel
        result={result}
        datasetName="Tienda 2026.csv"
        sanitation={null}
        target={result.task === "agrupar" ? null : "compró"}
        seed={42}
        worker={{ current: {} as Worker }}
        {...extra}
      />
    </I18nProvider>,
  );

beforeEach(() => {
  window.localStorage.clear();
  Object.values(descargas).forEach((f) => f.mockReset());
  descargas.modelo.mockResolvedValue(MODELO);
  descargas.plantilla.mockImplementation(async (nombre: string) => leer(`src/lib/ds/plantillas/${nombre}`));
});
afterEach(cleanup);

describe("el aviso antes de descargar", () => {
  it("dice qué lleva cada archivo, con símbolo y palabra, sin que se pulse nada", () => {
    pintar(supervisado("logistic"));
    const aviso = screen.getByText(/Antes de descargar: qué lleva cada archivo/);
    expect(aviso.textContent).toMatch(/^⚠ /);
    expect(screen.getByText(/La receta no lleva ni una fila/)).toBeTruthy();
    expect(screen.getByText(/vecinos más cercanos lleva además filas/)).toBeTruthy();
    expect(descargas.modelo).not.toHaveBeenCalled();
    expect(descargas.texto).not.toHaveBeenCalled();
  });

  it("en inglés, lo mismo", () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    pintar(supervisado("logistic"));
    expect(screen.getByText(/Before you download: what each file carries/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download the recipe (.py)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download the scorer (.html)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download the service (.zip)" })).toBeTruthy();
  });
});

describe("las tres salidas", () => {
  it("la receta NO pide el modelo, baja con el nombre del archivo y no trae filas ni etiquetas de clase", async () => {
    pintar(supervisado("logistic"));
    fireEvent.click(screen.getByTestId("publica-receta"));
    await waitFor(() => expect(descargas.texto).toHaveBeenCalledTimes(1));
    expect(descargas.modelo).not.toHaveBeenCalled();
    const [nombre, contenido, mime] = descargas.texto.mock.calls[0] as [string, string, string];
    expect(nombre).toBe("receta-tienda-2026-logistic.py");
    expect(mime).toBe("text/x-python");
    expect(contenido).toContain("def _prepare(p):");
    const decl = JSON.parse(/DECLARACION = json\.loads\(r'''([\s\S]*?)'''\)/.exec(contenido)![1]!);
    expect(decl).toMatchObject({ objetivo: "compró", semilla: 42, idioma: "es", miembro: "logistic", tolerancia: { tipo: "exacta" } });
    expect(Object.keys(decl)).not.toContain("rows");
    expect(await screen.findByText(/✓ Descargado: receta-tienda-2026-logistic\.py/)).toBeTruthy();
  });

  it("el puntuador pide el modelo y lo lleva adentro", async () => {
    pintar(supervisado("forest"));
    fireEvent.click(screen.getByTestId("publica-puntuador"));
    await waitFor(() => expect(descargas.texto).toHaveBeenCalledTimes(1));
    expect(descargas.modelo).toHaveBeenCalledTimes(1);
    const [nombre, contenido, mime] = descargas.texto.mock.calls[0] as [string, string, string];
    expect(nombre).toBe("puntuador-tienda-2026-forest.html");
    expect(mime).toBe("text/html");
    expect(contenido).toContain('"payload":"AAAA"');
  });

  it("el servicio baja un ZIP (empieza por «PK») con el modelo", async () => {
    pintar(supervisado("forest"));
    fireEvent.click(screen.getByTestId("publica-servicio"));
    await waitFor(() => expect(descargas.bytes).toHaveBeenCalledTimes(1));
    const [nombre, bytes, mime] = descargas.bytes.mock.calls[0] as [string, Uint8Array, string];
    expect(nombre).toBe("servicio-tienda-2026-forest.zip");
    expect(mime).toBe("application/zip");
    expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe("PK");
  });
});

describe("lo que no se ofrece, se dice", () => {
  it("vecinos más cercanos: sin servicio y con su razón; el puntuador y la receta siguen", () => {
    pintar(supervisado("knn"));
    expect((screen.getByTestId("publica-servicio") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("publica-nota-servicio").textContent).toMatch(/vecinos más cercanos guarda su estructura con enteros de 32 bits/);
    expect((screen.getByTestId("publica-puntuador") as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId("publica-receta") as HTMLButtonElement).disabled).toBe(false);
  });

  it("agrupar: sin receta ni servicio, con su razón; solo el puntuador", () => {
    pintar(agrupado);
    expect((screen.getByTestId("publica-receta") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("publica-servicio") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("publica-puntuador") as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByTestId("publica-nota-receta").textContent).toMatch(/no hay una cifra que reproducir/);
    expect(screen.getByTestId("publica-nota-servicio").textContent).toMatch(/usa el puntuador portátil/);
  });

  it("un bosque de árboles avisa que su receta reproduce de forma aproximada, y declara su tolerancia", async () => {
    pintar(supervisado("forest"));
    expect(screen.getByTestId("publica-nota-receta").textContent).toMatch(/reproduce de forma aproximada/);
    fireEvent.click(screen.getByTestId("publica-receta"));
    await waitFor(() => expect(descargas.texto).toHaveBeenCalledTimes(1));
    const contenido = (descargas.texto.mock.calls[0] as [string, string])[1];
    const decl = JSON.parse(/DECLARACION = json\.loads\(r'''([\s\S]*?)'''\)/.exec(contenido)![1]!);
    expect(decl.tolerancia.tipo).toBe("aproximada");
  });

  it("mientras el worker ajusta otro modelo, nada se descarga", () => {
    pintar(supervisado("forest"), { ocupado: true });
    for (const id of ["receta", "puntuador", "servicio"])
      expect((screen.getByTestId(`publica-${id}`) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("cuando algo falla", () => {
  it("el modelo que no llega se dice, y no se descarga a medias", async () => {
    descargas.modelo.mockRejectedValue(new Error("worker"));
    pintar(supervisado("forest"));
    fireEvent.click(screen.getByTestId("publica-puntuador"));
    expect(await screen.findByText(/No se pudo preparar el archivo/)).toBeTruthy();
    expect(descargas.texto).not.toHaveBeenCalled();
  });

  it("una plantilla que no se baja se dice", async () => {
    descargas.plantilla.mockRejectedValue(new Error("plantilla"));
    pintar(supervisado("forest"));
    fireEvent.click(screen.getByTestId("publica-receta"));
    expect(await screen.findByText(/No se pudo preparar el archivo/)).toBeTruthy();
  });
});
