import { beforeEach, describe, expect, it, vi } from "vitest";

const captureMessage = vi.fn();
const addBreadcrumb = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureMessage: (...args: unknown[]) => captureMessage(...args),
  addBreadcrumb: (...args: unknown[]) => addBreadcrumb(...args),
}));

const { recordLeagueRun, reportExperimentError } =
  await import("@/lib/observability");

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

describe("recordLeagueRun (S5, privacidad)", () => {
  beforeEach(() => addBreadcrumb.mockClear());

  it("deja un breadcrumb con SOLO metadatos de la corrida (ni valores ni nombres)", () => {
    recordLeagueRun({
      rows: 5000,
      cols: 12,
      competitors: 14,
      level: 2,
      elapsedMs: 41_250,
      cancelled: false,
    });
    expect(addBreadcrumb).toHaveBeenCalledWith({
      category: "league",
      level: "info",
      message: "league-run",
      data: {
        rows: 5000,
        cols: 12,
        competitors: 14,
        level: 2,
        elapsedMs: 41_250,
        cancelled: false,
      },
    });
  });

  it("la cancelación se nombra como tal y sin tiempo", () => {
    recordLeagueRun({
      competitors: 10,
      level: 2,
      elapsedMs: null,
      cancelled: true,
    });
    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "league-cancelled",
        data: expect.objectContaining({
          rows: null,
          cols: null,
          cancelled: true,
          elapsedMs: null,
        }),
      }),
    );
  });

  it("la forma de los datos es cerrada: ninguna clave fuera de los metadatos", () => {
    recordLeagueRun({
      competitors: 1,
      level: 1,
      elapsedMs: 10,
      cancelled: false,
    });
    const data = addBreadcrumb.mock.calls[0]![0].data as Record<
      string,
      unknown
    >;
    expect(Object.keys(data).sort()).toEqual(
      ["cancelled", "cols", "competitors", "elapsedMs", "level", "rows"].sort(),
    );
    for (const value of Object.values(data)) {
      expect(["number", "boolean"]).toContain(
        value === null ? "number" : typeof value,
      );
    }
  });
});
