// Protocolo DS (S13), etapa 8 — el hook que abre la prueba, con un Worker falso que registra lo que se le manda
// y deja emitir respuestas. Hasta «abrir» no hay worker ni mensaje (ninguna fila de la prueba sale antes del
// clic); el resultado se valida con su lector y SOLO uno válido cuenta como apertura (`alAbrir`, una vez); un
// resultado que no pasa el lector o un error de Python no abren nada; cancelar descarta lo que venga en camino.
import { readFileSync } from "node:fs";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { plan8 } from "@/engine/protocolo/etapa8";
import { envio8 } from "@/lib/protocolo/prueba8";
import { usePrueba } from "@/lib/protocolo/usePrueba";
import type { RunnerResponse } from "@/workers/protocol";
import { HUELLA, armarCredito7 } from "./protocolo-etapa8-helpers";

class WorkerFalso {
  static ultimo: WorkerFalso | null = null;
  static creados = 0;
  onmessage: ((e: MessageEvent<RunnerResponse>) => void) | null = null;
  onerror: (() => void) | null = null;
  enviados: { id: number; type: string; payload?: unknown }[] = [];
  terminado = false;
  constructor() {
    WorkerFalso.ultimo = this;
    WorkerFalso.creados += 1;
  }
  postMessage(m: { id: number; type: string }) {
    this.enviados.push(m);
  }
  terminate() {
    this.terminado = true;
  }
  responder(m: RunnerResponse) {
    act(() => this.onmessage?.({ data: m } as MessageEvent<RunnerResponse>));
  }
}

const CREDITO = armarCredito7();
const ENVIO = envio8(
  CREDITO.tabla,
  plan8(CREDITO.tabla, CREDITO.previas, HUELLA)!,
  HUELLA,
)!;
const RESULTADO = JSON.parse(
  readFileSync("tests/fixtures/contrato/test-result.json", "utf8"),
);

beforeEach(() => {
  WorkerFalso.ultimo = null;
  WorkerFalso.creados = 0;
  vi.stubGlobal("Worker", WorkerFalso);
});
afterEach(() => vi.unstubAllGlobals());

function apertura() {
  const alAbrir = vi.fn();
  const h = renderHook(() => usePrueba());
  expect(WorkerFalso.creados).toBe(0);
  act(() => h.result.current.abrir(ENVIO, alAbrir));
  const w = WorkerFalso.ultimo!;
  return { h, w, id: w.enviados.at(-1)!.id, alAbrir };
}

describe("el worker de la etapa 8", () => {
  it("sin «abrir» no hay worker; al abrir manda «test» con el envío y dice que está midiendo", () => {
    renderHook(() => usePrueba());
    expect(WorkerFalso.creados).toBe(0);
    const { h, w, id } = apertura();
    expect(h.result.current.estado).toEqual({ tipo: "cargando" });
    expect(w.enviados).toHaveLength(1);
    expect(w.enviados[0]).toMatchObject({
      type: "test",
      payload: ENVIO.payload,
    });
    w.responder({ id, type: "progress", stage: "loading-packages" });
    expect(h.result.current.estado).toEqual({ tipo: "cargando" });
    w.responder({ id, type: "progress", stage: "scoring" });
    expect(h.result.current.estado).toEqual({ tipo: "midiendo" });
  });

  it("un resultado que pasa el lector queda listo y cuenta como apertura, una vez", () => {
    const { h, w, id, alAbrir } = apertura();
    w.responder({ id, type: "result", command: "test", result: RESULTADO });
    expect(h.result.current.estado.tipo).toBe("lista");
    expect(alAbrir).toHaveBeenCalledTimes(1);
    // un resultado de otro comando no es el de la prueba
    w.responder({ id, type: "result", command: "validate", result: RESULTADO });
    expect(alAbrir).toHaveBeenCalledTimes(1);
  });

  it("uno que no pasa el lector (otro sello) es un error con el campo, y no abre nada", () => {
    const { h, w, id, alAbrir } = apertura();
    w.responder({
      id,
      type: "result",
      command: "test",
      result: { ...RESULTADO, sello: "0".repeat(64) },
    });
    expect(h.result.current.estado).toEqual({
      tipo: "error",
      motivo: "contrato: sello",
    });
    expect(alAbrir).not.toHaveBeenCalled();
  });

  it("un error de Python dice solo el campo del contrato, o «worker»", () => {
    const { h, w, id, alAbrir } = apertura();
    w.responder({
      id,
      type: "error",
      message: "Traceback …\nValueError: contract:folds",
    });
    expect(h.result.current.estado).toEqual({
      tipo: "error",
      motivo: "contrato: folds",
    });
    w.responder({
      id,
      type: "error",
      message: "RuntimeError: winner-fit-failed",
    });
    expect(h.result.current.estado).toEqual({
      tipo: "error",
      motivo: "worker",
    });
    expect(alAbrir).not.toHaveBeenCalled();
  });

  it("cancelar termina el worker, y lo que llegue de esa apertura ya no cuenta", () => {
    const { h, w, id, alAbrir } = apertura();
    act(() => h.result.current.cancelar());
    expect(w.terminado).toBe(true);
    w.responder({ id, type: "result", command: "test", result: RESULTADO });
    expect(h.result.current.estado).toEqual({ tipo: "cancelada" });
    expect(alAbrir).not.toHaveBeenCalled();
  });

  it("el worker se reutiliza; si muere, se dice; al desmontar, se termina", () => {
    const { h, w } = apertura();
    act(() => h.result.current.abrir(ENVIO, () => undefined));
    expect(WorkerFalso.creados).toBe(1);
    act(() => w.onerror?.());
    expect(h.result.current.estado).toEqual({
      tipo: "error",
      motivo: "worker",
    });
    act(() => h.result.current.abrir(ENVIO, () => undefined));
    const nuevo = WorkerFalso.ultimo!;
    expect(nuevo).not.toBe(w);
    h.unmount();
    expect(nuevo.terminado).toBe(true);
  });
});
