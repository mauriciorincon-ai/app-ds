// Protocolo DS (S10), etapa 5 — la regla de hoy: operadores, vacíos que no cumplen, «y» / «o», números
// en su única forma canónica, y lo que se rechaza (más de dos condiciones, operador de otro tipo).
import { describe, expect, it } from "vitest";
import {
  CONDICIONES_MAX,
  VALOR_MAX,
  esNumeroCanonico,
  evaluarRegla,
  numeroCanonico,
  operadoresDe,
  problemaDeCondicion,
  type Condicion,
} from "@/engine/protocolo/regla";
import { vistaColumna, type VistaColumna } from "@/engine/protocolo/tabla";

const numeros = (...celdas: string[]) => vistaColumna("x", celdas);
const textos = (...celdas: string[]) => vistaColumna("t", celdas);
const todas = (n: number) => Array.from({ length: n }, (_, i) => i);
const cond = (operador: string, valor: string): Condicion => ({
  columna: "x",
  operador,
  valor,
});

describe("los números, en su única forma", () => {
  it.each([
    ["1500.5", true],
    ["-3", true],
    ["0", true],
    ["1e+21", true],
    ["1e21", false],
    ["1500.50", false],
    ["+5", false],
    ["1,5", false],
    ["1.500,5", false],
    [" 5", false],
    ["", false],
    ["0x10", false],
    ["Infinity", false],
    ["abc", false],
  ])("«%s» canónico: %s", (texto, esperado) => {
    expect(esNumeroCanonico(texto)).toBe(esperado);
  });

  it("lo que se escribe se lleva a su forma canónica, y lo ambiguo se rechaza", () => {
    expect(numeroCanonico("1500.50")).toBe("1500.5");
    expect(numeroCanonico(" +5 ")).toBe("5");
    expect(numeroCanonico(".5")).toBe("0.5");
    expect(numeroCanonico("1e3")).toBe("1000");
    // la coma es decimal en unos países y miles en otros: no se adivina
    expect(numeroCanonico("1,5")).toBeNull();
    expect(numeroCanonico("1.500,5")).toBeNull();
    expect(numeroCanonico("")).toBeNull();
    expect(numeroCanonico("0x10")).toBeNull();
    expect(numeroCanonico("NaN")).toBeNull();
  });
});

describe("qué operadores admite cada columna", () => {
  it("un número admite seis; el texto, solo «=» y «≠»", () => {
    expect(operadoresDe("numero")).toEqual(["<", "<=", ">", ">=", "=", "!="]);
    expect(operadoresDe("texto")).toEqual(["=", "!="]);
  });

  it("problemas: operador de otro tipo, número mal escrito, texto con espacios o vacío o enorme", () => {
    expect(problemaDeCondicion("texto", "<", "a")).toBe("operador");
    expect(problemaDeCondicion("numero", "~", "5")).toBe("operador");
    expect(problemaDeCondicion("numero", "<", "5,5")).toBe("valor");
    expect(problemaDeCondicion("texto", "=", "")).toBe("valor");
    expect(problemaDeCondicion("texto", "=", " a")).toBe("valor");
    expect(problemaDeCondicion("texto", "=", "a".repeat(VALOR_MAX + 1))).toBe(
      "valor",
    );
    expect(problemaDeCondicion("numero", ">=", "5")).toBeNull();
    expect(problemaDeCondicion("texto", "!=", "informal")).toBeNull();
  });
});

describe("evaluar la regla", () => {
  const edades = numeros("20", "30", "40", "50", "60");

  it.each([
    ["<", "40", [true, true, false, false, false]],
    ["<=", "40", [true, true, true, false, false]],
    [">", "40", [false, false, false, true, true]],
    [">=", "40", [false, false, true, true, true]],
    ["=", "40", [false, false, true, false, false]],
    ["!=", "40", [true, true, false, true, true]],
  ])("un número %s %s", (operador, valor, esperado) => {
    const m = evaluarRegla([edades], [cond(operador, valor)], "", todas(5))!;
    expect(m.cumple).toEqual(esperado);
    expect(m.nCumple).toBe(esperado.filter(Boolean).length);
    expect(m.vacios).toBe(0);
  });

  it("el texto se compara exacto: las mayúsculas cuentan, los espacios de los extremos no", () => {
    const plan = textos("Basico", "basico", " basico ", "premium");
    const igual = evaluarRegla([plan], [cond("=", "basico")], "", todas(4))!;
    expect(igual.cumple).toEqual([false, true, true, false]);
    const distinto = evaluarRegla(
      [plan],
      [cond("!=", "basico")],
      "",
      todas(4),
    )!;
    expect(distinto.cumple).toEqual([true, false, false, true]);
  });

  it("una celda vacía NUNCA cumple: ni «≠» ni «no es», y se cuenta", () => {
    const con = numeros("20", "", "40", "NA");
    const m = evaluarRegla([con], [cond("!=", "40")], "", todas(4))!;
    expect(m.cumple).toEqual([true, false, false, false]);
    expect(m.vacios).toBe(2);
    const t = textos("a", "", "b");
    const n = evaluarRegla([t], [cond("!=", "a")], "", todas(3))!;
    expect(n.cumple).toEqual([false, false, true]);
    expect(n.vacios).toBe(1);
  });

  it("una columna numérica con basura la lee como vacía (la regla de coerción del Protocolo)", () => {
    const sucia = numeros(...Array(9).fill("10"), "error");
    expect(sucia.tipo).toBe("numero");
    const m = evaluarRegla([sucia], [cond("=", "10")], "", todas(10))!;
    expect(m.nCumple).toBe(9);
    expect(m.vacios).toBe(1);
  });

  it("dos condiciones: «y» pide las dos, «o» basta una; una vacía en «o» no anula a la otra", () => {
    const x = numeros("20", "", "40", "60");
    const t = textos("a", "a", "b", "");
    const c2: Condicion[] = [
      { columna: "x", operador: "<", valor: "50" },
      { columna: "t", operador: "=", valor: "a" },
    ];
    const y = evaluarRegla([x, t], c2, "y", todas(4))!;
    expect(y.cumple).toEqual([true, false, false, false]);
    const o = evaluarRegla([x, t], c2, "o", todas(4))!;
    expect(o.cumple).toEqual([true, true, true, false]);
    // filas con alguna columna sin valor: la 2 (x vacía) y la 4 (t vacía)
    expect(y.vacios).toBe(2);
    expect(o.vacios).toBe(2);
  });

  it("mide solo las filas que se piden, en ese orden", () => {
    const m = evaluarRegla([edades], [cond(">", "35")], "", [4, 0, 2])!;
    expect(m.cumple).toEqual([true, false, true]);
  });

  it("una regla mal escrita no se mide", () => {
    expect(evaluarRegla([edades], [], "", todas(5))).toBeNull();
    expect(CONDICIONES_MAX).toBe(2);
    const tres = [cond("<", "1"), cond("<", "2"), cond("<", "3")];
    expect(
      evaluarRegla([edades, edades, edades], tres, "y", todas(5)),
    ).toBeNull();
    // una condición no lleva unión; dos la exigen
    expect(evaluarRegla([edades], [cond("<", "1")], "y", todas(5))).toBeNull();
    expect(
      evaluarRegla(
        [edades, edades],
        [cond("<", "1"), cond("<", "2")],
        "",
        todas(5),
      ),
    ).toBeNull();
    // operador de número en una columna de texto, y valor mal escrito
    const t: VistaColumna = textos("a", "b");
    expect(evaluarRegla([t], [cond("<", "a")], "", todas(2))).toBeNull();
    expect(evaluarRegla([edades], [cond("<", "1,5")], "", todas(5))).toBeNull();
    // una vista por condición
    expect(evaluarRegla([], [cond("<", "1")], "", todas(5))).toBeNull();
  });
});
