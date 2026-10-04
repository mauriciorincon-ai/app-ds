import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import es from "../../messages/es.json";

type Nested = { [key: string]: string | Nested };

// Aplana un diccionario anidado a rutas con notación de punto ("app.name").
function flattenKeys(dictionary: Nested, prefix = ""): string[] {
  return Object.entries(dictionary).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : flattenKeys(value, path);
  });
}

describe("paridad de claves i18n", () => {
  it("es.json y en.json tienen exactamente el mismo conjunto de claves", () => {
    const esKeys = flattenKeys(es as Nested).sort();
    const enKeys = flattenKeys(en as Nested).sort();
    expect(esKeys).toEqual(enKeys);
  });
});

describe("plural mínimo (S5): `<clave>_one` con count === 1", () => {
  it("usa la variante singular cuando existe, en ambos idiomas", async () => {
    const { translate } = await import("@/i18n/translate");
    expect(translate("es", "league.title", { count: 1 })).toBe(
      "La liga: 1 modelo",
    );
    expect(translate("en", "league.title", { count: 1 })).toBe(
      "The league: 1 model",
    );
    expect(translate("es", "league.title", { count: 2 })).toBe(
      "La liga: 2 modelos",
    );
    // Sin variante `_one`, la clave normal (no la clave cruda).
    expect(translate("es", "roster.out", { count: 1 })).toContain("1");
  });

  it("toda `_one` tiene su clave base (no hay singulares huérfanos)", () => {
    const keys = flattenKeys(es as Nested);
    const orphans = keys
      .filter((key) => key.endsWith("_one"))
      .filter((key) => !keys.includes(key.replace(/_one$/, "")));
    expect(orphans).toEqual([]);
  });
});
