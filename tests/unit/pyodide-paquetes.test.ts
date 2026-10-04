import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LOAD_WITHOUT_DEPS,
  REQUIRED,
  resolveWheels,
} from "../../scripts/pyodide-paquetes.mjs";

// El runner (public/pyodide-runner.js) no pasa por el bundler y no puede importar la lista de
// paquetes: la repite. Este test es la costura — si alguien agrega un paquete a un lado solo,
// el self-host (copy-pyodide) y lo que el worker carga divergen y el navegador falla en runtime.
const runner = readFileSync("public/pyodide-runner.js", "utf8");

function arrayLiteral(name: string): string[] {
  const match = runner.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`));
  expect(
    match,
    `public/pyodide-runner.js debe declarar ${name}`,
  ).not.toBeNull();
  return [...match![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

const lock = JSON.parse(
  readFileSync("node_modules/pyodide/pyodide-lock.json", "utf8"),
) as { packages: Record<string, { file_name: string; depends?: string[] }> };

describe("paquetes de Pyodide: una sola lista, dos lectores", () => {
  it("el runner carga EXACTAMENTE los paquetes que el self-host copia", () => {
    const packages = arrayLiteral("PACKAGES");
    const withoutDeps = arrayLiteral("PACKAGES_WITHOUT_DEPS");
    expect([...packages, ...withoutDeps].sort()).toEqual([...REQUIRED].sort());
    expect(withoutDeps).toEqual(LOAD_WITHOUT_DEPS);
  });

  it("el cierre NO trae setuptools/pyparsing (xgboost viaja sin su cierre declarado)", () => {
    const wheels = resolveWheels(lock).join(" ");
    expect(wheels).toMatch(/xgboost-/);
    expect(wheels).toMatch(/lightgbm-/);
    expect(wheels).not.toMatch(/setuptools-|pyparsing-/);
  });

  it("los paquetes cargados sin cierre declaran en el lock algo que de verdad se omite", () => {
    // Si un día el lock deja de declarar setuptools para xgboost, la excepción sobra: este
    // test lo avisa para retirarla en vez de dejar una rareza sin razón.
    for (const name of LOAD_WITHOUT_DEPS) {
      expect(lock.packages[name]?.depends ?? []).toContain("setuptools");
    }
  });
});
