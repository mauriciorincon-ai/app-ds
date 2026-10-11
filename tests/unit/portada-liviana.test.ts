import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * S7 (R15, decisión 7, ADR 018): la portada solo carga lo que dibuja. Las pantallas de
 * configurar, entrenar, resultados y puntuar llegan con `next/dynamic`; las fichas
 * (content/modelos.ts, ≈ 35 KB) y la model card viajan con ellas. Un import ESTÁTICO
 * desde lo que la portada sí carga las vuelve a meter en "/" sin que nadie lo note en
 * local: con el DSN vacío del `.env.local`, el build local mide ≈ 70 KB menos que la CI
 * (K-S7-4), y Lighthouse solo lo ve después del push.
 *
 * Esta prueba recorre los imports estáticos (no `import type`, no `import()`) desde
 * src/app/page.tsx y nombra el camino que llega a un módulo prohibido. Nació en rojo
 * (`scripts/demo-rojo.sh`): StartScreen importando de nuevo `thousands` desde las fichas,
 * que es como entraron en el S7.
 */
const ROOT = process.cwd();
const ENTRY = resolve(ROOT, "src/app/page.tsx");

/** Lo que la portada NO debe alcanzar por imports estáticos. */
const LAZY = [
  "src/components/ConfigScreen.tsx",
  "src/components/TrainingScreen.tsx",
  "src/components/ResultsScreen.tsx",
  "src/components/ScoreScreen.tsx",
  "src/components/MulticlassResults.tsx",
  "src/components/ClusterResults.tsx",
  "src/components/FichaModelo.tsx",
  "src/content/modelos.ts",
  "src/lib/modelcard.ts",
];

function resolveSpec(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = resolve(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null; // un paquete: fuera del alcance de esta prueba
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ]) {
    if (/\.tsx?$/.test(candidate) && existsSync(candidate)) return candidate;
  }
  return null; // JSON, CSS: no arrastran código de pantallas
}

/** Los imports que sobreviven al compilar: ni `import type` ni `export type`. */
function staticSpecs(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const fromClauses = [
    ...source.matchAll(
      /^\s*(?:import|export)\s+(?!type\s)[^;]*?\sfrom\s+["']([^"']+)["']/gm,
    ),
  ].map((m) => m[1]!);
  const sideEffects = [
    ...source.matchAll(/^\s*import\s+["']([^"']+)["']/gm),
  ].map((m) => m[1]!);
  return [...fromClauses, ...sideEffects];
}

/** Recorrido en anchura: cada archivo alcanzado con el camino que lo trajo. */
function reachable(): Map<string, string[]> {
  const paths = new Map<string, string[]>([[ENTRY, [ENTRY]]]);
  const queue = [ENTRY];
  while (queue.length > 0) {
    const file = queue.shift()!;
    for (const spec of staticSpecs(file)) {
      const target = resolveSpec(file, spec);
      if (target && !paths.has(target)) {
        paths.set(target, [...paths.get(file)!, target]);
        queue.push(target);
      }
    }
  }
  return paths;
}

describe("la portada no arrastra pantallas ni fichas por imports estáticos", () => {
  const paths = reachable();

  it("el recorrido alcanza lo que la portada sí dibuja (el detector no está ciego)", () => {
    for (const expected of [
      "src/components/StartScreen.tsx",
      "src/lib/useExperiment.ts",
      "src/lib/quantity.ts",
    ]) {
      expect(paths.has(resolve(ROOT, expected)), expected).toBe(true);
    }
  });

  it.each(LAZY)("%s solo llega bajo demanda", (lazy) => {
    const path = paths.get(resolve(ROOT, lazy));
    expect(
      path,
      path &&
        `la portada importa ${lazy} por: ${path.map((p) => relative(ROOT, p)).join(" → ")}`,
    ).toBeUndefined();
  });
});
