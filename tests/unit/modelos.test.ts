// Paridad de las fichas de lectura (E3, regla 20 del kit): una ficha por modelo
// base del roster + el baseline de clase mayoritaria; un párrafo propio por
// variante balanceada; ambos idiomas completos y redactados (no copiados).
import { describe, expect, it } from "vitest";
import { BALANCED_NOTES, FICHAS, type Bilingual } from "@/content/modelos";
import { MLP_MIN_ROWS } from "@/engine/encarrilador";
import { MEMBER_IDS, MEMBERS } from "@/engine/roster";
import { translate } from "@/i18n/translate";

const texts = (value: Bilingual) => [value.es, value.en];

describe("fichas ↔ roster", () => {
  it("una ficha por modelo base (y ninguna de más) + la de clase mayoritaria", () => {
    const bases = [...new Set(MEMBER_IDS.map((id) => MEMBERS[id].base))];
    expect(Object.keys(FICHAS).sort()).toEqual([...bases, "majority"].sort());
  });

  it("cada miembro del roster tiene nombre largo y corto en ES y EN", () => {
    for (const locale of ["es", "en"] as const)
      for (const id of MEMBER_IDS)
        for (const kind of ["model", "short"]) {
          const key = `results.candidates.${kind}.${id}`;
          expect(translate(locale, key), `${locale} ${key}`).not.toBe(key);
        }
  });

  it("la ficha del MLP cita el umbral real del encarrilador", () => {
    expect(FICHAS.mlp.notFor.es).toContain(String(MLP_MIN_ROWS));
    expect(FICHAS.mlp.notFor.en).toContain(String(MLP_MIN_ROWS));
  });

  it("un párrafo propio por variante balanceada, y solo por ellas", () => {
    const balanced = MEMBER_IDS.filter((id) => MEMBERS[id].balanced);
    expect(Object.keys(BALANCED_NOTES).sort()).toEqual([...balanced].sort());
    for (const id of balanced) expect(MEMBERS[id].base).not.toBe(id);
  });
});

describe("fichas bilingües", () => {
  const all: [string, Bilingual][] = [
    ...Object.entries(FICHAS).flatMap(([id, ficha]) =>
      Object.entries(ficha).map(
        ([field, value]) => [`${id}.${field}`, value] as [string, Bilingual],
      ),
    ),
    ...Object.entries(BALANCED_NOTES),
  ];

  it("todo campo trae es y en, no vacíos", () => {
    for (const [, value] of all) {
      for (const text of texts(value))
        expect(text.trim().length).toBeGreaterThan(0);
    }
  });

  it("ningún campo copia el mismo texto en los dos idiomas", () => {
    const copied = all
      .filter(([, value]) => value.es.trim() === value.en.trim())
      .map(([key]) => key);
    expect(copied).toEqual([]);
  });

  it("cada ficha tiene los cinco apartados", () => {
    for (const ficha of Object.values(FICHAS)) {
      expect(Object.keys(ficha).sort()).toEqual(
        ["cost", "goodFor", "notFor", "watch", "what"].sort(),
      );
    }
  });
});
