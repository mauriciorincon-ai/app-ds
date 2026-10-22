// Protocolo DS (S11), etapa 6 — LA PARTICIÓN SEGÚN TU CASO. Reparte las filas con objetivo en
// entrenamiento y prueba con el esquema que pide el diseño registrado en la etapa 2:
//
//  · estratificada: al azar con semilla, guardando la proporción de cada clase (en un número, de
//    cada banda del objetivo): `split.ts` de Probeta, tal cual;
//  · por grupo: ninguna unidad en los dos lados. Las unidades se reparten con `stratifiedSplit`
//    sobre una etiqueta por unidad —la clase más rara que aparece en ella—, así la prueba no se
//    queda sin la clase rara;
//  · por tiempo: la prueba son las últimas fechas (fechas enteras) hasta llegar al tamaño pedido;
//    las filas con fecha en [corte − horizonte, corte) son el HUECO y no entran a ningún lado: su
//    resultado se conocería ya dentro del periodo de prueba;
//  · por tiempo y grupo (unidades nuevas): el mismo corte, y el entrenamiento deja fuera toda la
//    historia de las unidades que están en la prueba.
//
// Las filas que no entran se cuentan por motivo, nunca se reparten en silencio. La verificación
// (`verificar`) es otra función: cuenta sobre las filas y sus valores qué se repite entre lados,
// sin creerle a la partición. Devuelve índices y conteos; ningún valor de celda sale de aquí
// salvo los nombres de clase y los rangos de fecha que el cuaderno ya guarda desde la etapa 2.
import { byTask } from "@/engine/despacho";
import { quantileSplit, stratifiedSplit } from "@/engine/split";
import type { SupervisedTask } from "@/engine/tarea";
import {
  columnValues,
  isNullToken,
  parseNumber,
  type CsvTable,
} from "@/lib/ds/csv";
import { fechasPorFila } from "./fechas";
import { sha256TextoSync } from "./sha256";
import { indiceDe, nombreClase, perfilUnidad, valoresDe } from "./tabla";
import { texto, textoLleno, type Registro } from "./valores";

export const ESQUEMAS = [
  "estratificada",
  "grupo",
  "tiempo",
  "tiempo-grupo",
] as const;
export type Esquema = (typeof ESQUEMAS)[number];

export const UNIDADES_HORIZONTE = ["dias", "meses"] as const;
export type UnidadHorizonte = (typeof UNIDADES_HORIZONTE)[number];

/** Tamaño de la prueba, en enteros por ciento. */
export const TAMANO_SUGERIDO = 20;
export const TAMANO_MIN = 10;
export const TAMANO_MAX = 40;
/** Diez años: un horizonte más largo deja sin entrenamiento cualquier tabla razonable. */
export const HORIZONTE_MAX: Readonly<Record<UnidadHorizonte, number>> = {
  dias: 3660,
  meses: 120,
};
/** La semilla es del motor, no del usuario: cambiarla sería otra forma de volver a mirar. */
export const SEMILLA_6 = 20261018;
/** La primera línea de la receta del sello; cambia si la receta cambia. */
export const RECETA_SELLO = "PROTOCOLO-DS/SELLO/1";

export const esEsquema = (x: unknown): x is Esquema =>
  ESQUEMAS.some((e) => e === x);
export const esUnidadHorizonte = (x: unknown): x is UnidadHorizonte =>
  UNIDADES_HORIZONTE.some((u) => u === x);
export const esTemporal = (e: Esquema) =>
  e === "tiempo" || e === "tiempo-grupo";
export const esPorGrupo = (e: Esquema) => e === "grupo" || e === "tiempo-grupo";

// --- fechas como días, sin Date ni zona horaria (fechas `AAAA-MM-DD`) --------------------------

function dosDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

function bisiesto(anio: number): boolean {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
}

function diasDelMes(anio: number, mes: number): number {
  if (mes === 2) return bisiesto(anio) ? 29 : 28;
  return [4, 6, 9, 11].includes(mes) ? 30 : 31;
}

/** Días desde el 1970-01-01 (calendario civil; algoritmo de H. Hinnant). */
export function diasDe(fecha: string): number {
  const [a, m, d] = [
    Number(fecha.slice(0, 4)),
    Number(fecha.slice(5, 7)),
    Number(fecha.slice(8, 10)),
  ];
  const y = m <= 2 ? a - 1 : a;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * ((m + 9) % 12) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function fechaDe(dias: number): string {
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
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return `${y}-${dosDigitos(m)}-${dosDigitos(d)}`;
}

/**
 * La fecha `cantidad` días o meses antes. En meses, con calendario: el 31 de marzo menos un mes es
 * el 28 (o 29) de febrero. Con fechas mensuales, «30 días» dejaría fuera del hueco la fila del día 1.
 */
export function restar(
  fecha: string,
  cantidad: number,
  unidad: UnidadHorizonte,
): string {
  if (unidad === "dias") return fechaDe(diasDe(fecha) - cantidad);
  const [a, m, d] = [
    Number(fecha.slice(0, 4)),
    Number(fecha.slice(5, 7)),
    Number(fecha.slice(8, 10)),
  ];
  const total = a * 12 + (m - 1) - cantidad;
  const [na, nm] = [Math.floor(total / 12), (((total % 12) + 12) % 12) + 1];
  return `${na}-${dosDigitos(nm)}-${dosDigitos(Math.min(d, diasDelMes(na, nm)))}`;
}

// --- el diseño: lo que la tabla y la etapa 2 dicen de cada fila -------------------------------

export type Diseno = {
  readonly forma: SupervisedTask;
  readonly filasTabla: number;
  /** Filas con objetivo (en un número, que se lee como número), en el orden de la tabla. */
  readonly filas: readonly number[];
  /** Clasificación: la clase de cada fila de la tabla (`null` sin objetivo). */
  readonly clases: readonly (string | null)[] | null;
  /** Un número: el valor del objetivo de cada fila. */
  readonly valores: readonly (number | null)[] | null;
  /** Dos clases: el valor que significa «hay que actuar». */
  readonly positivo: string | null;
  /** La unidad de cada fila, si la etapa 2 registró una columna de unidad. */
  readonly unidades: readonly (string | null)[] | null;
  readonly unidadRepetida: boolean;
  /** La fecha de cada fila, si la etapa 2 registró una columna de fecha y se lee entera. */
  readonly fechas: readonly (string | null)[] | null;
};

function calcularDiseno(
  tabla: CsvTable,
  forma: SupervisedTask,
  r2: Registro,
): Diseno | null {
  const objetivo = textoLleno(r2, "objetivo");
  if (objetivo === null) return null;
  const indice = indiceDe(tabla, objetivo);
  if (indice < 0) return null;
  const crudos = columnValues(tabla, indice);
  const clasificacion = byTask(forma, {
    binaria: true,
    multiclase: true,
    numerica: false,
  });
  const llenos = crudos.filter((v) => !isNullToken(v));
  const numerico =
    llenos.length > 0 && llenos.every((v) => parseNumber(v) !== null);
  const filas = crudos
    .map((_, i) => i)
    .filter((i) => !isNullToken(crudos[i]!))
    .filter((i) => clasificacion || parseNumber(crudos[i]!) !== null);
  const unidadCol =
    r2.unidad === "columna" ? textoLleno(r2, "unidad_columna") : null;
  const fechaCol =
    r2.momento === "columna" ? textoLleno(r2, "momento_columna") : null;
  const unidades =
    unidadCol !== null && indiceDe(tabla, unidadCol) >= 0
      ? valoresDe(tabla, unidadCol).map((v) =>
          isNullToken(v) ? null : v.trim(),
        )
      : null;
  const orden = r2.orden_fecha;
  const fechas =
    fechaCol !== null && indiceDe(tabla, fechaCol) >= 0
      ? (fechasPorFila(
          valoresDe(tabla, fechaCol),
          orden === "dia-mes" || orden === "mes-dia" ? orden : null,
        )?.fechas ?? null)
      : null;
  return {
    forma,
    filasTabla: crudos.length,
    filas,
    clases: clasificacion
      ? crudos.map((v) => (isNullToken(v) ? null : nombreClase(v, numerico)))
      : null,
    valores: clasificacion
      ? null
      : crudos.map((v) => (isNullToken(v) ? null : parseNumber(v))),
    positivo: byTask(forma, {
      binaria: texto(r2, "positivo"),
      multiclase: null,
      numerica: null,
    }),
    unidades,
    unidadRepetida:
      unidades !== null &&
      unidadCol !== null &&
      perfilUnidad(tabla, unidadCol).repetida,
    fechas,
  };
}

const DISENOS = new WeakMap<CsvTable, Map<string, Diseno | null>>();

/** El diseño de la tabla con lo que registró la etapa 2 (guardado por tabla y respuestas). */
export function disenoDe(
  tabla: CsvTable,
  forma: SupervisedTask,
  r2: Registro,
): Diseno | null {
  const clave = JSON.stringify([
    forma,
    r2.objetivo,
    r2.positivo,
    r2.unidad,
    r2.unidad_columna,
    r2.momento,
    r2.momento_columna,
    r2.orden_fecha,
  ]);
  let porClave = DISENOS.get(tabla);
  if (!porClave) DISENOS.set(tabla, (porClave = new Map()));
  if (!porClave.has(clave))
    porClave.set(clave, calcularDiseno(tabla, forma, r2));
  return porClave.get(clave) ?? null;
}

/** Los esquemas que los datos permiten, en el orden de `ESQUEMAS`. */
export function disponibles(d: Diseno): Esquema[] {
  const fecha = d.fechas !== null;
  return ESQUEMAS.filter((e) =>
    e === "estratificada"
      ? true
      : e === "grupo"
        ? d.unidadRepetida
        : e === "tiempo"
          ? fecha
          : fecha && d.unidadRepetida,
  );
}

/** ¿Hay que preguntar si el modelo se usará con unidades nuevas o conocidas? (fecha y unidad repetida) */
export function preguntaUnidades(d: Diseno): boolean {
  return d.fechas !== null && d.unidadRepetida;
}

/** El esquema que sugieren las reglas; `null` si falta la respuesta de unidades nuevas o conocidas. */
export function sugerido(d: Diseno, unidades: string): Esquema | null {
  if (preguntaUnidades(d))
    return unidades === "nuevas"
      ? "tiempo-grupo"
      : unidades === "conocidas"
        ? "tiempo"
        : null;
  if (d.fechas !== null) return "tiempo";
  if (d.unidadRepetida) return "grupo";
  return "estratificada";
}

// --- la partición -------------------------------------------------------------------------------

export type Parametros = {
  readonly esquema: Esquema;
  /** Enteros por ciento, de `TAMANO_MIN` a `TAMANO_MAX`. */
  readonly tamano: number;
  /** Solo en los esquemas por tiempo. */
  readonly horizonte: number;
  readonly unidad: UnidadHorizonte;
};

export type Particion = {
  readonly esquema: Esquema;
  /** Índices de fila de la tabla, en orden. */
  readonly entrenamiento: readonly number[];
  readonly prueba: readonly number[];
  readonly hueco: readonly number[];
  /** La primera fecha de la prueba (esquemas por tiempo). */
  readonly corte: string | null;
  readonly fuera: {
    readonly sinObjetivo: number;
    readonly sinFecha: number;
    readonly sinUnidad: number;
    /** Tiempo y grupo: la historia de las unidades que están en la prueba. */
    readonly unidadesDePrueba: number;
  };
};

export function parametrosValidos(p: Parametros): boolean {
  return (
    Number.isInteger(p.tamano) &&
    p.tamano >= TAMANO_MIN &&
    p.tamano <= TAMANO_MAX &&
    (!esTemporal(p.esquema) ||
      (Number.isInteger(p.horizonte) &&
        p.horizonte >= 0 &&
        p.horizonte <= HORIZONTE_MAX[p.unidad]))
  );
}

const enOrden = (xs: number[]) => xs.sort((a, b) => a - b);

/** Cuenta de cada clase en las filas dadas (para la etiqueta de rareza). */
function cuentaClases(
  d: Diseno,
  filas: readonly number[],
): Map<string, number> {
  const cuenta = new Map<string, number>();
  for (const f of filas) {
    const c = d.clases![f]!;
    cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
  }
  return cuenta;
}

/** Estratificada sobre las filas dadas: por clase, o por banda en un número. */
function estratificar(
  d: Diseno,
  filas: readonly number[],
  frac: number,
): { entrenamiento: number[]; prueba: number[] } {
  if (filas.length < 2) return { entrenamiento: [...filas], prueba: [] };
  const r = byTask(d.forma, {
    binaria: () =>
      stratifiedSplit(
        filas.map((f) => d.clases![f]!),
        frac,
        SEMILLA_6,
      ),
    multiclase: () =>
      stratifiedSplit(
        filas.map((f) => d.clases![f]!),
        frac,
        SEMILLA_6,
      ),
    numerica: () =>
      quantileSplit(
        filas.map((f) => d.valores![f]!),
        frac,
        SEMILLA_6,
      ),
  })();
  return {
    entrenamiento: enOrden(r.trainIdx.map((i) => filas[i]!)),
    prueba: enOrden(r.testIdx.map((i) => filas[i]!)),
  };
}

function porGrupo(
  d: Diseno,
  filas: readonly number[],
  frac: number,
): { entrenamiento: number[]; prueba: number[] } {
  const orden: string[] = [];
  const filasDe = new Map<string, number[]>();
  for (const f of filas) {
    const u = d.unidades![f]!;
    let lista = filasDe.get(u);
    if (!lista) {
      filasDe.set(u, (lista = []));
      orden.push(u);
    }
    lista.push(f);
  }
  if (orden.length < 2) return { entrenamiento: [...filas], prueba: [] };
  const clasificacion = d.clases !== null;
  const global = clasificacion ? cuentaClases(d, filas) : null;
  // la etiqueta de cada unidad: la clase más rara (en toda la tabla) que aparece en ella
  const etiquetas = orden.map((u) => {
    if (!global) return "-";
    let rara = "";
    let menor = Infinity;
    for (const f of filasDe.get(u)!) {
      const c = d.clases![f]!;
      const n = global.get(c)!;
      if (n < menor || (n === menor && c < rara)) [rara, menor] = [c, n];
    }
    return rara;
  });
  const r = stratifiedSplit(etiquetas, frac, SEMILLA_6);
  const enPrueba = new Set(r.testIdx.map((i) => orden[i]!));
  const prueba: number[] = [];
  const entrenamiento: number[] = [];
  for (const f of filas)
    (enPrueba.has(d.unidades![f]!) ? prueba : entrenamiento).push(f);
  return { entrenamiento, prueba };
}

/**
 * Dónde corta una partición por tiempo: la prueba son las fechas enteras más recientes, de la última
 * hacia atrás, hasta llegar al tamaño pedido. `filas` tienen fecha.
 */
function corteDe(
  d: Diseno,
  filas: readonly number[],
  frac: number,
): string | null {
  const porFecha = new Map<string, number>();
  for (const f of filas) {
    const x = d.fechas![f]!;
    porFecha.set(x, (porFecha.get(x) ?? 0) + 1);
  }
  const distintas = [...porFecha.keys()].sort();
  const meta = Math.max(1, Math.round(filas.length * frac));
  let corte: string | null = null;
  let acumulado = 0;
  for (let i = distintas.length - 1; i >= 0 && acumulado < meta; i--) {
    corte = distintas[i]!;
    acumulado += porFecha.get(corte)!;
  }
  return corte;
}

/** Filas de entrenamiento con fecha desde `corte`: las que una partición por tiempo dejaría para la prueba. */
export function recientes(
  d: Diseno,
  entrenamiento: readonly number[],
  corte: string,
): number {
  return entrenamiento.filter((f) => {
    const x = d.fechas?.[f];
    return x !== null && x !== undefined && x >= corte;
  }).length;
}

function calcularParticion(d: Diseno, p: Parametros): Particion | null {
  if (!disponibles(d).includes(p.esquema) || !parametrosValidos(p)) return null;
  const frac = p.tamano / 100;
  const fuera = {
    sinObjetivo: d.filasTabla - d.filas.length,
    sinFecha: 0,
    sinUnidad: 0,
    unidadesDePrueba: 0,
  };
  if (p.esquema === "estratificada")
    return {
      esquema: p.esquema,
      ...estratificar(d, d.filas, frac),
      hueco: [],
      corte: null,
      fuera,
    };

  let base = [...d.filas];
  if (esTemporal(p.esquema)) {
    const conFecha = base.filter((f) => d.fechas![f] !== null);
    fuera.sinFecha = base.length - conFecha.length;
    base = conFecha;
  }
  if (esPorGrupo(p.esquema)) {
    const conUnidad = base.filter((f) => d.unidades![f] !== null);
    fuera.sinUnidad = base.length - conUnidad.length;
    base = conUnidad;
  }
  if (p.esquema === "grupo")
    return {
      esquema: p.esquema,
      ...porGrupo(d, base, frac),
      hueco: [],
      corte: null,
      fuera,
    };

  const fechas = d.fechas!;
  const corte = corteDe(d, base, frac);
  if (corte === null)
    return {
      esquema: p.esquema,
      entrenamiento: [],
      prueba: [],
      hueco: [],
      corte: null,
      fuera,
    };
  const limite = restar(corte, p.horizonte, p.unidad);
  const prueba = base.filter((f) => fechas[f]! >= corte);
  const hueco = base.filter((f) => fechas[f]! < corte && fechas[f]! >= limite);
  let entrenamiento = base.filter((f) => fechas[f]! < limite);
  if (p.esquema === "tiempo-grupo") {
    const enPrueba = new Set(prueba.map((f) => d.unidades![f]!));
    const antes = entrenamiento.length;
    entrenamiento = entrenamiento.filter((f) => !enPrueba.has(d.unidades![f]!));
    fuera.unidadesDePrueba = antes - entrenamiento.length;
  }
  return { esquema: p.esquema, entrenamiento, prueba, hueco, corte, fuera };
}

// --- la verificación, independiente de la partición -----------------------------------------------

export type Verificacion = {
  /** Filas que aparecen en más de un lado (entrenamiento, prueba, hueco). */
  readonly solapeFilas: number;
  /** Unidades con filas en entrenamiento y en prueba; `null` sin columna de unidad. */
  readonly solapeUnidades: number | null;
  /**
   * Esquemas por tiempo: filas de entrenamiento con fecha a menos de un horizonte de la primera
   * fecha de la prueba. `null` sin columna de fecha o en un esquema que no promete nada del tiempo.
   */
  readonly solapeTiempo: number | null;
};

export function verificar(
  d: Diseno,
  entrenamiento: readonly number[],
  prueba: readonly number[],
  hueco: readonly number[],
  horizonte: {
    readonly cantidad: number;
    readonly unidad: UnidadHorizonte;
  } | null,
): Verificacion {
  const vistas = new Map<number, number>();
  for (const lado of [entrenamiento, prueba, hueco])
    for (const f of new Set(lado)) vistas.set(f, (vistas.get(f) ?? 0) + 1);
  const solapeFilas = [...vistas.values()].filter((n) => n > 1).length;

  let solapeUnidades: number | null = null;
  if (d.unidades) {
    const de = (filas: readonly number[]) =>
      new Set(
        filas.map((f) => d.unidades![f]).filter((u): u is string => u !== null),
      );
    const enPrueba = de(prueba);
    solapeUnidades = [...de(entrenamiento)].filter((u) =>
      enPrueba.has(u),
    ).length;
  }

  let solapeTiempo: number | null = null;
  if (d.fechas && horizonte) {
    const fechas = d.fechas;
    const dePrueba = prueba
      .map((f) => fechas[f])
      .filter((x): x is string => x !== null && x !== undefined)
      .sort();
    if (dePrueba.length === 0) solapeTiempo = 0;
    else {
      const limite = restar(dePrueba[0]!, horizonte.cantidad, horizonte.unidad);
      solapeTiempo = entrenamiento.filter((f) => {
        const x = fechas[f];
        return x !== null && x !== undefined && x >= limite;
      }).length;
    }
  }
  return { solapeFilas, solapeUnidades, solapeTiempo };
}

// --- lo que se cuenta por lado ------------------------------------------------------------------

export type Lado = {
  readonly filas: number;
  readonly unidades: number | null;
  readonly fechaMin: string | null;
  readonly fechaMax: string | null;
  /** Clasificación: cuántas filas de cada clase (todas las clases de la tabla, también las que faltan). */
  readonly clases: Readonly<Record<string, number>> | null;
};

export function contarLado(d: Diseno, filas: readonly number[]): Lado {
  let clases: Record<string, number> | null = null;
  if (d.clases) {
    // Un Map, no un objeto: una clase puede llamarse «constructor» o «__proto__» (S12).
    const cuenta = new Map<string, number>();
    for (const f of d.filas) cuenta.set(d.clases[f]!, 0);
    for (const f of filas)
      cuenta.set(d.clases[f]!, cuenta.get(d.clases[f]!)! + 1);
    clases = Object.fromEntries(cuenta);
  }
  const fechas = d.fechas
    ? filas
        .map((f) => d.fechas![f])
        .filter((x): x is string => x !== null && x !== undefined)
        .sort()
    : [];
  return {
    filas: filas.length,
    unidades: d.unidades
      ? new Set(filas.map((f) => d.unidades![f]).filter((u) => u !== null)).size
      : null,
    fechaMin: fechas[0] ?? null,
    fechaMax: fechas.at(-1) ?? null,
    clases,
  };
}

// --- el sello -----------------------------------------------------------------------------------

/**
 * El sello de la prueba: SHA-256 de una receta escrita, que cualquiera puede rehacer con el mismo
 * CSV: la huella de los datos, el esquema, sus parámetros, la semilla y los índices de la prueba
 * en orden (la primera fila de datos es la 0). Es higiene y trazabilidad, no una promesa: dice si
 * la prueba de hoy es la que se selló, no que nadie la haya mirado.
 */
export function recetaSello(
  huella: string,
  p: Parametros,
  prueba: readonly number[],
): string {
  return [
    RECETA_SELLO,
    `huella=${huella}`,
    `esquema=${p.esquema}`,
    `tamano=${p.tamano}`,
    `horizonte=${esTemporal(p.esquema) ? `${p.horizonte} ${p.unidad}` : "-"}`,
    `semilla=${SEMILLA_6}`,
    `prueba=${prueba.join(",")}`,
  ].join("\n");
}

export type Resultado = {
  readonly particion: Particion;
  readonly verificacion: Verificacion;
  readonly entrenamiento: Lado;
  readonly prueba: Lado;
  /**
   * Con fecha: dónde cortaría una partición por tiempo de este tamaño (en un esquema por tiempo, su
   * corte), y cuántas filas de entrenamiento son de esas fechas recientes (en un esquema por tiempo,
   * ninguna).
   */
  readonly corteReferencia: string | null;
  readonly recientes: number | null;
  /** La misma tabla repartida al azar (estratificada): lo que el esquema elegido evitó. */
  readonly azar: {
    readonly unidades: number | null;
    readonly recientes: number | null;
  } | null;
  readonly sello: string;
};

const RESULTADOS = new WeakMap<CsvTable, Map<string, Resultado | null>>();
/** S16 (S11): cuántas particiones guarda a la vez cada tabla; al pasar de aquí se descarta la más vieja. */
export const RESULTADOS_MAX = 24;

/**
 * Parte, verifica, cuenta y sella. Guardado por tabla, diseño, parámetros y huella: la compuerta,
 * el registro y la pantalla lo piden varias veces por clic, y el sello recorre toda la prueba.
 */
export function partir(
  tabla: CsvTable,
  d: Diseno,
  p: Parametros,
  huella: string,
): Resultado | null {
  // el diseño sale de la tabla y de las respuestas de la etapa 2, y `disenoDe` lo guarda: su
  // identidad basta para distinguirlo
  const clave = JSON.stringify([
    disenoId(d),
    p.esquema,
    p.tamano,
    esTemporal(p.esquema) ? [p.horizonte, p.unidad] : null,
    huella,
  ]);
  let porClave = RESULTADOS.get(tabla);
  if (!porClave) RESULTADOS.set(tabla, (porClave = new Map()));
  if (!porClave.has(clave)) {
    // sin tope, una sesión que prueba muchos tamaños guarda cada partición (índices de hasta 50 000 filas) para siempre
    if (porClave.size >= RESULTADOS_MAX) porClave.delete(porClave.keys().next().value!);
    const particion = calcularParticion(d, p);
    porClave.set(
      clave,
      particion === null
        ? null
        : {
            particion,
            verificacion: verificar(
              d,
              particion.entrenamiento,
              particion.prueba,
              particion.hueco,
              esTemporal(p.esquema)
                ? { cantidad: p.horizonte, unidad: p.unidad }
                : null,
            ),
            entrenamiento: contarLado(d, particion.entrenamiento),
            prueba: contarLado(d, particion.prueba),
            ...comparaciones(d, p, particion),
            sello: sha256TextoSync(recetaSello(huella, p, particion.prueba)),
          },
    );
  }
  return porClave.get(clave) ?? null;
}

/** El corte de referencia, las filas recientes en entrenamiento y lo que habría dado el azar. */
function comparaciones(
  d: Diseno,
  p: Parametros,
  particion: Particion,
): Pick<Resultado, "corteReferencia" | "recientes" | "azar"> {
  const frac = p.tamano / 100;
  const corteReferencia =
    d.fechas === null
      ? null
      : (particion.corte ??
        corteDe(
          d,
          d.filas.filter((f) => d.fechas![f] !== null),
          frac,
        ));
  const azar =
    p.esquema === "estratificada"
      ? null
      : (() => {
          const r = estratificar(d, d.filas, frac);
          return {
            unidades: verificar(d, r.entrenamiento, r.prueba, [], null)
              .solapeUnidades,
            recientes:
              corteReferencia === null
                ? null
                : recientes(d, r.entrenamiento, corteReferencia),
          };
        })();
  return {
    corteReferencia,
    recientes:
      corteReferencia === null
        ? null
        : recientes(d, particion.entrenamiento, corteReferencia),
    azar,
  };
}

const IDS = new WeakMap<Diseno, number>();
let siguienteId = 0;
function disenoId(d: Diseno): number {
  let id = IDS.get(d);
  if (id === undefined) IDS.set(d, (id = ++siguienteId));
  return id;
}
