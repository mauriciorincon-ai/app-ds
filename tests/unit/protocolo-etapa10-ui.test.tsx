// Protocolo DS (S15), etapa 10 — la pantalla en jsdom, con la compuerta real detrás. Lo que tiene que valer:
//  · ESPÍA: la etapa 10 no habla con el worker ni abre la prueba; recorrerla entera no crea ningún Worker;
//  · el dueño se escribe (o se pone al decisor de la 1 con un clic): sin él la compuerta no pasa y lo nombra;
//  · «usar» pide la cadencia (la sugerida si la prueba fue por tiempo; si no, la escribes) y, si la alargas,
//    tu razón; «no usar» e «iterar» piden qué cambiar, sin plan de vigilancia;
//  · las columnas de TEXTO del modelo las eliges tú (decisión del usuario, 2026-10-20): sin marcar no se guarda
//    ni un nombre de categoría, y lo que dejas sin vigilar lo dicen la trampa, la ficha y el chequeo;
//  · la vista previa de la ficha sale del cuaderno más lo que escribes, con su etapa, fecha y huella;
//  · la constancia de la etapa cumplida: la ficha, su descarga en Markdown en el idioma activo (sin una sola
//    fila de tus datos), y el chequeo de deriva con un CSV nuevo (que no se guarda ni sale por la red);
//  · S19, «Llévate el ganador»: sin los datos cargados lo dice y el botón no se puede pulsar; pintar la etapa NO crea worker; pulsar el
//    botón crea UNO, que ajusta al ganador SIN la prueba y lo exporta, y lo que se descarga es un `.probeta.json` con origen
//    «protocolo», la cifra de la prueba de la etapa 8 y ni una fila; con otro archivo (el sello no coincide) no se ajusta nada.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatosEtapa, Previas } from "@/engine/protocolo/etapas";

vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}));
const descargas: { nombre: string; contenido: string; tipo: string }[] = [];
vi.mock("@/lib/files", async (original) => ({
  ...(await original<typeof import("@/lib/files")>()),
  downloadTextFile: (nombre: string, contenido: string, tipo: string) =>
    descargas.push({ nombre, contenido, tipo }),
}));

const { I18nProvider } = await import("@/i18n/provider");
const { LOCALE_STORAGE_KEY } = await import("@/i18n/config");
const { Etapa10Form } = await import("@/components/protocolo/Etapa10Form");
const { Etapa10Constancia } =
  await import("@/components/protocolo/Etapa10Constancia");
const { evaluar, registrar } = await import("@/engine/protocolo/compuerta");
const { PROTOCOLO_DS } = await import("@/engine/protocolo/protocolo-ds");
const { textoLleno } = await import("@/engine/protocolo/valores");
const {
  ENTRADA_NO_USAR,
  ENTRADA_USAR,
  AHORA,
  HUELLA,
  armarCredito9,
  datos10,
  registrar10,
} = await import("./protocolo-etapa10-helpers");

type Armado = ReturnType<typeof armarCredito9>;
const CSV_KIT = readFileSync(
  "docs/kit-de-prueba/credito-fuga-plantada.csv",
  "utf8",
);

const cargaDe = (a: Armado) => ({
  fecha: AHORA.toISOString(),
  sha256: HUELLA,
  nombre: "credito-fuga-plantada.csv",
  filas: a.tabla.rows.length,
  columnas: a.tabla.headers.length,
});

function montar(
  a: Armado,
  previas: Previas = a.previas,
  anterior: DatosEtapa | null = null,
) {
  const cuaderno = { ...a.cuaderno, cargas: [cargaDe(a)] };
  const evaluadas = evaluar(PROTOCOLO_DS, cuaderno, HUELLA, a.tabla);
  const registrado: { datos: DatosEtapa | null; rechazo: unknown } = {
    datos: null,
    rechazo: null,
  };
  const onRegistrar = vi.fn((datos: DatosEtapa) => {
    const r = registrar(PROTOCOLO_DS, a.cuaderno, 10, datos, {
      huella: HUELLA,
      tabla: a.tabla,
      ahora: AHORA,
    });
    registrado.datos = r.ok ? datos : null;
    registrado.rechazo = r.ok ? null : r.rechazo;
    return r.ok ? null : r.rechazo;
  });
  const vista = render(
    <I18nProvider>
      <Etapa10Form
        datos={{ tabla: a.tabla, carga: cargaDe(a) }}
        anterior={anterior}
        previas={previas}
        evaluadas={evaluadas}
        cuaderno={cuaderno}
        onRegistrar={onRegistrar}
      />
    </I18nProvider>,
  );
  return { ...vista, registrado, onRegistrar };
}

/** La constancia de una etapa 10 ya registrada con esa entrada. */
function montarConstancia(
  a: Armado,
  entrada: Parameters<typeof datos10>[1],
  conDatos = false,
) {
  const r = registrar10(a, datos10(a, entrada));
  if (!r.ok) throw new Error(JSON.stringify(r.rechazo));
  const cuaderno = { ...r.cuaderno, cargas: [cargaDe(a)] };
  const evaluadas = evaluar(PROTOCOLO_DS, cuaderno, HUELLA, a.tabla);
  return render(
    <I18nProvider>
      <Etapa10Constancia
        evaluadas={evaluadas}
        cuaderno={cuaderno}
        datos={conDatos ? { tabla: a.tabla, carga: cargaDe(a) } : null}
      />
    </I18nProvider>,
  );
}

const escribir = (etiqueta: string, valor: string) =>
  fireEvent.change(screen.getByLabelText(etiqueta), {
    target: { value: valor },
  });
const registrar10Click = () =>
  fireEvent.click(
    screen.getByRole("button", { name: "Registrar la etapa 10" }),
  );

let Espia: ReturnType<typeof vi.fn>;
beforeEach(() => {
  window.localStorage.clear();
  descargas.length = 0;
  Espia = vi.fn();
  vi.stubGlobal("Worker", Espia);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("la etapa 10 con «usar»", () => {
  const A = armarCredito9("usar");

  it("ESPÍA: recorrerla entera, hasta registrar, no crea ningún worker", () => {
    const { registrado } = montar(A);
    expect(screen.getByTestId("protocolo-lee10").textContent).toMatch(
      /no recalcula nada ni vuelve a abrir la prueba/,
    );
    escribir("Persona o rol que responde por este modelo", "Jefa de retención");
    escribir("Reentrenar cada (meses)", "6");
    registrar10Click();
    expect(registrado.rechazo).toBeNull();
    expect(registrado.datos?.respuestas).toMatchObject({
      dueno: "Jefa de retención",
      cadencia: 6,
    });
    expect(Espia).not.toHaveBeenCalled();
  });

  it("sin dueño nombrado la compuerta no pasa, y lo nombra", () => {
    montar(A);
    escribir("Reentrenar cada (meses)", "6");
    registrar10Click();
    expect(screen.getByRole("alert").textContent).toMatch(
      /el nombre de quien responde por el modelo/,
    );
  });

  it("un clic pone al decisor de la etapa 1; el campo empieza vacío (el dueño no se da por nombrado)", () => {
    montar(A);
    const campo = screen.getByLabelText(
      "Persona o rol que responde por este modelo",
    ) as HTMLInputElement;
    expect(campo.value).toBe("");
    const decisor = textoLleno(A.previas[1]!.respuestas, "decisor")!;
    fireEvent.click(
      screen.getByRole("button", {
        name: `Poner al decisor de la etapa 1: «${decisor}»`,
      }),
    );
    expect(campo.value).toBe(decisor);
    expect(
      screen.queryByRole("button", { name: /Poner al decisor/ }),
    ).toBeNull();
  });

  it("una prueba sin tiempo no dice cuánto vale el modelo: la cadencia la escribes tú", () => {
    const { registrado } = montar(A);
    expect(
      (screen.getByLabelText("Reentrenar cada (meses)") as HTMLInputElement)
        .value,
    ).toBe("");
    expect(screen.getByTestId("protocolo-cadencia10").textContent).toMatch(
      /no fue por tiempo/,
    );
    escribir("Persona o rol que responde por este modelo", "Jefa de retención");
    registrar10Click();
    expect(screen.getByRole("alert").textContent).toMatch(
      /cada cuántos meses se reentrena/,
    );
    expect(registrado.datos).toBeNull();
    // la trampa que lo dice
    expect(
      screen.getByText(
        "Tu prueba no fue por tiempo, así que no dice por cuánto tiempo vale el modelo: la cadencia es solo tuya.",
      ),
    ).toBeTruthy();
  });

  it("con una prueba por tiempo la cadencia sugerida va puesta, y alargarla pide tu razón", () => {
    const previas: Previas = {
      ...A.previas,
      2: {
        ...A.previas[2]!,
        chequeos: { ...A.previas[2]!.chequeos, fecha_max: "2025-07-15" },
      },
      6: {
        ...A.previas[6]!,
        chequeos: { ...A.previas[6]!.chequeos, corte: "2025-01-01" },
      },
    };
    montar(A, previas);
    const cadencia = screen.getByLabelText(
      "Reentrenar cada (meses)",
    ) as HTMLInputElement;
    expect(cadencia.value).toBe("6");
    expect(screen.getByTestId("protocolo-cadencia10").textContent).toMatch(
      /La prueba respalda 6 meses: van del corte de la etapa 6 \(2025-01-01\) a la última fecha de tus datos \(2025-07-15\)/,
    );
    expect(
      screen.queryByLabelText("Tu razón para reentrenar con menos frecuencia"),
    ).toBeNull();
    escribir("Reentrenar cada (meses)", "9");
    expect(
      screen.getByLabelText("Tu razón para reentrenar con menos frecuencia"),
    ).toBeTruthy();
    escribir("Reentrenar cada (meses)", "3");
    expect(
      screen.queryByLabelText("Tu razón para reentrenar con menos frecuencia"),
    ).toBeNull();
  });

  it("el plan de vigilancia dice cuántas columnas y cuántas filas de referencia, y que mide entradas", () => {
    montar(A);
    const plan = screen.getByTestId("protocolo-plan10").textContent ?? "";
    expect(plan).toMatch(
      /Se vigila la deriva de \d+ columnas del modelo contra [\d,]+ filas del entrenamiento sellado/,
    );
    expect(plan).toMatch(
      /solo agregados \(cortes y frecuencias; de las columnas de texto, solo las que marcaste, con los nombres de sus categorías\), nunca filas/,
    );
    expect(plan).toMatch(/mide las entradas, no el desempeño/);
  });

  it("las columnas de texto del modelo se ofrecen sin marcar: hasta que las marques no se guarda ni un nombre de categoría", () => {
    const { registrado } = montar(A);
    const casilla = screen.getByRole("checkbox", { name: "empleo" }) as HTMLInputElement;
    expect(casilla.checked).toBe(false);
    expect(screen.getByTestId("protocolo-texto10").textContent).toMatch(
      /nombre de sus categorías con 5 filas o más \(hasta 4\)/,
    );
    expect(screen.getByTestId("protocolo-texto10-estado").textContent).toMatch(
      /Marcadas: 0 de 1\. Las demás no se guardan ni se vigilan/,
    );
    // lo que queda sin vigilar lo dice la trampa
    expect(
      screen.getByText(
        "Dejaste sin vigilar columnas de texto (empleo): si cambian, el chequeo no lo notará.",
      ),
    ).toBeTruthy();
    escribir("Persona o rol que responde por este modelo", "Jefa de retención");
    escribir("Reentrenar cada (meses)", "6");
    registrar10Click();
    expect(registrado.rechazo).toBeNull();
    expect(registrado.datos?.respuestas.vigilar_texto).toEqual([]);
    expect(registrado.datos?.chequeos.vig_omitidas).toEqual(["empleo"]);
    for (const nombre of ["informal", "independiente"])
      expect(JSON.stringify(registrado.datos)).not.toContain(nombre);
  });

  it("marcar la columna la vigila y guarda sus categorías; la trampa de lo no vigilado se va", () => {
    const { registrado } = montar(A);
    fireEvent.click(screen.getByRole("checkbox", { name: "empleo" }));
    expect(screen.getByTestId("protocolo-texto10-estado").textContent).toMatch(
      /Marcadas: 1 de 1/,
    );
    expect(screen.queryByText(/Dejaste sin vigilar columnas de texto/)).toBeNull();
    expect(screen.getByTestId("protocolo-plan10").textContent).toMatch(
      /Se vigila la deriva de 4 columnas del modelo/,
    );
    escribir("Persona o rol que responde por este modelo", "Jefa de retención");
    escribir("Reentrenar cada (meses)", "6");
    registrar10Click();
    expect(registrado.rechazo).toBeNull();
    expect(registrado.datos?.respuestas.vigilar_texto).toEqual(["empleo"]);
    expect(registrado.datos?.chequeos.vig_omitidas).toEqual([]);
    expect(JSON.stringify(registrado.datos?.chequeos.vig_referencia)).toContain("informal");
    // y se puede desmarcar antes de registrar
    fireEvent.click(screen.getByRole("checkbox", { name: "empleo" }));
    expect(screen.getByTestId("protocolo-texto10-estado").textContent).toMatch(/Marcadas: 0 de 1/);
  });

  it("la vista previa de la ficha dice lo que quedó sin vigilar", () => {
    montar(A);
    const previa = screen.getByTestId("protocolo-preview10");
    fireEvent.click(within(previa).getByText("Vista previa de la ficha"));
    const secciones = screen.getByTestId("protocolo-preview10-secciones");
    expect(
      within(secciones).getByText(
        "Sin vigilar por decisión del dueño (1): empleo. Si cambian, este plan no lo notará.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "empleo" }));
    expect(within(secciones).queryByText(/Sin vigilar por decisión del dueño/)).toBeNull();
  });

  it("la vista previa arma la ficha con lo del cuaderno y lo que escribes, cada línea con su fuente", () => {
    montar(A);
    const previa = screen.getByTestId("protocolo-preview10");
    fireEvent.click(within(previa).getByText("Vista previa de la ficha"));
    const secciones = screen.getByTestId("protocolo-preview10-secciones");
    // lo derivado cita su etapa, fecha y huella; la 10 todavía no está registrada
    expect(
      within(secciones).getAllByText(/Etapa 4 · .* · huella [0-9a-f]{12}/)
        .length,
    ).toBeGreaterThan(0);
    expect(
      within(secciones).getAllByText(/Etapa 10 · se registra con esta etapa/)
        .length,
    ).toBeGreaterThan(0);
    escribir("Persona o rol que responde por este modelo", "Jefa de retención");
    expect(
      within(secciones).getByText("Responde por el modelo: Jefa de retención."),
    ).toBeTruthy();
    expect(
      within(secciones).getAllByText(
        /Escrito por el dueño · se registra con esta etapa/,
      ).length,
    ).toBeGreaterThan(0);
  });

  it("al corregir, vuelve lo que se registró la última vez", () => {
    const anterior = datos10(A, {
      ...ENTRADA_USAR,
      noUsarPara: "Clientes nuevos",
    });
    montar(A, A.previas, anterior);
    expect(
      (
        screen.getByLabelText(
          "Persona o rol que responde por este modelo",
        ) as HTMLInputElement
      ).value,
    ).toBe("Jefa de retención");
    expect(
      (
        screen.getByLabelText(
          "Para qué NO usarlo (opcional)",
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("Clientes nuevos");
    expect(
      (screen.getByLabelText("Reentrenar cada (meses)") as HTMLInputElement)
        .value,
    ).toBe("6");
  });

  it("al corregir, vuelven también las columnas de texto que marcaste", () => {
    const anterior = datos10(A, { ...ENTRADA_USAR, vigilarTexto: ["empleo"] });
    montar(A, A.previas, anterior);
    expect((screen.getByRole("checkbox", { name: "empleo" }) as HTMLInputElement).checked).toBe(true);
  });
});

describe("la etapa 10 con «no usar» y con «iterar»", () => {
  it("«no usar» pide qué tendría que cambiar y no trae cadencia ni plan", () => {
    const A = armarCredito9("no-usar");
    const { registrado } = montar(A);
    expect(screen.getByTestId("protocolo-decision10").textContent).toMatch(
      /No usarlo/,
    );
    expect(screen.queryByTestId("protocolo-cadencia10")).toBeNull();
    expect(screen.queryByTestId("protocolo-plan10")).toBeNull();
    escribir("Persona o rol que responde por este modelo", "Jefa de retención");
    registrar10Click();
    expect(screen.getByRole("alert").textContent).toMatch(
      /qué tendría que cambiar para que sirva/,
    );
    escribir("Qué tendría que cambiar para que sirva", ENTRADA_NO_USAR.cambiar);
    registrar10Click();
    expect(registrado.rechazo).toBeNull();
    expect(registrado.datos?.respuestas.cambiar).toBe(ENTRADA_NO_USAR.cambiar);
    expect(Espia).not.toHaveBeenCalled();
  });

  it("«iterar» dice que la prueba ya se abrió y pide qué cambiar antes de volver", () => {
    const A = armarCredito9("iterar");
    montar(A);
    expect(screen.getByTestId("protocolo-cambiar10").textContent).toMatch(
      /necesitas una partición distinta/,
    );
    expect(
      screen.getByLabelText("Qué vas a cambiar antes de volver a probar"),
    ).toBeTruthy();
    expect(
      screen.getByText(/Esta prueba ya se abrió y no se reutiliza/, {
        exact: false,
      }),
    ).toBeTruthy();
  });
});

describe("la forma sin datos o sin decisión", () => {
  it("sin los datos cargados lo dice y no pinta formulario", () => {
    const A = armarCredito9("usar");
    render(
      <I18nProvider>
        <Etapa10Form
          datos={null}
          anterior={null}
          previas={A.previas}
          onRegistrar={() => null}
        />
      </I18nProvider>,
    );
    expect(screen.getByText(/Carga tus datos arriba/)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Registrar la etapa 10" }),
    ).toBeNull();
  });
});

describe("la constancia de la etapa 10 cumplida", () => {
  const A = armarCredito9("usar");

  it("pinta la ficha por secciones, con el plan de vigilancia y el chequeo, y cada línea con su fuente", () => {
    montarConstancia(A, ENTRADA_USAR);
    expect(screen.getByTestId("ficha-titular").textContent).toBe(
      "Un modelo para usar",
    );
    for (const id of [
      "datos",
      "poblacion",
      "metricas",
      "decision",
      "limites",
      "cumplio",
      "vigilancia",
      "responde",
    ])
      expect(screen.getByTestId(`ficha-seccion-${id}`), id).toBeTruthy();
    expect(screen.queryByTestId("ficha-seccion-variante")).toBeNull();
    const cumplio = screen.getByTestId("ficha-seccion-cumplio");
    expect(
      within(cumplio).getAllByText(/Etapa \d+ · .* · huella [0-9a-f]{12}/)
        .length,
    ).toBeGreaterThanOrEqual(5);
    expect(screen.getByTestId("protocolo-deriva10")).toBeTruthy();
  });

  it("con «no usar» no trae plan ni chequeo, sino qué cambiar en palabras del dueño", () => {
    montarConstancia(armarCredito9("no-usar"), ENTRADA_NO_USAR);
    expect(screen.getByTestId("ficha-titular").textContent).toBe(
      "Un modelo que no se usa",
    );
    expect(screen.queryByTestId("ficha-seccion-vigilancia")).toBeNull();
    expect(screen.queryByTestId("protocolo-deriva10")).toBeNull();
    expect(
      within(screen.getByTestId("ficha-seccion-variante")).getByText(
        /Escrito por el dueño/,
        { exact: false },
      ),
    ).toBeTruthy();
  });

  it("«Descargar» baja la ficha en Markdown, en español, sin una sola fila de tus datos", async () => {
    montarConstancia(A, {
      ...ENTRADA_USAR,
      noUsarPara: "Clientes con menos de seis meses",
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Descargar la ficha (Markdown)" }),
    );
    await waitFor(() => expect(descargas).toHaveLength(1));
    const [{ nombre, contenido, tipo }] = descargas;
    expect(nombre).toBe("ficha-del-modelo-credito-fuga-plantada.md");
    expect(tipo).toMatch(/^text\/markdown/);
    expect(contenido).toMatch(/^# Ficha del modelo\n/);
    expect(contenido).toContain("## Lo que este modelo cumplió");
    expect(contenido).toContain("## Plan de vigilancia");
    expect(contenido).toContain("Responde por el modelo: Jefa de retención.");
    expect(contenido).toMatch(/_Escrito por el dueño · /);
    expect(contenido).toMatch(/_Etapa 6 · .* · huella [0-9a-f]{12}_/);
    for (const fila of CSV_KIT.split("\n").slice(1).filter(Boolean))
      expect(contenido, `una fila del CSV en la ficha: ${fila}`).not.toContain(
        fila,
      );
    expect(
      screen.getByText(
        "Descargada: ficha-del-modelo-credito-fuga-plantada.md.",
      ),
    ).toBeTruthy();
  });

  it("en inglés baja la ficha en inglés", async () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    montarConstancia(A, ENTRADA_USAR);
    fireEvent.click(
      screen.getByRole("button", { name: "Download the card (Markdown)" }),
    );
    await waitFor(() => expect(descargas).toHaveLength(1));
    expect(descargas[0]!.contenido).toMatch(/^# Model card\n/);
    expect(descargas[0]!.contenido).toContain("## What this model met");
    expect(descargas[0]!.contenido).toContain(
      "Answers for the model: Jefa de retención.",
    );
    expect(descargas[0]!.contenido).not.toMatch(/protocol\.stage\./);
  });
});

describe("el chequeo de deriva con un CSV nuevo", () => {
  const A = armarCredito9("usar");
  const subir = (csv: string, nombre = "nuevo.csv") =>
    fireEvent.change(screen.getByTestId("protocolo-deriva10-csv"), {
      target: { files: [new File([csv], nombre, { type: "text/csv" })] },
    });
  /** El CSV del kit con una columna cambiada. */
  const conColumna = (columna: string, cambio: (v: string) => string) => {
    const [cabecera, ...filas] = CSV_KIT.trimEnd().split("\n");
    const j = cabecera!.split(",").indexOf(columna);
    return [
      cabecera,
      ...filas.map((f) =>
        f
          .split(",")
          .map((v, k) => (k === j ? cambio(v) : v))
          .join(","),
      ),
    ].join("\n");
  };

  it("el mismo archivo da estable en cada columna, y el plan sigue; no se guarda ni sale por la red", async () => {
    const fetchEspia = vi.fn();
    vi.stubGlobal("fetch", fetchEspia);
    montarConstancia(A, ENTRADA_USAR);
    const antes = JSON.stringify(Object.entries(window.localStorage));
    subir(CSV_KIT);
    await waitFor(() =>
      expect(screen.getByTestId("protocolo-deriva10-veredicto")).toBeTruthy(),
    );
    expect(
      screen.getByTestId("protocolo-deriva10-veredicto").textContent,
    ).toMatch(/Sigue: ninguna columna cambió/);
    const filas = within(screen.getByTestId("protocolo-deriva10-tabla"))
      .getAllByRole("row")
      .slice(1);
    expect(filas.length).toBeGreaterThan(0);
    for (const fila of filas)
      expect(fila.getAttribute("data-estado")).toBe("estable");
    expect(
      screen.getByText(/esto mide las entradas, no el desempeño del modelo/i),
    ).toBeTruthy();
    expect(JSON.stringify(Object.entries(window.localStorage))).toBe(antes);
    expect(fetchEspia).not.toHaveBeenCalled();
  });

  it("la columna de texto sin marcar se nombra como sin vigilar, y el veredicto no habla de ella", async () => {
    montarConstancia(A, ENTRADA_USAR);
    subir(CSV_KIT);
    await waitFor(() =>
      expect(screen.getByTestId("protocolo-deriva10-sin-vigilar")).toBeTruthy(),
    );
    expect(screen.getByTestId("protocolo-deriva10-sin-vigilar").textContent).toMatch(
      /Sin vigilar por decisión tuya \(1\): empleo/,
    );
    const columnas = within(screen.getByTestId("protocolo-deriva10-tabla"))
      .getAllByRole("row")
      .slice(1)
      .map((f) => f.textContent ?? "");
    expect(columnas.some((c) => c.includes("empleo"))).toBe(false);
  });

  it("marcada, la columna de texto se mide: igual da estable y con otras categorías da alerta", async () => {
    montarConstancia(A, { ...ENTRADA_USAR, vigilarTexto: ["empleo"] });
    subir(CSV_KIT);
    await waitFor(() =>
      expect(screen.getByTestId("protocolo-deriva10-veredicto")).toBeTruthy(),
    );
    expect(screen.queryByTestId("protocolo-deriva10-sin-vigilar")).toBeNull();
    const fila = (n: string) =>
      screen.getAllByRole("row").find((r) => r.textContent?.includes(n))!;
    expect(fila("empleo").getAttribute("data-estado")).toBe("estable");
    subir(conColumna("empleo", () => "formal"));
    await waitFor(() =>
      expect(fila("empleo").getAttribute("data-estado")).toBe("alerta"),
    );
    expect(screen.getByTestId("protocolo-deriva10-veredicto").textContent).toMatch(/✕ Reentrena/);
  });

  it("con una columna desplazada esa columna da alerta, con su símbolo y su texto, y el plan dice reentrenar", async () => {
    montarConstancia(A, ENTRADA_USAR);
    subir(conColumna("ingreso_mensual", (v) => String(Number(v) * 3)));
    await waitFor(() =>
      expect(screen.getByTestId("protocolo-deriva10-veredicto")).toBeTruthy(),
    );
    expect(
      screen.getByTestId("protocolo-deriva10-veredicto").textContent,
    ).toMatch(/✕ Reentrena/);
    const alerta = screen
      .getAllByRole("row")
      .find((r) => r.getAttribute("data-estado") === "alerta")!;
    expect(alerta.textContent).toMatch(/ingreso_mensual/);
    expect(alerta.textContent).toMatch(/✕ Alerta/);
  });

  it("sin una columna del modelo no mide y la nombra", async () => {
    montarConstancia(A, ENTRADA_USAR);
    const [cabecera, ...filas] = CSV_KIT.trimEnd().split("\n");
    const j = cabecera!.split(",").indexOf("ingreso_mensual");
    const sin = [cabecera, ...filas]
      .map((f) =>
        f
          .split(",")
          .filter((_, k) => k !== j)
          .join(","),
      )
      .join("\n");
    subir(sin);
    await waitFor(() =>
      expect(screen.getByTestId("protocolo-deriva10-faltan")).toBeTruthy(),
    );
    expect(screen.getByTestId("protocolo-deriva10-faltan").textContent).toMatch(
      /faltan columnas del modelo: ingreso_mensual/,
    );
    expect(screen.queryByTestId("protocolo-deriva10-tabla")).toBeNull();
  });

  it("un archivo que no se lee lo dice, y «Quitar el resultado» lo limpia", async () => {
    montarConstancia(A, ENTRADA_USAR);
    subir("");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Quitar el resultado" }),
      ).toBeTruthy(),
    );
    expect(
      within(screen.getByTestId("protocolo-deriva10")).getByText(/⚠/, {
        exact: false,
      }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Quitar el resultado" }),
    );
    expect(
      screen.queryByRole("button", { name: "Quitar el resultado" }),
    ).toBeNull();
  });
});

describe("en el cuaderno y en la página: «Protocolo completo»", () => {
  const cuadernoCon = (
    decision: "usar" | "no-usar",
    entrada: Parameters<typeof datos10>[1],
  ) => {
    const a = armarCredito9(decision);
    const r = registrar10(a, datos10(a, entrada));
    if (!r.ok) throw new Error(JSON.stringify(r.rechazo));
    return { a, cuaderno: { ...r.cuaderno, cargas: [cargaDe(a)] } };
  };
  const panel = async (
    cuaderno: ReturnType<typeof cuadernoCon>["cuaderno"],
    completo: boolean,
  ) => {
    const { CuadernoPanel } =
      await import("@/components/protocolo/CuadernoPanel");
    render(
      <I18nProvider>
        <CuadernoPanel
          cuaderno={cuaderno}
          completo={completo}
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
  };

  it("la 10 en una lectura: la ficha, quién responde, la cadencia y las columnas vigiladas", async () => {
    const { cuaderno } = cuadernoCon("usar", ENTRADA_USAR);
    await panel(cuaderno, true);
    const r10 = screen.getByTestId("cuaderno-resumen10").textContent!;
    expect(r10).toMatch(/Ficha de un modelo para usar\./);
    expect(r10).toMatch(/Responde: Jefa de retención\./);
    expect(r10).toMatch(/Cadencia de reentreno \(en meses\): 6\./);
    expect(r10).toMatch(/Se vigila la deriva de \d+ columnas\./);
    expect(screen.getByTestId("cuaderno-completo").textContent).toMatch(
      /Protocolo completo\./,
    );
    // la lista genérica no pinta aquí las referencias: el cuaderno no vuelca la referencia de deriva
    expect(screen.queryByText("Referencia de deriva (agregados)")).toBeNull();
  });

  it("«no usar»: sin cadencia ni columnas; y sin las diez etapas cumplidas no dice «completo»", async () => {
    const { cuaderno } = cuadernoCon("no-usar", ENTRADA_NO_USAR);
    await panel(cuaderno, false);
    const r10 = screen.getByTestId("cuaderno-resumen10").textContent!;
    expect(r10).toMatch(/Ficha de un modelo que no se usa\./);
    expect(r10).not.toMatch(/Cadencia|Se vigila/);
    expect(screen.queryByTestId("cuaderno-completo")).toBeNull();
  });

  it("la página dice «Protocolo completo» solo con las diez etapas cumplidas", async () => {
    const { Etapas } = await import("@/components/protocolo/Etapas");
    const { a, cuaderno } = cuadernoCon("usar", ENTRADA_USAR);
    const montar = (c: typeof cuaderno) =>
      render(
        <I18nProvider>
          <Etapas
            evaluadas={evaluar(PROTOCOLO_DS, c, HUELLA, a.tabla)}
            cuaderno={c}
            datos={{ tabla: a.tabla, carga: cargaDe(a) }}
            listo
            onRegistrar={() => null}
          />
        </I18nProvider>,
      );
    montar(cuaderno);
    expect(screen.getByTestId("protocolo-completo").textContent).toMatch(
      /Protocolo completo.*Las 10 etapas están cumplidas/,
    );
    cleanup();
    // sin la evidencia de la 10 (la 9 sí), no
    montar({
      ...cuaderno,
      evidencias: cuaderno.evidencias.filter((e) => e.etapa !== 10),
    });
    expect(screen.queryByTestId("protocolo-completo")).toBeNull();
  });
});

// --- S19: «Llévate el ganador» ----------------------------------------------------------------------

type Mensaje = { id: number; type: string; payload?: Record<string, unknown> };

/** Un worker de mentira que contesta como pipeline.py: el eco del ajuste y la exportación que escribió el emisor real. */
function instalarWorker() {
  const exportacion = JSON.parse(
    readFileSync("tests/fixtures/contrato/export-result.json", "utf8"),
  ) as unknown;
  const creados: Mensaje[][] = [];
  class FalsoWorker {
    onerror: (() => void) | null = null;
    private oyentes = new Set<(e: { data: unknown }) => void>();
    private mensajes: Mensaje[] = [];
    constructor() {
      creados.push(this.mensajes);
    }
    addEventListener(_: string, f: (e: { data: unknown }) => void) {
      this.oyentes.add(f);
    }
    removeEventListener(_: string, f: (e: { data: unknown }) => void) {
      this.oyentes.delete(f);
    }
    terminate() {}
    postMessage(m: Mensaje) {
      this.mensajes.push(m);
      const p = (m.payload ?? {}) as Record<string, unknown> & { train?: unknown[] };
      const resultado =
        m.type === "fit-winner"
          ? {
              task: p.task,
              winner: p.winner,
              n_train: (p.train as unknown[]).length,
              huella: p.huella,
              sello: p.sello,
              elapsed_ms: 1,
            }
          : exportacion;
      queueMicrotask(() =>
        this.oyentes.forEach((f) =>
          f({ data: { id: m.id, type: "result", command: m.type, result: resultado } }),
        ),
      );
    }
  }
  vi.stubGlobal("Worker", FalsoWorker);
  return creados;
}

describe("la etapa 10: llévate el ganador", () => {
  const A = armarCredito9("usar");
  it("sin los datos cargados lo dice, el botón no se puede pulsar y no se crea ningún worker", () => {
    const creados = instalarWorker();
    montarConstancia(A, ENTRADA_USAR);
    expect(screen.getByTestId("protocolo-modelo10")).toBeTruthy();
    expect(screen.getByText(/Carga arriba el archivo con que trabajaste/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Guardar el ganador como .probeta.json" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(creados).toHaveLength(0);
  });

  it("«iterar» y «no usarlo» no ofrecen el archivo: no hay nada que vigilar", () => {
    montarConstancia(armarCredito9("no-usar"), ENTRADA_NO_USAR);
    expect(screen.queryByTestId("protocolo-modelo10")).toBeNull();
  });

  it("al pulsar: UN worker, ajusta sin la prueba, exporta y descarga un archivo del Protocolo con la cifra de la prueba y ninguna fila", async () => {
    const creados = instalarWorker();
    descargas.length = 0;
    montarConstancia(A, ENTRADA_USAR, true);
    expect(creados).toHaveLength(0);
    fireEvent.click(
      screen.getByRole("button", { name: "Guardar el ganador como .probeta.json" }),
    );
    await waitFor(() => expect(descargas).toHaveLength(1));
    expect(creados).toHaveLength(1);
    const [ajuste, exportacion] = creados[0]!;
    expect(ajuste!.type).toBe("fit-winner");
    expect(Object.keys(ajuste!.payload!)).not.toContain("test");
    expect(exportacion!.type).toBe("export-model");
    expect(ajuste!.id).toBeLessThan(0);

    const { nombre, contenido, tipo } = descargas[0]!;
    expect(nombre).toMatch(/^modelo-.+\.probeta\.json$/);
    expect(tipo).toBe("application/json");
    const archivo = JSON.parse(contenido) as {
      format_version: number;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- el archivo descargado se lee a propósito sin tipos
      manifest: Record<string, any>;
      payload: string;
    };
    expect(archivo.format_version).toBe(1);
    expect(archivo.manifest.origin).toBe("protocolo");
    // lo que el Protocolo midió: el ganador y la cifra de la prueba que la etapa 8 abrió una vez
    const c7 = A.previas[7]!.chequeos;
    const c8 = A.previas[8]!.chequeos;
    expect(archivo.manifest.protocol.winner).toBe(c7.ganador);
    expect(archivo.manifest.protocol.metric).toBe(c7.metrica);
    expect(archivo.manifest.protocol.test_value).toBe(c8.prueba_metrica);
    expect(archivo.manifest.protocol.n_test).toBe(c8.n_prueba);
    expect(archivo.manifest.protocol.huella).toBe(HUELLA);
    // sin liga, sin comparación con una línea base, sin fuga, y ni una fila del entrenamiento ni de la prueba
    for (const k of ["league", "selection", "metrics", "verdict", "leakage", "rows", "train", "test"])
      expect(archivo.manifest).not.toHaveProperty(k);
    expect(contenido).not.toContain("monto_prestamo\n");
    expect(screen.getByText(/Guardado: modelo-/)).toBeTruthy();
  });

  it("con otro archivo (el sello de la partición no coincide) lo dice y no ajusta nada", () => {
    const creados = instalarWorker();
    const cuaderno = { ...A.cuaderno, cargas: [cargaDe(A)] };
    const evaluadas = evaluar(PROTOCOLO_DS, cuaderno, HUELLA, A.tabla);
    const r = registrar10(A, datos10(A, ENTRADA_USAR));
    if (!r.ok) throw new Error("registrar");
    render(
      <I18nProvider>
        <Etapa10Constancia
          evaluadas={evaluar(PROTOCOLO_DS, { ...r.cuaderno, cargas: [cargaDe(A)] }, HUELLA, A.tabla)}
          cuaderno={{ ...r.cuaderno, cargas: [cargaDe(A)] }}
          datos={{
            // otra tabla con otra huella: la partición sellada no sale igual
            tabla: { headers: A.tabla.headers, rows: A.tabla.rows.slice(0, A.tabla.rows.length - 7) },
            carga: { ...cargaDe(A), sha256: "e".repeat(64) },
          }}
        />
      </I18nProvider>,
    );
    void evaluadas;
    expect(screen.getByText(/Este archivo no es el que usaste/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Guardar el ganador como .probeta.json" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(creados).toHaveLength(0);
  });
});
