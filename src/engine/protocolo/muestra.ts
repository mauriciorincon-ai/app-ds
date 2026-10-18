// Protocolo DS (S8, etapa 3): cuántas filas hacen falta para desarrollar un modelo de
// predicción sin que aprenda ruido. Son los criterios de Riley et al. para el tamaño mínimo
// de muestra (Stat Med 2019, partes I y II; BMJ 2020), implementados como código propio.
//
// Procedencia (verificada el 2026-10-17; ADR 020):
//  · Dos clases, criterios (i)–(iii): ecuaciones (4), (5)–(7), (8)–(9) de Pate et al.
//    (Stat Methods Med Res 2023, que las reproduce de Riley) y ejemplo resuelto de Riley et al.,
//    Stat Med 2019, parte II, § 5.1 (enfermedad de Chagas: P = 24, prevalencia 0,174,
//    R²_CS = 0,288 → 622,31 · 667,41 · 220,85; 116,2 eventos; EPP 4,84). El artículo redondea
//    max(R²_CS) a 0,60 y S a 0,906 a mano; con las cifras exactas, el criterio (ii) da 662, que es
//    lo que da el paquete de los autores (`pmsampsize` 1.1.3, tests/testthat/test_bin.R: 623, 662, 221).
//  · Sin otra información, R²_CS,adj = 0,15 · max(R²_CS) (Riley parte II; Pate § 4).
//  · Una cantidad (criterios (i)–(iv)): la implementación de los autores (`pmsampsize_cont`,
//    1.1.3), con sus vectores de prueba (tests/testthat/test_cont.R: 918/401/259/918, …). Su
//    criterio (iv) arranca en el mayor de los otros tres; aquí se implementa lo que dice su
//    descripción —margen multiplicativo de 10 % en la media— y coincide en todos esos vectores.
//  · Varias clases: APROXIMACIÓN declarada, uno contra el resto con el mayor n. Pate et al.
//    proponen un criterio propio para la regresión multinomial; esto no lo reemplaza.
//
// Motor puro: nada de DOM ni de datos del usuario.

/** Contracción global mínima (criterio i): S_VH ≥ 0,9, o sea sobreajuste esperado ≤ 10 %. */
export const CONTRACCION_MINIMA = 0.9;
/** Diferencia máxima entre R² de Nagelkerke aparente y ajustado (criterio ii). */
export const OPTIMISMO_MAXIMO = 0.05;
/** Margen de error absoluto del riesgo medio (criterio iii, dos clases). */
export const MARGEN_RIESGO = 0.05;
/** Sin otra información: R² de Nagelkerke supuesto = 0,15 (Riley parte II; Pate § 4). */
export const NAGELKERKE_SUPUESTO = 0.15;
/** Margen multiplicativo de la media (criterio iv, una cantidad): 10 %. */
export const MARGEN_MEDIA = 0.1;
/** Criterio (iii) de una cantidad: n = 234 + P (varianza residual con margen de 10 %). */
export const BASE_VARIANZA = 234;

const Z975 = 1.959964;

export type CriterioBinario = "contraccion" | "optimismo" | "riesgo-medio";
export type CriterioCantidad =
  "contraccion" | "optimismo" | "varianza" | "media";

export type MuestraBinaria = {
  readonly contraccion: number;
  readonly optimismo: number;
  readonly riesgoMedio: number;
  readonly final: number;
  readonly manda: CriterioBinario;
  /** R² de Cox-Snell ajustado que se usó. */
  readonly r2cs: number;
  /** El máximo posible de R² de Cox-Snell con esta prevalencia. */
  readonly r2max: number;
  readonly eventos: number;
  /** Eventos por parámetro candidato. */
  readonly epp: number;
};

/** max(R²_CS) = 1 − exp(2·(φ·ln φ + (1−φ)·ln(1−φ))): no depende de n. */
export function r2Maximo(prevalencia: number): number {
  const entropia =
    prevalencia * Math.log(prevalencia) +
    (1 - prevalencia) * Math.log(1 - prevalencia);
  return 1 - Math.exp(2 * entropia);
}

/** Ecuación (4): n para una contracción S dada (R²_CS ajustado, P parámetros). */
export function nPorContraccion(
  parametros: number,
  r2cs: number,
  contraccion: number,
): number {
  return parametros / ((contraccion - 1) * Math.log(1 - r2cs / contraccion));
}

/** Ecuación (7): la contracción que asegura una diferencia ≤ δ entre los R² de Nagelkerke. */
export function contraccionParaOptimismo(
  r2cs: number,
  r2max: number,
  delta = OPTIMISMO_MAXIMO,
): number {
  return r2cs / (r2cs + delta * r2max);
}

/** Ecuación (9): n para estimar el riesgo medio con un margen de error absoluto δ. */
export function nPorRiesgoMedio(
  prevalencia: number,
  delta = MARGEN_RIESGO,
): number {
  return (Z975 / delta) ** 2 * prevalencia * (1 - prevalencia);
}

export class MuestraInvalida extends Error {
  constructor(readonly campo: string) {
    super(`muestra: ${campo}`);
  }
}

function entero(valor: number, campo: string): void {
  if (!Number.isInteger(valor) || valor < 1) throw new MuestraInvalida(campo);
}

/**
 * Tamaño mínimo para dos clases. `prevalencia` es la proporción del caso en tus datos;
 * `r2cs` el R² de Cox-Snell ajustado anticipado (si falta, el supuesto de Riley: 0,15 del máximo).
 */
export function muestraBinaria(entrada: {
  parametros: number;
  prevalencia: number;
  r2cs?: number;
}): MuestraBinaria {
  const { parametros, prevalencia } = entrada;
  entero(parametros, "parametros");
  if (!(prevalencia > 0 && prevalencia < 1))
    throw new MuestraInvalida("prevalencia");
  const r2max = r2Maximo(prevalencia);
  const r2cs = entrada.r2cs ?? NAGELKERKE_SUPUESTO * r2max;
  if (!(r2cs > 0 && r2cs < r2max)) throw new MuestraInvalida("r2cs");

  const contraccion = Math.ceil(
    nPorContraccion(parametros, r2cs, CONTRACCION_MINIMA),
  );
  const optimismo = Math.ceil(
    nPorContraccion(parametros, r2cs, contraccionParaOptimismo(r2cs, r2max)),
  );
  const riesgoMedio = Math.ceil(nPorRiesgoMedio(prevalencia));
  const final = Math.max(contraccion, optimismo, riesgoMedio);
  const manda: CriterioBinario =
    final === optimismo
      ? "optimismo"
      : final === contraccion
        ? "contraccion"
        : "riesgo-medio";
  const eventos = final * prevalencia;
  return {
    contraccion,
    optimismo,
    riesgoMedio,
    final,
    manda,
    r2cs,
    r2max,
    eventos,
    epp: eventos / parametros,
  };
}

export type MuestraMulticlase = {
  /** El mayor n entre los «uno contra el resto». */
  readonly final: number;
  /** La clase cuyo «uno contra el resto» pide más filas. */
  readonly clase: string;
  readonly manda: CriterioBinario;
  readonly porClase: Readonly<Record<string, number>>;
};

/**
 * Varias clases: APROXIMACIÓN uno contra el resto. Para cada clase, el tamaño de dos clases
 * con su proporción; se queda el mayor. No es el criterio multinomial de Pate et al.
 */
export function muestraMulticlase(entrada: {
  parametros: number;
  proporciones: Readonly<Record<string, number>>;
}): MuestraMulticlase {
  // Un Map, no un objeto: una clase puede llamarse «__proto__» (S12).
  const porClase = new Map<string, number>();
  let mejor: { clase: string; muestra: MuestraBinaria } | null = null;
  for (const [clase, prevalencia] of Object.entries(entrada.proporciones)) {
    const muestra = muestraBinaria({
      parametros: entrada.parametros,
      prevalencia,
    });
    porClase.set(clase, muestra.final);
    if (!mejor || muestra.final > mejor.muestra.final)
      mejor = { clase, muestra };
  }
  if (!mejor) throw new MuestraInvalida("proporciones");
  return {
    final: mejor.muestra.final,
    clase: mejor.clase,
    manda: mejor.muestra.manda,
    porClase: Object.fromEntries(porClase),
  };
}

/** Cuantil 0,975 de la t de Student (Cornish-Fisher; exacto a 1e-6 con df ≥ 200). */
export function t975(df: number): number {
  const z = Z975;
  const z3 = z ** 3;
  const z5 = z ** 5;
  const z7 = z ** 7;
  return (
    z +
    (z3 + z) / (4 * df) +
    (5 * z5 + 16 * z3 + 3 * z) / (96 * df ** 2) +
    (3 * z7 + 19 * z5 + 17 * z3 - 15 * z) / (384 * df ** 3)
  );
}

export type MuestraCantidad = {
  readonly contraccion: number;
  readonly optimismo: number;
  readonly varianza: number;
  /** `null` si la media es 0: el margen multiplicativo no existe. */
  readonly media: number | null;
  readonly final: number;
  readonly manda: CriterioCantidad;
};

/** Tope de la búsqueda de n (más allá, el criterio se declara inalcanzable). */
export const N_MAXIMO = 5_000_000;

function contraccionEsperada(n: number, p: number, r2: number): number {
  return 1 + (p - 2) / (n * Math.log(1 - (r2 * (n - p - 1) + p) / (n - 1)));
}

/**
 * Tamaño mínimo para estimar una cantidad. `r2` es el R² ajustado anticipado del modelo;
 * `media` y `desviacion` las del objetivo en tus datos.
 */
export function muestraCantidad(entrada: {
  parametros: number;
  r2: number;
  media: number;
  desviacion: number;
}): MuestraCantidad {
  const { parametros: p, r2, media, desviacion } = entrada;
  entero(p, "parametros");
  if (!(r2 > 0 && r2 < 1)) throw new MuestraInvalida("r2");
  if (!(desviacion > 0)) throw new MuestraInvalida("desviacion");

  // (i) contracción esperada ≥ 0,9: el menor n ≥ P + 2 que la cumple.
  let n1 = p + 2;
  while (n1 < N_MAXIMO) {
    const s = contraccionEsperada(n1, p, r2);
    if (!Number.isNaN(s) && s >= CONTRACCION_MINIMA) break;
    n1 += 1;
  }
  // (ii) diferencia ≤ 0,05 entre R² aparente y ajustado.
  const n2 = Math.ceil(1 + (p * (1 - r2)) / OPTIMISMO_MAXIMO);
  // (iii) desviación residual con margen de 10 %: 234 + P.
  const n3 = BASE_VARIANZA + p;
  // (iv) media con margen multiplicativo de 10 %: arranca en el mayor de los otros tres.
  let n4: number | null = Math.max(n1, n2, n3);
  if (media === 0) n4 = null;
  else {
    const varianza = desviacion ** 2 * (1 - r2);
    while (n4 < N_MAXIMO) {
      const df = n4 - p - 1;
      const semiancho = t975(df) * Math.sqrt(varianza / n4);
      if (semiancho <= MARGEN_MEDIA * Math.abs(media)) break;
      n4 += 1;
    }
  }
  const final = Math.max(n1, n2, n3, n4 ?? 0);
  const manda: CriterioCantidad =
    final === n1
      ? "contraccion"
      : final === n2
        ? "optimismo"
        : final === n3
          ? "varianza"
          : "media";
  return {
    contraccion: n1,
    optimismo: n2,
    varianza: n3,
    media: n4,
    final,
    manda,
  };
}
