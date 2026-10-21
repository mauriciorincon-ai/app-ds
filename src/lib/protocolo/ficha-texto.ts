// Protocolo DS (S15, etapa 10): cómo se dice una ficha. La ficha (engine/protocolo/ficha.ts) son claves con
// parámetros y su fuente; aquí se vuelven frases en el idioma activo, con las mismas cifras que el resto del
// Protocolo (R9). Las usan la pantalla y el Markdown descargable, para que digan exactamente lo mismo.
// Carga diferida con la etapa 10.
import { segmentoTexto } from "@/components/protocolo/segmento-texto";
import { resumenEtapa5 } from "@/engine/protocolo/etapa5";
import type { EtapaId } from "@/engine/protocolo/etapas";
import type {
  EvidenciaFicha,
  Ficha,
  Fuente,
  IdSeccion,
  LineaFicha,
  Parametros,
} from "@/engine/protocolo/ficha";
import type { Locale } from "@/i18n/config";
import { formatQuantity } from "@/lib/quantity";
import { cifra, fecha, huellaCorta, proporcion } from "./formato";

export type Traduce = (
  clave: string,
  params?: Record<string, string | number>,
) => string;

/** Lo que nombra a la línea base: la clase o la opción que registró la etapa 5. */
export type Nombres = { readonly clase: string; readonly opcion: string };

export function nombresDe(
  evidencias: Readonly<Partial<Record<EtapaId, EvidenciaFicha>>>,
): Nombres {
  const cinco = evidencias[5];
  const r = cinco ? resumenEtapa5(cinco.datos) : null;
  return { clase: r?.claseMayoritaria ?? "", opcion: r?.opcionBarata ?? "" };
}

const BASE = "protocol.stage.10.sheet";
/** Entre 0 y 1, con los decimales que no escriben «0.00» para algo que no es cero. */
const PROPORCIONES = new Set([
  "umbral",
  "p",
  "brier",
  "brierBase",
  "moderada",
  "alerta",
]);

/** Los parámetros de una línea como los lee una persona: costos por cada 100, proporciones, nombres traducidos. */
export function parametrosTexto(
  t: Traduce,
  params: Parametros,
  nombres: Nombres,
): Record<string, string | number> {
  const salida: Record<string, string | number> = {};
  for (const [clave, valor] of Object.entries(params)) {
    if (typeof valor === "string") {
      if (clave === "baseId" || clave === "hoyId")
        salida[clave === "baseId" ? "base" : "hoy"] =
          valor === "regla"
            ? t("protocol.stage.9.summary.today-rule")
            : t(`protocol.stage.5.ref.${valor}`, nombres);
      else if (clave === "esquema")
        salida[clave] = t(`protocol.stage.6.scheme.${valor}`);
      else if (clave === "metrica")
        salida[clave] = t(`results.metrics.${valor}`);
      else if (clave === "ganador")
        salida[clave] = t(`results.candidates.short.${valor}`);
      else if (clave === "segmento") salida[clave] = segmentoTexto(t, valor);
      else salida[clave] = valor;
    } else if (clave.endsWith("100")) salida[clave] = cifra(valor);
    else if (clave.endsWith("Pct"))
      salida[clave] = formatQuantity(valor * 100, 1);
    else if (PROPORCIONES.has(clave)) salida[clave] = proporcion(valor);
    else salida[clave] = cifra(valor);
  }
  return salida;
}

/** «Etapa 4 · fecha · huella …», o «Escrito por el dueño · fecha». */
export function fuenteTexto(
  t: Traduce,
  fuente: Fuente,
  locale: Locale,
): string {
  if (fuente.tipo === "dueno")
    return fuente.fecha
      ? t(`${BASE}.source.owner`, { fecha: fecha(fuente.fecha, locale) })
      : t(`${BASE}.source.owner-pending`);
  if (!fuente.fecha)
    return t(`${BASE}.source.stage-pending`, { n: fuente.etapa });
  const cuando = fecha(fuente.fecha, locale);
  return fuente.huella
    ? t(`${BASE}.source.stage`, {
        n: fuente.etapa,
        fecha: cuando,
        huella: huellaCorta(fuente.huella),
      })
    : t(`${BASE}.source.stage-no-hash`, { n: fuente.etapa, fecha: cuando });
}

export type LineaVista = {
  readonly texto: string;
  readonly fuente: string;
  /** Lo escribió el dueño: no se deriva del cuaderno. */
  readonly deDueno: boolean;
};
export type SeccionVista = {
  readonly id: IdSeccion;
  readonly titulo: string;
  readonly lineas: readonly LineaVista[];
};

export function lineaVista(
  t: Traduce,
  seccion: IdSeccion,
  linea: LineaFicha,
  nombres: Nombres,
  locale: Locale,
): LineaVista {
  return {
    texto: t(
      `${BASE}.${seccion}.${linea.clave}`,
      parametrosTexto(t, linea.params, nombres),
    ),
    fuente: fuenteTexto(t, linea.fuente, locale),
    deDueno: linea.fuente.tipo === "dueno",
  };
}

/** La ficha dicha con palabras, sección por sección. */
export function fichaVista(
  ficha: Ficha,
  t: Traduce,
  locale: Locale,
  nombres: Nombres,
): SeccionVista[] {
  return ficha.secciones.map((s) => ({
    id: s.id,
    titulo: t(`${BASE}.section.${s.id}`),
    lineas: s.lineas.map((l) => lineaVista(t, s.id, l, nombres, locale)),
  }));
}
