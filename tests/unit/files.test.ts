import { afterEach, describe, expect, it, vi } from "vitest";
import { datasetSlug, downloadTextFile } from "@/lib/files";

describe("datasetSlug", () => {
  it("minúsculas, sin .csv, no-alfanuméricos a guiones", () => {
    expect(datasetSlug("Ventas Q1 (final).CSV")).toBe("ventas-q1-final");
  });

  it("sin caracteres útiles ⇒ cadena vacía (el caller decide el fallback)", () => {
    expect(datasetSlug("···.csv")).toBe("");
  });
});

describe("downloadTextFile", () => {
  afterEach(() => vi.restoreAllMocks());

  it("descarga vía Blob + anchor sintético y libera la URL (cero red)", () => {
    const createObjectURL = vi.fn(() => "blob:fake-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    downloadTextFile("datos-puntuado.csv", "a,b\n1,2\n", "text/csv");

    expect(createObjectURL).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0]![0] as unknown as Blob;
    expect(blob.type).toBe("text/csv");
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake-url");
    vi.unstubAllGlobals();
  });
});
