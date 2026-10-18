// Protocolo DS (S10), etapa 5 — la pantalla en jsdom, con la compuerta real detrás:
//  · la tabla de referencias dice que es una referencia, y la regla de hoy se mide en vivo con el
//    mismo número que da el motor;
//  · la regla solo ofrece columnas que la etapa 4 dejó en «usar» y operadores según el tipo;
//  · la salida cambia con la forma de la decisión (sí o no · varias opciones · un número);
//  · hasta dos condiciones, el foco sigue a la acción, y registrar pasa por el criterio de verdad.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatosEtapa } from "@/engine/protocolo/etapas";

vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}));

const { I18nProvider } = await import("@/i18n/provider");
const { cifra } = await import("@/lib/protocolo/formato");
const { Etapa5Form } = await import("@/components/protocolo/Etapa5Form");
const { registrar } = await import("@/engine/protocolo/compuerta");
const { ENTRADA_5_VACIA, datosEtapa5, por100 } =
  await import("@/engine/protocolo/etapa5");
const helpers = await import("./protocolo-etapa4-helpers");
const { AHORA, ENTRADA_CREDITO, HUELLA, PROTOCOLO5, armar4, csv, etapa1De } =
  helpers;

const CREDITO = armar4("credito-fuga-plantada.csv", "binaria", ENTRADA_CREDITO);

type Armado = typeof CREDITO;

function montar(armado: Armado = CREDITO, anterior: DatosEtapa | null = null) {
  const registrado: { datos: DatosEtapa | null; rechazo: unknown } = {
    datos: null,
    rechazo: null,
  };
  const onRegistrar = vi.fn((datos: DatosEtapa) => {
    const r = registrar(PROTOCOLO5, armado.cuaderno, 5, datos, {
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
      <Etapa5Form
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
        onRegistrar={onRegistrar}
      />
    </I18nProvider>,
  );
  return { ...vista, registrado, onRegistrar };
}

const elegir = (etiqueta: string | RegExp, valor: string, en?: HTMLElement) => {
  const campo = (en ? within(en) : screen).getByLabelText(etiqueta);
  fireEvent.change(campo, { target: { value: valor } });
};
const condicion = (n: number) =>
  document.querySelector<HTMLElement>(`[data-condicion="${n}"]`)!;
const hayRegla = () =>
  fireEvent.click(screen.getByLabelText("Sí, hay una regla que se aplica hoy"));
const sinRegla = () =>
  fireEvent.click(screen.getByLabelText("No, hoy no hay regla"));
const opcionesDe = (select: HTMLElement) =>
  within(select)
    .getAllByRole("option")
    .map((o) => (o as HTMLOptionElement).value);

beforeEach(() => {
  window.localStorage.clear();
});

describe("la tabla de referencias", () => {
  it("dice que es una referencia sobre todas las filas y que la etapa 7 la vuelve a medir", () => {
    montar();
    const nota = screen.getByTestId("protocolo-referencia");
    expect(nota.textContent).toMatch(/referencia, no un resultado/);
    expect(nota.textContent).toMatch(/etapa 7/);
    expect(nota.textContent).toContain(String(CREDITO.tabla.rows.length));
  });

  it("es una tabla con leyenda, filas con encabezado y la unidad de la etapa 1 en la columna del costo", () => {
    montar();
    const tabla = screen.getByRole("table");
    expect(
      within(tabla).getByText("Lo que ya se logra sin modelo"),
    ).toBeTruthy();
    const filas = within(tabla).getAllByRole("row");
    // encabezado + nunca actuar + siempre actuar
    expect(filas).toHaveLength(3);
    expect(within(filas[1]!).getByRole("rowheader").textContent).toMatch(
      /Nunca actuar/,
    );
    expect(
      within(tabla).getByText(/Costo por cada 100 decisiones \(US\$\)/),
    ).toBeTruthy();
    // la región que se desplaza se alcanza con el teclado
    expect(screen.getByRole("region").getAttribute("tabindex")).toBe("0");
  });

  it("marca la referencia más frecuente con texto, no solo con color", () => {
    montar();
    expect(screen.getAllByText("La más frecuente en tus filas")).toHaveLength(
      1,
    );
  });

  it("recuerda lo que se hace hoy, según la etapa 1", () => {
    montar();
    expect(screen.getByTestId("protocolo-hoy").textContent).toMatch(
      /Se llama a todos/,
    );
  });
});

describe("la regla de hoy", () => {
  it("solo ofrece columnas que la etapa 4 dejó en «usar» (no la fuga, no el objetivo)", () => {
    montar();
    hayRegla();
    const select = within(condicion(0)).getByLabelText("Columna");
    expect(opcionesDe(select)).toEqual([
      "",
      "ingreso_mensual",
      "monto_prestamo",
      "puntaje_credito",
      "empleo",
    ]);
    expect(opcionesDe(select)).not.toContain("monto_recuperado");
    expect(opcionesDe(select)).not.toContain("incumplio");
  });

  it("los operadores dependen del tipo: seis para un número, «es» y «no es» para un texto", () => {
    montar();
    hayRegla();
    elegir("Columna", "ingreso_mensual", condicion(0));
    expect(opcionesDe(within(condicion(0)).getByLabelText("Operador"))).toEqual(
      ["<", "<=", ">", ">=", "=", "!="],
    );
    elegir("Columna", "empleo", condicion(0));
    const operador = within(condicion(0)).getByLabelText("Operador");
    expect(opcionesDe(operador)).toEqual(["=", "!="]);
    expect(within(operador).getByText("es")).toBeTruthy();
    expect(within(operador).getByText("no es")).toBeTruthy();
  });

  it("el valor de una columna de texto se elige de la lista de sus valores", () => {
    montar();
    hayRegla();
    elegir("Columna", "empleo", condicion(0));
    const valor = within(condicion(0)).getByLabelText("Valor");
    expect(valor.tagName).toBe("SELECT");
    expect(opcionesDe(valor)).toContain("informal");
  });

  it("la regla se mide en vivo con el mismo número que el motor, y la fila «Tu regla de hoy» aparece", () => {
    montar();
    hayRegla();
    elegir("Columna", "ingreso_mensual", condicion(0));
    fireEvent.change(within(condicion(0)).getByLabelText("Valor"), {
      target: { value: "3000" },
    });
    const esperado = datosEtapa5(
      CREDITO.tabla,
      {
        ...ENTRADA_5_VACIA,
        regla: "hay",
        columnas: ["ingreso_mensual"],
        operadores: ["<"],
        valores: ["3000"],
      },
      CREDITO.previas,
    ).chequeos;
    const medida = screen.getByTestId("protocolo-regla-medida");
    expect(medida.textContent).toContain(
      `La regla se cumple en ${esperado.regla_cumple} de ${CREDITO.tabla.rows.length} filas.`.replace(
        /(\d)(?=(\d{3})+\b)/g,
        "$1,",
      ),
    );
    const fila = screen.getByRole("rowheader", { name: /^Tu regla de hoy/ });
    expect(fila).toBeTruthy();
    const celdas = within(fila.closest("tr")!).getAllByRole("cell");
    expect(celdas[0]!.textContent).toBe(
      cifra(por100(Number(esperado.regla_costo))),
    );
  });

  it("con una condición a medias lo dice, y no inventa una medida", () => {
    montar();
    hayRegla();
    expect(screen.getByTestId("protocolo-regla-medida").textContent).toMatch(
      /Completa la condición para medirla/,
    );
    expect(
      screen.queryByRole("rowheader", { name: /^Tu regla de hoy/ }),
    ).toBeNull();
  });

  it("una celda vacía no cumple: lo dice con cuántas filas son", () => {
    const tabla = csv(
      "edad,baja",
      "20,si",
      ",si",
      "40,no",
      "50,no",
      ",no",
      "60,no",
    );
    const a = armar4(
      "vacios.csv",
      "binaria",
      {
        objetivo: "baja",
        positivo: "si",
        unidadColumna: null,
        momentoColumna: null,
        momentoTexto: "hoy",
        ordenFecha: null,
      },
      tabla,
    );
    montar(a);
    hayRegla();
    elegir("Columna", "edad", condicion(0));
    fireEvent.change(within(condicion(0)).getByLabelText("Operador"), {
      target: { value: "!=" },
    });
    fireEvent.change(within(condicion(0)).getByLabelText("Valor"), {
      target: { value: "40" },
    });
    const medida = screen.getByTestId("protocolo-regla-medida").textContent!;
    expect(medida).toMatch(/se cumple en 3 de 6 filas/);
    expect(medida).toMatch(
      /En 2 filas alguna de estas columnas no tiene valor/,
    );
  });

  it("un número con coma ambigua se dice en el campo", () => {
    montar();
    hayRegla();
    elegir("Columna", "ingreso_mensual", condicion(0));
    fireEvent.change(within(condicion(0)).getByLabelText("Valor"), {
      target: { value: "1,500" },
    });
    expect(
      within(condicion(0)).getByText(/No se lee como número/),
    ).toBeTruthy();
  });
});

describe("dos condiciones", () => {
  it("se añade la segunda con el foco en ella; la unión aparece; ya no se ofrece una tercera", () => {
    montar();
    hayRegla();
    expect(screen.queryByText("Cómo se unen las dos condiciones")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Añadir otra condición" }),
    );
    expect(condicion(1)).toBeTruthy();
    expect(document.activeElement).toBe(
      within(condicion(1)).getByLabelText("Columna"),
    );
    expect(
      screen.queryByRole("button", { name: "Añadir otra condición" }),
    ).toBeNull();
    expect(screen.getByLabelText("Y: se cumplen las dos")).toBeTruthy();
    expect(
      screen.getByLabelText("O: basta con que se cumpla una"),
    ).toBeTruthy();
  });

  it("quitar la segunda devuelve el foco al botón de añadir y la regla vuelve a medirse con una", () => {
    montar();
    hayRegla();
    fireEvent.click(
      screen.getByRole("button", { name: "Añadir otra condición" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Quitar la segunda condición" }),
    );
    expect(document.querySelector('[data-condicion="1"]')).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Añadir otra condición" }),
    );
  });

  it("«y» y «o» miden distinto, como el motor", () => {
    montar();
    hayRegla();
    elegir("Columna", "ingreso_mensual", condicion(0));
    fireEvent.change(within(condicion(0)).getByLabelText("Valor"), {
      target: { value: "3000" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Añadir otra condición" }),
    );
    elegir("Columna", "empleo", condicion(1));
    fireEvent.change(within(condicion(1)).getByLabelText("Valor"), {
      target: { value: "informal" },
    });
    const cumple = () =>
      Number(
        /se cumple en ([\d,]+) de/
          .exec(screen.getByTestId("protocolo-regla-medida").textContent!)![1]!
          .replace(/,/g, ""),
      );
    const esperado = (union: string) =>
      datosEtapa5(
        CREDITO.tabla,
        {
          ...ENTRADA_5_VACIA,
          regla: "hay",
          columnas: ["ingreso_mensual", "empleo"],
          operadores: ["<", "="],
          valores: ["3000", "informal"],
          union,
        },
        CREDITO.previas,
      ).chequeos.regla_cumple;
    expect(cumple()).toBe(esperado("y"));
    fireEvent.click(screen.getByLabelText("O: basta con que se cumpla una"));
    expect(cumple()).toBe(esperado("o"));
    expect(esperado("o")).toBeGreaterThan(esperado("y") as number);
  });
});

describe("la salida según la forma de la decisión", () => {
  it("sí o no: la salida es fija (actuar / no actuar), sin campos", () => {
    montar();
    hayRegla();
    expect(screen.getByTestId("protocolo-regla-binaria").textContent).toMatch(
      /se actúa/,
    );
    expect(
      screen.queryByLabelText("Si la regla se cumple, se elige"),
    ).toBeNull();
  });

  it("varias opciones: se elige entre las opciones de la etapa 1", () => {
    const e1 = {
      ...etapa1De("multiclase"),
    };
    const filas = [
      ...Array(5).fill("basico"),
      ...Array(3).fill("estandar"),
      ...Array(2).fill("premium"),
    ];
    const tabla = csv("x,plan", ...filas.map((p, i) => `${i % 4},${p}`));
    const a = armar4(
      "multi.csv",
      "multiclase",
      {
        objetivo: "plan",
        positivo: "",
        unidadColumna: null,
        momentoColumna: null,
        momentoTexto: "hoy",
        ordenFecha: null,
      },
      tabla,
      e1,
    );
    montar(a);
    hayRegla();
    const si = screen.getByLabelText("Si la regla se cumple, se elige");
    expect(opcionesDe(si)).toEqual([
      "",
      "basico",
      "estandar",
      "premium",
      "empresa",
      "estudiante",
    ]);
    expect(
      screen.getByLabelText("Si la regla no se cumple, se elige"),
    ).toBeTruthy();
  });

  it("un número: se escriben las dos estimaciones", () => {
    const y = [1, 2, 3, 4, 10, 1, 2, 3, 4, 10];
    const tabla = csv("x,valor", ...y.map((v, i) => `${i % 3},${v}`));
    const a = armar4(
      "num.csv",
      "numerica",
      {
        objetivo: "valor",
        positivo: "",
        unidadColumna: null,
        momentoColumna: null,
        momentoTexto: "hoy",
        ordenFecha: null,
      },
      tabla,
    );
    montar(a);
    hayRegla();
    const si = screen.getByLabelText("Si la regla se cumple, se estima");
    expect(si.tagName).toBe("INPUT");
    expect(
      screen.getByLabelText("Si la regla no se cumple, se estima"),
    ).toBeTruthy();
    // sin «aciertos»: en un número no hay clases que acertar
    expect(screen.queryByText("Aciertos de cada 100")).toBeNull();
    expect(screen.getByText("Error medio")).toBeTruthy();
  });
});

describe("registrar", () => {
  it("no se puede registrar sin decir si hay una regla", () => {
    montar();
    const boton = screen.getByRole("button", { name: /Registrar la etapa 5/ });
    expect((boton as HTMLButtonElement).disabled).toBe(true);
  });

  it("«no hay regla» pasa por la compuerta de verdad", () => {
    const { registrado, onRegistrar } = montar();
    sinRegla();
    fireEvent.click(
      screen.getByRole("button", { name: /Registrar la etapa 5/ }),
    );
    expect(onRegistrar).toHaveBeenCalledTimes(1);
    expect(registrado.rechazo).toBeNull();
    expect(registrado.datos?.respuestas.regla).toBe("ninguna");
    expect(registrado.datos?.chequeos.regla_costo).toBeNull();
  });

  it("una regla completa se registra tal como la mide el motor", () => {
    const { registrado } = montar();
    hayRegla();
    elegir("Columna", "ingreso_mensual", condicion(0));
    fireEvent.change(within(condicion(0)).getByLabelText("Valor"), {
      target: { value: "3000.50" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Registrar la etapa 5/ }),
    );
    expect(registrado.rechazo).toBeNull();
    // se guarda el número en su forma canónica
    expect(registrado.datos?.respuestas.regla_valores).toEqual(["3000.5"]);
    expect(registrado.datos?.chequeos.regla_costo).not.toBeNull();
  });

  it("una regla a medias la rechaza la compuerta nombrando lo que falta", () => {
    const { registrado } = montar();
    hayRegla();
    fireEvent.click(
      screen.getByRole("button", { name: /Registrar la etapa 5/ }),
    );
    expect(registrado.rechazo).toMatchObject({
      tipo: "criterio-no-cumplido",
      faltan: ["regla-condicion"],
    });
    expect(screen.getByRole("alert").textContent).toMatch(/la regla completa/);
  });

  it("al corregir, la pantalla vuelve con lo registrado", () => {
    const anterior = datosEtapa5(
      CREDITO.tabla,
      {
        ...ENTRADA_5_VACIA,
        regla: "hay",
        columnas: ["ingreso_mensual", "empleo"],
        operadores: ["<", "="],
        valores: ["3000", "informal"],
        union: "o",
      },
      CREDITO.previas,
    );
    montar(CREDITO, anterior);
    expect(
      (
        screen.getByLabelText(
          "Sí, hay una regla que se aplica hoy",
        ) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(
      (within(condicion(0)).getByLabelText("Columna") as HTMLSelectElement)
        .value,
    ).toBe("ingreso_mensual");
    expect(
      (within(condicion(1)).getByLabelText("Valor") as HTMLSelectElement).value,
    ).toBe("informal");
    expect(
      (
        screen.getByLabelText(
          "O: basta con que se cumpla una",
        ) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });

  it("sin la etapa 4 ni datos no hay formulario, solo el aviso", () => {
    render(
      <I18nProvider>
        <Etapa5Form
          datos={null}
          anterior={null}
          previas={{}}
          onRegistrar={() => null}
        />
      </I18nProvider>,
    );
    expect(screen.getByText(/cárgalos y cúmplelas primero/)).toBeTruthy();
  });
});

describe("el cuaderno", () => {
  it("resume la etapa 5: lo que se logra sin modelo, la regla de hoy medida y el rótulo de referencia", async () => {
    const { CuadernoPanel } =
      await import("@/components/protocolo/CuadernoPanel");
    const r = registrar(
      PROTOCOLO5,
      CREDITO.cuaderno,
      5,
      datosEtapa5(
        CREDITO.tabla,
        {
          ...ENTRADA_5_VACIA,
          regla: "hay",
          columnas: ["ingreso_mensual", "empleo"],
          operadores: ["<=", "!="],
          valores: ["3000", "informal"],
          union: "y",
        },
        CREDITO.previas,
      ),
      { huella: HUELLA, tabla: CREDITO.tabla, ahora: AHORA },
    );
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
    const resumen = screen.getByTestId("cuaderno-resumen5").textContent!;
    expect(resumen).toMatch(/Referencia sobre \d+ filas, no un resultado/);
    expect(resumen).toMatch(/etapa 7/);
    expect(resumen).toMatch(/Nunca actuar: .* · Siempre actuar: /);
    expect(resumen).toMatch(
      /Regla de hoy: ingreso_mensual menor o igual que \(≤\) 3000 y empleo no es informal/,
    );
    expect(resumen).toMatch(/Si se cumple: actuar\. Si no: no actuar\./);
    // no vuelca los mapas crudos
    expect(resumen).not.toContain("nunca-actuar");
  });
});
