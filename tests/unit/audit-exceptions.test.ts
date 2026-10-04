import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * Kit v1.34.0 (regla 18): una excepción de `pnpm audit` solo existe con su ADR en
 * `decisions/` (id · razón · fecha · condición de retiro). Antes vivía «por nombre» en un
 * comentario de `pnpm-workspace.yaml` (S5) — un comentario no es un gate: nadie lo ve operar.
 * Este test sí: cada id de `auditConfig.ignoreGhsas` debe aparecer en un ADR que además declare
 * su condición de retiro. Nació en rojo (regla 15, `scripts/demo-rojo.sh`) agregando un id sin ADR.
 */
const workspace = parse(readFileSync("pnpm-workspace.yaml", "utf8")) as {
  auditConfig?: { ignoreGhsas?: string[] };
};
const ignored = workspace.auditConfig?.ignoreGhsas ?? [];

const adrs = readdirSync("decisions")
  .filter((f) => f.endsWith(".md"))
  .map((f) => ({ file: f, text: readFileSync(join("decisions", f), "utf8") }));

describe("excepciones de auditoría (kit v1.34.0)", () => {
  it("cada advisory ignorada tiene un ADR que la nombra y dice cuándo se retira", () => {
    const sinAdr = ignored.filter(
      (id) =>
        !adrs.some(
          (adr) => adr.text.includes(id) && /removal condition/i.test(adr.text),
        ),
    );
    expect(
      sinAdr,
      `advisories ignoradas sin ADR: ${sinAdr.join(", ")}`,
    ).toEqual([]);
  });

  it("las ignoradas son ids GHSA (nada de comodines ni niveles)", () => {
    for (const id of ignored) {
      expect(id).toMatch(/^GHSA(-[23456789cfghjmpqrvwx]{4}){3}$/);
    }
  });
});
