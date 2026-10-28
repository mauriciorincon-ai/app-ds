// S21 (ADR 030): lo que «Pregúntale a tus datos» dice con palabras, en el idioma de la pantalla: la consulta («Voy a calcular…») y la
// frase del resultado. Las dos salen de plantillas de los dos idiomas, jamás de un modelo de lenguaje. La frase pasa por
// `verificarTexto` contra cifras que se RECALCULAN por otro camino (ordenando los valores de cada grupo, no acumulándolos en la pasada
// del motor): si el motor y la recuenta no coinciden, o la plantilla dice una cifra que no está, cae a una línea mínima.
import {
  claveDeFila,
  columnaDe,
  type Catalogo,
  type QueryPlan,
  type Resultado,
} from "@/engine/consulta";
import type { Locale } from "@/i18n/config";
import { textoPropio } from "@/i18n/textos-etapa";
import { formatQuantity, quantityDecimals } from "@/lib/quantity";
import { escribir, verificarTexto } from "./cifras";
import { TEXTOS_PREGUNTA } from "./textos-pregunta";

type Parametros = Record<string, string | number>;

export const trPregunta = (
  locale: Locale,
  clave: string,
  params?: Parametros,
): string => textoPropio(TEXTOS_PREGUNTA, locale, clave, params) ?? clave;

const OPERADOR_CLAVE: Record<string, string> = {
  "=": "eq",
  "!=": "ne",
  ">": "gt",
  ">=": "ge",
  "<": "lt",
  "<=": "le",
};

const claveMedida = (plan: QueryPlan): string =>
  plan.medida.agregacion === "conteo"
    ? plan.medida.columna === null
      ? "conteo_filas"
      : "conteo_col"
    : plan.medida.agregacion;

/** «Voy a calcular la suma de «ventas», separada por «región», en el último trimestre de la tabla (del … al …).» */
export function enPalabras(plan: QueryPlan, locale: Locale): string {
  const tr = (clave: string, params?: Parametros) =>
    trPregunta(locale, clave, params);
  const medida = tr(`pregunta.palabras.medida.${claveMedida(plan)}`, {
    columna: plan.medida.columna ?? "",
  });
  const g = plan.agrupar;
  const grupo = g
    ? tr(`pregunta.palabras.agrupar.${g.tipo}`, {
        columna: g.columna,
        periodo: g.tipo === "tiempo" ? tr(`pregunta.periodo.${g.periodo}`) : "",
      })
    : "";
  let ventana = "";
  if (plan.ventana) {
    const d = plan.ventana.descripcion;
    const unidad = String(d.params["unidad"] ?? "mes");
    const n = Number(d.params["n"] ?? 1);
    ventana = tr(`pregunta.palabras.ventana.${d.clave}`, {
      unidad: tr(
        n > 1 ? `pregunta.unidades.${unidad}` : `pregunta.unidad.${unidad}`,
      ),
      n,
      desde: plan.ventana.desde ?? "",
      hasta: plan.ventana.hasta ?? "",
    });
  }
  const filtros = plan.condiciones
    .map((c) =>
      tr(`pregunta.palabras.filtro.${OPERADOR_CLAVE[c.operador] ?? "eq"}`, {
        columna: c.columna,
        valor: c.valor,
      }),
    )
    .join(tr(`pregunta.palabras.union.${plan.union === "o" ? "o" : "y"}`));
  const filtro = filtros ? tr("pregunta.palabras.donde", { filtros }) : "";
  const orden =
    plan.top !== null
      ? tr(`pregunta.palabras.top_${plan.orden === "asc" ? "asc" : "desc"}`, {
          n: plan.top,
        })
      : "";
  return tr("pregunta.palabras.base", {
    medida,
    grupo,
    ventana,
    filtro,
    orden,
  });
}

// --- la cuenta por otro camino -----------------------------------------------------------------------------------------------

export type Recuenta = {
  /** Cada grupo con su cifra recalculada, en el orden en que el motor los dio. */
  readonly valores: readonly number[];
  /** La suma (o el conteo) de TODOS los grupos, antes de cortar por «los N». */
  readonly total: number | null;
  /** ¿Coincide con el motor? */
  readonly coincide: boolean;
};

const cerca = (a: number, b: number): boolean =>
  Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/**
 * Vuelve a hacer la cuenta con otra forma de calcular: junta los valores de cada grupo y los ORDENA antes de resumirlos (la suma en
 * orden ascendente, el mínimo y el máximo en los extremos, la mediana en el medio). Es la comprobación de la frase: no sustituye al
 * gate del SQL, que verifica la selección de filas.
 */
export function recontar(
  plan: QueryPlan,
  cat: Catalogo,
  r: Resultado,
): Recuenta {
  const medida =
    plan.medida.columna === null ? null : columnaDe(cat, plan.medida.columna);
  const numeros = medida && medida.tipo === "numero" ? medida.valores : null;
  const porGrupo = new Map<string, number[]>();
  const cuentas = new Map<string, number>();
  for (const i of r.seleccion.filas) {
    const k = claveDeFila(plan, cat, i);
    cuentas.set(k, (cuentas.get(k) ?? 0) + 1);
    if (numeros) {
      const lista = porGrupo.get(k) ?? [];
      lista.push(numeros[i]!);
      porGrupo.set(k, lista);
    }
  }
  const resumen = (k: string): number => {
    const a = plan.medida.agregacion;
    if (a === "conteo") return cuentas.get(k) ?? 0;
    const v = [...(porGrupo.get(k) ?? [])].sort((x, y) => x - y);
    if (v.length === 0) return Number.NaN;
    if (a === "suma") return v.reduce((x, y) => x + y, 0);
    if (a === "promedio") return v.reduce((x, y) => x + y, 0) / v.length;
    if (a === "minimo") return v[0]!;
    if (a === "maximo") return v[v.length - 1]!;
    return v.length % 2
      ? v[(v.length - 1) / 2]!
      : (v[v.length / 2 - 1]! + v[v.length / 2]!) / 2;
  };
  const valores = r.grupos.map((gr) => resumen(gr.etiqueta));
  let coincide = r.grupos.every(
    (gr, i) =>
      cerca(gr.valor, valores[i]!) &&
      (cuentas.get(gr.etiqueta) ?? -1) === gr.filas,
  );
  // el primero tiene que ser, de verdad, el mayor (o el menor) de todos los grupos
  const todos = [...cuentas.keys()].map(resumen);
  const orden =
    plan.orden ?? (plan.agrupar?.tipo === "categoria" ? "desc" : null);
  if (orden !== null && r.grupos.length > 0 && todos.length > 0) {
    const mejor = orden === "desc" ? Math.max(...todos) : Math.min(...todos);
    coincide = coincide && cerca(r.grupos[0]!.valor, mejor);
  }
  if (plan.top === null && r.grupos.length !== cuentas.size) coincide = false;
  const aditiva =
    plan.medida.agregacion === "suma" || plan.medida.agregacion === "conteo";
  const total = aditiva ? todos.reduce((a, b) => a + b, 0) : null;
  return { valores, total, coincide };
}

// --- la frase -------------------------------------------------------------------------------------------------------------

export type FraseConsulta = {
  readonly texto: string;
  /** Falso si la plantilla no cuadró con la recuenta y se cayó a la línea mínima. */
  readonly verificada: boolean;
};

export function fraseResultado(
  plan: QueryPlan,
  cat: Catalogo,
  r: Resultado,
  locale: Locale,
): FraseConsulta {
  const tr = (clave: string, params?: Parametros) =>
    trPregunta(locale, clave, params);
  const minima: FraseConsulta = {
    texto: tr("pregunta.frase.minimo", {
      n: formatQuantity(r.gruposTotales, 0),
    }),
    verificada: false,
  };
  if (r.grupos.length === 0) return minima;
  const cuenta = recontar(plan, cat, r);
  if (!cuenta.coincide) return minima;

  const valores = cuenta.valores;
  const decimales = quantityDecimals([
    ...valores,
    ...(cuenta.total !== null ? [cuenta.total] : []),
  ]);
  const f = (v: number) => formatQuantity(v, decimales);
  const medida = tr(`pregunta.frase.medida.${claveMedida(plan)}`, {
    columna: plan.medida.columna ?? "",
  });
  const g = plan.agrupar;
  const primero = r.grupos[0]!;
  const ultimo = r.grupos[r.grupos.length - 1]!;
  const requeridas: { clave: string; valor: number; decimales: number }[] = [];
  const nombres: string[] = [medida];
  if (plan.medida.columna) nombres.push(plan.medida.columna);
  const orden: string[] = [];
  const permitidas: string[] = [
    escribir(r.filasUsadas, 0),
    escribir(r.gruposTotales, 0),
    escribir(r.grupos.length, 0),
  ];
  let texto: string;

  if (!g || r.grupos.length === 1) {
    if (!g) {
      texto = tr("pregunta.frase.sin_grupo", {
        medida,
        valor: f(valores[0]!),
        filas: formatQuantity(primero.filas, 0),
      });
      requeridas.push({ clave: "valor", valor: valores[0]!, decimales });
      permitidas.push(escribir(primero.filas, 0));
    } else {
      texto = tr("pregunta.frase.un_grupo", {
        medida,
        primero: primero.etiqueta,
        v1: f(valores[0]!),
        filas: formatQuantity(primero.filas, 0),
      });
      requeridas.push({ clave: "v1", valor: valores[0]!, decimales });
      nombres.push(primero.etiqueta);
      permitidas.push(escribir(primero.filas, 0));
    }
  } else if (g.tipo === "categoria") {
    const total = cuenta.total;
    const todosPositivos = valores.every((v) => v >= 0);
    const pct =
      total !== null && total > 0 && todosPositivos
        ? Math.round((valores[0]! / total) * 100)
        : null;
    texto = tr("pregunta.frase.categoria", {
      grupo: g.columna,
      medida,
      total: total !== null ? f(total) : tr("pregunta.resultado.sin_grupo"),
      primero: primero.etiqueta,
      ultimo: ultimo.etiqueta,
      v1: f(valores[0]!),
      vn: f(valores[valores.length - 1]!),
      pct:
        pct !== null
          ? tr("pregunta.frase.pct", { pct: formatQuantity(pct, 0) })
          : "",
    });
    requeridas.push(
      { clave: "v1", valor: valores[0]!, decimales },
      { clave: "vn", valor: valores[valores.length - 1]!, decimales },
    );
    if (total !== null)
      requeridas.push({ clave: "total", valor: total, decimales });
    if (pct !== null)
      requeridas.push({ clave: "pct", valor: pct, decimales: 0 });
    nombres.push(g.columna, primero.etiqueta, ultimo.etiqueta);
    orden.push(primero.etiqueta, ultimo.etiqueta);
  } else {
    // por periodo: del primero al último en el tiempo, y el mejor
    const cronologico = r.grupos
      .map((gr, i) => ({ gr, v: valores[i]! }))
      .sort((a, b) =>
        a.gr.etiqueta < b.gr.etiqueta
          ? -1
          : a.gr.etiqueta > b.gr.etiqueta
            ? 1
            : 0,
      );
    const inicio = cronologico[0]!;
    const fin = cronologico[cronologico.length - 1]!;
    const mejor = cronologico.reduce((a, b) => (b.v > a.v ? b : a));
    texto = tr("pregunta.frase.tiempo", {
      periodo: tr(`pregunta.unidad.${g.periodo}`),
      medida,
      v0: f(inicio.v),
      b0: inicio.gr.etiqueta,
      vn: f(fin.v),
      bn: fin.gr.etiqueta,
      bmax: mejor.gr.etiqueta,
      vmax: f(mejor.v),
    });
    requeridas.push(
      { clave: "v0", valor: inicio.v, decimales },
      { clave: "vn", valor: fin.v, decimales },
      { clave: "vmax", valor: mejor.v, decimales },
    );
    nombres.push(
      g.columna,
      inicio.gr.etiqueta,
      fin.gr.etiqueta,
      mejor.gr.etiqueta,
      tr(`pregunta.unidad.${g.periodo}`),
    );
    orden.push(inicio.gr.etiqueta, fin.gr.etiqueta);
  }

  // lo que el motor dio tiene que ser lo mismo que la plantilla dice: las cifras requeridas salen de la RECUENTA, y la verificación
  // las busca escritas en el texto y no admite ninguna otra
  const fallos = verificarTexto(texto, {
    requeridas,
    permitidas,
    nombres,
    orden: orden.length >= 2 && orden[0] !== orden[1] ? orden : undefined,
  });
  return fallos.length === 0 ? { texto, verificada: true } : minima;
}
