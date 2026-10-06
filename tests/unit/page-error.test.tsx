// S7 (AU-S7-19): el límite de error de la ruta y el «Cargando…» de las fases que llegan
// en su propio chunk. Lo que falla al cargar un trozo se dice como tal; un error del
// código no se disfraza de «revisa tu conexión». A Sentry va solo el tipo (regla dura 2).
import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/provider";

const captureMessage = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureMessage: (...args: unknown[]) => captureMessage(...args),
  addBreadcrumb: vi.fn(),
}));

const { PageError, ScreenLoading, isChunkError } =
  await import("@/components/PageError");

const chunkError = () => {
  const error = new Error(
    "Failed to load chunk /_next/static/chunks/0a1b2c.js from module 1234",
  );
  error.name = "ChunkLoadError";
  return error;
};

describe("S7 (AU-S7-19): el límite de error y el «Cargando…»", () => {
  it("un chunk que no llegó: lo dice, con el botón de volver a empezar", () => {
    render(
      <I18nProvider>
        <PageError error={chunkError()} />
      </I18nProvider>,
    );
    expect(
      screen.getByText(
        "No se pudo cargar esta parte de la app. Revisa tu conexión y vuelve a intentarlo; tus datos siguen solo en este navegador.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Volver a empezar" }),
    ).toBeInTheDocument();
  });

  it("un error del código no se disfraza de «revisa tu conexión»", () => {
    render(
      <I18nProvider>
        <PageError error={new TypeError("x is undefined")} />
      </I18nProvider>,
    );
    expect(screen.queryByText(/Revisa tu conexión/)).toBeNull();
    expect(
      screen.getByText("Ocurrió un error al procesar. Intenta de nuevo."),
    ).toBeInTheDocument();
  });

  it("a Sentry va solo el tipo: ni el mensaje ni la ruta del chunk", () => {
    captureMessage.mockClear();
    render(
      <I18nProvider>
        <PageError error={chunkError()} />
      </I18nProvider>,
    );
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage.mock.calls[0]![0]).toBe(
      "experiment-error:render-chunk",
    );
    expect(JSON.stringify(captureMessage.mock.calls)).not.toMatch(
      /Failed to load|0a1b2c/,
    );
    expect(isChunkError(new Error("boom"))).toBe(false);
  });

  it("«Cargando…» se anuncia (role=status)", () => {
    render(
      <I18nProvider>
        <ScreenLoading />
      </I18nProvider>,
    );
    expect(screen.getByRole("status").textContent).toBe("Cargando…");
  });

  it("cada pantalla con chunk propio declara su «Cargando…»", () => {
    const page = readFileSync("src/app/page.tsx", "utf8");
    const dynamics = page.match(/dynamic\([\s\S]*?\)\s*,\s*\{[^}]*\}/g) ?? [];
    expect(dynamics.length).toBeGreaterThanOrEqual(4);
    for (const call of dynamics)
      expect(call, "una pantalla dinámica sin loading").toContain(
        "loading: ScreenLoading",
      );
    expect(readFileSync("src/app/error.tsx", "utf8")).toContain("PageError");
  });
});
