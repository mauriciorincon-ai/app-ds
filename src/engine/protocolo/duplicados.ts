// Protocolo DS (S9, etapa 4): filas repetidas. Dos preguntas distintas, las dos sobre la tabla
// tal como se cargó (sin sanear: aquí lo repetido es lo que se busca, no lo que se quita).
//  · filas EXACTAS: la misma fila, celda por celda, como las junta `dedupeIndex` en Probeta;
//  · UNIDAD + MOMENTO: la misma unidad en el mismo día, aunque el resto de la fila cambie.
// Las dos son una fuga en potencia: lo repetido cae a la vez en entrenar y en probar.
// Solo salen conteos: ninguna fila ni valor sale de aquí.
import { isNullToken, type CsvTable } from "@/lib/ds/csv";
import { dedupeIndex } from "@/engine/sanitize";

/** Cuántas filas sobran porque otra igual ya las trae (celda por celda, sin recortar espacios). */
export function filasRepetidas(tabla: CsvTable): number {
  return tabla.rows.length - new Set(dedupeIndex(tabla.rows)).size;
}

/**
 * Cuántas filas sobran porque su unidad ya tiene otra fila el mismo día. Las filas sin unidad
 * o sin fecha no cuentan (no hay a qué compararlas). `unidades` y `fechas` van alineadas a las
 * filas.
 */
export function unidadMomentoRepetidos(
  unidades: readonly string[],
  fechas: readonly (string | null)[],
): number {
  const vistas = new Set<string>();
  let repetidas = 0;
  unidades.forEach((unidad, i) => {
    const fecha = fechas[i];
    if (fecha === null || fecha === undefined || isNullToken(unidad)) return;
    const clave = JSON.stringify([unidad.trim(), fecha]);
    if (vistas.has(clave)) repetidas += 1;
    else vistas.add(clave);
  });
  return repetidas;
}
