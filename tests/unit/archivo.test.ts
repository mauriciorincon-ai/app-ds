// @vitest-environment node
/**
 * S18 — de un archivo del usuario a su tabla: qué archivos se leen como Excel (también el `.xls` antiguo, para rechazarlo
 * nombrándolo), y que un `.xlsx` se mide con los mismos límites que un CSV (5 MB sobre el archivo, 50 000 filas).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_BYTES } from "@/lib/ds/csv";
import { ARCHIVOS_ACEPTADOS, esExcel, leerArchivoXlsx } from "@/lib/ds/archivo";

const MIME_XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const archivoDe = (ruta: string, nombre = "libro.xlsx") =>
  new File([readFileSync(ruta)], nombre, { type: MIME_XLSX });

describe("esExcel", () => {
  it.each([
    "a.xlsx",
    "A.XLSX",
    "con espacios y ñ.xlsx",
    "macros.xlsm",
    "viejo.xls",
  ])("%s es Excel", (nombre) => {
    expect(esExcel({ name: nombre })).toBe(true);
  });
  it("también por el tipo, aunque el nombre no diga nada", () => {
    expect(esExcel({ name: "descarga", type: MIME_XLSX })).toBe(true);
  });
  it.each(["a.csv", "datos.xlsx.csv", "xlsx", "notas.txt", "a.xlsb"])(
    "%s no",
    (nombre) => {
      expect(esExcel({ name: nombre, type: "text/csv" })).toBe(false);
    },
  );
  it("el selector ofrece CSV y Excel, en ese orden (el CSV primero: los e2e lo buscan por su principio)", () => {
    expect(ARCHIVOS_ACEPTADOS.startsWith(".csv,text/csv")).toBe(true);
    expect(ARCHIVOS_ACEPTADOS).toContain(".xlsx");
  });
});

describe("leerArchivoXlsx", () => {
  it("un libro del kit carga como tabla, con la hoja que leyó", async () => {
    const r = await leerArchivoXlsx(
      archivoDe("docs/kit-de-prueba/xlsx/marketing-campania.xlsx"),
    );
    if (!r.ok) throw new Error(r.error.kind);
    expect(r.origen).toEqual({
      formato: "xlsx",
      hoja: "Datos",
      hojasIgnoradas: 0,
    });
    expect(r.table.headers[0]).toBe("edad");
    expect(r.table.rows).toHaveLength(200);
  });

  it("más de 5 MB se rechaza ANTES de abrirlo, con los bytes y el límite", async () => {
    const grande = new File([new Uint8Array(MAX_BYTES + 1)], "grande.xlsx", {
      type: MIME_XLSX,
    });
    expect(await leerArchivoXlsx(grande)).toEqual({
      ok: false,
      error: { kind: "too-large", bytes: MAX_BYTES + 1, maxBytes: MAX_BYTES },
    });
  });

  it("un libro con una sola fila (solo cabecera) es «vacío», como un CSV", async () => {
    const r = await leerArchivoXlsx(
      archivoDe("tests/fixtures/xlsx/fechas-1904.xlsx"),
    );
    // el libro de 1904 sí trae datos: la cabecera y dos fechas
    expect(r.ok).toBe(true);
  });

  it("lo que no es un libro se dice «dañado»", async () => {
    const texto = new File(
      [new TextEncoder().encode("a,b\n1,2\n".repeat(20))],
      "no-es.xlsx",
    );
    expect(await leerArchivoXlsx(texto)).toEqual({
      ok: false,
      error: { kind: "xlsx-danado" },
    });
  });

  it.each([
    ["libro-con-clave.xlsx", "xlsx-protegido"],
    ["libro-antiguo.xls", "xlsx-antiguo"],
    ["libro-danado.xlsx", "xlsx-danado"],
  ] as const)(
    "el %s del kit se rechaza diciendo por qué (%s)",
    async (nombre, kind) => {
      const r = await leerArchivoXlsx(
        archivoDe(`docs/kit-de-prueba/xlsx/${nombre}`, nombre),
      );
      expect(r).toEqual({ ok: false, error: { kind } });
    },
  );
});
