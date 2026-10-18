// Protocolo DS (S9, etapa 4): filas repetidas. Exactas (celda por celda, como las junta Probeta)
// y la misma unidad el mismo día. Solo salen conteos.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  filasRepetidas,
  unidadMomentoRepetidos,
} from "@/engine/protocolo/duplicados";
import { fechasPorFila } from "@/engine/protocolo/fechas";
import { valoresDe } from "@/engine/protocolo/tabla";
import { parseCsvWithLimits, type CsvTable } from "@/lib/ds/csv";

function tabla(archivo: string): CsvTable {
  const r = parseCsvWithLimits(
    readFileSync(`docs/kit-de-prueba/${archivo}`, "utf8"),
  );
  if (!r.ok) throw new Error(archivo);
  return r.table;
}

describe("filas exactas repetidas", () => {
  it("cuenta las que sobran: 10 en clientes-sucio, 4 en bajas-con-fuga, 0 en renovaciones", () => {
    expect(filasRepetidas(tabla("clientes-sucio.csv"))).toBe(10);
    expect(filasRepetidas(tabla("bajas-con-fuga.csv"))).toBe(4);
    expect(filasRepetidas(tabla("renovaciones-mensuales.csv"))).toBe(0);
  });

  it("es celda por celda y sin recortar: «a» y « a» son filas distintas", () => {
    const t: CsvTable = { headers: ["x"], rows: [["a"], [" a"], ["a"]] };
    expect(filasRepetidas(t)).toBe(1);
  });

  it("una tabla vacía no tiene repetidas", () => {
    expect(filasRepetidas({ headers: ["x"], rows: [] })).toBe(0);
  });
});

describe("la misma unidad el mismo día", () => {
  it("bajas-con-fuga: 7 de más (3 con otros valores y las 4 exactas), renovaciones: 0", () => {
    for (const [archivo, unidad, fecha, esperado] of [
      ["bajas-con-fuga.csv", "cliente_id", "mes_observado", 7],
      ["renovaciones-mensuales.csv", "cliente_id", "mes_observado", 0],
    ] as const) {
      const t = tabla(archivo);
      const fechas = fechasPorFila(valoresDe(t, fecha), null)!;
      expect(unidadMomentoRepetidos(valoresDe(t, unidad), fechas.fechas)).toBe(
        esperado,
      );
    }
  });

  it("las filas sin unidad o sin fecha no cuentan, y la unidad se compara recortada", () => {
    const unidades = ["A", " A", "", "A", "NA", "B", "B"];
    const fechas = [
      "2026-01-01",
      "2026-01-01",
      "2026-01-01",
      null,
      "2026-01-01",
      "2026-01-01",
      "2026-01-02",
    ];
    // A el 1/1 aparece dos veces («A» y « A»); la vacía, la de «NA» y la sin fecha no cuentan;
    // B en dos días distintos no se repite.
    expect(unidadMomentoRepetidos(unidades, fechas)).toBe(1);
  });
});

describe("fechasPorFila", () => {
  it("devuelve la fecha de cada fila con el mismo orden que dedujo la lectura", () => {
    const r = fechasPorFila(["31/01/2026", "", "15/02/2026", "basura"], null);
    expect(r).toEqual({
      orden: "dia-mes",
      fechas: ["2026-01-31", null, "2026-02-15", null],
    });
  });

  it("sin leer entera (ambigua, mezclada o ninguna) devuelve null y no adivina", () => {
    expect(fechasPorFila(["05/06/2026", "07/08/2026"], null)).toBeNull();
    expect(fechasPorFila(["2026-01-05", "05/06/2026"], null)).toBeNull();
    expect(fechasPorFila(["hola", "chao"], null)).toBeNull();
  });

  it("con la respuesta del usuario lee lo ambiguo", () => {
    expect(fechasPorFila(["05/06/2026"], "mes-dia")?.fechas).toEqual([
      "2026-05-06",
    ]);
    expect(fechasPorFila(["05/06/2026"], "dia-mes")?.fechas).toEqual([
      "2026-06-05",
    ]);
  });

  it("coincide con leerFechas en cuántas lee y su rango (la kit)", () => {
    const t = tabla("renovaciones-mensuales.csv");
    const r = fechasPorFila(valoresDe(t, "mes_observado"), null)!;
    const leidas = r.fechas.filter((f) => f !== null) as string[];
    expect(leidas).toHaveLength(361);
    expect([...leidas].sort()[0]).toBe("2025-01-15");
  });
});
