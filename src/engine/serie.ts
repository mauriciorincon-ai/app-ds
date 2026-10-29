// S20 (ADR 028): el calendario y la serie del pronóstico. Puro y sin `Date` (ni zona horaria): las fechas son texto
// `AAAA-MM-DD` —las que ya entrega `fechasPorFila`— y los días se cuentan desde 1970-01-01 con el algoritmo civil
// (bisiestos incluidos). De las filas de una tabla arma UNA serie regular: un valor por periodo (día, semana que empieza en
// lunes, o mes), sumando o promediando lo que cae en cada periodo, con los periodos que faltan dichos por su nombre. Lo que
// no puede saber el código (si la tasa se suma o se promedia, qué hacer con un hueco) se propone y el usuario decide.

export type Periodo = "dia" | "semana" | "mes";
export type Agregado = "suma" | "promedio";

/** Cuántos periodos arma como máximo (un rango de décadas en días no cabe en el navegador). */
export const PERIODOS_MAX = 20_000;
/** Con más huecos que esta parte de los periodos, la serie no se completa: se pide otra. */
export const HUECOS_MAX = 0.2;
/** La temporada de cada periodo: una semana de días, un año de semanas, un año de meses. */
export const TEMPORADA: Record<Periodo, number> = {
  dia: 7,
  semana: 52,
  mes: 12,
};

// --- el calendario ----------------------------------------------------------------------------------------------------------

/** Días desde 1970-01-01 de un `AAAA-MM-DD` ya validado (Hinnant, civil_from_days al revés). */
export function diasDe(iso: string): number {
  const [anio, mes, dia] = iso.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const y = mes <= 2 ? anio - 1 : anio;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (mes + (mes > 2 ? -3 : 9)) + 2) / 5) + dia - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

const dos = (n: number) => String(n).padStart(2, "0");

/** El `AAAA-MM-DD` de unos días desde 1970-01-01. */
export function isoDe(dias: number): string {
  const z = dias + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe -
      Math.floor(doe / 1460) +
      Math.floor(doe / 36524) -
      Math.floor(doe / 146096)) /
      365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const dia = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const mes = mp + (mp < 10 ? 3 : -9);
  const anio = yoe + era * 400 + (mes <= 2 ? 1 : 0);
  return `${anio}-${dos(mes)}-${dos(dia)}`;
}

/** Día de la semana de unos días desde 1970-01-01, con el lunes en 0 (el 1970-01-01 fue jueves). */
export const diaDeSemana = (dias: number): number => (((dias + 3) % 7) + 7) % 7;

// El lunes 1970-01-05 son los días 4: la semana número 0.
const LUNES_0 = 4;

/** El índice del periodo que contiene la fecha: los días, la semana (lunes) o el mes contados desde un origen fijo. */
export function indiceDe(iso: string, periodo: Periodo): number {
  const dias = diasDe(iso);
  if (periodo === "dia") return dias;
  if (periodo === "semana")
    return Math.floor((dias - diaDeSemana(dias) - LUNES_0) / 7);
  const [anio, mes] = iso.split("-").map(Number) as [number, number];
  return anio * 12 + (mes - 1);
}

/** El primer día de un periodo, como `AAAA-MM-DD`. */
export function inicioDe(indice: number, periodo: Periodo): string {
  if (periodo === "dia") return isoDe(indice);
  if (periodo === "semana") return isoDe(indice * 7 + LUNES_0);
  return `${Math.floor(indice / 12)}-${dos((indice % 12) + 1)}-01`;
}

/** Cómo se nombra un periodo en pantalla y en el CSV: el día y el lunes de la semana como `AAAA-MM-DD`, el mes como `AAAA-MM`. */
export function etiquetaDe(indice: number, periodo: Periodo): string {
  const inicio = inicioDe(indice, periodo);
  return periodo === "mes" ? inicio.slice(0, 7) : inicio;
}

/** El último día de un periodo. */
function finDe(indice: number, periodo: Periodo): number {
  if (periodo === "dia") return indice;
  if (periodo === "semana") return indice * 7 + LUNES_0 + 6;
  return diasDe(inicioDe(indice + 1, "mes")) - 1;
}

// --- la propuesta -----------------------------------------------------------------------------------------------------------

/** Mediana de una lista ya ordenada. */
const mediana = (v: readonly number[]): number =>
  v.length % 2
    ? v[(v.length - 1) / 2]!
    : (v[v.length / 2 - 1]! + v[v.length / 2]!) / 2;

/**
 * El periodo que propone el código por la mediana de los saltos entre fechas distintas: ≤ 1,5 días → día, de 5,5 a 8,5 → semana,
 * de 25 a 35 → mes. Más espaciada (o con una sola fecha) no se ofrece: `null`.
 */
export function proponerPeriodo(
  fechas: readonly (string | null)[],
): Periodo | null {
  const dias = [
    ...new Set(fechas.flatMap((f) => (f === null ? [] : [diasDe(f)]))),
  ].sort((a, b) => a - b);
  if (dias.length < 2) return null;
  const saltos = dias
    .slice(1)
    .map((d, i) => d - dias[i]!)
    .sort((a, b) => a - b);
  const m = mediana(saltos);
  if (m <= 1.5) return "dia";
  if (m >= 5.5 && m <= 8.5) return "semana";
  if (m >= 25 && m <= 35) return "mes";
  return null;
}

const PROMEDIO =
  /tasa|precio|promedio|media|ratio|porcentaje|%|temperatura|\b(?:price|rate|avg|average|mean|percent|temperature)\b/i;

/** Suma o promedio: un nombre que habla de tasa, precio o promedio se promedia; lo demás se suma. El usuario lo cambia. */
export function proponerAgregado(nombreColumna: string): Agregado {
  return PROMEDIO.test(nombreColumna) ? "promedio" : "suma";
}

// --- la serie ---------------------------------------------------------------------------------------------------------------

export type Serie = {
  readonly periodo: Periodo;
  readonly agregado: Agregado;
  /** El índice del primer periodo; el periodo `i` es `desde + i`. */
  readonly desde: number;
  /** Un valor por periodo; `null` = nadie midió nada ese periodo (un hueco). */
  readonly valores: readonly (number | null)[];
  /** Las etiquetas de los periodos que faltan, en orden. */
  readonly huecos: readonly string[];
  /** Filas que entran, filas sin fecha o con la fecha ilegible, y filas con la fecha pero sin número. */
  readonly filas: {
    readonly usadas: number;
    readonly sinFecha: number;
    readonly sinValor: number;
  };
  /** Periodos de los extremos que se quitaron por estar a medias (solo al sumar datos diarios). */
  readonly quitados: readonly string[];
};

export type ArmarSerie =
  | { readonly ok: true; readonly serie: Serie }
  | {
      readonly ok: false;
      readonly motivo: "sin-filas" | "muy-larga" | "una-sola";
    };

/**
 * Junta las filas por periodo. `fechas[i]` y `valores[i]` son los de la fila `i` (`null` si no se leen). Sumando datos diarios, el
 * primer y el último periodo se quitan si los datos no los cubren enteros —una suma a medias se leería como una caída—.
 */
export function armarSerie(
  fechas: readonly (string | null)[],
  valores: readonly (number | null)[],
  periodo: Periodo,
  agregado: Agregado,
): ArmarSerie {
  const acumulado = new Map<number, { suma: number; n: number }>();
  let sinFecha = 0;
  let sinValor = 0;
  const dias = new Set<number>();
  fechas.forEach((f, i) => {
    if (f === null) {
      sinFecha += 1;
      return;
    }
    const v = valores[i] ?? null;
    if (v === null || !Number.isFinite(v)) {
      sinValor += 1;
      return;
    }
    const k = indiceDe(f, periodo);
    const a = acumulado.get(k) ?? { suma: 0, n: 0 };
    a.suma += v;
    a.n += 1;
    acumulado.set(k, a);
    dias.add(diasDe(f));
  });
  if (acumulado.size === 0) return { ok: false, motivo: "sin-filas" };
  let [primero, ultimo] = [Infinity, -Infinity];
  for (const k of acumulado.keys()) {
    primero = Math.min(primero, k);
    ultimo = Math.max(ultimo, k);
  }
  if (ultimo - primero + 1 > PERIODOS_MAX)
    return { ok: false, motivo: "muy-larga" };

  // datos diarios (cada fecha distinta a un día de la anterior, en su mayoría) y suma: los extremos a medias se quitan
  const quitados: string[] = [];
  if (agregado === "suma" && periodo !== "dia" && propuestaDiaria(dias)) {
    const [minDia, maxDia] = [Math.min(...dias), Math.max(...dias)];
    if (minDia > diasDe(inicioDe(primero, periodo))) {
      quitados.push(etiquetaDe(primero, periodo));
      acumulado.delete(primero);
    }
    if (maxDia < finDe(ultimo, periodo) && acumulado.has(ultimo)) {
      quitados.push(etiquetaDe(ultimo, periodo));
      acumulado.delete(ultimo);
    }
    if (acumulado.size === 0) return { ok: false, motivo: "una-sola" };
    [primero, ultimo] = [Infinity, -Infinity];
    for (const k of acumulado.keys()) {
      primero = Math.min(primero, k);
      ultimo = Math.max(ultimo, k);
    }
  }

  const salida: (number | null)[] = [];
  const huecos: string[] = [];
  let usadas = 0;
  for (let k = primero; k <= ultimo; k++) {
    const a = acumulado.get(k);
    if (!a) {
      salida.push(null);
      huecos.push(etiquetaDe(k, periodo));
      continue;
    }
    usadas += a.n;
    salida.push(agregado === "suma" ? a.suma : a.suma / a.n);
  }
  return {
    ok: true,
    serie: {
      periodo,
      agregado,
      desde: primero,
      valores: salida,
      huecos,
      filas: { usadas, sinFecha, sinValor },
      quitados,
    },
  };
}

/** ¿Las fechas son de todos los días (mediana de saltos de un día)? */
function propuestaDiaria(dias: ReadonlySet<number>): boolean {
  const orden = [...dias].sort((a, b) => a - b);
  if (orden.length < 2) return false;
  const saltos = orden
    .slice(1)
    .map((d, i) => d - orden[i]!)
    .sort((a, b) => a - b);
  return mediana(saltos) <= 1.5;
}

/** ¿Se puede completar? Con más de `HUECOS_MAX` de los periodos sin dato, no. */
export function sePuedeCompletar(serie: Serie): boolean {
  return serie.huecos.length / serie.valores.length <= HUECOS_MAX;
}

/** Completa cada hueco con la recta entre sus vecinos. Devuelve los valores y cuáles se pusieron (`true` = completado). */
export function completarLineal(valores: readonly (number | null)[]): {
  readonly valores: number[];
  readonly completado: boolean[];
} {
  const salida = valores.map((v) => v ?? Number.NaN);
  const completado = valores.map((v) => v === null);
  let i = 0;
  while (i < salida.length) {
    if (!Number.isNaN(salida[i])) {
      i += 1;
      continue;
    }
    // la serie empieza y termina con dato: un hueco siempre tiene vecino a los dos lados
    const antes = i - 1;
    let despues = i;
    while (despues < salida.length && Number.isNaN(salida[despues]))
      despues += 1;
    const [a, b] = [salida[antes]!, salida[despues]!];
    for (let j = i; j < despues; j++)
      salida[j] = a + ((b - a) * (j - antes)) / (despues - antes);
    i = despues;
  }
  return { valores: salida, completado };
}

/** Las etiquetas de los `h` periodos que vienen después del último de la serie. */
export function periodosFuturos(serie: Serie, h: number): string[] {
  const ultimo = serie.desde + serie.valores.length - 1;
  return Array.from({ length: h }, (_, i) =>
    etiquetaDe(ultimo + 1 + i, serie.periodo),
  );
}

/** Las etiquetas de todos los periodos de la serie. */
export const etiquetasDe = (serie: Serie): string[] =>
  serie.valores.map((_, i) => etiquetaDe(serie.desde + i, serie.periodo));

/** Cuántos periodos pronostica por defecto: una temporada (una semana de días, un año de meses) o un trimestre de semanas. */
export const HORIZONTE_DEFECTO: Record<Periodo, number> = {
  dia: 7,
  semana: 13,
  mes: 12,
};
/** El máximo que se ofrece (el worker lo vuelve a comprobar). */
export const HORIZONTE_MAX = 120;
