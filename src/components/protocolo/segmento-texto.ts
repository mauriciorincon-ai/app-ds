// Protocolo DS (S13): cómo se lee en pantalla un segmento de la etapa 8 («c:canal=web» → «canal = «web»»).
// Lo pintan la forma y el cuaderno: sus textos viven en el diccionario de la página.
import { leerSegmento } from "@/engine/protocolo/etapa8";

type Traduce = (
  clave: string,
  params?: Record<string, string | number>,
) => string;

/** El segmento dicho con palabras; un id que no se lee se muestra tal cual. */
export function segmentoTexto(t: Traduce, id: string): string {
  const s = leerSegmento(id);
  if (!s) return id;
  const base = `protocol.stage.8.segment.${s.tipo}`;
  if (s.tipo === "periodo") return t(base, { valor: s.valor });
  if (s.tipo === "categoria")
    return t(base, { columna: s.columna, valor: s.valor });
  return t(base, { columna: s.columna, tramo: s.tramo });
}
