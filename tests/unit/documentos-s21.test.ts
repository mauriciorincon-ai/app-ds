// @vitest-environment node
/**
 * S21 (hereda el gate del S20, del S19, del S18, del S17 y del S16, auditoría H-32) — los números que los documentos del hito cuentan
 * a mano tienen su gate: la tabla de «las 37 de la VISION» del BLUEPRINT (37 + 0 + 0 + 0), el export sin descartadas que el usuario no
 * haya descartado por escrito (77 = 58 de Probeta + 19 del Protocolo), y la ruta «Ensayo general del H-2» de la guía (44 paradas, cada
 * una con su casilla y su chip «N de 44», sin huecos ni repetidos y en el orden en que se recorren, repartidas en cinco tandas cuyos
 * minutos suman lo declarado). La parada R11 cuenta lo mismo que el BLUEPRINT. Lo que las paradas W1 y W2 prometen que la app dice (la
 * consulta en palabras, la frase del resultado, los avisos) es lo que el motor da sobre el kit. Un cambio que descuadre cualquiera de
 * ellos falla aquí nombrando cuál.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { correr, validar } from "@/engine/consulta";
import { leerPregunta } from "@/engine/pregunta";
import { enPalabras, fraseResultado } from "@/lib/narration/consulta";
import { catalogoDelKit } from "../fixtures/preguntas/ayudas";

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
const json = (ruta: string) =>
  JSON.parse(readFileSync(ruta, "utf8")) as Record<string, unknown>;

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
  const fila = (n: number) => filas.find((f) => Number(f[1]) === n)!;

  it("tiene 37 filas numeradas del 1 al 37", () => {
    expect(desde).toBeGreaterThan(0);
    expect(filas.map((f) => Number(f[1]))).toEqual(
      Array.from({ length: 37 }, (_, i) => i + 1),
    );
  });

  it("cuenta 37 construidas, ninguna con otro alcance, ninguna en construcción y ninguna descartada, y la nota lo dice igual", () => {
    const cuenta = (estado: RegExp) =>
      filas.filter((f) => estado.test(f[2]!)).length;
    expect({
      construidas: cuenta(/^construida$/),
      otroAlcance: cuenta(/^construida con otro alcance$/),
      enConstruccion: cuenta(/^en construcción/),
      descartadas: cuenta(/descartada/),
    }).toEqual({
      construidas: 37,
      otroAlcance: 0,
      enConstruccion: 0,
      descartadas: 0,
    });
    expect(seccion).toContain(
      "<strong>37</strong> construidas, <strong>0</strong> construidas con otro alcance",
    );
    expect(seccion).toContain("<strong>0</strong> en construcción");
    expect(seccion).toContain("<strong>0</strong> descartadas");
  });

  it("la fila 15, «Conversa con tus datos», está construida y dice lo que hace y lo que no (el S21)", () => {
    expect(fila(15)[2]).toBe("construida");
    expect(fila(15)[3]).toMatch(/\(S21, ADR 030\)/);
    expect(fila(15)[3]).toMatch(/sin modelo de lenguaje/);
    expect(fila(15)[3]).toMatch(/antes de correrla/);
    expect(fila(15)[3]).toMatch(/no se conecta a una base externa/);
    // el lote lo cierra una sola vez: nada «llega en el S21» a estas alturas
    for (const f of filas)
      expect(f[3], `fila ${f[1]}`).not.toMatch(/Falta: .*S21/);
  });

  it("la fila 6 dice la decisión del usuario sobre las ausencias por tarea de la liga", () => {
    expect(fila(6)[2]).toBe("construida");
    expect(fila(6)[3]).toMatch(/Decisión del usuario \(2026-10-26/);
    expect(fila(6)[3]).toMatch(/Lasso y la regresión lineal no clasifican/);
    expect(fila(6)[3]).toMatch(/Naive Bayes no estiman/);
  });

  it("las filas 17, 18 y 20 son construidas y dicen lo que el S20 hizo (y lo que no está prometido)", () => {
    expect(fila(17)[2]).toBe("construida");
    expect(fila(17)[3]).toMatch(
      /cópula gaussiana[\s\S]*semilla fija[\s\S]*no compartir/,
    );
    expect(fila(18)[2]).toBe("construida");
    expect(fila(18)[3]).toMatch(/origen móvil[\s\S]*mejor método simple/);
    expect(fila(18)[3]).toMatch(/no está prometido/);
    expect(fila(20)[2]).toBe("construida");
    expect(fila(20)[3]).toMatch(/modelo importado[\s\S]*ganador del Protocolo/);
    // el pronosticador como archivo es «no prometido», no «descartado»
    expect(seccion + blueprint).not.toMatch(/pronosticador[^<]*descartad/i);
  });

  it("«Lo que queda para H-3 y H-4» ya no nombra ninguna de las 37 como pendiente", () => {
    const queda = blueprint.slice(
      hasta,
      blueprint.indexOf("<h2>Historial del blueprint</h2>"),
    );
    expect(queda).not.toContain("Lo que falta de las 37");
    expect(queda).not.toMatch(/en construcci[óo]n/);
  });

  it("el export no nombra ninguna descartada: nada se descarta sin una decisión escrita del usuario", () => {
    expect(exportado.funcionalidades.descartadas).toEqual([]);
  });

  it("el total del export es 58 de Probeta + 19 del Protocolo, y los grupos suman el total", () => {
    const ids = exportado.funcionalidades.grupos.flatMap((g) =>
      g.features.map((f) => f.id),
    );
    expect(ids).toHaveLength(exportado.funcionalidades.total);
    expect(exportado.funcionalidades.total).toBe(77);
    expect(ids.filter((id) => /^L\d+$/.test(id))).toHaveLength(19);
    expect(ids.length - 19).toBe(58);
    expect(ids).toContain("D12");
    expect(blueprint).toContain("<strong>77</strong>");
    expect(blueprint).toContain("58 de Probeta y 19 de Protocolo DS");
    expect(readFileSync("docs/BROCHURE.html", "utf8")).toContain(
      'data-contador="77"',
    );
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
    "f3",
    "g4",
    "g5",
    "h2",
    "i2",
    "f8",
    "e6",
    "s1",
    "s2",
    "s3",
    "s4",
    "t1",
    "t2",
    "t3",
    "t4",
    "t5",
    "t6",
    "t7",
    "t8",
    "u1",
    "u2",
    "u3",
    "v1",
    "v2",
    "v3",
    "v4",
    "w1",
    "w2",
    "r1",
    "r2",
    "r3",
    "r4",
    "r5",
    "s5",
    "r6",
    "u4",
    "r7",
    "s6",
    "u5",
    "v5",
    "r8",
    "r9",
    "r10",
    "r11",
  ];

  it("lista 44 paradas, en el orden en que se recorren, y cada una tiene su casilla", () => {
    expect(paradas).toEqual(ORDEN);
    for (const id of paradas)
      expect(guia, `casilla «${id}»`).toContain(
        `<input type="checkbox" id="${id}">`,
      );
  });

  it("los chips «N de 44» van del 1 al 44 sin huecos ni repetidos, y la parada N de la lista lleva el chip N", () => {
    expect(chips.map((c) => Number(c[1])).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 44 }, (_, i) => i + 1),
    );
    expect(new Set(chips.map((c) => c[2]))).toEqual(new Set(["44"]));
    for (const [i, id] of paradas.entries()) {
      const casilla = guia.indexOf(`<input type="checkbox" id="${id}">`);
      const chip = guia.indexOf(`Ensayo · ${i + 1} de 44`, casilla);
      const siguiente = guia.indexOf("</li>", casilla);
      expect(chip, `parada ${i + 1} (${id}) sin su chip`).toBeGreaterThan(-1);
      expect(chip).toBeLessThan(siguiente);
    }
  });

  it("los bloques R (r1 a r11), S (s1 a s6), T (t1 a t8), U (u1 a u5), V (v1 a v5) y W (w1 y w2) están, los filtros existen y la memoria de las casillas es del S21", () => {
    for (let n = 1; n <= 11; n++) expect(guia).toContain(`id="r${n}"`);
    for (let n = 1; n <= 6; n++) expect(guia).toContain(`id="s${n}"`);
    for (let n = 1; n <= 8; n++) expect(guia).toContain(`id="t${n}"`);
    for (let n = 1; n <= 5; n++) expect(guia).toContain(`id="u${n}"`);
    for (let n = 1; n <= 5; n++) expect(guia).toContain(`id="v${n}"`);
    for (let n = 1; n <= 2; n++) expect(guia).toContain(`id="w${n}"`);
    expect(guia).not.toContain('id="r12"');
    expect(guia).not.toContain('id="s7"');
    expect(guia).not.toContain('id="t9"');
    expect(guia).not.toContain('id="u6"');
    expect(guia).not.toContain('id="v6"');
    expect(guia).not.toContain('id="w3"');
    expect(guia).toContain('data-filtro="ensayo"');
    expect(guia).toContain('data-filtro="s21"');
    expect(guia).toContain('data-filtro="s20"');
    expect(guia).toContain('data-filtro="s19"');
    expect(guia).toContain('data-filtro="s18"');
    expect(guia).toContain('data-filtro="s17"');
    expect(guia).toContain('filtro === "ensayo"');
    expect(guia).toContain('var CLAVE = "guia-ds:s21:"');
    expect(guia).toContain("v18 (acumulativa S1–S21)");
    expect(guia).toContain('data-origen="s21"');
    expect(guia).toContain(".o-s21 {");
  });

  it("los tres libros que la parada T2 manda cargar existen en el kit", () => {
    for (const libro of [
      "libro-con-clave.xlsx",
      "libro-antiguo.xls",
      "libro-danado.xlsx",
    ])
      expect(existsSync(`docs/kit-de-prueba/xlsx/${libro}`), libro).toBe(true);
  });

  it("el tiempo declarado en la caja es la suma de los «unos N min» de las paradas", () => {
    const minutos = [...caja.matchAll(/Unos (\d+) min/g)].map((m) =>
      Number(m[1]),
    );
    expect(minutos).toHaveLength(44);
    const total = minutos.reduce((a, b) => a + b, 0);
    expect(caja).toContain(`unos ${Math.round(total / 10) * 10} minutos`);
    expect(total).toBe(180);
  });

  it("las cinco tandas cubren las 44 paradas sin huecos ni solapes, y los minutos de cada una son la suma de los de sus paradas", () => {
    const cabezas = [
      ...caja.matchAll(
        /<strong>Tanda (\d) · [^<]+<\/strong> — paradas (\d+) a (\d+), unos (\d+) minutos\./g,
      ),
    ];
    expect(cabezas.map((c) => Number(c[1]))).toEqual([1, 2, 3, 4, 5]);
    let siguiente = 1;
    let suma = 0;
    for (const c of cabezas) {
      const [, , a, b, declarados] = c.map(Number);
      expect(a, `la tanda ${c[1]} empieza donde acabó la anterior`).toBe(
        siguiente,
      );
      siguiente = b! + 1;
      // los <li> del <ol start="a"> que sigue a la cabeza
      const desde = caja.indexOf(c[0]);
      const ol = caja.slice(desde, caja.indexOf("</ol>", desde));
      expect(ol, `la lista de la tanda ${c[1]} empieza en ${a}`).toContain(
        `start="${a}"`,
      );
      const minutos = [...ol.matchAll(/Unos (\d+) min/g)].map((m) =>
        Number(m[1]),
      );
      expect(minutos, `paradas de la tanda ${c[1]}`).toHaveLength(b! - a! + 1);
      const t = minutos.reduce((x, y) => x + y, 0);
      expect(t, `minutos de la tanda ${c[1]}`).toBe(declarados);
      suma += t;
    }
    expect(siguiente - 1).toBe(44);
    expect(suma).toBe(180);
  });
});

describe("guía: lo que dicen las paradas es lo que la app dice", () => {
  it("la parada R11 cuenta lo mismo que la tabla del BLUEPRINT (37 construidas, ninguna con otro alcance, ninguna en construcción)", () => {
    const r11 = guia.slice(
      guia.indexOf('<input type="checkbox" id="r11">'),
      guia.indexOf("</li>", guia.indexOf('<input type="checkbox" id="r11">')),
    );
    expect(r11).toContain(
      "<strong>37 construidas</strong>, ninguna construida con otro alcance, ninguna en construcción",
    );
    expect(r11).not.toContain("36 construidas");
    expect(r11).not.toContain("26 construidas");
    expect(r11).not.toContain("34 construidas");
  });

  it("la parada E6 cuenta las funcionalidades del brochure (77)", () => {
    const e6 = guia.slice(
      guia.indexOf('<input type="checkbox" id="e6">'),
      guia.indexOf("</li>", guia.indexOf('<input type="checkbox" id="e6">')),
    );
    expect(e6).toMatch(/Ensayo · 7 de 44/);
    const caja = guia.slice(
      guia.indexOf('id="ensayo"'),
      guia.indexOf('<div class="kit">'),
    );
    expect(caja).toContain("77 funcionalidades");
    expect(caja).not.toContain("76 funcionalidades");
  });

  it("los botones y textos que el bloque U manda pulsar existen en la app (nada inventado)", () => {
    const es = json("messages/es.json");
    const simulador = json("messages/simulador.es.json");
    const reglas = json("messages/reglas.es.json");
    const vigilancia = json("messages/vigilancia.es.json");
    const etapa10 = json("messages/etapas/etapa10.es.json");
    const todos = JSON.stringify({
      es,
      simulador,
      reglas,
      vigilancia,
      etapa10,
    });
    for (const texto of [
      "Puntuar otro CSV",
      "Simular",
      "Armar las reglas",
      "Reglas a partir del modelo",
      "Descargar las reglas (.txt)",
      "Descargar el SQL (.sql)",
      "Guardar el ganador como .probeta.json",
      "Un modelo guardado desde el Protocolo DS",
      "Vigilar el desempeño",
      "Cargar modelo guardado",
    ])
      expect(todos, `«${texto}»`).toContain(texto);
    const u = guia.slice(guia.indexOf("BLOQUE U"), guia.indexOf("BLOQUE V"));
    expect(u).not.toContain("Probar con otro archivo");
    // AUDITORÍA A-05: el botón de la portada que abre un archivo guardado se llama como se llama, no «Importar un modelo»
    expect(u).toContain("Cargar modelo guardado");
    expect(u).not.toContain("Importar un modelo");
    // S21 (19-16): antes de armar las reglas la tarjeta no se llama «El modelo en reglas»
    expect(u).toContain("Reglas a partir del modelo");
    expect(u).not.toContain("Ver el modelo en reglas");
  });
});

describe("guía: los botones y textos que el bloque V manda pulsar existen en la app (nada inventado)", () => {
  it("cada texto citado por la V1 a la V5 está en un diccionario", () => {
    const leer = (ruta: string) => readFileSync(ruta, "utf8");
    const todos = [
      "messages/es.json",
      "messages/pronostico.es.json",
      "messages/gemelo.es.json",
      "messages/reglas.es.json",
      "messages/etapas/etapa10.es.json",
    ]
      .map(leer)
      .join("\n");
    for (const texto of [
      "Con una fecha: pronosticar una serie",
      "Pronosticar",
      "Ver el pronóstico en una tabla",
      "Descargar el pronóstico (.csv)",
      "Supera al mejor método simple",
      "No supera a un método simple",
      "Ningún método le gana a la media histórica",
      "Completarlos con la recta entre sus vecinos",
      "no se rellenan solos",
      "Un gemelo sintético de tus datos",
      "Generar el gemelo",
      "Descargar el gemelo (.csv)",
      "Se puede compartir",
      "No viajan al gemelo, y por eso:",
      "marcada como posible dato personal",
      "Ninguna fila sintética es idéntica a una tuya",
      "Semilla fija: {semilla}",
      "Armar las reglas",
      "Puntuar otro CSV",
      "Exportar modelo",
      "Cargar modelo guardado",
      "Usar este modelo",
      "Las reglas del ganador",
      "Elegir un CSV con filas",
      "Aquí las reglas nunca se miden contra la verdad",
      "Reglas armadas con las filas de",
      "Frente a la verdad, las reglas aciertan",
      "Tu archivo no trae el resultado real",
    ])
      expect(todos, `«${texto}»`).toContain(texto);
    const v = guia.slice(guia.indexOf("BLOQUE V"), guia.indexOf("BLOQUE W"));
    expect(v.length).toBeGreaterThan(1000);
    // los archivos del kit que la V manda cargar existen
    for (const archivo of [
      "serie-ventas-mensual.csv",
      "serie-ruido.csv",
      "serie-ventas-con-huecos.csv",
      "marketing-filas-para-reglas.csv",
      "marketing-resultados-sin-cambio.csv",
      "clientes-con-datos-personales.csv",
      "credito-fuga-plantada.csv",
    ]) {
      expect(v, archivo).toContain(archivo);
      expect(existsSync(`docs/kit-de-prueba/${archivo}`), archivo).toBe(true);
    }
  });
});

describe("guía: el bloque W (Pregúntale a tus datos) promete lo que la app dice", () => {
  const w = guia.slice(
    guia.indexOf("BLOQUE W"),
    guia.indexOf('<div class="promesa">'),
  );
  const pregunta = json("messages/pregunta.es.json").pregunta as Record<
    string,
    Record<string, unknown> & string
  >;
  const preguntaEn = json("messages/pregunta.en.json").pregunta as Record<
    string,
    Record<string, unknown> & string
  >;
  const cat = catalogoDelKit("ventas-por-region.csv");
  const consulta = (texto: string) => {
    const l = leerPregunta(texto, cat);
    if (l.tipo !== "consulta") throw new Error(`no es una consulta: ${texto}`);
    return l;
  };

  it("cada botón y texto que la W1 y la W2 citan está en el diccionario, en español y en inglés", () => {
    const es = JSON.stringify(pregunta);
    const en = JSON.stringify(preguntaEn);
    for (const texto of [
      "Pregúntale a tus datos",
      "Entender la pregunta",
      "Correr la consulta",
      "Prueba con:",
      "Ver el resultado en una tabla",
      "Descargar el resultado (.csv)",
      "Así entendí tu pregunta",
      "Antes de correr, esto es lo que comprobé",
      "Antes de seguir, necesito que elijas",
      "propuesto",
      "Revisando si hay datos personales",
    ])
      expect(es, `«${texto}»`).toContain(texto);
    for (const texto of [
      "Ask your data",
      "Understand the question",
      "Run the query",
      "proposed",
    ])
      expect(en, `«${texto}»`).toContain(texto);
    for (const texto of [
      "Pregúntale a tus datos",
      "Entender la pregunta",
      "Correr la consulta",
      "Prueba con:",
      "Ver el resultado en una tabla",
      "Descargar el resultado (.csv)",
      "Así entendí tu pregunta",
      "Antes de correr, esto es lo que comprobé",
      "Antes de seguir, necesito que elijas",
      "Ask your data",
      "Understand the question",
      "Run the query",
    ])
      expect(w, `la guía cita «${texto}»`).toContain(texto);
  });

  it("la W1: la consulta en palabras, los avisos y la frase son los que el motor da sobre ventas-por-region.csv", () => {
    const l = consulta("ventas del último trimestre por región");
    expect(w).toContain(enPalabras(l.plan, "es"));
    expect(l.propuestos).toEqual(["agregacion"]);
    const validaciones = validar(l.plan, cat);
    const r = correr(l.plan, cat);
    expect(w).toContain(fraseResultado(l.plan, cat, r, "es").texto);
    // los renglones de la comprobación que la guía cita, con las cifras de la tabla
    const ventanaIncompleta = validaciones.find(
      (v) => v.clave === "ventana_incompleta",
    )!;
    expect(w).toContain(
      `la tabla llega hasta el ${ventanaIncompleta.params.hasta}, así que ese último periodo está incompleto`,
    );
    const filasOk = validaciones.find((v) => v.clave === "filas_ok")!;
    expect(w).toContain(
      `${filasOk.params.n} de ${filasOk.params.total} filas entran a la consulta`,
    );
    const sinValor = validaciones.find((v) => v.clave === "filas_sin_valor")!;
    expect(w).toContain(
      `${sinValor.params.n} filas no tienen valor en la cifra que se calcula y no entran`,
    );
    // las dos puntas que la guía nombra
    expect(r.grupos[0]!.etiqueta).toBe("norte");
    expect(r.grupos[r.grupos.length - 1]!.etiqueta).toBe("este");
  });

  it("la W2: «ventas del norte» pregunta de qué columna; «contienen» se dice; «hola qué tal» no se entiende; por mes es una línea", () => {
    const norte = leerPregunta("ventas del norte", cat);
    expect(norte.tipo).toBe("pregunta");
    if (norte.tipo === "pregunta") {
      expect(norte.abiertas.map((a) => a.id)).toEqual(["valor:norte"]);
      expect(norte.abiertas[0]!.opciones.map((o) => o.valor).sort()).toEqual([
        "bodega",
        "region",
      ]);
    }
    const contienen = consulta("ventas que contienen premium");
    expect(contienen.noLeidas).toEqual(["contienen"]);
    expect(enPalabras(contienen.plan, "es")).toContain(
      "«producto» es «premium»",
    );
    expect(w).toContain(
      "No leí: contienen. La consulta de abajo no usa esas palabras.",
    );
    const nada = leerPregunta("hola qué tal", cat);
    expect(nada.tipo).toBe("no-entendi");
    expect(w).toContain(String(pregunta.no_entendi!.nada));
    const mes = consulta("promedio de unidades por mes");
    expect(mes.plan.agrupar).toMatchObject({ tipo: "tiempo", periodo: "mes" });
    expect(w).toContain(
      fraseResultado(mes.plan, cat, correr(mes.plan, cat), "es").texto,
    );
    // el inglés del final: la misma consulta, con las mismas cifras, sobre sales-by-region.csv
    const catEn = catalogoDelKit("sales-by-region.csv");
    const en = leerPregunta("sales by region last quarter", catEn);
    expect(en.tipo).toBe("consulta");
    if (en.tipo === "consulta") {
      const frase = fraseResultado(
        en.plan,
        catEn,
        correr(en.plan, catEn),
        "en",
      ).texto;
      expect(frase).toContain("102,515");
      expect(enPalabras(en.plan, "en")).toMatch(
        /^I will calculate the sum of «sales_usd», split by «region», in the last quarter of the table/,
      );
    }
  });

  it("los archivos del kit que la W manda cargar existen", () => {
    for (const archivo of ["ventas-por-region.csv", "sales-by-region.csv"]) {
      expect(w, archivo).toContain(archivo);
      expect(existsSync(`docs/kit-de-prueba/${archivo}`), archivo).toBe(true);
    }
  });
});

describe("frases caducadas: ningún texto dice que vigilar el desempeño no está (S19, AUDITORÍA A-02/A-05/A-19), que el pronóstico o las reglas con filas no están (S20) ni que «conversa con tus datos» falta (S21)", () => {
  // Cada patrón es una afirmación que un sprint volvió falsa o el nombre de un control que no existe. Se barren el manual, la guía, el
  // glosario, el README, la constitución y TODOS los diccionarios (es y en), incluidos los de las etapas.
  const textos: Record<string, string> = {
    manual,
    guia,
    blueprint,
    brochure: readFileSync("docs/BROCHURE.html", "utf8"),
    exportado: readFileSync("docs/brochure-export.json", "utf8"),
    glosario: readFileSync("src/content/glosario.ts", "utf8"),
    readme: readFileSync("README.md", "utf8"),
    constitucion: readFileSync("CLAUDE.md", "utf8"),
  };
  const recorre = (dir: string): string[] =>
    readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".json"))
      .map((e) => `${e.parentPath}/${e.name}`);
  for (const ruta of recorre("messages"))
    textos[ruta] = readFileSync(ruta, "utf8");

  const CADUCAS: [RegExp, string][] = [
    [/no est[áa] en esta versi[óo]n/i, "«no está en esta versión»"],
    // «hacen falta los resultados nuevos y el modelo guardado» a secas (con punto) dice que falta algo que ya existe; la frase que sigue
    // con «desde el Sprint 19 …» o con «:» sí es cierta y no se prohíbe
    [
      /hacen falta los resultados nuevos y el modelo guardado\./i,
      "«hacen falta los resultados nuevos y el modelo guardado.» sin decir que ya se hace",
    ],
    [
      /needs the new outcomes and the saved model\./i,
      "«needs the new outcomes and the saved model.» sin decir que ya se hace",
    ],
    [
      /(pide|needs) (los )?(resultados nuevos|new outcomes)[^.]*(no est[áa] aqu[íi]|isn't here)/i,
      "vigilar el desempeño «no está aquí»",
    ],
    [
      /aqu[íi] el modelo predice, no se eval[úu]a/i,
      "«aquí el modelo predice, no se evalúa»",
    ],
    [
      /Usar un modelo guardado|Use a saved model/,
      "«Usar un modelo guardado» (el botón es «Cargar modelo guardado»)",
    ],
    // S20: lo que el sprint volvió falso
    [/el pron[óo]stico llega con el S20/i, "«el pronóstico llega con el S20»"],
    [
      /Las fechas hoy solo parten por tiempo/i,
      "«las fechas hoy solo parten por tiempo»",
    ],
    [
      /Solo para un modelo entrenado en la sesi[óo]n/i,
      "«solo para un modelo entrenado en la sesión»",
    ],
    [
      /solo para un modelo \*\*entrenado en esta sesi[óo]n\*\*/i,
      "«solo para un modelo entrenado en esta sesión» (el manual)",
    ],
    [
      /se arman en la corrida donde lo entrenaste/i,
      "«las reglas se arman en la corrida donde lo entrenaste» (sin decir que también con un archivo)",
    ],
    [
      /the rules are built in the run where you trained it/i,
      "«the rules are built in the run where you trained it» (sin decir que también con un archivo)",
    ],
    [
      /un modelo \*\*importado\*\*\s+o el ganador del Protocolo no lo tienen/i,
      "«un modelo importado o el ganador del Protocolo no lo tienen» (el botón de reglas)",
    ],
    [
      /No rules for the Protocol, for imported models/i,
      "«no rules for the Protocol, for imported models» (el ADR 027)",
    ],
    [
      /(no|sin) (hay )?(datos )?sint[ée]ticos? (todav[íi]a|a[úu]n)|synthetic data (is )?(not|n't) (here )?yet/i,
      "«todavía no hay datos sintéticos»",
    ],
    // S20, auditoría M-5 y M-6: el aviso de fechas y la ayuda del gemelo decían lo que el propio sprint volvió falso
    [
      /las fechas no se usan para el an[áa]lisis|no entran al an[áa]lisis: la app no parte|(don't|do not) enter the analysis/i,
      "«las fechas no se usan para el análisis» (con una fecha y un número se pronostica una serie)",
    ],
    [
      /ninguna fila es una fila tuya|no row is a row of yours|y ninguna fila tuya|with none of your rows/i,
      "«ninguna fila es una fila tuya» sin decir que las idénticas se vuelven a sacar y que el informe cuenta las que queden",
    ],
    [
      /(en esta versi[óo]n|in this version)[^.]{0,40}(se nombran|se deja fuera|named and left out)/i,
      "«en esta versión» para las fechas del gemelo (es una decisión, no una promesa)",
    ],
    // S21: «conversa con tus datos» se construyó; ni una constitución, ni una tabla, ni una guía lo prometen ya
    [
      /en construcci[óo]n \(S21\)/,
      "«en construcción (S21)» (la 15 está construida)",
    ],
    [
      /el S21 construye «conversa con tus datos»/i,
      "«el S21 construye «conversa con tus datos»» (la 15 está construida)",
    ],
    [
      /lo que a[úu]n no existe \(el S21\)/i,
      "«lo que aún no existe (el S21)» (el export)",
    ],
    [
      /(una|1) en construcci[óo]n[^.]{0,60}la 15/i,
      "«una en construcción: la 15»",
    ],
    [
      /Ver el modelo en reglas/,
      "«Ver el modelo en reglas» (el botón se llama «Armar las reglas» desde el S21)",
    ],
  ];
  for (const [patron, que] of CADUCAS)
    it(`ningún documento ni diccionario dice ${que}`, () => {
      const hallados = Object.entries(textos)
        .filter(([, texto]) => patron.test(texto))
        .map(([nombre]) => nombre);
      expect(hallados, que).toEqual([]);
    });
});

describe("ningún marcador de relleno queda escrito en los documentos", () => {
  it("el BLUEPRINT, la guía, el brochure y el manual no llevan un «@@» pendiente (auditoría H-09, S18)", () => {
    for (const [nombre, texto] of Object.entries({ blueprint, guia, manual }))
      expect(texto, nombre).not.toMatch(/@@\w*@@/);
  });
});

describe("manual: lo que el S21 construyó está contado", () => {
  it("trae la sección de «Pregúntale a tus datos», sus términos, sus preguntas frecuentes y su fila del historial", () => {
    expect(manual).toContain("### Pregúntale a tus datos · desde Sprint 021");
    for (const termino of [
      "**Consulta**",
      "**SQL**",
      "**Propuesto**",
      "**No leí**",
    ])
      expect(manual, termino).toContain(termino);
    expect(manual).toContain(
      "**¿«Pregúntale a tus datos» usa inteligencia artificial?**",
    );
    expect(manual).toContain("**¿Y si la app entendió mal mi pregunta?**");
    expect(manual).toMatch(/\| 021 {4}\| Pregúntale a tus datos/);
    // lo que la sección promete es lo que el panel hace: nada de un modelo de lenguaje y nada que salga del navegador
    const seccion = manual.slice(
      manual.indexOf("### Pregúntale a tus datos · desde Sprint 021"),
      manual.indexOf("## Diccionario de términos"),
    );
    expect(seccion).toContain("No usa un modelo de lenguaje");
    expect(seccion).toContain("salen de tu computadora");
    expect(seccion).toContain("«Correr la consulta»");
  });

  it("la sección del S21 cita la frase de ejemplo tal como la da el motor sobre ventas-por-region.csv", () => {
    const cat = catalogoDelKit("ventas-por-region.csv");
    const l = leerPregunta("total de unidades por región", cat);
    if (l.tipo !== "consulta") throw new Error("no es una consulta");
    const frase = fraseResultado(l.plan, cat, correr(l.plan, cat), "es").texto;
    expect(manual).toContain(frase);
  });
});

describe("manual: lo que el S20 construyó está contado", () => {
  it("trae las dos secciones nuevas del S20, las reglas con tus filas, sus términos, sus preguntas frecuentes y su fila del historial", () => {
    for (const seccion of [
      "### Pronosticar una serie · desde Sprint 020",
      "### El gemelo sintético · desde Sprint 020",
    ])
      expect(manual, seccion).toContain(seccion);
    expect(manual).toContain("- **Con tus filas (desde Sprint 020):**");
    for (const termino of [
      "**Origen móvil**",
      "**Error relativo (MASE)**",
      "**Banda de pronóstico**",
      "**Gemelo sintético**",
      "**Cópula gaussiana**",
    ])
      expect(manual, termino).toContain(termino);
    expect(manual).toContain("**¿El pronóstico me dice lo que va a pasar?**");
    expect(manual).toContain("**¿Un gemelo sintético es anónimo?**");
    expect(manual).toMatch(/\| 020 {4}\| Proyectar y compartir/);
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
    expect(manual).toContain(
      "**¿El «¿qué pasaría si?» me dice qué pasaría de verdad?**",
    );
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
    expect(manual).toContain(
      "### Estrésalo: ¿cuánto aguanta tu modelo? · desde Sprint 017",
    );
    expect(manual).toContain(
      "### Llévatelo: la receta, el puntuador y el servicio · desde Sprint 017",
    );
    for (const termino of [
      "**Prueba de estrés**",
      "**Receta reproducible**",
      "**Puntuador portátil**",
    ])
      expect(manual, termino).toContain(termino);
    expect(manual).toContain("¿Probeta publica mi modelo o lo despliega?");
    expect(manual).toMatch(/\| 017 {4}\| Estrésalo/);
  });
});
