// Protocolo DS (S13, G-Plan 1a; la 9 desde el S14, la 10 desde el S15): las formas de las etapas 4 a 10 traen sus textos en su chunk. Montadas con la
// compuerta real detrás, en los dos idiomas, ninguna pinta una clave cruda (`protocol.stage.…`), y en inglés
// pintan el texto del archivo inglés de su forma, no un español de relleno. El gate de textos-etapa.test.ts
// mira las claves en el código; esta mira lo que sale en pantalla.
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatosEtapa } from "@/engine/protocolo/etapas";
import type { TextosEtapa } from "@/i18n/textos-etapa";

vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}));

const { I18nProvider } = await import("@/i18n/provider");
const { LOCALE_STORAGE_KEY } = await import("@/i18n/config");
const { Etapa4Form } = await import("@/components/protocolo/Etapa4Form");
const { Etapa5Form } = await import("@/components/protocolo/Etapa5Form");
const { Etapa6Form } = await import("@/components/protocolo/Etapa6Form");
const { Etapa7Form } = await import("@/components/protocolo/Etapa7Form");
const { Etapa8Form } = await import("@/components/protocolo/Etapa8Form");
const { Etapa9Form } = await import("@/components/protocolo/Etapa9Form");
const { Etapa10Form } = await import("@/components/protocolo/Etapa10Form");
const { TEXTOS_ETAPA_4 } = await import("@/components/protocolo/textos/etapa4");
const { TEXTOS_ETAPA_5 } = await import("@/components/protocolo/textos/etapa5");
const { TEXTOS_ETAPA_6 } = await import("@/components/protocolo/textos/etapa6");
const { TEXTOS_ETAPA_7 } = await import("@/components/protocolo/textos/etapa7");
const { TEXTOS_ETAPA_8 } = await import("@/components/protocolo/textos/etapa8");
const { TEXTOS_ETAPA_9 } = await import("@/components/protocolo/textos/etapa9");
const { TEXTOS_ETAPA_10 } =
  await import("@/components/protocolo/textos/etapa10");
const h8 = await import("./protocolo-etapa8-helpers");
const h9 = await import("./protocolo-etapa9-helpers");
const h10 = await import("./protocolo-etapa10-helpers");
const h = await import("./protocolo-etapa4-helpers");

const CREDITO = {
  tres: h.armar("credito-fuga-plantada.csv", "binaria", h.ENTRADA_CREDITO),
  cuatro: h.armar4("credito-fuga-plantada.csv", "binaria", h.ENTRADA_CREDITO),
  cinco: h.armar5("credito-fuga-plantada.csv", "binaria", h.ENTRADA_CREDITO),
  seis: h.armar6(
    "credito-fuga-plantada.csv",
    "binaria",
    h.ENTRADA_CREDITO,
    h.ENTRADA_6_CREDITO,
  ),
  siete: h8.armarCredito7(),
  ocho: h9.armarCredito8(),
  nueve: h10.armarCredito9("usar"),
};

type Previas = Parameters<typeof Etapa4Form>[0]["previas"];
const FORMAS: [number, typeof Etapa4Form, Previas, TextosEtapa][] = [
  [4, Etapa4Form, CREDITO.tres.previas, TEXTOS_ETAPA_4],
  [5, Etapa5Form, CREDITO.cuatro.previas, TEXTOS_ETAPA_5],
  [6, Etapa6Form, CREDITO.cinco.previas, TEXTOS_ETAPA_6],
  [7, Etapa7Form, CREDITO.seis.previas, TEXTOS_ETAPA_7],
  [8, Etapa8Form, CREDITO.siete.previas, TEXTOS_ETAPA_8],
  [9, Etapa9Form, CREDITO.ocho.previas, TEXTOS_ETAPA_9],
  [
    10,
    Etapa10Form as typeof Etapa4Form,
    CREDITO.nueve.previas,
    TEXTOS_ETAPA_10,
  ],
];

/** Los textos de la forma que no llevan marcadores: los que salen tal cual en pantalla. */
function textosLlanos(d: TextosEtapa["es"]): string[] {
  return Object.values(d).flatMap((v) =>
    typeof v === "string" ? (/[{}]/.test(v) ? [] : [v]) : textosLlanos(v),
  );
}

describe.each(["es", "en"] as const)("las formas 4 a 10 en %s", (idioma) => {
  beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, idioma));
  afterEach(() => {
    cleanup();
    localStorage.removeItem(LOCALE_STORAGE_KEY);
  });

  it.each(FORMAS)(
    "etapa %i: ninguna clave cruda, y el texto es el de su idioma",
    (n, Forma, previas, textos) => {
      const armado =
        n === 10
          ? CREDITO.nueve
          : n === 9
            ? CREDITO.ocho
            : n === 8
              ? CREDITO.siete
              : n === 7
                ? CREDITO.seis
                : CREDITO.cinco;
      const { container } = render(
        <I18nProvider>
          <Forma
            datos={{
              tabla: armado.tabla,
              carga: {
                fecha: h.AHORA.toISOString(),
                sha256: h.HUELLA,
                nombre: "datos.csv",
                filas: armado.tabla.rows.length,
                columnas: armado.tabla.headers.length,
              },
            }}
            anterior={null as DatosEtapa | null}
            previas={previas}
            historia={[]}
            onRegistrar={() => null}
          />
        </I18nProvider>,
      );
      const pantalla = container.textContent ?? "";
      expect(pantalla.length, "la forma no pintó nada").toBeGreaterThan(80);
      expect(pantalla).not.toMatch(/protocol\.stage\./);
      expect(pantalla).not.toMatch(/\b(results|common|league)\.[a-z]/);
      // el texto es del idioma pedido: algo del archivo de ese idioma está en pantalla
      const propios = textosLlanos(textos[idioma]).filter(
        (t) => t.length > 12 && pantalla.includes(t),
      );
      expect(propios.length, `textos de ${idioma} en pantalla`).toBeGreaterThan(
        0,
      );
    },
  );
});
