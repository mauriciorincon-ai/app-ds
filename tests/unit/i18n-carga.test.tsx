// S11: el inglés ya no va en el bundle de cada página: llega con `import()` al elegirlo. Estas
// pruebas reinician los módulos para ver la carga de verdad (tests/setup.ts registra el inglés de
// entrada, así que las demás pruebas siguen siendo síncronas). Todo se importa DESPUÉS del
// reinicio, para que React, Testing Library y el provider compartan una sola copia.
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const JSON_EN = path.resolve(process.cwd(), "messages/en.json");
const EN_MINI = {
  language: {
    label: "Language",
    es: "Español",
    en: "English",
    failed: "x",
  },
};

async function fresco() {
  vi.resetModules();
  const rtl = await import("@testing-library/react");
  const { I18nProvider } = await import("@/i18n/provider");
  const { LangToggle } = await import("@/components/LangToggle");
  const dic = await import("@/i18n/dictionaries");
  const { translate } = await import("@/i18n/translate");
  return { ...rtl, I18nProvider, LangToggle, dic, translate };
}

function puerta() {
  let abrir!: () => void;
  const esperar = new Promise<void>((resolve) => {
    abrir = resolve;
  });
  return { abrir, esperar };
}

describe("el inglés se carga bajo demanda", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.doUnmock(JSON_EN);
    vi.resetModules();
    window.localStorage.clear();
  });

  it("sin cargar, traducir al inglés cae al español: jamás la clave cruda", async () => {
    const { dic, translate } = await fresco();
    expect(dic.diccionarioDe("en")).toBeUndefined();
    expect(dic.estadoDeIdioma("en")).toBe("cargando");
    expect(translate("en", "language.label")).toBe("Idioma");
    expect(translate("en", "no.existe.esta.clave")).toBe(
      "no.existe.esta.clave",
    );
  });

  it("una carga que falla lo dice, deja el español y se reintenta al volver a pedirla", async () => {
    const { dic, translate } = await fresco();
    const falla = vi.fn(() => Promise.reject(new Error("sin red")));
    expect(await dic.cargarIdioma("en", falla)).toBe(false);
    expect(dic.estadoDeIdioma("en")).toBe("fallo");
    expect(translate("en", "language.label")).toBe("Idioma");

    const sirve = vi.fn(() => Promise.resolve({ default: EN_MINI }));
    expect(await dic.cargarIdioma("en", sirve)).toBe(true);
    expect(dic.estadoDeIdioma("en")).toBe("lista");
    expect(translate("en", "language.label")).toBe("Language");
    // ya en memoria: no vuelve a pedirlo
    expect(await dic.cargarIdioma("en", sirve)).toBe(true);
    expect(sirve).toHaveBeenCalledTimes(1);
  });

  it("dos pedidos a la vez comparten una sola carga", async () => {
    const { dic } = await fresco();
    const { abrir, esperar } = puerta();
    const lento = vi.fn(async () => {
      await esperar;
      return { default: EN_MINI };
    });
    const [a, b] = [
      dic.cargarIdioma("en", lento),
      dic.cargarIdioma("en", lento),
    ];
    abrir();
    expect(await a).toBe(true);
    expect(await b).toBe(true);
    expect(lento).toHaveBeenCalledTimes(1);
  });

  it("la persona que ya había elegido inglés ve español hasta que llega, y luego inglés", async () => {
    const { abrir, esperar } = puerta();
    vi.doMock(JSON_EN, async () => {
      await esperar;
      return { default: EN_MINI };
    });
    const { render, screen, waitFor, act, I18nProvider, LangToggle } =
      await fresco();
    window.localStorage.setItem("probeta-ds.locale", "en");
    render(
      <I18nProvider>
        <LangToggle />
      </I18nProvider>,
    );
    // pidió inglés (el botón lo muestra), pero se pinta en español mientras carga
    const nav = await screen.findByRole("navigation");
    expect(nav).toHaveAttribute("aria-label", "Idioma");
    await waitFor(() => expect(nav).toHaveAttribute("aria-busy", "true"));
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(document.documentElement.lang).toBe("es");

    await act(async () => abrir());
    await waitFor(() =>
      expect(screen.getByRole("navigation")).toHaveAttribute(
        "aria-label",
        "Language",
      ),
    );
    expect(screen.getByRole("navigation")).not.toHaveAttribute("aria-busy");
    expect(document.documentElement.lang).toBe("en");
  });

  it("si el inglés no llega, la página sigue en español y avisa", async () => {
    vi.doMock(JSON_EN, () => {
      throw new Error("sin red");
    });
    const { render, screen, I18nProvider, LangToggle } = await fresco();
    window.localStorage.setItem("probeta-ds.locale", "en");
    render(
      <I18nProvider>
        <LangToggle />
      </I18nProvider>,
    );
    const aviso = await screen.findByTestId("idioma-fallo");
    expect(aviso).toHaveAttribute("role", "status");
    expect(aviso.textContent).toContain("sigue en español");
    expect(screen.getByRole("navigation")).toHaveAttribute(
      "aria-label",
      "Idioma",
    );
    expect(document.documentElement.lang).toBe("es");
  });
});
