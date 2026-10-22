// @vitest-environment node
/**
 * S16 (auditoría H-32) — los números que los documentos del hito cuentan a mano tienen su gate: la tabla de «las 37 de la
 * VISION» del BLUEPRINT (22 + 8 + 7), las ocho descartadas del export y la ruta «Ensayo general del H-2» de la guía (cada
 * parada con su casilla y su chip «N de M», sin huecos ni repetidos). Un cambio que descuadre cualquiera de ellos falla aquí
 * nombrando cuál.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const blueprint = readFileSync("docs/BLUEPRINT.html", "utf8");
const guia = readFileSync("docs/GUIA-DE-PRUEBA.html", "utf8");
const exportado = JSON.parse(
  readFileSync("docs/brochure-export.json", "utf8"),
) as {
  funcionalidades: {
    total: number;
    descartadas: { id: string }[];
    grupos: { features: { id: string }[] }[];
  };
};

describe("BLUEPRINT: las 37 de la VISION", () => {
  const desde = blueprint.indexOf(
    "Las 37 de la VISION: construidas o descartadas",
  );
  const hasta = blueprint.indexOf("<h2>Lo que queda para H-3 y H-4</h2>");
  const seccion = blueprint.slice(desde, hasta);
  const filas = [
    ...seccion.matchAll(
      /<tr[^>]*><td class="num">(\d+)<\/td><td>.*?<\/td><td>(.*?)<\/td>/g,
    ),
  ];

  it("tiene 37 filas numeradas del 1 al 37", () => {
    expect(filas.map((f) => Number(f[1]))).toEqual(
      Array.from({ length: 37 }, (_, i) => i + 1),
    );
  });

  it("cuenta 22 construidas, 8 con otro alcance y 7 descartadas, y la nota lo dice igual", () => {
    const cuenta = (estado: string) =>
      filas.filter((f) => f[2] === estado).length;
    expect({
      construidas: cuenta("construida"),
      otroAlcance: cuenta("construida con otro alcance"),
      descartadas: cuenta("descartada"),
    }).toEqual({ construidas: 22, otroAlcance: 8, descartadas: 7 });
    expect(seccion).toContain(
      "<strong>22</strong> construidas, <strong>8</strong> construidas con otro alcance",
    );
    expect(seccion).toContain("<strong>7</strong> descartadas");
  });

  it("las descartadas del export son esas siete más la receta reproducible", () => {
    expect(exportado.funcionalidades.descartadas).toHaveLength(8);
    expect(
      exportado.funcionalidades.descartadas.some(
        (d) => d.id === "receta-reproducible",
      ),
    ).toBe(true);
  });

  it("el total del export es 41 de Probeta + 17 del Protocolo, y ninguna descartada es también construida", () => {
    const ids = exportado.funcionalidades.grupos.flatMap((g) =>
      g.features.map((f) => f.id),
    );
    expect(ids).toHaveLength(exportado.funcionalidades.total);
    expect(ids.filter((id) => /^L\d+$/.test(id))).toHaveLength(17);
    expect(ids.length - 17).toBe(41);
  });
});

describe("guía: la ruta «Ensayo general del H-2»", () => {
  const caja = guia.slice(
    guia.indexOf('id="ensayo"'),
    guia.indexOf('<div class="kit">'),
  );
  const paradas = [
    ...caja.matchAll(/<li><strong>([A-Za-z0-9]+)<\/strong> · /g),
  ].map((m) => m[1]!.toLowerCase());
  const chips = [...guia.matchAll(/o-ensayo">Ensayo · (\d+) de (\d+)</g)];

  it("lista 18 paradas y cada una tiene su casilla", () => {
    expect(paradas).toHaveLength(18);
    for (const id of paradas)
      expect(guia, `casilla «${id}»`).toContain(
        `<input type="checkbox" id="${id}">`,
      );
  });

  it("los chips «N de 18» van del 1 al 18 sin huecos ni repetidos, y la parada N de la lista lleva el chip N", () => {
    expect(chips.map((c) => Number(c[1])).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 18 }, (_, i) => i + 1),
    );
    expect(new Set(chips.map((c) => c[2]))).toEqual(new Set(["18"]));
    // la parada N de la lista lleva el chip N
    for (const [i, id] of paradas.entries()) {
      const casilla = guia.indexOf(`<input type="checkbox" id="${id}">`);
      const chip = guia.indexOf(`Ensayo · ${i + 1} de 18`, casilla);
      const siguiente = guia.indexOf("</li>", casilla);
      expect(chip, `parada ${i + 1} (${id}) sin su chip`).toBeGreaterThan(-1);
      expect(chip).toBeLessThan(siguiente);
    }
  });

  it("el bloque R tiene r1 a r11, el filtro existe y la memoria de las casillas es del S16", () => {
    for (let n = 1; n <= 11; n++) expect(guia).toContain(`id="r${n}"`);
    expect(guia).not.toContain('id="r12"');
    expect(guia).toContain('data-filtro="ensayo"');
    expect(guia).toContain('filtro === "ensayo"');
    expect(guia).toContain('var CLAVE = "guia-ds:s16:"');
  });

  it("el tiempo declarado en la caja es la suma de los «unos N min» de las paradas", () => {
    const minutos = [...caja.matchAll(/Unos (\d+) min/g)].map((m) =>
      Number(m[1]),
    );
    expect(minutos).toHaveLength(18);
    const total = minutos.reduce((a, b) => a + b, 0);
    expect(caja).toContain(`unos ${Math.round(total / 10) * 10} minutos`);
  });
});
