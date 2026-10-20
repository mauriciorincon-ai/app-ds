// Protocolo DS (S14), etapa 9 — la pantalla en jsdom, con la compuerta real detrás. Lo que tiene que valer:
//  · ESPÍA: la etapa 9 no abre la prueba ni habla con el worker. Con un `Worker` espiado, recorrer la etapa
//    entera (umbral, capacidad, decisión, registrar) no crea ninguno;
//  · el umbral de tus costos por defecto; moverlo lo rotula «elegido mirando la prueba» y pide tu razón;
//  · las cifras del modelo frente a no hacer nada y actuar con todos, con la marca de lo de hoy; la capacidad
//    con el umbral que cabe; la curva en cifras, con la fila de tus costos;
//  · sin la tabla de la 8 (registrada antes del S14) lo dice; con un número, el costo y el cuantil.
import {
  cleanup,
  fireEvent,
  render,
  screen,
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
const { NUEVOS_S14, plan8 } = await import("@/engine/protocolo/etapa8");
const { PROTOCOLO_DS } = await import("@/engine/protocolo/protocolo-ds");
const { armarCredito7, armarPrecio6, con7, sintetico } =
  await import("./protocolo-etapa8-helpers");
const { AHORA, HUELLA, armarCredito8, con8 } =
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
