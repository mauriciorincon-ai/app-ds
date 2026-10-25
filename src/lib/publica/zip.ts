// S17 (ADR 024): un ZIP sin compresión (método «stored»), escrito a mano. El servicio viaja en un solo archivo y el modelo
// que lleva ya es un blob comprimido (pickle + zlib + base64), así que comprimir de nuevo no ahorraría nada; a cambio no hay
// dependencia nueva ni peso inicial. Lo abre cualquier descompresor; la CI lo abre con `zipfile` de CPython.

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

export function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i++)
    c = TABLA_CRC[(c ^ datos[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export type ArchivoZip = { readonly nombre: string; readonly datos: Uint8Array | string };

const codificador = new TextEncoder();

/** Fecha y hora en el formato DOS de 16 bits que pide el ZIP (precisión de 2 segundos, desde 1980). */
function fechaDos(fecha: Date): { dia: number; hora: number } {
  const anio = Math.max(fecha.getFullYear(), 1980) - 1980;
  return {
    dia: (anio << 9) | ((fecha.getMonth() + 1) << 5) | fecha.getDate(),
    hora:
      (fecha.getHours() << 11) |
      (fecha.getMinutes() << 5) |
      (fecha.getSeconds() >> 1),
  };
}

export function crearZip(
  archivos: readonly ArchivoZip[],
  fecha: Date = new Date(),
): Uint8Array<ArrayBuffer> {
  const { dia, hora } = fechaDos(fecha);
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let posicion = 0;
  for (const archivo of archivos) {
    const nombre = codificador.encode(archivo.nombre);
    const datos =
      typeof archivo.datos === "string"
        ? codificador.encode(archivo.datos)
        : archivo.datos;
    const crc = crc32(datos);
    // bit 11 de las banderas: el nombre va en UTF-8
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, hora, true);
    local.setUint16(12, dia, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, datos.length, true);
    local.setUint32(22, datos.length, true);
    local.setUint16(26, nombre.length, true);
    local.setUint16(28, 0, true);
    partes.push(new Uint8Array(local.buffer), nombre, datos);

    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(8, 0x0800, true);
    dir.setUint16(10, 0, true);
    dir.setUint16(12, hora, true);
    dir.setUint16(14, dia, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, datos.length, true);
    dir.setUint32(24, datos.length, true);
    dir.setUint16(28, nombre.length, true);
    dir.setUint32(42, posicion, true);
    central.push(new Uint8Array(dir.buffer), nombre);
    posicion += 30 + nombre.length + datos.length;
  }
  const tamanoCentral = central.reduce((n, p) => n + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, archivos.length, true);
  fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamanoCentral, true);
  fin.setUint32(16, posicion, true);
  const todo = [...partes, ...central, new Uint8Array(fin.buffer)];
  const salida = new Uint8Array(todo.reduce((n, p) => n + p.length, 0));
  let cursor = 0;
  for (const parte of todo) {
    salida.set(parte, cursor);
    cursor += parte.length;
  }
  return salida;
}
