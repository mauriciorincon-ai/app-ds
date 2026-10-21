// Protocolo DS (S15, etapa 10): la ficha del modelo como Markdown descargable, en el idioma activo. Se importa
// al tocar «Descargar» (patrón de modelcard.ts): quien no descarga no paga su peso. Sale de la misma vista
// que la pantalla (ficha-texto.ts), así que dice exactamente lo mismo; el archivo nace y se queda en el equipo
// (regla dura 2: sin filas ni valores, solo conteos, costos, nombres de columna y lo que escribió el dueño).
import type { Carga } from "@/engine/protocolo/cuaderno";
import type { Ficha } from "@/engine/protocolo/ficha";
import type { Locale } from "@/i18n/config";
import { datasetSlug } from "@/lib/files";
import { fichaVista, type Nombres, type Traduce } from "./ficha-texto";

const BASE = "protocol.stage.10.sheet";

/** Una línea de lista: sin saltos (los rompería) y sin `<` (una columna llamada `<img…>` no debe pintarse). */
const limpio = (s: string) =>
  s.replace(/\s*\r?\n\s*/g, " ").replace(/</g, "\\<");

/** `ficha-del-modelo-<archivo>.md`, o `ficha-del-modelo.md` si el cuaderno no guarda la carga. */
export function nombreFichaMarkdown(carga: Carga | null): string {
  const slug = carga ? datasetSlug(carga.nombre) : "";
  return slug ? `ficha-del-modelo-${slug}.md` : "ficha-del-modelo.md";
}

export function fichaMarkdown(
  ficha: Ficha,
  t: Traduce,
  locale: Locale,
  nombres: Nombres,
): string {
  const salida: string[] = [
    `# ${t(`${BASE}.title`)}`,
    "",
    `**${t(`${BASE}.headline.${ficha.decision}`)}**`,
    "",
    `> ${t(`${BASE}.intro`)}`,
    ">",
    `> ${t(`${BASE}.privacy`)}`,
    "",
  ];
  for (const seccion of fichaVista(ficha, t, locale, nombres)) {
    salida.push(`## ${seccion.titulo}`, "");
    for (const linea of seccion.lineas)
      salida.push(`- ${limpio(linea.texto)} — _${limpio(linea.fuente)}_`);
    salida.push("");
  }
  return salida.join("\n");
}
