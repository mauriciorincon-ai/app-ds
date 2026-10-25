// @vitest-environment node
/**
 * S19 (hereda el gate del S18, del S17 y del S16, auditoría H-32) — los números que los documentos del hito cuentan a mano tienen su
 * gate: la tabla de «las 37 de la VISION» del BLUEPRINT (34 + 0 + 3 + 0), el export sin descartadas que el usuario no haya descartado
 * por escrito (73 = 54 de Probeta + 19 del Protocolo), y la ruta «Ensayo general del H-2» de la guía (37 paradas, cada una con su
 * casilla y su chip «N de 37», sin huecos ni repetidos y en el orden en que se recorren). La parada R11 cuenta lo mismo que el
 * BLUEPRINT. Un cambio que descuadre cualquiera de ellos falla aquí nombrando cuál.
 */
import { existsSync, readFileSync } from "node:fs";
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

  it("cuenta 34 construidas, ninguna con otro alcance, 3 en construcción y ninguna descartada, y la nota lo dice igual", () => {
    const cuenta = (estado: RegExp) =>
      filas.filter((f) => estado.test(f[2]!)).length;
    expect({
      construidas: cuenta(/^construida$/),
      otroAlcance: cuenta(/^construida con otro alcance$/),
      enConstruccion: cuenta(/^en construcción \(S\d+\)$/),
      descartadas: cuenta(/descartada/),
    }).toEqual({
      construidas: 34,
      otroAlcance: 0,
      enConstruccion: 3,
      descartadas: 0,
    });
    expect(seccion).toContain(
      "<strong>34</strong> construidas, <strong>0</strong> construidas con otro alcance",
    );
    expect(seccion).toContain("<strong>3</strong> en construcción");
    expect(seccion).toContain("<strong>0</strong> descartadas");
  });

  it("lo que falta dice en qué sprint llega (S20 o S21)", () => {
    for (const f of filas) {
      if (/^en construcción/.test(f[2]!))
        expect(f[2], `fila ${f[1]}`).toMatch(/\(S(20|21)\)/);
      if (f[2] === "construida con otro alcance")
        expect(f[3], `fila ${f[1]}`).toMatch(/Falta: .*S(20|21)/);
    }
  });

  it("el export no nombra ninguna descartada: nada se descarta sin una decisión escrita del usuario", () => {
    expect(exportado.funcionalidades.descartadas).toEqual([]);
  });

  it("el total del export es 54 de Probeta + 19 del Protocolo, y los grupos suman el total", () => {
    const ids = exportado.funcionalidades.grupos.flatMap((g) =>
      g.features.map((f) => f.id),
    );
    expect(ids).toHaveLength(exportado.funcionalidades.total);
    expect(exportado.funcionalidades.total).toBe(73);
    expect(ids.filter((id) => /^L\d+$/.test(id))).toHaveLength(19);
    expect(ids.length - 19).toBe(54);
    expect(blueprint).toContain("<strong>73</strong>");
    expect(blueprint).toContain("54 de Probeta y 19 de Protocolo DS");
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
    "t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8",
    "u1", "u2", "u3",
    "r1", "r2", "r3", "r4", "r5", "s5", "r6", "u4", "r7", "s6", "u5", "r8", "r9", "r10", "r11",
  ];

  it("lista 37 paradas, en el orden en que se recorren, y cada una tiene su casilla", () => {
    expect(paradas).toEqual(ORDEN);
    for (const id of paradas)
      expect(guia, `casilla «${id}»`).toContain(
        `<input type="checkbox" id="${id}">`,
      );
  });

  it("los chips «N de 37» van del 1 al 37 sin huecos ni repetidos, y la parada N de la lista lleva el chip N", () => {
    expect(chips.map((c) => Number(c[1])).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 37 }, (_, i) => i + 1),
    );
    expect(new Set(chips.map((c) => c[2]))).toEqual(new Set(["37"]));
    for (const [i, id] of paradas.entries()) {
      const casilla = guia.indexOf(`<input type="checkbox" id="${id}">`);
      const chip = guia.indexOf(`Ensayo · ${i + 1} de 37`, casilla);
      const siguiente = guia.indexOf("</li>", casilla);
      expect(chip, `parada ${i + 1} (${id}) sin su chip`).toBeGreaterThan(-1);
      expect(chip).toBeLessThan(siguiente);
    }
  });

  it("los bloques R (r1 a r11), S (s1 a s6), T (t1 a t8) y U (u1 a u5) están, los filtros existen y la memoria de las casillas es del S19", () => {
    for (let n = 1; n <= 11; n++) expect(guia).toContain(`id="r${n}"`);
    for (let n = 1; n <= 6; n++) expect(guia).toContain(`id="s${n}"`);
    for (let n = 1; n <= 8; n++) expect(guia).toContain(`id="t${n}"`);
    for (let n = 1; n <= 5; n++) expect(guia).toContain(`id="u${n}"`);
    expect(guia).not.toContain('id="r12"');
    expect(guia).not.toContain('id="s7"');
    expect(guia).not.toContain('id="t9"');
    expect(guia).not.toContain('id="u6"');
    expect(guia).toContain('data-filtro="ensayo"');
    expect(guia).toContain('data-filtro="s19"');
    expect(guia).toContain('data-filtro="s18"');
    expect(guia).toContain('data-filtro="s17"');
    expect(guia).toContain('filtro === "ensayo"');
    expect(guia).toContain('var CLAVE = "guia-ds:s19:"');
    expect(guia).toContain("v16 (acumulativa S1–S19)");
  });

  it("los tres libros que la parada T2 manda cargar existen en el kit", () => {
    for (const libro of [
      "libro-con-clave.xlsx",
      "libro-antiguo.xls",
      "libro-danado.xlsx",
    ])
      expect(
        existsSync(`docs/kit-de-prueba/xlsx/${libro}`),
        libro,
      ).toBe(true);
  });

  it("el tiempo declarado en la caja es la suma de los «unos N min» de las paradas", () => {
    const minutos = [...caja.matchAll(/Unos (\d+) min/g)].map((m) =>
      Number(m[1]),
    );
    expect(minutos).toHaveLength(37);
    const total = minutos.reduce((a, b) => a + b, 0);
    expect(caja).toContain(`unos ${Math.round(total / 10) * 10} minutos`);
  });
});

describe("guía: lo que dicen las paradas es lo que la app dice", () => {
  it("la parada R11 cuenta lo mismo que la tabla del BLUEPRINT (34 construidas, ninguna con otro alcance, 3 en construcción)", () => {
    const r11 = guia.slice(
      guia.indexOf('<input type="checkbox" id="r11">'),
      guia.indexOf("</li>", guia.indexOf('<input type="checkbox" id="r11">')),
    );
    expect(r11).toContain(
      "34 construidas, ninguna construida con otro alcance, 3 en construcción",
    );
    expect(r11).not.toContain("26 construidas");
  });

  it("los botones y textos que el bloque U manda pulsar existen en la app (nada inventado)", () => {
    const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as Record<string, unknown>;
    const simulador = JSON.parse(readFileSync("messages/simulador.es.json", "utf8")) as Record<string, unknown>;
    const reglas = JSON.parse(readFileSync("messages/reglas.es.json", "utf8")) as Record<string, unknown>;
    const vigilancia = JSON.parse(readFileSync("messages/vigilancia.es.json", "utf8")) as Record<string, unknown>;
    const etapa10 = JSON.parse(readFileSync("messages/etapas/etapa10.es.json", "utf8")) as Record<string, unknown>;
    const todos = JSON.stringify({ es, simulador, reglas, vigilancia, etapa10 });
    for (const texto of [
      "Puntuar otro CSV",
      "Simular",
      "Ver el modelo en reglas",
      "Descargar las reglas (.txt)",
      "Descargar el SQL (.sql)",
      "Guardar el ganador como .probeta.json",
      "Un modelo guardado desde el Protocolo DS",
      "Vigilar el desempeño",
    ])
      expect(todos, `«${texto}»`).toContain(texto);
    const u = guia.slice(guia.indexOf("BLOQUE U"), guia.indexOf('<div class="promesa">'));
    expect(u).not.toContain("Probar con otro archivo");
  });
});

describe("ningún marcador de relleno queda escrito en los documentos", () => {
  it("el BLUEPRINT, la guía, el brochure y el manual no llevan un «@@» pendiente (auditoría H-09, S18)", () => {
    for (const [nombre, texto] of Object.entries({ blueprint, guia, manual }))
      expect(texto, nombre).not.toMatch(/@@\w*@@/);
  });
});

describe("manual: lo que el S17, el S18 y el S19 construyeron está contado", () => {
  it("trae las tres secciones del S19, sus términos, sus preguntas frecuentes y su fila del historial", () => {
    for (const seccion of [
      "### ¿Qué pasaría si? · desde Sprint 019",
      "### El modelo en reglas · desde Sprint 019",
      "### Vigilar el desempeño y llevarte el ganador del Protocolo · desde Sprint 019",
    ])
      expect(manual, seccion).toContain(seccion);
    for (const termino of [
      "**Costo esperado**",
      "**Fidelidad (del modelo en reglas)**",
      "**Vigilar el desempeño**",
    ])
      expect(manual, termino).toContain(termino);
    expect(manual).toContain("**¿El «¿qué pasaría si?» me dice qué pasaría de verdad?**");
    expect(manual).toMatch(/\| 019 {4}\| Del modelo a la decisión/);
  });

  it("trae las secciones del S18, sus términos, sus preguntas frecuentes y su fila del historial", () => {
    for (const seccion of [
      "### Traer un Excel · desde Sprint 018",
      "### Datos personales y plan de limpieza · desde Sprint 018",
      "### Entender los datos y confiar en la cifra · desde Sprint 018",
    ])
      expect(manual, seccion).toContain(seccion);
    for (const termino of [
      "**Plan de limpieza**",
      "**Margen de error (intervalo del 95 %)**",
    ])
      expect(manual, termino).toContain(termino);
    expect(manual).toContain("**¿Puedo traer un Excel?**");
    expect(manual).toMatch(/\| 018 {4}\| Probeta completa/);
  });

  it("trae las dos secciones del S17, sus términos, sus preguntas frecuentes y su fila del historial", () => {
    expect(manual).toContain("### Estrésalo: ¿cuánto aguanta tu modelo? · desde Sprint 017");
    expect(manual).toContain("### Llévatelo: la receta, el puntuador y el servicio · desde Sprint 017");
    for (const termino of ["**Prueba de estrés**", "**Receta reproducible**", "**Puntuador portátil**"])
      expect(manual, termino).toContain(termino);
    expect(manual).toContain("¿Probeta publica mi modelo o lo despliega?");
    expect(manual).toMatch(/\| 017 {4}\| Estrésalo/);
  });
});
