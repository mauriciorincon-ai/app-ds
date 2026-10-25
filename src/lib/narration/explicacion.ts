// S18: la explicación de lo que el modelo hace, VERIFICADA contra los números en las cuatro tareas. Sin una llamada nueva a un
// LLM: el texto de cada tarea es el que ya existe (la plantilla determinista de dos clases, de varias clases y de estimar una
// cantidad) o el que se arma aquí (agrupar), y antes de mostrarse pasa por la MISMA comprobación: las cifras son las del
// resultado, y las columnas que más pesan aparecen en su orden. Si no cuadra, se muestra un texto mínimo que solo dice las
// cifras. Es también la puerta por la que pasaría cualquier narración que mañana se escriba para estas tareas.
//
// Lo que NO es: no mide si el modelo es bueno (para eso está el veredicto) ni verifica la narración con IA de dos clases, que
// sigue por /api/narrate y su propio verificador (ADR 005).
import { matchByTask } from "@/engine/despacho";
import type { EdaAlert } from "@/engine/eda";
import type { Locale } from "@/i18n/config";
import { textoPropio } from "@/i18n/textos-etapa";
import { translate } from "@/i18n/translate";
import {
  errorReductionPct,
  formatQuantity,
  profileNumber,
  quantityDecimals,
  thousands,
  withUnit,
} from "@/lib/quantity";
import type {
  ClusterResult,
  GroupProfile,
  SupervisedResult,
} from "@/workers/protocol";
import { escribir, verificarTexto, type Esperado, type Fallo } from "./cifras";
import { TEMPLATE_TOP_FEATURES } from "./templates";
import { TEXTOS_RESULTADOS } from "./textos-resultados";

/** Las cifras que las plantillas escriben de más: rangos fijos («de 0 a 1», «0.50 sería azar»). Un test las cuenta. */
export const CIFRAS_FIJAS = ["0", "1", "0.50", "1.00"] as const;

export type Explicada = {
  texto: string;
  /** true ⇒ el texto cuadró; false ⇒ se muestra el texto mínimo de cifras. */
  verificada: boolean;
  fallos: readonly Fallo[];
};

// los textos de resultados.* viajan en su propio diccionario diferido; el resto (p. ej. el nombre de la métrica), del de la página
const tr = (
  locale: Locale,
  clave: string,
  params?: Record<string, string | number>,
) =>
  textoPropio(TEXTOS_RESULTADOS, locale, clave, params) ??
  translate(locale, clave, params);
const fmt = (valor: number) => valor.toFixed(2);
const redondeo4 = (valor: number) => Math.round(valor * 10_000) / 10_000;
const clamp01 = (valor: number) => Math.min(1, Math.max(0, redondeo4(valor)));

// ---------- tareas con objetivo ----------

/** Lo que el texto de una tarea con objetivo puede y debe decir, sacado del RESULTADO (no de la plantilla). */
export function esperadoDe(
  result: SupervisedResult,
  edaAlerts: readonly EdaAlert[] | null | undefined,
): Esperado {
  const alertas = edaAlerts ?? [];
  const clases = matchByTask(result, {
    binaria: () => [] as string[],
    multiclase: (r) => [...r.classes],
    numerica: () => [] as string[],
  });
  const nombres = [
    ...result.explainability.features.map((f) => f.name),
    ...result.leakage.flatMap((hallazgo) => [
      hallazgo.column,
      hallazgo.class ?? "",
    ]),
    ...alertas.flatMap((a) => ("column" in a ? [a.column] : [])),
    ...alertas.flatMap((a) => ("class" in a && a.class ? [a.class] : [])),
    ...clases,
  ];
  const orden = result.explainability.features
    .slice(0, TEMPLATE_TOP_FEATURES)
    .map((f) => f.name);
  const tasas = alertas.flatMap((a) =>
    a.kind === "class-imbalance" ? [(a.minorityRate * 100).toFixed(0)] : [],
  );
  const base = { fijas: CIFRAS_FIJAS, orden, nombres };
  return matchByTask(result, {
    // en dos clases la plantilla sale del payload de narración, que redondea a 4 decimales antes de escribir a 2
    binaria: (r) => ({
      ...base,
      requeridas: [
        { clave: "modelo", valor: clamp01(r.verdict.modelScore), decimales: 2 },
        { clave: "base", valor: clamp01(r.verdict.baselineScore), decimales: 2 },
      ],
      permitidas: [
        fmt(Math.abs(r.verdict.delta)),
        fmt(Math.abs(redondeo4(r.verdict.delta))),
        ...tasas,
        ...alertas.flatMap((a) =>
          a.kind === "class-imbalance" ? [(clamp01(a.minorityRate) * 100).toFixed(0)] : [],
        ),
      ],
    }),
    multiclase: (r) => ({
      ...base,
      requeridas: [
        { clave: "modelo", valor: r.verdict.modelScore, decimales: 2 },
        { clave: "base", valor: r.verdict.baselineScore, decimales: 2 },
      ],
      permitidas: [
        fmt(Math.abs(r.verdict.delta)),
        String(r.classes.length),
        fmt(1 / r.classes.length),
        fmt(r.model.f1_macro),
        ...tasas,
      ],
    }),
    numerica: (r) => {
      const decimales = quantityDecimals([
        r.verdict.modelScore,
        r.verdict.baselineScore,
      ]);
      return {
        ...base,
        requeridas: [
          { clave: "modelo", valor: r.verdict.modelScore, decimales },
          { clave: "base", valor: r.verdict.baselineScore, decimales },
        ],
        permitidas: [
          String(
            Math.abs(
              errorReductionPct(r.verdict.modelScore, r.verdict.baselineScore),
            ),
          ),
          fmt(r.model.r2),
          ...alertas.flatMap((a) =>
            a.kind === "target-skewed"
              ? [a.skew.toFixed(1)]
              : a.kind === "target-outliers"
                ? [(a.share * 100).toFixed(1)]
                : [],
          ),
        ],
      };
    },
  });
}

/** El texto mínimo: solo las cifras del veredicto y las columnas que más pesan, con las mismas palabras de siempre. */
export function textoMinimo(result: SupervisedResult, locale: Locale): string {
  const lista = result.explainability.features
    .slice(0, TEMPLATE_TOP_FEATURES)
    .map((f) => f.name)
    .join(" · ");
  const metric = tr(locale, `results.metrics.${result.verdict.primaryMetric}`);
  return matchByTask(result, {
    binaria: (r) =>
      tr(locale, "resultados.explicacion.minima.clasificacion", {
        metric,
        modelo: fmt(r.verdict.modelScore),
        base: fmt(r.verdict.baselineScore),
        lista,
      }),
    multiclase: (r) =>
      tr(locale, "resultados.explicacion.minima.clasificacion", {
        metric,
        modelo: fmt(r.verdict.modelScore),
        base: fmt(r.verdict.baselineScore),
        lista,
      }),
    numerica: (r) => {
      const decimales = quantityDecimals([
        r.verdict.modelScore,
        r.verdict.baselineScore,
      ]);
      const q = (valor: number) =>
        withUnit(formatQuantity(valor, decimales), r.unit);
      return tr(locale, "resultados.explicacion.minima.numerica", {
        metric,
        modelo: q(r.verdict.modelScore),
        base: q(r.verdict.baselineScore),
        lista,
      });
    },
  });
}

/**
 * El texto estándar de una tarea con objetivo, comprobado contra su resultado. `candidata` es el texto que se quiere mostrar
 * (hoy, la plantilla de la tarea; en una prueba, una versión alterada): si cuadra, es la que se muestra; si no, el texto mínimo.
 */
export function explicarSupervisada(entrada: {
  result: SupervisedResult;
  locale: Locale;
  edaAlerts?: readonly EdaAlert[] | null;
  candidata: string;
}): Explicada {
  const fallos = verificarTexto(
    entrada.candidata,
    esperadoDe(entrada.result, entrada.edaAlerts),
  );
  return fallos.length === 0
    ? { texto: entrada.candidata, verificada: true, fallos }
    : {
        texto: textoMinimo(entrada.result, entrada.locale),
        verificada: false,
        fallos,
      };
}

// ---------- agrupar ----------

/** El promedio de las medias de los grupos, pesado por su tamaño: la referencia con que cada grupo se compara. */
export function promedioPesado(
  groups: readonly GroupProfile[],
  column: string,
): number | null {
  let suma = 0;
  let peso = 0;
  for (const g of groups) {
    const v = g.numeric[column];
    if (v === null || v === undefined) continue;
    suma += v * g.size;
    peso += g.size;
  }
  return peso > 0 ? suma / peso : null;
}

/** Cuánto se aparta una media del promedio para decir «más alta» o «más baja»: 5 % del promedio. */
export const APARTE_MINIMO = 0.05;

type TextoGrupos = { texto: string; esperado: Esperado };

/**
 * Cómo se distingue cada grupo, contra su «centro»: la media de sus filas en las unidades del usuario (los centroides
 * escalados viven en el archivo exportado) frente al promedio de todos los grupos. Solo habla de las columnas que más separan
 * los grupos (las que Python midió), y de nada más. Devuelve el texto Y lo que el texto debe decir, calculado por separado.
 */
export function armarTextoGrupos(
  result: ClusterResult,
  locale: Locale,
): TextoGrupos {
  const { groups, separating } = result.profiles;
  const requeridas: { clave: string; valor: number; decimales: number }[] = [];
  const nombres: string[] = [];
  const separan = separating.map((s) => s.column);
  nombres.push(...separan);

  const frase =
    separan.length > 0
      ? tr(locale, "resultados.grupos.separan", { lista: separan.join(", ") })
      : tr(locale, "resultados.grupos.sin_separan");
  const partes: string[] = [frase];

  groups.forEach((g, index) => {
    const rasgos: string[] = [];
    for (const columna of separating) {
      if (columna.kind === "numeric") {
        const valor = g.numeric[columna.column];
        const promedio = promedioPesado(groups, columna.column);
        if (valor === null || valor === undefined || promedio === null)
          continue;
        if (Math.abs(valor) < 1e-4 || Math.abs(promedio) < 1e-4) continue; // se escribirían en notación científica
        const decimales = quantityDecimals(
          groups.flatMap((otro) => {
            const v = otro.numeric[columna.column];
            return v === null || v === undefined ? [] : [v];
          }),
        );
        const aparte = Math.abs(valor - promedio) / Math.abs(promedio);
        if (aparte < APARTE_MINIMO) continue;
        rasgos.push(
          tr(
            locale,
            valor > promedio
              ? "resultados.grupos.mas_alta"
              : "resultados.grupos.mas_baja",
            {
              column: columna.column,
              valor: profileNumber(valor, decimales),
              promedio: profileNumber(promedio, decimales),
            },
          ),
        );
        requeridas.push(
          { clave: `grupo${g.group}:${columna.column}`, valor, decimales },
          { clave: `promedio:${columna.column}`, valor: promedio, decimales },
        );
      } else {
        const moda = g.categorical[columna.column];
        if (!moda) continue;
        rasgos.push(
          tr(locale, "resultados.grupos.moda", {
            column: columna.column,
            moda: moda.mode,
            pct: (moda.share * 100).toFixed(0),
          }),
        );
        nombres.push(moda.mode);
        requeridas.push({
          clave: `grupo${g.group}:${columna.column}:cuota`,
          valor: Number((moda.share * 100).toFixed(0)),
          decimales: 0,
        });
      }
    }
    partes.push(
      tr(locale, "resultados.grupos.grupo", {
        n: index + 1,
        pct: (g.share * 100).toFixed(0),
        filas: thousands(g.size),
        rasgos:
          rasgos.length > 0
            ? rasgos.join("; ")
            : tr(locale, "resultados.grupos.sin_rasgos"),
      }),
    );
    requeridas.push(
      { clave: `grupo${g.group}:numero`, valor: index + 1, decimales: 0 },
      {
        clave: `grupo${g.group}:porcentaje`,
        valor: Number((g.share * 100).toFixed(0)),
        decimales: 0,
      },
      { clave: `grupo${g.group}:filas`, valor: g.size, decimales: 0 },
    );
  });

  return {
    texto: partes.join(" "),
    esperado: {
      requeridas,
      nombres: [
        ...nombres,
        ...Object.keys(groups[0]?.numeric ?? {}),
        ...Object.keys(groups[0]?.categorical ?? {}),
      ],
      // las columnas que separan, en el orden en que Python las midió, tal cual (el orden de unos nombres no basta: reaparecen)
      frases: [{ clave: "separan", texto: frase }],
    },
  };
}

/** El texto mínimo de agrupar: cuántos grupos y de cuántas filas, nada más. */
export function textoMinimoGrupos(
  result: ClusterResult,
  locale: Locale,
): string {
  const { groups } = result.profiles;
  return tr(locale, "resultados.grupos.minima", {
    k: groups.length,
    lista: groups
      .map((g, i) =>
        tr(locale, "resultados.grupos.minima_item", {
          n: i + 1,
          filas: thousands(g.size),
          pct: (g.share * 100).toFixed(0),
        }),
      )
      .join("; "),
  });
}

/** La descripción de los grupos, comprobada contra los perfiles que Python midió. `candidata` permite alterarla en una prueba. */
export function explicarGrupos(entrada: {
  result: ClusterResult;
  locale: Locale;
  candidata?: string;
}): Explicada {
  const armado = armarTextoGrupos(entrada.result, entrada.locale);
  const texto = entrada.candidata ?? armado.texto;
  const fallos = verificarTexto(texto, armado.esperado);
  return fallos.length === 0
    ? { texto, verificada: true, fallos }
    : {
        texto: textoMinimoGrupos(entrada.result, entrada.locale),
        verificada: false,
        fallos,
      };
}

export { escribir };
