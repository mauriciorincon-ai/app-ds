// S21 (lote 19-12): `pedir` es la única puerta de los paneles al worker del modelo. Lo que estas pruebas hacen FALLAR:
//  · si el worker muere (`error`) o no puede leer el mensaje (`messageerror`) la promesa se rechaza diciendo «worker» y no se queda
//    colgada (antes el panel se quedaba en «calculando» para siempre);
//  · al responder o al fallar se quitan los TRES oyentes (no se acumulan en el worker que se reutiliza).
import { describe, expect, it, vi } from "vitest";
import { pedirSimulacion } from "@/lib/simulador/pedir";
import type { SimulatePayload } from "@/workers/protocol";
import type { SimuladorSent } from "@/workers/contrato-simulador";

type Oyente = (e: unknown) => void;
function workerDoble() {
  const oyentes = new Map<string, Set<Oyente>>();
  const w = {
    addEventListener: (t: string, f: Oyente) => {
      if (!oyentes.has(t)) oyentes.set(t, new Set());
      oyentes.get(t)!.add(f);
    },
    removeEventListener: (t: string, f: Oyente) => void oyentes.get(t)?.delete(f),
    postMessage: vi.fn(),
  };
  const quedan = () => [...oyentes.values()].reduce((n, s) => n + s.size, 0);
  const emitir = (t: string, e: unknown) => [...(oyentes.get(t) ?? [])].forEach((f) => f(e));
  return { w: w as unknown as Worker, quedan, emitir, postMessage: w.postMessage };
}

const payload = { headers: ["a"], rows: [["1"]], column: "a", values: ["2"] } as SimulatePayload;
const sent = { task: "binaria", n: 1, column: "a", classes: ["no", "si"], positive: "si" } as SimuladorSent;
const conTope = <T,>(p: Promise<T>) =>
  Promise.race([p, new Promise<never>((_, no) => setTimeout(() => no(new Error("colgada")), 50))]);

describe("pedir al worker", () => {
  it("si el worker muere, la promesa se rechaza con «worker» y no deja oyentes", async () => {
    const { w, quedan, emitir } = workerDoble();
    const p = pedirSimulacion(w, payload, sent);
    expect(quedan()).toBeGreaterThan(0);
    emitir("error", new Event("error"));
    await expect(conTope(p)).rejects.toThrow("worker");
    expect(quedan()).toBe(0);
  });

  it("si no puede leer el mensaje (messageerror) pasa lo mismo", async () => {
    const { w, quedan, emitir } = workerDoble();
    const p = pedirSimulacion(w, payload, sent);
    emitir("messageerror", new Event("messageerror"));
    await expect(conTope(p)).rejects.toThrow("worker");
    expect(quedan()).toBe(0);
  });

  it("al responder con un error del worker también quita los oyentes", async () => {
    const { w, quedan, emitir, postMessage } = workerDoble();
    const p = pedirSimulacion(w, payload, sent);
    const id = (postMessage.mock.calls[0]![0] as { id: number }).id;
    emitir("message", { data: { id, type: "error", message: "Error: no-model" } });
    await expect(conTope(p)).rejects.toThrow("no-model");
    expect(quedan()).toBe(0);
  });
});
