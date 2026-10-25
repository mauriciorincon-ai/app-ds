// S18 (ADR 025): lector de `.xlsx` propio, sin dependencia. Un `.xlsx` es un ZIP de XML: se abre con
// `DecompressionStream("deflate-raw")` (nativo en los navegadores que Probeta ya exige y en Node) y se recorre con un
// escáner mínimo de las pocas etiquetas que importan. Se importa con `import()` SOLO al elegir un `.xlsx`: el peso
// inicial de `/` y de `/protocolo` no cambia.
//
// Qué lee: la primera hoja visible, el encabezado en su primera fila con datos, los valores guardados (una fórmula se
// lee por su último resultado) y las fechas a ISO. Qué no: celdas combinadas (no se expanden), comentarios, formatos.
// Qué rechaza, nombrándolo: un libro cifrado o con contraseña, el `.xls` antiguo y un archivo dañado.

import type { CsvError } from "./csv";
import { MAX_ROWS } from "./csv";

/** Tope de bytes que se aceptan DESCOMPRIMIDOS entre todas las partes que se leen (anti-bomba de compresión). */
export const MAX_DESCOMPRIMIDO = 128 * 1024 * 1024;
const MAX_ENTRADAS = 10_000;

export type XlsxFalla =
  | { kind: "xlsx-protegido" }
  | { kind: "xlsx-antiguo" }
  | { kind: "xlsx-danado" }
  | Extract<CsvError, { kind: "too-many-rows" }>;

export type XlsxLectura =
  | { ok: true; filas: string[][]; hoja: string; hojasIgnoradas: number }
  | { ok: false; error: XlsxFalla };

type Entrada = {
  nombre: string;
  metodo: number;
  comprimido: number;
  tamano: number;
  cifrada: boolean;
  desplazamiento: number;
};

const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const utf8 = new TextDecoder("utf-8");

class Danado extends Error {}

// ---------- ZIP ----------

function leerEntradas(bytes: Uint8Array): Entrada[] {
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // fin del directorio central: se busca desde el final (el comentario del ZIP puede ocupar hasta 64 KiB)
  let fin = -1;
  const piso = Math.max(0, bytes.length - 22 - 0xffff);
  for (let i = bytes.length - 22; i >= piso; i--) {
    if (vista.getUint32(i, true) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Danado();
  const total = vista.getUint16(fin + 10, true);
  const tamanoCentral = vista.getUint32(fin + 12, true);
  let cursor = vista.getUint32(fin + 16, true);
  if (total > MAX_ENTRADAS || total === 0xffff || tamanoCentral === 0xffffffff)
    throw new Danado();
  if (cursor + tamanoCentral > bytes.length) throw new Danado();
  const entradas: Entrada[] = [];
  for (let n = 0; n < total; n++) {
    if (
      cursor + 46 > bytes.length ||
      vista.getUint32(cursor, true) !== 0x02014b50
    )
      throw new Danado();
    const banderas = vista.getUint16(cursor + 8, true);
    const largoNombre = vista.getUint16(cursor + 28, true);
    const largoExtra = vista.getUint16(cursor + 30, true);
    const largoComentario = vista.getUint16(cursor + 32, true);
    const comprimido = vista.getUint32(cursor + 20, true);
    const tamano = vista.getUint32(cursor + 24, true);
    if (comprimido === 0xffffffff || tamano === 0xffffffff) throw new Danado(); // ZIP64: un libro de 5 MB no lo necesita
    entradas.push({
      nombre: utf8.decode(
        bytes.subarray(cursor + 46, cursor + 46 + largoNombre),
      ),
      metodo: vista.getUint16(cursor + 10, true),
      comprimido,
      tamano,
      cifrada: (banderas & 1) === 1,
      desplazamiento: vista.getUint32(cursor + 42, true),
    });
    cursor += 46 + largoNombre + largoExtra + largoComentario;
  }
  return entradas;
}

async function inflar(datos: Uint8Array, limite: number): Promise<Uint8Array> {
  const flujo = new Blob([datos.slice()])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  const lector = flujo.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.length;
    if (total > limite) {
      await lector.cancel();
      throw new Danado();
    }
    partes.push(value);
  }
  const salida = new Uint8Array(total);
  let cursor = 0;
  for (const parte of partes) {
    salida.set(parte, cursor);
    cursor += parte.length;
  }
  return salida;
}

/** El contenido de una parte del ZIP, descomprimida, o `null` si no existe. */
async function leerParte(
  bytes: Uint8Array,
  entradas: readonly Entrada[],
  nombre: string,
  presupuesto: { restante: number },
): Promise<string | null> {
  const entrada = entradas.find((e) => e.nombre === nombre);
  if (!entrada) return null;
  if (entrada.cifrada) throw new Error("cifrada");
  if (entrada.tamano > presupuesto.restante) throw new Danado();
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const o = entrada.desplazamiento;
  if (o + 30 > bytes.length || vista.getUint32(o, true) !== 0x04034b50)
    throw new Danado();
  const inicio =
    o + 30 + vista.getUint16(o + 26, true) + vista.getUint16(o + 28, true);
  if (inicio + entrada.comprimido > bytes.length) throw new Danado();
  const crudo = bytes.subarray(inicio, inicio + entrada.comprimido);
  let contenido: Uint8Array;
  if (entrada.metodo === 0) contenido = crudo;
  else if (entrada.metodo === 8)
    contenido = await inflar(crudo, entrada.tamano);
  else throw new Danado();
  if (contenido.length !== entrada.tamano) throw new Danado();
  presupuesto.restante -= contenido.length;
  const texto = utf8.decode(contenido);
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
}

// ---------- XML ----------

function entidades(texto: string): string {
  if (!texto.includes("&") && !texto.includes("_x")) return texto;
  return (
    texto
      .replace(
        /&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g,
        (_todo, e: string) => {
          if (e === "lt") return "<";
          if (e === "gt") return ">";
          if (e === "amp") return "&";
          if (e === "quot") return '"';
          if (e === "apos") return "'";
          const codigo =
            e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
          return Number.isFinite(codigo) && codigo > 0 && codigo <= 0x10ffff
            ? String.fromCodePoint(codigo)
            : "";
        },
      )
      // Excel escribe los caracteres de control como _x000D_ y el guion bajo literal como _x005F_
      .replace(/_x([0-9A-Fa-f]{4})_/g, (_todo, h: string) =>
        String.fromCharCode(parseInt(h, 16)),
      )
  );
}

function atributos(etiqueta: string): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const m of etiqueta.matchAll(
    /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
  ))
    salida[m[1]!] = entidades(m[2] ?? m[3] ?? "");
  return salida;
}

/** El texto de un bloque `<si>` o `<is>`: todas sus `<t>`, sin la lectura fonética (`<rPh>`). */
function textoDe(bloque: string): string {
  const sinFonetica = bloque.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let salida = "";
  for (const m of sinFonetica.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g))
    salida += m[1] ?? "";
  return entidades(salida);
}

function cadenasCompartidas(xml: string | null): string[] {
  if (!xml) return [];
  return [...xml.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)].map((m) =>
    textoDe(m[1] ?? ""),
  );
}

// ---------- fechas ----------

const FORMATOS_FECHA = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
  45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58,
]);

function esFormatoFecha(codigo: string): boolean {
  if (/^general$/i.test(codigo.trim())) return false;
  const sinTextos = codigo
    .replace(/"[^"]*"/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\\./g, "")
    .replace(/[_*]./g, "");
  return /[dmyhs]/i.test(sinTextos);
}

/** Por índice de estilo: ¿su formato de número es de fecha u hora? */
function estilosDeFecha(xml: string | null): boolean[] {
  if (!xml) return [];
  const personalizados = new Map<number, string>();
  for (const m of xml.matchAll(/<numFmt\b([^>]*?)\/?>/g)) {
    const a = atributos(m[1]!);
    if (a.numFmtId !== undefined && a.formatCode !== undefined)
      personalizados.set(Number(a.numFmtId), a.formatCode);
  }
  const bloque = /<cellXfs\b[^>]*?>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? "";
  return [...bloque.matchAll(/<xf\b([^>]*?)(?:\/>|>[\s\S]*?<\/xf>)/g)].map(
    (m) => {
      const id = Number(atributos(m[1]!).numFmtId ?? 0);
      const propio = personalizados.get(id);
      return propio !== undefined
        ? esFormatoFecha(propio)
        : FORMATOS_FECHA.has(id);
    },
  );
}

const dos = (n: number) => String(n).padStart(2, "0");

/** Número de serie de Excel a ISO: `AAAA-MM-DD`, con `THH:MM:SS` si trae hora, o `HH:MM:SS` si es solo hora. */
export function serieAIso(serie: number, sistema1904: boolean): string | null {
  if (!Number.isFinite(serie) || serie < 0 || serie >= 2958466) return null;
  let dias = Math.floor(serie);
  let segundos = Math.round((serie - dias) * 86400);
  if (segundos >= 86400) {
    dias += 1;
    segundos -= 86400;
  }
  const hora = `${dos(Math.floor(segundos / 3600))}:${dos(Math.floor((segundos % 3600) / 60))}:${dos(segundos % 60)}`;
  if (dias === 0 && !sistema1904) return segundos === 0 ? null : hora;
  if (!sistema1904 && dias === 60)
    return segundos === 0 ? "1900-02-29" : `1900-02-29T${hora}`;
  // 1900: el 1 de enero de 1900 es la serie 1 y Excel cuenta un 29 de febrero que no existió (serie 60)
  const base = sistema1904
    ? Date.UTC(1904, 0, 1)
    : dias < 60
      ? Date.UTC(1899, 11, 31)
      : Date.UTC(1899, 11, 30);
  const f = new Date(base + dias * 86400000);
  const dia = `${f.getUTCFullYear()}-${dos(f.getUTCMonth() + 1)}-${dos(f.getUTCDate())}`;
  return segundos === 0 ? dia : `${dia}T${hora}`;
}

// ---------- hoja ----------

function columnaDe(referencia: string | undefined): number | null {
  const letras = /^([A-Za-z]+)/.exec(referencia ?? "")?.[1];
  if (!letras) return null;
  let n = 0;
  for (const c of letras.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function valorDeCelda(
  atrib: Record<string, string>,
  cuerpo: string,
  compartidas: readonly string[],
  fechas: readonly boolean[],
  sistema1904: boolean,
): string {
  const tipo = atrib.t ?? "n";
  if (tipo === "inlineStr")
    return textoDe(/<is\b[^>]*?>([\s\S]*?)<\/is>/.exec(cuerpo)?.[1] ?? "");
  const v = /<v\b[^>]*?>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1];
  if (v === undefined) return "";
  if (tipo === "s") return compartidas[Number(v)] ?? "";
  if (tipo === "str") return entidades(v);
  if (tipo === "b") return v.trim() === "1" ? "true" : "false";
  if (tipo === "e") return "";
  if (tipo === "d") return entidades(v).trim();
  const numero = v.trim();
  if (atrib.s !== undefined && fechas[Number(atrib.s)]) {
    const iso = serieAIso(Number(numero), sistema1904);
    if (iso !== null) return iso;
  }
  return numero;
}

function leerHoja(
  xml: string,
  compartidas: readonly string[],
  fechas: readonly boolean[],
  sistema1904: boolean,
  maxFilas: number,
): { ok: true; filas: string[][] } | { ok: false; error: XlsxFalla } {
  const filas: string[][] = [];
  let ancho = 0;
  for (const fila of xml.matchAll(
    /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g,
  )) {
    const contenido = fila[2];
    if (!contenido) continue;
    const celdas: string[] = [];
    let posicion = 0;
    let ultimaConDato = -1;
    for (const c of contenido.matchAll(
      /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
    )) {
      const atrib = atributos(c[1]!);
      const columna = columnaDe(atrib.r) ?? posicion;
      posicion = columna + 1;
      const valor = valorDeCelda(
        atrib,
        c[2] ?? "",
        compartidas,
        fechas,
        sistema1904,
      );
      if (valor === "") continue;
      while (celdas.length < columna) celdas.push("");
      celdas[columna] = valor;
      ultimaConDato = columna;
    }
    if (ultimaConDato < 0) continue; // fila sin un solo valor: no cuenta
    ancho = Math.max(ancho, ultimaConDato + 1);
    filas.push(celdas);
    // la cabecera no cuenta como fila de datos
    if (filas.length - 1 > maxFilas) {
      return {
        ok: false,
        error: {
          kind: "too-many-rows",
          rows: filas.length - 1,
          maxRows: maxFilas,
        },
      };
    }
  }
  if (filas.length === 0) return { ok: true, filas: [] };
  const cuadradas = filas.map((f) => {
    const completa = f.slice();
    while (completa.length < ancho) completa.push("");
    return completa;
  });
  // una cabecera vacía con datos debajo se nombra por su posición; el CSV exige un nombre por columna
  cuadradas[0] = cuadradas[0]!.map((nombre, i) =>
    nombre === "" ? `col_${i + 1}` : nombre,
  );
  return { ok: true, filas: cuadradas };
}

// ---------- entrada ----------

function esOle(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && OLE.every((b, i) => bytes[i] === b);
}

/** ¿El contenedor OLE trae el paquete cifrado de un libro nuevo (contraseña) o es un `.xls` antiguo? */
function oleCifrado(bytes: Uint8Array): boolean {
  const aguja = [..."EncryptedPackage"].flatMap((c) => [c.charCodeAt(0), 0]);
  outer: for (let i = 0; i + aguja.length <= bytes.length; i++) {
    for (let j = 0; j < aguja.length; j++)
      if (bytes[i + j] !== aguja[j]) continue outer;
    return true;
  }
  return false;
}

export async function leerXlsx(
  bytes: Uint8Array,
  opciones: { maxFilas?: number; maxDescomprimido?: number } = {},
): Promise<XlsxLectura> {
  const maxFilas = opciones.maxFilas ?? MAX_ROWS;
  const presupuesto = {
    restante: opciones.maxDescomprimido ?? MAX_DESCOMPRIMIDO,
  };
  if (esOle(bytes)) {
    return {
      ok: false,
      error: { kind: oleCifrado(bytes) ? "xlsx-protegido" : "xlsx-antiguo" },
    };
  }
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b)
    return { ok: false, error: { kind: "xlsx-danado" } };
  try {
    const entradas = leerEntradas(bytes);
    if (entradas.some((e) => e.cifrada))
      return { ok: false, error: { kind: "xlsx-protegido" } };
    const libro = await leerParte(
      bytes,
      entradas,
      "xl/workbook.xml",
      presupuesto,
    );
    if (libro === null) return { ok: false, error: { kind: "xlsx-danado" } };
    const relaciones =
      (await leerParte(
        bytes,
        entradas,
        "xl/_rels/workbook.xml.rels",
        presupuesto,
      )) ?? "";
    const destinos = new Map<string, { target: string; type: string }>();
    for (const m of relaciones.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
      const a = atributos(m[1]!);
      if (a.Id && a.Target)
        destinos.set(a.Id, { target: a.Target, type: a.Type ?? "" });
    }
    const hojas = [...libro.matchAll(/<sheet\b([^>]*?)\/?>/g)]
      .map((m) => atributos(m[1]!))
      .filter((a) =>
        destinos.get(a["r:id"] ?? "")?.type.endsWith("/worksheet"),
      );
    if (hojas.length === 0)
      return { ok: false, error: { kind: "xlsx-danado" } };
    const elegida =
      hojas.find((h) => !/^(hidden|veryHidden)$/.test(h.state ?? "")) ??
      hojas[0]!;
    const destino = destinos.get(elegida["r:id"]!)!.target;
    const ruta = destino.startsWith("/") ? destino.slice(1) : `xl/${destino}`;
    const sistema1904 =
      /<workbookPr\b[^>]*?\bdate1904\s*=\s*"(?:1|true)"/i.test(libro);
    const compartidas = cadenasCompartidas(
      await leerParte(bytes, entradas, "xl/sharedStrings.xml", presupuesto),
    );
    const fechas = estilosDeFecha(
      await leerParte(bytes, entradas, "xl/styles.xml", presupuesto),
    );
    const xmlHoja = await leerParte(bytes, entradas, ruta, presupuesto);
    if (xmlHoja === null) return { ok: false, error: { kind: "xlsx-danado" } };
    const hoja = leerHoja(xmlHoja, compartidas, fechas, sistema1904, maxFilas);
    if (!hoja.ok) return hoja;
    return {
      ok: true,
      filas: hoja.filas,
      hoja: elegida.name ?? "",
      hojasIgnoradas: hojas.length - 1,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "cifrada")
      return { ok: false, error: { kind: "xlsx-protegido" } };
    // un ZIP truncado o un deflate que no cierra se dicen igual: el archivo está dañado
    return { ok: false, error: { kind: "xlsx-danado" } };
  }
}
