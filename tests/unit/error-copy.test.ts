import { describe, expect, it } from "vitest";
import { translate } from "@/i18n/translate";
import type { WorkerErrorKind } from "@/workers/protocol";

// S6 (AU-S6-14): toda falla del motor tiene su texto en ES y EN. Sin él, la UI
// pintaría la clave cruda («errors.target-ambiguous»): `translate` devuelve la
// clave si falta. El `Record` es exhaustivo: si `WorkerErrorKind` crece sin
// sumarse aquí, `pnpm typecheck` falla; si se suma sin copy, este test lo nombra.
const KINDS: Record<WorkerErrorKind, true> = {
  "csv-empty": true,
  "csv-too-large": true,
  "csv-too-many-rows": true,
  "csv-ragged": true,
  "csv-semicolon": true,
  "csv-tab": true,
  "target-not-binary": true,
  "target-not-numeric": true,
  "target-ambiguous": true,
  "target-mixed-notation": true,
  "no-features": true,
  "too-few-rows": true,
  "too-few-rows-quantity": true,
  "too-few-rows-per-class": true,
  "too-few-rows-cluster": true,
  contract: true,
  "league-empty": true,
  "csv-unusable": true,
  runtime: true,
  "worker-dead": true,
};

describe("toda falla del motor tiene su texto, en ES y EN", () => {
  it.each(Object.keys(KINDS))("%s", (kind) => {
    for (const locale of ["es", "en"] as const) {
      expect(
        translate(locale, `errors.${kind}`),
        `${locale}: ${kind}`,
      ).not.toBe(`errors.${kind}`);
    }
  });
});
