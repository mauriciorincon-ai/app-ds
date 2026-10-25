// S18: el plan de limpieza en la ficha del modelo de Probeta (Markdown), con las mismas frases de la pantalla en el idioma de
// la ficha. Puro: recibe el registro y devuelve líneas.
import type { RegistroPaso } from "@/engine/limpieza-plan";
import type { Locale } from "@/i18n/config";
import { textoPropio } from "@/i18n/textos-etapa";
import { TEXTOS_LIMPIEZA } from "./textos";

export function lineasDeLimpieza(
  locale: Locale,
  registro: readonly RegistroPaso[] | undefined,
): string[] {
  if (!registro || registro.length === 0) return [];
  const t = (clave: string, params?: Record<string, string | number>) =>
    textoPropio(TEXTOS_LIMPIEZA, locale, `limpieza.${clave}`, params) ?? clave;
  return [
    `## ${t("ficha.titulo")}`,
    "",
    ...registro.map((paso) => {
      const estado =
        paso.decision === "aprobado"
          ? paso.aplicado
            ? "aplicado"
            : (paso.motivo ?? "aplicado")
          : paso.decision;
      return t("ficha.linea", {
        column: paso.columna,
        corto: t(`ficha.corto.${paso.tipo}`),
        estado: t(`ficha.estado.${estado}`),
      });
    }),
    "",
  ];
}
