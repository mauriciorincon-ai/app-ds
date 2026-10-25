// @vitest-environment node
/**
 * S18 (ADR 025) — el lector de `.xlsx`. Dos fuentes de verdad: los libros que escribió openpyxl (un programa de terceros:
 * el kit de prueba y `tests/fixtures/xlsx/`) y libros mínimos armados aquí con el escritor ZIP del S17, que cubren lo que
 * openpyxl no escribe (cadenas en línea, errores, fórmulas con resultado, rutas absolutas, referencias ausentes).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { crearZip } from "@/lib/publica/zip";
import {
  isNullToken,
  limitarTabla,
  parseCsvWithLimits,
  parseNumber,
} from "@/lib/ds/csv";
import { leerXlsx, serieAIso } from "@/lib/ds/xlsx";

const leer = (ruta: string) => new Uint8Array(readFileSync(ruta));

const REL_HOJA =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet";
const libroMinimo = (
  hojaXml: string,
  extras: Record<string, string> = {},
  opciones: { workbookPr?: string; target?: string } = {},
) =>
  crearZip([
    {
      nombre: "xl/workbook.xml",
      datos: `<workbook><workbookPr${opciones.workbookPr ?? ""}/><sheets><sheet name="Hoja1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      nombre: "xl/_rels/workbook.xml.rels",
      datos: `<Relationships><Relationship Id="rId1" Type="${REL_HOJA}" Target="${opciones.target ?? "worksheets/sheet1.xml"}"/></Relationships>`,
    },
    {
      nombre: (opciones.target ?? "worksheets/sheet1.xml").replace(
        /^\/?(xl\/)?/,
        "xl/",
      ),
      datos: `<worksheet><sheetData>${hojaXml}</sheetData></worksheet>`,
    },
    ...Object.entries(extras).map(([nombre, datos]) => ({ nombre, datos })),
  ]);

describe("el kit de prueba en Excel carga igual que en CSV", () => {
  const carpeta = "docs/kit-de-prueba/xlsx";
  const archivos = readdirSync(carpeta).filter((f) => f.endsWith(".xlsx"));

  it("hay un libro por cada ejemplo del kit", () => {
    expect(archivos.length).toBeGreaterThanOrEqual(10);
  });

  // dos celdas son la misma si son el mismo número, la misma ausencia o el mismo texto
  function igual(a: string, b: string): boolean {
    if (isNullToken(a) && isNullToken(b) && a.trim() === "" && b.trim() === "")
      return true;
    const x = parseNumber(a);
    const y = parseNumber(b);
    if (x !== null && y !== null) return x === y;
    return a.trim() === b.trim();
  }

  it.each(archivos)("%s", async (archivo) => {
    const csv = readFileSync(
      join("docs/kit-de-prueba", archivo.replace(/\.xlsx$/, ".csv")),
      "utf8",
    );
    const esperado = parseCsvWithLimits(csv);
    if (!esperado.ok) throw new Error("el CSV del kit no parsea");
    const lectura = await leerXlsx(leer(join(carpeta, archivo)));
    if (!lectura.ok) throw new Error(`no abrió: ${lectura.error.kind}`);
    expect(lectura.hoja).toBe("Datos");
    expect(lectura.hojasIgnoradas).toBe(0);
    const tabla = limitarTabla(lectura.filas);
    if (!tabla.ok) throw new Error(`límites: ${tabla.error.kind}`);
    expect(tabla.table.headers).toEqual(esperado.table.headers);
    expect(tabla.table.rows).toHaveLength(esperado.table.rows.length);
    const distintas: string[] = [];
    esperado.table.rows.forEach((fila, r) =>
      fila.forEach((celda, c) => {
        const otra = tabla.table.rows[r]![c]!;
        if (!igual(celda, otra))
          distintas.push(`${r + 2}:${c + 1} «${celda}» ≠ «${otra}»`);
      }),
    );
    expect(distintas.slice(0, 5)).toEqual([]);
  });
});

describe("un libro con tipos mezclados escrito por openpyxl", () => {
  it("lee la primera hoja visible y dice cuántas ignora", async () => {
    const lectura = await leerXlsx(leer("tests/fixtures/xlsx/bordes.xlsx"));
    if (!lectura.ok) throw new Error(lectura.error.kind);
    expect(lectura.hoja).toBe("Datos"); // la primera está oculta
    expect(lectura.hojasIgnoradas).toBe(2);
    expect(lectura.filas[0]).toEqual([
      "nombre",
      "monto",
      "activo",
      "alta",
      "visita",
      "hora",
      "nota",
      "dispersa",
    ]);
  });

  it("textos, números, booleanos, fechas y horas salen como los vería un CSV", async () => {
    const lectura = await leerXlsx(leer("tests/fixtures/xlsx/bordes.xlsx"));
    if (!lectura.ok) throw new Error(lectura.error.kind);
    const [, ana, luis, soloMonto, soloDispersa, zoe] = lectura.filas;
    expect(ana).toEqual([
      "Ana López",
      "1200.5",
      "true",
      "2026-01-15",
      "2026-02-03T14:30:00",
      "08:05:00",
      "a & b <c>",
      "",
    ]);
    expect(luis!.slice(0, 5)).toEqual([
      "Luis",
      "0.1",
      "false",
      "2026-12-31",
      "2026-02-03",
    ]);
    expect(luis![6]).toBe("línea 1\nlínea 2");
    expect(soloMonto).toEqual(["", "3", "", "", "", "", "", ""]);
    expect(soloDispersa).toEqual(["", "", "", "", "", "", "", "7"]); // una columna dispersa queda en su lugar
    expect(Number(zoe![1])).toBeCloseTo(1e-7, 20);
    expect(zoe![3]).toBe("1900-03-01"); // la serie 61: pasa el 29 de febrero que Excel inventó
  });

  it("una fila con un solo valor cuenta y todas quedan del mismo ancho", async () => {
    const lectura = await leerXlsx(leer("tests/fixtures/xlsx/bordes.xlsx"));
    if (!lectura.ok) throw new Error(lectura.error.kind);
    expect(lectura.filas).toHaveLength(6); // cabecera + Ana + Luis + dos filas de un solo valor + Zoë
    expect(new Set(lectura.filas.map((f) => f.length))).toEqual(new Set([8]));
  });

  it("el sistema de fechas de 1904 se respeta", async () => {
    const lectura = await leerXlsx(
      leer("tests/fixtures/xlsx/fechas-1904.xlsx"),
    );
    if (!lectura.ok) throw new Error(lectura.error.kind);
    expect(lectura.filas).toEqual([["dia"], ["2026-01-15"], ["2030-07-04"]]);
  });
});

describe("libros mínimos con lo que openpyxl no escribe", () => {
  it("cadenas en línea, texto de fórmula, errores, entidades y caracteres de control", async () => {
    const hoja =
      `<row r="1"><c r="A1" t="inlineStr"><is><t>col a</t></is></c><c r="B1" t="inlineStr"><is><t>col b</t></is></c></row>` +
      `<row r="2"><c r="A2" t="inlineStr"><is><r><t>ni</t></r><r><t xml:space="preserve">ño </t></r><rPh><t>fonética</t></rPh></is></c>` +
      `<c r="B2" t="str"><f>A2&amp;"x"</f><v>R&amp;D &#233; &#x41;</v></c></row>` +
      `<row r="3"><c r="A3" t="e"><v>#DIV/0!</v></c><c r="B3" t="inlineStr"><is><t>a_x000D_b</t></is></c></row>`;
    const lectura = await leerXlsx(libroMinimo(hoja));
    if (!lectura.ok) throw new Error(lectura.error.kind);
    expect(lectura.filas).toEqual([
      ["col a", "col b"],
      ["niño ", "R&D é A"],
      ["", "a\rb"],
    ]);
  });

  it("celdas sin referencia, celdas vacías con estilo y filas vacías", async () => {
    const hoja =
      `<row><c t="inlineStr"><is><t>a</t></is></c><c t="inlineStr"><is><t>b</t></is></c><c s="3"/></row>` +
      `<row/>` +
      `<row><c t="inlineStr"><is><t>1</t></is></c><c s="3"/><c t="inlineStr"><is><t>x</t></is></c></row>`;
    const lectura = await leerXlsx(libroMinimo(hoja));
    if (!lectura.ok) throw new Error(lectura.error.kind);
    // la tercera columna solo tiene un valor, en la fila de datos: la cabecera la nombra por su posición
    expect(lectura.filas).toEqual([
      ["a", "b", "col_3"],
      ["1", "", "x"],
    ]);
  });

  it("la ruta de la hoja puede ser absoluta y el libro puede venir sin estilos ni cadenas compartidas", async () => {
    const hoja = `<row r="1"><c r="A1" t="inlineStr"><is><t>h</t></is></c></row><row r="2"><c r="A2"><v>5</v></c></row>`;
    const lectura = await leerXlsx(
      libroMinimo(hoja, {}, { target: "/xl/worksheets/sheet1.xml" }),
    );
    if (!lectura.ok) throw new Error(lectura.error.kind);
    expect(lectura.filas).toEqual([["h"], ["5"]]);
  });

  it("un número con formato de fecha de la tabla de estilos sale en ISO", async () => {
    const hoja =
      `<row r="1"><c r="A1" t="inlineStr"><is><t>d</t></is></c><c r="B1" t="inlineStr"><is><t>n</t></is></c></row>` +
      `<row r="2"><c r="A2" s="1"><v>45000</v></c><c r="B2" s="2"><v>45000</v></c></row>`;
    const estilos =
      `<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>` +
      `<cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="4"/></cellXfs></styleSheet>`;
    const lectura = await leerXlsx(
      libroMinimo(hoja, { "xl/styles.xml": estilos }),
    );
    if (!lectura.ok) throw new Error(lectura.error.kind);
    expect(lectura.filas[1]).toEqual(["2023-03-15", "45000"]);
  });

  it("el tope de filas corta la lectura y dice cuántas vio", async () => {
    const filas = Array.from(
      { length: 6 },
      (_, i) =>
        `<row r="${i + 1}"><c r="A${i + 1}" t="inlineStr"><is><t>v${i}</t></is></c></row>`,
    ).join("");
    const lectura = await leerXlsx(libroMinimo(filas), { maxFilas: 3 });
    expect(lectura).toEqual({
      ok: false,
      error: { kind: "too-many-rows", rows: 4, maxRows: 3 },
    });
  });
});

describe("lo que no se puede leer se dice con su nombre", () => {
  const ole = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  const utf16 = (s: string) => [...s].flatMap((c) => [c.charCodeAt(0), 0]);

  it("un libro con contraseña (contenedor OLE con su paquete cifrado) es «protegido»", async () => {
    const bytes = new Uint8Array([
      ...ole,
      ...new Array(300).fill(0),
      ...utf16("EncryptedPackage"),
    ]);
    expect(await leerXlsx(bytes)).toEqual({
      ok: false,
      error: { kind: "xlsx-protegido" },
    });
  });

  it("un .xls antiguo (OLE sin paquete cifrado) es «antiguo»", async () => {
    const bytes = new Uint8Array([
      ...ole,
      ...utf16("Workbook"),
      ...new Array(300).fill(0),
    ]);
    expect(await leerXlsx(bytes)).toEqual({
      ok: false,
      error: { kind: "xlsx-antiguo" },
    });
  });

  it("una entrada cifrada dentro del ZIP es «protegido»", async () => {
    const bytes = libroMinimo(
      `<row r="1"><c r="A1" t="inlineStr"><is><t>h</t></is></c></row>`,
    );
    // la bandera de cifrado (bit 0) del primer registro del directorio central
    const vista = new DataView(bytes.buffer);
    for (let i = bytes.length - 22; i >= 0; i--) {
      if (vista.getUint32(i, true) === 0x06054b50) {
        const central = vista.getUint32(i + 16, true);
        vista.setUint16(
          central + 8,
          vista.getUint16(central + 8, true) | 1,
          true,
        );
        break;
      }
    }
    expect(await leerXlsx(bytes)).toEqual({
      ok: false,
      error: { kind: "xlsx-protegido" },
    });
  });

  it("texto cualquiera, un ZIP sin libro y un libro truncado son «dañado»", async () => {
    const dañado = { ok: false, error: { kind: "xlsx-danado" } };
    expect(
      await leerXlsx(new TextEncoder().encode("a,b\n1,2\n".repeat(10))),
    ).toEqual(dañado);
    expect(
      await leerXlsx(crearZip([{ nombre: "otra.txt", datos: "x" }])),
    ).toEqual(dañado);
    const completo = leer("tests/fixtures/xlsx/bordes.xlsx");
    expect(await leerXlsx(completo.slice(0, completo.length - 200))).toEqual(
      dañado,
    );
  });

  it("una bomba de compresión se corta por el tope de bytes descomprimidos", async () => {
    const completo = leer("tests/fixtures/xlsx/bordes.xlsx");
    expect(await leerXlsx(completo, { maxDescomprimido: 100 })).toEqual({
      ok: false,
      error: { kind: "xlsx-danado" },
    });
  });
});

describe("serieAIso", () => {
  it.each([
    [1, false, "1900-01-01"],
    [59, false, "1900-02-28"],
    [60, false, "1900-02-29"],
    [61, false, "1900-03-01"],
    [45000, false, "2023-03-15"],
    [45000.75, false, "2023-03-15T18:00:00"],
    [0.5, false, "12:00:00"],
    [0, false, null],
    [-3, false, null],
    [0, true, "1904-01-01"],
    [1461, true, "1908-01-01"],
  ])("%s (1904: %s) → %s", (serie, sistema1904, esperado) => {
    expect(serieAIso(serie, sistema1904)).toBe(esperado);
  });

  it("una hora que redondea al segundo 86 400 pasa al día siguiente", () => {
    expect(serieAIso(45000.999999999, false)).toBe("2023-03-16");
  });
});
