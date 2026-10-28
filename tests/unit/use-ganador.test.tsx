// S21 (lote 19-10 y 20-16): el worker que vuelve a ajustar al ganador. Lo que estas pruebas hacen FALLAR:
//  · dos pedidos del MISMO ajuste mientras el primero sigue en vuelo hacen UN solo `fit-winner` (antes el segundo se mandaba otra vez);
//  · un ajuste con otra huella o sello sí se rehace;
//  · la constancia de la etapa 10 crea UN solo `useGanador()` y se lo pasa al modelo y a las reglas (antes cada uno tenía el suyo, y con
//    él su propio worker de Python).
import { readFileSync } from "node:fs";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EnvioGanador } from "@/lib/protocolo/ganador";

const pedirAjuste = vi.fn();
vi.mock("@/lib/simulador/pedir", () => ({
  pedirAjuste: (...args: unknown[]) => pedirAjuste(...args),
  pedirReglas: vi.fn(),
  pedirSimulacion: vi.fn(),
}));
vi.mock("@/lib/publica/modelo", () => ({ pedirExport: vi.fn() }));

const { useGanador } = await import("@/lib/protocolo/useGanador");

class WorkerDoble {
  onerror: ((e: unknown) => void) | null = null;
  terminate = vi.fn();
}
const envio = (huella: string): EnvioGanador =>
  ({ sent: { huella, sello: "s", winner: "forest" } }) as unknown as EnvioGanador;

beforeEach(() => {
  pedirAjuste.mockReset();
  vi.stubGlobal("Worker", WorkerDoble);
});

describe("el ajuste del ganador", () => {
  it("dos pedidos del mismo ajuste mientras el primero sigue en vuelo hacen uno solo", async () => {
    let terminar: () => void = () => undefined;
    pedirAjuste.mockImplementation(() => new Promise<void>((res) => (terminar = res)));
    const { result } = renderHook(() => useGanador());
    let a!: Promise<Worker>;
    let b!: Promise<Worker>;
    act(() => {
      a = result.current.ajustar(envio("h1"));
      b = result.current.ajustar(envio("h1"));
    });
    expect(pedirAjuste).toHaveBeenCalledTimes(1);
    await act(async () => {
      terminar();
      await Promise.all([a, b]);
    });
    expect(result.current.estado.tipo).toBe("listo");
    // ya ajustado: otro pedido igual no vuelve a ajustar
    await act(async () => {
      await result.current.ajustar(envio("h1"));
    });
    expect(pedirAjuste).toHaveBeenCalledTimes(1);
  });

  it("otra huella sí se vuelve a ajustar", async () => {
    pedirAjuste.mockResolvedValue(undefined);
    const { result } = renderHook(() => useGanador());
    await act(async () => {
      await result.current.ajustar(envio("h1"));
      await result.current.ajustar(envio("h2"));
    });
    expect(pedirAjuste).toHaveBeenCalledTimes(2);
  });
});

describe("la constancia de la etapa 10", () => {
  const fuente = (n: string) => readFileSync(`src/components/protocolo/${n}.tsx`, "utf8");
  const llamadas = (s: string) => (s.match(/\buseGanador\(/g) ?? []).length;

  it("crea un solo useGanador() y los dos paneles lo reciben", () => {
    expect(llamadas(fuente("Etapa10Constancia"))).toBe(1);
    expect(llamadas(fuente("Etapa10Modelo"))).toBe(0);
    expect(llamadas(fuente("Etapa10Reglas"))).toBe(0);
  });
});
