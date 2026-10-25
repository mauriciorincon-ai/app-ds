// Protocolo DS (S13), etapa 8 — la pantalla en jsdom, con la compuerta real detrás y el worker sustituido por un
// hook controlable (el worker de verdad corre en la espía de al lado, en el e2e y en la integración):
//  · lo que se abre y el aviso de que se abre una vez, antes de abrir nada; con el sello alterado no abre;
//  · «Abrir la prueba» manda el envío real (solo las columnas en «usar»), y la apertura se anota con su clave;
//  · con la prueba abierta: la medida con su intervalo y el optimismo, los segmentos con el peor marcado con
//    símbolo, texto y color, la calibración con su Brier y los peores casos;
//  · los peores casos están en pantalla pero no en lo que se registra; sin tu patrón la compuerta lo nombra.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatosEtapa, Previas } from "@/engine/protocolo/etapas";
import type { EstadoPrueba } from "@/lib/protocolo/usePrueba";

vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}));

const bootstrap = vi.hoisted(() => ({ llamadas: 0 }));
vi.mock("@/engine/protocolo/bootstrap", async (original) => {
  const real = await original<typeof import("@/engine/protocolo/bootstrap")>();
  return {
    ...real,
    intervaloBootstrap: (
      ...args: Parameters<typeof real.intervaloBootstrap>
    ) => {
      bootstrap.llamadas += 1;
      return real.intervaloBootstrap(...args);
    },
  };
});

const hook = vi.hoisted(() => ({
  estado: { tipo: "inactiva" } as EstadoPrueba,
  abrir: vi.fn(),
  cancelar: vi.fn(),
  estresar: vi.fn(),
}));
vi.mock("@/lib/protocolo/usePrueba", () => ({
  usePrueba: () => ({
    estado: hook.estado,
    abrir: hook.abrir,
    cancelar: hook.cancelar,
    estres: { tipo: "inactivo" },
    estresar: hook.estresar,
  }),
}));

const { I18nProvider } = await import("@/i18n/provider");
const { Etapa8Form } = await import("@/components/protocolo/Etapa8Form");
const { registrar } = await import("@/engine/protocolo/compuerta");
const { claveApertura, peoresCasos, plan8 } =
  await import("@/engine/protocolo/etapa8");
const { PROTOCOLO_DS } = await import("@/engine/protocolo/protocolo-ds");
const { AHORA, HUELLA, armarCredito7, corridaFixture } =
  await import("./protocolo-etapa8-helpers");

const CREDITO = armarCredito7();
const CORRIDA = corridaFixture("test-result", CREDITO);
const PLAN = plan8(CREDITO.tabla, CREDITO.previas, HUELLA)!;

function montar(
  previas: Previas = CREDITO.previas,
  aperturas = 0,
  onApertura = vi.fn(),
) {
  const registrado: { datos: DatosEtapa | null; rechazo: unknown } = {
    datos: null,
    rechazo: null,
  };
  const onRegistrar = vi.fn((datos: DatosEtapa) => {
    const r = registrar(PROTOCOLO_DS, CREDITO.cuaderno, 8, datos, {
      huella: HUELLA,
      tabla: CREDITO.tabla,
      ahora: AHORA,
    });
    registrado.datos = r.ok ? datos : null;
    registrado.rechazo = r.ok ? null : r.rechazo;
    return r.ok ? null : r.rechazo;
  });
  const vista = render(
    <I18nProvider>
      <Etapa8Form
        datos={{
          tabla: CREDITO.tabla,
          carga: {
            fecha: AHORA.toISOString(),
            sha256: HUELLA,
            nombre: "datos.csv",
            filas: CREDITO.tabla.rows.length,
            columnas: CREDITO.tabla.headers.length,
          },
        }}
        anterior={null}
        previas={previas}
        aperturas={aperturas}
        onApertura={onApertura}
        onRegistrar={onRegistrar}
      />
    </I18nProvider>,
  );
  return { ...vista, registrado, onApertura };
}

const patron = (texto: string) =>
  fireEvent.change(
    within(screen.getByTestId("protocolo-patron")).getByRole("textbox"),
    { target: { value: texto } },
  );

beforeEach(() => {
  window.localStorage.clear();
  hook.estado = { tipo: "inactiva" };
  hook.abrir.mockReset();
  hook.cancelar.mockReset();
});

describe("antes de abrir", () => {
  it("dice lo que se abre y que se abre una vez; registrar está apagado", () => {
    montar();
    const abre = screen.getByTestId("protocolo-abre8").textContent!;
    expect(abre).toMatch(/40 filas/);
    expect(abre).toMatch(/se abre una vez/);
    expect(abre).not.toMatch(/monto_recuperado/);
    expect(screen.queryByTestId("protocolo-aperturas")).toBeNull();
    expect(screen.queryByTestId("protocolo-medida8")).toBeNull();
    expect(
      screen.getByRole("button", { name: /Registrar la etapa 8/ }),
    ).toBeDisabled();
  });

  it("«Abrir la prueba» manda el envío real, y la apertura se anota con lo que se evaluó", () => {
    hook.abrir.mockImplementation((_envio, alAbrir: () => void) => alAbrir());
    const { onApertura } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Abrir la prueba" }));
    expect(hook.abrir).toHaveBeenCalledTimes(1);
    const envio = hook.abrir.mock.calls[0]![0] as {
      payload: { headers: string[]; test: unknown[] };
    };
    expect(envio.payload.test).toHaveLength(PLAN.plan7.particion.prueba.length);
    expect(envio.payload.headers).not.toContain("monto_recuperado");
    expect(onApertura).toHaveBeenCalledWith(claveApertura(HUELLA, PLAN));
  });

  it("con el sello alterado no abre: lo dice y el botón está apagado", () => {
    const e6 = CREDITO.previas[6]!;
    montar({
      ...CREDITO.previas,
      6: { ...e6, chequeos: { ...e6.chequeos, sello: "0".repeat(64) } },
    });
    expect(screen.getByTestId("protocolo-abre8").textContent).toMatch(
      /no es el que registró la etapa 6/,
    );
    expect(
      screen.getByRole("button", { name: "Abrir la prueba" }),
    ).toBeDisabled();
  });

  it("si ya la abriste, lo cuenta, y el botón dice «otra vez»", () => {
    montar(CREDITO.previas, 2);
    expect(screen.getByTestId("protocolo-aperturas").textContent).toMatch(
      /2 configuraciones distintas/,
    );
    expect(
      screen.getByRole("button", { name: "Abrir la prueba otra vez" }),
    ).toBeEnabled();
  });
});

describe("mientras abre", () => {
  it("dice que mide y deja cancelar; un error dice el motivo", () => {
    hook.estado = { tipo: "midiendo" };
    const { unmount } = montar();
    expect(screen.getByTestId("protocolo-progreso8").textContent).toMatch(
      /midiendo la prueba/,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(hook.cancelar).toHaveBeenCalledTimes(1);
    unmount();
    hook.estado = { tipo: "error", motivo: "contrato: sello" };
    montar();
    expect(screen.getByTestId("protocolo-progreso8").textContent).toMatch(
      /no se pudo abrir \(contrato: sello\); nada se registró/,
    );
  });
});

describe("con la prueba abierta", () => {
  beforeEach(() => {
    hook.estado = { tipo: "lista", corrida: CORRIDA };
  });

  // S14 (M2): escribir el patrón no vuelve a correr el bootstrap (1.000 re-muestreos por intervalo)
  it("escribir el patrón no recalcula la medida", () => {
    montar(CREDITO.previas, 1);
    const antes = bootstrap.llamadas;
    expect(antes).toBeGreaterThan(0);
    patron("F");
    patron("Falla con quienes");
    patron("Falla con quienes trabajan en la informalidad");
    expect(bootstrap.llamadas).toBe(antes);
    // y lo escrito sí llega: con el patrón, registrar se habilita
    expect(
      (
        screen.getByRole("button", {
          name: "Registrar la etapa 8",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("la medida con su intervalo, el optimismo, los segmentos, la calibración y los peores casos", () => {
    montar(CREDITO.previas, 1);
    const medida = screen.getByTestId("protocolo-medida8");
    expect(medida.textContent).toMatch(/Costo por cada 100 decisiones/);
    expect(screen.getByTestId("protocolo-medida8-ganador")).toBeTruthy();
    expect(screen.getByTestId("protocolo-medida8-base").textContent).toMatch(
      /Sin modelo/,
    );
    expect(screen.getByTestId("protocolo-optimismo").textContent).toMatch(
      /Optimismo de la selección/,
    );
    // el peor segmento se marca con símbolo, texto y color
    const peor = document.querySelector(
      "[data-testid=protocolo-segmento][data-peor]",
    )!;
    expect(peor.textContent).toMatch(/empleo = «informal»/);
    expect(peor.textContent).toMatch(/▲/);
    expect(peor.textContent).toMatch(/el peor/);
    expect(peor.className).toMatch(/text-caution/);
    expect(
      document.querySelectorAll("[data-testid=protocolo-segmento][data-peor]"),
    ).toHaveLength(1);
    expect(screen.getByTestId("protocolo-segmentos").textContent).toMatch(
      /sin soporte/,
    );
    expect(
      document.querySelectorAll("[data-testid=protocolo-tramo]"),
    ).toHaveLength(5);
    expect(screen.getByTestId("protocolo-brier").textContent).toMatch(
      /Brier: 0\.25/,
    );
    expect(
      document.querySelectorAll("[data-testid=protocolo-peor]"),
    ).toHaveLength(10);
  });

  it("sin tu patrón la compuerta lo nombra; con él, se registra y los peores casos no van al cuaderno", () => {
    const { registrado } = montar(CREDITO.previas, 1);
    const boton = screen.getByRole("button", { name: /Registrar la etapa 8/ });
    fireEvent.click(boton);
    expect(registrado.rechazo).toMatchObject({
      tipo: "criterio-no-cumplido",
      faltan: ["patron"],
    });
    expect(screen.getByRole("alert").textContent).toMatch(/tu patrón de fallo/);
    patron("Falla con quienes trabajan en la informalidad");
    fireEvent.click(boton);
    expect(registrado.rechazo).toBeNull();
    const datos = registrado.datos!;
    expect(datos.respuestas.patron).toBe(
      "Falla con quienes trabajan en la informalidad",
    );
    expect(datos.chequeos.aperturas).toBe(1);
    // las filas de los peores casos están en pantalla, nunca en lo registrado
    const texto = JSON.stringify(datos);
    const j = CREDITO.tabla.headers.indexOf("ingreso_mensual");
    for (const x of peoresCasos(PLAN, CORRIDA)) {
      const valor = CREDITO.tabla.rows[x.fila]![j]!;
      expect(screen.getByTestId("protocolo-peores").textContent).toContain(
        valor,
      );
      expect(texto.includes(`"${valor}"`), valor).toBe(false);
    }
  });
});

describe("en el cuaderno", () => {
  async function cuadernoCon(aperturaFecha: string | null) {
    const { CuadernoPanel } =
      await import("@/components/protocolo/CuadernoPanel");
    const { agregarApertura } = await import("@/engine/protocolo/cuaderno");
    const { datosEtapa8 } = await import("@/engine/protocolo/etapa8");
    const datos = datosEtapa8(
      CREDITO.tabla,
      CREDITO.previas,
      HUELLA,
      CORRIDA,
      { patron: "Falla con quienes trabajan en la informalidad" },
      1,
    );
    const r = registrar(PROTOCOLO_DS, CREDITO.cuaderno, 8, datos, {
      huella: HUELLA,
      tabla: CREDITO.tabla,
      ahora: AHORA,
    });
    if (!r.ok) throw new Error(JSON.stringify(r.rechazo));
    const cuaderno = aperturaFecha
      ? agregarApertura(r.cuaderno, {
          fecha: aperturaFecha,
          huella: HUELLA,
          clave: claveApertura(HUELLA, PLAN)!,
        })
      : r.cuaderno;
    render(
      <I18nProvider>
        <CuadernoPanel
          cuaderno={cuaderno}
          guardado={null}
          importePendiente={null}
          onExportar={() => ({ nombre: "x.json", contenido: "{}" })}
          onImportar={() => undefined}
          onConfirmarImporte={() => undefined}
          onDescartarImporte={() => undefined}
          onNuevo={() => undefined}
        />
      </I18nProvider>,
    );
  }

  it("la 8 en una lectura: el ganador con su intervalo, la línea base, el peor segmento, el Brier, las aperturas y tu patrón", async () => {
    await cuadernoCon(new Date(AHORA.getTime() + 3_600_000).toISOString());
    const r8 = screen.getByTestId("cuaderno-resumen8").textContent!;
    expect(r8).toMatch(/En la prueba, .+ cuesta .+ por cada 100 decisiones/);
    expect(r8).toMatch(/Sin modelo \(Siempre actuar\)/);
    expect(r8).toMatch(/Peor segmento: empleo = «informal»/);
    expect(r8).toMatch(/Brier 0\.25/);
    expect(r8).toMatch(/La prueba se abrió una vez/);
    expect(r8).toMatch(/«Falla con quienes trabajan en la informalidad»/);
    // la 7 se eligió antes de abrir la prueba
    expect(screen.getByTestId("cuaderno-resumen7").textContent).toMatch(
      /abrió la prueba después: esta selección se hizo sin verla/,
    );
  });

  it("la 7 dice si la prueba sigue cerrada, o si se eligió con la prueba ya abierta", async () => {
    await cuadernoCon(null);
    expect(screen.getByTestId("cuaderno-resumen7").textContent).toMatch(
      /La prueba sigue cerrada/,
    );
    cleanup();
    await cuadernoCon(new Date(AHORA.getTime() - 3_600_000).toISOString());
    expect(screen.getByTestId("cuaderno-resumen7").textContent).toMatch(
      /con la prueba ya abierta en la etapa 8: ya no es a ciegas/,
    );
  });
});
