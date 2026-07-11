import { describe, expect, it } from "vitest";
import { checkSchema, modelFeatures } from "@/lib/ds/schema-check";
import type { ModelSchema } from "@/workers/protocol";

const SCHEMA: ModelSchema = {
  numeric: ["edad", "ingreso"],
  categorical: ["region", "dispositivo"],
  target: "convirtio",
  classes: ["no", "si"],
  positive_class: "si",
};

describe("checkSchema", () => {
  it("acepta un CSV con exactamente las columnas del modelo", () => {
    const check = checkSchema(
      ["edad", "ingreso", "region", "dispositivo"],
      SCHEMA,
    );
    expect(check).toEqual({
      ok: true,
      missing: [],
      extra: [],
      targetPresent: false,
    });
  });

  it("el orden de las columnas del CSV es irrelevante", () => {
    const check = checkSchema(
      ["dispositivo", "edad", "region", "ingreso"],
      SCHEMA,
    );
    expect(check.ok).toBe(true);
    expect(check.missing).toEqual([]);
  });

  it("bloquea nombrando EXACTAMENTE las faltantes, en orden del esquema", () => {
    const check = checkSchema(["edad", "dispositivo"], SCHEMA);
    expect(check.ok).toBe(false);
    // ingreso (numérica) antes que region (categórica): orden del esquema.
    expect(check.missing).toEqual(["ingreso", "region"]);
  });

  it("bloquea aunque el CSV traiga extras u objetivo (faltantes mandan)", () => {
    const check = checkSchema(["edad", "convirtio", "otra"], SCHEMA);
    expect(check.ok).toBe(false);
    expect(check.missing).toEqual(["ingreso", "region", "dispositivo"]);
    expect(check.extra).toEqual(["otra"]);
    expect(check.targetPresent).toBe(true);
  });

  it("columnas extra ⇒ aviso (en orden del CSV) y NO bloquean", () => {
    const check = checkSchema(
      ["zzz", "edad", "ingreso", "region", "dispositivo", "aaa"],
      SCHEMA,
    );
    expect(check.ok).toBe(true);
    expect(check.extra).toEqual(["zzz", "aaa"]);
  });

  it("objetivo presente ⇒ aviso (no cuenta como extra) y NO bloquea", () => {
    const check = checkSchema(
      ["edad", "ingreso", "region", "dispositivo", "convirtio"],
      SCHEMA,
    );
    expect(check.ok).toBe(true);
    expect(check.targetPresent).toBe(true);
    expect(check.extra).toEqual([]);
  });

  it("CSV sin ninguna columna del modelo ⇒ todas faltantes", () => {
    const check = checkSchema(["x", "y"], SCHEMA);
    expect(check.ok).toBe(false);
    expect(check.missing).toEqual(modelFeatures(SCHEMA));
  });
});

describe("modelFeatures", () => {
  it("devuelve numéricas y luego categóricas (determinista)", () => {
    expect(modelFeatures(SCHEMA)).toEqual([
      "edad",
      "ingreso",
      "region",
      "dispositivo",
    ]);
  });
});
