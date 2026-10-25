// S19 (ADR 027): lo que el usuario se lleva del modelo en reglas, en su idioma: el TEXTO (una línea por regla) y el SQL. Los dos
// salen del mismo árbol que la pantalla (`engine/reglas.ts`); aquí solo se les pone palabras. Los cortes se escriben tal cual
// están en el SQL (`String(valor)`, sin redondear para la vista): quien traslade las reglas a mano ve el mismo número.
import { matchTask } from "@/engine/despacho";
import {
  hojasDe,
  sqlDe,
  type CondicionRegla,
} from "@/engine/reglas";
import type { Locale } from "@/i18n/config";
import { textoPropio } from "@/i18n/textos-etapa";
import { formatQuantity, quantityDecimals } from "@/lib/quantity";
import type { RulesResult } from "@/workers/protocol";
import { TEXTOS_REGLAS } from "./textos-reglas";

type Parametros = Record<string, string | number>;

const tr = (locale: Locale, key: string, params?: Parametros): string =>
  textoPropio(TEXTOS_REGLAS, locale, key, params) ?? key;

/** La palabra de la predicción de una hoja: la clase tal cual, el grupo («Grupo 2», «Fuera de todo grupo») o la cantidad. */
export function etiquetaDe(
  tarea: RulesResult["task"],
  pred: string | number,
  locale: Locale,
): string | number {
  return matchTask(tarea, {
    binaria: () => pred,
    multiclase: () => pred,
    numerica: () => pred,
    agrupar: () =>
      pred === -1
        ? tr(locale, "reglas.fuera")
        : tr(locale, "reglas.grupo", { n: Number(pred) + 1 }),
  });
}

function condicionTexto(c: CondicionRegla, locale: Locale): string {
  if (c.kind === "numeric")
    return tr(locale, c.op === ">" ? "reglas.texto.mayor" : "reglas.texto.menor", {
      columna: c.column,
      valor: String(c.valor),
    });
  return tr(locale, c.op === "es" ? "reglas.texto.es" : "reglas.texto.no_es", {
    columna: c.column,
    categoria: c.categoria,
  });
}

/** El SQL de las reglas: un `CASE WHEN` por hoja, sobre una tabla con las columnas del modelo. */
export function sqlDeReglas(
  r: RulesResult,
  locale: Locale,
  tabla = "tu_tabla",
  alias = "prediccion",
): string {
  return sqlDe(r, {
    tabla,
    alias,
    etiqueta: (pred) => etiquetaDe(r.task, pred, locale),
  });
}

/**
 * El texto de las reglas, una línea por regla, en el idioma de la pantalla. `unidad` es la del objetivo al estimar («kWh»). Lleva
 * en la cabecera cuánto se parecen al modelo y cierra diciendo cómo se tratan los vacíos, que es lo que cambia una predicción.
 */
export function textoReglas(
  r: RulesResult,
  locale: Locale,
  opciones: { readonly unidad?: string | null; readonly fidelidadSuficiente: boolean },
): string {
  const hojas = hojasDe(r.tree);
  const decimales = quantityDecimals(
    hojas.map((h) => (typeof h.pred === "number" ? h.pred : 0)),
  );
  const resultado = (pred: string | number): string =>
    matchTask(r.task, {
      binaria: () => tr(locale, "reglas.texto.resultado_clase", { clase: String(pred) }),
      multiclase: () => tr(locale, "reglas.texto.resultado_clase", { clase: String(pred) }),
      numerica: () => {
        const t = formatQuantity(Number(pred), decimales);
        return opciones.unidad ? `${t} ${opciones.unidad}` : t;
      },
      agrupar: () =>
        tr(locale, "reglas.texto.resultado_clase", {
          clase: String(etiquetaDe(r.task, pred, locale)),
        }),
    });
  const pct = (v: number) => formatQuantity(v * 100, 1);
  const lineas: string[] = [];
  lineas.push(
    tr(locale, "reglas.texto.cabecera", {
      tipo: tr(
        locale,
        `reglas.texto.tipo.${matchTask(r.task, {
          binaria: () => "clase",
          multiclase: () => "clase",
          numerica: () => "cantidad",
          agrupar: () => "grupo",
        })}`,
      ),
    }),
  );
  lineas.push(
    r.fidelity.metric === "r2"
      ? tr(locale, "reglas.fidelidad.r2", { pct: pct(r.fidelity.value), n: formatQuantity(r.fidelity.n, 0) })
      : tr(locale, "reglas.fidelidad.acuerdo", { pct: pct(r.fidelity.value), n: formatQuantity(r.fidelity.n, 0) }),
  );
  if (!opciones.fidelidadSuficiente) lineas.push(tr(locale, "reglas.texto.aviso"));
  lineas.push("");
  hojas.forEach((hoja, i) => {
    const comun = {
      numero: i + 1,
      resultado: resultado(hoja.pred),
      filas: formatQuantity(hoja.n, 0),
      count: hoja.n,
    };
    lineas.push(
      hoja.condiciones.length === 0
        ? tr(locale, "reglas.texto.siempre", comun)
        : tr(locale, "reglas.texto.regla", {
            ...comun,
            condiciones: hoja.condiciones
              .map((c) => condicionTexto(c, locale))
              .join(tr(locale, "reglas.texto.y")),
          }),
    );
  });
  lineas.push("");
  const usadas = new Set(hojas.flatMap((h) => h.condiciones.map((c) => c.column)));
  for (const c of r.numeric)
    if (usadas.has(c.column))
      lineas.push(
        tr(locale, "reglas.texto.vacio", { columna: c.column, mediana: String(c.median) }),
      );
  if (
    hojas.some((h) => h.condiciones.some((c) => c.kind === "categorical"))
  )
    lineas.push(tr(locale, "reglas.texto.vacio_categoria"));
  return lineas.join("\n") + "\n";
}
