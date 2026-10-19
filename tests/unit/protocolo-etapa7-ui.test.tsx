// Protocolo DS (S12), etapa 7 — la pantalla en jsdom, con la compuerta real detrás y el worker sustituido por
// un hook controlable (el worker de verdad corre en el e2e y en la integración con Pyodide):
//  · lo que hereda y los pliegues con su verificación, antes de correr nada;
//  · «Correr la liga» manda el envío real (solo el entrenamiento); el progreso y el error se dicen;
//  · con la corrida, la liga como medida de selección, por qué ganó, la comparación y la permutación;
//  · registrar pasa por la compuerta de verdad; nunca filas: ningún valor de la unidad en pantalla.
import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatosEtapa } from "@/engine/protocolo/etapas";
import type { EstadoValidacion } from "@/lib/protocolo/useValidacion";

vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}));

const hook = vi.hoisted(() => ({
  estado: { tipo: "inactiva" } as EstadoValidacion,
  correr: vi.fn(),
  cancelar: vi.fn(),
}));
vi.mock("@/lib/protocolo/useValidacion", () => ({
  useValidacion: () => ({
    estado: hook.estado,
    correr: hook.correr,
    cancelar: hook.cancelar,
  }),
}));

const { I18nProvider } = await import("@/i18n/provider");
const { Etapa7Form } = await import("@/components/protocolo/Etapa7Form");
const { registrar } = await import("@/engine/protocolo/compuerta");
const { plan7 } = await import("@/engine/protocolo/etapa7");
const { PROTOCOLO_DS } = await import("@/engine/protocolo/protocolo-ds");
const { valoresDe } = await import("@/engine/protocolo/tabla");
const { envio7 } = await import("@/lib/protocolo/liga7");
const { validateValidationResult } = await import("@/workers/contract");
const helpers = await import("./protocolo-etapa4-helpers");
const {
  AHORA,
  ENTRADA_6_BAJAS,
  ENTRADA_6_CREDITO,
  ENTRADA_BAJAS,
  ENTRADA_CREDITO,
  HUELLA,
  armar6,
} = helpers;

const CREDITO = armar6(
  "credito-fuga-plantada.csv",
  "binaria",
  ENTRADA_CREDITO,
  ENTRADA_6_CREDITO,
);
const BAJAS = armar6(
  "bajas-con-fuga.csv",
  "binaria",
  ENTRADA_BAJAS,
  ENTRADA_6_BAJAS,
);
type Armado = typeof CREDITO;

function corrida() {
  const e = envio7(
    CREDITO.tabla,
    plan7(CREDITO.tabla, CREDITO.previas, HUELLA)!,
  )!;
  const raw = JSON.parse(
    readFileSync("tests/fixtures/contrato/validation-result.json", "utf8"),
  );
  const r = validateValidationResult(raw, {
    ...e.sent,
    permutations: { min: 20, max: 20 },
  });
  if (!r.ok) throw new Error(r.field);
  return { metrica: e.metrica, roster: e.roster, resultado: r.value };
}

function montar(armado: Armado) {
  const registrado: { datos: DatosEtapa | null; rechazo: unknown } = {
    datos: null,
    rechazo: null,
  };
  const onRegistrar = vi.fn((datos: DatosEtapa) => {
    const r = registrar(PROTOCOLO_DS, armado.cuaderno, 7, datos, {
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
      <Etapa7Form
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
        previas={armado.previas}
        onRegistrar={onRegistrar}
      />
    </I18nProvider>,
  );
  return { ...vista, registrado };
}

beforeEach(() => {
  window.localStorage.clear();
  hook.estado = { tipo: "inactiva" };
  hook.correr.mockReset();
  hook.cancelar.mockReset();
});

describe("antes de correr", () => {
  it("dice lo que hereda y muestra los pliegues con su verificación", () => {
    montar(CREDITO);
    expect(screen.getByTestId("protocolo-hereda").textContent).toMatch(
      /Estratificada/,
    );
    expect(screen.getByTestId("protocolo-hereda").textContent).not.toMatch(
      /monto_recuperado/,
    );
    const plan = plan7(CREDITO.tabla, CREDITO.previas, HUELLA)!;
    if (!plan.pliegues.ok) throw new Error("sin pliegues");
    expect(
      document.querySelectorAll(
        "[data-testid=protocolo-pliegues] tr[data-pliegue]",
      ),
    ).toHaveLength(plan.pliegues.k);
    expect(screen.getByTestId("protocolo-verificacion7").textContent).toMatch(
      /Ninguna fila de la prueba entra a un pliegue/,
    );
  });

  it("registrar sin correr la liga lo rechaza la compuerta (el botón está apagado)", () => {
    montar(CREDITO);
    expect(
      screen.getByRole("button", { name: /Registrar la etapa 7/ }),
    ).toBeDisabled();
  });

  it("«Correr la liga» manda el envío real: solo las filas del entrenamiento", () => {
    montar(CREDITO);
    fireEvent.click(screen.getByRole("button", { name: "Correr la liga" }));
    expect(hook.correr).toHaveBeenCalledTimes(1);
    const envio = hook.correr.mock.calls[0]![0] as {
      payload: { rows: unknown[] };
    };
    const plan = plan7(CREDITO.tabla, CREDITO.previas, HUELLA)!;
    expect(envio.payload.rows).toHaveLength(
      plan.particion.entrenamiento.length,
    );
  });

  it("nunca filas: ningún valor de la unidad aparece en pantalla", () => {
    const { container } = montar(BAJAS);
    const texto = container.textContent ?? "";
    for (const u of new Set(valoresDe(BAJAS.tabla, "cliente_id")))
      expect(texto.includes(u), `la unidad ${u} en pantalla`).toBe(false);
  });
});

describe("mientras corre", () => {
  it("dice qué modelo va y deja cancelar", () => {
    hook.estado = { tipo: "corriendo", fase: "cv", i: 3, n: 11, modelo: "hgb" };
    montar(CREDITO);
    expect(screen.getByTestId("protocolo-progreso").textContent).toMatch(
      /Validación cruzada: modelo 3 de 11/,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(hook.cancelar).toHaveBeenCalledTimes(1);
  });

  it("un error dice el motivo y que nada se registró", () => {
    hook.estado = { tipo: "error", motivo: "contrato: folds" };
    montar(CREDITO);
    expect(screen.getByTestId("protocolo-progreso").textContent).toMatch(
      /no pudo correr \(contrato: folds\); nada se registró/,
    );
  });
});

describe("con la liga corrida", () => {
  it("la liga como medida de selección, por qué ganó, la comparación y la permutación", () => {
    const c = corrida();
    hook.estado = { tipo: "lista", corrida: c };
    montar(CREDITO);
    const liga = screen.getByTestId("protocolo-liga");
    expect(liga.textContent).toMatch(/medida de selección/);
    expect(liga.querySelectorAll("tr[data-modelo]")).toHaveLength(
      c.roster.length,
    );
    expect(
      liga.querySelector(`tr[data-modelo="${c.resultado.winner}"]`)!
        .textContent,
    ).toMatch(/ganador/);
    expect(screen.getByTestId("protocolo-porque-gano").textContent).toMatch(
      /error estándar/,
    );
    expect(screen.getByTestId("protocolo-comparacion").textContent).toMatch(
      /por cada 100 decisiones/,
    );
    expect(screen.getByTestId("protocolo-veredicto7").textContent).toMatch(
      /(No supera|Supera) a la línea base/,
    );
    expect(screen.getByTestId("protocolo-permutacion").textContent).toMatch(
      /barajadas 20 veces/,
    );
  });

  it("registrar pasa por la compuerta de verdad", () => {
    hook.estado = { tipo: "lista", corrida: corrida() };
    const { registrado } = montar(CREDITO);
    fireEvent.click(
      screen.getByRole("button", { name: /Registrar la etapa 7/ }),
    );
    expect(registrado.rechazo).toBeNull();
    expect(registrado.datos?.chequeos.ganador).toBe(corrida().resultado.winner);
  });
});
