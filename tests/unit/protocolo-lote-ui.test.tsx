// Sprint 016 (cierre de H-2) — regresiones del lote de medios y bajos de la pantalla, cada una con su sprint e id:
//  · S8 B4: los textos de las etapas 1 y 3 se topan al largo que la etapa acepta (antes el campo dejaba escribir más y la
//    compuerta rechazaba con un mensaje equivocado);
//  · S9 B1: «(1 entrada)», no «(1 entradas)», en los dos diálogos que cuentan entradas del cuaderno;
//  · S9 B5: dos columnas con el mismo encabezado no repiten la clave de React en la lista de casillas;
//  · S9 B9: junto a «Exportar cuaderno» se dice qué lleva el archivo;
//  · S11: un esquema vacío (evidencia a mano) se ve «—», no la clave cruda;
//  · S8 B8: el término del glosario mide 44 px a cualquier ancho;
//  · S8 M1 y B9: el supuesto de la muestra se dice en pantalla y un aviso viejo no sobrevive a «suficiente»;
//  · S12: el puntaje de la liga se rotula «de selección» (sirve para elegir, no para creer).
import { readFileSync } from "node:fs";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}));

const { I18nProvider } = await import("@/i18n/provider");
const { ProtocoloApp } = await import("@/components/protocolo/ProtocoloApp");
const { CuadernoPanel } = await import("@/components/protocolo/CuadernoPanel");
const { CampoCasillas } = await import("@/components/protocolo/campos");
const { cuadernoVacio } = await import("@/engine/protocolo/cuaderno");
const { translate } = await import("@/i18n/translate");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("S8 B4 · los textos de las etapas 1 y 3 tienen su largo máximo", () => {
  it("la decisión, el decisor, el momento, lo de hoy y la unidad topan en 1000", async () => {
    render(
      <I18nProvider>
        <ProtocoloApp />
      </I18nProvider>,
    );
    const decision = await screen.findByLabelText("La decisión");
    expect(decision.getAttribute("maxlength")).toBe("1000");
    for (const etiqueta of [
      /Quién la toma/,
      /Cuándo se toma/,
      /Qué se hace hoy sin modelo/,
      /Unidad de costo/,
    ]) {
      const campo = screen.getByLabelText(etiqueta);
      expect(campo.getAttribute("maxlength")).toBe("1000");
    }
  });

  it("las etapas 1 y 3 pasan `maximo` a todos sus textos (no solo a los que alguien recordó)", () => {
    const etapa1 = readFileSync(
      "src/components/protocolo/Etapa1Form.tsx",
      "utf8",
    );
    // 5 textos: decisión, decisor, cuándo, lo de hoy, unidad
    expect(etapa1.match(/maximo=\{TEXTO_MAX\}/g)?.length).toBe(5);
    const etapa3 = readFileSync(
      "src/components/protocolo/Etapa3Form.tsx",
      "utf8",
    );
    // 4 textos: población, periodo, exclusiones, aviso
    expect(etapa3.match(/maximo=\{FICHA_MAX\}/g)?.length).toBe(4);
  });
});

describe("S9 B1 · el plural de las entradas del cuaderno", () => {
  it.each([
    [
      "es",
      "protocol.data.different.replace-body",
      { n: 1, count: 1 },
      "(1 entrada)",
    ],
    [
      "es",
      "protocol.data.different.replace-body",
      { n: 3, count: 3 },
      "(3 entradas)",
    ],
    [
      "en",
      "protocol.data.different.replace-body",
      { n: 1, count: 1 },
      "(1 entry)",
    ],
    [
      "en",
      "protocol.data.different.replace-body",
      { n: 3, count: 3 },
      "(3 entries)",
    ],
    [
      "es",
      "protocol.notebook.import-confirm.body",
      { now: 1, count: 1, incoming: 4 },
      "tiene 1 entrada y",
    ],
    [
      "es",
      "protocol.notebook.import-confirm.body",
      { now: 2, count: 2, incoming: 4 },
      "tiene 2 entradas y",
    ],
    [
      "en",
      "protocol.notebook.import-confirm.body",
      { now: 1, count: 1, incoming: 4 },
      "has 1 entry and",
    ],
  ] as const)("%s · %s con %j dice «%s»", (idioma, clave, params, esperado) => {
    expect(translate(idioma, clave, params)).toContain(esperado);
  });

  it("los sitios que llaman pasan `count`", () => {
    expect(
      readFileSync("src/components/protocolo/CargaDatos.tsx", "utf8"),
    ).toMatch(/count: cuaderno\.evidencias\.length/);
    expect(
      readFileSync("src/components/protocolo/CuadernoPanel.tsx", "utf8"),
    ).toMatch(/count: cuaderno\.evidencias\.length/);
  });
});

describe("S9 B5 · encabezados repetidos en la lista de casillas", () => {
  it("no repite la clave de React y pinta una casilla por cada columna", () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    render(
      <I18nProvider>
        <CampoCasillas
          leyenda="Columnas"
          opciones={["edad", "edad", "ciudad"]}
          marcadas={[]}
          onCambio={() => undefined}
        />
      </I18nProvider>,
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    const avisos = error.mock.calls.map((c) => String(c[0]));
    expect(
      avisos.some((a) => /same key|misma clave|unique "key"/i.test(a)),
    ).toBe(false);
  });
});

describe("S9 B9 · junto a «Exportar cuaderno» se dice qué lleva el archivo", () => {
  it("la nota nombra lo derivado, lo que marcaste en la etapa 10 y que no hay filas", async () => {
    render(
      <I18nProvider>
        <ProtocoloApp />
      </I18nProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("protocolo-exportar-nota")).toBeTruthy(),
    );
    const nota =
      screen.getByTestId("protocolo-exportar-nota").textContent ?? "";
    expect(nota).toMatch(/derivado de tus datos/);
    expect(nota).toMatch(/columnas de texto que marcaste en la etapa 10/);
    expect(nota).toMatch(/ninguna fila de tu CSV/);
    // los otros orígenes de nombres de categorías (auditoría S16, H-07): el objetivo, los segmentos de la 8 y la regla de la 5
    expect(nota).toMatch(
      /categorías del objetivo y de los segmentos de la etapa 8/,
    );
    expect(nota).toMatch(/valores que elegiste en la regla de la etapa 5/);
  });
});

describe("S11 · un esquema vacío no muestra una clave cruda", () => {
  it("el resumen de la etapa 6 con el esquema vacío pone «—»", () => {
    const cuaderno = {
      ...cuadernoVacio(new Date("2026-10-21T12:00:00Z")),
      evidencias: [
        {
          etapa: 6,
          seq: 1,
          fecha: "2026-10-21T12:00:00.000Z",
          huella: null,
          base: {},
          datos: { respuestas: { esquema: "", sugerido: "" }, chequeos: {} },
        },
      ],
    } as unknown as Parameters<typeof CuadernoPanel>[0]["cuaderno"];
    render(
      <I18nProvider>
        <CuadernoPanel
          cuaderno={cuaderno}
          guardado={null}
          importePendiente={null}
          onExportar={() => ({ nombre: "x.json", contenido: "{}" })}
          onImportar={() => undefined}
          onConfirmarImporte={() => undefined}
          onDescartarImporte={() => undefined}
          onNuevo={() => undefined}
        />
      </I18nProvider>,
    );
    const resumen = screen.getByTestId("cuaderno-resumen6").textContent ?? "";
    expect(resumen).not.toContain("protocol.stage.6.scheme");
  });
});

describe("S8 B8 · el término del glosario mide 44 px a cualquier ancho", () => {
  it("el enlace no baja a 32 px desde `sm`", () => {
    const fuente = readFileSync(
      "src/components/protocolo/Glosario.tsx",
      "utf8",
    );
    expect(fuente).toContain("min-h-11");
    expect(fuente).not.toMatch(/sm:min-h-8/);
  });
});

describe("S8 M1 y B9 · la muestra de la etapa 3", () => {
  async function montarEtapa3(grande = false) {
    const { Etapa3Form } = await import("@/components/protocolo/Etapa3Form");
    const { armar, tablaDe, ENTRADA_CREDITO, AHORA, HUELLA } =
      await import("./protocolo-etapa4-helpers");
    // 2 000 filas a mitad y mitad: con pocos parámetros la muestra alcanza (el kit tiene 200 filas y nunca alcanza)
    const sintetica = tablaDe(
      [
        "x1,x2,incumplio",
        ...Array.from(
          { length: 2000 },
          (_, i) => `${i % 7},${i % 11},${i % 2}`,
        ),
      ].join("\n"),
    );
    const armado = grande
      ? armar("sintetico.csv", "binaria", ENTRADA_CREDITO, sintetica)
      : armar("credito-fuga-plantada.csv", "binaria", ENTRADA_CREDITO);
    const onRegistrar = vi.fn(() => null);
    render(
      <I18nProvider>
        <Etapa3Form
          datos={{
            tabla: armado.tabla,
            carga: {
              fecha: AHORA.toISOString(),
              sha256: HUELLA,
              nombre: "datos.csv",
              filas: armado.tabla.rows.length,
              columnas: armado.tabla.headers.length,
            },
          }}
          anterior={null}
          previas={{ 1: armado.previas[1], 2: armado.previas[2] }}
          onRegistrar={onRegistrar}
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByLabelText("Predecir lo que va a pasar"));
    return onRegistrar;
  }

  it("con dos clases se dice que el R² de Nagelkerke es un supuesto, no algo medido", async () => {
    await montarEtapa3();
    const nota = await screen.findByTestId("protocolo-supuesto");
    expect(nota.textContent).toMatch(/supone un R² de Nagelkerke de/);
    expect(nota.textContent).toMatch(
      /es un supuesto, no algo medido en tus datos/,
    );
  });

  it("un aviso escrito cuando la muestra no alcanzaba no se registra cuando ya alcanza", async () => {
    const onRegistrar = await montarEtapa3(true);
    fireEvent.change(screen.getByLabelText("Población"), {
      target: { value: "Clientes con crédito" },
    });
    fireEvent.change(screen.getByLabelText("Exclusiones"), {
      target: { value: "Ninguna" },
    });
    fireEvent.change(screen.getByLabelText("Periodo"), {
      target: { value: "2025" },
    });
    // muchos parámetros: no alcanza y pide el aviso
    fireEvent.change(screen.getByLabelText("Parámetros candidatos"), {
      target: { value: "5000" },
    });
    fireEvent.change(await screen.findByLabelText("Tu aviso"), {
      target: { value: "Es un piloto; lo sé" },
    });
    // pocos parámetros: alcanza, el campo desaparece y el aviso viejo no viaja
    fireEvent.change(screen.getByLabelText("Parámetros candidatos"), {
      target: { value: "1" },
    });
    await waitFor(() => expect(screen.queryByLabelText("Tu aviso")).toBeNull());
    fireEvent.click(
      screen.getByRole("button", { name: /Registrar la etapa 3/ }),
    );
    expect(onRegistrar).toHaveBeenCalledTimes(1);
    const [datos] = onRegistrar.mock.calls[0] as unknown as [
      { respuestas: Record<string, unknown> },
    ];
    expect(datos.respuestas.aviso).toBe("");
  });
});

describe("S12 · el puntaje de la liga se rotula «de selección»", () => {
  it.each([
    ["es", /puntaje de selección .*sirve para elegir, no para creer/],
    ["en", /selection score .*good for choosing, not for believing/],
  ] as const)("el porqué del ganador en %s", (idioma, patron) => {
    const dic = JSON.parse(
      readFileSync(`messages/etapas/etapa7.${idioma}.json`, "utf8"),
    ) as { protocol: { stage: { "7": { why: Record<string, string> } } } };
    const textos = dic.protocol.stage["7"].why;
    expect(textos.same).toMatch(patron);
    expect(textos.simpler).toMatch(patron);
  });
});

// Auditoría del S16: los pagos de texto y de plural que no tenían prueba que fallara antes (H-01, H-02, H-11, H-15, H-16).
type Dic = { [clave: string]: string | Dic };
const leerDic = (ruta: string): Dic =>
  JSON.parse(readFileSync(ruta, "utf8")) as Dic;
const enRuta = (dic: Dic, ruta: string): string => {
  let actual: string | Dic | undefined = dic;
  for (const parte of ruta.split("."))
    actual = typeof actual === "object" ? actual[parte] : undefined;
  return typeof actual === "string" ? actual : "";
};

describe("S13 B2 · «ninguna fila» deja de ser falso", () => {
  it.each([
    ["es", /^Ninguna fila de la prueba tuvo un costo mayor que cero\.$/],
    ["en", /^No row of the test set had a cost above zero\.$/],
  ] as const)(
    "el peor segmento sin costos lo dice así en %s",
    (idioma, patron) => {
      const dic = leerDic(`messages/etapas/etapa8.${idioma}.json`);
      expect(enRuta(dic, "protocol.stage.8.worst.empty")).toMatch(patron);
    },
  );
});

describe("S12 · lo que la etapa 8 mide y no mide, dicho igual en toda la etapa 6", () => {
  it.each(["es", "en"] as const)(
    "ningún texto de la etapa 6 dice que la 8 «mide» una clase (%s)",
    (idioma) => {
      const dic = leerDic(`messages/${idioma}.json`);
      for (const clave of ["clase-rara", "clase-escasa", "clase-ausente"]) {
        const texto = enRuta(dic, `protocol.stage.6.trap.${clave}`);
        expect(texto, clave).not.toBe("");
        expect(texto, clave).not.toMatch(
          /(lo que mida la etapa 8 para esa clase|no podrá medir esa clase|what stage 8 measures for that class|able to measure that class)/,
        );
      }
    },
  );

  it("las trampas de la regla de hoy comparan con «la mejor forma de decidir sin modelo», no con «decidir siempre igual»", () => {
    for (const idioma of ["es", "en"] as const) {
      const dic = leerDic(`messages/${idioma}.json`);
      for (const clave of ["regla-peor", "regla-igual"])
        expect(
          enRuta(dic, `protocol.stage.5.trap.${clave}`),
          `${idioma} ${clave}`,
        ).not.toMatch(/siempre igual|always deciding the same/);
    }
  });
});

describe("S9 B1 · los plurales de la etapa 5", () => {
  it.each([
    ["es", "no-previous_one", /^1 fila no tiene/],
    ["es", "rule.measure_one", /de 1 fila\.$/],
    ["es", "rule.empties_one", /^En 1 fila alguna/],
    ["en", "no-previous_one", /^1 row has no/],
    ["en", "rule.measure_one", /of 1 row\.$/],
    ["en", "rule.empties_one", /^In 1 row one/],
  ] as const)("%s · %s", (idioma, clave, patron) => {
    const dic = leerDic(`messages/etapas/etapa5.${idioma}.json`);
    expect(enRuta(dic, `protocol.stage.5.${clave}`)).toMatch(patron);
  });

  it("el resumen del cuaderno también tiene su forma singular, y los sitios que llaman pasan `count`", () => {
    expect(
      translate("es", "protocol.stage.5.summary.no-previous", {
        n: 1,
        count: 1,
      }),
    ).toContain("en 1 fila ");
    expect(
      translate("en", "protocol.stage.5.summary.no-previous", {
        n: 1,
        count: 1,
      }),
    ).toContain("in 1 row ");
    const form = readFileSync(
      "src/components/protocolo/Etapa5Form.tsx",
      "utf8",
    );
    expect(form.match(/count: /g)?.length).toBeGreaterThanOrEqual(3);
    expect(
      readFileSync("src/components/protocolo/CuadernoPanel.tsx", "utf8"),
    ).toMatch(/count: r\.sinAnterior/);
  });

  it("la referencia se mide sobre las filas con objetivo, no sobre «todas» (H-16)", () => {
    expect(
      enRuta(
        leerDic("messages/etapas/etapa5.es.json"),
        "protocol.stage.5.table.note",
      ),
    ).toMatch(/filas con objetivo/);
    expect(
      enRuta(
        leerDic("messages/etapas/etapa5.en.json"),
        "protocol.stage.5.table.note",
      ),
    ).toMatch(/rows with a target/);
  });
});
