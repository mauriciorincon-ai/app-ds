// @vitest-environment node
//
// S21 (ADR 030) — el SQL de «Pregúntale a tus datos» tiene que decir lo MISMO que el motor. Este test escribe en
// tests/integration/.salida-consulta/ las tablas del kit ya leídas (números, categorías y fechas `AAAA-MM-DD`, tal como las ve el motor),
// y por cada pregunta del banco que da una consulta: el SQL y el resultado del motor. tests/python/test_consulta.py corre ese SQL en
// `sqlite3` de CPython y exige la MISMA tabla de resultado (mismos grupos, mismo orden, mismas cifras). Además:
//  · todo el banco que da una consulta se puede correr (la validación no tiene errores) salvo los casos que el banco marca;
//  · un caso hostil (nombres con comillas, categorías con apóstrofe, vacíos en todas partes) arma SQL que no se rompe ni se inyecta.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  armarCatalogo,
  correr,
  sePuedeCorrer,
  sqlDe,
  validar,
  type Catalogo,
  type QueryPlan,
} from "@/engine/consulta";
import { leerPregunta } from "@/engine/pregunta";
import { banco, tablaDelKit } from "../fixtures/preguntas/ayudas";

const SALIDA = resolve(process.cwd(), "tests/integration/.salida-consulta");

type ColumnaSalida = { name: string; kind: "numero" | "texto" | "fecha"; values: (number | string | null)[] };

function columnasDe(cat: Catalogo): ColumnaSalida[] {
  return cat.columnas.map((c) => {
    if (c.tipo === "numero") return { name: c.nombre, kind: "numero", values: [...c.valores] };
    if (c.tipo === "categoria") return { name: c.nombre, kind: "texto", values: [...c.valores] };
    return { name: c.nombre, kind: "fecha", values: [...(c.fechas ?? [])] };
  });
}

const escribirTabla = (nombre: string, cat: Catalogo) =>
  writeFileSync(resolve(SALIDA, `tabla-${nombre}.json`), JSON.stringify({ columns: columnasDe(cat), rows: cat.filas }));

function caso(nombre: string, tabla: string, plan: QueryPlan, cat: Catalogo) {
  const r = correr(plan, cat);
  const agrupado = plan.agrupar !== null;
  writeFileSync(
    resolve(SALIDA, `caso-${nombre}.json`),
    JSON.stringify({
      tabla,
      sql: sqlDe(plan, cat),
      agrupado,
      esperado: r.grupos.map((g) => (agrupado ? [g.etiqueta, g.valor, g.filas] : [g.valor, g.filas])),
    }),
  );
  return r;
}

beforeAll(() => {
  rmSync(SALIDA, { recursive: true, force: true });
  mkdirSync(SALIDA, { recursive: true });
});

describe("el banco de preguntas: el SQL dice lo mismo que el motor", () => {
  const catalogos = new Map<string, Catalogo>();
  const entradas = banco().filter((e) => (e.esperado as { tipo: string }).tipo === "consulta");

  it("hay un buen número de consultas que verificar", () => {
    expect(entradas.length).toBeGreaterThanOrEqual(70);
  });

  it.each(entradas.map((e) => [e.id, e] as const))("%s", (_id, e) => {
    let cat = catalogos.get(e.tabla);
    if (!cat) {
      cat = armarCatalogo(tablaDelKit(e.tabla));
      catalogos.set(e.tabla, cat);
      escribirTabla(e.tabla.replace(".csv", ""), cat);
    }
    const l = leerPregunta(e.pregunta, cat);
    expect(l.tipo).toBe("consulta");
    if (l.tipo !== "consulta") return;
    const v = validar(l.plan, cat);
    // las consultas del banco que no se pueden correr (agrupar por una cifra, tablas sin fecha) no tienen resultado que comparar
    if (!sePuedeCorrer(v)) return;
    const r = caso(e.id, e.tabla.replace(".csv", ""), l.plan, cat);
    expect(r.grupos.length).toBeGreaterThan(0);
  });
});

describe("un caso hostil: nombres con comillas, categorías con apóstrofe y vacíos", () => {
  const tabla = {
    headers: ['ed"ad', "ciu'dad", 'fecha "x"', "monto"],
    rows: [
      ["30", "O'Brien", "2025-01-10", "100"],
      ["40", "O'Brien", "2025-02-11", "200"],
      ["", "O'Brien", "2025-02-12", ""],
      ["50", "bajo ''1''", "2025-03-01", "300.5"],
      ["60", "", "2025-03-02", "50"],
      ["35", "O'Brien", "", "70"],
      ["45", "bajo ''1''", "2025-03-09", "10"],
      ["28", "x; DROP TABLE datos; --", "2025-03-09", "5"],
    ],
  };
  const cat = armarCatalogo(tabla);
  const base: QueryPlan = {
    medida: { agregacion: "suma", columna: "monto" },
    agrupar: { tipo: "categoria", columna: "ciu'dad" },
    condiciones: [{ columna: 'ed"ad', operador: ">", valor: "29" }],
    union: "",
    ventana: null,
    orden: null,
    top: null,
  };
  it.each([
    ["suma por ciudad con filtro", base],
    ["mediana por ciudad", { ...base, medida: { agregacion: "mediana" as const, columna: "monto" } }],
    ["promedio por mes", { ...base, agrupar: { tipo: "tiempo" as const, columna: 'fecha "x"', periodo: "mes" as const }, medida: { agregacion: "promedio" as const, columna: "monto" } }],
    ["máximo por trimestre con ventana", { ...base, agrupar: { tipo: "tiempo" as const, columna: 'fecha "x"', periodo: "trimestre" as const }, medida: { agregacion: "maximo" as const, columna: "monto" }, ventana: { columna: 'fecha "x"', desde: "2025-02-01", hasta: "2025-03-31", descripcion: { clave: "rango" as const, params: {} } } }],
    ["conteo de filas por semana", { ...base, agrupar: { tipo: "tiempo" as const, columna: 'fecha "x"', periodo: "semana" as const }, medida: { agregacion: "conteo" as const, columna: null }, condiciones: [] }],
    ["conteo por año de una columna", { ...base, agrupar: { tipo: "tiempo" as const, columna: 'fecha "x"', periodo: "anio" as const }, medida: { agregacion: "conteo" as const, columna: "monto" }, condiciones: [] }],
    ["dos valores del mismo campo con O", { ...base, agrupar: null, condiciones: [{ columna: "ciu'dad", operador: "=", valor: "O'Brien" }, { columna: "ciu'dad", operador: "=", valor: "bajo ''1''" }], union: "o" as const }],
    ["un valor con apóstrofe, excluido", { ...base, agrupar: null, condiciones: [{ columna: "ciu'dad", operador: "!=", valor: "O'Brien" }] }],
    ["el valor que parece una inyección es solo un texto", { ...base, agrupar: null, condiciones: [{ columna: "ciu'dad", operador: "=", valor: "x; DROP TABLE datos; --" }] }],
    ["mínimo, los 2 menores", { ...base, medida: { agregacion: "minimo" as const, columna: "monto" }, orden: "asc" as const, top: 2 }],
  ] as [string, QueryPlan][])("%s", (nombre, plan) => {
    escribirTabla("hostil", cat);
    const v = validar(plan, cat);
    expect(sePuedeCorrer(v), JSON.stringify(v.filter((x) => x.nivel === "error"))).toBe(true);
    const r = caso(`hostil-${nombre.replace(/[^a-z0-9]+/gi, "-")}`, "hostil", plan, cat);
    expect(r.grupos.length).toBeGreaterThan(0);
    // el texto que parece una sentencia solo aparece DENTRO de un literal entre apóstrofes
    const sql = sqlDe(plan, cat);
    if (sql.includes("DROP TABLE")) expect(sql).toContain("'x; DROP TABLE datos; --'");
  });

  it("los nombres con comillas dobles se escapan duplicándolas", () => {
    expect(sqlDe(base, cat)).toContain('"ed""ad" > 29');
    expect(sqlDe(base, cat)).toContain("\"ciu'dad\"");
    expect(sqlDe({ ...base, agrupar: null, condiciones: [{ columna: "ciu'dad", operador: "=", valor: "O'Brien" }] }, cat)).toContain("'O''Brien'");
  });
});
