// S20 (ADR 028): el calendario y la serie del pronóstico. Lo que estas pruebas hacen FALLAR:
//  · los días ↔ `AAAA-MM-DD` van y vuelven (bisiestos, fin de mes, antes de 1970) y coinciden con `Date` del motor de JS;
//  · la semana empieza en lunes, el mes es el mes y cada periodo se nombra como se descarga;
//  · el periodo y el agregado propuestos; un periodo más espaciado no se propone;
//  · los huecos se nombran, se completan con la recta solo si son pocos, y una suma a medias de los extremos se quita;
//  · los periodos que vienen se cuentan desde el último de la serie.
import { describe, expect, it } from "vitest";
import {
  armarSerie,
  completarLineal,
  diaDeSemana,
  diasDe,
  etiquetaDe,
  etiquetasDe,
  indiceDe,
  inicioDe,
  isoDe,
  periodosFuturos,
  proponerAgregado,
  proponerPeriodo,
  sePuedeCompletar,
} from "@/engine/serie";

describe("el calendario", () => {
  it("ida y vuelta con Date en fechas de borde (bisiestos, fin de mes, antes de 1970)", () => {
    for (const iso of ["1970-01-01", "2000-02-29", "2024-02-29", "2100-02-28", "2100-03-01", "1969-12-31", "1900-03-01", "2026-12-31", "1600-02-29"]) {
      expect(isoDe(diasDe(iso))).toBe(iso);
      expect(diasDe(iso)).toBe(Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000));
    }
  });

  it("un día después de un fin de mes o de un año es el primero del siguiente", () => {
    expect(isoDe(diasDe("2024-02-29") + 1)).toBe("2024-03-01");
    expect(isoDe(diasDe("2023-02-28") + 1)).toBe("2023-03-01");
    expect(isoDe(diasDe("2025-12-31") + 1)).toBe("2026-01-01");
  });

  it("el lunes es el día 0 de la semana (el 1970-01-01 fue jueves)", () => {
    expect(diaDeSemana(diasDe("1970-01-01"))).toBe(3);
    expect(diaDeSemana(diasDe("2026-10-26"))).toBe(0); // lunes
    expect(diaDeSemana(diasDe("2026-10-25"))).toBe(6); // domingo
    expect(diaDeSemana(diasDe("1969-12-29"))).toBe(0); // lunes antes de 1970
  });

  it("el periodo de una fecha: día, semana que empieza en lunes y mes", () => {
    expect(inicioDe(indiceDe("2026-10-25", "semana"), "semana")).toBe("2026-10-19");
    expect(inicioDe(indiceDe("2026-10-26", "semana"), "semana")).toBe("2026-10-26");
    expect(inicioDe(indiceDe("2026-10-31", "mes"), "mes")).toBe("2026-10-01");
    expect(indiceDe("2026-10-25", "semana")).toBe(indiceDe("2026-10-19", "semana"));
    expect(indiceDe("2026-10-26", "semana")).toBe(indiceDe("2026-10-25", "semana") + 1);
    // el año nuevo no parte la semana en el índice
    expect(indiceDe("2026-01-04", "semana")).toBe(indiceDe("2025-12-29", "semana"));
  });

  it("cada periodo se nombra como se descarga: el día y el lunes completos, el mes como AAAA-MM", () => {
    expect(etiquetaDe(indiceDe("2026-03-15", "dia"), "dia")).toBe("2026-03-15");
    expect(etiquetaDe(indiceDe("2026-03-15", "semana"), "semana")).toBe("2026-03-09");
    expect(etiquetaDe(indiceDe("2026-03-15", "mes"), "mes")).toBe("2026-03");
    expect(etiquetaDe(indiceDe("2026-12-15", "mes") + 1, "mes")).toBe("2027-01");
  });
});

describe("la propuesta", () => {
  const dias = (desde: string, n: number, cada = 1) =>
    Array.from({ length: n }, (_, i) => isoDe(diasDe(desde) + i * cada));

  it("propone el periodo por la mediana de los saltos", () => {
    expect(proponerPeriodo(dias("2026-01-01", 40))).toBe("dia");
    expect(proponerPeriodo(dias("2026-01-05", 30, 7))).toBe("semana");
    expect(proponerPeriodo(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"])).toBe("mes");
  });

  it("filas repetidas de un mismo día no cambian la propuesta, y fechas muy espaciadas no se ofrecen", () => {
    expect(proponerPeriodo([...dias("2026-01-01", 20), ...dias("2026-01-01", 20)])).toBe("dia");
    expect(proponerPeriodo(["2020-01-01", "2023-01-01", "2026-01-01"])).toBeNull();
    expect(proponerPeriodo(["2026-01-01"])).toBeNull();
    expect(proponerPeriodo([null, null])).toBeNull();
  });

  it("promedia lo que habla de tasas, precios o promedios y suma lo demás", () => {
    expect(proponerAgregado("precio_medio")).toBe("promedio");
    expect(proponerAgregado("Tasa de conversión")).toBe("promedio");
    expect(proponerAgregado("temperature")).toBe("promedio");
    expect(proponerAgregado("ventas")).toBe("suma");
    expect(proponerAgregado("visitas")).toBe("suma");
  });
});

describe("armar la serie", () => {
  it("junta las filas de un mes (suma o promedio) y deja fuera las que no se leen", () => {
    const fechas = ["2026-01-05", "2026-01-20", "2026-02-10", null, "2026-03-01", "2026-03-02"];
    const valores = [10, 20, 5, 99, null, 7];
    const suma = armarSerie(fechas, valores, "mes", "suma");
    expect(suma.ok && suma.serie.valores).toEqual([30, 5, 7]);
    expect(suma.ok && suma.serie.filas).toEqual({ usadas: 4, sinFecha: 1, sinValor: 1 });
    const prom = armarSerie(fechas, valores, "mes", "promedio");
    expect(prom.ok && prom.serie.valores).toEqual([15, 5, 7]);
  });

  it("nombra los periodos que faltan y deja un hueco (null) en su lugar", () => {
    const r = armarSerie(["2026-01-15", "2026-02-15", "2026-05-15"], [1, 2, 5], "mes", "suma");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.serie.valores).toEqual([1, 2, null, null, 5]);
    expect(r.serie.huecos).toEqual(["2026-03", "2026-04"]);
    expect(etiquetasDe(r.serie)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"]);
  });

  it("una suma de datos diarios quita los meses de los extremos que no están completos", () => {
    const fechas: string[] = [];
    for (let d = diasDe("2026-01-10"); d <= diasDe("2026-04-20"); d++) fechas.push(isoDe(d));
    const r = armarSerie(fechas, fechas.map(() => 1), "mes", "suma");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.serie.quitados).toEqual(["2026-01", "2026-04"]);
    expect(etiquetasDe(r.serie)).toEqual(["2026-02", "2026-03"]);
    expect(r.serie.valores).toEqual([28, 31]);
    // promediando no se quita nada
    const p = armarSerie(fechas, fechas.map(() => 1), "mes", "promedio");
    expect(p.ok && p.serie.quitados).toEqual([]);
    expect(p.ok && p.serie.valores).toEqual([1, 1, 1, 1]);
  });

  it("sin filas legibles, o con un rango imposible, dice por qué", () => {
    expect(armarSerie([null], [1], "mes", "suma")).toEqual({ ok: false, motivo: "sin-filas" });
    expect(armarSerie(["2026-01-01", "1900-01-01"], [1, 2], "dia", "suma")).toEqual({ ok: false, motivo: "muy-larga" });
  });

  it("solo se completan los huecos si son pocos, y con la recta entre los vecinos", () => {
    const r = armarSerie(["2026-01-01", "2026-04-01"], [10, 40], "mes", "suma");
    if (!r.ok) throw new Error("serie");
    expect(sePuedeCompletar(r.serie)).toBe(false); // 2 de 4 periodos
    expect(completarLineal([10, null, null, 40])).toEqual({ valores: [10, 20, 30, 40], completado: [false, true, true, false] });
    expect(completarLineal([1, 2, 3]).completado).toEqual([false, false, false]);
    const casiCompleta = armarSerie(
      Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}-01`).filter((_, i) => i !== 5),
      Array.from({ length: 11 }, () => 1),
      "mes",
      "suma",
    );
    expect(casiCompleta.ok && sePuedeCompletar(casiCompleta.serie)).toBe(true); // 1 de 12
  });
});

describe("los periodos que vienen", () => {
  it("se cuentan desde el último de la serie, también al cruzar el año", () => {
    const r = armarSerie(["2026-10-01", "2026-11-01", "2026-12-01"], [1, 2, 3], "mes", "suma");
    if (!r.ok) throw new Error("serie");
    expect(periodosFuturos(r.serie, 3)).toEqual(["2027-01", "2027-02", "2027-03"]);
    const s = armarSerie(["2026-12-28", "2027-01-04"], [1, 2], "semana", "suma");
    if (!s.ok) throw new Error("serie");
    expect(periodosFuturos(s.serie, 2)).toEqual(["2027-01-11", "2027-01-18"]);
  });
});
