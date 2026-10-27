// S20 (ADR 028): la frase del veredicto del pronóstico, en el idioma de la pantalla, y su comprobación contra los números. La frase
// sale de una plantilla de los dos idiomas (jamás de un modelo de lenguaje) y pasa por `verificarTexto`: si no dice las cifras del
// resultado, o dice una ajena, cae a una línea con solo los dos errores.
import type { CasoVeredicto, VeredictoPronostico } from "@/engine/pronostico";
import type { Locale } from "@/i18n/config";
import { textoPropio } from "@/i18n/textos-etapa";
import { formatQuantity, quantityDecimals } from "@/lib/quantity";
import type { ForecastMethod } from "@/workers/protocol";
import { verificarTexto } from "./cifras";
import { TEXTOS_PRONOSTICO } from "./textos-pronostico";

type Parametros = Record<string, string | number>;

export const trPronostico = (
  locale: Locale,
  clave: string,
  params?: Parametros,
): string => textoPropio(TEXTOS_PRONOSTICO, locale, clave, params) ?? clave;

const METODOS: readonly ForecastMethod[] = [
  "media",
  "ingenuo",
  "ingenuo_estacional",
  "deriva",
  "holt_winters",
  "rezagos",
];

export type FraseVeredicto = {
  readonly texto: string;
  /** Falso si la plantilla no cuadró con las cifras y se cayó a la línea mínima. */
  readonly verificada: boolean;
};

export function fraseVeredicto(
  v: VeredictoPronostico,
  contexto: {
    readonly columna: string;
    readonly horizonte: number;
    readonly pliegues: number;
  },
  locale: Locale,
): FraseVeredicto {
  const decimales = quantityDecimals([v.maeGanador, v.maeReferencia]);
  const mae = formatQuantity(v.maeGanador, decimales);
  const maeRef = formatQuantity(v.maeReferencia, decimales);
  const pct = Math.round(v.mejora * 100);
  const params: Parametros = {
    ganador: trPronostico(locale, `pronostico.corto.${v.ganador}`),
    referencia: trPronostico(locale, `pronostico.corto.${v.referencia}`),
    columna: contexto.columna,
    horizonte: formatQuantity(contexto.horizonte, 0),
    pliegues: formatQuantity(contexto.pliegues, 0),
    mae,
    mae_ref: maeRef,
    pct: formatQuantity(pct, 0),
  };
  const texto = trPronostico(locale, `pronostico.veredicto.${v.caso}`, params);

  // qué cifras tiene que decir cada caso: el error del ganador siempre; el de la referencia y la mejora, cuando se comparan
  const compara = v.caso === "supera" || v.caso === "empata";
  const requeridas: { clave: string; valor: number; decimales: number }[] = [
    { clave: "mae", valor: v.maeGanador, decimales: decimales },
  ];
  if (compara)
    requeridas.push({ clave: "mae_ref", valor: v.maeReferencia, decimales });
  if (v.caso === "supera") requeridas.push({ clave: "pct", valor: pct, decimales: 0 });
  const nombres = [
    contexto.columna,
    ...METODOS.map((m) => trPronostico(locale, `pronostico.corto.${m}`)),
  ];
  const fallos = verificarTexto(texto, {
    requeridas,
    permitidas: [
      formatQuantity(contexto.horizonte, 0),
      formatQuantity(contexto.pliegues, 0),
    ],
    // «una diferencia menor de 1 %» es parte de la frase del empate
    fijas: v.caso === "empata" ? ["1"] : [],
    nombres,
  });
  if (fallos.length === 0) return { texto, verificada: true };
  return {
    texto: trPronostico(locale, "pronostico.veredicto.minimo", params),
    verificada: false,
  };
}

/** Los casos que el panel distingue con símbolo + palabra: el color nunca va solo. */
export const SIMBOLO_CASO: Record<CasoVeredicto, "✓" | "≈" | "⚠"> = {
  supera: "✓",
  empata: "≈",
  simple: "⚠",
  sin_estructura: "⚠",
};
