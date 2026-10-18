import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * S11 (peso de las páginas): cada página cargaba los DOS diccionarios (188 KB) en su chunk
 * compartido; la CI medía /protocolo en 310 KB de script. Ahora el español va estático y el
 * inglés llega con `import()` al elegirlo (src/i18n/dictionaries.ts). Esta prueba recorre los
 * imports estáticos desde las entradas de las páginas, SIGUIENDO también los JSON, y nombra el
 * camino que llegue al diccionario inglés o al módulo que lo registra de entrada
 * (src/i18n/servidor.ts, solo del servidor de la narración y de las pruebas).
 *
 * El recorrido es el de `portada-liviana.test.ts` más los JSON; se repite aquí porque aquella
 * prueba los ignora a propósito (no arrastran código de pantallas, pero sí kilobytes).
 */
const ROOT = process.cwd();
const ENTRADAS = [
  "src/app/layout.tsx",
  "src/app/page.tsx",
  "src/app/protocolo/page.tsx",
];
const PROHIBIDOS = ["messages/en.json", "src/i18n/servidor.ts"];

function resolver(desde: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = resolve(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(desde), spec);
  else return null; // un paquete: fuera del alcance
  for (const candidato of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ]) {
    if (/\.(tsx?|json)$/.test(candidato) && existsSync(candidato))
      return candidato;
  }
  return null;
}

/** Los imports que sobreviven al compilar: ni `import type` ni `export type`, ni `import()`. */
function especificadores(archivo: string): string[] {
  if (archivo.endsWith(".json")) return [];
  const fuente = readFileSync(archivo, "utf8");
  const conFrom = [
    ...fuente.matchAll(
      /^\s*(?:import|export)\s+(?!type\s)[^;]*?\sfrom\s+["']([^"']+)["']/gm,
    ),
  ].map((m) => m[1]!);
  const efectos = [...fuente.matchAll(/^\s*import\s+["']([^"']+)["']/gm)].map(
    (m) => m[1]!,
  );
  return [...conFrom, ...efectos];
}

function alcanzados(entrada: string): Map<string, string[]> {
  const inicio = resolve(ROOT, entrada);
  const caminos = new Map<string, string[]>([[inicio, [inicio]]]);
  const cola = [inicio];
  while (cola.length > 0) {
    const archivo = cola.shift()!;
    for (const spec of especificadores(archivo)) {
      const destino = resolver(archivo, spec);
      if (destino && !caminos.has(destino)) {
        caminos.set(destino, [...caminos.get(archivo)!, destino]);
        cola.push(destino);
      }
    }
  }
  return caminos;
}

describe("cada página carga solo su idioma (el español; el inglés llega al elegirlo)", () => {
  it.each(ENTRADAS)("%s alcanza el español y no el inglés", (entrada) => {
    const caminos = alcanzados(entrada);
    // el detector no está ciego: el español sí llega, por el provider
    expect(
      caminos.has(resolve(ROOT, "messages/es.json")),
      "messages/es.json debería alcanzarse (el detector está ciego)",
    ).toBe(true);
    for (const prohibido of PROHIBIDOS) {
      const camino = caminos.get(resolve(ROOT, prohibido));
      expect(
        camino,
        camino &&
          `${entrada} importa ${prohibido} por: ${camino.map((p) => relative(ROOT, p)).join(" → ")}`,
      ).toBeUndefined();
    }
  });

  it("el servidor de la narración sí registra el inglés (el detector ve el camino que existe)", () => {
    const caminos = alcanzados("src/app/api/narrate/route.ts");
    expect(caminos.has(resolve(ROOT, "src/i18n/servidor.ts"))).toBe(true);
    expect(caminos.has(resolve(ROOT, "messages/en.json"))).toBe(true);
  });
});
