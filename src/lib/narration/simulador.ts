// S19 (ADR 027): la frase del resumen del simulador «¿qué pasaría si?», VERIFICADA contra la comparación. Sin una llamada a un LLM:
// el texto sale de la plantilla de la tarea y, antes de mostrarse, pasa por la comprobación de cifras de siempre (`cifras.ts`):
// cada cifra que dice es la de la comparación y todas las requeridas están. Si no cuadra, se muestra el texto mínimo, que solo dice
// cuántas decisiones cambian. No juzga si el cambio es sensato ni si el modelo acierta: juzga que el texto cuadre con los números.
import { matchByTask } from "@/engine/despacho";
import {
  POR_DECISIONES,
  type Comparacion,
  type Dinero,
} from "@/engine/simulador";
import type { Locale } from "@/i18n/config";
import { textoPropio } from "@/i18n/textos-etapa";
import { formatQuantity, quantityDecimals } from "@/lib/quantity";
import { escribir, verificarTexto, type Esperado, type Fallo } from "./cifras";
import { TEXTOS_SIMULADOR } from "./textos-simulador";

/** La unidad de los costos que escribió el usuario («USD»), o `null` si no escribió ninguna. */
export type UnidadDinero = string | null;

const tr = (
  locale: Locale,
  key: string,
  params?: Record<string, string | number>,
): string => textoPropio(TEXTOS_SIMULADOR, locale, key, params) ?? key;

const entero = (v: number) => escribir(v, 0);
const conSigno = (texto: string, valor: number) =>
  valor > 0 ? `+${texto}` : texto;

/** Los tres montos del dinero con los mismos decimales, cada uno con su unidad. */
function montos(d: Dinero, unidad: UnidadDinero) {
  const dec = quantityDecimals([d.antes, d.despues, d.delta]);
  const u = (t: string) => (unidad ? `${t} ${unidad}` : t);
  return {
    decimales: dec,
    antes: u(formatQuantity(d.antes, dec)),
    despues: u(formatQuantity(d.despues, dec)),
    delta: u(conSigno(formatQuantity(d.delta, dec), d.delta)),
  };
}

/**
 * La frase estándar de la comparación, tal como la escribe la plantilla de su tarea. `unidad` es la de lo que se cuenta en dinero
 * (dos y varias clases: la que escribió el usuario en sus costos) o la del objetivo (estimar una cantidad: «kWh»).
 */
export function fraseDe(
  c: Comparacion,
  locale: Locale,
  unidad: UnidadDinero,
): string {
  const dinero = (): string => {
    if (c.dinero) {
      const m = montos(c.dinero, unidad);
      return tr(locale, "simulador.resumen.dinero", {
        costo_antes: m.antes,
        costo_despues: m.despues,
        delta: m.delta,
      });
    }
    return c.sinDinero
      ? tr(locale, `simulador.resumen.sin_dinero.${c.sinDinero}`)
      : "";
  };
  return matchByTask(c, {
    binaria: (b) =>
      tr(locale, "simulador.resumen.binaria", {
        n: entero(b.n),
        antes: entero(b.actuan.antes),
        despues: entero(b.actuan.despues),
        cambian: entero(b.cambian),
        count: b.cambian,
      }) +
      (b.umbral !== null
        ? tr(locale, "simulador.resumen.umbral", { umbral: escribir(b.umbral, 2) })
        : "") +
      dinero(),
    multiclase: (m) =>
      tr(locale, "simulador.resumen.multiclase", {
        n: entero(m.n),
        cambian: entero(m.cambian),
        count: m.cambian,
      }) + dinero(),
    numerica: (x) => {
      const dec = quantityDecimals([
        x.cambioMedio,
        x.promedio.antes,
        x.promedio.despues,
      ]);
      const u = (t: string) => (unidad ? `${t} ${unidad}` : t);
      return tr(locale, "simulador.resumen.numerica", {
        n: entero(x.n),
        cambio: u(conSigno(formatQuantity(x.cambioMedio, dec), x.cambioMedio)),
        antes: u(formatQuantity(x.promedio.antes, dec)),
        despues: u(formatQuantity(x.promedio.despues, dec)),
      });
    },
    agrupar: (g) =>
      tr(locale, "simulador.resumen.agrupar", {
        n: entero(g.n),
        cambian: entero(g.cambian),
        count: g.cambian,
      }),
  });
}

/** Las cifras que la frase de esta comparación TIENE que decir, y las únicas fijas que puede traer. */
export function esperadoDe(c: Comparacion, unidad: UnidadDinero): Esperado {
  const req = (clave: string, valor: number, decimales = 0) => ({
    clave,
    valor,
    decimales,
  });
  const dineroReq = (d: Dinero | null) => {
    if (!d) return [];
    const dec = montos(d, null).decimales;
    return [
      req("costo_antes", d.antes, dec),
      req("costo_despues", d.despues, dec),
      req("delta", d.delta, dec),
    ];
  };
  const nombres = unidad ? [unidad] : [];
  return matchByTask(c, {
    binaria: (b): Esperado => ({
      requeridas: [
        req("n", b.n),
        req("antes", b.actuan.antes),
        req("despues", b.actuan.despues),
        req("cambian", b.cambian),
        ...(b.umbral !== null ? [req("umbral", b.umbral, 2)] : []),
        ...dineroReq(b.dinero),
      ],
      fijas: b.dinero ? [String(POR_DECISIONES)] : [],
      nombres,
    }),
    multiclase: (m): Esperado => ({
      requeridas: [req("n", m.n), req("cambian", m.cambian), ...dineroReq(m.dinero)],
      fijas: m.dinero ? [String(POR_DECISIONES)] : [],
      nombres,
    }),
    numerica: (x): Esperado => {
      const dec = quantityDecimals([
        x.cambioMedio,
        x.promedio.antes,
        x.promedio.despues,
      ]);
      return {
        requeridas: [
          req("n", x.n),
          req("cambio", x.cambioMedio, dec),
          req("antes", x.promedio.antes, dec),
          req("despues", x.promedio.despues, dec),
        ],
        nombres,
      };
    },
    agrupar: (g): Esperado => ({
      requeridas: [req("n", g.n), req("cambian", g.cambian)],
    }),
  });
}

export type ResumenSimulacion = {
  readonly texto: string;
  /** El texto estándar cuadró con los números. Si no, `texto` es el mínimo. */
  readonly verificado: boolean;
  readonly fallos: readonly Fallo[];
};

/** El texto mínimo: solo cuántas decisiones cambian, con las mismas palabras de siempre. */
export function textoMinimo(c: Comparacion, locale: Locale): string {
  return tr(locale, "simulador.minima", {
    cambian: entero(c.cambian),
    n: entero(c.n),
    count: c.cambian,
  });
}

/**
 * El resumen que se muestra: la frase estándar si cuadra con la comparación; si no, el texto mínimo. `candidata` permite probar
 * con un texto alterado (como en `explicacion.ts`): hoy la candidata es siempre `fraseDe`.
 */
export function resumenVerificado(
  c: Comparacion,
  locale: Locale,
  unidad: UnidadDinero,
  candidata: string = fraseDe(c, locale, unidad),
): ResumenSimulacion {
  const fallos = verificarTexto(candidata, esperadoDe(c, unidad));
  return fallos.length === 0
    ? { texto: candidata, verificado: true, fallos }
    : { texto: textoMinimo(c, locale), verificado: false, fallos };
}
