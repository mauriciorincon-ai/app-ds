// @vitest-environment node
/**
 * S17 (hereda el gate del S16, auditoría H-32) — los números que los documentos del hito cuentan a mano tienen su gate: la tabla de
 * «las 37 de la VISION» del BLUEPRINT (26 + 6 + 5 + 0), el export sin descartadas que el usuario no haya descartado por escrito, y
 * la ruta «Ensayo general del H-2» de la guía (24 paradas, cada una con su casilla y su chip «N de 24», sin huecos ni repetidos y en
 * el orden en que se recorren). Un cambio que descuadre cualquiera de ellos falla aquí nombrando cuál.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const blueprint = readFileSync("docs/BLUEPRINT.html", "utf8");
const guia = readFileSync("docs/GUIA-DE-PRUEBA.html", "utf8");
const manual = readFileSync("docs/MANUAL-DE-USO.md", "utf8");
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
    "Las 37 de la VISION: construidas, en construcción o descartadas",
  );
  const hasta = blueprint.indexOf("<h2>Lo que queda para H-3 y H-4</h2>");
  const seccion = blueprint.slice(desde, hasta);
  const filas = [
    ...seccion.matchAll(
      /<tr[^>]*><td class="num">(\d+)<\/td><td>.*?<\/td><td>(.*?)<\/td><td>(.*?)<\/td>/g,
    ),
  ];

  it("tiene 37 filas numeradas del 1 al 37", () => {
    expect(desde).toBeGreaterThan(0);
    expect(filas.map((f) => Number(f[1]))).toEqual(
      Array.from({ length: 37 }, (_, i) => i + 1),
    );
  });

  it("cuenta 26 construidas, 6 con otro alcance, 5 en construcción y ninguna descartada, y la nota lo dice igual", () => {
    const cuenta = (estado: RegExp) =>
      filas.filter((f) => estado.test(f[2]!)).length;
    expect({
      construidas: cuenta(/^construida$/),
      otroAlcance: cuenta(/^construida con otro alcance$/),
      enConstruccion: cuenta(/^en construcción \(S\d+\)$/),
      descartadas: cuenta(/descartada/),
    }).toEqual({
      construidas: 26,
      otroAlcance: 6,
      enConstruccion: 5,
      descartadas: 0,
    });
    expect(seccion).toContain(
      "<strong>26</strong> construidas, <strong>6</strong> construidas con otro alcance",
    );
    expect(seccion).toContain("<strong>5</strong> en construcción");
    expect(seccion).toContain("<strong>0</strong> descartadas");
  });

  it("lo que falta dice en qué sprint llega (S18 a S21)", () => {
    for (const f of filas) {
      if (/^en construcción/.test(f[2]!))
        expect(f[2], `fila ${f[1]}`).toMatch(/\(S(19|20|21)\)/);
      if (f[2] === "construida con otro alcance")
        expect(f[3], `fila ${f[1]}`).toMatch(/Falta: .*S(18|19)/);
    }
  });

  it("el export no nombra ninguna descartada: nada se descarta sin una decisión escrita del usuario", () => {
    expect(exportado.funcionalidades.descartadas).toEqual([]);
  });

  it("el total del export es 45 de Probeta + 17 del Protocolo, y los grupos suman el total", () => {
    const ids = exportado.funcionalidades.grupos.flatMap((g) =>
      g.features.map((f) => f.id),
    );
    expect(ids).toHaveLength(exportado.funcionalidades.total);
    expect(exportado.funcionalidades.total).toBe(62);
    expect(ids.filter((id) => /^L\d+$/.test(id))).toHaveLength(17);
    expect(ids.length - 17).toBe(45);
    expect(blueprint).toContain("<strong>62</strong>");
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
  const ORDEN = [
    "f3", "g4", "g5", "h2", "i2", "f8", "e6",
    "s1", "s2", "s3", "s4",
    "r1", "r2", "r3", "r4", "r5", "s5", "r6", "r7", "s6", "r8", "r9", "r10", "r11",
  ];

  it("lista 24 paradas, en el orden en que se recorren, y cada una tiene su casilla", () => {
    expect(paradas).toEqual(ORDEN);
    for (const id of paradas)
      expect(guia, `casilla «${id}»`).toContain(
        `<input type="checkbox" id="${id}">`,
      );
  });

  it("los chips «N de 24» van del 1 al 24 sin huecos ni repetidos, y la parada N de la lista lleva el chip N", () => {
    expect(chips.map((c) => Number(c[1])).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 24 }, (_, i) => i + 1),
    );
    expect(new Set(chips.map((c) => c[2]))).toEqual(new Set(["24"]));
    for (const [i, id] of paradas.entries()) {
      const casilla = guia.indexOf(`<input type="checkbox" id="${id}">`);
      const chip = guia.indexOf(`Ensayo · ${i + 1} de 24`, casilla);
      const siguiente = guia.indexOf("</li>", casilla);
      expect(chip, `parada ${i + 1} (${id}) sin su chip`).toBeGreaterThan(-1);
      expect(chip).toBeLessThan(siguiente);
    }
  });

  it("los bloques R (r1 a r11) y S (s1 a s6) están, el filtro existe y la memoria de las casillas es del S17", () => {
    for (let n = 1; n <= 11; n++) expect(guia).toContain(`id="r${n}"`);
    for (let n = 1; n <= 6; n++) expect(guia).toContain(`id="s${n}"`);
    expect(guia).not.toContain('id="r12"');
    expect(guia).not.toContain('id="s7"');
    expect(guia).toContain('data-filtro="ensayo"');
    expect(guia).toContain('data-filtro="s17"');
    expect(guia).toContain('filtro === "ensayo"');
    expect(guia).toContain('var CLAVE = "guia-ds:s17:"');
    expect(guia).toContain("v14 (acumulativa S1–S17)");
  });

  it("el tiempo declarado en la caja es la suma de los «unos N min» de las paradas", () => {
    const minutos = [...caja.matchAll(/Unos (\d+) min/g)].map((m) =>
      Number(m[1]),
    );
    expect(minutos).toHaveLength(24);
    const total = minutos.reduce((a, b) => a + b, 0);
    expect(caja).toContain(`unos ${Math.round(total / 10) * 10} minutos`);
  });
});

describe("manual: lo que el S17 construyó está contado", () => {
  it("trae las dos secciones, sus términos, sus preguntas frecuentes y su fila del historial", () => {
    expect(manual).toContain("### Estrésalo: ¿cuánto aguanta tu modelo? · desde Sprint 017");
    expect(manual).toContain("### Llévatelo: la receta, el puntuador y el servicio · desde Sprint 017");
    for (const termino of ["**Prueba de estrés**", "**Receta reproducible**", "**Puntuador portátil**"])
      expect(manual, termino).toContain(termino);
    expect(manual).toContain("¿Probeta publica mi modelo o lo despliega?");
    expect(manual).toMatch(/\| 017 {4}\| Estrésalo/);
  });
});
