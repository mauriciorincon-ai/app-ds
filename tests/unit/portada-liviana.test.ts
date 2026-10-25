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
  // S18: el lector de Excel, el análisis de lo recién cargado (datos personales y plan de limpieza) y su panel
  // llegan con `import()` / `next/dynamic` DESPUÉS de elegir un archivo. (limpieza-plan.ts SÍ va en la página: es
  // la parte pequeña que aplica lo decidido.)
  "src/lib/ds/xlsx.ts",
  "src/engine/ingesta.ts",
  "src/engine/limpieza.ts",
  "src/engine/personales.ts",
  "src/components/limpieza/LimpiezaPanel.tsx",
  "src/components/limpieza/textos.ts",
  // S18: la exploración, el margen de error y la explicación verificada llegan con la pantalla de configuración o de
  // resultados (dynamic), nunca con la portada.
  "src/components/exploracion/ExploracionPanel.tsx",
  "src/components/resultados/IntervaloPanel.tsx",
  "src/engine/exploracion.ts",
  "src/engine/intervalo.ts",
  "src/workers/contrato-intervalo.ts",
  "src/lib/narration/exploracion.ts",
  "src/lib/narration/explicacion.ts",
  "src/lib/narration/cifras.ts",
  "src/lib/narration/textos-exploracion.ts",
  "src/lib/narration/textos-resultados.ts",
  // S8 (ADR 020): el Protocolo DS vive en /protocolo; la portada solo lleva su enlace
  // y la cuenta de etapas (src/engine/protocolo/ids.ts, sin imports).
  "src/components/protocolo/ProtocoloApp.tsx",
  "src/engine/protocolo/compuerta.ts",
  "src/lib/protocolo/useProtocolo.ts",
  "src/content/protocolo.ts",
  "src/content/glosario.ts",
  // S9: la etapa 4 (su pantalla, el diálogo compartido y los motores de hallazgos) tampoco.
  "src/components/protocolo/Etapa4Form.tsx",
  "src/components/protocolo/Confirmacion.tsx",
  "src/engine/protocolo/etapa4.ts",
  "src/engine/protocolo/deriva.ts",
  "src/engine/protocolo/duplicados.ts",
  // S11: la etapa 6 (su pantalla, la partición y el SHA-256 síncrono del sello).
  "src/components/protocolo/Etapa6Form.tsx",
  "src/engine/protocolo/etapa6.ts",
  "src/engine/protocolo/particion.ts",
  "src/engine/protocolo/sha256.ts",
  // S12: la etapa 7 (pantalla, worker, envío, pliegues y comparación).
  "src/components/protocolo/Etapa7Form.tsx",
  "src/lib/protocolo/liga7.ts",
  "src/lib/protocolo/useValidacion.ts",
  "src/engine/protocolo/etapa7.ts",
  "src/engine/protocolo/pliegues.ts",
  "src/engine/protocolo/comparacion.ts",
  "src/engine/protocolo/permutacion.ts",
  // S13: la etapa 8 (pantalla, worker, envío, lector y el motor de la medida en la prueba).
  "src/components/protocolo/Etapa8Form.tsx",
  "src/lib/protocolo/usePrueba.ts",
  "src/lib/protocolo/prueba8.ts",
  "src/workers/contrato-prueba.ts",
  "src/engine/protocolo/etapa8.ts",
  "src/engine/protocolo/segmentos.ts",
  "src/engine/protocolo/calibracion.ts",
  "src/engine/protocolo/bootstrap.ts",
  // S14: la etapa 9 (pantalla, textos y el motor de la decisión).
  "src/components/protocolo/Etapa9Form.tsx",
  "src/components/protocolo/textos/etapa9.ts",
  "src/engine/protocolo/etapa9.ts",
  // S15: la etapa 10 (pantalla, constancia, chequeo, ficha, generador de Markdown, referencia y textos).
  "src/components/protocolo/Etapa10Form.tsx",
  "src/components/protocolo/Etapa10Constancia.tsx",
  "src/components/protocolo/Etapa10Deriva.tsx",
  "src/components/protocolo/FichaVista.tsx",
  "src/components/protocolo/textos/etapa10.ts",
  "src/engine/protocolo/etapa10.ts",
  "src/engine/protocolo/ficha.ts",
  "src/engine/protocolo/referencia-deriva.ts",
  "src/engine/protocolo/chequeo-deriva.ts",
  "src/lib/protocolo/ficha-texto.ts",
  "src/lib/protocolo/ficha-markdown.ts",
];

/**
 * S12: /protocolo tampoco carga la liga hasta abrir la etapa 7. La definición de la etapa (etapa7.ts,
 * pliegues, comparación) sí va en la página —la compuerta la evalúa al cargar—, pero la pantalla, el
 * worker y el armado del envío (con el encarrilador y el estimador de Probeta) llegan con `next/dynamic`:
 * la página está a 12 KB de su presupuesto.
 */
const ENTRY_PROTOCOLO = resolve(ROOT, "src/app/protocolo/page.tsx");
const LAZY_PROTOCOLO = [
  "src/components/protocolo/Etapa4Form.tsx",
  "src/components/protocolo/Etapa5Form.tsx",
  "src/components/protocolo/Etapa6Form.tsx",
  "src/components/protocolo/Etapa7Form.tsx",
  "src/lib/protocolo/liga7.ts",
  "src/lib/protocolo/useValidacion.ts",
  "src/engine/encarrilador.ts",
  "src/lib/experiment.ts",
  // S13: la pantalla de la etapa 8, su worker, su envío y su lector (fuera de contract.ts) tampoco
  "src/components/protocolo/Etapa8Form.tsx",
  "src/lib/protocolo/usePrueba.ts",
  "src/lib/protocolo/prueba8.ts",
  "src/workers/contrato-prueba.ts",
  // S14: la pantalla de la etapa 9 y sus textos (con su curva)
  "src/components/protocolo/Etapa9Form.tsx",
  "src/components/protocolo/textos/etapa9.ts",
  // S15: la pantalla de la etapa 10, su constancia, el chequeo de deriva, la ficha y su generador de Markdown.
  // (etapa10.ts y referencia-deriva.ts SÍ van en la página: la compuerta de la 10 se evalúa al cargar.)
  "src/components/protocolo/Etapa10Form.tsx",
  "src/components/protocolo/Etapa10Constancia.tsx",
  "src/components/protocolo/Etapa10Deriva.tsx",
  "src/components/protocolo/FichaVista.tsx",
  "src/components/protocolo/textos/etapa10.ts",
  "src/engine/protocolo/ficha.ts",
  "src/engine/protocolo/chequeo-deriva.ts",
  "src/lib/protocolo/ficha-texto.ts",
  "src/lib/protocolo/ficha-markdown.ts",
  // S18: el Protocolo lee CSV; ni el lector de Excel ni el plan de limpieza de Probeta entran a su página.
  "src/lib/ds/xlsx.ts",
  "src/lib/ds/archivo.ts",
  "src/engine/ingesta.ts",
  "src/engine/limpieza.ts",
  "src/engine/limpieza-plan.ts",
  "src/engine/personales.ts",
  "src/components/exploracion/ExploracionPanel.tsx",
  "src/components/resultados/IntervaloPanel.tsx",
  "src/engine/exploracion.ts",
  "src/engine/intervalo.ts",
  "src/workers/contrato-intervalo.ts",
  "src/lib/narration/exploracion.ts",
  "src/lib/narration/explicacion.ts",
  "src/lib/narration/cifras.ts",
  // (src/workers/contract.ts ya llega desde el S10 por useProtocolo → quantity.ts: no se vigila aquí)
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
function reachable(entry = ENTRY): Map<string, string[]> {
  const paths = new Map<string, string[]>([[entry, [entry]]]);
  const queue = [entry];
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

describe("/protocolo no arrastra la pantalla ni el worker de las etapas 7 y 8 por imports estáticos", () => {
  const paths = reachable(ENTRY_PROTOCOLO);

  it("el recorrido alcanza lo que la página sí evalúa (el detector no está ciego)", () => {
    for (const expected of [
      "src/engine/protocolo/compuerta.ts",
      "src/engine/protocolo/etapa7.ts",
      "src/engine/protocolo/pliegues.ts",
      "src/engine/protocolo/etapa8.ts",
      "src/engine/protocolo/etapa9.ts",
      "src/engine/protocolo/etapa10.ts",
      "src/engine/protocolo/referencia-deriva.ts",
    ]) {
      expect(paths.has(resolve(ROOT, expected)), expected).toBe(true);
    }
  });

  it.each(LAZY_PROTOCOLO)("%s solo llega al abrir su etapa", (lazy) => {
    const path = paths.get(resolve(ROOT, lazy));
    expect(
      path,
      path &&
        `/protocolo importa ${lazy} por: ${path.map((p) => relative(ROOT, p)).join(" → ")}`,
    ).toBeUndefined();
  });
});

/**
 * S15: la ficha en Markdown se genera al tocar «Descargar», no al abrir la etapa: ni la pantalla de la 10 ni su
 * constancia importan el generador por imports estáticos (patrón de modelcard.ts, pero con `import()`).
 */
describe("la constancia de la etapa 10 no trae el generador de Markdown por imports estáticos", () => {
  for (const entrada of [
    "src/components/protocolo/Etapa10Constancia.tsx",
    "src/components/protocolo/Etapa10Form.tsx",
  ]) {
    const paths = reachable(resolve(ROOT, entrada));
    it(`${entrada}: el recorrido alcanza lo que sí dibuja (el detector no está ciego)`, () => {
      expect(
        paths.has(resolve(ROOT, "src/lib/protocolo/ficha-texto.ts")),
        entrada,
      ).toBe(true);
    });
    it(`${entrada}: el generador solo llega bajo demanda`, () => {
      const path = paths.get(
        resolve(ROOT, "src/lib/protocolo/ficha-markdown.ts"),
      );
      expect(
        path,
        path &&
          `${entrada} importa el generador por: ${path.map((p) => relative(ROOT, p)).join(" → ")}`,
      ).toBeUndefined();
    });
  }
});
