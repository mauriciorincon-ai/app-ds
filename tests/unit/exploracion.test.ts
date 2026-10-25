// @vitest-environment node
/**
 * S18 — la exploración: distribuciones, correlaciones y un resumen escrito comprobado contra los números. Lo que hace FALLAR:
 *  · las cuentas coinciden con valores contados a mano (Pearson, V de Cramér, casillas, conteos);
 *  · el resumen de CADA archivo del kit pasa la comprobación, que recomputa desde la tabla con otras cuentas: si el motor y
 *    la comprobación discreparan en cualquier archivo, esto lo nombra;
 *  · un resumen alterado (una cifra, una pareja inventada) no pasa, y el panel no lo enseña;
 *  · es determinista y no cambia la tabla.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CASILLAS_MAX,
  CATEGORIAS_MOSTRADAS,
  COLUMNAS_MATRIZ_MAX,
  explorar,
} from "@/engine/exploracion";
import { parseCsvWithLimits, type CsvTable } from "@/lib/ds/csv";
import {
  hechosDirectos,
  resumenDe,
  resumenVerificado,
} from "@/lib/narration/exploracion";

const tabla = (
  cabeza: string[],
  columnas: (string | number)[][],
): CsvTable => ({
  headers: cabeza,
  rows: columnas[0]!.map((_, i) => columnas.map((c) => String(c[i]))),
});
const KIT = "docs/kit-de-prueba";
const leerKit = (nombre: string): CsvTable | null => {
  const l = parseCsvWithLimits(readFileSync(join(KIT, nombre), "utf8"));
  return l.ok ? l.table : null;
};

describe("las cuentas, contadas a mano", () => {
  const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const t = tabla(
    ["x", "doble", "inverso", "plano"],
    [x, x.map((v) => 2 * v), x.map((v) => 100 - v), x.map(() => 5)],
  );
  const e = explorar(t);

  it("Pearson: 1 con su doble, −1 con su inverso, la diagonal en 1 y nulo con una constante", () => {
    const i = (nombre: string) => e.numericas.indexOf(nombre);
    expect(e.matriz[i("x")]![i("doble")]).toBeCloseTo(1, 12);
    expect(e.matriz[i("x")]![i("inverso")]).toBeCloseTo(-1, 12);
    expect(e.matriz[i("x")]![i("x")]).toBe(1);
    expect(e.matriz[i("x")]![i("plano")]).toBeNull();
    expect(e.matriz[i("doble")]![i("x")]).toBe(e.matriz[i("x")]![i("doble")]);
  });

  it("las casillas de una numérica suman las filas con valor, y cubren de su mínimo a su máximo", () => {
    const d = e.distribuciones.find((q) => q.column === "x")!;
    if (d.kind !== "numeric") throw new Error("kind");
    expect(d.casillas.reduce((a, c) => a + c.cuenta, 0)).toBe(12);
    expect(d.casillas[0]!.desde).toBe(1);
    expect(d.casillas.at(-1)!.hasta).toBe(12);
    expect(d.casillas.length).toBeLessThanOrEqual(CASILLAS_MAX);
    expect([d.min, d.max, d.mediana, d.media]).toEqual([1, 12, 6.5, 6.5]);
  });

  it("una columna constante cabe en una sola casilla", () => {
    const d = e.distribuciones.find((q) => q.column === "plano")!;
    if (d.kind !== "numeric") throw new Error("kind");
    expect(d.casillas).toHaveLength(1);
    expect(d.casillas[0]!.cuenta).toBe(12);
  });

  it("V de Cramér: 1 si una categoría decide la otra, cerca de 0 si son independientes", () => {
    const a = Array.from({ length: 40 }, (_, i) => (i % 2 ? "a" : "b"));
    const igual = tabla(
      ["p", "q"],
      [a, a.map((v) => (v === "a" ? "uno" : "dos"))],
    );
    expect(explorar(igual).cramer[0]!.v).toBeCloseTo(1, 12);
    // independientes: cada combinación aparece lo mismo
    const p: string[] = [];
    const q: string[] = [];
    for (const u of ["a", "b"])
      for (const v of ["x", "y", "z"])
        for (let k = 0; k < 5; k++) {
          p.push(u);
          q.push(v);
        }
    expect(explorar(tabla(["p", "q"], [p, q])).cramer[0]!.v).toBeCloseTo(0, 12);
  });

  it("las categóricas: las más frecuentes primero y el resto en «otras»", () => {
    const valores = Array.from({ length: 100 }, (_, i) => `c${i % 12}`);
    const d = explorar(tabla(["c"], [valores])).distribuciones[0]!;
    if (d.kind !== "categorical") throw new Error("kind");
    expect(d.distintas).toBe(12);
    expect(d.mas).toHaveLength(CATEGORIAS_MOSTRADAS);
    expect(d.mas.reduce((a, m) => a + m.cuenta, 0) + d.otras).toBe(100);
  });

  it("la matriz se limita a las primeras 15 numéricas y dice cuántas hay", () => {
    const muchas = tabla(
      Array.from({ length: 20 }, (_, i) => `n${i}`),
      Array.from({ length: 20 }, (_, k) =>
        Array.from({ length: 30 }, (_, i) => (i * (k + 1)) % 17),
      ),
    );
    const g = explorar(muchas);
    expect(g.numericas).toHaveLength(COLUMNAS_MATRIZ_MAX);
    expect(g.totalNumericas).toBe(20);
  });

  it("es determinista y no toca la tabla", () => {
    const antes = JSON.stringify(t);
    expect(explorar(t)).toEqual(explorar(t));
    expect(JSON.stringify(t)).toBe(antes);
  });
});

describe("el resumen de cada archivo del kit pasa la comprobación (el motor y las cuentas directas coinciden)", () => {
  const archivos = readdirSync(KIT).filter((f) => f.endsWith(".csv"));
  it("hay archivos que mirar", () =>
    expect(archivos.length).toBeGreaterThanOrEqual(15));
  it.each(archivos)("%s", (archivo) => {
    const t = leerKit(archivo);
    if (!t) return; // los hechos para fallar al leerse
    for (const locale of ["es", "en"] as const) {
      const r = resumenVerificado(explorar(t), t, locale);
      expect(r.fallos, `${archivo} (${locale})`).toEqual([]);
      expect(r.verificado).toBe(true);
      expect(r.texto).toMatch(
        locale === "es" ? /Tu tabla tiene/ : /Your table has/,
      );
    }
  });
});

describe("un resumen alterado no se muestra", () => {
  const t = leerKit("marketing-campania.csv")!;
  const e = explorar(t);
  const bueno = resumenVerificado(e, t, "es").texto!;

  it("una cifra cambiada, una cifra inventada o una pareja que no es se rechazan", () => {
    const filas = String(t.rows.length);
    expect(
      resumenVerificado(e, t, "es", bueno.replace(filas, "999")).verificado,
    ).toBe(false);
    expect(
      resumenVerificado(e, t, "es", `${bueno} El 87 % de los clientes compra.`)
        .verificado,
    ).toBe(false);
    const pareja =
      /Las dos numéricas que más se mueven juntas: (\S+) y (\S+) /.exec(bueno);
    if (pareja) {
      const inventada = bueno.replace(
        `${pareja[1]} y ${pareja[2]}`,
        `${pareja[2]} y ${pareja[1]}x`,
      );
      expect(resumenVerificado(e, t, "es", inventada).verificado).toBe(false);
    }
  });

  it("el rechazo no deja texto: el panel enseña solo las tablas", () => {
    const r = resumenVerificado(e, t, "es", "Todo va bien.");
    expect(r).toMatchObject({ texto: null, verificado: false });
    expect(r.fallos.length).toBeGreaterThan(0);
  });

  it("los hechos directos de dos clases dicen lo que el texto dice", () => {
    const h = hechosDirectos(t);
    expect(resumenDe(h, "es")).toBe(bueno);
  });
});
