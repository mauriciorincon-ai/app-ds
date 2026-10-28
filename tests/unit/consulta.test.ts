// S21 (ADR 030): el motor de consultas de «Pregúntale a tus datos». Lo que estos tests hacen FALLAR si se rompe:
//  · cada agregación (suma, promedio, conteo, mínimo, máximo, mediana par e impar) sobre una tabla con las cuentas hechas a mano;
//  · una celda vacía NUNCA entra (ni en la medida, ni en el grupo, ni en la fecha, ni en un filtro, tampoco con «≠») y se cuenta;
//  · las cubetas de tiempo (día, semana en lunes, mes, trimestre, año) y sus fronteras (fin de mes, bisiesto, cambio de año);
//  · la ventana es de la tabla: sus extremos son inclusivos y una fecha sin leer no entra;
//  · el orden (valor y luego nombre), «los N» y el máximo de grupos;
//  · la validación dice sí o no ANTES de correr, con su nivel;
//  · el SQL es el esperado y la descarga neutraliza fórmulas.
import { describe, expect, it } from "vitest";
import {
  armarCatalogo,
  correr,
  csvDeResultado,
  cubetaDe,
  GRUPOS_MAX,
  mediana,
  rangoDelPeriodo,
  rangoUltimos,
  sePuedeCorrer,
  sqlDe,
  validar,
  type QueryPlan,
} from "@/engine/consulta";

const tabla = {
  headers: ["dia", "zona", "tipo", "monto"],
  rows: [
    ["2024-01-31", "norte", "a", "10"],
    ["2024-02-01", "norte", "b", "20"],
    ["2024-02-29", "sur", "a", "30"],
    ["2024-03-01", "sur", "b", "40"],
    ["2024-03-02", "sur", "a", ""],
    ["2024-03-03", "", "a", "50"],
    ["fecha rota", "norte", "b", "60"],
    ["2024-12-31", "norte", "a", "70"],
    ["2025-01-01", "sur", "b", "80"],
  ],
};
const cat = armarCatalogo(tabla);
const plan = (cambios: Partial<QueryPlan> = {}): QueryPlan => ({
  medida: { agregacion: "suma", columna: "monto" },
  agrupar: null,
  condiciones: [],
  union: "",
  ventana: null,
  orden: null,
  top: null,
  ...cambios,
});
const porZona = { tipo: "categoria", columna: "zona" } as const;

describe("las agregaciones", () => {
  it.each([
    ["suma", 10 + 20 + 30 + 40 + 50 + 60 + 70 + 80],
    ["promedio", 360 / 8],
    ["conteo", 8],
    ["minimo", 10],
    ["maximo", 80],
    ["mediana", (40 + 50) / 2],
  ] as const)("%s sin agrupar", (agregacion, esperado) => {
    const r = correr(plan({ medida: { agregacion, columna: "monto" } }), cat);
    expect(r.grupos).toHaveLength(1);
    expect(r.grupos[0]!.valor).toBeCloseTo(esperado, 10);
  });

  it("contar filas cuenta todas las que entran, aunque la medida esté vacía", () => {
    const r = correr(plan({ medida: { agregacion: "conteo", columna: null } }), cat);
    expect(r.grupos[0]!.valor).toBe(9);
  });

  it("la mediana de un número impar de valores es el del medio y la de uno par, el promedio de los dos", () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 3, 2])).toBe(2.5);
    expect(mediana([7])).toBe(7);
  });
});

describe("los vacíos nunca entran, y se cuentan", () => {
  it("la medida vacía, el grupo vacío y la fecha ilegible quedan fuera y cada uno se cuenta", () => {
    const p = plan({ agrupar: porZona });
    const s = correr(p, cat).seleccion;
    expect(s.sinGrupo).toBe(1);
    expect(s.sinValor).toBe(1);
    expect(s.filas).toHaveLength(7);
    const t = correr(plan({ agrupar: { tipo: "tiempo", columna: "dia", periodo: "mes" } }), cat).seleccion;
    expect(t.sinFecha).toBe(1);
  });

  it("un filtro «distinto de» no deja pasar una celda vacía", () => {
    const p = plan({ condiciones: [{ columna: "zona", operador: "!=", valor: "norte" }] });
    expect(correr(p, cat).seleccion.fueraDeFiltros).toBe(5);
    expect(correr(p, cat).grupos[0]!.valor).toBe(30 + 40 + 80);
  });
});

describe("los grupos y su orden", () => {
  it("por categoría ordena por cifra, de mayor a menor, y los empates por nombre", () => {
    const r = correr(plan({ agrupar: porZona }), cat);
    // norte: 10 + 20 + 60 (la fecha rota no importa si no se agrupa por tiempo) + 70 = 160 en 4 filas; sur: 30 + 40 + 80 = 150 en 3
    expect(r.grupos.map((g) => [g.etiqueta, g.valor, g.filas])).toEqual([
      ["norte", 160, 4],
      ["sur", 150, 3],
    ]);
    const empate = armarCatalogo({ headers: ["g", "v"], rows: [["b", "1"], ["a", "1"], ["c", "2"]] });
    const e = correr({ ...plan({ medida: { agregacion: "suma", columna: "v" } }), agrupar: { tipo: "categoria", columna: "g" } }, empate);
    expect(e.grupos.map((g) => g.etiqueta)).toEqual(["c", "a", "b"]);
  });

  it("«los N menores» ordena de menor a mayor y corta; dice cuántos había", () => {
    const r = correr(plan({ agrupar: porZona, orden: "asc", top: 1 }), cat);
    expect(r.grupos).toHaveLength(1);
    expect(r.gruposTotales).toBe(2);
    expect(r.grupos[0]!.etiqueta).toBe("sur");
  });

  it("por periodo va en orden cronológico", () => {
    const r = correr(plan({ agrupar: { tipo: "tiempo", columna: "dia", periodo: "mes" } }), cat);
    expect(r.grupos.map((g) => g.etiqueta)).toEqual(["2024-01", "2024-02", "2024-03", "2024-12", "2025-01"]);
  });
});

describe("el calendario", () => {
  it.each([
    ["2024-02-29", "dia", "2024-02-29"],
    ["2024-02-29", "semana", "2024-02-26"],
    ["2024-03-03", "semana", "2024-02-26"],
    ["2024-03-04", "semana", "2024-03-04"],
    ["2024-12-31", "mes", "2024-12"],
    ["2024-12-31", "trimestre", "2024-Q4"],
    ["2024-01-01", "trimestre", "2024-Q1"],
    ["2024-06-30", "trimestre", "2024-Q2"],
    ["2024-07-01", "trimestre", "2024-Q3"],
    ["2025-01-01", "anio", "2025"],
  ] as const)("%s por %s → %s", (iso, periodo, esperado) => {
    expect(cubetaDe(iso, periodo)).toBe(esperado);
  });

  it("los rangos de un periodo: bisiesto, fin de año, desfase y últimos N", () => {
    expect(rangoDelPeriodo("2024-02-10", "mes")).toEqual({ desde: "2024-02-01", hasta: "2024-02-29" });
    expect(rangoDelPeriodo("2025-02-10", "mes")).toEqual({ desde: "2025-02-01", hasta: "2025-02-28" });
    expect(rangoDelPeriodo("2025-01-15", "mes", 1)).toEqual({ desde: "2024-12-01", hasta: "2024-12-31" });
    expect(rangoDelPeriodo("2025-01-15", "trimestre", 1)).toEqual({ desde: "2024-10-01", hasta: "2024-12-31" });
    expect(rangoDelPeriodo("2024-03-03", "semana")).toEqual({ desde: "2024-02-26", hasta: "2024-03-03" });
    expect(rangoDelPeriodo("2024-03-03", "anio", 1)).toEqual({ desde: "2023-01-01", hasta: "2023-12-31" });
    expect(rangoUltimos("2024-03-03", "mes", 3)).toEqual({ desde: "2024-01-01", hasta: "2024-03-31" });
    expect(rangoUltimos("2024-03-03", "dia", 7)).toEqual({ desde: "2024-02-26", hasta: "2024-03-03" });
  });

  it("la ventana es inclusiva en sus dos extremos", () => {
    const v = { columna: "dia", desde: "2024-02-01", hasta: "2024-03-01", descripcion: { clave: "rango", params: {} } } as const;
    const r = correr(plan({ ventana: v, medida: { agregacion: "conteo", columna: null } }), cat);
    expect(r.grupos[0]!.valor).toBe(3);
    expect(r.seleccion.sinFecha).toBe(1);
  });
});

describe("la validación, antes de correr", () => {
  const nivel = (p: QueryPlan, clave: string) => validar(p, cat).find((v) => v.clave === clave)?.nivel;
  it("sumar una columna de texto es un error", () => {
    const p = plan({ medida: { agregacion: "suma", columna: "tipo" } });
    expect(nivel(p, "medida_no_numerica")).toBe("error");
    expect(sePuedeCorrer(validar(p, cat))).toBe(false);
  });
  it("contar una columna de texto está bien", () => {
    expect(sePuedeCorrer(validar(plan({ medida: { agregacion: "conteo", columna: "tipo" } }), cat))).toBe(true);
  });
  it("agrupar por una columna de números o pedir una columna que no existe es un error", () => {
    expect(nivel(plan({ agrupar: { tipo: "categoria", columna: "monto" } }), "grupo_numerica")).toBe("error");
    expect(nivel(plan({ medida: { agregacion: "suma", columna: "nada" } }), "medida_no_existe")).toBe("error");
  });
  it("un valor que no existe en la columna es un error; uno que existe, no", () => {
    expect(nivel(plan({ condiciones: [{ columna: "zona", operador: "=", valor: "este" }] }), "filtro_valor_no_existe")).toBe("error");
    expect(nivel(plan({ condiciones: [{ columna: "zona", operador: "=", valor: "sur" }] }), "filtro_ok")).toBe("ok");
  });
  it("una ventana sin filas es un error, y una que pasa de la última fecha avisa", () => {
    const vacia = { columna: "dia", desde: "2030-01-01", hasta: "2030-12-31", descripcion: { clave: "anio", params: {} } } as const;
    expect(nivel(plan({ ventana: vacia }), "ventana_sin_filas")).toBe("error");
    const larga = { columna: "dia", desde: "2025-01-01", hasta: "2025-12-31", descripcion: { clave: "anio", params: {} } } as const;
    expect(nivel(plan({ ventana: larga }), "ventana_incompleta")).toBe("aviso");
  });
  it("más de GRUPOS_MAX grupos pide acotar; con «los N» sí se puede", () => {
    const filas = Array.from({ length: GRUPOS_MAX + 10 }, (_, i) => [`g${i}`, String(i)]);
    const muchos = armarCatalogo({ headers: ["g", "v"], rows: filas });
    const p: QueryPlan = { ...plan({ medida: { agregacion: "suma", columna: "v" } }), agrupar: { tipo: "categoria", columna: "g" } };
    expect(validar(p, muchos).find((v) => v.clave === "grupo_muchos")?.nivel).toBe("error");
    expect(sePuedeCorrer(validar({ ...p, top: 10, orden: "desc" }, muchos))).toBe(true);
  });
  it("las filas que no entran se dicen con su cuenta", () => {
    const v = validar(plan({ agrupar: porZona }), cat);
    expect(v.find((x) => x.clave === "filas_sin_grupo")?.params).toEqual({ n: 1 });
    expect(v.find((x) => x.clave === "filas_sin_valor")?.params).toEqual({ n: 1 });
  });
});

describe("el SQL", () => {
  it("una suma por categoría con filtro y «los 2 mayores»", () => {
    const sql = sqlDe(
      plan({ agrupar: porZona, condiciones: [{ columna: "tipo", operador: "=", valor: "a" }], orden: "desc", top: 2 }),
      cat,
    );
    expect(sql).toBe(
      [
        'SELECT "zona" AS "zona", SUM("monto") AS "suma_monto", COUNT(*) AS "n"',
        'FROM "tu_tabla"',
        "WHERE \"tipo\" = 'a'",
        '  AND "zona" IS NOT NULL',
        '  AND "monto" IS NOT NULL',
        "GROUP BY 1",
        "ORDER BY 2 DESC, 1 ASC",
        "LIMIT 2;",
      ].join("\n"),
    );
  });
  it("por trimestre con ventana, y por semana en lunes", () => {
    const v = { columna: "dia", desde: "2024-01-01", hasta: "2024-12-31", descripcion: { clave: "anio", params: {} } } as const;
    const t = sqlDe(plan({ agrupar: { tipo: "tiempo", columna: "dia", periodo: "trimestre" }, ventana: v }), cat);
    expect(t).toContain("substr(\"dia\", 1, 4) || '-Q' || ((CAST(substr(\"dia\", 6, 2) AS INTEGER) + 2) / 3) AS \"dia\"");
    expect(t).toContain("\"dia\" >= '2024-01-01'");
    expect(t).toContain("ORDER BY 1 ASC");
    expect(sqlDe(plan({ agrupar: { tipo: "tiempo", columna: "dia", periodo: "semana" } }), cat)).toContain("strftime('%w', \"dia\")");
  });
  it("la mediana va con funciones de ventana", () => {
    const sql = sqlDe(plan({ medida: { agregacion: "mediana", columna: "monto" }, agrupar: porZona }), cat);
    expect(sql).toContain("ROW_NUMBER() OVER (PARTITION BY g ORDER BY v)");
    expect(sql).toContain("WHERE r IN ((c + 1) / 2, (c + 2) / 2)");
    expect(sql).toContain('MAX(c) AS "n"');
  });
});

describe("la descarga", () => {
  it("el CSV lleva el grupo, la cifra y las filas, y neutraliza una fórmula", () => {
    const c = armarCatalogo({ headers: ["g", "v"], rows: [["=SUMA(A1)", "5"], ["x", "3"]] });
    const p: QueryPlan = { ...plan({ medida: { agregacion: "suma", columna: "v" } }), agrupar: { tipo: "categoria", columna: "g" } };
    const csv = csvDeResultado(p, correr(p, c), { grupo: "g", valor: "suma_v", filas: "filas" });
    expect(csv.split("\n")).toEqual(["g,suma_v,filas", "'=SUMA(A1),5,1", "x,3,1", ""]);
  });
});
