// Protocolo DS (S13, G-Plan 1a): los textos que solo usa la forma de cada etapa 4–8 viajan con el chunk de esa
// forma (messages/etapas/etapaN.{es,en}.json), no con el diccionario de la página. Lo que tiene que valer:
//  · cada par es-en tiene las mismas claves y los mismos marcadores {…};
//  · una clave vive en un solo sitio: la de la forma no está también en el diccionario global;
//  · cada clave que una forma pide existe, en los dos idiomas, en sus textos o en el global (sin clave cruda);
//  · cada clave que pintan el cuaderno, el mapa de etapas o los avisos sigue en el global: lo que se movió
//    nunca lo necesitaba la página;
//  · `textoPropio` sale de los textos de la forma y, si no están, deja que el global conteste.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TEXTOS_ETAPA_4 } from "@/components/protocolo/textos/etapa4";
import { TEXTOS_ETAPA_5 } from "@/components/protocolo/textos/etapa5";
import { TEXTOS_ETAPA_6 } from "@/components/protocolo/textos/etapa6";
import { TEXTOS_ETAPA_7 } from "@/components/protocolo/textos/etapa7";
import { TEXTOS_ETAPA_8 } from "@/components/protocolo/textos/etapa8";
import { TEXTOS_ETAPA_9 } from "@/components/protocolo/textos/etapa9";
import { TEXTOS_ETAPA_10 } from "@/components/protocolo/textos/etapa10";
import type { Dictionary } from "@/i18n/dictionaries";
import { textoPropio, type TextosEtapa } from "@/i18n/textos-etapa";
import { resolve } from "@/i18n/translate";
import en from "../../messages/en.json";
import es from "../../messages/es.json";

const IDIOMAS = ["es", "en"] as const;
const GLOBAL: Record<(typeof IDIOMAS)[number], Dictionary> = { es, en };

const ETAPAS: Record<number, { textos: TextosEtapa; formas: string[] }> = {
  4: {
    textos: TEXTOS_ETAPA_4,
    formas: ["Etapa4Form", "Etapa4Inventario", "Etapa4Revelacion"],
  },
  5: { textos: TEXTOS_ETAPA_5, formas: ["Etapa5Form"] },
  6: { textos: TEXTOS_ETAPA_6, formas: ["Etapa6Form"] },
  7: { textos: TEXTOS_ETAPA_7, formas: ["Etapa7Form"] },
  8: { textos: TEXTOS_ETAPA_8, formas: ["Etapa8Form"] },
  9: { textos: TEXTOS_ETAPA_9, formas: ["Etapa9Form"] },
  // S15: la forma, la constancia de la etapa cumplida y el chequeo de deriva (la ficha se dice desde lib/)
  10: {
    textos: TEXTOS_ETAPA_10,
    formas: ["Etapa10Form", "Etapa10Constancia", "Etapa10Deriva"],
  },
};

/** Lo que la página pinta sola (el cuaderno, el mapa de etapas, los avisos): tiene que seguir en el global. */
const DE_LA_PAGINA = [
  "CuadernoPanel",
  "Etapas",
  "formulario-base",
  "regla-texto",
  "segmento-texto",
];

function planas(d: Dictionary, prefijo = ""): [string, string][] {
  return Object.entries(d).flatMap(([k, v]) => {
    const ruta = prefijo ? `${prefijo}.${k}` : k;
    return typeof v === "string" ? [[ruta, v]] : planas(v, ruta);
  });
}
const marcadores = (t: string) =>
  [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const fuente = (nombre: string) => {
  const ts = `src/components/protocolo/${nombre}.ts`;
  try {
    return readFileSync(`${ts}x`, "utf8");
  } catch {
    return readFileSync(ts, "utf8");
  }
};

/** Las claves `protocol.stage.N.…` que una fuente pide: literales, y prefijos de las que arma con `${…}`. */
export function clavesPedidas(codigo: string, ayudanteK?: number) {
  const literales = new Set<string>();
  const prefijos = new Set<string>();
  for (const m of codigo.matchAll(/(["'`])(protocol\.stage\.\d+\.[\w.\-]+)\1/g))
    literales.add(m[2]!);
  for (const m of codigo.matchAll(/`(protocol\.stage\.\d+\.[^`$]*)\$\{/g))
    prefijos.add(m[1]!);
  if (ayudanteK !== undefined) {
    // `const k = (clave) => \`protocol.stage.4.${clave}\``: sus llamadas con texto o con plantilla
    for (const m of codigo.matchAll(/\bk\(\s*(["'`])([^"'`$]+)\1/g))
      literales.add(`protocol.stage.${ayudanteK}.${m[2]}`);
    for (const m of codigo.matchAll(/\bk\(\s*`([^`$]*)\$\{/g))
      prefijos.add(`protocol.stage.${ayudanteK}.${m[1]}`);
  }
  return { literales: [...literales], prefijos: [...prefijos] };
}

describe("los textos de cada forma (messages/etapas/)", () => {
  for (const [n, { textos }] of Object.entries(ETAPAS)) {
    it(`etapa ${n}: es y en tienen las mismas claves y los mismos marcadores`, () => {
      const a = new Map(planas(textos.es));
      const b = new Map(planas(textos.en));
      expect([...a.keys()].sort()).toEqual([...b.keys()].sort());
      for (const [clave, texto] of a)
        expect(marcadores(b.get(clave)!), clave).toEqual(marcadores(texto));
      expect(a.size, "la etapa no movió nada").toBeGreaterThan(10);
    });

    it(`etapa ${n}: ninguna clave de la forma sigue también en el diccionario global`, () => {
      for (const l of IDIOMAS) {
        const global = new Set(planas(GLOBAL[l]).map(([k]) => k));
        const repetidas = planas(textos[l])
          .map(([k]) => k)
          .filter((k) => global.has(k));
        expect(repetidas, `${l} etapa ${n}`).toEqual([]);
      }
    });
  }

  it("cada clave que una forma pide existe en sus textos o en el global, en los dos idiomas", () => {
    const faltan: string[] = [];
    for (const [n, { textos, formas }] of Object.entries(ETAPAS))
      for (const forma of formas) {
        const { literales, prefijos } = clavesPedidas(
          fuente(forma),
          forma.startsWith("Etapa4") ? 4 : undefined,
        );
        for (const l of IDIOMAS) {
          const claves = new Set([
            ...planas(textos[l]).map(([k]) => k),
            ...planas(GLOBAL[l]).map(([k]) => k),
          ]);
          for (const k of literales) {
            // `_one` no se pide por su nombre: lo elige el plural
            if (!claves.has(k) && !claves.has(`${k}_one`))
              faltan.push(`${l} ${forma}: ${k}`);
          }
          for (const p of prefijos)
            if (![...claves].some((k) => k.startsWith(p)))
              faltan.push(`${l} ${forma}: ${p}\${…}`);
        }
        void n;
      }
    expect(faltan, "claves que se verían crudas").toEqual([]);
  });

  it("lo que pintan el cuaderno, el mapa y los avisos sigue en el diccionario global (nada que la página necesite se movió)", () => {
    const faltan: string[] = [];
    for (const nombre of DE_LA_PAGINA) {
      const { literales, prefijos } = clavesPedidas(fuente(nombre));
      for (const l of IDIOMAS) {
        const claves = new Set(planas(GLOBAL[l]).map(([k]) => k));
        for (const k of literales)
          if (!claves.has(k) && !claves.has(`${k}_one`))
            faltan.push(`${l} ${nombre}: ${k}`);
        for (const p of prefijos)
          if (![...claves].some((k) => k.startsWith(p)))
            faltan.push(`${l} ${nombre}: ${p}\${…}`);
      }
    }
    expect(faltan, "claves de la página que se movieron").toEqual([]);
  });

  it("el detector no está ciego: ve las claves literales, las de plantilla y las del ayudante k()", () => {
    const { literales, prefijos } = clavesPedidas(
      [
        't("protocol.stage.5.rule.legend")',
        "t(`protocol.stage.5.ref.${id}`)",
        'k("bet.intro")',
        "k(`find.${x}.title`)",
      ].join("\n"),
      4,
    );
    expect(literales).toContain("protocol.stage.5.rule.legend");
    expect(literales).toContain("protocol.stage.4.bet.intro");
    expect(prefijos).toContain("protocol.stage.5.ref.");
    expect(prefijos).toContain("protocol.stage.4.find.");
  });
});

describe("textoPropio", () => {
  const textos: TextosEtapa = {
    es: { a: { b: "Hola {n}", c: "Dos", c_one: "Uno" } },
    en: { a: { b: "Hello {n}", c: "Two", c_one: "One" } },
  };

  it("sale de los textos de la forma, interpola y respeta el plural", () => {
    expect(textoPropio(textos, "es", "a.b", { n: 3 })).toBe("Hola 3");
    expect(textoPropio(textos, "en", "a.b", { n: 3 })).toBe("Hello 3");
    expect(textoPropio(textos, "es", "a.c", { count: 2 })).toBe("Dos");
    expect(textoPropio(textos, "es", "a.c", { count: 1 })).toBe("Uno");
  });

  it("una clave que no es suya devuelve null: la contesta el diccionario global", () => {
    expect(textoPropio(textos, "es", "otra.clave")).toBeNull();
    expect(textoPropio(textos, "es", "a")).toBeNull(); // una rama no es un texto
  });
});

describe("el diccionario global se aligeró de verdad", () => {
  it("las ramas movidas ya no están en messages/es.json", () => {
    expect(resolve(es as Dictionary, "protocol.stage.7.league.title")).toBe(
      "protocol.stage.7.league.title",
    );
    expect(
      resolve(es as Dictionary, "protocol.stage.7.trap.no-supera"),
    ).not.toBe("protocol.stage.7.trap.no-supera");
  });
});
