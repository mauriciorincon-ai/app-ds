// Sprint 016 (S12) — una liga vacía no se manda al worker: `envio7` devuelve null y el botón queda apagado, en vez de
// caer en un error del worker al correr. Hoy el enrutador siempre deja a los modelos simples, así que el camino se
// ejerce con el roster simulado vacío (es una defensa, y una defensa sin prueba no se sabe que funciona).
import { describe, expect, it, vi } from "vitest";

vi.mock("@/engine/encarrilador", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/engine/encarrilador")>()),
  rosterFor: () => [],
}));

const { plan7 } = await import("@/engine/protocolo/etapa7");
const { envio7 } = await import("@/lib/protocolo/liga7");
const helpers = await import("./protocolo-etapa4-helpers");

describe("S12 · la liga vacía no se envía", () => {
  it("con el roster vacío, el envío es null (el botón de correr queda apagado)", () => {
    const armado = helpers.armar6(
      "credito-fuga-plantada.csv",
      "binaria",
      helpers.ENTRADA_CREDITO,
      helpers.ENTRADA_6_CREDITO,
    );
    const plan = plan7(armado.tabla, armado.previas, helpers.HUELLA)!;
    expect(plan).not.toBeNull();
    expect(envio7(armado.tabla, plan)).toBeNull();
  });
});
