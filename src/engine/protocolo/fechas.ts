// Protocolo DS (S8, etapa 2): leer la columna de fecha del momento de la predicción, SIN
// adivinar. El formato ISO (AAAA-MM-DD) no tiene ambigüedad. Con día y mes en otro orden
// (31/01/2026 o 01/31/2026) el orden se deduce solo si algún valor lo delata (un 31 en la
// primera posición solo puede ser día); si todos los valores caben en los dos órdenes
// (05/06/2026), el código no puede saber cuál es y lo PREGUNTA (`ambiguo`). Un valor que no
// es una fecha real (30 de febrero, año de dos cifras) queda como «sin leer», nunca corregido.
//
// Puro: fechas como texto `AAAA-MM-DD` (se comparan como cadenas), sin `Date` ni zona horaria.
import { isNullToken } from "@/lib/ds/csv";

export type OrdenFecha = "iso" | "dia-mes" | "mes-dia";

export type LecturaFechas =
  | {
      readonly tipo: "leida";
      readonly orden: OrdenFecha;
      readonly minimo: string;
      readonly maximo: string;
      readonly leidas: number;
      readonly vacias: number;
      readonly sinLeer: number;
    }
  /** Todos los valores caben en día-mes y en mes-día: hay que preguntar. */
  | {
      readonly tipo: "ambigua";
      readonly leidas: number;
      readonly vacias: number;
      readonly sinLeer: number;
    }
  /** Hay valores que solo caben en día-mes y otros que solo caben en mes-día. */
  | {
      readonly tipo: "mezclada";
      readonly leidas: number;
      readonly vacias: number;
      readonly sinLeer: number;
    }
  /** Ningún valor es una fecha. */
  | {
      readonly tipo: "ninguna";
      readonly vacias: number;
      readonly sinLeer: number;
    };

const ISO =
  /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const LATINA =
  /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[T ]\d{1,2}:\d{2}(?::\d{2})?)?$/;

function bisiesto(anio: number): boolean {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
}

function diasDelMes(anio: number, mes: number): number {
  if (mes === 2) return bisiesto(anio) ? 29 : 28;
  return [4, 6, 9, 11].includes(mes) ? 30 : 31;
}

function esReal(anio: number, mes: number, dia: number): boolean {
  return (
    anio >= 1000 &&
    mes >= 1 &&
    mes <= 12 &&
    dia >= 1 &&
    dia <= diasDelMes(anio, mes)
  );
}

function dosDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

function aTexto(anio: number, mes: number, dia: number): string {
  return `${anio}-${dosDigitos(mes)}-${dosDigitos(dia)}`;
}

type Valor =
  | { tipo: "iso"; fecha: string }
  | { tipo: "latina"; a: number; b: number; anio: number }
  | { tipo: "no-fecha" };

function leerValor(texto: string): Valor {
  const iso = ISO.exec(texto);
  if (iso) {
    const [anio, mes, dia] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    return esReal(anio, mes, dia)
      ? { tipo: "iso", fecha: aTexto(anio, mes, dia) }
      : { tipo: "no-fecha" };
  }
  const latina = LATINA.exec(texto);
  if (latina)
    return {
      tipo: "latina",
      a: Number(latina[1]),
      b: Number(latina[2]),
      anio: Number(latina[3]),
    };
  return { tipo: "no-fecha" };
}

/**
 * Lee una columna de fechas. `orden` es la respuesta del usuario cuando el código no puede
 * deducirlo; si se da y el formato es AAAA-MM-DD, se ignora (no hay duda).
 */
export function leerFechas(
  valores: readonly string[],
  orden?: Exclude<OrdenFecha, "iso"> | null,
): LecturaFechas {
  let vacias = 0;
  const leidos: Valor[] = [];
  for (const crudo of valores) {
    if (isNullToken(crudo)) {
      vacias += 1;
      continue;
    }
    leidos.push(leerValor(crudo.trim()));
  }
  const isos = leidos.filter((v) => v.tipo === "iso");
  const latinas = leidos.filter((v) => v.tipo === "latina");
  let sinLeer = leidos.filter((v) => v.tipo === "no-fecha").length;

  if (isos.length > 0 && latinas.length > 0) {
    // Dos formatos distintos en la misma columna: no se adivina cuál es el bueno.
    return {
      tipo: "mezclada",
      leidas: isos.length + latinas.length,
      vacias,
      sinLeer,
    };
  }

  if (isos.length > 0) {
    const fechas = isos.map((v) => v.fecha).sort();
    return {
      tipo: "leida",
      orden: "iso",
      minimo: fechas[0]!,
      maximo: fechas.at(-1)!,
      leidas: fechas.length,
      vacias,
      sinLeer,
    };
  }

  if (latinas.length === 0) return { tipo: "ninguna", vacias, sinLeer };

  // Solo caben en día-mes los que tienen la segunda posición ≤ 12; solo en mes-día, la primera.
  const soloDiaMes = latinas.filter((v) => v.a > 12 && v.b <= 12).length;
  const soloMesDia = latinas.filter((v) => v.b > 12 && v.a <= 12).length;
  if (soloDiaMes > 0 && soloMesDia > 0)
    return { tipo: "mezclada", leidas: latinas.length, vacias, sinLeer };
  const deducido: Exclude<OrdenFecha, "iso"> | null =
    soloDiaMes > 0 ? "dia-mes" : soloMesDia > 0 ? "mes-dia" : (orden ?? null);
  if (deducido === null)
    return { tipo: "ambigua", leidas: latinas.length, vacias, sinLeer };

  const fechas: string[] = [];
  for (const v of latinas) {
    const [dia, mes] = deducido === "dia-mes" ? [v.a, v.b] : [v.b, v.a];
    if (esReal(v.anio, mes, dia)) fechas.push(aTexto(v.anio, mes, dia));
    else sinLeer += 1;
  }
  if (fechas.length === 0) return { tipo: "ninguna", vacias, sinLeer };
  fechas.sort();
  return {
    tipo: "leida",
    orden: deducido,
    minimo: fechas[0]!,
    maximo: fechas.at(-1)!,
    leidas: fechas.length,
    vacias,
    sinLeer,
  };
}
