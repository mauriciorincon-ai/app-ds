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
