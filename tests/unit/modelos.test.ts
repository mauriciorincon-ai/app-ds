// Paridad de las fichas de lectura (E3, regla 20 del kit): una ficha por modelo
// base del roster + el baseline de clase mayoritaria; un párrafo propio por
// variante balanceada; ambos idiomas completos y redactados (no copiados).
import { describe, expect, it } from "vitest";
import {
  BALANCED_NOTES,
  FICHAS,
  REGRESSION_FICHA_FIELDS,
  REGRESSION_NOTES,
  type Bilingual,
  type FichaId,
  type SharedId,
} from "@/content/modelos";
import { MLP_MIN_ROWS } from "@/engine/encarrilador";
import { thousands } from "@/lib/quantity";
import { AGGLO_MAX_ROWS, HDBSCAN_MIN_CLUSTER_SIZE } from "@/engine/verdict";
import {
  ALL_MEMBER_IDS,
  MEMBER_IDS,
  MEMBERS,
  REGRESSION_MEMBER_IDS,
} from "@/engine/roster";
import { translate } from "@/i18n/translate";

const texts = (value: Bilingual) => [value.es, value.en];

describe("fichas ↔ roster", () => {
  it("una ficha por modelo base (y ninguna de más) + las de los baselines que no compiten", () => {
    // S6: el espacio de ids abarca las dos tareas (linear y lasso solo estiman).
    const bases = [...new Set(ALL_MEMBER_IDS.map((id) => MEMBERS[id].base))];
    expect(Object.keys(FICHAS).sort()).toEqual(
      [...bases, "majority", "median"].sort(),
    );
  });

  it("cada miembro del roster tiene nombre largo y corto en ES y EN", () => {
    for (const locale of ["es", "en"] as const)
      for (const id of ALL_MEMBER_IDS)
        for (const kind of ["model", "short"]) {
          const key = `results.candidates.${kind}.${id}`;
          expect(translate(locale, key), `${locale} ${key}`).not.toBe(key);
        }
  });

  it("S7: las fichas de Agglomerative y HDBSCAN citan las constantes reales", () => {
    expect(FICHAS.agglomerative.notFor.es).toContain(thousands(AGGLO_MAX_ROWS));
    expect(FICHAS.agglomerative.notFor.en).toContain(thousands(AGGLO_MAX_ROWS));
    expect(FICHAS.hdbscan.notFor.es).toContain(` ${HDBSCAN_MIN_CLUSTER_SIZE} filas`);
    expect(FICHAS.hdbscan.notFor.en).toContain(` ${HDBSCAN_MIN_CLUSTER_SIZE} rows`);
    // design-system R9: miles con coma en los dos idiomas (la app escribe «0.88»).
    expect(thousands(8000)).toBe("8,000");
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

  it("S6: un párrafo de regresión por modelo que compite en las dos tareas, y solo por ellos", () => {
    const shared = REGRESSION_MEMBER_IDS.filter((id) =>
      (MEMBER_IDS as readonly string[]).includes(id),
    );
    expect(Object.keys(REGRESSION_NOTES).sort()).toEqual([...shared].sort());
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
    ...Object.entries(REGRESSION_NOTES).map(
      ([id, value]) => [`regression.${id}`, value] as [string, Bilingual],
    ),
    ...Object.entries(REGRESSION_FICHA_FIELDS).flatMap(([id, fields]) =>
      Object.entries(fields ?? {}).map(
        ([field, value]) =>
          [`regressionField.${id}.${field}`, value] as [string, Bilingual],
      ),
    ),
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

describe("al estimar, las fichas compartidas hablan de estimar (AU-S6-19)", () => {
  it("ninguna ficha compartida, con sus reemplazos y su párrafo, habla de clases, votos ni probabilidad", () => {
    const CLASSIFY =
      /\bclases?\b|probabilidad|\bAUC\b|\bvot(a|ar|ación|o|os)\b|frontera|\bclass(es)?\b|probabilit|\bvot(e|es|ing)\b|boundary/i;
    for (const id of Object.keys(REGRESSION_NOTES) as SharedId[]) {
      const ficha = {
        ...FICHAS[MEMBERS[id].base as FichaId],
        ...REGRESSION_FICHA_FIELDS[id],
      };
      const fields: [string, Bilingual][] = [
        ...Object.entries(ficha),
        ["nota", REGRESSION_NOTES[id]],
      ];
      for (const [field, value] of fields)
        for (const text of texts(value))
          expect(text, `${id}.${field}`).not.toMatch(CLASSIFY);
    }
  });
});
