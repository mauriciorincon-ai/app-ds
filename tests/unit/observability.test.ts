import { beforeEach, describe, expect, it, vi } from "vitest";

const captureMessage = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureMessage: (...args: unknown[]) => captureMessage(...args),
}));

const { reportExperimentError } = await import("@/lib/observability");

describe("reportExperimentError (privacidad)", () => {
  beforeEach(() => captureMessage.mockClear());

  it("envía solo el tipo de error y el tamaño del dataset, nunca contenido", () => {
    reportExperimentError("runtime", { rows: 200, cols: 6 });
    expect(captureMessage).toHaveBeenCalledWith("experiment-error:runtime", {
      level: "error",
      tags: { area: "experiment", kind: "runtime" },
      extra: { rows: 200, cols: 6 },
    });
  });

  it("tolera la ausencia de metadatos", () => {
    reportExperimentError("runtime");
    expect(captureMessage).toHaveBeenCalledWith("experiment-error:runtime", {
      level: "error",
      tags: { area: "experiment", kind: "runtime" },
      extra: { rows: null, cols: null },
    });
  });
});
