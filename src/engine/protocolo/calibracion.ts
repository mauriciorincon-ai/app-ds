// Protocolo DS (S13), etapa 8 — ¿las probabilidades son probabilidades? Con dos clases se calibra la
// probabilidad de «hay que actuar»; con varias, la confianza de la clase que el modelo eligió contra si
// acertó. La curva va por tramos de igual ancho (5 con menos de 200 filas, 10 desde ahí), cada uno con su
// conteo; el Brier es el error cuadrático medio de esas probabilidades, junto al de decir siempre la tasa
// base (lo que logra quien no sabe nada). La lectura en palabras toma el tramo con soporte más desajustado:
// «cuando dice entre 60 y 80 %, pasa en 45 % de 12 casos». La etapa 8 MIDE; no recalibra el modelo.

export const TRAMOS_CHICA = 5;
export const TRAMOS_GRANDE = 10;
export const FILAS_TRAMOS_GRANDE = 200;
/** Un tramo con menos casos no se lee en palabras: su tasa cambia con un caso. Convención. */
export const SOPORTE_TRAMO = 5;

export type Tramo = {
  readonly n: number;
  /** La probabilidad media que dijo el modelo en el tramo (0 si está vacío). */
  readonly predicho: number;
  /** Con qué frecuencia pasó de verdad (0 si está vacío). */
  readonly observado: number;
};

export type Calibracion = {
  readonly tramos: readonly Tramo[];
  readonly brier: number;
  /** El Brier de decir siempre la tasa base de la prueba. */
  readonly brierBase: number;
};

export const tramosPara = (filas: number) =>
  filas < FILAS_TRAMOS_GRANDE ? TRAMOS_CHICA : TRAMOS_GRANDE;

/** `probas[i]` es lo que dijo el modelo; `pasa[i]`, 1 si ocurrió (o si acertó, con varias clases). */
export function calibrar(
  probas: readonly number[],
  pasa: readonly (0 | 1)[],
): Calibracion {
  const n = probas.length;
  const k = tramosPara(n);
  const [cuenta, suma, ocurre] = [
    new Array<number>(k).fill(0),
    new Array<number>(k).fill(0),
    new Array<number>(k).fill(0),
  ];
  let [cuadrados, positivos] = [0, 0];
  for (let i = 0; i < n; i++) {
    const [p, y] = [probas[i]!, pasa[i]!];
    const t = Math.min(k - 1, Math.floor(p * k));
    cuenta[t]! += 1;
    suma[t]! += p;
    ocurre[t]! += y;
    cuadrados += (p - y) ** 2;
    positivos += y;
  }
  const tasa = n > 0 ? positivos / n : 0;
  return {
    tramos: cuenta.map((m, t) => ({
      n: m,
      predicho: m > 0 ? suma[t]! / m : 0,
      observado: m > 0 ? ocurre[t]! / m : 0,
    })),
    brier: n > 0 ? cuadrados / n : 0,
    brierBase: tasa * (1 - tasa),
  };
}

export type Lectura = {
  /** El tramo, contando desde 1. */
  readonly tramo: number;
  readonly desde: number;
  readonly hasta: number;
  readonly predicho: number;
  readonly observado: number;
  readonly n: number;
};

/** El tramo con soporte donde lo dicho y lo que pasó más se separan; `null` si ninguno tiene soporte. */
export function lecturaDe(tramos: readonly Tramo[]): Lectura | null {
  const k = tramos.length;
  let mejor: Lectura | null = null;
  tramos.forEach((t, i) => {
    if (t.n < SOPORTE_TRAMO) return;
    const brecha = Math.abs(t.predicho - t.observado);
    if (mejor === null || brecha > Math.abs(mejor.predicho - mejor.observado))
      mejor = {
        tramo: i + 1,
        desde: i / k,
        hasta: (i + 1) / k,
        predicho: t.predicho,
        observado: t.observado,
        n: t.n,
      };
  });
  return mejor;
}
