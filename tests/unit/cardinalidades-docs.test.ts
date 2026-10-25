/**
 * S7 (AU-A-02; `/audita-sprint` casilla 7, lado documentos): las cifras que el manual, el brochure,
 * su export y el design-system escriben a mano salen de una constante del código. El manual es la
 * fuente del conteo del brochure y el export viaja a la vitrina sin este repo: si una constante, el
 * roster o la lista de ejemplos cambia, el documento no puede quedarse mintiendo.
 *
 * Cada regla exige que CADA coincidencia lleve la cifra de su constante (nombrando archivo:línea) y
 * que haya al menos una: si un texto se re-redacta y la cifra se escapa de la regex, la prueba lo dice
 * en vez de pasar vacía. `cardinalidades.test.ts` hace lo mismo con `messages/*.json`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LEAKAGE_CLASS_MIN_SUPPORT } from "@/engine/leakage";
import { CLUSTER_MEMBER_IDS } from "@/engine/roster";
import { MULTICLASS_MAX_CLASSES, MULTICLASS_MIN_CLASSES } from "@/engine/tarea";
import {
  AGGLO_MAX_ROWS,
  CLUSTER_GAP_MIN,
  CLUSTER_K_MAX,
  CLUSTER_K_MIN,
  CLUSTER_STABILITY_MIN,
  SILHOUETTE_SAMPLE,
  STABILITY_FRACTION,
  STABILITY_RUNS,
} from "@/engine/verdict";
import {
  CATEGORIAS_CRAMER_MAX,
  COLUMNAS_MATRIZ_MAX,
} from "@/engine/exploracion";
import { REMUESTREOS } from "@/engine/intervalo";
import { MAXIMO_PASOS } from "@/engine/limpieza";
import { MAX_ROWS } from "@/lib/ds/csv";
import { csvLimitParams, thousands } from "@/lib/quantity";

const DOCUMENTOS = [
  "docs/MANUAL-DE-USO.md",
  "docs/BROCHURE.html",
  "docs/brochure-export.json",
  "design-system.md",
] as const;

const PALABRAS: Record<string, number> = {
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  doce: 12,
  twelve: 12,
};

// Los ejemplos de la portada, contados en la fuente para no montar React.
const startScreen = readFileSync("src/components/StartScreen.tsx", "utf8");
const bloqueEjemplos = startScreen.slice(
  startScreen.indexOf("export const EXAMPLES = ["),
  startScreen.indexOf(
    "] as const;",
    startScreen.indexOf("export const EXAMPLES = ["),
  ),
);
const N_EJEMPLOS = (bloqueEjemplos.match(/\{ key:/g) ?? []).length;

interface Regla {
  nombre: string;
  re: RegExp;
  /** Lo que cada grupo capturado (los que no vienen vacíos) debe decir. */
  esperado: string[];
  /** Convierte una captura a la forma comparable (por defecto, tal cual). */
  normaliza?: (captura: string) => string;
}

const enNumero = (captura: string) =>
  String(PALABRAS[captura.toLowerCase()] ?? captura);

const REGLAS: Regla[] = [
  {
    nombre:
      "rango de categorías (MULTICLASS_MIN_CLASSES a MULTICLASS_MAX_CLASSES)",
    re: /\b(?:[Dd]e|[Ee]ntre|[Ff]rom|[Bb]etween) \**(\d+) (?:a|y|to|and) (\d+)\** categor/g,
    esperado: [String(MULTICLASS_MIN_CLASSES), String(MULTICLASS_MAX_CLASSES)],
  },
  {
    nombre: "tope de categorías (MULTICLASS_MAX_CLASSES)",
    re: /(?:[Mm]ás de|[Mm]ore than) \**(\d+)\**\s+(?:valores distintos|distinct)/g,
    esperado: [String(MULTICLASS_MAX_CLASSES)],
  },
  {
    nombre: "cuántos agrupadores (CLUSTER_MEMBER_IDS)",
    re: /(?<!al menos |at least )\b(dos|tres|cuatro|cinco|seis|two|three|four|five|six)(?: agrupadores| clusterers| formas de agrupar|: K-Means)/gi,
    esperado: [String(CLUSTER_MEMBER_IDS.length)],
    normaliza: enNumero,
  },
  {
    nombre: "rango de k (CLUSTER_K_MIN a CLUSTER_K_MAX)",
    re: /\b(?:de|from) \**(\d+) (?:a|to) (\d+) (?:grupos|groups)/gi,
    esperado: [String(CLUSTER_K_MIN), String(CLUSTER_K_MAX)],
  },
  {
    nombre: "muestra del jerárquico (AGGLO_MAX_ROWS)",
    re: /(?:[Mm]ás de|[Mm]ore than) \**([\d,]+)\** (?:filas|rows)|\b([\d,]+)(?: filas)? al azar/g,
    esperado: [thousands(AGGLO_MAX_ROWS)],
  },
  {
    nombre: "muestra de la silueta (SILHOUETTE_SAMPLE)",
    re: /muestra de hasta \**([\d,]+)\** filas/g,
    esperado: [thousands(SILHOUETTE_SAMPLE)],
  },
  {
    nombre: "diferencia mínima contra datos sin estructura (CLUSTER_GAP_MIN)",
    re: /por al menos \**(\d\.\d+)\**(?: de puntaje)?/g,
    esperado: [CLUSTER_GAP_MIN.toFixed(2)],
  },
  {
    nombre: "estabilidad mínima (CLUSTER_STABILITY_MIN)",
    re: /al menos \**(0\.\d+) de 1\**|hace falta al menos (0\.\d+)/g,
    esperado: [String(CLUSTER_STABILITY_MIN)],
  },
  {
    nombre: "fracción del re-muestreo (STABILITY_FRACTION)",
    re: /\**(\d+)\s%\** de tus filas/g,
    esperado: [String(Math.round(STABILITY_FRACTION * 100))],
  },
  {
    nombre: "corridas del re-muestreo (STABILITY_RUNS)",
    re: /de tus filas,?\s\**(\d+) veces/g,
    esperado: [String(STABILITY_RUNS)],
  },
  {
    nombre:
      "soporte mínimo de la fuga por categoría (LEAKAGE_CLASS_MIN_SUPPORT)",
    re: /al menos (\d+) filas con valor/g,
    esperado: [String(LEAKAGE_CLASS_MIN_SUPPORT)],
  },
  {
    nombre: "ejemplos de la portada (EXAMPLES)",
    re: /\b(siete|seis|ocho|nueve|seven|six|eight|nine) (?:ejemplos|bundled examples)/gi,
    esperado: [String(N_EJEMPLOS)],
    normaliza: enNumero,
  },
  {
    nombre: "pasos del plan de limpieza (MAXIMO_PASOS)",
    re: /\b(?:[Hh]asta|[Uu]p to) \**(\d+|doce|twelve)\** (?:pasos|steps)/g,
    esperado: [String(MAXIMO_PASOS)],
    normaliza: enNumero,
  },
  {
    nombre: "columnas de la matriz de correlación (COLUMNAS_MATRIZ_MAX)",
    re: /\((?:hasta|up to) \**(\d+)\** (?:columnas|columns)/g,
    esperado: [String(COLUMNAS_MATRIZ_MAX)],
  },
  {
    nombre: "categorías de la V de Cramér (CATEGORIAS_CRAMER_MAX)",
    re: /solo columnas con hasta \**(\d+)\** categor/g,
    esperado: [String(CATEGORIAS_CRAMER_MAX)],
  },
  {
    nombre: "remuestreos del margen de error (REMUESTREOS)",
    re: /remuestrea \**([\d\s\u00a0\u202f,.]+?)\s+veces/g,
    esperado: [String(REMUESTREOS)],
    normaliza: (captura) => captura.replace(/\D/g, ""),
  },
  {
    nombre: "límite del CSV (MAX_BYTES y MAX_ROWS)",
    re: /\b(\d+) MB (?:o|or) ([\d,]+) (?:filas|rows)/g,
    esperado: [String(csvLimitParams().mb), thousands(MAX_ROWS)],
  },
];

const PROHIBIDAS = [/otros tres|other three/i];

interface Linea {
  donde: string;
  texto: string;
}

const lineas: Linea[] = DOCUMENTOS.flatMap((archivo) =>
  readFileSync(archivo, "utf8")
    .split("\n")
    .map((texto, i) => ({ donde: `${archivo}:${i + 1}`, texto })),
);

describe("cardinalidades en los documentos: cada cifra sale de su constante (casilla 7)", () => {
  it("los ejemplos de la portada se pudieron contar", () => {
    expect(N_EJEMPLOS).toBeGreaterThan(0);
  });

  it.each(REGLAS.map((r) => [r.nombre, r] as const))("%s", (_nombre, regla) => {
    let coincidencias = 0;
    const malas: string[] = [];
    for (const { donde, texto } of lineas) {
      for (const m of texto.matchAll(regla.re)) {
        coincidencias++;
        const capturas = m
          .slice(1)
          .filter((c): c is string => c !== undefined)
          .map(regla.normaliza ?? ((c) => c));
        // Las reglas con dos cifras (un rango) comparan las dos; las de una, la que vino.
        const esperado = regla.esperado.slice(0, capturas.length);
        if (capturas.join(" · ") !== esperado.join(" · ")) {
          malas.push(
            `${donde}: «${m[0]}» — esperado ${regla.esperado.join(" a ")}`,
          );
        }
      }
    }
    expect(
      coincidencias,
      `ninguna coincidencia para «${regla.nombre}»: ¿se re-redactó?`,
    ).toBeGreaterThan(0);
    expect(
      malas,
      "cifras escritas a mano que ya no dicen lo que dice el código",
    ).toEqual([]);
  });

  it("ninguna frase cuenta «los otros tres» agrupadores", () => {
    const malas = lineas
      .filter(({ texto }) => PROHIBIDAS.some((re) => re.test(texto)))
      .map(({ donde, texto }) => `${donde}: ${texto.trim().slice(0, 120)}`);
    expect(
      malas,
      "«los otros tres» depende de cuántos agrupadores hay",
    ).toEqual([]);
  });
});
