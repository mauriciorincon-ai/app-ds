// S21 (ADR 030): «Pregúntale a tus datos», la mitad que corre. Puro y sin red, sin worker y sin `Date`. Aquí vive:
//  · el CATÁLOGO: la tabla tal como llegó, leída columna por columna con las mismas reglas del Protocolo (`vistaColumna`: numérica al
//    90 %; `leerFechas`: fechas ISO o latinas, preguntando el orden día/mes si no se puede saber);
//  · el PLAN de una consulta (qué medir, por qué agrupar, qué filtrar, qué ventana, cuántos mostrar) que escribe `pregunta.ts`;
//  · su VALIDACIÓN antes de correr, el RESULTADO (una pasada sobre la tabla) y el SQL que dice lo mismo (el gate de CPython lo corre
//    en `sqlite3` y exige la misma tabla de resultado).
// Una sola semántica en los dos lados: una celda vacía NUNCA entra (ni en la medida, ni en el grupo, ni en la fecha, ni en un filtro,
// tampoco con «≠»); el texto se compara exacto (los extremos ya vienen sin espacios); la ventana se resuelve contra la fecha más
// reciente de la tabla, nunca contra el reloj.
import { diaDeSemana, diasDe, isoDe } from "@/engine/serie";
import {
  evaluarRegla,
  problemaDeCondicion,
  VALORES_ELEGIBLES_MAX,
  type Condicion,
} from "@/engine/protocolo/regla";
import {
  fechasPorFila,
  leerFechas,
  type OrdenFecha,
} from "@/engine/protocolo/fechas";
import { vistaColumna, type VistaColumna } from "@/engine/protocolo/tabla";
import { identificadorSql, literalSql, numeroSql } from "@/engine/reglas";
import type { CsvTable } from "@/lib/ds/csv";
import { buildCsv } from "@/lib/scored-csv";
import type { Agregacion, PeriodoConsulta } from "./pregunta-lexico";

export type { Agregacion, PeriodoConsulta } from "./pregunta-lexico";

/** Cuántos grupos admite un resultado: con más, la pantalla pide acotar o un «los N». */
export const GRUPOS_MAX = 500;
/** Cuántos valores distintos de una columna de texto se indexan para reconocerlos en la pregunta. */
export const VALORES_INDICE_MAX = 200;
/** Cuántos «mayores» o «menores» se pueden pedir. */
export const TOP_LIMITE = 50;

// --- el catálogo ------------------------------------------------------------------------------------------------------------

export type ColumnaCat =
  | {
      readonly tipo: "numero";
      readonly nombre: string;
      readonly valores: readonly (number | null)[];
      readonly basura: number;
      readonly personal: boolean;
    }
  | {
      readonly tipo: "categoria";
      readonly nombre: string;
      readonly valores: readonly (string | null)[];
      /** Los valores distintos, del más frecuente al menos (empates en orden alfabético); vacío si son demasiados o la columna es personal. */
      readonly distintos: readonly string[];
      readonly nDistintos: number;
      readonly personal: boolean;
    }
  | {
      readonly tipo: "fecha";
      readonly nombre: string;
      /** `AAAA-MM-DD` por fila (`null` si la celda está vacía o no se lee); `null` entera mientras el orden día/mes sea ambiguo. */
      readonly fechas: readonly (string | null)[] | null;
      readonly ambigua: boolean;
      readonly minimo: string | null;
      readonly maximo: string | null;
      readonly sinLeer: number;
      readonly personal: boolean;
    };

export type Catalogo = {
  readonly columnas: readonly ColumnaCat[];
  readonly filas: number;
};

export type OpcionesCatalogo = {
  /** Los nombres que el aviso de datos personales marcó: no se ofrecen para agrupar ni se reconocen sus valores. */
  readonly personales?: readonly string[];
  /** La respuesta del usuario sobre el orden de una columna de fechas ambigua (05/06/2026). */
  readonly ordenes?: Readonly<Record<string, Exclude<OrdenFecha, "iso">>>;
};

const FECHA_LEIDAS_MIN = 0.8;

function ordenarDistintos(valores: readonly (string | null)[]): {
  lista: string[];
  total: number;
} {
  const cuenta = new Map<string, number>();
  for (const v of valores)
    if (v !== null) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  const lista = [...cuenta.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([v]) => v);
  return { lista, total: lista.length };
}

/** La tabla CRUDA (la de `getRawTable`: el saneamiento quitaría duplicados y columnas id y cambiaría sumas y conteos), por columna. */
export function armarCatalogo(
  tabla: CsvTable,
  opciones: OpcionesCatalogo = {},
): Catalogo {
  const personales = new Set(opciones.personales ?? []);
  const columnas = tabla.headers.map((nombre, j): ColumnaCat => {
    const crudos = tabla.rows.map((fila) => fila[j] ?? "");
    const personal = personales.has(nombre);
    const vista = vistaColumna(nombre, crudos);
    if (vista.tipo === "numero")
      return {
        tipo: "numero",
        nombre,
        valores: vista.valores,
        basura: vista.basura,
        personal,
      };
    const orden = opciones.ordenes?.[nombre] ?? null;
    const lectura = leerFechas(crudos, orden);
    if (
      (lectura.tipo === "leida" || lectura.tipo === "ambigua") &&
      lectura.leidas >= 2 &&
      lectura.leidas / (lectura.leidas + lectura.sinLeer) >= FECHA_LEIDAS_MIN
    ) {
      if (lectura.tipo === "ambigua")
        return {
          tipo: "fecha",
          nombre,
          fechas: null,
          ambigua: true,
          minimo: null,
          maximo: null,
          sinLeer: lectura.sinLeer,
          personal,
        };
      const porFila = fechasPorFila(crudos, orden);
      return {
        tipo: "fecha",
        nombre,
        fechas: porFila?.fechas ?? null,
        ambigua: false,
        minimo: lectura.minimo,
        maximo: lectura.maximo,
        sinLeer: lectura.sinLeer,
        personal,
      };
    }
    const { lista, total } = ordenarDistintos(vista.valores);
    return {
      tipo: "categoria",
      nombre,
      valores: vista.valores,
      distintos: personal || total > VALORES_INDICE_MAX ? [] : lista,
      nDistintos: total,
      personal,
    };
  });
  return { columnas, filas: tabla.rows.length };
}

export const columnaDe = (
  cat: Catalogo,
  nombre: string,
): ColumnaCat | undefined => cat.columnas.find((c) => c.nombre === nombre);

/** La vista que el Protocolo entiende de una columna del catálogo (para reutilizar `evaluarRegla`). */
function vistaDe(c: ColumnaCat): VistaColumna {
  if (c.tipo === "numero")
    return { tipo: "numero", valores: c.valores, basura: c.basura };
  if (c.tipo === "categoria")
    return { tipo: "texto", valores: c.valores, fecha: false };
  return {
    tipo: "texto",
    valores: (c.fechas ?? []).map((f) => f),
    fecha: true,
  };
}

// --- el plan ----------------------------------------------------------------------------------------------------------------

export type Medida = {
  readonly agregacion: Agregacion;
  /** `null`: contar filas. */
  readonly columna: string | null;
};

export type Agrupar =
  | { readonly tipo: "categoria"; readonly columna: string }
  | {
      readonly tipo: "tiempo";
      readonly columna: string;
      readonly periodo: PeriodoConsulta;
    };

export type DescripcionVentana = {
  readonly clave:
    | "ultimo"
    | "pasado"
    | "ultimos"
    | "anio"
    | "mes"
    | "desde"
    | "hasta"
    | "rango";
  readonly params: Readonly<Record<string, string | number>>;
};

export type VentanaConsulta = {
  readonly columna: string;
  /** Inclusivos, `AAAA-MM-DD`; `null` = abierto. */
  readonly desde: string | null;
  readonly hasta: string | null;
  readonly descripcion: DescripcionVentana;
};

export type QueryPlan = {
  readonly medida: Medida;
  readonly agrupar: Agrupar | null;
  readonly condiciones: readonly Condicion[];
  readonly union: "" | "y" | "o";
  readonly ventana: VentanaConsulta | null;
  readonly orden: "desc" | "asc" | null;
  readonly top: number | null;
};

// --- el calendario de las ventanas ------------------------------------------------------------------------------------------

const dos = (n: number): string => String(n).padStart(2, "0");
const mesTotal = (anio: number, mes: number): number => anio * 12 + (mes - 1);
const primerDiaDeMesTotal = (total: number): string =>
  `${Math.floor(total / 12)}-${dos((total % 12) + 1)}-01`;
const ultimoDiaDeMesTotal = (total: number): string =>
  isoDe(diasDe(primerDiaDeMesTotal(total + 1)) - 1);

/** El primer y el último día del periodo que contiene `iso`, `desfase` periodos antes (0 = el que lo contiene). */
export function rangoDelPeriodo(
  iso: string,
  unidad: PeriodoConsulta,
  desfase = 0,
): { desde: string; hasta: string } {
  const [anio, mes] = iso.split("-").map(Number) as [number, number];
  if (unidad === "dia") {
    const d = isoDe(diasDe(iso) - desfase);
    return { desde: d, hasta: d };
  }
  if (unidad === "semana") {
    const lunes = diasDe(iso) - diaDeSemana(diasDe(iso)) - 7 * desfase;
    return { desde: isoDe(lunes), hasta: isoDe(lunes + 6) };
  }
  if (unidad === "mes") {
    const t = mesTotal(anio, mes) - desfase;
    return { desde: primerDiaDeMesTotal(t), hasta: ultimoDiaDeMesTotal(t) };
  }
  if (unidad === "trimestre") {
    const inicio = Math.floor(mesTotal(anio, mes) / 3) * 3 - 3 * desfase;
    return {
      desde: primerDiaDeMesTotal(inicio),
      hasta: ultimoDiaDeMesTotal(inicio + 2),
    };
  }
  const y = anio - desfase;
  return { desde: `${y}-01-01`, hasta: `${y}-12-31` };
}

/** Los últimos `n` periodos que terminan en el que contiene `iso`. */
export function rangoUltimos(
  iso: string,
  unidad: PeriodoConsulta,
  n: number,
): { desde: string; hasta: string } {
  return {
    desde: rangoDelPeriodo(iso, unidad, n - 1).desde,
    hasta: rangoDelPeriodo(iso, unidad, 0).hasta,
  };
}

export const rangoDeMes = (
  anio: number,
  mes: number,
): { desde: string; hasta: string } => ({
  desde: primerDiaDeMesTotal(mesTotal(anio, mes)),
  hasta: ultimoDiaDeMesTotal(mesTotal(anio, mes)),
});

/** El nombre del periodo al que pertenece una fecha: el día, el lunes de la semana, `AAAA-MM`, `AAAA-Q3` o `AAAA`. Sin idioma. */
export function cubetaDe(iso: string, periodo: PeriodoConsulta): string {
  if (periodo === "dia") return iso;
  if (periodo === "semana") {
    const d = diasDe(iso);
    return isoDe(d - diaDeSemana(d));
  }
  if (periodo === "mes") return iso.slice(0, 7);
  if (periodo === "trimestre")
    return `${iso.slice(0, 4)}-Q${Math.floor((Number(iso.slice(5, 7)) + 2) / 3)}`;
  return iso.slice(0, 4);
}

// --- la selección de filas --------------------------------------------------------------------------------------------------

export type Seleccion = {
  /** Las posiciones de las filas que entran a la consulta. */
  readonly filas: readonly number[];
  /** Filas que cumplían lo anterior y salen por no tener fecha legible (solo si hay ventana o se agrupa por tiempo). */
  readonly sinFecha: number;
  /** ... por no tener valor en la columna del grupo. */
  readonly sinGrupo: number;
  /** ... por no tener valor en la medida. */
  readonly sinValor: number;
  /** Las que quedaron fuera por la ventana. */
  readonly fueraDeVentana: number;
  /** Las que quedaron fuera por los filtros. */
  readonly fueraDeFiltros: number;
  /** El plan está mal escrito (una columna que no existe, un operador que no cabe). */
  readonly invalida: boolean;
};

function columnaFecha(
  plan: QueryPlan,
  cat: Catalogo,
): Extract<ColumnaCat, { tipo: "fecha" }> | null {
  const nombre =
    plan.ventana?.columna ??
    (plan.agrupar?.tipo === "tiempo" ? plan.agrupar.columna : null);
  if (nombre === null) return null;
  const c = columnaDe(cat, nombre);
  return c && c.tipo === "fecha" ? c : null;
}

/** Qué filas entran, en el orden: ventana → filtros → grupo → medida. Cada exclusión se cuenta, ninguna es silenciosa. */
export function seleccionar(plan: QueryPlan, cat: Catalogo): Seleccion {
  const vacia = {
    filas: [],
    sinFecha: 0,
    sinGrupo: 0,
    sinValor: 0,
    fueraDeVentana: 0,
    fueraDeFiltros: 0,
    invalida: true,
  } as const;
  let candidatas: number[] = Array.from({ length: cat.filas }, (_, i) => i);
  let sinFecha = 0;
  let fueraDeVentana = 0;
  let fueraDeFiltros = 0;
  let sinGrupo = 0;
  let sinValor = 0;

  const colFecha = columnaFecha(plan, cat);
  if (plan.ventana || plan.agrupar?.tipo === "tiempo") {
    if (!colFecha || !colFecha.fechas) return vacia;
    const fechas = colFecha.fechas;
    const v = plan.ventana;
    const dentro: number[] = [];
    for (const i of candidatas) {
      const f = fechas[i] ?? null;
      if (f === null) sinFecha += 1;
      else if (
        v &&
        ((v.desde !== null && f < v.desde) || (v.hasta !== null && f > v.hasta))
      )
        fueraDeVentana += 1;
      else dentro.push(i);
    }
    candidatas = dentro;
  }

  if (plan.condiciones.length > 0) {
    const vistas: VistaColumna[] = [];
    for (const c of plan.condiciones) {
      const col = columnaDe(cat, c.columna);
      if (!col) return vacia;
      const vista = vistaDe(col);
      if (problemaDeCondicion(vista.tipo, c.operador, c.valor) !== null)
        return vacia;
      vistas.push(vista);
    }
    const medida = evaluarRegla(
      vistas,
      plan.condiciones,
      plan.union,
      candidatas,
    );
    if (!medida) return vacia;
    const quedan = candidatas.filter((_, k) => medida.cumple[k]);
    fueraDeFiltros = candidatas.length - quedan.length;
    candidatas = quedan;
  }

  if (plan.agrupar?.tipo === "categoria") {
    const g = columnaDe(cat, plan.agrupar.columna);
    if (!g || g.tipo !== "categoria") return vacia;
    const quedan = candidatas.filter((i) => g.valores[i] !== null);
    sinGrupo = candidatas.length - quedan.length;
    candidatas = quedan;
  }

  if (plan.medida.columna !== null) {
    const m = columnaDe(cat, plan.medida.columna);
    if (!m) return vacia;
    const quedan = candidatas.filter((i) =>
      m.tipo === "fecha"
        ? (m.fechas?.[i] ?? null) !== null
        : m.valores[i] !== null,
    );
    sinValor = candidatas.length - quedan.length;
    candidatas = quedan;
  }

  return {
    filas: candidatas,
    sinFecha,
    sinGrupo,
    sinValor,
    fueraDeVentana,
    fueraDeFiltros,
    invalida: false,
  };
}

// --- la validación ----------------------------------------------------------------------------------------------------------

export type NivelValidacion = "ok" | "aviso" | "error";
export type Validacion = {
  readonly clave: string;
  readonly nivel: NivelValidacion;
  readonly params: Readonly<Record<string, string | number>>;
};

const NECESITA_NUMEROS: ReadonlySet<Agregacion> = new Set([
  "suma",
  "promedio",
  "minimo",
  "maximo",
  "mediana",
]);

/** Todo lo que se comprueba antes de correr, con su nivel. La consulta corre solo si ninguno es un error. */
export function validar(plan: QueryPlan, cat: Catalogo): Validacion[] {
  const salida: Validacion[] = [];
  const v = (
    clave: string,
    nivel: NivelValidacion,
    params: Validacion["params"] = {},
  ) => salida.push({ clave, nivel, params });

  // la medida
  const m = plan.medida;
  if (m.columna !== null) {
    const col = columnaDe(cat, m.columna);
    if (!col) v("medida_no_existe", "error", { columna: m.columna });
    else if (NECESITA_NUMEROS.has(m.agregacion) && col.tipo !== "numero")
      v("medida_no_numerica", "error", {
        columna: m.columna,
        agregacion: m.agregacion,
      });
    else v("medida_ok", "ok", { columna: m.columna, agregacion: m.agregacion });
  } else if (NECESITA_NUMEROS.has(m.agregacion))
    v("medida_sin_columna", "error", { agregacion: m.agregacion });
  else v("medida_filas", "ok");

  // el grupo
  const g = plan.agrupar;
  if (g) {
    const col = columnaDe(cat, g.columna);
    if (!col) v("grupo_no_existe", "error", { columna: g.columna });
    else if (col.personal) v("grupo_personal", "error", { columna: g.columna });
    else if (g.tipo === "categoria" && col.tipo === "numero")
      v("grupo_numerica", "error", { columna: g.columna });
    else if (g.tipo === "categoria" && col.tipo === "fecha")
      v("grupo_fecha", "error", { columna: g.columna });
    else if (g.tipo === "tiempo" && col.tipo !== "fecha")
      v("grupo_no_es_fecha", "error", { columna: g.columna });
    else if (g.tipo === "tiempo" && col.tipo === "fecha" && col.ambigua)
      v("fecha_ambigua", "error", { columna: g.columna });
    else if (
      g.tipo === "categoria" &&
      col.tipo === "categoria" &&
      col.nDistintos > GRUPOS_MAX &&
      plan.top === null
    )
      v("grupo_muchos", "error", {
        columna: g.columna,
        n: col.nDistintos,
        max: GRUPOS_MAX,
      });
    else v("grupo_ok", "ok", { columna: g.columna });
  }

  // los filtros
  for (const c of plan.condiciones) {
    const col = columnaDe(cat, c.columna);
    if (!col) {
      v("filtro_columna_no_existe", "error", { columna: c.columna });
      continue;
    }
    const vista = vistaDe(col);
    if (problemaDeCondicion(vista.tipo, c.operador, c.valor) !== null) {
      v("filtro_mal", "error", {
        columna: c.columna,
        operador: c.operador,
        valor: c.valor,
      });
      continue;
    }
    if (
      col.tipo === "categoria" &&
      col.nDistintos <= VALORES_ELEGIBLES_MAX * 4 &&
      !col.distintos.includes(c.valor)
    )
      v("filtro_valor_no_existe", "error", {
        columna: c.columna,
        valor: c.valor,
      });
    else
      v("filtro_ok", "ok", {
        columna: c.columna,
        operador: c.operador,
        valor: c.valor,
      });
  }

  // la ventana
  if (plan.ventana) {
    const f = columnaDe(cat, plan.ventana.columna);
    if (!f || f.tipo !== "fecha")
      v("ventana_sin_fecha", "error", { columna: plan.ventana.columna });
    else if (f.ambigua) v("fecha_ambigua", "error", { columna: f.nombre });
    else if (
      f.maximo !== null &&
      plan.ventana.hasta !== null &&
      plan.ventana.hasta > f.maximo &&
      plan.ventana.desde !== null &&
      plan.ventana.desde <= f.maximo
    )
      v("ventana_incompleta", "aviso", { hasta: f.maximo });
    else
      v(
        "ventana_ok",
        "ok",
        plan.ventana.desde && plan.ventana.hasta
          ? { desde: plan.ventana.desde, hasta: plan.ventana.hasta }
          : {},
      );
  }

  // las filas
  if (!salida.some((x) => x.nivel === "error")) {
    const s = seleccionar(plan, cat);
    if (s.invalida) v("plan_invalido", "error");
    else {
      if (s.filas.length === 0)
        v(
          plan.ventana && s.fueraDeVentana > 0
            ? "ventana_sin_filas"
            : "sin_filas",
          "error",
        );
      else v("filas_ok", "ok", { n: s.filas.length, total: cat.filas });
      if (s.sinFecha > 0) v("filas_sin_fecha", "aviso", { n: s.sinFecha });
      if (s.sinGrupo > 0) v("filas_sin_grupo", "aviso", { n: s.sinGrupo });
      if (s.sinValor > 0) v("filas_sin_valor", "aviso", { n: s.sinValor });
      if (plan.agrupar?.tipo === "categoria" && plan.top === null) {
        const grupos = new Set(
          s.filas.map(
            (i) =>
              (
                columnaDe(cat, plan.agrupar!.columna) as Extract<
                  ColumnaCat,
                  { tipo: "categoria" }
                >
              ).valores[i],
          ),
        );
        if (grupos.size > GRUPOS_MAX)
          v("grupo_muchos", "error", {
            columna: plan.agrupar.columna,
            n: grupos.size,
            max: GRUPOS_MAX,
          });
      }
    }
  }
  return salida;
}

export const sePuedeCorrer = (validaciones: readonly Validacion[]): boolean =>
  !validaciones.some((x) => x.nivel === "error");

// --- el resultado -----------------------------------------------------------------------------------------------------------

export type FilaResultado = {
  /** El grupo: la categoría, o el periodo (`2025-Q4`); `""` cuando no se agrupa. */
  readonly etiqueta: string;
  readonly valor: number;
  /** Cuántas filas de la tabla entraron a este grupo. */
  readonly filas: number;
};

export type Resultado = {
  readonly grupos: readonly FilaResultado[];
  /** Cuántos grupos había antes de cortar por «los N». */
  readonly gruposTotales: number;
  readonly filasUsadas: number;
  readonly seleccion: Seleccion;
};

export function mediana(valores: readonly number[]): number {
  const v = [...valores].sort((a, b) => a - b);
  const n = v.length;
  return n % 2 ? v[(n - 1) / 2]! : (v[n / 2 - 1]! + v[n / 2]!) / 2;
}

function agregar(
  agregacion: Agregacion,
  valores: readonly number[],
  filas: number,
): number {
  if (agregacion === "conteo") return filas;
  if (agregacion === "suma") return valores.reduce((a, b) => a + b, 0);
  if (agregacion === "promedio")
    return valores.reduce((a, b) => a + b, 0) / valores.length;
  if (agregacion === "minimo") return valores.reduce((a, b) => (b < a ? b : a));
  if (agregacion === "maximo") return valores.reduce((a, b) => (b > a ? b : a));
  return mediana(valores);
}

/** El grupo al que pertenece una fila del plan: la categoría, el periodo (`2025-Q4`) o `""` si no se agrupa. Solo para filas ya seleccionadas. */
export function claveDeFila(plan: QueryPlan, cat: Catalogo, i: number): string {
  const g = plan.agrupar;
  const col = g ? columnaDe(cat, g.columna) : undefined;
  if (!g || !col) return "";
  if (g.tipo === "categoria") return (col as Extract<ColumnaCat, { tipo: "categoria" }>).valores[i]!;
  return cubetaDe((col as Extract<ColumnaCat, { tipo: "fecha" }>).fechas![i]!, g.periodo);
}

/** Corre la consulta sobre la tabla en una pasada. Quien llama valida antes: con un plan inválido devuelve cero grupos. */
export function correr(plan: QueryPlan, cat: Catalogo): Resultado {
  const sel = seleccionar(plan, cat);
  if (sel.invalida || sel.filas.length === 0)
    return { grupos: [], gruposTotales: 0, filasUsadas: 0, seleccion: sel };
  const medida =
    plan.medida.columna === null ? null : columnaDe(cat, plan.medida.columna);
  const numeros = medida && medida.tipo === "numero" ? medida.valores : null;
  const g = plan.agrupar;

  const porGrupo = new Map<string, { valores: number[]; filas: number }>();
  for (const i of sel.filas) {
    const k = claveDeFila(plan, cat, i);
    let acc = porGrupo.get(k);
    if (!acc) porGrupo.set(k, (acc = { valores: [], filas: 0 }));
    acc.filas += 1;
    if (numeros) acc.valores.push(numeros[i]!);
  }
  let grupos: FilaResultado[] = [...porGrupo.entries()].map(
    ([etiqueta, acc]) => ({
      etiqueta,
      valor: agregar(plan.medida.agregacion, acc.valores, acc.filas),
      filas: acc.filas,
    }),
  );
  const gruposTotales = grupos.length;
  const orden = plan.orden ?? (g?.tipo === "categoria" ? "desc" : null);
  grupos.sort((a, b) => {
    if (orden !== null && a.valor !== b.valor)
      return orden === "desc" ? b.valor - a.valor : a.valor - b.valor;
    return a.etiqueta < b.etiqueta ? -1 : a.etiqueta > b.etiqueta ? 1 : 0;
  });
  if (plan.top !== null) grupos = grupos.slice(0, plan.top);
  return {
    grupos,
    gruposTotales,
    filasUsadas: sel.filas.length,
    seleccion: sel,
  };
}

// --- el SQL -----------------------------------------------------------------------------------------------------------------

export const TABLA_SQL = "tu_tabla";

function cubetaSql(columna: string, periodo: PeriodoConsulta): string {
  const c = identificadorSql(columna);
  if (periodo === "dia") return c;
  if (periodo === "semana")
    return `date(${c}, '-' || ((CAST(strftime('%w', ${c}) AS INTEGER) + 6) % 7) || ' days')`;
  if (periodo === "mes") return `substr(${c}, 1, 7)`;
  if (periodo === "trimestre")
    return `substr(${c}, 1, 4) || '-Q' || ((CAST(substr(${c}, 6, 2) AS INTEGER) + 2) / 3)`;
  return `substr(${c}, 1, 4)`;
}

function condicionSql(c: Condicion, tipo: "numero" | "texto"): string {
  const col = identificadorSql(c.columna);
  const valor =
    tipo === "numero" ? numeroSql(Number(c.valor)) : literalSql(c.valor);
  return `${col} ${c.operador} ${valor}`;
}

/** El nombre con que sale la medida en el SQL y en el CSV: `suma_ventas`, `filas`. */
export function nombreDeMedida(m: Medida): string {
  if (m.columna === null) return "filas";
  return `${m.agregacion}_${m.columna}`;
}

/**
 * La consulta en SQL (SQLite). Dice lo mismo que `correr`: las filas sin fecha, sin grupo o sin valor en la medida se quitan con un
 * `IS NOT NULL` explícito; el texto de las fechas es `AAAA-MM-DD`. La mediana usa funciones de ventana.
 */
export function sqlDe(
  plan: QueryPlan,
  cat: Catalogo,
  tabla: string = TABLA_SQL,
): string {
  const T = identificadorSql(tabla);
  const donde: string[] = [];
  const colFecha = columnaFecha(plan, cat);
  if (plan.ventana && colFecha) {
    const f = identificadorSql(colFecha.nombre);
    if (plan.ventana.desde !== null)
      donde.push(`${f} >= ${literalSql(plan.ventana.desde)}`);
    if (plan.ventana.hasta !== null)
      donde.push(`${f} <= ${literalSql(plan.ventana.hasta)}`);
    if (plan.ventana.desde === null && plan.ventana.hasta === null)
      donde.push(`${f} IS NOT NULL`);
  } else if (plan.agrupar?.tipo === "tiempo")
    donde.push(`${identificadorSql(plan.agrupar.columna)} IS NOT NULL`);
  if (plan.condiciones.length > 0) {
    const partes = plan.condiciones.map((c) => {
      const col = columnaDe(cat, c.columna);
      return condicionSql(c, col && col.tipo === "numero" ? "numero" : "texto");
    });
    donde.push(
      partes.length > 1
        ? `(${partes.join(plan.union === "o" ? " OR " : " AND ")})`
        : partes[0]!,
    );
  }
  if (plan.agrupar?.tipo === "categoria")
    donde.push(`${identificadorSql(plan.agrupar.columna)} IS NOT NULL`);
  if (plan.medida.columna !== null)
    donde.push(`${identificadorSql(plan.medida.columna)} IS NOT NULL`);
  const whereSql = donde.length > 0 ? `\nWHERE ${donde.join("\n  AND ")}` : "";

  const g = plan.agrupar;
  const grupoSql = g
    ? g.tipo === "tiempo"
      ? cubetaSql(g.columna, g.periodo)
      : identificadorSql(g.columna)
    : null;
  const aliasGrupo = g ? identificadorSql(g.columna) : "";
  const aliasMedida = identificadorSql(nombreDeMedida(plan.medida));
  const m = plan.medida;

  const orden = plan.orden ?? (g?.tipo === "categoria" ? "desc" : null);
  const ordenSql = g
    ? orden !== null
      ? `\nORDER BY 2 ${orden === "desc" ? "DESC" : "ASC"}, 1 ASC`
      : "\nORDER BY 1 ASC"
    : "";
  const limite = plan.top !== null ? `\nLIMIT ${plan.top}` : "";

  if (m.agregacion === "mediana") {
    const v = identificadorSql(m.columna ?? "");
    const particion = g ? "PARTITION BY g " : "";
    return [
      "WITH base AS (",
      `  SELECT ${g ? `${grupoSql} AS g, ` : ""}${v} AS v`,
      `  FROM ${T}${whereSql.replaceAll("\n", "\n  ")}`,
      "), ord AS (",
      `  SELECT ${g ? "g, " : ""}v, ROW_NUMBER() OVER (${particion}ORDER BY v) AS r, COUNT(*) OVER (${particion.trim()}) AS c`,
      "  FROM base",
      ")",
      `SELECT ${g ? `g AS ${aliasGrupo}, ` : ""}AVG(v) AS ${aliasMedida}, MAX(c) AS "n"`,
      "FROM ord",
      "WHERE r IN ((c + 1) / 2, (c + 2) / 2)" +
        (g ? "\nGROUP BY 1" : "") +
        ordenSql +
        limite +
        ";",
    ].join("\n");
  }
  const aggSql =
    m.agregacion === "conteo"
      ? m.columna === null
        ? "COUNT(*)"
        : `COUNT(${identificadorSql(m.columna)})`
      : `${{ suma: "SUM", promedio: "AVG", minimo: "MIN", maximo: "MAX" }[m.agregacion]}(${identificadorSql(m.columna ?? "")})`;
  return [
    `SELECT ${g ? `${grupoSql} AS ${aliasGrupo}, ` : ""}${aggSql} AS ${aliasMedida}, COUNT(*) AS "n"`,
    `FROM ${T}${whereSql}` +
      (g ? "\nGROUP BY 1" : "") +
      ordenSql +
      limite +
      ";",
  ].join("\n");
}

// --- la descarga ------------------------------------------------------------------------------------------------------------

export type EtiquetasCsvConsulta = {
  readonly grupo: string;
  readonly valor: string;
  readonly filas: string;
};

const cifra = (v: number): string => String(Number(v.toPrecision(10)));

/** El resultado como CSV (con la protección contra fórmulas de toda descarga de la app). */
export function csvDeResultado(
  plan: QueryPlan,
  r: Resultado,
  e: EtiquetasCsvConsulta,
): string {
  const cabecera = plan.agrupar
    ? [plan.agrupar.columna, e.valor, e.filas]
    : [e.valor, e.filas];
  const filas = r.grupos.map((f) =>
    plan.agrupar
      ? [f.etiqueta, cifra(f.valor), String(f.filas)]
      : [cifra(f.valor), String(f.filas)],
  );
  return buildCsv(cabecera, filas);
}
