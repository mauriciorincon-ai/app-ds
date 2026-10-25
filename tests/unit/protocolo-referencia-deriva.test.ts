// Protocolo DS (S15), etapa 10 — la referencia de deriva: las casillas de la etapa 4 sobre el entrenamiento,
// solo agregados. Lo que tiene que valer:
//  · los cortes se redondean a 3 cifras y crecen; las cuentas se hacen con esos cortes y suman las filas;
//  · una categoría con menos de REF_SOPORTE_MIN filas no se nombra (va a «otras»);
//  · solo cuentan las filas que se le pasan (el entrenamiento; la prueba no entra);
//  · NINGÚN VALOR INDIVIDUAL: con valores únicos y sin redondear, ninguno aparece en lo guardado;
//  · lo guardado se lee de vuelta tal cual, y una forma rota se rechaza.
import { describe, expect, it } from "vitest";
import {
  REF_SOPORTE_MIN,
  codificarReferencia,
  cortesRedondeados,
  leerReferencia,
  referenciaColumna,
  type RefColumna,
} from "@/engine/protocolo/referencia-deriva";

const todas = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("los cortes numéricos solo se guardan con soporte (S16, S15 B1)", () => {
  const enteros = (n: number) => todas(n).map((i) => String(10 + i));

  it("con menos de REF_SOPORTE_MIN × 5 filas con valor, un corte sería un valor individual: no se guarda ninguno", () => {
    const pocas = REF_SOPORTE_MIN * 5 - 1;
    const r = referenciaColumna("edad", enteros(pocas), todas(pocas));
    expect(r).toMatchObject({ tipo: "numero", cortes: [], cuentas: [pocas, 0] });
    // y lo guardado no trae ningún valor del CSV
    expect(codificarReferencia(r)).not.toMatch(/"cortes":\[[0-9]/);
  });

  it("con las filas justas, entran los cortes (enteros cortos incluidos) y cada casilla junta al menos REF_SOPORTE_MIN", () => {
    const justas = REF_SOPORTE_MIN * 5;
    const r = referenciaColumna("edad", enteros(justas), todas(justas));
    if (r.tipo !== "numero") throw new Error("debía ser numérica");
    expect(r.cortes.length).toBeGreaterThan(0);
    for (const n of r.cuentas.slice(0, -1)) expect(n).toBeGreaterThanOrEqual(REF_SOPORTE_MIN);
  });
});

describe("la referencia de una numérica", () => {
  it("cortes de quintil con 3 cifras, crecientes, y cuentas que suman las filas (el vacío al final)", () => {
    const crudos = [...todas(99).map((i) => String(1000 + i * 1.2345)), ""];
    const r = referenciaColumna("ingreso", crudos, todas(100));
    expect(r.tipo).toBe("numero");
    if (r.tipo !== "numero") return;
    expect(r.cortes).toHaveLength(4);
    for (const [k, c] of r.cortes.entries()) {
      expect(Number(c.toPrecision(3))).toBe(c);
      if (k > 0) expect(c).toBeGreaterThan(r.cortes[k - 1]!);
    }
    expect(r.cuentas).toHaveLength(6);
    expect(r.cuentas.reduce((s, n) => s + n, 0)).toBe(100);
    expect(r.cuentas[5]).toBe(1);
  });

  it("cortes que el redondeo junta se quedan en uno", () => {
    expect(cortesRedondeados([1.0001, 1.0002, 1.0003, 1.0004, 1.0005])).toEqual([1]);
  });

  it("solo cuentan las filas que se le pasan: las de la prueba no entran", () => {
    const crudos = todas(10).map((i) => (i < 8 ? "1" : "999"));
    const r = referenciaColumna("x", crudos, todas(8));
    expect(r.cuentas.reduce((s, n) => s + n, 0)).toBe(8);
    expect(JSON.stringify(r)).not.toContain("999");
  });
});

describe("la referencia de una columna de texto", () => {
  it("nombra a lo más 4 categorías con soporte; las raras van a «otras»", () => {
    const crudos = [
      ...Array(30).fill("formal"),
      ...Array(20).fill("informal"),
      ...Array(REF_SOPORTE_MIN).fill("independiente"),
      ...Array(REF_SOPORTE_MIN - 1).fill("Juan Pérez"),
      "",
    ];
    const r = referenciaColumna("empleo", crudos, todas(crudos.length));
    expect(r).toEqual({
      columna: "empleo",
      tipo: "texto",
      categorias: ["formal", "informal", "independiente"],
      cuentas: [30, 20, REF_SOPORTE_MIN, REF_SOPORTE_MIN - 1, 1],
    });
    expect(codificarReferencia(r)).not.toContain("Juan");
  });
});

describe("ningún valor individual en lo guardado", () => {
  it("con 200 valores únicos sin redondear, ninguno aparece en la referencia guardada", () => {
    const crudos = todas(200).map((i) => (5000 + i * 7.31357).toFixed(5));
    const guardada = codificarReferencia(referenciaColumna("monto", crudos, todas(200)));
    for (const v of crudos) expect(guardada).not.toContain(v);
  });
});

describe("leer lo guardado", () => {
  const num = referenciaColumna(
    "edad",
    todas(50).map((i) => String(18 + i)),
    todas(50),
  );
  const tex = referenciaColumna(
    "canal",
    todas(40).map((i) => (i % 2 ? "web" : "tienda")),
    todas(40),
  );

  it("se lee de vuelta tal cual", () => {
    expect(leerReferencia(codificarReferencia(num))).toEqual(num);
    expect(leerReferencia(codificarReferencia(tex))).toEqual(tex);
  });

  const roto = (r: RefColumna, cambio: Record<string, unknown>) =>
    JSON.stringify({ ...JSON.parse(codificarReferencia(r)), ...cambio });

  it.each([
    ["no es JSON", "{"],
    ["no es un objeto", "[1,2]"],
    ["una clave de más", roto(num, { extra: 1 })],
    ["sin columna", roto(num, { columna: "" })],
    ["un tipo desconocido", roto(num, { tipo: "fecha" })],
    ["cortes que no crecen", roto(num, { cortes: [30, 20, 40, 50] })],
    ["demasiados cortes", roto(num, { cortes: [1, 2, 3, 4, 5], cuentas: [1, 1, 1, 1, 1, 1, 0] })],
    ["una cuenta negativa", roto(num, { cuentas: [-1, 10, 10, 10, 10, 0] })],
    ["una cuenta que no es entera", roto(num, { cuentas: [1.5, 10, 10, 10, 10, 0] })],
    ["cuentas de otro largo", roto(num, { cuentas: [1, 2] })],
    ["una categoría sin soporte", roto(tex, { cuentas: [REF_SOPORTE_MIN - 1, 20, 0, 0] })],
    ["categorías repetidas", roto(tex, { categorias: ["web", "web"] })],
  ])("rechaza %s", (_, guardada) => {
    expect(leerReferencia(guardada)).toBeNull();
  });
});
