// @vitest-environment node
/**
 * Paridad ES/EN de los diccionarios DIFERIDOS (los que viajan con su pantalla: `estres`, `publica`, y desde el S18 `limpieza`,
 * `exploracion` y `resultados`). `i18n-parity.test.ts` solo compara `es.json` con `en.json` y `textos-etapa.test.ts` solo mira
 * `messages/etapas/`: sin esta prueba, una clave que falta en el inglés de un diccionario diferido aparece cruda en pantalla
 * (auditoría H-05, S18; el hueco venía del S17). Regla 20: el dato nace `{ es, en }` con test automático de paridad.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Nested = { [key: string]: string | Nested };

const CARPETA = "messages";
const leer = (archivo: string): Nested =>
  JSON.parse(readFileSync(join(CARPETA, archivo), "utf8")) as Nested;

function aplanar(diccionario: Nested, prefijo = ""): Record<string, string> {
  return Object.entries(diccionario).reduce<Record<string, string>>(
    (salida, [clave, valor]) => {
      const ruta = prefijo ? `${prefijo}.${clave}` : clave;
      if (typeof valor === "string") salida[ruta] = valor;
      else Object.assign(salida, aplanar(valor, ruta));
      return salida;
    },
    {},
  );
}

/** Los marcadores `{x}` de un texto, ordenados: los dos idiomas deben interpolar lo mismo. */
const marcadores = (texto: string) =>
  [...texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

/** Los pares `<nombre>.es.json` / `<nombre>.en.json` de la carpeta (los de las etapas tienen su propia prueba). */
const NOMBRES = readdirSync(CARPETA)
  .filter((f) => /^[a-z]+\.es\.json$/.test(f))
  .map((f) => f.replace(/\.es\.json$/, ""));

describe("diccionarios diferidos: paridad ES/EN", () => {
  it("se encontraron los diccionarios diferidos conocidos", () => {
    expect(NOMBRES).toEqual(
      expect.arrayContaining([
        "estres",
        "publica",
        "limpieza",
        "exploracion",
        "resultados",
      ]),
    );
  });

  it.each(NOMBRES)(
    "%s: el inglés existe y tiene las mismas claves",
    (nombre) => {
      const es = Object.keys(aplanar(leer(`${nombre}.es.json`))).sort();
      const en = Object.keys(aplanar(leer(`${nombre}.en.json`))).sort();
      expect(en).toEqual(es);
    },
  );

  it.each(NOMBRES)(
    "%s: cada texto interpola los mismos marcadores en los dos idiomas",
    (nombre) => {
      const es = aplanar(leer(`${nombre}.es.json`));
      const en = aplanar(leer(`${nombre}.en.json`));
      const distintos = Object.keys(es)
        .filter(
          (clave) =>
            en[clave] !== undefined &&
            marcadores(es[clave]!).join() !== marcadores(en[clave]!).join(),
        )
        .map(
          (clave) =>
            `${clave}: ${marcadores(es[clave]!)} ≠ ${marcadores(en[clave]!)}`,
        );
      expect(distintos).toEqual([]);
    },
  );

  it.each(NOMBRES)("%s: toda variante `_one` tiene su clave base", (nombre) => {
    const claves = Object.keys(aplanar(leer(`${nombre}.es.json`)));
    const huerfanas = claves.filter(
      (c) => c.endsWith("_one") && !claves.includes(c.replace(/_one$/, "")),
    );
    expect(huerfanas).toEqual([]);
  });
});
