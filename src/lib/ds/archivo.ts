// S18: de un archivo del usuario a la tabla de texto que ya entiende el resto de la app. El CSV se lee como texto en cada
// pantalla (como siempre); el `.xlsx` llega aquí y su lector se importa SOLO ahora, así que el peso inicial no cambia.
import { limitarTabla, MAX_BYTES, type CsvError, type CsvTable } from "./csv";
import type { XlsxFalla } from "./xlsx";

/** De dónde salió la tabla, cuando no fue un CSV: se muestra en la configuración («se leyó la hoja X»). */
export type OrigenArchivo = {
  formato: "xlsx";
  hoja: string;
  hojasIgnoradas: number;
};

export type LecturaTabular =
  | { ok: true; table: CsvTable; origen: OrigenArchivo }
  | { ok: false; error: CsvError | XlsxFalla };

/** Lo que el selector de archivos ofrece: CSV y Excel (`.xlsx`). */
export const ARCHIVOS_ACEPTADOS =
  ".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function esXlsx(archivo: { name: string; type?: string }): boolean {
  return (
    /\.xlsx$/i.test(archivo.name) ||
    archivo.type ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

/** Lee un `.xlsx` con los mismos límites que un CSV: 5 MB sobre el archivo y 50 000 filas. */
export async function leerArchivoXlsx(file: File): Promise<LecturaTabular> {
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      error: { kind: "too-large", bytes: file.size, maxBytes: MAX_BYTES },
    };
  }
  const { leerXlsx } = await import("./xlsx");
  const lectura = await leerXlsx(new Uint8Array(await file.arrayBuffer()));
  if (!lectura.ok) return lectura;
  const medida = limitarTabla(lectura.filas);
  if (!medida.ok) return medida;
  return {
    ok: true,
    table: medida.table,
    origen: {
      formato: "xlsx",
      hoja: lectura.hoja,
      hojasIgnoradas: lectura.hojasIgnoradas,
    },
  };
}
