// Protocolo DS (S15), etapa 10 (G-Plan 2a) — el chequeo de deriva de un CSV nuevo contra la referencia. Lo que
// tiene que valer (criterio de fin del sprint):
//  · el mismo CSV del kit contra su referencia da «estable» en todas sus columnas y el veredicto «sigue»;
//  · con una columna desplazada, esa columna da «alerta» y el veredicto es «reentrenar»;
//  · sin una columna del modelo no se mide, y se nombra; con pocas filas o con otro tipo, «revisar»;
//  · las bandas son las de la etapa 4 (0,10 y 0,25).
import { describe, expect, it } from "vitest";
import {
  chequearColumna,
  chequearDeriva,
  estadoDePsi,
  veredictoDe,
} from "@/engine/protocolo/chequeo-deriva";
import { referenciasDeriva, type RefColumna } from "@/engine/protocolo/referencia-deriva";
import type { CsvTable } from "@/lib/ds/csv";
import { tablaKit } from "./protocolo-etapa4-helpers";

const CREDITO = tablaKit("credito-fuga-plantada.csv");
const COLUMNAS = ["ingreso_mensual", "monto_prestamo", "puntaje_credito", "empleo"];
// las primeras 160 filas hacen de entrenamiento (la prueba no entra a la referencia)
const REFERENCIAS = referenciasDeriva(
  CREDITO,
  COLUMNAS,
  Array.from({ length: 160 }, (_, i) => i),
);

const conColumna = (
  tabla: CsvTable,
  columna: string,
  cambio: (v: string) => string,
): CsvTable => {
  const j = tabla.headers.indexOf(columna);
  return {
    headers: tabla.headers,
    rows: tabla.rows.map((fila) => fila.map((v, k) => (k === j ? cambio(v) : v))),
  };
};

describe("una referencia sin con qué comparar se dice, no se mide «estable» (S16, S15 M2 y B1)", () => {
  const nuevo = Array.from({ length: 30 }, (_, i) => String(i));

  it("un texto sin categorías con soporte (un código casi único) da «sin referencia» y el veredicto es «revisa»", () => {
    const sinCategorias: RefColumna = { columna: "codigo", tipo: "texto", categorias: [], cuentas: [40, 0] };
    const r = chequearColumna(sinCategorias, nuevo.map((i) => `c${i}`));
    expect(r).toMatchObject({ columna: "codigo", estado: "sin-referencia", psi: null });
    expect(veredictoDe([r])).toBe("revisar");
  });

  it("una numérica sin cortes (pocas filas de entrenamiento) tampoco se mide «estable»", () => {
    const sinCortes: RefColumna = { columna: "edad", tipo: "numero", cortes: [], cuentas: [12, 0] };
    const r = chequearColumna(sinCortes, nuevo);
    expect(r).toMatchObject({ columna: "edad", estado: "sin-referencia", psi: null });
    expect(veredictoDe([r])).toBe("revisar");
  });
});

describe("el chequeo de deriva con un CSV nuevo", () => {
  it("el mismo CSV del kit da «estable» en todas sus columnas: el plan sigue", () => {
    const r = chequearDeriva(REFERENCIAS, CREDITO);
    expect(r.tipo).toBe("medido");
    if (r.tipo !== "medido") return;
    expect(r.columnas.map((c) => c.estado)).toEqual(COLUMNAS.map(() => "estable"));
    expect(r.veredicto).toBe("sigue");
    expect(r.filas).toBe(CREDITO.rows.length);
  });

  it("con el ingreso desplazado, esa columna da «alerta» y el plan dice reentrenar", () => {
    const nueva = conColumna(CREDITO, "ingreso_mensual", (v) => String(Number(v) * 3));
    const r = chequearDeriva(REFERENCIAS, nueva);
    if (r.tipo !== "medido") throw new Error(r.tipo);
    const porColumna = Object.fromEntries(r.columnas.map((c) => [c.columna, c.estado]));
    expect(porColumna).toEqual({
      ingreso_mensual: "alerta",
      monto_prestamo: "estable",
      puntaje_credito: "estable",
      empleo: "estable",
    });
    expect(r.veredicto).toBe("reentrenar");
  });

  it("sin una columna del modelo no se mide, y la nombra", () => {
    const sinEmpleo: CsvTable = {
      headers: CREDITO.headers.filter((h) => h !== "empleo"),
      rows: CREDITO.rows.map((f) => f.filter((_, k) => CREDITO.headers[k] !== "empleo")),
    };
    expect(chequearDeriva(REFERENCIAS, sinEmpleo)).toEqual({
      tipo: "faltan-columnas",
      faltan: ["empleo"],
    });
  });

  it("con pocas filas no inventa una alerta: «pocas filas» y el plan dice revisar", () => {
    const corta: CsvTable = { headers: CREDITO.headers, rows: CREDITO.rows.slice(0, 5) };
    const r = chequearDeriva(REFERENCIAS, corta);
    if (r.tipo !== "medido") throw new Error(r.tipo);
    expect(new Set(r.columnas.map((c) => c.estado))).toEqual(new Set(["pocas-filas"]));
    expect(r.columnas.every((c) => c.psi === null)).toBe(true);
    expect(r.veredicto).toBe("revisar");
  });

  it("una numérica que llega como texto es «otro tipo»: revisar", () => {
    const nueva = conColumna(CREDITO, "puntaje_credito", () => "alto");
    const r = chequearDeriva(REFERENCIAS, nueva);
    if (r.tipo !== "medido") throw new Error(r.tipo);
    expect(r.columnas.find((c) => c.columna === "puntaje_credito")?.estado).toBe("otro-tipo");
    expect(r.veredicto).toBe("revisar");
  });
});

describe("las bandas y el veredicto", () => {
  it.each([
    [0, "estable"],
    [0.0999, "estable"],
    [0.1, "moderada"],
    [0.2499, "moderada"],
    [0.25, "alerta"],
  ] as const)("PSI %s es %s", (psi, estado) => {
    expect(estadoDePsi(psi)).toBe(estado);
  });

  it("una moderada basta para revisar; una alerta, para reentrenar", () => {
    const c = (estado: "estable" | "moderada" | "alerta") => ({
      columna: "x",
      estado,
      psi: 0,
      filas: 100,
    });
    expect(veredictoDe([c("estable"), c("moderada")])).toBe("revisar");
    expect(veredictoDe([c("moderada"), c("alerta")])).toBe("reentrenar");
    expect(veredictoDe([c("estable")])).toBe("sigue");
  });
});
