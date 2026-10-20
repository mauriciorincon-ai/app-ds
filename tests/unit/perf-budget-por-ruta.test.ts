// S14 (B3 del S13): los presupuestos de peso van por ruta. LHCI aplica TODOS los `path` que casan con una URL, y
// "/" o "/*" casan con todo: el `/*` con 320 KB del S13 le dio a la portada el techo de /protocolo. Esta prueba
// lee los archivos reales y exige que cada URL medida case con exactamente un presupuesto, con la misma regla que
// usa LHCI (scripts/lhci-rutas.mjs, copiada de @lhci/utils); y que el techo de LCP no suba.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  coincide,
  patronDeRuta,
  revisarPresupuestos,
} from "../../scripts/lhci-rutas.mjs";

type Presupuesto = {
  path: string;
  timings: { metric: string; budget: number }[];
  resourceSizes: { resourceType: string; budget: number }[];
};

const leer = <T>(archivo: string): T =>
  JSON.parse(readFileSync(archivo, "utf8")) as T;
const BUDGETS = leer<Presupuesto[]>("perf-budget.json");
const URLS = leer<string[]>("lighthouse-urls.json");
const tope = (b: Presupuesto, tipo: string) =>
  b.resourceSizes.find((r) => r.resourceType === tipo)?.budget;

describe("perf-budget.json: un presupuesto por ruta medida", () => {
  it("cada URL de lighthouse-urls.json casa con exactamente un path", () => {
    expect(revisarPresupuestos(BUDGETS, URLS)).toEqual([]);
  });

  it("la portada tiene su techo de 300 KB y /protocolo el suyo de 320 KB", () => {
    const por = (url: string) => BUDGETS.find((b) => coincide(b.path, url))!;
    expect(tope(por("/"), "script")).toBe(300);
    expect(tope(por("/protocolo"), "script")).toBe(320);
  });

  it("el techo de LCP no sube de 3.500 ms en ninguna ruta", () => {
    for (const b of BUDGETS) {
      const lcp = b.timings.find(
        (t) => t.metric === "largest-contentful-paint",
      );
      expect(lcp?.budget, b.path).toBeLessThanOrEqual(3500);
    }
  });
});

describe("cómo casa LHCI un path (la regla copiada)", () => {
  it("'/$' casa solo la raíz; '/protocolo' no casa la raíz; '/' y '/*' casan todo", () => {
    expect(coincide("/$", "/")).toBe(true);
    expect(coincide("/$", "/protocolo")).toBe(false);
    expect(coincide("/protocolo", "/")).toBe(false);
    expect(coincide("/protocolo", "/protocolo")).toBe(true);
    expect(coincide("/", "/protocolo")).toBe(true);
    expect(coincide("/*", "/protocolo")).toBe(true);
    expect(
      patronDeRuta(undefined as unknown as string).test("http://x/y"),
    ).toBe(true);
  });

  it("el caso del S13: '/*' y '/protocolo' juntos se cruzan en /protocolo y lo nombra", () => {
    const cruzados = [{ path: "/*" }, { path: "/protocolo" }];
    expect(revisarPresupuestos(cruzados, ["/", "/protocolo"])).toEqual([
      { url: "/protocolo", tipo: "varios", paths: ["/*", "/protocolo"] },
    ]);
  });

  it("una URL sin presupuesto se nombra", () => {
    expect(revisarPresupuestos([{ path: "/$" }], ["/", "/protocolo"])).toEqual([
      { url: "/protocolo", tipo: "sin-presupuesto", paths: [] },
    ]);
  });
});
