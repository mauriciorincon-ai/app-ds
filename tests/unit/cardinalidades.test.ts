/**
 * S7 (AU-S7-03; `/audita-sprint` casilla 7): ninguna cifra cableada en el copy donde el dato dice N.
 * Cuántas tareas, cuántos agrupadores, cuántas categorías caben y el límite del CSV salen de sus
 * constantes (`MULTICLASS_MAX_CLASSES`, `CLUSTER_MEMBER_IDS`, `MAX_BYTES`, `MAX_ROWS`); el copy dice
 * «estas tareas», «los demás agrupadores» o recibe la cifra como parámetro. Si una constante cambia,
 * el texto no puede quedarse mintiendo.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MULTICLASS_MAX_CLASSES } from "@/engine/tarea";
import { translate } from "@/i18n/translate";
import { MAX_ROWS } from "@/lib/ds/csv";
import { MAX_MODEL_FILE_BYTES } from "@/lib/model-file";
import { csvLimitParams, thousands } from "@/lib/quantity";

const CARDINALES = [
  /\b(hasta|up to) \d/i,
  /\b\d+ MB\b/,
  /\b(dos|tres|cuatro|cinco|two|three|four|five) (tareas|agrupadores|tasks|clusterers)\b/i,
  /\b(otros tres|other three)\b/i,
  // S7: el tope de filas escrito a mano («50 000 filas», con espacio de miles además).
  /\b\d{1,3}(?:[ \u00a0.,]\d{3})+\s(filas|rows)\b/,
  /\b\d{4,}\s(filas|rows)\b/,
];

function textos(valor: unknown, ruta = ""): [string, string][] {
  if (typeof valor === "string") return [[ruta, valor]];
  if (valor && typeof valor === "object")
    return Object.entries(valor).flatMap(([k, v]) =>
      textos(v, ruta ? `${ruta}.${k}` : k),
    );
  return [];
}

describe("cardinalidades: el copy no fija cifras que vienen de los datos (casilla 7)", () => {
  it.each(["es", "en"])(
    "messages/%s.json no cablea cuántas tareas, agrupadores, categorías ni el límite",
    (idioma) => {
      const mensajes = JSON.parse(
        readFileSync(`messages/${idioma}.json`, "utf8"),
      ) as unknown;
      const cableadas = textos(mensajes).filter(([, texto]) =>
        CARDINALES.some((re) => re.test(texto)),
      );
      expect(
        cableadas.map(([ruta, texto]) => `${ruta}: ${texto}`),
        "cifras cableadas en el copy",
      ).toEqual([]);
    },
  );

  it.each(["es", "en"] as const)(
    "en %s, las cifras que se muestran salen de sus constantes",
    (idioma) => {
      expect(
        translate(idioma, "config.target.help", {
          max: MULTICLASS_MAX_CLASSES,
        }),
      ).toContain(String(MULTICLASS_MAX_CLASSES));
      expect(
        translate(idioma, "modelcard.limits.tasks", {
          max: MULTICLASS_MAX_CLASSES,
        }),
      ).toContain(String(MULTICLASS_MAX_CLASSES));
      const hint = translate(idioma, "start.dropzone.hint", csvLimitParams());
      expect(hint).toContain(`${csvLimitParams().mb} MB`);
      // Las filas con la regla de cifras de la app (R9): miles con coma en los dos idiomas.
      expect(hint).toContain(thousands(MAX_ROWS));
      expect(thousands(MAX_ROWS)).toBe("50,000");
      expect(
        translate(idioma, "errors.csv-too-many-rows", csvLimitParams()),
      ).toContain(thousands(MAX_ROWS));
      expect(
        translate(idioma, "start.import.errors.file-too-large", {
          mb: MAX_MODEL_FILE_BYTES / (1024 * 1024),
        }),
      ).toContain(`${MAX_MODEL_FILE_BYTES / (1024 * 1024)} MB`);
    },
  );
});
