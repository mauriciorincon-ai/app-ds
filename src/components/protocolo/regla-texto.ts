// Protocolo DS (S10): cómo se lee en pantalla una regla de hoy. Los operadores se guardan como
// símbolos ASCII (`<=`, `!=`) y se dicen con palabras en el idioma de la interfaz; en una columna
// de texto «=» es «es» y «!=» es «no es».
import type { Condicion } from "@/engine/protocolo/regla";

type Traduce = (
  clave: string,
  params?: Record<string, string | number>,
) => string;

const ID_OPERADOR: Readonly<Record<string, string>> = {
  "<": "lt",
  "<=": "le",
  ">": "gt",
  ">=": "ge",
  "=": "eq",
  "!=": "ne",
};

/** El operador dicho con palabras, según el tipo de la columna (`numero` o `texto`). */
export function operadorTexto(
  t: Traduce,
  operador: string,
  tipo: string,
): string {
  const id = ID_OPERADOR[operador];
  if (id === undefined) return operador;
  return t(`protocol.stage.5.op.${tipo === "texto" ? `${id}-text` : id}`);
}

/** «ingreso_mensual menor que (<) 3000 y empleo es informal». */
export function reglaTexto(
  t: Traduce,
  condiciones: readonly Condicion[],
  tipos: readonly string[],
  union: string,
): string {
  const partes = condiciones.map(
    (c, i) =>
      `${c.columna} ${operadorTexto(t, c.operador, tipos[i] ?? "numero")} ${c.valor}`,
  );
  return partes.join(
    ` ${t(`protocol.stage.5.rule.join-${union === "o" ? "o" : "y"}`)} `,
  );
}
