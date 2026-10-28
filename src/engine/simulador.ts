// S19 (ADR 027): el simulador «¿qué pasaría si?». Puro. Dos mitades:
//  · `prepararSimulacion` arma, SIN tocar la tabla, las filas del modelo y la columna ya cambiada (±x %, un valor fijo u otra
//    categoría de las que existen), para todas las filas o para un segmento (la gramática de la regla de hoy, `regla.ts`);
//  · `compararSimulacion` lee lo que el worker puntuó —las mismas filas como están y con el cambio— y dice cuántas decisiones
//    cambian y qué significa en dinero con los costos que se escribieron. El dinero es un costo ESPERADO según las
//    probabilidades del propio modelo, por cada 100 decisiones: no es un resultado medido (no hay verdad para filas hipotéticas).
//
// Lo que NO hace: no lee el objetivo, no mira la prueba del Protocolo (las filas que le llegan las elige quien lo llama: en la
// etapa 9 son las de entrenamiento) y no inventa un valor: un vacío sigue vacío y una categoría que no existe se rechaza.
import { matchByTask, matchTask } from "@/engine/despacho";
import { evaluarRegla, type Condicion } from "@/engine/protocolo/regla";
import { vistaColumna, type VistaColumna } from "@/engine/protocolo/tabla";
import { mulberry32 } from "@/engine/split";
import { isNullToken, parseNumber, type CsvTable } from "@/lib/ds/csv";
import type { SimulateResult } from "@/workers/protocol";

/** Cuántas filas viajan al worker en una simulación; con más, una muestra con semilla (se dice en pantalla). */
export const FILAS_SIMULACION_MAX = 5000;
/** El mayor descenso que admite un cambio en %: −100 % deja la columna en cero; por debajo cambiaría el signo. */
export const PORCENTAJE_MIN = -100;
/** Topes del cambio: que un número escrito de más no vuelva infinito lo que el modelo recibe. */
export const PORCENTAJE_MAX = 1_000_000;
export const VALOR_FIJO_MAX = 1e15;
/** Categorías que se ofrecen para elegir: las más frecuentes (el resto se puede escribir en el CSV de origen). */
export const CATEGORIAS_MAX = 50;
/** Los costos y los totales se dan por cada tantas decisiones. */
export const POR_DECISIONES = 100;
/** La semilla de la muestra cuando no hay otra (la de Probeta es 42, la misma de todo experimento). */
export const SEMILLA_SIMULACION = 42;

export type TipoColumna = "numero" | "categoria";

export type Cambio =
  | { readonly tipo: "porcentaje"; readonly porcentaje: number }
  | { readonly tipo: "fijo"; readonly valor: number }
  | { readonly tipo: "categoria"; readonly categoria: string };

export type Alcance =
  | { readonly tipo: "todas" }
  | {
      readonly tipo: "segmento";
      readonly condiciones: readonly Condicion[];
      readonly union: string;
    };

export type EntradaSimulacion = {
  /** Las filas a simular (en Probeta, el CSV cargado; en la etapa 9, solo las de entrenamiento). */
  readonly tabla: CsvTable;
  /** Las columnas del modelo, en el orden de su esquema: lo único que viaja al worker. */
  readonly columnas: readonly string[];
  readonly columna: string;
  /** Cómo la trata el modelo (su esquema), no cómo la lee el CSV. */
  readonly tipo: TipoColumna;
  readonly cambio: Cambio;
  readonly alcance: Alcance;
  readonly semilla: number;
};

export type MotivoRechazo =
  "columna" | "cambio" | "valor" | "categoria" | "segmento" | "sin-filas";

export type Simulacion = {
  readonly columna: string;
  /** Solo las columnas del modelo. */
  readonly headers: string[];
  readonly filas: string[][];
  /** La columna `columna` con el cambio ya aplicado, una celda por fila. */
  readonly valores: string[];
  /** Filas cuyo valor cambió de verdad (en el alcance, con valor y distinto). */
  readonly tocadas: number;
  /** Filas que se puntúan y filas de la tabla. */
  readonly usadas: number;
  readonly total: number;
  readonly muestreada: boolean;
};

export type ResultadoPreparacion =
  | { readonly ok: true; readonly simulacion: Simulacion }
  | { readonly ok: false; readonly motivo: MotivoRechazo };

/** Las posiciones de la muestra: todas si caben; si no, `max` al azar con semilla, en el orden de la tabla. */
export function posicionesDeMuestra(
  total: number,
  max: number,
  semilla: number,
): number[] {
  const todas = Array.from({ length: total }, (_, i) => i);
  if (total <= max) return todas;
  const azar = mulberry32(semilla);
  // Fisher–Yates parcial: las primeras `max` posiciones quedan sorteadas
  for (let i = 0; i < max; i++) {
    const j = i + Math.floor(azar() * (total - i));
    [todas[i], todas[j]] = [todas[j]!, todas[i]!];
  }
  return todas.slice(0, max).sort((a, b) => a - b);
}

/** Las categorías que existen en una columna (sin vacíos), de la más frecuente a la menos; empates por orden alfabético. */
export function categoriasDe(
  tabla: CsvTable,
  columna: string,
  max = CATEGORIAS_MAX,
): string[] {
  const j = tabla.headers.indexOf(columna);
  if (j < 0) return [];
  const cuenta = new Map<string, number>();
  for (const fila of tabla.rows) {
    const celda = fila[j] ?? "";
    if (isNullToken(celda)) continue;
    const valor = celda.trim();
    cuenta.set(valor, (cuenta.get(valor) ?? 0) + 1);
  }
  return [...cuenta.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, max)
    .map(([valor]) => valor);
}

/** Un número tal como se le entrega al modelo: sin el ruido de coma flotante («110.00000000000001» → «110»). */
function escribirNumero(valor: number): string | null {
  if (!Number.isFinite(valor)) return null;
  return String(Number(valor.toPrecision(12)));
}

function cambioValido(tipo: TipoColumna, cambio: Cambio): MotivoRechazo | null {
  if (tipo === "numero") {
    if (cambio.tipo === "porcentaje")
      return Number.isFinite(cambio.porcentaje) &&
        cambio.porcentaje >= PORCENTAJE_MIN &&
        cambio.porcentaje <= PORCENTAJE_MAX
        ? null
        : "valor";
    if (cambio.tipo === "fijo")
      return Number.isFinite(cambio.valor) &&
        Math.abs(cambio.valor) <= VALOR_FIJO_MAX
        ? null
        : "valor";
    return "cambio";
  }
  return cambio.tipo === "categoria" ? null : "cambio";
}

/**
 * Las filas del modelo y la columna cambiada. No modifica `tabla` (la copia es nueva). Un vacío en la columna sigue vacío; un texto
 * que no se lee como número en una columna numérica tampoco se toca (el modelo ya lo lee como vacío).
 */
export function prepararSimulacion(
  entrada: EntradaSimulacion,
): ResultadoPreparacion {
  const { tabla, columnas, columna, tipo, cambio, alcance } = entrada;
  if (!columnas.includes(columna)) return { ok: false, motivo: "columna" };
  const posiciones = columnas.map((c) => tabla.headers.indexOf(c));
  if (posiciones.some((p) => p < 0)) return { ok: false, motivo: "columna" };
  const invalido = cambioValido(tipo, cambio);
  if (invalido) return { ok: false, motivo: invalido };
  if (cambio.tipo === "categoria") {
    // «otra categoría de las que existen»: una que no está en la columna no es un escenario, es un error de escritura
    const existentes = new Set(categoriasDe(tabla, columna, Infinity));
    if (!existentes.has(cambio.categoria))
      return { ok: false, motivo: "categoria" };
  }
  const total = tabla.rows.length;
  if (total === 0) return { ok: false, motivo: "sin-filas" };
  const muestra = posicionesDeMuestra(
    total,
    FILAS_SIMULACION_MAX,
    entrada.semilla,
  );

  let cumple: readonly boolean[] | null = null;
  if (alcance.tipo === "segmento") {
    const vistas: VistaColumna[] = [];
    for (const c of alcance.condiciones) {
      const j = tabla.headers.indexOf(c.columna);
      if (j < 0) return { ok: false, motivo: "segmento" };
      vistas.push(
        vistaColumna(
          c.columna,
          muestra.map((i) => tabla.rows[i]![j] ?? ""),
        ),
      );
    }
    const medida = evaluarRegla(
      vistas,
      alcance.condiciones,
      alcance.union,
      muestra.map((_, k) => k),
    );
    if (!medida) return { ok: false, motivo: "segmento" };
    cumple = medida.cumple;
  }

  const j = tabla.headers.indexOf(columna);
  const filas: string[][] = [];
  const valores: string[] = [];
  let tocadas = 0;
  muestra.forEach((i, k) => {
    const fila = tabla.rows[i]!;
    filas.push(posiciones.map((p) => fila[p] ?? ""));
    const original = fila[j] ?? "";
    let nuevo = original;
    if (!isNullToken(original) && (cumple === null || cumple[k])) {
      if (tipo === "numero") {
        const v = parseNumber(original);
        if (v !== null) {
          const calculado =
            cambio.tipo === "porcentaje"
              ? v * (1 + cambio.porcentaje / 100)
              : cambio.tipo === "fijo"
                ? cambio.valor
                : v;
          nuevo = escribirNumero(calculado) ?? original;
          if (parseNumber(nuevo) !== v) tocadas += 1;
        }
      } else if (cambio.tipo === "categoria") {
        if (original.trim() !== cambio.categoria) {
          nuevo = cambio.categoria;
          tocadas += 1;
        }
      }
    }
    valores.push(nuevo);
  });
  return {
    ok: true,
    simulacion: {
      columna,
      headers: [...columnas],
      filas,
      valores,
      tocadas,
      usadas: muestra.length,
      total,
      muestreada: muestra.length < total,
    },
  };
}

// --- la lectura: cuántas decisiones cambian y qué significa en dinero ----------------------------------------------

/** Los costos que se escribieron, por tarea. Agrupar y estimar una cantidad no tienen dinero que calcular aquí. */
export type CostosSimulador =
  | { readonly task: "binaria"; readonly fp: number; readonly fn: number }
  | {
      readonly task: "multiclase";
      /** Lo que cuesta equivocarse cuando la clase REAL es esta. */
      readonly costoClase: ReadonlyMap<string, number>;
    };

export type Dinero = {
  readonly antes: number;
  readonly despues: number;
  /** despues − antes: negativo = el cambio baja el costo esperado. */
  readonly delta: number;
};

/** Por qué no hay dinero: faltan los costos o el modelo no da probabilidades (ridge, vector de soporte lineal). */
export type SinDinero = "sin-costos" | "sin-probabilidades";

type Comun = {
  readonly n: number;
  /** Decisiones (predicciones) que cambian. */
  readonly cambian: number;
  /** Filas con un valor en la columna que el modelo nunca vio, antes y después. */
  readonly fuera: { readonly antes: number; readonly despues: number };
  readonly dinero: Dinero | null;
  readonly sinDinero: SinDinero | null;
};

export type ComparacionBinaria = Comun & {
  readonly task: "binaria";
  /** Filas donde se actúa (la clase positiva), antes y después. */
  readonly actuan: { readonly antes: number; readonly despues: number };
  /** El umbral de tus costos, o `null` si se actúa donde el modelo lo dice. */
  readonly umbral: number | null;
};

export type ComparacionMulticlase = Comun & {
  readonly task: "multiclase";
  readonly porOpcion: readonly {
    readonly opcion: string;
    readonly antes: number;
    readonly despues: number;
  }[];
};

export type ComparacionNumerica = Comun & {
  readonly task: "numerica";
  readonly promedio: { readonly antes: number; readonly despues: number };
  /** El promedio de (después − antes) fila a fila, en las unidades del objetivo. */
  readonly cambioMedio: number;
};

export type ComparacionAgrupar = Comun & {
  readonly task: "agrupar";
  readonly porGrupo: readonly {
    readonly grupo: number;
    readonly antes: number;
    readonly despues: number;
  }[];
};

export type Comparacion =
  | ComparacionBinaria
  | ComparacionMulticlase
  | ComparacionNumerica
  | ComparacionAgrupar;

const media = (valores: readonly number[]) =>
  valores.length === 0
    ? 0
    : valores.reduce((a, b) => a + b, 0) / valores.length;

function dineroDe(
  antes: readonly number[],
  despues: readonly number[],
): Dinero {
  const a = media(antes) * POR_DECISIONES;
  const d = media(despues) * POR_DECISIONES;
  return { antes: a, despues: d, delta: d - a };
}

/** Cuenta cuántas veces aparece cada valor, en el orden en que se piden. */
function contar<T>(valores: readonly T[], claves: readonly T[]): number[] {
  return claves.map((c) => valores.filter((v) => v === c).length);
}

/**
 * Lo que cambia entre las filas como están y con el cambio. `costos` es `null` si no se escribieron (o la tarea no los tiene).
 * El costo esperado de una fila, según las probabilidades del propio modelo:
 *  · dos clases: se actúa si P(positiva) ≥ umbral de tus costos (c_FP / (c_FP + c_FN)); actuar cuesta (1−p)·c_FP y no
 *    actuar cuesta p·c_FN;
 *  · varias clases: la opción elegida es la predicha; equivocarse cuesta Σ p(k)·costo(k) sobre las demás clases k.
 */
export function compararSimulacion(
  r: SimulateResult,
  costos: CostosSimulador | null,
): Comparacion {
  const n = r.n;
  const comun = (
    cambian: number,
    dinero: Dinero | null,
    sinDinero: SinDinero | null,
  ): Comun => ({
    n,
    cambian,
    fuera: { antes: r.outside.before, despues: r.outside.after },
    dinero,
    sinDinero,
  });
  const diferentes = <T>(a: readonly T[], b: readonly T[]) =>
    a.reduce((acc, v, i) => acc + (v !== b[i] ? 1 : 0), 0);

  return matchTask(r.task, {
    binaria: (): Comparacion => {
      const positiva = r.positive_class ?? "";
      const costo = costos
        ? matchByTask(costos, { binaria: (c) => c, multiclase: () => null })
        : null;
      const pa = r.base.proba as number[] | null;
      const pd = r.changed.proba as number[] | null;
      const umbral =
        costo && pa && pd ? costo.fp / (costo.fp + costo.fn) : null;
      const actua = (
        pred: readonly (string | number)[],
        proba: readonly number[] | null,
      ) =>
        pred.map((v, i) =>
          umbral !== null && proba ? proba[i]! >= umbral : v === positiva,
        );
      const antes = actua(r.base.pred, pa);
      const despues = actua(r.changed.pred, pd);
      let dinero: Dinero | null = null;
      let sinDinero: SinDinero | null = null;
      if (!costo) sinDinero = "sin-costos";
      else if (!pa || !pd) sinDinero = "sin-probabilidades";
      else {
        const costoFila = (a: boolean[], p: readonly number[]) =>
          a.map((act, i) => (act ? (1 - p[i]!) * costo.fp : p[i]! * costo.fn));
        dinero = dineroDe(costoFila(antes, pa), costoFila(despues, pd));
      }
      return {
        ...comun(diferentes(antes, despues), dinero, sinDinero),
        task: "binaria",
        actuan: {
          antes: antes.filter(Boolean).length,
          despues: despues.filter(Boolean).length,
        },
        umbral,
      };
    },
    multiclase: (): Comparacion => {
      const clases = r.classes ?? [];
      const costo = costos
        ? matchByTask(costos, { binaria: () => null, multiclase: (c) => c })
        : null;
      const pa = r.base.proba as number[][] | null;
      const pd = r.changed.proba as number[][] | null;
      let dinero: Dinero | null = null;
      let sinDinero: SinDinero | null = null;
      if (!costo) sinDinero = "sin-costos";
      else if (!pa || !pd) sinDinero = "sin-probabilidades";
      else {
        const costoFila = (pred: readonly (string | number)[], p: number[][]) =>
          pred.map((elegida, i) =>
            clases.reduce(
              (suma, k, j) =>
                k === elegida
                  ? suma
                  : suma + p[i]![j]! * (costo.costoClase.get(k) ?? 0),
              0,
            ),
          );
        dinero = dineroDe(
          costoFila(r.base.pred, pa),
          costoFila(r.changed.pred, pd),
        );
      }
      const antes = contar(r.base.pred, clases);
      const despues = contar(r.changed.pred, clases);
      return {
        ...comun(diferentes(r.base.pred, r.changed.pred), dinero, sinDinero),
        task: "multiclase",
        porOpcion: clases.map((opcion, i) => ({
          opcion,
          antes: antes[i]!,
          despues: despues[i]!,
        })),
      };
    },
    numerica: (): Comparacion => {
      const a = r.base.pred as number[];
      const d = r.changed.pred as number[];
      return {
        ...comun(diferentes(a, d), null, null),
        task: "numerica",
        promedio: { antes: media(a), despues: media(d) },
        cambioMedio: media(d.map((v, i) => v - a[i]!)),
      };
    },
    agrupar: (): Comparacion => {
      const grupos = [
        ...new Set([...r.base.pred, ...r.changed.pred] as number[]),
      ].sort((x, y) => x - y);
      const antes = contar(r.base.pred as number[], grupos);
      const despues = contar(r.changed.pred as number[], grupos);
      return {
        ...comun(diferentes(r.base.pred, r.changed.pred), null, null),
        task: "agrupar",
        porGrupo: grupos.map((grupo, i) => ({
          grupo,
          antes: antes[i]!,
          despues: despues[i]!,
        })),
      };
    },
  });
}
