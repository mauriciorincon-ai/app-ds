// @vitest-environment node
/**
 * S7 (AU-S7-05, AC-2): la regla 18 vigila cuándo vence una condición de retiro. La excepción de
 * auditoría del ADR 012 se retira por un EVENTO (el aviso publica un parche), así que el gate es
 * `scripts/verificar-retiros.mjs`, que consulta el aviso. Aquí se prueba su lógica sin red, con
 * respuestas guardadas: sin parche sigue verde, con parche (en cualquiera de las dos formas de la
 * API) es rojo nombrando el aviso, y un aviso ilegible es rojo (falla cerrado).
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const ids: string[] =
  (
    parse(readFileSync("pnpm-workspace.yaml", "utf8")) as {
      auditConfig?: { ignoreGhsas?: string[] };
    }
  ).auditConfig?.ignoreGhsas ?? [];

function correr(parche: unknown | "sin-archivo" | "sin-vulnerabilidades") {
  const dir = mkdtempSync(join(tmpdir(), "retiros-"));
  for (const id of ids) {
    if (parche === "sin-archivo") continue;
    const vulnerabilities =
      parche === "sin-vulnerabilidades"
        ? []
        : [{ package: { name: "braces" }, first_patched_version: parche }];
    writeFileSync(
      join(dir, `${id}.json`),
      JSON.stringify({ ghsa_id: id, vulnerabilities }),
    );
  }
  return spawnSync(
    process.execPath,
    ["scripts/verificar-retiros.mjs", "--respuestas", dir],
    { encoding: "utf8" },
  );
}

describe("verificar-retiros (regla 18: la excepción vence con el parche)", () => {
  it("hay al menos una excepción que vigilar (si no, el gate no mide nada)", () => {
    expect(ids.length).toBeGreaterThan(0);
  });

  it("sin parche publicado, la excepción sigue y el gate pasa", () => {
    const r = correr(null);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("sigue sin parche publicado");
  });

  it("con parche (texto, API global), la excepción venció: rojo nombrando el aviso", () => {
    const r = correr("3.0.4");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`${ids[0]} ya tiene parche (braces 3.0.4)`);
  });

  it("con parche (objeto, API de repositorios), también es rojo", () => {
    const r = correr({ identifier: "3.0.4" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("la excepción VENCIÓ");
  });

  it("un aviso ilegible es rojo: falla cerrado", () => {
    expect(correr("sin-archivo").status).toBe(1);
    const r = correr("sin-vulnerabilidades");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("falla cerrado");
  });
});
