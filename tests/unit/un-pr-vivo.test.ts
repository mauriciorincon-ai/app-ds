// @vitest-environment node
/**
 * Regla 18 (kit v2.1.0) y S16 (S8 B10): el job `un-pr-vivo` pasa para el PR más antiguo y exige «complementa #N:»
 * a los demás. La demo en rojo vive aquí: el bloque `run:` del workflow se ejecuta de verdad, con un `gh` falso
 * que devuelve los PRs abiertos, en cinco escenarios (tres de ellos son los que el cambio del S16 toca).
 */
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const YAML = readFileSync(".github/workflows/un-pr-vivo.yml", "utf8");
const marca = "        run: |\n";
const BLOQUE = YAML.slice(YAML.indexOf(marca) + marca.length)
  .split("\n")
  .map((linea) => (linea.startsWith("          ") ? linea.slice(10) : linea))
  .join("\n");

function correr(abiertos: number[], este: number, cuerpo = "") {
  const dir = mkdtempSync(join(tmpdir(), "un-pr-vivo-"));
  mkdirSync(join(dir, "bin"));
  // `gh pr list ... --jq 'map(.number)'` imprime el arreglo compacto: el falso lo imita
  writeFileSync(
    join(dir, "bin", "gh"),
    `#!/usr/bin/env bash\nprintf '%s' '${JSON.stringify(abiertos)}'\n`,
  );
  chmodSync(join(dir, "bin", "gh"), 0o755);
  writeFileSync(join(dir, "run.sh"), BLOQUE);
  const r = spawnSync("bash", [join(dir, "run.sh")], {
    env: {
      ...process.env,
      PATH: `${join(dir, "bin")}:${process.env.PATH}`,
      REPO: "x/y",
      GH_TOKEN: "x",
      ESTE: String(este),
      CUERPO: cuerpo,
    },
    encoding: "utf8",
  });
  return { codigo: r.status, salida: `${r.stdout}${r.stderr}` };
}

describe("un-pr-vivo (S16, S8 B10)", () => {
  it("el workflow se leyó entero (el bloque tiene la lógica)", () => {
    expect(BLOQUE).toContain("gh pr list");
    expect(BLOQUE).toContain("complementa #");
  });

  it("un solo PR abierto pasa", () => {
    expect(correr([31], 31).codigo).toBe(0);
  });

  it("el PR más antiguo pasa aunque se abra otro después (antes fallaba el de siempre)", () => {
    const r = correr([31, 32], 31);
    expect(r.codigo).toBe(0);
    expect(r.salida).toContain("este es el PR vivo");
  });

  it("el PR nuevo SIN «complementa #N:» falla y lo nombra", () => {
    const r = correr([31, 32], 32, "Cuerpo normal");
    expect(r.codigo).toBe(1);
    expect(r.salida).toContain("UN SOLO PR VIVO POR APP");
  });

  it("el PR nuevo CON «complementa #31: …» en la primera línea pasa", () => {
    const r = correr([31, 32], 32, "complementa #31: no cabe en el 31\nmás");
    expect(r.codigo).toBe(0);
    expect(r.salida).toContain("complementario");
  });

  it("«complementa» fuera de la primera línea no cuenta", () => {
    expect(correr([31, 32], 32, "Hola\ncomplementa #31: x").codigo).toBe(1);
  });

  it("con el más antiguo ya cerrado, el nuevo mayor sigue necesitando la declaración", () => {
    expect(correr([32, 33], 33).codigo).toBe(1);
  });
});
