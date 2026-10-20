// Protocolo DS (S13), etapa 8 — la espía: la pantalla con el hook REAL y un Worker falso que registra todo lo que
// se le manda. Hasta el clic en «Abrir la prueba» no hay worker ni mensaje: abrir la etapa, escribir el patrón o
// mirar lo que se abre no saca ninguna fila de la prueba del hilo principal. Con el clic sale un solo mensaje,
// «test», con la prueba entera y solo las columnas en «usar».
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunnerResponse } from "@/workers/protocol";

vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}));

class WorkerFalso {
  static todos: WorkerFalso[] = [];
  onmessage: ((e: MessageEvent<RunnerResponse>) => void) | null = null;
  onerror: (() => void) | null = null;
  enviados: { id: number; type: string; payload?: unknown }[] = [];
  constructor() {
    WorkerFalso.todos.push(this);
  }
  postMessage(m: { id: number; type: string }) {
    this.enviados.push(m);
  }
  terminate() {}
}

const { I18nProvider } = await import("@/i18n/provider");
const { Etapa8Form } = await import("@/components/protocolo/Etapa8Form");
const { plan8 } = await import("@/engine/protocolo/etapa8");
const { AHORA, HUELLA, armarCredito7 } =
  await import("./protocolo-etapa8-helpers");

const CREDITO = armarCredito7();
const PLAN = plan8(CREDITO.tabla, CREDITO.previas, HUELLA)!;

beforeEach(() => {
  WorkerFalso.todos = [];
  vi.stubGlobal("Worker", WorkerFalso);
});
afterEach(() => vi.unstubAllGlobals());

const enviados = () => WorkerFalso.todos.flatMap((w) => w.enviados);

describe("la espía de la etapa 8", () => {
  it("nada sale antes del clic; con el clic, un solo mensaje «test» con la prueba", () => {
    render(
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
          previas={CREDITO.previas}
          onRegistrar={() => null}
        />
      </I18nProvider>,
    );
    fireEvent.change(
      within(screen.getByTestId("protocolo-patron")).getByRole("textbox"),
      { target: { value: "Falla con los independientes" } },
    );
    expect(WorkerFalso.todos).toHaveLength(0);
    expect(enviados()).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Abrir la prueba" }));
    expect(WorkerFalso.todos).toHaveLength(1);
    const mensajes = enviados();
    expect(mensajes.map((m) => m.type)).toEqual(["test"]);
    const payload = mensajes[0]!.payload as {
      headers: string[];
      test: string[][];
      train: string[][];
    };
    expect(payload.test).toHaveLength(PLAN.plan7.particion.prueba.length);
    expect(payload.train).toHaveLength(
      PLAN.plan7.particion.entrenamiento.length,
    );
    expect(payload.headers).toEqual([
      ...PLAN.plan7.numericas,
      ...PLAN.plan7.categoricas,
      PLAN.plan7.objetivo,
    ]);
  });
});
