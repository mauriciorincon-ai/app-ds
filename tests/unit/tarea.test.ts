// E1 — encarrilador de la tarea (S5): cada tipo de columna con su razón.
import { describe, expect, it } from "vitest";
import {
  AMBIGUOUS_MAX_DISTINCT,
  detectTask,
  isTrainable,
  MULTICLASS_MAX_CLASSES,
} from "@/engine/tarea";

const repeat = (values: string[], times: number) =>
  Array.from({ length: times }, () => values).flat();

describe("detectTask (E1)", () => {
  it("binaria: exactamente dos valores (los nulos no cuentan)", () => {
    expect(detectTask(["si", "no", "si", "NA", ""])).toEqual({
      task: "binaria",
      reason: "two-values",
      distinct: 2,
    });
    // En numéricas, «1» y «1.0» son el mismo valor.
    expect(detectTask(["0", "1", "1.0", "0.0"]).task).toBe("binaria");
  });

  it("multiclase: texto con pocas categorías", () => {
    expect(detectTask(repeat(["norte", "sur", "este"], 4))).toEqual({
      task: "multiclase",
      reason: "few-categories",
      distinct: 3,
    });
  });

  it("numérica: números con muchos valores distintos", () => {
    const values = Array.from({ length: 40 }, (_, i) => String(i * 1.5));
    expect(detectTask(values)).toEqual({
      task: "numerica",
      reason: "many-numbers",
      distinct: 40,
    });
  });

  it("ambigua: pocos números distintos — sugiere multiclase si son enteros, numérica si no", () => {
    expect(detectTask(repeat(["1", "2", "3", "4", "5"], 3))).toEqual({
      task: "ambigua",
      reason: "few-numbers",
      distinct: 5,
      suggested: "multiclase",
    });
    expect(detectTask(repeat(["0.5", "1.5", "2.5"], 3)).suggested).toBe(
      "numerica",
    );
    // El umbral es exacto: AMBIGUOUS_MAX_DISTINCT ambigua, uno más numérica.
    const upTo = (n: number) => Array.from({ length: n }, (_, i) => String(i));
    expect(detectTask(upTo(AMBIGUOUS_MAX_DISTINCT)).task).toBe("ambigua");
    expect(detectTask(upTo(AMBIGUOUS_MAX_DISTINCT + 1)).task).toBe("numerica");
  });

  it("sin objetivo: constante, vacía o con demasiadas categorías (identificador)", () => {
    expect(detectTask(["a", "a", " a "])).toMatchObject({
      task: "sin-objetivo",
      reason: "constant",
    });
    expect(detectTask(["", "NA", "null"])).toMatchObject({
      task: "sin-objetivo",
      reason: "empty",
      distinct: 0,
    });
    const ids = Array.from(
      { length: MULTICLASS_MAX_CLASSES + 1 },
      (_, i) => `c-${i}`,
    );
    expect(detectTask(ids)).toMatchObject({
      task: "sin-objetivo",
      reason: "too-many-categories",
    });
    expect(detectTask(ids.slice(0, MULTICLASS_MAX_CLASSES)).task).toBe(
      "multiclase",
    );
  });

  it("entrenan la binaria, la cantidad (S6) y varias categorías (S7); una columna sin objetivo, no", () => {
    expect(isTrainable(detectTask(["si", "no"]))).toBe(true);
    const many = Array.from({ length: 30 }, (_, i) => String(i * 1.5));
    expect(isTrainable(detectTask(many))).toBe(true);
    expect(isTrainable(detectTask(["a", "b", "c"]))).toBe(true);
    expect(isTrainable(detectTask(["a", "a"]))).toBe(false);
  });
});
