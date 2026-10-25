// @vitest-environment node
/**
 * S19: los paneles que hablan con el worker de Probeta (margen de error, «Llévatelo», simulador) piden sus ids a UN solo asignador.
 * Antes cada módulo llevaba su contador desde −1 000 000 y el primer pedido de dos paneles era el mismo id: la respuesta de uno
 * podía ser leída por el otro (se vio en la auditoría de lectura del S19). Garantías que estos tests hacen FALLAR:
 *  - los ids son negativos (el hook de Probeta usa los ≥ 0) y no se repiten;
 *  - ningún otro archivo vuelve a arrancar su propio contador de ids de panel.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { siguienteIdDePanel } from "@/workers/ids-panel";

function archivos(dir: string, salida: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) archivos(ruta, salida);
    else if (/\.tsx?$/.test(nombre)) salida.push(ruta);
  }
  return salida;
}

describe("el asignador de ids de los paneles", () => {
  it("da ids negativos que no se repiten", () => {
    const ids = Array.from({ length: 1000 }, () => siguienteIdDePanel());
    expect(ids.every((id) => id < 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ningún otro módulo arranca un contador propio desde −1 000 000", () => {
    const intrusos = archivos("src")
      .filter((f) => !f.endsWith("workers/ids-panel.ts"))
      .filter((f) => /-1_?000_?000/.test(readFileSync(f, "utf8")));
    expect(intrusos).toEqual([]);
  });

  it("los paneles del margen de error y de «Llévatelo» lo usan", () => {
    for (const f of [
      "src/components/resultados/IntervaloPanel.tsx",
      "src/lib/publica/modelo.ts",
      "src/lib/simulador/pedir.ts",
    ])
      expect(readFileSync(f, "utf8")).toContain("siguienteIdDePanel");
  });
});
