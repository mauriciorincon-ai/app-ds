// Protocolo DS (S11), etapa 6 — la pantalla en jsdom, con la compuerta real detrás:
//  · la sugerencia y su porqué; con fecha y unidad repetida, la pregunta de unidades primero;
//  · la tabla por lado muestra conteos y rangos y NINGÚN valor de las filas (prueba de «nunca filas»);
//  · elegir otro esquema pide la razón; la verificación y el sello dicen qué se contó y qué no promete;
//  · los sellos distintos se cuentan, y el cuaderno guarda sugerido, elegido, razón y sello.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatosEtapa } from "@/engine/protocolo/etapas";

vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}));

const { I18nProvider } = await import("@/i18n/provider");
const { Etapa6Form } = await import("@/components/protocolo/Etapa6Form");
const { registrar } = await import("@/engine/protocolo/compuerta");
const { ENTRADA_6_VACIA, datosEtapa6 } =
  await import("@/engine/protocolo/etapa6");
const { TAMANO_MAX, TAMANO_MIN } = await import("@/engine/protocolo/particion");
const { valoresDe } = await import("@/engine/protocolo/tabla");
const helpers = await import("./protocolo-etapa4-helpers");
const { AHORA, ENTRADA_BAJAS, ENTRADA_CREDITO, HUELLA, PROTOCOLO6, armar5 } =
  helpers;

const CREDITO = armar5("credito-fuga-plantada.csv", "binaria", ENTRADA_CREDITO);
const BAJAS = armar5("bajas-con-fuga.csv", "binaria", ENTRADA_BAJAS);
type Armado = typeof CREDITO;

function montar(
  armado: Armado,
  anterior: DatosEtapa | null = null,
  historia: readonly DatosEtapa[] = [],
) {
  const registrado: { datos: DatosEtapa | null; rechazo: unknown } = {
    datos: null,
    rechazo: null,
  };
  const onRegistrar = vi.fn((datos: DatosEtapa) => {
    const r = registrar(PROTOCOLO6, armado.cuaderno, 6, datos, {
      huella: HUELLA,
      tabla: armado.tabla,
      ahora: AHORA,
    });
    registrado.datos = r.ok ? datos : null;
    registrado.rechazo = r.ok ? null : r.rechazo;
    return r.ok ? null : r.rechazo;
  });
  const vista = render(
    <I18nProvider>
      <Etapa6Form
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
        anterior={anterior}
        previas={armado.previas}
        historia={historia}
        onRegistrar={onRegistrar}
      />
    </I18nProvider>,
  );
  return { ...vista, registrado };
}

const registrarClic = () =>
  fireEvent.click(screen.getByRole("button", { name: /Registrar la etapa 6/ }));
const nuevas = () =>
  fireEvent.click(
    screen.getByLabelText("Con unidades nuevas, que el modelo no vio"),
  );
const conocidas = () =>
  fireEvent.click(
    screen.getByLabelText("Con las mismas unidades, más adelante en el tiempo"),
  );
const horizonte = (n: string, unidad: "dias" | "meses") => {
  fireEvent.change(
    screen.getByLabelText("Horizonte: cuánto tarda en conocerse el resultado"),
    { target: { value: n } },
  );
  fireEvent.change(screen.getByLabelText("Unidad del horizonte"), {
    target: { value: unidad },
  });
};
const fila = (lado: string) =>
  document.querySelector<HTMLTableRowElement>(`tr[data-lado="${lado}"]`);

beforeEach(() => {
  window.localStorage.clear();
});

describe("crédito: sin fecha ni unidad", () => {
  it("sugiere estratificada con su porqué, sin preguntar por unidades", () => {
    montar(CREDITO);
    const s = screen.getByTestId("protocolo-sugerencia").textContent!;
    expect(s).toMatch(/Estratificada: al azar/);
    expect(s).toMatch(/no registró una fecha ni una unidad que se repita/);
    expect(
      screen.queryByText(/¿Tu modelo se usará con unidades nuevas/),
    ).toBeNull();
    expect(screen.getByLabelText("Estratificada · sugerido")).toBeChecked();
  });

  it("la tabla cuenta entrenamiento y prueba (sin hueco) y dice el tamaño real", () => {
    montar(CREDITO);
    expect(
      within(fila("entrenamiento")!).getAllByRole("cell")[0]!.textContent,
    ).toBe("160");
    expect(within(fila("prueba")!).getAllByRole("cell")[0]!.textContent).toBe(
      "40",
    );
    expect(fila("hueco")).toBeNull();
    expect(screen.getByTestId("protocolo-tamano-real").textContent).toMatch(
      /40 de 200 filas con objetivo \(20\.0 de cada 100\)/,
    );
    expect(screen.getByTestId("protocolo-verificacion").textContent).toMatch(
      /Ninguna fila está en dos lados/,
    );
  });

  it("el sello se ve corto, con lo que no promete; sin sellos previos lo dice", () => {
    montar(CREDITO);
    const sello = screen.getByTestId("protocolo-sello").textContent!;
    expect(sello).toMatch(/Sello: [0-9a-f]{12}…/);
    expect(sello).toMatch(/no una promesa/);
    expect(screen.getByTestId("protocolo-sellos").textContent).toBe(
      "Sin sellos en este cuaderno.",
    );
  });

  it("registrar pasa por la compuerta de verdad y registra lo que da el motor", () => {
    const { registrado } = montar(CREDITO);
    registrarClic();
    expect(registrado.rechazo).toBeNull();
    expect(registrado.datos).toEqual(
      datosEtapa6(
        CREDITO.tabla,
        { ...ENTRADA_6_VACIA, esquema: "estratificada" },
        CREDITO.previas,
        HUELLA,
      ),
    );
  });

  it("un tamaño fuera de rango lo rechaza la compuerta nombrando el rango", () => {
    const { registrado } = montar(CREDITO);
    fireEvent.change(
      screen.getByLabelText("Tamaño de la prueba (de cada 100 filas)"),
      { target: { value: "50" } },
    );
    registrarClic();
    expect(registrado.rechazo).toMatchObject({ faltan: ["tamano"] });
    expect(screen.getByRole("alert").textContent).toContain(
      `entre ${TAMANO_MIN} y ${TAMANO_MAX}`,
    );
  });
});

describe("bajas: fecha y unidad que se repite", () => {
  it("primero la pregunta de unidades: sin ella no hay sugerencia ni registro", () => {
    const { registrado } = montar(BAJAS);
    expect(screen.getByTestId("protocolo-sugerencia").textContent).toMatch(
      /Responde la pregunta de las unidades/,
    );
    registrarClic();
    expect(registrado.rechazo).toMatchObject({
      tipo: "criterio-no-cumplido",
    });
    expect(screen.getByRole("alert").textContent).toMatch(
      /unidades nuevas o con las que ya conoces/,
    );
  });

  it("con unidades nuevas sugiere tiempo y grupo; con un mes de hueco, la tabla tiene hueco y lo que queda fuera", () => {
    const { registrado } = montar(BAJAS);
    nuevas();
    expect(screen.getByTestId("protocolo-sugerencia").textContent).toMatch(
      /Por tiempo y por grupo/,
    );
    expect(
      screen.getByLabelText("Por tiempo y por grupo · sugerido"),
    ).toBeChecked();
    horizonte("1", "meses");
    expect(fila("hueco")).not.toBeNull();
    expect(fila("fuera")!.textContent).toMatch(
      /de unidades que están en la prueba/,
    );
    expect(screen.getByTestId("protocolo-tamano-real").textContent).toMatch(
      /La prueba empieza el 2025-09-15\./,
    );
    const v = screen.getByTestId("protocolo-verificacion").textContent!;
    expect(v).toMatch(
      /Ninguna unidad tiene filas en entrenamiento y en prueba/,
    );
    expect(v).toMatch(
      /Ninguna fila de entrenamiento está a menos de un horizonte/,
    );
    registrarClic();
    expect(registrado.rechazo).toBeNull();
    expect(registrado.datos?.respuestas).toMatchObject({
      unidades: "nuevas",
      esquema: "tiempo-grupo",
      horizonte: 1,
      horizonte_unidad: "meses",
    });
  });

  it("nunca filas: ningún valor de la unidad ni de otra columna de identificación aparece en la pantalla", () => {
    const { container } = montar(BAJAS);
    nuevas();
    horizonte("1", "meses");
    const pantalla = container.textContent!;
    for (const columna of ["cliente_id", "referencia"])
      for (const valor of new Set(valoresDe(BAJAS.tabla, columna)))
        if (valor.trim() !== "")
          expect(pantalla, `${columna}: ${valor}`).not.toContain(valor);
  });

  it("elegir otro esquema pide la razón; sin ella la compuerta lo nombra, con ella registra", () => {
    const { registrado } = montar(BAJAS);
    nuevas();
    fireEvent.click(screen.getByLabelText("Estratificada"));
    const razon = screen.getByLabelText(
      "¿Por qué eliges otro esquema que el sugerido?",
    );
    expect(razon).toHaveAttribute("maxlength", "500");
    registrarClic();
    expect(registrado.rechazo).toMatchObject({ faltan: ["razon"] });
    fireEvent.change(razon, { target: { value: "Una primera mirada rápida" } });
    registrarClic();
    expect(registrado.rechazo).toBeNull();
    expect(registrado.datos?.respuestas.razon).toBe(
      "Una primera mirada rápida",
    );
    // lo que se arriesga, dicho en los datos
    expect(
      screen.getByText(
        /unidades tienen filas en los dos lados: el error que midas vale para unidades conocidas/,
      ),
    ).toBeTruthy();
  });

  it("con unidades conocidas sugiere solo por tiempo, y las unidades en los dos lados se dicen", () => {
    montar(BAJAS);
    conocidas();
    expect(screen.getByLabelText("Por tiempo · sugerido")).toBeChecked();
    horizonte("1", "meses");
    expect(
      screen.getByText(
        /es lo que pediste, porque el modelo se usará con las mismas unidades/,
      ),
    ).toBeTruthy();
  });
});

describe("los sellos y el cuaderno", () => {
  const otra = datosEtapa6(
    BAJAS.tabla,
    {
      ...ENTRADA_6_VACIA,
      unidades: "conocidas",
      esquema: "tiempo",
      horizonte: 1,
      horizonteUnidad: "meses",
    },
    BAJAS.previas,
    HUELLA,
  );

  it("con un sello distinto en el cuaderno, lo cuenta y la trampa avisa que es otra forma de mirar", () => {
    montar(BAJAS, null, [otra]);
    expect(screen.getByTestId("protocolo-sellos").textContent).toMatch(
      /Pruebas distintas selladas en este cuaderno: 1\./,
    );
    nuevas();
    horizonte("1", "meses");
    expect(
      screen.getByText(/Sellaste 2 pruebas distintas en este cuaderno/),
    ).toBeTruthy();
  });

  it("al corregir, la pantalla vuelve con lo registrado", () => {
    montar(BAJAS, otra, [otra]);
    expect(
      screen.getByLabelText(
        "Con las mismas unidades, más adelante en el tiempo",
      ),
    ).toBeChecked();
    expect(
      screen.getByLabelText(
        "Horizonte: cuánto tarda en conocerse el resultado",
      ),
    ).toHaveValue("1");
    expect(screen.getByLabelText("Unidad del horizonte")).toHaveValue("meses");
    // volver a sellar la misma partición no suma una mirada
    expect(screen.queryByText(/Sellaste 2 pruebas distintas/)).toBeNull();
  });

  it("el cuaderno dice el horizonte en singular cuando es uno («1 mes», no «1 meses»)", async () => {
    const { CuadernoPanel } =
      await import("@/components/protocolo/CuadernoPanel");
    const r = registrar(PROTOCOLO6, BAJAS.cuaderno, 6, otra, {
      huella: HUELLA,
      tabla: BAJAS.tabla,
      ahora: AHORA,
    });
    if (!r.ok) throw new Error(JSON.stringify(r.rechazo));
    render(
      <I18nProvider>
        <CuadernoPanel
          cuaderno={r.cuaderno}
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
    expect(screen.getByTestId("cuaderno-resumen6").textContent).toMatch(
      /La prueba empieza el 2025-09-15; horizonte de 1 mes\./,
    );
  });

  it("el cuaderno resume el esquema con el sugerido y la razón, los lados, el sello y los sellos", async () => {
    const { CuadernoPanel } =
      await import("@/components/protocolo/CuadernoPanel");
    const d = datosEtapa6(
      BAJAS.tabla,
      {
        ...ENTRADA_6_VACIA,
        unidades: "nuevas",
        esquema: "estratificada",
        razon: "Una primera mirada",
      },
      BAJAS.previas,
      HUELLA,
    );
    const r = registrar(PROTOCOLO6, BAJAS.cuaderno, 6, d, {
      huella: HUELLA,
      tabla: BAJAS.tabla,
      ahora: AHORA,
    });
    if (!r.ok) throw new Error(JSON.stringify(r.rechazo));
    render(
      <I18nProvider>
        <CuadernoPanel
          cuaderno={r.cuaderno}
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
    const resumen = screen.getByTestId("cuaderno-resumen6").textContent!;
    expect(resumen).toMatch(
      /Esquema: Estratificada\. La app sugirió Por tiempo y por grupo; tu razón: «Una primera mirada»\./,
    );
    expect(resumen).toMatch(/El modelo se usará con unidades nuevas\./);
    expect(resumen).toMatch(
      /Entrenamiento: 384 filas · prueba: 96 · hueco: 0 · fuera: 0\./,
    );
    expect(resumen).toMatch(/Sello: [0-9a-f]{12}…/);
    expect(resumen).toMatch(/Pruebas distintas selladas en este cuaderno: 1\./);
    // no vuelca los mapas ni las listas crudas
    expect(resumen).not.toContain("clases_prueba");
  });
});

// S12 — deuda del S11 (medio): «elegido» no se queda pegado a lo que ya era el sugerido.
describe("corregir sin quedar pegado al esquema de antes", () => {
  const RAZON = "¿Por qué eliges otro esquema que el sugerido?";
  const conSugerido = datosEtapa6(
    BAJAS.tabla,
    {
      ...ENTRADA_6_VACIA,
      unidades: "nuevas",
      esquema: "tiempo-grupo",
      horizonte: 1,
      horizonteUnidad: "meses",
    },
    BAJAS.previas,
    HUELLA,
  );

  it("lo registrado con el sugerido sigue al sugerido de hoy: al cambiar las unidades no pide razón", () => {
    montar(BAJAS, conSugerido, [conSugerido]);
    conocidas();
    expect(screen.getByLabelText("Por tiempo · sugerido")).toBeChecked();
    expect(screen.queryByLabelText(RAZON)).toBeNull();
  });

  it("lo registrado como otro esquema, con su razón, se precarga", () => {
    const otro = datosEtapa6(
      BAJAS.tabla,
      {
        ...ENTRADA_6_VACIA,
        unidades: "nuevas",
        esquema: "estratificada",
        razon: "Una primera mirada rápida",
      },
      BAJAS.previas,
      HUELLA,
    );
    montar(BAJAS, otro, [otro]);
    expect(screen.getByLabelText("Estratificada")).toBeChecked();
    expect(screen.getByLabelText(RAZON)).toHaveValue(
      "Una primera mirada rápida",
    );
  });

  it("elegir otro y volver al sugerido no lo deja pegado: al cambiar las unidades sigue al nuevo sugerido", () => {
    montar(BAJAS);
    nuevas();
    fireEvent.click(screen.getByLabelText("Estratificada"));
    fireEvent.click(screen.getByLabelText("Por tiempo y por grupo · sugerido"));
    conocidas();
    expect(screen.getByLabelText("Por tiempo · sugerido")).toBeChecked();
    expect(screen.queryByLabelText(RAZON)).toBeNull();
  });
});
