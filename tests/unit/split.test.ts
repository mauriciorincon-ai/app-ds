import { describe, expect, it } from "vitest";
import { stratifiedSplit } from "@/engine/split";

// Construye labels con `nZeros` ceros seguidos de `nOnes` unos.
function makeLabels(nZeros: number, nOnes: number): (0 | 1)[] {
  return [...Array<0 | 1>(nZeros).fill(0), ...Array<0 | 1>(nOnes).fill(1)];
}

describe("stratifiedSplit", () => {
  it("es determinista: el mismo seed produce el mismo split", () => {
    const labels = makeLabels(80, 20);
    const a = stratifiedSplit(labels, 0.25, 42);
    const b = stratifiedSplit(labels, 0.25, 42);
    expect(a).toEqual(b);
  });

  it("no hay solapamiento y la unión cubre todos los índices exactamente una vez", () => {
    const labels = makeLabels(70, 30);
    const { trainIdx, testIdx } = stratifiedSplit(labels, 0.3, 7);
    const all = [...trainIdx, ...testIdx].sort((x, y) => x - y);
    expect(all).toEqual(Array.from({ length: 100 }, (_, i) => i));
    const overlap = trainIdx.filter((i) => testIdx.includes(i));
    expect(overlap).toEqual([]);
  });

  it("preserva la proporción de clases (estratificado)", () => {
    const labels = makeLabels(80, 20);
    const { testIdx } = stratifiedSplit(labels, 0.25, 1);
    const onesInTest = testIdx.filter((i) => labels[i] === 1).length;
    const zerosInTest = testIdx.filter((i) => labels[i] === 0).length;
    // 80*0.25 = 20 ceros ; 20*0.25 = 5 unos
    expect(zerosInTest).toBe(20);
    expect(onesInTest).toBe(5);
  });

  it("cada clase con ≥2 muestras aporta al menos 1 a train y 1 a test", () => {
    const labels = makeLabels(3, 2);
    const { trainIdx, testIdx } = stratifiedSplit(labels, 0.25, 3);
    const onesInTest = testIdx.filter((i) => labels[i] === 1).length;
    const onesInTrain = trainIdx.filter((i) => labels[i] === 1).length;
    expect(onesInTest).toBeGreaterThanOrEqual(1);
    expect(onesInTrain).toBeGreaterThanOrEqual(1);
  });

  it("una clase con una sola muestra va a train", () => {
    const labels: (0 | 1)[] = [0, 0, 0, 0, 1];
    const { trainIdx, testIdx } = stratifiedSplit(labels, 0.25, 9);
    const singleton = labels.indexOf(1);
    expect(trainIdx).toContain(singleton);
    expect(testIdx).not.toContain(singleton);
  });

  it("acepta labels de tipo string", () => {
    const labels = ["a", "a", "a", "a", "b", "b", "b", "b"];
    const { trainIdx, testIdx } = stratifiedSplit(labels, 0.5, 5);
    expect(trainIdx.length + testIdx.length).toBe(8);
    expect(testIdx.filter((i) => labels[i] === "b").length).toBe(2);
  });

  it("lanza error con labels vacío", () => {
    expect(() => stratifiedSplit([], 0.25, 1)).toThrow(/vacío/);
  });

  it.each([0, 1, -0.1, 1.5, NaN])(
    "lanza error con testSize fuera de (0,1): %s",
    (testSize) => {
      expect(() => stratifiedSplit(makeLabels(5, 5), testSize, 1)).toThrow(
        /testSize/,
      );
    },
  );
});
