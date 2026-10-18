// Protocolo DS (S10), etapa 5 — LO QUE YA SE LOGRA SIN MODELO. Antes de abrir cualquier modelo hay
// que saber contra qué compite: lo que se logra sin saber nada (siempre lo más frecuente, siempre
// la mediana) y lo que logra la regla que la gente del usuario aplica HOY. Todo se mide en la
// moneda de la decisión (los costos de la etapa 1) y con la métrica estándar al lado: exactitud
// balanceada en clasificación, error medio en un número.
//
// Es una REFERENCIA, no un resultado: se mide sobre todas las filas (la partición es la etapa 6)
// y la etapa 8 la vuelve a medir sobre la prueba. Ninguna regla de hoy "entrena": se escribe y se
// mide. Solo puede usar columnas que la etapa 4 dejó en «usar» (una regla que mira lo que se
// llena después del resultado también "acertaría").
//
// Compuerta: una referencia calculada y la regla de hoy medida, o «no hay regla» dicho
// explícitamente. Los chequeos se RECALCULAN contra la tabla cargada: un cuaderno con una
// referencia inventada no cumple. Lo que ninguna compuerta puede verificar es que la regla
// escrita sea de verdad la que usa la gente: eso lo dice el usuario.
import { byTask, matchTask } from "@/engine/despacho";
import type { SupervisedTask } from "@/engine/tarea";
import {
  columnValues,
  isNullToken,
  parseNumber,
  type CsvTable,
} from "@/lib/ds/csv";
import { formaDe } from "./etapa1";
import { columnasParaEntrenar } from "./etapa4";
import type {
  DatosEtapa,
  EtapaConstruida,
  Lectura,
  Previas,
  Trampa,
  Valor,
  Veredicto,
} from "./etapas";
import { fechasPorFila } from "./fechas";
import {
  CONDICIONES_MAX,
  VALOR_MAX,
  UNIONES,
  esNumeroCanonico,
  evaluarRegla,
  numeroCanonico,
  problemaDeCondicion,
  type Condicion,
} from "./regla";
import {
  cuantilEmpirico,
  indiceDe,
  nombreClase,
  perfilObjetivo,
  perfilUnidad,
  valoresDe,
  vistaColumna,
  type VistaColumna,
} from "./tabla";
import {
  claveExtra,
  lista,
  mapa,
  numero,
  positivo,
  texto,
  textoLleno,
  type Registro,
} from "./valores";

/** Las dos respuestas de una decisión de sí o no (la regla de hoy en dos clases). */
export const ACTUAR = "actuar";
export const NO_ACTUAR = "no-actuar";

export const REFERENCIA_IDS = [
  "nunca-actuar",
  "siempre-actuar",
  "clase-mayoritaria",
  "opcion-barata",
  "mediana",
  "media",
  "cuantil",
  "ultimo-valor",
] as const;
export type ReferenciaId = (typeof REFERENCIA_IDS)[number];

/** Las referencias que no pueden faltar, por forma de la decisión. */
const OBLIGATORIAS: Readonly<Record<SupervisedTask, readonly ReferenciaId[]>> =
  {
    binaria: ["nunca-actuar", "siempre-actuar"],
    multiclase: ["clase-mayoritaria"],
    numerica: ["mediana", "media"],
  };
const OPCIONALES: Readonly<Record<SupervisedTask, readonly ReferenciaId[]>> = {
  binaria: [],
  multiclase: ["opcion-barata"],
  numerica: ["cuantil", "ultimo-valor"],
};

export const REGLAS = ["", "hay", "ninguna"] as const;

const RESPUESTAS = [
  "regla",
  "regla_columnas",
  "regla_operadores",
  "regla_valores",
  "regla_union",
  "regla_si",
  "regla_no",
] as const;

const CHEQUEOS = [
  "filas",
  "base_ids",
  "base_costo",
  "base_metrica",
  "base_aciertos",
  "base_mayoritaria",
  "clase_mayoritaria",
  "opcion_barata",
  "base_n_sin_anterior",
  "regla_tipos",
  "regla_cumple",
  "regla_vacios",
  "regla_costo",
  "regla_metrica",
  "regla_aciertos",
] as const;

/** Todas las claves que esta etapa puede registrar. */
export const CLAVES_5 = { respuestas: RESPUESTAS, chequeos: CHEQUEOS } as const;

/** Las frases («trampas») que esta etapa puede decir, cada una con su texto `{es, en}`. */
export const TRAMPAS_5 = [
  "mayoritaria",
  "mediana",
  "regla",
  "regla-peor",
  "regla-mejor",
  "regla-igual",
  "sin-regla",
  "sin-anterior",
] as const;

// --- medir ---------------------------------------------------------------------------------

/** Lo que se mide de cada referencia o de la regla, por decisión (no por cada 100). */
export type Medicion = {
  /** Costo medio por decisión, con los costos de la etapa 1. */
  readonly costo: number;
  /** Exactitud balanceada (clasificación) o error medio absoluto (un número). */
  readonly metrica: number;
  /** Fracción de filas acertadas (solo clasificación). */
  readonly aciertos: number | null;
};
export type Referencia5 = Medicion & { readonly id: ReferenciaId };

/** El costo por decisión llevado a «por cada 100 decisiones», sin el ruido de la coma flotante (18.15 × 100). */
export const por100 = (costo: number): number =>
  Number((costo * 100).toPrecision(12));

const promedio = (xs: readonly number[]) =>
  xs.reduce((a, b) => a + b, 0) / xs.length;

/** Mide predicciones de clase: costo = lo que cuesta cada fila mal dicha, según su clase REAL. */
function medidorDeClases(
  verdad: readonly string[],
  costoClase: ReadonlyMap<string, number>,
): (prediccion: readonly string[]) => Medicion {
  const totales = new Map<string, number>();
  for (const v of verdad) totales.set(v, (totales.get(v) ?? 0) + 1);
  return (prediccion) => {
    let costo = 0;
    let bien = 0;
    const bienPorClase = new Map<string, number>();
    verdad.forEach((v, i) => {
      if (prediccion[i] === v) {
        bien += 1;
        bienPorClase.set(v, (bienPorClase.get(v) ?? 0) + 1);
      } else costo += costoClase.get(v) ?? 0;
    });
    // balanceada: la media de lo que se acierta en cada clase que tiene filas
    const recalls = [...totales].map(
      ([clase, total]) => (bienPorClase.get(clase) ?? 0) / total,
    );
    return {
      costo: costo / verdad.length,
      metrica: promedio(recalls),
      aciertos: bien / verdad.length,
    };
  };
}

/** Mide estimaciones: pérdida asimétrica con tus costos (la misma de la etapa 2) y error medio. */
function medidorDeNumeros(
  y: readonly number[],
  costoSub: number,
  costoSobre: number,
): (prediccion: readonly number[]) => Medicion {
  return (prediccion) => {
    let costo = 0;
    let error = 0;
    y.forEach((v, i) => {
      const q = prediccion[i]!;
      costo += costoSub * Math.max(v - q, 0) + costoSobre * Math.max(q - v, 0);
      error += Math.abs(v - q);
    });
    return {
      costo: costo / y.length,
      metrica: error / y.length,
      aciertos: null,
    };
  };
}

function mediana(ordenados: readonly number[]): number {
  const m = ordenados.length >> 1;
  return ordenados.length % 2 === 1
    ? ordenados[m]!
    : (ordenados[m - 1]! + ordenados[m]!) / 2;
}

// --- las referencias de la tabla ---------------------------------------------------------

/** Lo que se calcula de la tabla sin la regla: las referencias y lo necesario para medir una regla. */
export type Base5 = {
  readonly forma: SupervisedTask;
  /** Índices de las filas medidas: las que tienen objetivo (y, en un número, que se lee como número). */
  readonly filas: readonly number[];
  readonly referencias: readonly Referencia5[];
  /** Cuál de las referencias es «lo más frecuente» (solo clasificación). */
  readonly mayoritaria: ReferenciaId | null;
  /** Multiclase: el nombre de la clase más frecuente y de la opción fija más barata. */
  readonly claseMayoritaria: string | null;
  readonly opcionBarata: string | null;
  /** Último valor por unidad: filas sin valor anterior de su unidad, que usaron la mediana. */
  readonly nSinAnterior: number | null;
  /** Las opciones de la etapa 1 (multiclase), en su orden. */
  readonly opciones: readonly string[];
  readonly medirClases: ((p: readonly string[]) => Medicion) | null;
  readonly medirNumeros: ((p: readonly number[]) => Medicion) | null;
};

function referencia(id: ReferenciaId, m: Medicion): Referencia5 {
  return { id, ...m };
}

function calcular(
  tabla: CsvTable,
  forma: SupervisedTask,
  r1: Registro,
  r2: Registro,
): Base5 | null {
  const objetivo = textoLleno(r2, "objetivo");
  if (objetivo === null) return null;
  const indice = indiceDe(tabla, objetivo);
  if (indice < 0) return null;
  const crudos = columnValues(tabla, indice);
  const pideNumero = byTask(forma, {
    binaria: false,
    multiclase: false,
    numerica: true,
  });
  const filas = crudos
    .map((_, i) => i)
    .filter((i) => !isNullToken(crudos[i]!))
    .filter((i) => !pideNumero || parseNumber(crudos[i]!) !== null);
  if (filas.length === 0) return null;
  const n = filas.length;
  const sinOpciones: readonly string[] = [];
  const base = {
    forma,
    filas,
    claseMayoritaria: null,
    opcionBarata: null,
    nSinAnterior: null,
    opciones: sinOpciones,
    medirClases: null,
    medirNumeros: null,
  } as const;

  return matchTask(forma, {
    binaria: (): Base5 | null => {
      const positivoTxt = texto(r2, "positivo") ?? "";
      const [fp, fn] = [positivo(r1, "c_fp"), positivo(r1, "c_fn")];
      if (fp === null || fn === null) return null;
      const numerico = perfilNumerico(crudos);
      const verdad = filas.map((i) =>
        nombreClase(crudos[i]!, numerico) === positivoTxt ? ACTUAR : NO_ACTUAR,
      );
      const nPositivas = verdad.filter((v) => v === ACTUAR).length;
      if (nPositivas === 0) return null;
      const medir = medidorDeClases(
        verdad,
        new Map([
          [ACTUAR, fn],
          [NO_ACTUAR, fp],
        ]),
      );
      const referencias = [
        referencia("nunca-actuar", medir(verdad.map(() => NO_ACTUAR))),
        referencia("siempre-actuar", medir(verdad.map(() => ACTUAR))),
      ];
      return {
        ...base,
        referencias,
        // en un empate manda «nunca actuar» (la tasa base no supera la mitad)
        mayoritaria:
          nPositivas > n - nPositivas ? "siempre-actuar" : "nunca-actuar",
        medirClases: medir,
      };
    },
    multiclase: (): Base5 | null => {
      const perfil = perfilObjetivo(tabla, objetivo);
      const clases = perfil?.clases ?? null;
      const opciones = lista(r1, "opciones");
      const costos = mapa(r1, "costos");
      if (!clases || !opciones || !costos) return null;
      const costoClase = new Map<string, number>();
      for (const k of opciones) {
        const c = Object.hasOwn(costos, k) ? costos[k]! : 0;
        if (!(c > 0)) return null;
        costoClase.set(k, c);
      }
      if (Object.keys(clases).some((k) => !costoClase.has(k))) return null;
      const numerico = perfilNumerico(crudos);
      const verdad = filas.map((i) => nombreClase(crudos[i]!, numerico));
      // el mismo desempate que la etapa 2: la primera entre las más frecuentes
      const [mayor] = Object.entries(clases).sort(
        ([, a], [, b]) => b - a,
      )[0] ?? [""];
      // la opción fija más barata: la que más cuesta NO acertar (n_k · costo_k), la primera en un empate
      let barata = opciones[0]!;
      let peso = -1;
      for (const k of opciones) {
        const p =
          (Object.hasOwn(clases, k) ? clases[k]! : 0) * costoClase.get(k)!;
        if (p > peso) {
          peso = p;
          barata = k;
        }
      }
      const medir = medidorDeClases(verdad, costoClase);
      const referencias = [
        referencia("clase-mayoritaria", medir(verdad.map(() => mayor))),
        ...(barata === mayor
          ? []
          : [referencia("opcion-barata", medir(verdad.map(() => barata)))]),
      ];
      return {
        ...base,
        referencias,
        mayoritaria: "clase-mayoritaria",
        claseMayoritaria: mayor,
        opcionBarata: barata,
        opciones,
        medirClases: medir,
      };
    },
    numerica: (): Base5 | null => {
      const [sub, sobre] = [positivo(r1, "c_sub"), positivo(r1, "c_sobre")];
      if (sub === null || sobre === null) return null;
      const y = filas.map((i) => parseNumber(crudos[i]!)!);
      const medir = medidorDeNumeros(y, sub, sobre);
      const ordenados = [...y].sort((a, b) => a - b);
      const constante = (c: number) => medir(y.map(() => c));
      const med = mediana(ordenados);
      const referencias: Referencia5[] = [
        referencia("mediana", constante(med)),
        referencia("media", constante(promedio(y))),
      ];
      const nivel = sub / (sub + sobre);
      if (Math.abs(nivel - 0.5) > 1e-9)
        referencias.push(
          referencia("cuantil", constante(cuantilEmpirico(ordenados, nivel))),
        );
      const ultimo = ultimoValorPorUnidad(tabla, r2, filas, y, med);
      if (ultimo)
        referencias.push(referencia("ultimo-valor", medir(ultimo.prediccion)));
      return {
        ...base,
        referencias,
        mayoritaria: null,
        nSinAnterior: ultimo?.nSinAnterior ?? null,
        medirNumeros: medir,
      };
    },
  });
}

/** ¿Todos los valores no vacíos del objetivo se leen como número? (para nombrar las clases). */
function perfilNumerico(crudos: readonly string[]): boolean {
  const llenos = crudos.filter((v) => !isNullToken(v));
  return llenos.length > 0 && llenos.every((v) => parseNumber(v) !== null);
}

/**
 * Último valor por unidad: cada fila predice con el valor de la MISMA unidad en la fecha anterior
 * más cercana (si hay varias ese día, la última de la tabla). La primera fila de cada unidad, o
 * una sin unidad o sin fecha, no tiene anterior y usa la mediana: se cuentan. Solo existe si la
 * etapa 2 registró una columna de unidad que se repite y una columna de fecha que se lee.
 */
function ultimoValorPorUnidad(
  tabla: CsvTable,
  r2: Registro,
  filas: readonly number[],
  y: readonly number[],
  respaldo: number,
): { prediccion: number[]; nSinAnterior: number } | null {
  if (r2.unidad !== "columna" || r2.momento !== "columna") return null;
  const [unidadCol, fechaCol] = [
    textoLleno(r2, "unidad_columna"),
    textoLleno(r2, "momento_columna"),
  ];
  if (unidadCol === null || fechaCol === null) return null;
  if (indiceDe(tabla, unidadCol) < 0 || indiceDe(tabla, fechaCol) < 0)
    return null;
  if (!perfilUnidad(tabla, unidadCol).repetida) return null;
  const fechas = fechasPorFila(
    valoresDe(tabla, fechaCol),
    r2.orden_fecha === "dia-mes" || r2.orden_fecha === "mes-dia"
      ? r2.orden_fecha
      : null,
  );
  if (!fechas) return null;
  const unidades = valoresDe(tabla, unidadCol);
  const porUnidad = new Map<string, { p: number; fecha: string }[]>();
  filas.forEach((fila, p) => {
    const u = unidades[fila]!;
    const fecha = fechas.fechas[fila];
    if (isNullToken(u) || fecha === null || fecha === undefined) return;
    const clave = u.trim();
    const dueña = porUnidad.get(clave);
    if (dueña) dueña.push({ p, fecha });
    else porUnidad.set(clave, [{ p, fecha }]);
  });
  const prediccion = filas.map(() => respaldo);
  const conAnterior = new Set<number>();
  for (const entradas of porUnidad.values()) {
    entradas.sort((a, b) =>
      a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.p - b.p,
    );
    let anterior: number | null = null;
    let i = 0;
    while (i < entradas.length) {
      let j = i;
      while (j < entradas.length && entradas[j]!.fecha === entradas[i]!.fecha)
        j += 1;
      if (anterior !== null)
        for (let k = i; k < j; k++) {
          prediccion[entradas[k]!.p] = y[anterior]!;
          conAnterior.add(entradas[k]!.p);
        }
      anterior = entradas[j - 1]!.p;
      i = j;
    }
  }
  return { prediccion, nSinAnterior: filas.length - conAnterior.size };
}

const CACHE = new WeakMap<CsvTable, Map<string, Base5 | null>>();

/**
 * Las referencias de la tabla, con lo que registraron las etapas 1 y 2. Se guardan por tabla y
 * por esas respuestas: `evaluar`, `registrar`, `recalcular` y la pantalla las piden varias veces
 * por clic. Lo guardado sale SOLO de la tabla, nunca de lo que llega en un cuaderno.
 */
export function referencias5(tabla: CsvTable, previas: Previas): Base5 | null {
  const [e1, e2] = [previas[1], previas[2]];
  if (!e1 || !e2) return null;
  const forma = formaDe(e1.respuestas);
  if (!forma) return null;
  const [r1, r2] = [e1.respuestas, e2.respuestas];
  const clave = JSON.stringify([
    forma,
    textoLleno(r2, "objetivo"),
    texto(r2, "positivo"),
    r2.unidad,
    texto(r2, "unidad_columna"),
    r2.momento,
    texto(r2, "momento_columna"),
    r2.orden_fecha,
    r1.c_fp,
    r1.c_fn,
    r1.c_sub,
    r1.c_sobre,
    r1.opciones,
    r1.costos,
  ]);
  let porClave = CACHE.get(tabla);
  if (!porClave) CACHE.set(tabla, (porClave = new Map()));
  if (!porClave.has(clave)) porClave.set(clave, calcular(tabla, forma, r1, r2));
  return porClave.get(clave) ?? null;
}

// --- las columnas de la regla --------------------------------------------------------------

const VISTAS = new WeakMap<CsvTable, Map<string, VistaColumna>>();

/** Cómo lee el Protocolo una columna de la tabla (guardada por tabla); `null` si no existe. */
export function vistaDe(tabla: CsvTable, columna: string): VistaColumna | null {
  const indice = indiceDe(tabla, columna);
  if (indice < 0) return null;
  let porNombre = VISTAS.get(tabla);
  if (!porNombre) VISTAS.set(tabla, (porNombre = new Map()));
  let vista = porNombre.get(columna);
  if (!vista) {
    vista = vistaColumna(columna, columnValues(tabla, indice));
    porNombre.set(columna, vista);
  }
  return vista;
}

/** Los valores distintos de una columna de texto, del más al menos frecuente (para elegirlos). */
export function valoresDeColumna(
  tabla: CsvTable,
  columna: string,
): { valores: string[]; distintos: number } | null {
  const vista = vistaDe(tabla, columna);
  if (!vista || vista.tipo !== "texto") return null;
  const cuenta = new Map<string, number>();
  for (const v of vista.valores)
    if (v !== null) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  const valores = [...cuenta]
    .sort(([a, na], [b, nb]) => nb - na || (a < b ? -1 : a > b ? 1 : 0))
    .map(([v]) => v);
  return { valores, distintos: valores.length };
}

// --- lo que el usuario responde y lo que el código registra ----------------------------------

/** Lo que el usuario escribe en la pantalla de la etapa 5. Las listas van alineadas por condición. */
export type EntradaEtapa5 = {
  /** `""` sin elegir · `"hay"` hay una regla · `"ninguna"` no hay regla. */
  readonly regla: string;
  readonly columnas: readonly string[];
  readonly operadores: readonly string[];
  readonly valores: readonly string[];
  /** `"y"` u `"o"` con dos condiciones; `""` con una. */
  readonly union: string;
  /** Lo que se hace (o estima) cuando se cumple la regla y cuando no. */
  readonly si: string;
  readonly no: string;
};

export const ENTRADA_5_VACIA: EntradaEtapa5 = {
  regla: "",
  columnas: [],
  operadores: [],
  valores: [],
  union: "",
  si: "",
  no: "",
};

/** Lo que se respondió, leído de lo registrado (el inverso de `datosEtapa5`). */
export function entradaDesdeRespuestas(r: Registro): EntradaEtapa5 {
  return {
    regla: texto(r, "regla") ?? "",
    columnas: lista(r, "regla_columnas") ?? [],
    operadores: lista(r, "regla_operadores") ?? [],
    valores: lista(r, "regla_valores") ?? [],
    union: texto(r, "regla_union") ?? "",
    si: texto(r, "regla_si") ?? "",
    no: texto(r, "regla_no") ?? "",
  };
}

/** Las condiciones de la entrada, o `null` si las listas no están alineadas. */
export function condicionesDe(e: EntradaEtapa5): Condicion[] | null {
  const n = e.columnas.length;
  if (e.operadores.length !== n || e.valores.length !== n) return null;
  return e.columnas.map((columna, i) => ({
    columna,
    operador: e.operadores[i]!,
    valor: e.valores[i]!,
  }));
}

/** La entrada como la guarda el cuaderno: números en su forma canónica, textos sin espacios en los extremos. */
function normalizar(
  tabla: CsvTable,
  forma: SupervisedTask | null,
  e: EntradaEtapa5,
): EntradaEtapa5 {
  if (e.regla !== "hay")
    return {
      ...ENTRADA_5_VACIA,
      regla: e.regla === "ninguna" ? "ninguna" : "",
    };
  const condiciones = condicionesDe(e) ?? [];
  const valores = condiciones.map(({ columna, valor }) => {
    const vista = vistaDe(tabla, columna);
    return vista?.tipo === "numero"
      ? (numeroCanonico(valor) ?? valor)
      : valor.trim();
  });
  const salida = (valor: string) =>
    forma === null
      ? valor
      : byTask(forma, {
          binaria: () => valor,
          multiclase: () => valor,
          numerica: () => numeroCanonico(valor) ?? valor.trim(),
        })();
  const binaria =
    forma !== null &&
    byTask(forma, { binaria: true, multiclase: false, numerica: false });
  return {
    regla: "hay",
    columnas: [...e.columnas],
    operadores: [...e.operadores],
    valores,
    union: e.columnas.length >= 2 ? e.union : "",
    si: binaria ? ACTUAR : salida(e.si),
    no: binaria ? NO_ACTUAR : salida(e.no),
  };
}

type Medida = {
  readonly tipos: readonly string[];
  readonly cumple: number | null;
  readonly vacios: number | null;
  readonly medicion: Medicion | null;
};
const SIN_MEDIDA: Medida = {
  tipos: [],
  cumple: null,
  vacios: null,
  medicion: null,
};

/** Mide la regla escrita en las filas medidas. Parcial si faltan las salidas: cuenta lo que sí se sabe. */
function medirRegla(
  tabla: CsvTable,
  base: Base5 | null,
  e: EntradaEtapa5,
): Medida {
  if (e.regla !== "hay") return SIN_MEDIDA;
  const vistas = e.columnas.map((c) => vistaDe(tabla, c));
  const tipos = vistas.map((v) => v?.tipo ?? "ausente");
  const condiciones = condicionesDe(e);
  if (!base || !condiciones || vistas.some((v) => v === null))
    return { ...SIN_MEDIDA, tipos };
  const med = evaluarRegla(
    vistas as VistaColumna[],
    condiciones,
    e.union,
    base.filas,
  );
  if (!med) return { ...SIN_MEDIDA, tipos };
  const cuenta = { tipos, cumple: med.nCumple, vacios: med.vacios };
  const medicion = matchTask(base.forma, {
    binaria: (): Medicion | null =>
      e.si === ACTUAR && e.no === NO_ACTUAR && base.medirClases
        ? base.medirClases(med.cumple.map((c) => (c ? ACTUAR : NO_ACTUAR)))
        : null,
    multiclase: (): Medicion | null =>
      base.opciones.includes(e.si) &&
      base.opciones.includes(e.no) &&
      base.medirClases
        ? base.medirClases(med.cumple.map((c) => (c ? e.si : e.no)))
        : null,
    numerica: (): Medicion | null =>
      esNumeroCanonico(e.si) && esNumeroCanonico(e.no) && base.medirNumeros
        ? base.medirNumeros(med.cumple.map((c) => Number(c ? e.si : e.no)))
        : null,
  });
  return { ...cuenta, medicion };
}

/** Los chequeos de la etapa: las referencias de la tabla y la medida de la regla escrita. */
export function chequeos5(
  tabla: CsvTable,
  base: Base5 | null,
  entrada: EntradaEtapa5,
): Record<string, Valor> {
  const mapaDe = (f: (r: Referencia5) => number | null) =>
    Object.fromEntries(
      (base?.referencias ?? []).flatMap((r) => {
        const v = f(r);
        return v === null ? [] : [[r.id, v] as const];
      }),
    );
  const regla = medirRegla(tabla, base, entrada);
  return {
    filas: base?.filas.length ?? 0,
    base_ids: (base?.referencias ?? []).map((r) => r.id),
    base_costo: mapaDe((r) => r.costo),
    base_metrica: mapaDe((r) => r.metrica),
    base_aciertos: mapaDe((r) => r.aciertos),
    base_mayoritaria: base?.mayoritaria ?? null,
    clase_mayoritaria: base?.claseMayoritaria ?? null,
    opcion_barata: base?.opcionBarata ?? null,
    base_n_sin_anterior: base?.nSinAnterior ?? null,
    regla_tipos: [...regla.tipos],
    regla_cumple: regla.cumple,
    regla_vacios: regla.vacios,
    regla_costo: regla.medicion?.costo ?? null,
    regla_metrica: regla.medicion?.metrica ?? null,
    regla_aciertos: regla.medicion?.aciertos ?? null,
  };
}

/** Arma lo que la etapa 5 registra: las respuestas (normalizadas) y los chequeos de la tabla. */
export function datosEtapa5(
  tabla: CsvTable,
  entrada: EntradaEtapa5,
  previas: Previas,
): DatosEtapa {
  const base = referencias5(tabla, previas);
  const forma = previas[1] ? formaDe(previas[1].respuestas) : null;
  const e = normalizar(tabla, forma, entrada);
  return {
    respuestas: {
      regla: e.regla,
      regla_columnas: [...e.columnas],
      regla_operadores: [...e.operadores],
      regla_valores: [...e.valores],
      regla_union: e.union,
      regla_si: e.si,
      regla_no: e.no,
    },
    chequeos: chequeos5(tabla, base, e),
  };
}

// --- lo registrado: forma, criterio, trampas ---------------------------------------------------

function leer(datos: DatosEtapa): Lectura {
  const r = datos.respuestas;
  const extra = claveExtra(r, RESPUESTAS);
  if (extra) return { ok: false, campo: `respuestas.${extra}` };
  const falta = RESPUESTAS.find((k) => !(k in r));
  if (falta) return { ok: false, campo: `respuestas.${falta}` };
  if (!REGLAS.some((x) => x === r.regla))
    return { ok: false, campo: "respuestas.regla" };
  for (const clave of [
    "regla_columnas",
    "regla_operadores",
    "regla_valores",
  ] as const) {
    const xs = lista(r, clave);
    if (xs === null || xs.length > CONDICIONES_MAX)
      return { ok: false, campo: `respuestas.${clave}` };
  }
  if (
    lista(r, "regla_columnas")!.length !==
      lista(r, "regla_operadores")!.length ||
    lista(r, "regla_columnas")!.length !== lista(r, "regla_valores")!.length
  )
    return { ok: false, campo: "respuestas.regla_valores" };
  if (!lista(r, "regla_valores")!.every((v) => v.length <= VALOR_MAX))
    return { ok: false, campo: "respuestas.regla_valores" };
  if (r.regla_union !== "" && !UNIONES.some((u) => u === r.regla_union))
    return { ok: false, campo: "respuestas.regla_union" };
  for (const clave of ["regla_si", "regla_no"] as const)
    if (texto(r, clave) === null || texto(r, clave)!.length > VALOR_MAX)
      return { ok: false, campo: `respuestas.${clave}` };

  const c = datos.chequeos;
  const intrusa = claveExtra(c, CHEQUEOS);
  if (intrusa) return { ok: false, campo: `chequeos.${intrusa}` };
  const ausente = CHEQUEOS.find((k) => !(k in c));
  if (ausente) return { ok: false, campo: `chequeos.${ausente}` };
  for (const clave of ["base_ids", "regla_tipos"] as const)
    if (lista(c, clave) === null)
      return { ok: false, campo: `chequeos.${clave}` };
  for (const clave of ["base_costo", "base_metrica", "base_aciertos"] as const)
    if (mapa(c, clave) === null)
      return { ok: false, campo: `chequeos.${clave}` };
  if (numero(c, "filas") === null)
    return { ok: false, campo: "chequeos.filas" };
  for (const clave of [
    "base_n_sin_anterior",
    "regla_cumple",
    "regla_vacios",
    "regla_costo",
    "regla_metrica",
    "regla_aciertos",
  ] as const)
    if (c[clave] !== null && numero(c, clave) === null)
      return { ok: false, campo: `chequeos.${clave}` };
  for (const clave of [
    "base_mayoritaria",
    "clase_mayoritaria",
    "opcion_barata",
  ] as const)
    if (c[clave] !== null && typeof c[clave] !== "string")
      return { ok: false, campo: `chequeos.${clave}` };
  return { ok: true };
}

const tienePropia = (m: Readonly<Record<string, number>>, k: string) =>
  Object.hasOwn(m, k);

function criterio(datos: DatosEtapa, previas: Previas): Veredicto {
  const [e1, e4] = [previas[1], previas[4]];
  if (!e1 || !previas[2] || !previas[3] || !e4)
    return { tipo: "falta", faltan: ["etapas-previas"] };
  const forma = formaDe(e1.respuestas);
  if (!forma) return { tipo: "falta", faltan: ["etapas-previas"] };
  const [r, c] = [datos.respuestas, datos.chequeos];
  const faltan = new Set<string>();

  // --- las referencias: las que no pueden faltar, ninguna de otra forma, cada una medida
  const ids = lista(c, "base_ids") ?? [];
  const costo = mapa(c, "base_costo") ?? {};
  const permitidas = [...OBLIGATORIAS[forma], ...OPCIONALES[forma]];
  if (
    !OBLIGATORIAS[forma].every((id) => ids.includes(id)) ||
    ids.some((id) => !permitidas.some((p) => p === id)) ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !tienePropia(costo, id))
  )
    faltan.add("referencias");

  // --- la regla de hoy
  const regla = texto(r, "regla") ?? "";
  const [columnas, operadores, valores] = [
    lista(r, "regla_columnas") ?? [],
    lista(r, "regla_operadores") ?? [],
    lista(r, "regla_valores") ?? [],
  ];
  const [union, si, no] = [
    texto(r, "regla_union") ?? "",
    texto(r, "regla_si") ?? "",
    texto(r, "regla_no") ?? "",
  ];
  if (regla === "") faltan.add("regla");
  else if (regla === "ninguna") {
    if (
      columnas.length + operadores.length + valores.length > 0 ||
      union + si + no !== ""
    )
      faltan.add("regla-condicion");
  } else if (regla === "hay") {
    const n = columnas.length;
    if (
      n < 1 ||
      n > CONDICIONES_MAX ||
      operadores.length !== n ||
      valores.length !== n ||
      columnas.some((x) => x === "") ||
      operadores.some((x) => x === "") ||
      valores.some((x) => x === "")
    )
      faltan.add("regla-condicion");
    else {
      if (n === 1 ? union !== "" : !UNIONES.some((u) => u === union))
        faltan.add("regla-union");
      const usables = new Set(columnasParaEntrenar(e4));
      const tipos = lista(c, "regla_tipos") ?? [];
      columnas.forEach((col, i) => {
        const tipo = tipos[i];
        if (!usables.has(col) || (tipo !== "numero" && tipo !== "texto")) {
          faltan.add("regla-columna");
          return;
        }
        const problema = problemaDeCondicion(tipo, operadores[i]!, valores[i]!);
        if (problema === "operador") faltan.add("regla-operador");
        if (problema === "valor") faltan.add("regla-valor");
      });
      const salidaBien = byTask(forma, {
        binaria: () => si === ACTUAR && no === NO_ACTUAR,
        multiclase: () => {
          const opciones = lista(e1.respuestas, "opciones") ?? [];
          return opciones.includes(si) && opciones.includes(no);
        },
        numerica: () => esNumeroCanonico(si) && esNumeroCanonico(no),
      })();
      if (!salidaBien) faltan.add("regla-salida");
      if (
        faltan.size === 0 &&
        (numero(c, "regla_costo") === null ||
          numero(c, "regla_metrica") === null)
      )
        faltan.add("regla-medida");
    }
  } else faltan.add("regla");
  return faltan.size > 0
    ? { tipo: "falta", faltan: [...faltan] }
    : { tipo: "cumple" };
}

/** Lo que la etapa 5 evitó, dicho con los números del usuario (por cada 100 decisiones). */
function trampas(datos: DatosEtapa, previas: Previas): readonly Trampa[] {
  const [r, c] = [datos.respuestas, datos.chequeos];
  const forma = previas[1] ? formaDe(previas[1].respuestas) : null;
  if (!forma) return [];
  const unidad = textoLleno(previas[1]!.respuestas, "unidad") ?? "";
  const costos = Object.values(mapa(c, "base_costo") ?? {});
  const salida: Trampa[] = [];
  if (costos.length === 0) return salida;
  const mejor100 = por100(Math.min(...costos));
  const mayoritaria = texto(c, "base_mayoritaria");
  const aciertos = mapa(c, "base_aciertos") ?? {};
  matchTask(forma, {
    binaria: () => frecuente(mayoritaria, aciertos, salida),
    multiclase: () => frecuente(mayoritaria, aciertos, salida),
    numerica: () => {
      const error = mapa(c, "base_metrica")?.mediana;
      if (error !== undefined)
        salida.push({ clave: "mediana", params: { error } });
    },
  });
  const sinAnterior = numero(c, "base_n_sin_anterior");
  if (sinAnterior !== null && sinAnterior > 0)
    salida.push({ clave: "sin-anterior", params: { n: sinAnterior } });

  const regla = texto(r, "regla");
  const reglaCosto = numero(c, "regla_costo");
  if (regla === "ninguna")
    salida.push({ clave: "sin-regla", params: { mejor100, unidad } });
  else if (regla === "hay" && reglaCosto !== null) {
    const regla100 = por100(reglaCosto);
    salida.push({ clave: "regla", params: { regla100, unidad } });
    const tolerancia = 1e-9 * Math.max(1, Math.abs(mejor100));
    salida.push({
      clave:
        regla100 > mejor100 + tolerancia
          ? "regla-peor"
          : regla100 < mejor100 - tolerancia
            ? "regla-mejor"
            : "regla-igual",
      params: { regla100, mejor100, unidad },
    });
  }
  return salida;
}

function frecuente(
  mayoritaria: string | null,
  aciertos: Readonly<Record<string, number>>,
  salida: Trampa[],
): void {
  if (mayoritaria !== null && tienePropia(aciertos, mayoritaria))
    salida.push({
      clave: "mayoritaria",
      params: { aciertosPct: aciertos[mayoritaria]! },
    });
}

export type ResumenEtapa5 = {
  readonly regla: string;
  readonly condiciones: readonly Condicion[];
  /** `numero` o `texto` por condición (el operador se lee según el tipo). */
  readonly tipos: readonly string[];
  readonly union: string;
  readonly si: string;
  readonly no: string;
  readonly filas: number;
  readonly cumple: number | null;
  readonly reglaCosto100: number | null;
  /** Las referencias, en el orden registrado, con su costo por cada 100 decisiones. */
  readonly referencias: readonly { id: string; costo100: number }[];
  readonly mejor: { id: string; costo100: number } | null;
  readonly claseMayoritaria: string | null;
  readonly opcionBarata: string | null;
};

/** Lo esencial de una evidencia de la etapa 5, para el cuaderno (no las listas ni los mapas crudos). */
export function resumenEtapa5(datos: DatosEtapa): ResumenEtapa5 {
  const [r, c] = [datos.respuestas, datos.chequeos];
  const costo = mapa(c, "base_costo") ?? {};
  const referencias = (lista(c, "base_ids") ?? [])
    .filter((id) => tienePropia(costo, id))
    .map((id) => ({ id, costo100: por100(costo[id]!) }));
  const mejor = referencias.reduce<{ id: string; costo100: number } | null>(
    (m, x) => (m === null || x.costo100 < m.costo100 ? x : m),
    null,
  );
  const reglaCosto = numero(c, "regla_costo");
  return {
    regla: texto(r, "regla") ?? "",
    condiciones: condicionesDe(entradaDesdeRespuestas(r)) ?? [],
    tipos: lista(c, "regla_tipos") ?? [],
    union: texto(r, "regla_union") ?? "",
    si: texto(r, "regla_si") ?? "",
    no: texto(r, "regla_no") ?? "",
    filas: numero(c, "filas") ?? 0,
    cumple: numero(c, "regla_cumple"),
    reglaCosto100: reglaCosto === null ? null : por100(reglaCosto),
    referencias,
    mejor,
    claseMayoritaria: texto(c, "clase_mayoritaria"),
    opcionBarata: texto(c, "opcion_barata"),
  };
}

/** Vuelve a calcular lo que esta etapa registra sobre la tabla cargada, con esa misma regla. */
function recalcular(
  datos: DatosEtapa,
  previas: Previas,
  tabla: CsvTable,
): DatosEtapa {
  return datosEtapa5(tabla, entradaDesdeRespuestas(datos.respuestas), previas);
}

export const ETAPA_5: EtapaConstruida = {
  id: 5,
  construida: true,
  dependeDeDatos: true,
  terminos: ["linea-base", "regla-de-hoy", "costo-esperado"],
  preguntas: ["regla", "condiciones", "salida"],
  chequeos: ["referencias", "costo", "metrica", "aciertos"],
  leer,
  criterio,
  recalcular,
  trampas,
};
