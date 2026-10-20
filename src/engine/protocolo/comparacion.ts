// Protocolo DS (S12), etapa 7 — EL GANADOR CONTRA LO QUE YA SE LOGRA SIN MODELO, PLIEGUE A PLIEGUE, EN LA
// MONEDA DE TU DECISIÓN. En cada pliegue, la línea base de la etapa 5 se AJUSTA con el entrenamiento del
// pliegue (la clase más frecuente, la opción fija más barata, la mediana, el cuantil de tus costos, el
// último valor de la unidad…), se suma la regla de hoy (fija), y se elige la que menos cuesta en ese
// entrenamiento; después se mide en la validación del pliegue, como el ganador con sus predicciones fuera
// de pliegue. Elegirla con todas las filas metería la validación en la elección.
//
// Costo medio por decisión con los costos de la etapa 1. La diferencia pareada «línea base − ganador» por
// pliegue da su media, su error estándar y un intervalo del 95 % con la t de k − 1 grados: «supera» solo si
// el intervalo entero queda por encima de cero. Los pliegues comparten filas de entrenamiento, así que el
// intervalo es optimista (Nadeau y Bengio, 2003): por eso la medida sin sesgo es la prueba de la etapa 8.
import { matchByTask, matchTask } from "@/engine/despacho";
import type { CsvTable } from "@/lib/ds/csv";
import { formaDe } from "./etapa1";
import type { Previas } from "./etapas";
import { condicionesDe, entradaDesdeRespuestas, vistaDe } from "./etapa5";
import { t975 } from "./muestra";
import type { Diseno } from "./particion";
import type { Pliegue } from "./pliegues";
import { esNumeroCanonico, evaluarRegla } from "./regla";
import { cuantilEmpirico, type VistaColumna } from "./tabla";
import { lista, mapa, numero, positivo } from "./valores";

export type Costos =
  | {
      readonly task: "binaria";
      readonly fp: number;
      readonly fn: number;
      /** Desde qué probabilidad de «hay que actuar» conviene actuar (etapa 1). */
      readonly umbral: number;
    }
  | {
      readonly task: "multiclase";
      readonly costoClase: ReadonlyMap<string, number>;
      readonly opciones: readonly string[];
    }
  | { readonly task: "numerica"; readonly sub: number; readonly sobre: number };

/** Una predicción: actuar o no (dos clases), una clase, o un número. */
export type Pred = boolean | string | number;

/** La regla de hoy de la etapa 5, evaluada: por fila de la tabla, ¿se cumple?, y qué sale en cada caso. */
export type ReglaEvaluada = {
  readonly cumple: ReadonlyMap<number, boolean>;
  readonly si: Pred;
  readonly no: Pred;
};

/** Lo que el ganador predijo en la validación de un pliegue, alineado con sus filas. */
export type PrediccionGanador = {
  readonly pred: readonly (number | string)[];
  /** Dos clases: la probabilidad de «hay que actuar»; null si el modelo no la da. */
  readonly proba: readonly number[] | null;
};

/** Los costos de la etapa 1, o `null` si no están completos. */
export function costosDe(previas: Previas): Costos | null {
  const e1 = previas[1];
  if (!e1) return null;
  const r = e1.respuestas;
  const forma = formaDe(r);
  if (!forma) return null;
  return matchTask(forma, {
    binaria: (): Costos | null => {
      const [fp, fn] = [positivo(r, "c_fp"), positivo(r, "c_fn")];
      if (fp === null || fn === null) return null;
      return {
        task: "binaria",
        fp,
        fn,
        umbral: numero(e1.chequeos, "umbral") ?? fp / (fp + fn),
      };
    },
    multiclase: (): Costos | null => {
      const opciones = lista(r, "opciones");
      const costos = mapa(r, "costos");
      if (!opciones || !costos) return null;
      const costoClase = new Map<string, number>();
      for (const k of opciones)
        costoClase.set(k, Object.hasOwn(costos, k) ? costos[k]! : 0);
      return { task: "multiclase", costoClase, opciones };
    },
    numerica: (): Costos | null => {
      const [sub, sobre] = [positivo(r, "c_sub"), positivo(r, "c_sobre")];
      return sub === null || sobre === null
        ? null
        : { task: "numerica", sub, sobre };
    },
  });
}

/** La regla de hoy (etapa 5) evaluada en las filas dadas, o `null` si la etapa dijo que no hay. */
export function reglaDe(
  tabla: CsvTable,
  previas: Previas,
  costos: Costos,
  filas: readonly number[],
): ReglaEvaluada | null {
  const e5 = previas[5];
  if (!e5) return null;
  const e = entradaDesdeRespuestas(e5.respuestas);
  if (e.regla !== "hay") return null;
  const condiciones = condicionesDe(e);
  const vistas = e.columnas.map((c) => vistaDe(tabla, c));
  if (!condiciones || vistas.some((v) => v === null)) return null;
  const med = evaluarRegla(
    vistas as VistaColumna[],
    condiciones,
    e.union,
    filas,
  );
  if (!med) return null;
  const salidas = matchByTask(costos, {
    binaria: (): [Pred, Pred] => [true, false],
    multiclase: (m): [Pred, Pred] | null =>
      m.opciones.includes(e.si) && m.opciones.includes(e.no)
        ? [e.si, e.no]
        : null,
    numerica: (): [Pred, Pred] | null =>
      esNumeroCanonico(e.si) && esNumeroCanonico(e.no)
        ? [Number(e.si), Number(e.no)]
        : null,
  });
  if (!salidas) return null;
  const cumple = new Map<number, boolean>();
  filas.forEach((f, i) => cumple.set(f, med.cumple[i]!));
  return { cumple, si: salidas[0], no: salidas[1] };
}

/** Lo que cuesta UNA decisión en una fila, según lo que de verdad pasó. */
function costoDe(c: Costos, d: Diseno, f: number, p: Pred): number {
  return matchByTask(c, {
    binaria: (b) => {
      const real = d.clases![f] === d.positivo;
      return real && p !== true ? b.fn : !real && p === true ? b.fp : 0;
    },
    multiclase: (m) => {
      const real = d.clases![f]!;
      return p === real ? 0 : (m.costoClase.get(real) ?? 0);
    },
    numerica: (n) => {
      const y = d.valores![f]!;
      const q = p as number;
      return n.sub * Math.max(y - q, 0) + n.sobre * Math.max(q - y, 0);
    },
  });
}

function costoMedio(
  c: Costos,
  d: Diseno,
  filas: readonly number[],
  predecir: (f: number, i: number) => Pred,
): number {
  if (filas.length === 0) return 0;
  let total = 0;
  filas.forEach((f, i) => (total += costoDe(c, d, f, predecir(f, i))));
  return total / filas.length;
}

const promedio = (xs: readonly number[]) =>
  xs.reduce((a, b) => a + b, 0) / xs.length;

function mediana(ordenados: readonly number[]): number {
  const m = ordenados.length >> 1;
  return ordenados.length % 2 === 1
    ? ordenados[m]!
    : (ordenados[m - 1]! + ordenados[m]!) / 2;
}

/**
 * Último valor por unidad, con la historia dada: cada fila predice con el valor de la MISMA unidad en la
 * fecha anterior más cercana de la historia (si hay varias ese día, la última de la tabla), como la etapa
 * 5; sin anterior, el respaldo. Solo con una unidad que se repite y fechas.
 */
function ultimoValor(
  d: Diseno,
  historia: readonly number[],
  respaldo: number,
): ((f: number) => number) | null {
  const [unidades, fechas, valores] = [d.unidades, d.fechas, d.valores];
  if (!unidades || !fechas || !valores || !d.unidadRepetida) return null;
  const porUnidad = new Map<string, { fecha: string; f: number }[]>();
  for (const f of historia) {
    const [u, fecha] = [unidades[f], fechas[f]];
    if (u == null || fecha == null) continue;
    const entradas = porUnidad.get(u);
    if (entradas) entradas.push({ fecha, f });
    else porUnidad.set(u, [{ fecha, f }]);
  }
  for (const entradas of porUnidad.values())
    entradas.sort((a, b) =>
      a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.f - b.f,
    );
  return (f) => {
    const [u, fecha] = [unidades[f], fechas[f]];
    const entradas = u == null || fecha == null ? undefined : porUnidad.get(u);
    if (!entradas) return respaldo;
    let [lo, hi] = [0, entradas.length];
    while (lo < hi) {
      const mitad = (lo + hi) >> 1;
      if (entradas[mitad]!.fecha < fecha!) lo = mitad + 1;
      else hi = mitad;
    }
    return lo === 0 ? respaldo : valores[entradas[lo - 1]!.f]!;
  };
}

type Candidata = {
  readonly id: string;
  readonly predecir: (f: number) => Pred;
};

/** Las líneas base de la etapa 5, ajustadas con las filas de entrenamiento dadas, y la regla de hoy. */
function candidatas(
  c: Costos,
  d: Diseno,
  entrenamiento: readonly number[],
  regla: ReglaEvaluada | null,
): Candidata[] {
  const sinModelo = matchByTask(c, {
    binaria: (): Candidata[] => [
      { id: "nunca-actuar", predecir: () => false },
      { id: "siempre-actuar", predecir: () => true },
    ],
    multiclase: (m): Candidata[] => {
      const cuenta = new Map<string, number>();
      for (const f of entrenamiento) {
        const k = d.clases![f]!;
        cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
      }
      // la más frecuente; en un empate, la primera que aparece
      let [mayor, n] = ["", -1];
      for (const [k, v] of cuenta) if (v > n) [mayor, n] = [k, v];
      // la opción fija más barata: la que más cuesta NO acertar (n_k · costo_k); en un empate, la primera
      let [barata, peso] = [m.opciones[0] ?? mayor, -1];
      for (const k of m.opciones) {
        const p = (cuenta.get(k) ?? 0) * (m.costoClase.get(k) ?? 0);
        if (p > peso) [barata, peso] = [k, p];
      }
      return [
        { id: "clase-mayoritaria", predecir: () => mayor },
        ...(barata === mayor
          ? []
          : [{ id: "opcion-barata", predecir: () => barata }]),
      ];
    },
    numerica: (n): Candidata[] => {
      const ys = entrenamiento.map((f) => d.valores![f]!).sort((a, b) => a - b);
      const med = mediana(ys);
      const media = promedio(ys);
      const lista: Candidata[] = [
        { id: "mediana", predecir: () => med },
        { id: "media", predecir: () => media },
      ];
      const nivel = n.sub / (n.sub + n.sobre);
      if (Math.abs(nivel - 0.5) > 1e-9) {
        const q = cuantilEmpirico(ys, nivel);
        lista.push({ id: "cuantil", predecir: () => q });
      }
      const ultimo = ultimoValor(d, entrenamiento, med);
      if (ultimo) lista.push({ id: "ultimo-valor", predecir: ultimo });
      return lista;
    },
  });
  if (!regla) return sinModelo;
  return [
    ...sinModelo,
    {
      id: "regla",
      predecir: (f) => (regla.cumple.get(f) ? regla.si : regla.no),
    },
  ];
}

/** La línea base de un pliegue: la que menos cuesta en su entrenamiento, medida en su validación. */
export type BasePliegue = {
  readonly referencia: string;
  readonly costo: number;
};

export function lineaBasePorPliegue(
  c: Costos,
  d: Diseno,
  pliegues: readonly Pliegue[],
  regla: ReglaEvaluada | null,
): BasePliegue[] {
  return pliegues.map((p) => {
    let mejor: { c: Candidata; costo: number } | null = null;
    for (const cand of candidatas(c, d, p.entrenamiento, regla)) {
      const costo = costoMedio(c, d, p.entrenamiento, cand.predecir);
      if (!mejor || costo < mejor.costo) mejor = { c: cand, costo };
    }
    return {
      referencia: mejor!.c.id,
      costo: costoMedio(c, d, p.validacion, mejor!.c.predecir),
    };
  });
}

/** Lo que cuesta el ganador en la validación de cada pliegue, con sus predicciones fuera de pliegue. */
export function costoGanadorPorPliegue(
  c: Costos,
  d: Diseno,
  pliegues: readonly Pliegue[],
  predicciones: readonly PrediccionGanador[],
): number[] {
  return pliegues.map((p, j) => {
    const decide = decisionGanador(c, predicciones[j]!);
    return costoMedio(c, d, p.validacion, (_, i) => decide(i));
  });
}

/** Lo que el ganador decide en la posición i de sus predicciones. */
export function decisionGanador(
  c: Costos,
  { pred, proba }: PrediccionGanador,
): (i: number) => Pred {
  return (i) =>
    matchByTask(c, {
      // con probabilidad, se actúa desde el umbral de tus costos; sin ella, lo que el modelo dice
      binaria: (b): Pred => (proba ? proba[i]! >= b.umbral : pred[i] === 1),
      multiclase: (): Pred => pred[i]!,
      numerica: (): Pred => pred[i]!,
    });
}

// --- S13, etapa 8: lo mismo, fila a fila, en la prueba --------------------------------------------

/** Lo que cuesta, fila a fila, decidir con `predecir` en las filas dadas (el bootstrap y los segmentos). */
export function costosPorFila(
  c: Costos,
  d: Diseno,
  filas: readonly number[],
  predecir: (f: number, i: number) => Pred,
): number[] {
  return filas.map((f, i) => costoDe(c, d, f, predecir(f, i)));
}

/**
 * La línea base sin modelo para medir en la prueba: de las de la etapa 5 (sin la regla de hoy, que se
 * mide aparte), la que menos cuesta en TODO el entrenamiento, como la etapa 7 la elige en cada pliegue.
 */
export function lineaBaseSinModelo(
  c: Costos,
  d: Diseno,
  entrenamiento: readonly number[],
): { readonly referencia: string; readonly predecir: (f: number) => Pred } {
  let mejor: { c: Candidata; costo: number } | null = null;
  for (const cand of candidatas(c, d, entrenamiento, null)) {
    const costo = costoMedio(c, d, entrenamiento, cand.predecir);
    if (!mejor || costo < mejor.costo) mejor = { c: cand, costo };
  }
  return { referencia: mejor!.c.id, predecir: mejor!.c.predecir };
}

/** La regla de hoy como predicción por fila (evaluada por `reglaDe` sobre esas filas). */
export const prediccionRegla =
  (regla: ReglaEvaluada) =>
  (f: number): Pred =>
    regla.cumple.get(f) ? regla.si : regla.no;

/** Cuantil 0,975 de la t de Student con pocos grados (tabla); desde 11, Cornish-Fisher. */
const T975 = [
  12.7062, 4.3027, 3.1824, 2.7764, 2.5706, 2.4469, 2.3646, 2.306, 2.2622,
  2.2281,
];
export const t975Exacta = (df: number): number =>
  df >= 1 && df <= T975.length ? T975[df - 1]! : t975(df);

export type Veredicto7 = "supera" | "no-supera";

export type Comparacion = {
  /** Media de «línea base − ganador» por decisión (positivo: el ganador cuesta menos). */
  readonly media: number;
  readonly ee: number;
  readonly icBajo: number;
  readonly icAlto: number;
  readonly veredicto: Veredicto7;
};

/** La diferencia pareada por pliegue, su error estándar, el intervalo del 95 % y el veredicto. */
export function comparar(
  base: readonly number[],
  ganador: readonly number[],
): Comparacion {
  const k = base.length;
  const dif = base.map((b, j) => b - ganador[j]!);
  const media = promedio(dif);
  const varianza =
    k > 1 ? dif.reduce((a, x) => a + (x - media) ** 2, 0) / (k - 1) : 0;
  const ee = Math.sqrt(varianza / k);
  const t = t975Exacta(Math.max(1, k - 1));
  const [icBajo, icAlto] = [media - t * ee, media + t * ee];
  return {
    media,
    ee,
    icBajo,
    icAlto,
    veredicto: icBajo > 0 ? "supera" : "no-supera",
  };
}
