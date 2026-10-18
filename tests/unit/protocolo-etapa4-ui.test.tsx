// Protocolo DS (S9), etapa 4 — la pantalla en jsdom, con la compuerta real detrás:
//  · sin apuesta fijada NO se monta nada que dependa de lo que encontró el código;
//  · el botón de revelar dice por qué está apagado; al revelar, el foco pasa al paso 2 y la
//    apuesta queda fija (también tras desmontar y volver, en la misma pestaña);
//  · el inventario: «después» solo deja «excluir», «no sé» no ofrece «usar», la acción en bloque
//    exige la declaración y se deshace, y registrar pasa por el criterio de verdad;
//  · 80 columnas: las que no tienen alerta no se montan hasta que se abren.
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatosEtapa } from "@/engine/protocolo/etapas";
import type { CsvTable } from "@/lib/ds/csv";

vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}));

const { I18nProvider } = await import("@/i18n/provider");
const { Etapa4Form } = await import("@/components/protocolo/Etapa4Form");
const { registrar } = await import("@/engine/protocolo/compuerta");
const { ETAPA_4 } = await import("@/engine/protocolo/etapa4");
const helpers = await import("./protocolo-etapa4-helpers");
const { ENTRADA_BAJAS, HUELLA, AHORA, PROTOCOLO4, armar, datosBajas } = helpers;

const BAJAS = armar("bajas-con-fuga.csv", "binaria", ENTRADA_BAJAS);

function carga(sha256 = HUELLA) {
  return {
    tabla: BAJAS.tabla,
    carga: {
      fecha: AHORA.toISOString(),
      sha256,
      nombre: "bajas-con-fuga.csv",
      filas: BAJAS.tabla.rows.length,
      columnas: BAJAS.tabla.headers.length,
    },
  };
}

/** Monta la etapa 4 con la compuerta real; `registrado` guarda lo que la compuerta aceptó. */
function montar(
  opciones: {
    anterior?: DatosEtapa | null;
    sha256?: string;
    armado?: typeof BAJAS;
  } = {},
) {
  const armado = opciones.armado ?? BAJAS;
  const registrado: { datos: DatosEtapa | null; rechazo: unknown } = {
    datos: null,
    rechazo: null,
  };
  const onRegistrar = vi.fn((datos: DatosEtapa) => {
    const r = registrar(PROTOCOLO4, armado.cuaderno, 4, datos, {
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
      <Etapa4Form
        datos={{ ...carga(opciones.sha256), tabla: armado.tabla }}
        anterior={opciones.anterior ?? null}
        previas={armado.previas}
        onRegistrar={onRegistrar}
      />
    </I18nProvider>,
  );
  return { ...vista, registrado, onRegistrar };
}

const fila = (nombre: string) =>
  document.querySelector<HTMLElement>(`[data-columna="${nombre}"]`)!;

async function apostar(...columnas: string[]) {
  if (columnas.length === 0) {
    fireEvent.click(screen.getByLabelText("Ninguna"));
  } else {
    fireEvent.click(screen.getByLabelText("Sí, marco las que creo"));
    for (const c of columnas) fireEvent.click(screen.getByLabelText(c));
  }
  fireEvent.click(screen.getByTestId("protocolo-revelar"));
  await screen.findByTestId("protocolo-hallazgo-comparacion");
}

function responder(
  nombre: string,
  datos: { momento?: string; estado?: string; procedencia?: string },
) {
  const f = within(fila(nombre));
  if (datos.procedencia !== undefined)
    fireEvent.change(f.getByLabelText(/Quién o qué la produce/), {
      target: { value: datos.procedencia },
    });
  if (datos.momento) fireEvent.click(f.getByLabelText(datos.momento));
  if (datos.estado)
    fireEvent.change(f.getByLabelText("¿La usas?"), {
      target: { value: datos.estado },
    });
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("el paso 1: la apuesta, antes de ver nada", () => {
  it("sin apuesta fijada no hay hallazgos, ni insignias, ni inventario en el DOM", () => {
    montar();
    for (const id of [
      "protocolo-hallazgo-fuga",
      "protocolo-hallazgo-vacios",
      "protocolo-hallazgo-identificador",
      "protocolo-hallazgo-duplicados",
      "protocolo-hallazgo-deriva",
      "protocolo-hallazgo-comparacion",
      "protocolo-columna",
      "protocolo-bloque",
    ])
      expect(screen.queryByTestId(id), id).toBeNull();
    expect(document.body.textContent).not.toMatch(
      /Vacía hasta el resultado|Parece identificador|Filtra el resultado|PSI/,
    );
    expect(screen.getByTestId("protocolo-estado4").textContent).toBe("");
  });

  it("el botón dice por qué está apagado, y se enciende con una apuesta o con «ninguna»", () => {
    montar();
    const boton = screen.getByTestId("protocolo-revelar");
    expect(boton).toBeDisabled();
    expect(document.body.textContent).toContain("Elige primero");
    fireEvent.click(screen.getByLabelText("Sí, marco las que creo"));
    expect(boton).toBeDisabled();
    expect(document.body.textContent).toContain("Marca al menos una columna");
    fireEvent.click(screen.getByLabelText("canal"));
    expect(boton).toBeEnabled();
    fireEvent.click(screen.getByLabelText("canal")); // la desmarca
    expect(boton).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Ninguna"));
    expect(boton).toBeEnabled();
  });

  it("lista las columnas del archivo en su orden, sin el objetivo", () => {
    montar();
    fireEvent.click(screen.getByLabelText("Sí, marco las que creo"));
    const casillas = screen
      .getAllByRole("checkbox")
      .map((c) => c.closest("label")?.textContent);
    expect(casillas).toEqual(
      BAJAS.tabla.headers.filter((c) => c !== "se_dio_de_baja"),
    );
  });
});

describe("el paso 2: la revelación", () => {
  it("dice «calculando», luego muestra lo plantado, fija la apuesta y pasa el foco al título", async () => {
    montar();
    fireEvent.click(screen.getByLabelText("Sí, marco las que creo"));
    fireEvent.click(screen.getByLabelText("canal"));
    fireEvent.click(screen.getByTestId("protocolo-revelar"));
    expect(screen.getByTestId("protocolo-estado4").textContent).toMatch(
      /Calculando/,
    );
    await screen.findByTestId("protocolo-hallazgo-comparacion");
    expect(screen.getByTestId("protocolo-estado4").textContent).toBe("");
    expect(screen.queryByTestId("protocolo-revelar")).toBeNull();
    expect(screen.getByTestId("protocolo-apuesta-fija").textContent).toContain(
      "canal",
    );
    expect(document.activeElement?.textContent).toBe(
      "2 · Lo que encontró la app",
    );

    expect(
      screen.getByTestId("protocolo-hallazgo-vacios").textContent,
    ).toContain("motivo_baja");
    expect(
      screen.getByTestId("protocolo-hallazgo-identificador").textContent,
    ).toContain("referencia");
    expect(
      screen.getByTestId("protocolo-hallazgo-duplicados").textContent,
    ).toMatch(/4 de 480/);
    expect(
      screen.getByTestId("protocolo-hallazgo-deriva").textContent,
    ).toContain("2025-09-15");
  });

  it("compara tu apuesta con lo que encontró: una sorpresa y una apostada que la app no marca", async () => {
    montar();
    await apostar("canal");
    const comparacion = screen.getByTestId(
      "protocolo-hallazgo-comparacion",
    ).textContent!;
    expect(comparacion).toMatch(/Te sorprendieron[^.]*motivo_baja/);
    expect(comparacion).toMatch(/Apostaste y la app no las marca: canal/);
    expect(comparacion).toContain("una columna a la vez");
  });

  it("la apuesta queda fija: al volver a montar la pantalla en la misma pestaña no se apuesta de nuevo", async () => {
    const primera = montar();
    await apostar("motivo_baja");
    primera.unmount();
    montar();
    expect(screen.queryByTestId("protocolo-revelar")).toBeNull();
    await screen.findByTestId("protocolo-hallazgo-comparacion");
    expect(screen.getByTestId("protocolo-apuesta-fija").textContent).toContain(
      "motivo_baja",
    );
  });

  it("otro archivo (otra huella) es otra apuesta", async () => {
    const primera = montar();
    await apostar("motivo_baja");
    primera.unmount();
    montar({ sha256: "a".repeat(64) });
    expect(screen.getByTestId("protocolo-revelar")).toBeInTheDocument();
  });

  it("corregir una etapa ya registrada abre con su apuesta fija y sus respuestas", async () => {
    const datos = datosBajas(BAJAS);
    montar({ anterior: datos });
    await screen.findByTestId("protocolo-hallazgo-comparacion");
    expect(screen.queryByTestId("protocolo-revelar")).toBeNull();
    expect(screen.getByTestId("protocolo-apuesta-fija").textContent).toContain(
      "ninguna",
    );
    expect(screen.getByTestId("protocolo-progreso").textContent).toMatch(
      /Todas con estado: usar 5/,
    );
  });
});

describe("el paso 3: el inventario", () => {
  it("las columnas con alerta van abiertas, una por una; las demás, plegadas y sin montar", async () => {
    montar();
    await apostar();
    expect(screen.getByTestId("protocolo-con-alerta").textContent).toContain(
      "6 columnas con alerta",
    );
    const abiertas = [...document.querySelectorAll("[data-columna]")].map((f) =>
      f.getAttribute("data-columna"),
    );
    expect(abiertas).toEqual(
      expect.arrayContaining([
        "motivo_baja",
        "referencia",
        "cliente_id",
        "mes_observado",
        "uso_mensual_gb",
        "canal",
      ]),
    );
    expect(fila("plan")).toBeNull();
    const detalles = screen.getByTestId(
      "protocolo-sin-alerta",
    ) as HTMLDetailsElement;
    detalles.open = true;
    fireEvent(detalles, new Event("toggle"));
    expect(fila("plan")).not.toBeNull();
  });

  it("lo que filtra va primero: motivo_baja antes que el resto", async () => {
    montar();
    await apostar();
    const nombres = [...document.querySelectorAll("[data-columna]")].map((f) =>
      f.getAttribute("data-columna"),
    );
    expect(nombres[0]).toBe("motivo_baja");
  });

  it("«después de decidir» deja solo «excluir» y lo dice; «no sé» no ofrece «usar»", async () => {
    montar();
    await apostar();
    responder("canal", { momento: "Antes de decidir", estado: "usar" });
    const select = within(fila("canal")).getByLabelText(
      "¿La usas?",
    ) as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual([
      "Elige…",
      "Usar",
      "Excluir",
      "No sé (no entrena)",
    ]);

    fireEvent.click(
      within(fila("canal")).getByLabelText(
        "Después de decidir (o del resultado)",
      ),
    );
    expect(select.value).toBe("excluir");
    expect([...select.options].map((o) => o.textContent)).toEqual([
      "Elige…",
      "Excluir",
    ]);
    expect(screen.getByTestId("protocolo-estado4").textContent).toMatch(
      /canal: se llena después de decidir/,
    );

    responder("canal", { momento: "Antes de decidir", estado: "usar" });
    fireEvent.click(within(fila("canal")).getByLabelText("No sé"));
    expect(select.value).toBe("nose");
    expect([...select.options].map((o) => o.textContent)).toEqual([
      "Elige…",
      "Excluir",
      "No sé (no entrena)",
    ]);
    expect(screen.getByTestId("protocolo-estado4").textContent).toMatch(
      /no entrena/,
    );
  });

  it("«usar» una columna con alerta pide su procedencia; sin ella la compuerta no registra", async () => {
    const { registrado } = montar();
    await apostar();
    for (const [c, d] of Object.entries({
      cliente_id: { estado: "excluir" },
      mes_observado: { estado: "excluir" },
      motivo_baja: { momento: "Después de decidir (o del resultado)" },
      referencia: { estado: "excluir" },
      uso_mensual_gb: { momento: "Antes de decidir", estado: "usar" },
    }))
      responder(c, d);
    expect(
      within(fila("uso_mensual_gb")).getByText(/Obligatoria/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("protocolo-bloque-declaro"));
    fireEvent.click(screen.getByTestId("protocolo-bloque-aplicar"));
    // falta además «canal» (alerta, una por una)
    responder("canal", {
      momento: "Antes de decidir",
      estado: "usar",
      procedencia: "Lo registra el vendedor",
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Registrar la etapa 4" }),
    );
    expect(registrado.datos).toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(
      /la procedencia de cada columna con alerta que usas/,
    );
    responder("uso_mensual_gb", { procedencia: "Medidor de la red" });
    fireEvent.click(
      screen.getByRole("button", { name: "Registrar la etapa 4" }),
    );
    expect(registrado.rechazo).toBeNull();
    expect(registrado.datos).not.toBeNull();
  });

  it("la acción en bloque exige la declaración, deja la declaración en lo registrado y se deshace", async () => {
    montar();
    await apostar();
    const panel = screen.getByTestId("protocolo-bloque");
    expect(panel.textContent).toContain(
      "Estas 3 columnas no tienen ninguna alerta",
    );
    const aplicar = screen.getByTestId("protocolo-bloque-aplicar");
    expect(aplicar).toBeDisabled();
    fireEvent.click(screen.getByTestId("protocolo-bloque-declaro"));
    expect(aplicar).toBeEnabled();
    fireEvent.click(aplicar);
    expect(screen.getByTestId("protocolo-bloque-hecho").textContent).toContain(
      "3 columnas",
    );
    expect(screen.getByTestId("protocolo-estado4").textContent).toMatch(
      /3 columnas marcadas/,
    );
    expect(screen.getByTestId("protocolo-progreso").textContent).toMatch(
      /Faltan 6 de 9/,
    );

    fireEvent.click(screen.getByTestId("protocolo-bloque-deshacer"));
    expect(screen.getByTestId("protocolo-progreso").textContent).toMatch(
      /Faltan 9 de 9/,
    );
    expect(screen.getByTestId("protocolo-bloque").textContent).toContain(
      "Estas 3 columnas",
    );
    // deshacer pide declarar de nuevo
    expect(screen.getByTestId("protocolo-bloque-aplicar")).toBeDisabled();
  });

  it("de punta a punta: el inventario honesto lo acepta la compuerta, con la declaración en bloque", async () => {
    const { registrado, onRegistrar } = montar();
    await apostar("motivo_baja");
    fireEvent.click(screen.getByTestId("protocolo-bloque-declaro"));
    fireEvent.click(screen.getByTestId("protocolo-bloque-aplicar"));
    const D = "Después de decidir (o del resultado)";
    const A = "Antes de decidir";
    responder("cliente_id", { estado: "excluir" });
    responder("mes_observado", { estado: "excluir" });
    responder("canal", {
      momento: A,
      estado: "usar",
      procedencia: "Lo registra el vendedor al abrir la cuenta",
    });
    responder("uso_mensual_gb", {
      momento: A,
      estado: "usar",
      procedencia: "Medidor de la red, al cierre de mes",
    });
    responder("motivo_baja", {
      momento: D,
      procedencia: "Lo escribe soporte al cerrar la baja",
    });
    responder("referencia", { estado: "excluir" });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Registrar la etapa 4" }),
      );
    });
    expect(onRegistrar).toHaveBeenCalledTimes(1);
    expect(registrado.rechazo).toBeNull();
    const datos = registrado.datos!;
    expect(ETAPA_4.criterio(datos, BAJAS.previas)).toEqual({ tipo: "cumple" });
    expect(datos.respuestas.en_bloque).toEqual([
      "plan",
      "antiguedad_meses",
      "tickets_soporte",
    ]);
    expect(datos.respuestas.apuesta).toEqual(["motivo_baja"]);
    expect(datos.chequeos.aciertos).toEqual(["motivo_baja"]);
    // lo mismo que arma el motor para ese inventario
    expect(datos.respuestas.estado).toEqual(
      datosBajas(BAJAS, undefined, {
        apuesta: ["motivo_baja"],
        enBloque: ["plan", "antiguedad_meses", "tickets_soporte"],
      }).respuestas.estado,
    );
  });
});

describe("80 columnas", () => {
  function ancha(): typeof BAJAS {
    const columnas = Array.from({ length: 78 }, (_, i) => `c${i}`);
    const headers = ["u", "f", ...columnas, "y"];
    const rows = Array.from({ length: 160 }, (_, i) => [
      `U${i}`,
      `2025-${String(1 + (i % 12)).padStart(2, "0")}-15`,
      ...columnas.map((_, k) => String(((i * 7 + k * 13) % 17) + (k % 3))),
      i % 3 === 0 ? "si" : "no",
    ]);
    const tabla: CsvTable = { headers, rows };
    return armar(
      "x.csv",
      "binaria",
      {
        objetivo: "y",
        positivo: "si",
        unidadColumna: null,
        momentoColumna: null,
        momentoTexto: "Cuando se pide",
        ordenFecha: null,
      },
      tabla,
    );
  }

  it("solo se montan las que tienen alerta; el resto, al abrir la lista", async () => {
    const armado = ancha();
    montar({ armado });
    await apostar();
    const montadas = document.querySelectorAll("[data-columna]").length;
    expect(montadas).toBeLessThan(40);
    const panel = screen.getByTestId("protocolo-bloque");
    expect(panel.textContent).toMatch(
      /Estas \d+ columnas no tienen ninguna alerta/,
    );
  });
});
