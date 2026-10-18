// Protocolo DS (S12), etapa 7 — LOS PLIEGUES DENTRO DEL ENTRENAMIENTO. La prueba ya quedó sellada en la
// etapa 6 y aquí NO existe: los pliegues reparten solo las filas de entrenamiento y siguen el esquema
// sellado, para que la validación de cada modelo se parezca a cómo se usará:
//
//  · estratificada: al azar con semilla, guardando la proporción de cada clase (en un número, de cada
//    tramo de valores);
//  · por grupo: ninguna unidad en el entrenamiento y la validación del mismo pliegue; las unidades se
//    reparten por turnos según la clase más rara que aparece en ellas;
//  · por tiempo: ventana que avanza. Las fechas se parten en k + 1 bloques; el pliegue j valida el
//    bloque j y entrena solo con lo anterior a su primera fecha MENOS el horizonte (ese hueco no entra a
//    ningún lado). El bloque 0 nunca valida: solo enseña;
//  · por tiempo y por grupo: lo mismo, y el entrenamiento de cada pliegue deja fuera la historia de las
//    unidades que valida (el modelo se usará con unidades que no vio).
//
// Si con los k pedidos algún pliegue queda sin casos, sin periodos o sin unidades, se baja k de a uno con su
// razón; con menos de 2 no hay pliegues y se dice por qué. `verificarPliegues` es OTRA función: cuenta sobre
// la tabla y sus valores qué se repite entre lados, sin creerle al reparto. Devuelve índices y conteos;
// ningún valor de celda sale de aquí.
import { mulberry32, shuffle } from "@/engine/split";
import {
  esPorGrupo,
  esTemporal,
  restar,
  type Diseno,
  type Esquema,
  type UnidadHorizonte,
} from "./particion";

/** La semilla de los pliegues es del motor, como la de la etapa 6: otra forma de volver a mirar. */
export const SEMILLA_7 = 20261025;
/** Con menos de dos pliegues no hay validación cruzada. */
export const K_MIN = 2;

export type ParametrosPliegues = {
  readonly esquema: Esquema;
  /** Cuántos pliegues se piden (el de Probeta). */
  readonly k: number;
  /** Solo en los esquemas por tiempo: el hueco entre el entrenamiento de un pliegue y su validación. */
  readonly horizonte: number;
  readonly unidad: UnidadHorizonte;
};

export type Pliegue = {
  /** Índices de fila de la tabla, en orden. */
  readonly entrenamiento: readonly number[];
  readonly validacion: readonly number[];
};

/** Por qué k es el que es: «pedido», o lo que obligó a bajarlo. */
export type RazonK =
  "pedido" | "pocos-periodos" | "pocas-unidades" | "pocos-casos";
export type FaltaPliegues = Exclude<RazonK, "pedido">;

export type Pliegues = {
  readonly esquema: Esquema;
  readonly kPedido: number;
  readonly k: number;
  readonly razon: RazonK;
  readonly pliegues: readonly Pliegue[];
};

export type ResultadoPliegues =
  | ({ readonly ok: true } & Pliegues)
  | { readonly ok: false; readonly razon: FaltaPliegues };

/** Qué faltó cuando un esquema no logra armar k pliegues. */
const FALTA_POR_ESQUEMA: Readonly<Record<Esquema, FaltaPliegues>> = {
  estratificada: "pocos-casos",
  grupo: "pocas-unidades",
  tiempo: "pocos-periodos",
  "tiempo-grupo": "pocos-periodos",
};

type Bruto = readonly Pliegue[];

/** De «a qué pliegue valida cada fila» a los pliegues. */
function desdeAsignacion(
  filas: readonly number[],
  asignacion: ReadonlyMap<number, number>,
  k: number,
): Bruto {
  const validacion: number[][] = Array.from({ length: k }, () => []);
  for (const f of filas) validacion[asignacion.get(f)!]!.push(f);
  return validacion.map((v) => {
    const dentro = new Set(v);
    return {
      entrenamiento: filas.filter((f) => !dentro.has(f)),
      validacion: v,
    };
  });
}

function estratificados(d: Diseno, filas: readonly number[], k: number): Bruto {
  const rng = mulberry32(SEMILLA_7);
  const asignacion = new Map<number, number>();
  const clases = d.clases;
  if (clases) {
    // por clase: se baraja y se reparte por turnos, siguiendo el turno entre clases para que los
    // pliegues queden del mismo tamaño
    const porClase = new Map<string, number[]>();
    for (const f of filas) {
      const c = clases[f]!;
      const lista = porClase.get(c);
      if (lista) lista.push(f);
      else porClase.set(c, [f]);
    }
    let turno = 0;
    for (const lista of porClase.values()) {
      shuffle(lista, rng).forEach((f, i) => asignacion.set(f, (i + turno) % k));
      turno = (turno + lista.length) % k;
    }
  } else {
    // un número: tramos de k filas contiguas por valor; dentro de cada tramo los pliegues se sortean
    const valores = d.valores!;
    const orden = [...filas].sort((a, b) => valores[a]! - valores[b]! || a - b);
    for (let i = 0; i < orden.length; i += k) {
      const tramo = orden.slice(i, i + k);
      shuffle(
        Array.from({ length: k }, (_, j) => j),
        rng,
      ).forEach((pliegue, j) => {
        if (j < tramo.length) asignacion.set(tramo[j]!, pliegue);
      });
    }
  }
  return desdeAsignacion(filas, asignacion, k);
}

function porUnidad(
  d: Diseno,
  filas: readonly number[],
  k: number,
): Bruto | null {
  const orden: string[] = [];
  const filasDe = new Map<string, number[]>();
  for (const f of filas) {
    // una fila sin unidad es su propia unidad (el entrenamiento sellado por grupo no las trae)
    const u = d.unidades?.[f] ?? `\u0000${f}`;
    const lista = filasDe.get(u);
    if (lista) lista.push(f);
    else {
      filasDe.set(u, [f]);
      orden.push(u);
    }
  }
  if (orden.length < k) return null;
  const clases = d.clases;
  const global = new Map<string, number>();
  if (clases)
    for (const f of filas) {
      const c = clases[f]!;
      global.set(c, (global.get(c) ?? 0) + 1);
    }
  // la etiqueta de cada unidad: la clase más rara (en el entrenamiento) que aparece en ella
  const etiqueta = (u: string): string => {
    if (!clases) return "-";
    let rara = "";
    let menor = Infinity;
    for (const f of filasDe.get(u)!) {
      const c = clases[f]!;
      const n = global.get(c)!;
      if (n < menor || (n === menor && c < rara)) [rara, menor] = [c, n];
    }
    return rara;
  };
  const porEtiqueta = new Map<string, string[]>();
  for (const u of orden) {
    const e = etiqueta(u);
    const lista = porEtiqueta.get(e);
    if (lista) lista.push(u);
    else porEtiqueta.set(e, [u]);
  }
  const rng = mulberry32(SEMILLA_7);
  const asignacion = new Map<number, number>();
  let turno = 0;
  for (const unidades of porEtiqueta.values()) {
    shuffle(
      unidades.map((_, i) => i),
      rng,
    ).forEach((idx, i) => {
      const pliegue = (i + turno) % k;
      for (const f of filasDe.get(unidades[idx]!)!) asignacion.set(f, pliegue);
    });
    turno = (turno + unidades.length) % k;
  }
  return desdeAsignacion(filas, asignacion, k);
}

function porTiempo(
  d: Diseno,
  filas: readonly number[],
  p: ParametrosPliegues,
  k: number,
  conGrupo: boolean,
): Bruto | null {
  const fechas = d.fechas;
  if (!fechas) return null;
  const conFecha = filas.filter((f) => fechas[f] != null);
  const porFecha = new Map<string, number[]>();
  for (const f of conFecha) {
    const x = fechas[f]!;
    const lista = porFecha.get(x);
    if (lista) lista.push(f);
    else porFecha.set(x, [f]);
  }
  const distintas = [...porFecha.keys()].sort();
  const nBloques = k + 1;
  if (distintas.length < nBloques) return null;
  // k + 1 bloques de fechas enteras, de tamaño parecido en filas
  const bloques: string[][] = [];
  let actual: string[] = [];
  let acumulado = 0;
  distintas.forEach((x, i) => {
    actual.push(x);
    acumulado += porFecha.get(x)!.length;
    const faltan = nBloques - bloques.length - 1;
    const quedan = distintas.length - 1 - i;
    if (
      bloques.length < nBloques - 1 &&
      acumulado >= (conFecha.length * (bloques.length + 1)) / nBloques &&
      quedan >= faltan
    ) {
      bloques.push(actual);
      actual = [];
    }
  });
  if (actual.length > 0) bloques.push(actual);
  if (bloques.length !== nBloques) return null;

  const unidades = d.unidades;
  const pliegues: Pliegue[] = [];
  for (let j = 1; j <= k; j++) {
    const delBloque = new Set(bloques[j]);
    const validacion = conFecha.filter((f) => delBloque.has(fechas[f]!));
    const limite = restar(bloques[j]![0]!, p.horizonte, p.unidad);
    const deVal = conGrupo
      ? new Set(validacion.map((f) => unidades?.[f] ?? `\u0000${f}`))
      : null;
    const entrenamiento = conFecha.filter(
      (f) =>
        fechas[f]! < limite &&
        (deVal === null || !deVal.has(unidades?.[f] ?? `\u0000${f}`)),
    );
    pliegues.push({ entrenamiento, validacion });
  }
  return pliegues;
}

/**
 * ¿Sirven estos pliegues para entrenar y medir? Cada pliegue necesita casos de las dos partes; con clases, la
 * validación trae todas las clases del entrenamiento (como la CV de Probeta, que acota k por la clase más
 * chica) y el entrenamiento trae al menos dos.
 */
function sirven(d: Diseno, filas: readonly number[], pliegues: Bruto): boolean {
  const clases = d.clases;
  const todas = clases ? new Set(filas.map((f) => clases[f]!)) : null;
  return pliegues.every((p) => {
    if (p.validacion.length < 1 || p.entrenamiento.length < K_MIN) return false;
    if (!clases || !todas) return true;
    const enVal = new Set(p.validacion.map((f) => clases[f]!));
    const enEnt = new Set(p.entrenamiento.map((f) => clases[f]!));
    return enVal.size === todas.size && enEnt.size >= K_MIN;
  });
}

function construir(
  d: Diseno,
  filas: readonly number[],
  p: ParametrosPliegues,
  k: number,
): Bruto | null {
  const bruto =
    p.esquema === "estratificada"
      ? estratificados(d, filas, k)
      : p.esquema === "grupo"
        ? porUnidad(d, filas, k)
        : porTiempo(d, filas, p, k, esPorGrupo(p.esquema));
  return bruto !== null && sirven(d, filas, bruto) ? bruto : null;
}

/**
 * Reparte las filas de ENTRENAMIENTO en pliegues según el esquema sellado. Baja k de a uno, con su razón,
 * hasta que todos los pliegues sirvan; con menos de dos no hay pliegues. Determinista: la misma tabla y los
 * mismos parámetros dan los mismos pliegues.
 */
export function repartirPliegues(
  d: Diseno,
  entrenamiento: readonly number[],
  p: ParametrosPliegues,
): ResultadoPliegues {
  const filas = [...entrenamiento].sort((a, b) => a - b);
  const pedido = Math.max(K_MIN, Math.floor(p.k));
  const falta = FALTA_POR_ESQUEMA[p.esquema];
  for (let k = pedido; k >= K_MIN; k--) {
    const bruto = construir(d, filas, p, k);
    if (bruto)
      return {
        ok: true,
        esquema: p.esquema,
        kPedido: pedido,
        k,
        razon: k === pedido ? "pedido" : falta,
        pliegues: bruto,
      };
  }
  return { ok: false, razon: falta };
}

// --- la verificación: otra función, sobre la tabla y sus valores -------------------------------

export type VerificacionPliegues = {
  /** Filas que están a la vez en el entrenamiento y la validación de un mismo pliegue. */
  readonly solapeFilas: number;
  /** Esquemas por grupo: unidades con filas en los dos lados de un mismo pliegue. */
  readonly solapeUnidades: number;
  /** Esquemas por tiempo: filas de entrenamiento a menos de un horizonte de su validación (o posteriores). */
  readonly validacionAntes: number;
  /** Índices en algún pliegue que no son del entrenamiento sellado: la prueba y el hueco no entran. */
  readonly fueraDelEntrenamiento: number;
  /** Filas del entrenamiento que ninguna validación cubre (en tiempo, el primer bloque: es lo esperado). */
  readonly sinValidar: number;
};

/** Cuenta sobre la tabla qué se repite o se cuela, sin creerle al reparto. */
export function verificarPliegues(
  d: Diseno,
  entrenamiento: readonly number[],
  p: ParametrosPliegues,
  r: Pliegues,
): VerificacionPliegues {
  const sellado = new Set(entrenamiento);
  const cubiertas = new Set<number>();
  let solapeFilas = 0;
  let solapeUnidades = 0;
  let validacionAntes = 0;
  let fueraDelEntrenamiento = 0;
  for (const pl of r.pliegues) {
    const ent = new Set(pl.entrenamiento);
    for (const f of [...pl.entrenamiento, ...pl.validacion])
      if (!sellado.has(f)) fueraDelEntrenamiento += 1;
    for (const f of new Set(pl.validacion)) {
      cubiertas.add(f);
      if (ent.has(f)) solapeFilas += 1;
    }
    if (esPorGrupo(p.esquema) && d.unidades) {
      const deEnt = new Set(pl.entrenamiento.map((f) => d.unidades![f]));
      const deVal = new Set(pl.validacion.map((f) => d.unidades![f]));
      for (const u of deVal) if (u != null && deEnt.has(u)) solapeUnidades += 1;
    }
    if (esTemporal(p.esquema) && d.fechas && pl.validacion.length > 0) {
      const primera = pl.validacion
        .map((f) => d.fechas![f])
        .filter((x): x is string => x != null)
        .sort()[0];
      if (primera !== undefined) {
        const limite = restar(primera, p.horizonte, p.unidad);
        for (const f of pl.entrenamiento) {
          const x = d.fechas[f];
          if (x == null || x >= limite) validacionAntes += 1;
        }
      }
    }
  }
  return {
    solapeFilas,
    solapeUnidades,
    validacionAntes,
    fueraDelEntrenamiento,
    sinValidar: entrenamiento.filter((f) => !cubiertas.has(f)).length,
  };
}

/** ¿La verificación no encontró nada que se repita o se cuele? (`sinValidar` no cuenta: en tiempo es esperado.) */
export const sinSolape = (v: VerificacionPliegues): boolean =>
  v.solapeFilas === 0 &&
  v.solapeUnidades === 0 &&
  v.validacionAntes === 0 &&
  v.fueraDelEntrenamiento === 0;
