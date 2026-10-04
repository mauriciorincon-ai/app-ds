import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * `.github/dependabot.yml` es configuración que decide qué PRs llegan y con qué
 * adentro — y nadie la corre en local. Origen (hoja-de-vida PRs #10 y #14,
 * 2026-09-05/06): un mayor sin soporte metido en el lote semanal ponía rojo el
 * PR entero y bloqueaba 35 bumps sanos, semana tras semana.
 *
 * La invariante se vigila AQUÍ (kit v1.26.0, regla 18): techo de UN PR por
 * ecosistema (dos en total), un solo lote por ecosistema, y el lote de npm
 * solo con minor + patch — los mayores llegan sueltos, uno a uno. Un `ignore`
 * por paquete NO es gate: no se puede ver operar. Este test sí: nació en rojo
 * (regla 15) quitando `update-types` del grupo.
 */
type Grupo = { patterns?: string[]; "update-types"?: string[] };
type Entrada = {
  "package-ecosystem": string;
  "open-pull-requests-limit"?: number;
  groups?: Record<string, Grupo>;
};

const config = parse(readFileSync(".github/dependabot.yml", "utf8")) as {
  version: number;
  updates: Entrada[];
};

const npm = config.updates.find((u) => u["package-ecosystem"] === "npm");

describe("dependabot.yml — máximo dos PRs abiertos y el lote nunca arrastra un mayor", () => {
  it("cada ecosistema abre como máximo UN PR (techo total de dos)", () => {
    expect(config.version).toBe(2);
    expect(config.updates.length).toBeGreaterThan(0);
    expect(config.updates.length).toBeLessThanOrEqual(2);
    for (const u of config.updates) {
      expect(u["open-pull-requests-limit"], u["package-ecosystem"]).toBe(1);
    }
  });

  it("cada ecosistema agrupa TODO en un solo lote", () => {
    for (const u of config.updates) {
      const grupos = Object.entries(u.groups ?? {});
      expect(grupos, u["package-ecosystem"]).toHaveLength(1);
      expect(grupos[0]?.[1].patterns, u["package-ecosystem"]).toEqual(["*"]);
    }
  });

  it("el lote de npm solo lleva minor y patch — jamás major", () => {
    expect(npm).toBeDefined();
    for (const [nombre, g] of Object.entries(npm?.groups ?? {})) {
      const tipos = g["update-types"];
      expect(
        tipos,
        `el grupo «${nombre}» no declara update-types: sin él los mayores entran al lote`,
      ).toBeDefined();
      expect(tipos, `el grupo «${nombre}» admite major`).not.toContain("major");
      expect(tipos?.slice().sort()).toEqual(["minor", "patch"]);
    }
  });
});
