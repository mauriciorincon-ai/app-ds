import { describe, expect, it } from "vitest";
import { formatEstimate } from "@/lib/duration";

describe("formatEstimate", () => {
  it("redondea hacia arriba en segundos y pasa a minutos desde 60 s", () => {
    expect(formatEstimate(0.2)).toBe("1 s");
    expect(formatEstimate(3.2)).toBe("4 s");
    expect(formatEstimate(59.1)).toBe("60 s");
    expect(formatEstimate(75)).toBe("2 min");
    expect(formatEstimate(Number.NaN)).toBe("1 s");
  });
});
