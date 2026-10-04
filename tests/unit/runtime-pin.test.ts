import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { RUNTIME_VERSIONS } from "@/lib/model-file";

/**
 * La versión de Pyodide viaja DENTRO de cada modelo exportado (`RUNTIME_VERSIONS`) y gobierna el
 * aviso de versiones al importar (S4: pin exacto para lo que se declara en un archivo que
 * sobrevive a la sesión). El build copia Pyodide desde `node_modules`, así que si el paquete se
 * mueve y la constante no, cada archivo exportado DECLARA una versión que no es la que corrió.
 *
 * Origen (S6, PR #15 de dependabot): el lote semanal subió pyodide 314.0.2 → 314.0.7 y solo lo
 * atrapó el job `integration` (Pyodide real, minutos después). Este test lo atrapa en `quality`,
 * sin runtime, y vigila que dependabot no vuelva a meter Pyodide en el lote. Nació en rojo
 * (regla 15, `scripts/demo-rojo.sh`) moviendo el pin sin mover la constante.
 */
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const pin = pkg.dependencies?.pyodide ?? pkg.devDependencies?.pyodide;

type Ignore = { "dependency-name": string; "update-types"?: string[] };
const dependabot = parse(readFileSync(".github/dependabot.yml", "utf8")) as {
  updates: { "package-ecosystem": string; ignore?: Ignore[] }[];
};
const npm = dependabot.updates.find((u) => u["package-ecosystem"] === "npm");

describe("Pyodide: pin exacto = versión declarada en los modelos exportados", () => {
  it("package.json fija Pyodide EXACTO (sin ^ ni ~)", () => {
    expect(pin).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("RUNTIME_VERSIONS.pyodide es la versión que el build copia", () => {
    expect(
      RUNTIME_VERSIONS.pyodide,
      `package.json pide pyodide ${pin} pero los modelos exportados declararían ${RUNTIME_VERSIONS.pyodide}`,
    ).toBe(pin);
  });

  it("dependabot no mete Pyodide en el lote semanal (sube por decisión)", () => {
    const rule = npm?.ignore?.find((i) => i["dependency-name"] === "pyodide");
    expect(rule, "falta el ignore de pyodide en .github/dependabot.yml").toBeDefined();
    // Sin update-types = ignora TODAS (patch, minor y major).
    expect(rule?.["update-types"]).toBeUndefined();
  });
});
