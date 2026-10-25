// Protocolo DS (S14), etapa 9 — la pantalla en jsdom, con la compuerta real detrás. Lo que tiene que valer:
//  · ESPÍA: la etapa 9 no abre la prueba ni habla con el worker. Con un `Worker` espiado, recorrer la etapa
//    entera (umbral, capacidad, decisión, registrar) no crea ninguno;
//  · el umbral de tus costos por defecto; moverlo lo rotula «elegido mirando la prueba» y pide tu razón;
//  · las cifras del modelo frente a no hacer nada y actuar con todos, con la marca de lo de hoy; la capacidad
//    con el umbral que cabe; la curva en cifras, con la fila de tus costos;
//  · sin la tabla de la 8 (registrada antes del S14) lo dice; con un número, el costo y el cuantil;
//  · S19, «¿qué pasaría si?»: pintar la etapa NO crea worker; pulsar «Simular» crea UNO, que recibe el ajuste del ganador SIN la
//    prueba (`fit-winner`, sin clave `test`, solo las filas de entrenamiento) y después las filas de entrenamiento con el cambio;
//    lo simulado no registra nada en el cuaderno.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatosEtapa, Previas } from "@/engine/protocolo/etapas";

vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}));

const { I18nProvider } = await import("@/i18n/provider");
const { Etapa9Form } = await import("@/components/protocolo/Etapa9Form");
const { registrar } = await import("@/engine/protocolo/compuerta");
const { NUEVOS_S14, UMBRAL_CLASE, plan8 } = await import("@/engine/protocolo/etapa8");
const { PROTOCOLO_DS } = await import("@/engine/protocolo/protocolo-ds");
const { armarCredito7, armarPlanes6, armarPrecio6, con7, sintetico } =
  await import("./protocolo-etapa8-helpers");
const { AHORA, HUELLA, armarCredito8, con8, registrar8 } =
  await import("./protocolo-etapa9-helpers");

const CREDITO = armarCredito8();

function montar(previas: Previas = CREDITO.previas, armado = CREDITO) {
  const registrado: { datos: DatosEtapa | null; rechazo: unknown } = {
    datos: null,
    rechazo: null,
  };
  const onRegistrar = vi.fn((datos: DatosEtapa) => {
    const r = registrar(PROTOCOLO_DS, armado.cuaderno, 9, datos, {
      huella: HUELLA,
      tabla: armado.tabla,
      ahora: AHORA,
    });
    registrado.datos = r.ok ? datos : null;
    registrado.rechazo = r.ok ? null : r.rechazo;
    return r.ok ? null : r.rechazo;
  });
  const vista = render(
    <I18nProvider>
      <Etapa9Form
        datos={{
          tabla: armado.tabla,
          carga: {
            fecha: AHORA.toISOString(),
            sha256: HUELLA,
            nombre: "datos.csv",
            filas: armado.tabla.rows.length,
            columnas: armado.tabla.headers.length,
          },
        }}
        anterior={null}
        previas={previas}
        onRegistrar={onRegistrar}
      />
    </I18nProvider>,
  );
  return { ...vista, registrado, onRegistrar };
}

const elegir = (etiqueta: string, valor: string) =>
  fireEvent.change(screen.getByLabelText(etiqueta), {
    target: { value: valor },
  });
const escribir = (etiqueta: string, valor: string) =>
  fireEvent.change(screen.getByLabelText(etiqueta), {
    target: { value: valor },
  });
const registrar9 = () =>
  fireEvent.click(screen.getByRole("button", { name: "Registrar la etapa 9" }));

let Espia: ReturnType<typeof vi.fn>;
beforeEach(() => {
  window.localStorage.clear();
  Espia = vi.fn();
  vi.stubGlobal("Worker", Espia);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("la etapa 9 con dos clases", () => {
  it("ESPÍA: recorrerla entera, hasta registrar «no usarlo», no crea ningún worker", () => {
    const { registrado } = montar();
    expect(screen.getByTestId("protocolo-lee9").textContent).toMatch(
      /La prueba no se vuelve a abrir/,
    );
    elegir("Umbral con que se actúa", "0.40");
    escribir("Tu razón para moverlo", "Mi equipo no da abasto");
    escribir("De cada 100 casos, ¿cuántos alcanza a atender tu equipo?", "30");
    fireEvent.click(screen.getByLabelText("No usarlo"));
    escribir("Tu razón", "Con 40 filas de prueba no me fío todavía");
    registrar9();
    expect(registrado.rechazo).toBeNull();
    expect(registrado.datos?.respuestas.decision).toBe("no-usar");
    expect(Espia).not.toHaveBeenCalled();
  });

  it("el umbral de tus costos va por defecto; moverlo lo rotula y pide tu razón", () => {
    const { registrado } = montar();
    const select = screen.getByLabelText(
      "Umbral con que se actúa",
    ) as HTMLSelectElement;
    expect(select.value).toBe("e1");
    expect(select.options[0]!.textContent).toMatch(
      /^El de tus costos \(0\.\d+\)$/,
    );
    expect(select.options).toHaveLength(100);
    expect(screen.queryByTestId("protocolo-movido9")).toBeNull();
    elegir("Umbral con que se actúa", "0.30");
    expect(screen.getByTestId("protocolo-movido9").textContent).toMatch(
      /Elegido mirando la prueba: optimista/,
    );
    escribir("De cada 100 casos, ¿cuántos alcanza a atender tu equipo?", "100");
    fireEvent.click(screen.getByLabelText("Usarlo"));
    escribir("Tu razón", "Supera lo de hoy");
    registrar9();
    expect(screen.getByRole("alert").textContent).toMatch(
      /tu razón para mover el umbral/,
    );
    escribir("Tu razón para moverlo", "El comité pidió menos llamadas");
    registrar9();
    expect(registrado.rechazo).toBeNull();
    expect(registrado.datos?.respuestas.umbral).toBe("0.30");
  });

  it("las cifras del modelo frente a no hacer nada y actuar con todos, con la marca de lo de hoy", () => {
    montar();
    const cifras = screen.getByTestId("protocolo-cifras9");
    const filas = within(cifras).getAllByRole("row");
    // encabezado + modelo + no hacer nada + actuar con todos (crédito no tiene regla de hoy)
    expect(filas).toHaveLength(4);
    expect(filas[0]!.textContent).toMatch(/Alertas por cada 100 casos/);
    expect(filas[0]!.textContent).toMatch(
      /Falsas alarmas por cada 100 alertas/,
    );
    expect(filas[1]!.textContent).toMatch(/Con el modelo/);
    expect(filas[1]!.textContent).toMatch(/de .* a /);
    expect(cifras.textContent).toMatch(/· lo de hoy/);
    expect(screen.getByTestId("protocolo-ahorro9").textContent).toMatch(
      /Frente a lo de hoy/,
    );
  });

  it("la capacidad: si las alertas no caben, el umbral de tu capacidad con su costo", () => {
    montar();
    escribir("De cada 100 casos, ¿cuántos alcanza a atender tu equipo?", "5");
    const lectura = screen.getByTestId("protocolo-capacidad9-lectura");
    expect(lectura.textContent).toMatch(/tu equipo atiende 5/);
    expect(lectura.textContent).toMatch(/El umbral de tu capacidad es 0\.\d+/);
    expect(lectura.className).toMatch(/text-caution/);
    escribir("De cada 100 casos, ¿cuántos alcanza a atender tu equipo?", "100");
    expect(
      screen.getByTestId("protocolo-capacidad9-lectura").textContent,
    ).toMatch(/tu equipo alcanza/);
  });

  it("la curva de decisión: una gráfica y sus cifras cada 0.05, con la fila de tus costos", () => {
    montar();
    const curva = screen.getByTestId("protocolo-curva9");
    expect(within(curva).getByRole("img").getAttribute("aria-label")).toMatch(
      /la tabla de abajo trae las mismas cifras/,
    );
    const filas = within(curva).getAllByTestId("protocolo-curva9-fila");
    const conMarca = filas.filter((f) => /◆ tus costos/.test(f.textContent!));
    expect(conMarca).toHaveLength(1);
    expect(filas.length).toBeGreaterThanOrEqual(19);
    elegir("Umbral con que se actúa", "0.37");
    expect(
      within(screen.getByTestId("protocolo-curva9"))
        .getAllByTestId("protocolo-curva9-fila")
        .filter((f) => /● elegido/.test(f.textContent!)),
    ).toHaveLength(1);
  });
});

describe("cuando la 9 no tiene con qué, y con un número", () => {
  it("sin la tabla de la 8 (registrada antes del S14) lo dice y no muestra cifras", () => {
    // la 8 como la registraba el S13: sin la tabla, registrada con la compuerta real
    const ocho = structuredClone(CREDITO.previas[8]!);
    for (const k of NUEVOS_S14)
      delete (ocho.chequeos as Record<string, unknown>)[k];
    const a = armarCredito7();
    const r = registrar(PROTOCOLO_DS, a.cuaderno, 8, ocho, {
      huella: HUELLA,
      tabla: a.tabla,
      ahora: AHORA,
    });
    if (!r.ok) throw new Error(JSON.stringify(r.rechazo));
    const viejo = {
      ...a,
      cuaderno: r.cuaderno,
      previas: { ...a.previas, 8: ocho },
    };
    montar(viejo.previas, viejo);
    expect(screen.getByTestId("protocolo-sin-tabla9").textContent).toMatch(
      /Vuelve a la etapa 8 y regístrala otra vez/,
    );
    expect(screen.queryByTestId("protocolo-cifras9")).toBeNull();
    registrar9();
    expect(screen.getByRole("alert").textContent).toMatch(
      /la tabla de umbrales de la etapa 8/,
    );
    expect(Espia).not.toHaveBeenCalled();
  });

  it("S16 (S14): varias clases: el costo del ganador frente a lo de hoy; sin umbral, capacidad ni curva", () => {
    const planes = con7(armarPlanes6(), "logistic", "balanced_accuracy", 0.6);
    const plan = plan8(planes.tabla, planes.previas, HUELLA)!;
    const d = plan.plan7.diseno;
    const a = con8(planes, sintetico(plan, (f) => d.clases![f]!, null));
    montar(a.previas, a);
    expect(screen.getByTestId("protocolo-cifras9").textContent).toMatch(
      /Costo por cada 100 decisiones/,
    );
    expect(screen.queryByLabelText("Umbral con que se actúa")).toBeNull();
    expect(screen.queryByTestId("protocolo-capacidad9")).toBeNull();
    expect(screen.queryByTestId("protocolo-curva9")).toBeNull();
    // las tres decisiones siguen ahí, y la pantalla no habló con el worker
    for (const decision of ["Usarlo", "Iterar: mejorarlo antes de decidir", "No usarlo"])
      expect(screen.getByLabelText(decision)).toBeTruthy();
    expect(Espia).not.toHaveBeenCalled();
  });

  it("un número: el costo del modelo frente a lo de hoy y el cuantil que conviene; sin umbral ni capacidad", () => {
    const precio = con7(armarPrecio6(), "linear", "mae", 20_000);
    const plan = plan8(precio.tabla, precio.previas, HUELLA)!;
    const d = plan.plan7.diseno;
    const a = con8(
      precio,
      sintetico(plan, (f) => d.valores![f]! * 1.1, null, 25_000),
    );
    montar(a.previas, a);
    expect(screen.getByTestId("protocolo-cifras9").textContent).toMatch(
      /Costo por cada 100 decisiones/,
    );
    expect(
      screen.getByText(/lo que conviene apuntar es el cuantil/),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Umbral con que se actúa")).toBeNull();
    expect(screen.queryByTestId("protocolo-capacidad9")).toBeNull();
    expect(screen.queryByTestId("protocolo-curva9")).toBeNull();
  });
});

describe("sin probabilidades: la tabla de la 8 trae solo la clase predicha", () => {
  it("la pantalla no ofrece umbral y decide con la clase: «no usarlo» se registra con cifras, sin atascarse", () => {
    const a = armarCredito7();
    const plan = plan8(a.tabla, a.previas, HUELLA)!;
    const d = plan.plan7.diseno;
    const sinProba = registrar8(
      a,
      sintetico(plan, (f) => (d.clases![f] === d.positivo ? 1 : 0), null),
    );
    const { registrado } = montar(sinProba.previas, sinProba);
    expect(screen.queryByLabelText("Umbral con que se actúa")).toBeNull();
    expect(screen.getByTestId("protocolo-cifras9")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("No usarlo"));
    escribir("De cada 100 casos, ¿cuántos alcanza a atender tu equipo?", "100");
    escribir("Tu razón", "Sin probabilidades, decido con la clase que predice");
    registrar9();
    expect(registrado.rechazo).toBeNull();
    expect(registrado.datos?.respuestas.umbral).toBe(UMBRAL_CLASE);
    expect(registrado.datos?.chequeos.alertas100).not.toBeNull();
    expect(registrado.datos?.chequeos.costo_modelo).not.toBeNull();
    expect(Espia).not.toHaveBeenCalled();
  });
});

// --- S19: «¿qué pasaría si?» en la etapa 9 -----------------------------------------------------------

type Mensaje = { id: number; type: string; payload: Record<string, unknown> };

/** Un worker de mentira que contesta como pipeline.py: el eco del ajuste y una simulación con dos clases. */
function instalarWorker() {
  const creados: { url: unknown; mensajes: Mensaje[] }[] = [];
  class FalsoWorker {
    onerror: (() => void) | null = null;
    private oyentes = new Set<(e: { data: unknown }) => void>();
    private yo: { url: unknown; mensajes: Mensaje[] };
    private positiva = "";
    constructor(url: unknown) {
      this.yo = { url, mensajes: [] };
      creados.push(this.yo);
    }
    addEventListener(_: string, f: (e: { data: unknown }) => void) {
      this.oyentes.add(f);
    }
    removeEventListener(_: string, f: (e: { data: unknown }) => void) {
      this.oyentes.delete(f);
    }
    terminate() {}
    postMessage(m: Mensaje) {
      this.yo.mensajes.push(m);
      const p = m.payload as Record<string, unknown> & { train?: unknown[]; rows?: unknown[]; column?: string };
      const respuesta =
        m.type === "fit-winner"
          ? (this.positiva = String(p.positive ?? ""), {
              task: p.task,
              winner: p.winner,
              n_train: (p.train as unknown[]).length,
              huella: p.huella,
              sello: p.sello,
              elapsed_ms: 1,
            })
          : (() => {
              const n = (p.rows as unknown[]).length;
              return {
                task: "binaria",
                n,
                column: p.column,
                positive_class: this.positiva,
                base: { pred: Array(n).fill(this.positiva), proba: Array(n).fill(0.7) },
                changed: { pred: Array(n).fill(this.positiva), proba: Array(n).fill(0.9) },
                outside: { before: 0, after: 0 },
                elapsed_ms: 1,
              };
            })();
      queueMicrotask(() =>
        this.oyentes.forEach((f) =>
          f({ data: { id: m.id, type: "result", command: m.type, result: respuesta } }),
        ),
      );
    }
  }
  vi.stubGlobal("Worker", FalsoWorker);
  return creados;
}

describe("la etapa 9: «¿qué pasaría si?» con las filas de entrenamiento", () => {
  it("ESPÍA: pintar no crea worker; «Simular» crea UNO que ajusta al ganador sin la prueba y simula solo filas de entrenamiento; no registra nada", async () => {
    const creados = instalarWorker();
    const { registrado, onRegistrar } = montar();
    expect(screen.getByRole("heading", { name: "¿Qué pasaría si?" })).toBeTruthy();
    expect(screen.getByText(/Son los costos que escribiste en la etapa 1/)).toBeTruthy();
    expect(screen.getByText(/la prueba se abrió una vez en la etapa 8 y no se vuelve a abrir/)).toBeTruthy();
    expect(creados).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Simular" }));
    await screen.findByTestId("simulador-resumen");
    expect(creados).toHaveLength(1);
    expect(creados[0]!.url).toBe("/pyodide-runner.js");
    const [ajuste, simulacion] = creados[0]!.mensajes;
    expect(ajuste!.type).toBe("fit-winner");
    // la prueba no viaja: ni la clave `test`, ni una fila que no sea de entrenamiento
    expect(Object.keys(ajuste!.payload)).not.toContain("test");
    const entrenamiento = (ajuste!.payload.train as unknown[]).length;
    expect(entrenamiento).toBeLessThan(CREDITO.tabla.rows.length);
    expect(simulacion!.type).toBe("simulate");
    expect((simulacion!.payload.rows as unknown[]).length).toBe(entrenamiento);
    expect(Object.keys(simulacion!.payload).sort()).toEqual(["column", "headers", "rows", "values"]);
    // los ids son negativos: la máquina de estados del hook de Probeta no los toma por suyos
    expect(ajuste!.id).toBeLessThan(0);
    // y lo simulado no entra al cuaderno ni a la compuerta
    expect(onRegistrar).not.toHaveBeenCalled();
    expect(registrado.datos).toBeNull();
  });

  it("pulsar «Simular» dos veces reajusta al ganador una sola vez", async () => {
    const creados = instalarWorker();
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Simular" }));
    await screen.findByTestId("simulador-resumen");
    fireEvent.click(screen.getByRole("button", { name: "Simular" }));
    await waitFor(() => expect(creados[0]!.mensajes).toHaveLength(3));
    expect(creados).toHaveLength(1);
    expect(creados[0]!.mensajes.map((m) => m.type)).toEqual(["fit-winner", "simulate", "simulate"]);
  });
});
