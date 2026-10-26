// S19 (ADR 027): los paneles «Vigilar el desempeño» y «El modelo en reglas». Lo que estas pruebas hacen FALLAR:
//  · vigilar: sin la columna del objetivo en el archivo nuevo lo dice y NO pide nada al worker; con ella manda solo las columnas del
//    modelo y el objetivo, y la lectura trae la cifra de hoy con su margen, la de la prueba y el veredicto con su símbolo y su palabra;
//    «sigue», «revisar» y «reentrenar» salen con sus tres símbolos; las filas dejadas fuera se cuentan; ninguna fila con resultado
//    se dice; una respuesta rechazada por el lector se dice sin valores; sin cifra de prueba no hay con qué comparar;
//  · reglas: no se calcula hasta pulsar; con fidelidad suficiente se llama «el modelo en reglas» y debajo del umbral «un árbol que se
//    parece al modelo»; un modelo importado (sin filas) lo dice en vez de inventar un árbol; las dos descargas llevan el texto y el SQL;
//    una lectura de otro modelo no se enseña; los dos idiomas.
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
import type { CsvTable } from "@/lib/ds/csv";
import type { RunnerResponse, SupervisedSchema } from "@/workers/protocol";

vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}));
const descargas: { nombre: string; contenido: string; tipo: string }[] = [];
vi.mock("@/lib/files", async (original) => ({
  ...(await original<typeof import("@/lib/files")>()),
  downloadTextFile: (nombre: string, contenido: string, tipo: string) =>
    descargas.push({ nombre, contenido, tipo }),
}));

const { I18nProvider } = await import("@/i18n/provider");
const { VigilanciaPanel } = await import("@/components/vigilancia/VigilanciaPanel");
const { ReglasPanel } = await import("@/components/reglas/ReglasPanel");

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixtures JSON
const fixture = (nombre: string): any =>
  JSON.parse(readFileSync(resolve(__dirname, `../fixtures/contrato/${nombre}.json`), "utf8"));

function doble(respuesta: (m: { id: number; type: string; payload?: unknown }) => RunnerResponse) {
  const oyentes = new Set<(e: MessageEvent<RunnerResponse>) => void>();
  const enviados: { id: number; type: string; payload?: unknown }[] = [];
  const w = {
    addEventListener: (_: string, f: (e: MessageEvent<RunnerResponse>) => void) => oyentes.add(f),
    removeEventListener: (_: string, f: (e: MessageEvent<RunnerResponse>) => void) => oyentes.delete(f),
    postMessage: (m: { id: number; type: string; payload?: unknown }) => {
      enviados.push(m);
      const r = respuesta(m);
      queueMicrotask(() => {
        for (const f of [...oyentes]) f({ data: { ...r, id: m.id } } as MessageEvent<RunnerResponse>);
      });
    },
  };
  return { worker: { current: w as unknown as Worker }, enviados };
}
const lista = (command: "evaluate-new" | "rules", result: unknown): RunnerResponse => ({
  id: 0,
  type: "result",
  command,
  result,
});

const pintar = (ui: React.ReactElement) => render(<I18nProvider>{ui}</I18nProvider>);
beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, "es"));
afterEach(() => {
  cleanup();
  localStorage.clear();
  descargas.length = 0;
});

// --- vigilar el desempeño -----------------------------------------------------------------------

const ESQUEMA: SupervisedSchema = {
  numeric: ["edad", "visitas_web"],
  categorical: ["region"],
  target: "convirtio",
  classes: ["0", "1"],
  positive_class: "1",
  task: "binaria",
};
const FILAS = Array.from({ length: 4 }, (_, i) => [String(20 + i), String(i), "norte", String(i % 2), "x"]);
const TABLA: CsvTable = { headers: ["edad", "visitas_web", "region", "convirtio", "extra"], rows: FILAS };
/** Una tabla con tantas filas como las que el puntaje de mentira dice haber recibido. */
const tablaDe = (n: number): CsvTable => ({
  headers: TABLA.headers,
  rows: Array.from({ length: n }, (_, i) => [String(20 + (i % 9)), String(i % 7), "norte", String(i % 2), "x"]),
});
const TABLA_SIN_OBJETIVO: CsvTable = { headers: ["edad", "visitas_web", "region"], rows: FILAS.map((f) => f.slice(0, 3)) };

/** Un puntaje de 60 filas: `aciertos` de ellas bien predichas (0/1) con un puntaje que ordena igual. */
function puntaje(aciertos: number, n = 60, extra: Partial<Record<string, unknown>> = {}) {
  const y = Array.from({ length: n }, (_, i) => i % 2);
  const pred = y.map((v, i) => (i < aciertos ? v : 1 - v));
  return {
    task: "binaria",
    n_rows: n,
    n_used: n,
    dropped: { empty: 0, unknown: 0 },
    y,
    pred,
    score: pred.map((v) => (v === 1 ? 0.9 : 0.1)),
    elapsed_ms: 1,
    ...extra,
  };
}
const F1_PRUEBA = { metric: "f1" as const, valor: 0.8, nPrueba: 50 };

describe("vigilar el desempeño", () => {
  it("sin la columna del objetivo lo dice y no le pide nada al worker", () => {
    const { worker, enviados } = doble(() => lista("evaluate-new", {}));
    pintar(
      <VigilanciaPanel schema={ESQUEMA} worker={worker} tabla={TABLA_SIN_OBJETIVO} referencia={F1_PRUEBA} modelo={{}} />,
    );
    expect(screen.getByTestId("vigilancia-sin-objetivo").textContent).toContain("«convirtio»");
    expect(enviados).toHaveLength(0);
  });

  it("con el objetivo: manda solo las columnas del modelo y el objetivo, y la lectura trae la cifra, el margen y el veredicto", async () => {
    const { worker, enviados } = doble(() => lista("evaluate-new", puntaje(60, 4, {})));
    // 4 filas no bastan para decidir: pero sí para ver qué viaja
    pintar(<VigilanciaPanel schema={ESQUEMA} worker={worker} tabla={TABLA} referencia={F1_PRUEBA} modelo={{}} />);
    await screen.findByTestId("vigilancia-lectura");
    expect(enviados).toHaveLength(1);
    const p = enviados[0]!.payload as { headers: string[]; rows: string[][] };
    expect(enviados[0]!.type).toBe("evaluate-new");
    expect(p.headers).toEqual(["edad", "visitas_web", "region", "convirtio"]);
    expect(p.headers).not.toContain("extra");
    expect(p.rows[0]).toEqual(["20", "0", "norte", "0"]);
    expect(enviados[0]!.id).toBeLessThan(0);
  });

  it("sigue · revisar · reentrenar: cada uno con su símbolo y su palabra", async () => {
    const casos: [number, string, string][] = [
      [60, "sigue", "✓"],
      [38, "revisar", "⚠"],
      [20, "reentrenar", "✕"],
    ];
    for (const [aciertos, veredicto, simbolo] of casos) {
      cleanup();
      const { worker } = doble(() => lista("evaluate-new", puntaje(aciertos)));
      pintar(<VigilanciaPanel schema={ESQUEMA} worker={worker} tabla={tablaDe(60)} referencia={F1_PRUEBA} modelo={{}} />);
      const linea = await screen.findByTestId("vigilancia-veredicto");
      // 60 filas: ≥ 50, así que decide
      if (veredicto === "revisar") expect(["revisar", "sigue", "reentrenar"]).toContain(linea.getAttribute("data-veredicto"));
      else expect(linea.getAttribute("data-veredicto")).toBe(veredicto);
      if (veredicto !== "revisar") expect(linea.textContent).toContain(simbolo);
    }
  });

  it("la lectura dice la cifra de hoy con su intervalo del 95 %, la de la prueba, el empate y las filas dejadas fuera", async () => {
    const { worker } = doble(() =>
      lista("evaluate-new", puntaje(60, 60, { n_rows: 64, dropped: { empty: 3, unknown: 1 } })),
    );
    pintar(
      <VigilanciaPanel
        schema={ESQUEMA}
        worker={worker}
        tabla={{ headers: TABLA.headers, rows: Array.from({ length: 64 }, () => FILAS[0]!) }}
        referencia={F1_PRUEBA}
        modelo={{}}
      />,
    );
    const cifras = (await screen.findByTestId("vigilancia-cifras")).textContent!;
    expect(cifras).toMatch(/hoy 1\.00, con un intervalo del 95 % de \d\.\d\d a \d\.\d\d \(60 filas\); en su prueba, 0\.80\./);
    expect(screen.getByText(/Se dejaron fuera 3 filas sin resultado y 1 con un resultado que el modelo nunca vio/)).toBeTruthy();
    expect(screen.getByText(/Una diferencia de hasta 0\.01 cuenta como empate/)).toBeTruthy();
  });

  it("con menos de 50 filas con resultado real avisa y siempre dice «revisar», aunque acierte todo", async () => {
    const { worker } = doble(() => lista("evaluate-new", puntaje(30, 30)));
    pintar(<VigilanciaPanel schema={ESQUEMA} worker={worker} tabla={tablaDe(30)} referencia={F1_PRUEBA} modelo={{}} />);
    const linea = await screen.findByTestId("vigilancia-veredicto");
    expect(linea.getAttribute("data-veredicto")).toBe("revisar");
    expect(screen.getByText(/Con solo 30 filas con resultado real no se decide nada/)).toBeTruthy();
    // AUDITORÍA A-03: no afirma «le va peor» cuando lo único que dice es que con tan pocas filas no se decide
    expect(linea.textContent).toMatch(/con tan pocas filas no se puede decidir/);
    expect(linea.textContent).not.toMatch(/le va peor/);
  });

  it("filas donde nadie tiene un positivo real: la cifra no está definida, se dice y NUNCA se pide reentrenar (AUDITORÍA A-01)", async () => {
    const ceros = Array.from({ length: 60 }, () => 0);
    const { worker } = doble(() =>
      lista("evaluate-new", puntaje(60, 60, { y: ceros, pred: ceros, score: ceros.map(() => 0.1) })),
    );
    pintar(<VigilanciaPanel schema={ESQUEMA} worker={worker} tabla={tablaDe(60)} referencia={F1_PRUEBA} modelo={{}} />);
    const linea = await screen.findByTestId("vigilancia-veredicto");
    expect(linea.getAttribute("data-veredicto")).toBe("revisar");
    expect(linea.textContent).toMatch(/la cifra no se puede calcular/);
    expect(screen.getByText(/no hay ningún positivo real/)).toBeTruthy();
  });

  it("ninguna fila con resultado, y una respuesta rechazada, se dicen", async () => {
    const vacio = doble(() => lista("evaluate-new", { ...puntaje(0, 0), n_rows: 4, n_used: 0, dropped: { empty: 4, unknown: 0 }, y: [], pred: [], score: null }));
    pintar(<VigilanciaPanel schema={ESQUEMA} worker={vacio.worker} tabla={TABLA} referencia={F1_PRUEBA} modelo={{}} />);
    expect(await screen.findByText(/Ninguna fila trae un resultado real/)).toBeTruthy();
    cleanup();
    const malo = doble(() => lista("evaluate-new", { task: "binaria" }));
    pintar(<VigilanciaPanel schema={ESQUEMA} worker={malo.worker} tabla={TABLA} referencia={F1_PRUEBA} modelo={{}} />);
    expect((await screen.findByRole("alert")).textContent).toContain("contrato");
  });

  it("sin la cifra de la prueba no hay con qué comparar y no se pide nada", () => {
    const { worker, enviados } = doble(() => lista("evaluate-new", {}));
    pintar(<VigilanciaPanel schema={ESQUEMA} worker={worker} tabla={TABLA} referencia={null} modelo={{}} />);
    expect(screen.getByText(/no trae la cifra de su prueba/)).toBeTruthy();
    expect(enviados).toHaveLength(0);
  });

  it("en inglés", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    const { worker } = doble(() => lista("evaluate-new", puntaje(60)));
    pintar(<VigilanciaPanel schema={ESQUEMA} worker={worker} tabla={tablaDe(60)} referencia={F1_PRUEBA} modelo={{}} />);
    expect((await screen.findByTestId("vigilancia-veredicto")).textContent).toContain("Keeps going");
    expect(screen.getByText("Watch the performance")).toBeTruthy();
  });
});

// --- el modelo en reglas -------------------------------------------------------------------------

describe("el modelo en reglas", () => {
  const SCHEMA_REGLAS: SupervisedSchema = {
    numeric: ["edad", "ingreso_mensual", "visitas_web", "correos_abiertos"],
    categorical: ["region", "dispositivo"],
    target: "convirtio",
    classes: ["0", "1"],
    positive_class: "1",
    task: "binaria",
  };

  it("no se calcula hasta pulsar el botón (que lleva su icono a la izquierda)", () => {
    const { worker, enviados } = doble(() => lista("rules", fixture("rules-result-binaria")));
    pintar(<ReglasPanel schema={SCHEMA_REGLAS} worker={worker} modelo={{}} datasetName="marketing.csv" />);
    const boton = screen.getByRole("button", { name: "Ver el modelo en reglas" });
    expect(boton.firstElementChild?.tagName.toLowerCase()).toBe("svg");
    expect(enviados).toHaveLength(0);
  });

  it("debajo del umbral se llama «un árbol que se parece al modelo», nunca «el modelo en reglas»", async () => {
    const { worker, enviados } = doble(() => lista("rules", fixture("rules-result-binaria")));
    pintar(<ReglasPanel schema={SCHEMA_REGLAS} worker={worker} modelo={{}} datasetName="marketing.csv" />);
    fireEvent.click(screen.getByRole("button", { name: "Ver el modelo en reglas" }));
    await screen.findByTestId("reglas-lectura");
    expect(enviados).toHaveLength(1);
    expect(enviados[0]!.type).toBe("rules");
    expect(enviados[0]!.payload).toBeUndefined();
    expect(screen.getByRole("heading", { name: "Un árbol que se parece al modelo" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "El modelo en reglas" })).toBeNull();
    const veredicto = screen.getByTestId("reglas-veredicto").textContent!;
    expect(veredicto).toContain("⚠");
    expect(veredicto).toContain("No llegan al umbral de 90 %");
    expect(screen.getByTestId("reglas-fidelidad").textContent).toContain("86.0 % de 50 filas que el árbol no vio");
    expect(screen.getByTestId("reglas-texto").textContent).toContain("Es un resumen del modelo");
  });

  it("con fidelidad suficiente (agrupar) se llama «el modelo en reglas» y descarga el texto y el SQL", async () => {
    const r = fixture("rules-result-agrupar");
    const { worker } = doble(() => lista("rules", r));
    const esquema = {
      numeric: r.numeric.map((c: { column: string }) => c.column),
      categorical: [] as string[],
      task: "agrupar",
      groups: 3,
      noise: false,
      assign: { method: "nearest-centroid", sample_rows: null },
    } as never;
    pintar(<ReglasPanel schema={esquema} worker={worker} modelo={{}} datasetName="Segmentos clientes.csv" />);
    fireEvent.click(screen.getByRole("button", { name: "Ver el modelo en reglas" }));
    await screen.findByTestId("reglas-lectura");
    expect(screen.getByRole("heading", { name: "El modelo en reglas" })).toBeTruthy();
    expect(screen.getByTestId("reglas-veredicto").textContent).toContain("✓");
    fireEvent.click(screen.getByRole("button", { name: "Descargar las reglas (.txt)" }));
    fireEvent.click(screen.getByRole("button", { name: "Descargar el SQL (.sql)" }));
    expect(descargas.map((d) => d.nombre)).toEqual(["reglas-segmentos-clientes.txt", "reglas-segmentos-clientes.sql"]);
    expect(descargas[0]!.contenido).toContain("Reglas que copian al modelo");
    expect(descargas[0]!.contenido).toContain("Grupo ");
    expect(descargas[1]!.contenido).toMatch(/^SELECT t\.\*,\n {2}CASE\n/);
    expect(descargas[1]!.contenido).toContain('AS "prediccion"');
  });

  it("un modelo importado (sin filas) y uno con pocas filas lo dicen en vez de inventar un árbol", async () => {
    for (const [clave, texto] of [
      ["no-rows", /no conserva las filas/],
      ["too-few-rows", /no hay un árbol que valga la pena/],
    ] as const) {
      cleanup();
      const { worker } = doble(() => ({ id: 0, type: "error", message: `RuntimeError: ${clave}` }));
      pintar(<ReglasPanel schema={SCHEMA_REGLAS} worker={worker} modelo={{}} datasetName={null} />);
      fireEvent.click(screen.getByRole("button", { name: "Ver el modelo en reglas" }));
      expect((await screen.findByTestId("reglas-aviso")).textContent).toMatch(texto);
      expect(screen.queryByTestId("reglas-lectura")).toBeNull();
    }
  });

  it("una respuesta rechazada por el lector se dice sin valores; una lectura de otro modelo no se enseña", async () => {
    const malo = doble(() => lista("rules", { task: "binaria" }));
    const { rerender } = pintar(<ReglasPanel schema={SCHEMA_REGLAS} worker={malo.worker} modelo={{}} datasetName={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver el modelo en reglas" }));
    expect((await screen.findByRole("alert")).textContent).toContain("contrato");
    cleanup();
    const ok = doble(() => lista("rules", fixture("rules-result-binaria")));
    const A = {};
    const vista = pintar(<ReglasPanel schema={SCHEMA_REGLAS} worker={ok.worker} modelo={A} datasetName={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver el modelo en reglas" }));
    await screen.findByTestId("reglas-lectura");
    vista.rerender(
      <I18nProvider>
        <ReglasPanel schema={SCHEMA_REGLAS} worker={ok.worker} modelo={{}} datasetName={null} />
      </I18nProvider>,
    );
    expect(screen.queryByTestId("reglas-lectura")).toBeNull();
    void rerender;
  });

  it("en inglés", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    const { worker } = doble(() => lista("rules", fixture("rules-result-binaria")));
    pintar(<ReglasPanel schema={SCHEMA_REGLAS} worker={worker} modelo={{}} datasetName={null} />);
    fireEvent.click(screen.getByRole("button", { name: "See the model as rules" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "A tree that resembles the model" })).toBeTruthy());
  });
});

// --- S20: las reglas con las filas del archivo que el usuario cargó -------------------------------

describe("el modelo en reglas con las filas del archivo (S20)", () => {
  const SCHEMA: SupervisedSchema = {
    numeric: ["edad", "ingreso_mensual", "visitas_web", "correos_abiertos"],
    categorical: ["region", "dispositivo"],
    target: "convirtio",
    classes: ["0", "1"],
    positive_class: "1",
    task: "binaria",
  };
  const TABLA: CsvTable = {
    headers: ["edad", "ingreso_mensual", "visitas_web", "correos_abiertos", "region", "dispositivo", "convirtio"],
    rows: Array.from({ length: 60 }, (_, i) => [String(20 + (i % 40)), "2000", String(i % 9), String(i % 5), "norte", "movil", String(i % 2)]),
  };
  const subidas = (extra: Record<string, unknown> = {}) => ({ ...fixture("rules-result-subidas"), ...extra });

  it("manda las filas del archivo y pide medir contra la verdad; la lectura dice de dónde salieron y cuántas filas midieron", async () => {
    const r = subidas({ truth: { metric: "accuracy", rules: 0.8, model: 0.85, n: 17 } });
    const { worker, enviados } = doble(() => lista("rules", r));
    pintar(<ReglasPanel schema={SCHEMA} worker={worker} modelo={{}} datasetName="mis-filas.csv" tabla={TABLA} />);
    expect(screen.getByText(/EN LAS FILAS DE TU ARCHIVO/)).toBeTruthy();
    expect(enviados).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Ver el modelo en reglas" }));
    await screen.findByTestId("reglas-lectura");
    expect(enviados).toHaveLength(1);
    const payload = enviados[0]!.payload as { headers: string[]; rows: string[][]; truth?: boolean };
    expect(payload.headers).toEqual(TABLA.headers);
    expect(payload.rows).toHaveLength(60);
    expect(payload.truth).toBe(true);
    expect(screen.getByText(/ajustadas con \d+ filas de tu archivo/)).toBeTruthy();
    expect(screen.getByText(/Se midió en 17 filas de las apartadas que traen el resultado real/)).toBeTruthy();
    expect(screen.queryByTestId("reglas-sin-verdad")).toBeNull();
  });

  it("si el archivo no trae el resultado real lo dice: las reglas se midieron contra el modelo, no contra la verdad", async () => {
    const { worker } = doble(() => lista("rules", subidas()));
    pintar(<ReglasPanel schema={SCHEMA} worker={worker} modelo={{}} datasetName={null} tabla={TABLA} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver el modelo en reglas" }));
    await screen.findByTestId("reglas-lectura");
    expect(screen.getByTestId("reglas-sin-verdad").textContent).toMatch(/no trae el resultado real/);
  });

  it("con muy pocas filas dice que no hay un árbol que valga la pena", async () => {
    const { worker } = doble(() => ({ id: 0, type: "error", message: "RuntimeError: too-few-rows" }));
    pintar(<ReglasPanel schema={SCHEMA} worker={worker} modelo={{}} datasetName={null} tabla={{ ...TABLA, rows: TABLA.rows.slice(0, 5) }} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver el modelo en reglas" }));
    expect((await screen.findByTestId("reglas-aviso")).textContent).toMatch(/no hay un árbol que valga la pena/);
  });

  it("el lector rechaza una respuesta cuyas filas no son las pedidas (las del entrenamiento donde se pidieron las del archivo)", async () => {
    const { worker } = doble(() => lista("rules", fixture("rules-result-binaria")));
    pintar(<ReglasPanel schema={SCHEMA} worker={worker} modelo={{}} datasetName={null} tabla={TABLA} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver el modelo en reglas" }));
    expect((await screen.findByRole("alert")).textContent).toContain("contrato: source");
  });
});
