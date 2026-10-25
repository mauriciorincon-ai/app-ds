// S17 (ADR 024, AU-S17-13): las versiones fijas de la receta y del servicio son las MISMAS con las que entrenó Pyodide. Hoy
// coinciden; si `pyodide` se mueve por decisión (runtime-pin.test.ts), este gate falla hasta que receta y servicio declaren las
// nuevas, en vez de reproducir con otra cifra sin avisar. `verificar-publica.mjs` comprueba además que cada pin exista en PyPI.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { versionesDe } from "@/lib/publica/ensamblar";

const leer = (ruta: string) => readFileSync(resolve(__dirname, "../..", ruta), "utf8");
const RECETA = versionesDe(leer("src/lib/ds/plantillas/requirements-receta.txt"));
const SERVICIO = versionesDe(leer("src/lib/ds/plantillas/requirements-servicio.txt"));
const LOCK = JSON.parse(leer("node_modules/pyodide/pyodide-lock.json")) as {
  packages: Record<string, { version: string }>;
};

const normal = (n: string) => n.toLowerCase().replaceAll("_", "-");

/** Los pins que el lock de Pyodide contradice o no tiene: vacío = coinciden todos. */
function discrepancias(
  pins: Record<string, string>,
  lock: typeof LOCK,
): string[] {
  const delLock = new Map(
    Object.entries(lock.packages).map(([n, p]) => [normal(n), p.version]),
  );
  return Object.entries(pins).flatMap(([n, v]) => {
    const real = delLock.get(normal(n));
    return real === v ? [] : [`${n}: pin ${v}, Pyodide ${real ?? "no lo trae"}`];
  });
}

describe("las versiones fijas son las de Pyodide", () => {
  it("cada pin de la receta es el del lock de Pyodide", () => {
    expect(Object.keys(RECETA).length).toBeGreaterThanOrEqual(11);
    expect(discrepancias(RECETA, LOCK)).toEqual([]);
  });

  it("el servicio fija las mismas versiones de lo que comparte con la receta, y suma lo suyo (FastAPI y compañía)", () => {
    for (const [n, v] of Object.entries(RECETA)) expect(SERVICIO[n], n).toBe(v);
    expect(Object.keys(SERVICIO)).toEqual(expect.arrayContaining(["fastapi", "uvicorn", "pydantic"]));
  });

  it("el gate se demuestra fallando: un pin movido, o uno que Pyodide no trae, se nombra", () => {
    expect(discrepancias({ ...RECETA, numpy: "1.0.0" }, LOCK)).toEqual([
      `numpy: pin 1.0.0, Pyodide ${LOCK.packages.numpy!.version}`,
    ]);
    expect(discrepancias({ inventado: "9.9.9" }, LOCK)).toEqual([
      "inventado: pin 9.9.9, Pyodide no lo trae",
    ]);
  });
});
