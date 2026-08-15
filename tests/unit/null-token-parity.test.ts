// Tripwire de paridad TS↔Python (auditoría H1): pipeline.py espeja los
// NULL_TOKENS y la semántica trim+lowercase de csv.ts. Si alguien toca un lado
// sin el otro, este test falla ANTES de que "si " y "si" vuelvan a ser clases
// distintas al entrenar (el bug que motivó el ajuste).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isNullToken, NULL_TOKENS, parseNumber } from "@/lib/ds/csv";

const PIPELINE_PY = readFileSync(
  resolve(__dirname, "../../src/lib/ds/pipeline.py"),
  "utf8",
);

describe("paridad de tokens de nulo TS↔Python", () => {
  it("pipeline.py declara EXACTAMENTE los mismos tokens que csv.ts", () => {
    const match = PIPELINE_PY.match(/_NULL_TOKENS = \{([^}]*)\}/);
    expect(match).not.toBeNull();
    const pythonTokens = [...match![1]!.matchAll(/"([^"]*)"/g)].map(
      (m) => m[1]!,
    );
    expect(new Set(pythonTokens)).toEqual(NULL_TOKENS);
  });

  it("pipeline.py normaliza celdas con strip+lower (espejo de isNullToken)", () => {
    // El contrato mínimo: la función existe y aplica strip() y lower().
    expect(PIPELINE_PY).toContain("def _normalize_cell(");
    expect(PIPELINE_PY).toContain(".strip()");
    expect(PIPELINE_PY).toContain("text.lower() in _NULL_TOKENS");
  });

  it("isNullToken trata variantes con espacios/mayúsculas como nulo", () => {
    for (const value of [" NA ", "None", "NULL", "  ", "n/a", " - "]) {
      expect(isNullToken(value)).toBe(true);
    }
    expect(isNullToken("no")).toBe(false);
    expect(isNullToken("0")).toBe(false);
  });

  it("parseNumber rechaza literales hex/binarios/octales como pandas", () => {
    expect(parseNumber("0x10")).toBeNull();
    expect(parseNumber("0b101")).toBeNull();
    expect(parseNumber("0o17")).toBeNull();
    expect(parseNumber("-0x10")).toBeNull();
    expect(parseNumber("0.5")).toBe(0.5);
    expect(parseNumber(" 3.5 ")).toBe(3.5);
    expect(parseNumber("1e3")).toBe(1000);
  });
});
