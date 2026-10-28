// S21: lo que comparten los tests de «Pregúntale a tus datos» —el banco de preguntas, el catálogo de un archivo del kit y la forma en que se
// proyecta una lectura para compararla—. El banco (`banco.json`) lo revisó una persona pregunta por pregunta cuando se congeló; cambiarlo
// es decir que la lectura de esa pregunta cambió a propósito.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { armarCatalogo, type Catalogo, type OpcionesCatalogo } from "@/engine/consulta";
import { parseCsvWithLimits, type CsvTable } from "@/lib/ds/csv";
import type { Lectura } from "@/engine/pregunta";

export const tablaDelKit = (archivo: string): CsvTable => {
  const p = parseCsvWithLimits(readFileSync(resolve(process.cwd(), "docs/kit-de-prueba", archivo), "utf8"));
  if (!p.ok) throw new Error(`csv ${archivo}`);
  return p.table;
};

export const catalogoDelKit = (archivo: string, opciones?: OpcionesCatalogo): Catalogo =>
  armarCatalogo(tablaDelKit(archivo), opciones);

export type EntradaBanco = {
  readonly id: string;
  readonly tabla: string;
  readonly pregunta: string;
  readonly esperado: unknown;
};

export const banco = (): EntradaBanco[] =>
  JSON.parse(readFileSync(resolve(process.cwd(), "tests/fixtures/preguntas/banco.json"), "utf8")) as EntradaBanco[];

/** Lo que importa de una lectura, sin funciones ni textos: es lo que el banco congela. */
export function proyectar(l: Lectura): unknown {
  if (l.tipo === "consulta")
    return {
      tipo: "consulta",
      plan: {
        medida: l.plan.medida,
        agrupar: l.plan.agrupar,
        condiciones: l.plan.condiciones,
        union: l.plan.union,
        ventana: l.plan.ventana && {
          columna: l.plan.ventana.columna,
          desde: l.plan.ventana.desde,
          hasta: l.plan.ventana.hasta,
          clave: l.plan.ventana.descripcion.clave,
        },
        orden: l.plan.orden,
        top: l.plan.top,
      },
      propuestos: l.propuestos,
      noLeidas: l.noLeidas,
      avisos: l.avisos.map((a) => a.clave),
    };
  if (l.tipo === "pregunta")
    return {
      tipo: "pregunta",
      abiertas: l.abiertas.map((a) => ({ id: a.id, tipo: a.tipo, opciones: a.opciones.map((o) => o.valor) })),
      noLeidas: l.noLeidas,
    };
  return { tipo: "no-entendi", motivo: l.motivo, noLeidas: l.noLeidas };
}
