// Protocolo DS (S10), etapa 5 — LA REGLA DE HOY. Lo que la gente del usuario hace hoy, escrito como
// hasta dos condiciones «columna · operador · valor» unidas por «y» u «o», y medido en sus datos.
// Puro y sobre la vista que el Protocolo ya tiene de cada columna (`vistaColumna`).
//
// Reglas de lectura, todas declaradas en el manual:
//  · una celda vacía (o que no se lee como número en una columna numérica) NUNCA cumple una
//    condición, tampoco «≠» ni «no es»: la app no adivina qué haría la gente con un dato ausente;
//  · el texto se compara exacto (mayúsculas y espacios internos cuentan; los de los extremos no);
//  · los números se escriben con punto decimal, sin separador de miles: «1,5» es ambiguo y se rechaza.
import type { VistaColumna } from "./tabla";

export const OPERADORES_NUMERO = ["<", "<=", ">", ">=", "=", "!="] as const;
export const OPERADORES_TEXTO = ["=", "!="] as const;
export type Operador = (typeof OPERADORES_NUMERO)[number];
export const UNIONES = ["y", "o"] as const;
export type Union = (typeof UNIONES)[number];
/** Cuántas condiciones admite la regla de hoy (G-Plan 2a). */
export const CONDICIONES_MAX = 2;
/** Largo máximo del valor de texto de una condición. */
export const VALOR_MAX = 100;
/** Desde cuántos valores distintos una columna de texto pide escribir el valor en vez de elegirlo. */
export const VALORES_ELEGIBLES_MAX = 50;

export type TipoColumna = VistaColumna["tipo"];

export type Condicion = {
  readonly columna: string;
  readonly operador: string;
  readonly valor: string;
};

/** Los operadores que admite una columna según cómo la lee el Protocolo. */
export function operadoresDe(tipo: TipoColumna): readonly string[] {
  return tipo === "numero" ? OPERADORES_NUMERO : OPERADORES_TEXTO;
}

/** ¿Es `texto` la forma única de escribir ese número? (`"1500.5"`, no `"1500.50"` ni `"+5"`). */
export function esNumeroCanonico(texto: string): boolean {
  if (texto.trim() === "" || texto !== texto.trim()) return false;
  const n = Number(texto);
  return Number.isFinite(n) && String(n) === texto;
}

/**
 * Lo que el usuario escribió como número, en su forma canónica; `null` si no es un número que la
 * app entienda (con coma, con miles, hexadecimal, vacío). `"1500.50"` → `"1500.5"`.
 */
export function numeroCanonico(entrada: string): string | null {
  const limpio = entrada.trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? String(n) : null;
}

export type ProblemaCondicion = "operador" | "valor";

/** ¿Está bien escrita esta condición para una columna de ese tipo? `null` si sí. */
export function problemaDeCondicion(
  tipo: TipoColumna,
  operador: string,
  valor: string,
): ProblemaCondicion | null {
  if (!operadoresDe(tipo).includes(operador)) return "operador";
  if (tipo === "numero") return esNumeroCanonico(valor) ? null : "valor";
  return valor !== "" && valor === valor.trim() && valor.length <= VALOR_MAX
    ? null
    : "valor";
}

function comparar(a: number, operador: string, b: number): boolean {
  switch (operador) {
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    case "=":
      return a === b;
    default:
      return a !== b;
  }
}

/** El valor de la condición en esa fila: verdadero, falso, o `null` si la celda no tiene valor. */
function evaluarCondicion(
  vista: VistaColumna,
  operador: string,
  valor: string,
  fila: number,
): boolean | null {
  if (vista.tipo === "numero") {
    const celda = vista.valores[fila];
    if (celda === null || celda === undefined) return null;
    return comparar(celda, operador, Number(valor));
  }
  const celda = vista.valores[fila];
  if (celda === null || celda === undefined) return null;
  return operador === "=" ? celda === valor : celda !== valor;
}

export type MedicionRegla = {
  /** Por cada fila medida (en el orden de `filas`): ¿se cumple la regla? */
  readonly cumple: readonly boolean[];
  readonly nCumple: number;
  /** Filas medidas donde alguna de las columnas de la regla no tiene valor. */
  readonly vacios: number;
};

/**
 * Evalúa la regla en las filas dadas. `vistas[i]` es la vista de la columna de la condición `i`.
 * Devuelve `null` si la regla está mal escrita (sin condiciones, de más, una unión que no
 * corresponde, un operador o un valor que no caben en el tipo de la columna).
 */
export function evaluarRegla(
  vistas: readonly VistaColumna[],
  condiciones: readonly Condicion[],
  union: string,
  filas: readonly number[],
): MedicionRegla | null {
  const n = condiciones.length;
  if (n < 1 || n > CONDICIONES_MAX || vistas.length !== n) return null;
  if (n === 1 ? union !== "" : !UNIONES.some((u) => u === union)) return null;
  for (let i = 0; i < n; i++) {
    const c = condiciones[i]!;
    if (problemaDeCondicion(vistas[i]!.tipo, c.operador, c.valor) !== null)
      return null;
  }
  const cumple: boolean[] = [];
  let nCumple = 0;
  let vacios = 0;
  for (const fila of filas) {
    const valores = condiciones.map((c, i) =>
      evaluarCondicion(vistas[i]!, c.operador, c.valor, fila),
    );
    if (valores.some((v) => v === null)) vacios += 1;
    const ciertas = valores.map((v) => v === true);
    const ok =
      n === 1 || union === "y" ? ciertas.every(Boolean) : ciertas.some(Boolean);
    cumple.push(ok);
    if (ok) nCumple += 1;
  }
  return { cumple, nCumple, vacios };
}
