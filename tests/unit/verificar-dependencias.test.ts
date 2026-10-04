// @vitest-environment node
/**
 * Regla 18 (kit v1.37.0): ningún paquete queda por debajo de la base, salvo una degradación
 * DECLARADA en scripts/degradaciones-permitidas.json; una entrada sin uso falla. Y el candado del
 * S6 (AU-S6-13), que el kit no trae: un lockfile que no se sabe leer no es un verde.
 */
import { describe, expect, it } from "vitest";
import { revisar } from "../../scripts/verificar-dependencias.mjs";

function lock(paquetes: string[], version = "9.0"): string {
  return [
    `lockfileVersion: '${version}'`,
    "",
    "packages:",
    "",
    ...paquetes.map((p) => `  ${p}:\n    resolution: {integrity: sha512-x}\n`),
    "snapshots:",
    "",
  ].join("\n");
}

const BASE = lock(["zod@4.1.0", "react@19.3.0", "@types/node@22.10.0"]);

describe("verificar-dependencias (regla 18, kit v1.37.0 + AU-S6-13)", () => {
  it("el mismo lockfile no degrada nada", () => {
    const r = revisar({ lockBase: BASE, lockPR: BASE, permitidas: [] });
    expect(r).toMatchObject({ degradados: [], sinUso: [], paquetes: 3 });
  });

  it("una versión más baja que la base se nombra", () => {
    const pr = lock(["zod@4.0.9", "react@19.3.0", "@types/node@22.10.0"]);
    const r = revisar({ lockBase: BASE, lockPR: pr, permitidas: [] });
    expect(r.ilegible).toBeUndefined();
    if (r.ilegible === undefined)
      expect(r.degradados).toEqual([
        "zod: 4.1.0 (origin/main) → 4.0.9 (este árbol)",
      ]);
  });

  it("una degradación DECLARADA pasa, con su razón", () => {
    const pr = lock(["zod@4.1.0", "react@19.3.0", "@types/node@20.0.0"]);
    const permitidas = [
      {
        nombre: "@types/node",
        de: "22.10.0",
        a: "20.0.0",
        razon: "sigue al Node de la CI",
      },
    ];
    const r = revisar({ lockBase: BASE, lockPR: pr, permitidas });
    expect(r).toMatchObject({ degradados: [], sinUso: [] });
    if (r.ilegible === undefined)
      expect(r.aceptados[0]).toContain("sigue al Node de la CI");
  });

  it("una entrada declarada que ya no se usa FALLA nombrándola", () => {
    const permitidas = [
      { nombre: "zod", de: "4.1.0", a: "4.0.0", razon: "vieja" },
    ];
    const r = revisar({ lockBase: BASE, lockPR: BASE, permitidas });
    expect(r).toMatchObject({ sinUso: ["zod 4.1.0 → 4.0.0"] });
  });

  it("compara cada línea mayor que las dos orillas tienen, no solo la más alta", () => {
    const base = lock(["zod@4.1.0", "zod@3.24.0"]);
    const pr = lock(["zod@4.1.0", "zod@3.22.0"]);
    const r = revisar({ lockBase: base, lockPR: pr, permitidas: [] });
    if (r.ilegible === undefined)
      expect(r.degradados).toEqual([
        "zod: 3.24.0 (origin/main) → 3.22.0 (este árbol)",
      ]);
  });

  it("AU-S6-13: otra lockfileVersion no se compara: ilegible", () => {
    const r = revisar({
      lockBase: BASE,
      lockPR: lock(["zod@4.1.0"], "10.0"),
      permitidas: [],
    });
    expect(r.ilegible).toMatch(/lockfileVersion 9.0/);
  });

  it("AU-S6-13: si la mayoría de los paquetes no aparecen, ilegible (no «quitados a propósito»)", () => {
    const muchos = Array.from({ length: 10 }, (_, i) => `pkg${i}@1.0.0`);
    const r = revisar({
      lockBase: lock(muchos),
      lockPR: lock(muchos.slice(0, 3)),
      permitidas: [],
    });
    expect(r.ilegible).toMatch(/7 de 10 paquetes/);
  });
});
