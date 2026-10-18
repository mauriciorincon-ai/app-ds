// Protocolo DS (S9, etapa 4): la DERIVA entre periodos de cada columna. ¿Los datos de ayer se
// parecen a los de hoy? Se mide solo si la etapa 2 registró una columna de fecha; sin ella, o
// con poca información, el motor dice «no medible» y por qué: nunca inventa una cifra.
//
//  · PERIODOS. El reciente es el menor sufijo de días enteros que junta al menos el 25 % de las
//    filas con fecha; el histórico es todo lo anterior. Se mide el reciente contra el histórico.
//  · PSI (índice de estabilidad de la población, Lewis 1994): Σ (p_reciente − p_histórico) ·
//    ln(p_reciente / p_histórico) sobre casillas FIJAS que salen del histórico: quintiles en una
//    numérica, sus 4 categorías más frecuentes (+ «otras») en una categórica, y «vacío». Cada
//    casilla suma 0,5 antes de dividir (así una casilla vacía no da infinito ni depende de un ε
//    arbitrario) y las que están vacías en los dos periodos se quitan. La definición es la de
//    Potgieter et al. 2023, ec. 1 (estimador consistente de la divergencia de Jeffreys).
//  · UMBRALES 0,10 y 0,25: constantes por convención (Lewis 1994, p. 106, los da como ejemplo;
//    Thomas 2002 y Siddiqi 2017 los difundieron). No son una prueba estadística, y así se dice.
//  · GUARDA DE RUIDO. Sin ningún cambio, el PSI de dos muestras no es 0: sale cerca de
//    (1/n_h + 1/n_r) · χ²_{B−1}. El valor crítico de Yurdakul y Naranjo 2020 (citado por
//    Potgieter et al. 2023) es τ = (1/n_h + 1/n_r) · χ²_{B−1}(1 − α). Con α = 1 % y B ≤ 6 casillas
//    (5 grados de libertad), si τ ya es ≥ 0,25 la columna no tiene filas para distinguir una
//    alerta del azar: «pocas filas». Eso evita el falso rojo que una muestra chica regala.
//  · KS: solo el estadístico D (la mayor distancia entre las dos distribuciones acumuladas), a
//    título informativo. No lleva valor p: las mismas unidades suelen estar en los dos periodos y
//    las muestras no son independientes.
//
// Puro y determinista; nada de lo que sale de aquí es un valor de celda.
import { byCodePoint } from "@/engine/tarea";
import { cuantilEmpirico, type VistaColumna } from "./tabla";

/** Qué parte de las filas con fecha debe juntar, al menos, el periodo reciente. */
export const DERIVA_FRACCION_RECIENTE = 0.25;
/** Si el reciente pasa de esta parte, no es «reciente»: es casi todo el archivo. */
export const DERIVA_FRACCION_MAXIMA = 0.5;
/** Casillas numéricas: quintiles del histórico (cortes en el 20, 40, 60 y 80 %). */
export const DERIVA_CUANTILES = 5;
/** Casillas categóricas: las más frecuentes del histórico; el resto va a «otras». */
export const DERIVA_CATEGORIAS = 4;
/** Lo que suma cada casilla antes de dividir. */
export const DERIVA_SUAVIZADO = 0.5;
export const PSI_MODERADA = 0.1;
export const PSI_ALERTA = 0.25;
/** χ² al 99 % con 5 grados de libertad (≤ 6 casillas): `scipy.stats.chi2.ppf(0.99, 5)`. */
export const CHI2_99_GL5 = 15.086272469388987;

export type EstadoDeriva =
  | "medida"
  /** La etapa 2 no registró una columna de fecha. */
  | "sin-fecha"
  /** Todas las filas con fecha caen el mismo día. */
  | "una-fecha"
  /** El último día junta más de la mitad: no hay un «antes» contra el cual medir. */
  | "fecha-concentrada"
  /** Entre los dos periodos no hay filas para distinguir una alerta del azar. */
  | "pocas-filas";

export type Periodos =
  | {
      readonly tipo: "medible";
      /** El primer día del periodo reciente (`AAAA-MM-DD`). */
      readonly corte: string;
      /** Índices de fila. */
      readonly historico: readonly number[];
      readonly reciente: readonly number[];
    }
  | {
      readonly tipo: Exclude<EstadoDeriva, "medida" | "sin-fecha">;
    };

/** El PSI que se esperaría por puro azar entre dos muestras de estos tamaños (α = 1 %). */
export function ruidoEsperado(nHistorico: number, nReciente: number): number {
  return CHI2_99_GL5 * (1 / nHistorico + 1 / nReciente);
}

function suficiente(nHistorico: number, nReciente: number): boolean {
  return (
    nHistorico > 0 &&
    nReciente > 0 &&
    ruidoEsperado(nHistorico, nReciente) < PSI_ALERTA
  );
}

/** Parte las filas con fecha en histórico y reciente. `fechas` va alineada a las filas. */
export function periodosDeDeriva(fechas: readonly (string | null)[]): Periodos {
  const porDia = new Map<string, number[]>();
  fechas.forEach((fecha, i) => {
    if (fecha === null) return;
    const filas = porDia.get(fecha);
    if (filas) filas.push(i);
    else porDia.set(fecha, [i]);
  });
  const dias = [...porDia.keys()].sort();
  if (dias.length < 2) return { tipo: "una-fecha" };
  const total = [...porDia.values()].reduce((s, f) => s + f.length, 0);
  const meta = Math.ceil(DERIVA_FRACCION_RECIENTE * total);

  let acumulado = 0;
  let corte = dias[dias.length - 1]!;
  for (let k = dias.length - 1; k >= 0; k--) {
    corte = dias[k]!;
    acumulado += porDia.get(corte)!.length;
    if (acumulado >= meta) break;
  }
  const historico: number[] = [];
  const reciente: number[] = [];
  for (const dia of dias)
    (dia >= corte ? reciente : historico).push(...porDia.get(dia)!);
  if (
    historico.length === 0 ||
    reciente.length / total > DERIVA_FRACCION_MAXIMA
  )
    return { tipo: "fecha-concentrada" };
  if (!suficiente(historico.length, reciente.length))
    return { tipo: "pocas-filas" };
  return { tipo: "medible", corte, historico, reciente };
}

/**
 * PSI entre dos vectores de conteos sobre las MISMAS casillas. Las casillas vacías en los dos
 * se quitan; a las demás se les suma `DERIVA_SUAVIZADO` antes de pasar a proporciones.
 */
export function psiDeConteos(
  historico: readonly number[],
  reciente: readonly number[],
): number {
  const casillas = [...historico.keys()].filter(
    (j) => historico[j]! + reciente[j]! > 0,
  );
  const b = casillas.length;
  if (b < 2) return 0;
  const nh = casillas.reduce((s, j) => s + historico[j]!, 0);
  const nr = casillas.reduce((s, j) => s + reciente[j]!, 0);
  let psi = 0;
  for (const j of casillas) {
    const ph = (historico[j]! + DERIVA_SUAVIZADO) / (nh + DERIVA_SUAVIZADO * b);
    const pr = (reciente[j]! + DERIVA_SUAVIZADO) / (nr + DERIVA_SUAVIZADO * b);
    psi += (pr - ph) * Math.log(pr / ph);
  }
  return psi;
}

/** Los cortes de los quintiles del histórico (ordenado), sin repetidos. */
export function cortesCuantiles(
  historicoOrdenado: readonly number[],
): number[] {
  if (historicoOrdenado.length === 0) return [];
  const cortes: number[] = [];
  for (let k = 1; k < DERIVA_CUANTILES; k++) {
    const corte = cuantilEmpirico(historicoOrdenado, k / DERIVA_CUANTILES);
    if (cortes.length === 0 || corte > cortes[cortes.length - 1]!)
      cortes.push(corte);
  }
  return cortes;
}

/** D de Kolmogorov-Smirnov entre dos muestras ordenadas: la mayor brecha entre sus acumuladas. */
export function ksD(a: readonly number[], b: readonly number[]): number {
  const [na, nb] = [a.length, b.length];
  if (na === 0 || nb === 0) return 0;
  let [i, j, d] = [0, 0, 0];
  while (i < na && j < nb) {
    const x = Math.min(a[i]!, b[j]!);
    while (i < na && a[i] === x) i += 1;
    while (j < nb && b[j] === x) j += 1;
    d = Math.max(d, Math.abs(i / na - j / nb));
  }
  return d;
}

export type DerivaColumna =
  | {
      readonly tipo: "medida";
      readonly psi: number;
      readonly ks: number | null;
    }
  | { readonly tipo: "pocas-filas" };

const ascendente = (x: number, y: number) => x - y;

/**
 * La deriva de una columna entre los dos periodos. Cuenta lo que la columna TIENE en cada
 * periodo (sin los vacíos): si no alcanza para separar una alerta del azar, «pocas filas».
 */
export function derivaDeColumna(
  vista: VistaColumna,
  periodos: Extract<Periodos, { tipo: "medible" }>,
): DerivaColumna {
  const { historico, reciente } = periodos;
  if (vista.tipo === "numero") {
    const toma = (filas: readonly number[]) =>
      filas.map((i) => vista.valores[i] ?? null);
    const [h, r] = [toma(historico), toma(reciente)];
    const [hn, rn] = [
      h.filter((v): v is number => v !== null).sort(ascendente),
      r.filter((v): v is number => v !== null).sort(ascendente),
    ];
    if (!suficiente(hn.length, rn.length)) return { tipo: "pocas-filas" };
    const cortes = cortesCuantiles(hn);
    const casillas = (valores: readonly (number | null)[]) => {
      const cuenta = new Array<number>(cortes.length + 2).fill(0);
      for (const v of valores) {
        if (v === null) cuenta[cortes.length + 1]! += 1;
        else cuenta[cortes.filter((c) => v > c).length]! += 1;
      }
      return cuenta;
    };
    return {
      tipo: "medida",
      psi: psiDeConteos(casillas(h), casillas(r)),
      ks: ksD(hn, rn),
    };
  }
  const toma = (filas: readonly number[]) =>
    filas.map((i) => vista.valores[i] ?? null);
  const [h, r] = [toma(historico), toma(reciente)];
  const llenos = (valores: readonly (string | null)[]) =>
    valores.filter((v) => v !== null).length;
  if (!suficiente(llenos(h), llenos(r))) return { tipo: "pocas-filas" };
  const frecuencia = new Map<string, number>();
  for (const v of h)
    if (v !== null) frecuencia.set(v, (frecuencia.get(v) ?? 0) + 1);
  const mejores = [...frecuencia.entries()]
    .sort(([ca, na], [cb, nb]) => nb - na || byCodePoint(ca, cb))
    .slice(0, DERIVA_CATEGORIAS)
    .map(([categoria]) => categoria);
  const posicion = new Map(mejores.map((c, k) => [c, k]));
  const casillas = (valores: readonly (string | null)[]) => {
    const cuenta = new Array<number>(mejores.length + 2).fill(0);
    for (const v of valores)
      cuenta[
        v === null ? mejores.length + 1 : (posicion.get(v) ?? mejores.length)
      ]! += 1;
    return cuenta;
  };
  return {
    tipo: "medida",
    psi: psiDeConteos(casillas(h), casillas(r)),
    ks: null,
  };
}
