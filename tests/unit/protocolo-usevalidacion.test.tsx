// Protocolo DS (S12), etapa 7 — el hook del worker, con un Worker falso que registra lo que se le manda y deja
// emitir respuestas: el progreso de la validación y de la permutación, el resultado validado con el lector
// del contrato, un resultado que no pasa el lector, un error del contrato de Python sin su mensaje, cancelar
// (y que los mensajes de una corrida cancelada no cuenten), y terminar el worker al desmontar.
import { readFileSync } from "node:fs";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { plan7 } from "@/engine/protocolo/etapa7";
import { envio7, type Envio7 } from "@/lib/protocolo/liga7";
import { useValidacion } from "@/lib/protocolo/useValidacion";
import type { RunnerResponse } from "@/workers/protocol";
import {
  ENTRADA_6_CREDITO,
  ENTRADA_CREDITO,
  HUELLA,
  armar6,
} from "./protocolo-etapa4-helpers";

class WorkerFalso {
  static ultimo: WorkerFalso | null = null;
  static creados = 0;
  onmessage: ((e: MessageEvent<RunnerResponse>) => void) | null = null;
  onerror: (() => void) | null = null;
  enviados: { id: number; type: string }[] = [];
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

const CREDITO = armar6(
  "credito-fuga-plantada.csv",
  "binaria",
  ENTRADA_CREDITO,
  ENTRADA_6_CREDITO,
);
const base = envio7(
  CREDITO.tabla,
  plan7(CREDITO.tabla, CREDITO.previas, HUELLA)!,
)!;
const ENVIO: Envio7 = {
  ...base,
  sent: { ...base.sent, permutations: { min: 20, max: 20 } },
};
const RESULTADO = JSON.parse(
  readFileSync("tests/fixtures/contrato/validation-result.json", "utf8"),
);

beforeEach(() => {
  WorkerFalso.ultimo = null;
  WorkerFalso.creados = 0;
  vi.stubGlobal("Worker", WorkerFalso);
});
afterEach(() => vi.unstubAllGlobals());

function corrida() {
  const h = renderHook(() => useValidacion());
  act(() => h.result.current.correr(ENVIO));
  const w = WorkerFalso.ultimo!;
  return { h, w, id: w.enviados.at(-1)!.id };
}

describe("el worker de la etapa 7", () => {
  it("manda «validate» con el envío y dice el progreso de la validación y de la permutación", () => {
    const { h, w, id } = corrida();
    expect(h.result.current.estado).toEqual({ tipo: "cargando" });
    expect(w.enviados.at(-1)).toMatchObject({
      type: "validate",
      payload: ENVIO.payload,
    });
    w.responder({
      id,
      type: "progress",
      stage: "training",
      detail: { phase: "cv", member: "hgb", index: 2, total: 11 },
    });
    expect(h.result.current.estado).toEqual({
      tipo: "corriendo",
      fase: "cv",
      i: 3,
      n: 11,
      modelo: "hgb",
    });
    w.responder({
      id,
      type: "progress",
      stage: "training",
      detail: { phase: "perm", member: "hgb", index: 0, total: 20 },
    });
    expect(h.result.current.estado).toMatchObject({
      tipo: "corriendo",
      fase: "perm",
      i: 1,
      n: 20,
    });
  });

  it("un resultado que pasa el lector queda listo; uno que no, es un error con el campo", () => {
    const { h, w, id } = corrida();
    w.responder({ id, type: "result", command: "validate", result: RESULTADO });
    expect(h.result.current.estado.tipo).toBe("lista");
    act(() => h.result.current.correr(ENVIO));
    const id2 = w.enviados.at(-1)!.id;
    w.responder({
      id: id2,
      type: "result",
      command: "validate",
      result: { ...RESULTADO, winner: "knn" },
    });
    expect(h.result.current.estado).toEqual({
      tipo: "error",
      motivo: "contrato: winner",
    });
    // y el worker se reutiliza: Pyodide no se vuelve a cargar
    expect(WorkerFalso.creados).toBe(1);
  });

  it("un error de Python dice solo el campo del contrato, o «worker»", () => {
    const { h, w, id } = corrida();
    w.responder({
      id,
      type: "error",
      message: "Traceback …\nValueError: contract:folds",
    });
    expect(h.result.current.estado).toEqual({
      tipo: "error",
      motivo: "contrato: folds",
    });
    act(() => h.result.current.correr(ENVIO));
    w.responder({
      id: w.enviados.at(-1)!.id,
      type: "error",
      message: "MemoryError: 12, 34",
    });
    expect(h.result.current.estado).toEqual({
      tipo: "error",
      motivo: "worker",
    });
  });

  it("cancelar termina el worker, y lo que llegue de esa corrida ya no cuenta", () => {
    const { h, w, id } = corrida();
    act(() => h.result.current.cancelar());
    expect(w.terminado).toBe(true);
    expect(h.result.current.estado).toEqual({ tipo: "cancelada" });
    w.responder({ id, type: "result", command: "validate", result: RESULTADO });
    expect(h.result.current.estado).toEqual({ tipo: "cancelada" });
  });

  it("si el worker muere, se dice; al desmontar, se termina", () => {
    const { h, w } = corrida();
    act(() => w.onerror?.());
    expect(h.result.current.estado).toEqual({
      tipo: "error",
      motivo: "worker",
    });
    act(() => h.result.current.correr(ENVIO));
    const nuevo = WorkerFalso.ultimo!;
    expect(nuevo).not.toBe(w);
    h.unmount();
    expect(nuevo.terminado).toBe(true);
  });
});
