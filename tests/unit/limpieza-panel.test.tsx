// S18 (ADR 026): el panel de la hoja leída, de los posibles datos personales y del plan de limpieza. Lo que estas pruebas hacen
// FALLAR si se rompe:
//  · el aviso de datos personales nombra la columna y el tipo, JAMÁS un valor: nada de la tabla aparece en el HTML;
//  · cada paso tiene su frase, su estado con símbolo + palabra (el color nunca solo) y sus dos botones, con icono;
//  · aprobar, rechazar y volver a pulsar el botón activo (sin decidir) llegan a quien decide, con el id del paso;
//  · lo no decidido se dice («sin decidir»), y el resumen cuenta los tres estados;
//  · la hoja leída se dice, con las que se ignoraron;
//  · los dos idiomas, y sin nada que mostrar no pinta nada.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LimpiezaPanel } from "@/components/limpieza/LimpiezaPanel";
import { lineasDeLimpieza } from "@/components/limpieza/ficha";
import { analizarIngesta } from "@/engine/ingesta";
import { aplicarDecisiones } from "@/engine/limpieza-plan";
import { LOCALE_STORAGE_KEY } from "@/i18n/config";
import { sanitizeTable } from "@/engine/sanitize";
import { parseCsvWithLimits } from "@/lib/ds/csv";
import { readFileSync } from "node:fs";

vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}));

const { I18nProvider } = await import("@/i18n/provider");

const ingestaDe = (archivo: string) => {
  const l = parseCsvWithLimits(
    readFileSync(`docs/kit-de-prueba/${archivo}`, "utf8"),
  );
  if (!l.ok) throw new Error(archivo);
  return {
    table: l.table,
    ingesta: analizarIngesta(l.table, sanitizeTable(l.table).table),
  };
};

function pintar(
  ingesta: ReturnType<typeof analizarIngesta> | null,
  opciones: {
    origen?: { formato: "xlsx"; hoja: string; hojasIgnoradas: number } | null;
    onDecidir?: (id: string, d: "aprobado" | "rechazado" | null) => void;
  } = {},
) {
  return render(
    <I18nProvider>
      <LimpiezaPanel
        ingesta={ingesta}
        origen={opciones.origen ?? null}
        onDecidir={opciones.onDecidir ?? (() => {})}
      />
    </I18nProvider>,
  );
}

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, "es"));
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("datos personales", () => {
  const { table, ingesta } = ingestaDe("clientes-con-datos-personales.csv");

  it("nombra la columna y el tipo en cada aviso", () => {
    pintar(ingesta);
    const aviso = screen.getByText("Posibles datos personales").closest("div")!;
    for (const [columna, tipo] of [
      ["correo", "correos electrónicos"],
      ["telefono", "teléfonos"],
      ["documento", "documentos de identidad"],
      ["nombre_completo", "nombres de personas"],
    ])
      expect(aviso.textContent).toContain(
        `«${columna}»: parece guardar ${tipo}`,
      );
  });

  it("dice cuáles el saneamiento ya dejó fuera por tener un valor distinto por fila, y solo esas", () => {
    expect(
      ingesta.personales
        .filter((a) => a.fuera)
        .map((a) => a.column)
        .sort(),
    ).toEqual(["correo", "documento"]);
    pintar(ingesta);
    const lineas = screen.getAllByText(/parece guardar/);
    const fuera = lineas.filter((li) =>
      /ya la dejó fuera al sanear/.test(li.textContent!),
    );
    expect(fuera).toHaveLength(2);
  });

  it("JAMÁS pinta un valor de la tabla", () => {
    const { container } = pintar(ingesta);
    const html = container.innerHTML;
    for (const columna of [
      "nombre_completo",
      "correo",
      "telefono",
      "documento",
    ]) {
      const i = table.headers.indexOf(columna);
      for (const fila of table.rows)
        expect(html, `${columna}: ${fila[i]}`).not.toContain(fila[i]!);
    }
  });

  it("es un aviso, no un bloqueo: lo dice, y dice que no se muestra ni se envía", () => {
    pintar(ingesta);
    expect(screen.getByText(/es un aviso, no un bloqueo/i)).toBeTruthy();
    expect(
      screen.getByText(/no muestra esos valores ni los envía a ningún lado/i),
    ).toBeTruthy();
  });
});

describe("el plan", () => {
  const { ingesta } = ingestaDe("clientes-con-datos-personales.csv");

  it("cada paso dice qué hace y empieza «sin decidir», con símbolo y palabra", () => {
    pintar(ingesta);
    const pasos = screen
      .getAllByRole("listitem")
      .filter((li) => li.querySelector("button"));
    expect(pasos).toHaveLength(ingesta.plan.length);
    for (const li of pasos) {
      expect(li.textContent).toContain("○");
      expect(li.textContent).toContain("Sin decidir");
    }
    expect(
      screen.getByText(
        /«telefono» parece guardar teléfonos: quitarla antes de entrenar/,
      ),
    ).toBeTruthy();
  });

  it("los botones llevan icono y se anuncian como interruptores", () => {
    pintar(ingesta);
    const aprobar = screen.getByRole("button", {
      name: /Aprobar · nombre_completo/,
    });
    expect(aprobar.getAttribute("aria-pressed")).toBe("false");
    expect(aprobar.querySelector("svg")).not.toBeNull();
    expect(
      screen
        .getByRole("button", { name: /Rechazar · nombre_completo/ })
        .querySelector("svg"),
    ).not.toBeNull();
  });

  it("aprobar, rechazar y volver a pulsar el activo llegan con el id del paso", () => {
    const onDecidir = vi.fn();
    const { rerender } = pintar(ingesta, { onDecidir });
    fireEvent.click(
      screen.getByRole("button", { name: /Aprobar · nombre_completo/ }),
    );
    expect(onDecidir).toHaveBeenLastCalledWith(
      "quitar-columna:nombre_completo",
      "aprobado",
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Rechazar · telefono/ }),
    );
    expect(onDecidir).toHaveBeenLastCalledWith(
      "quitar-columna:telefono",
      "rechazado",
    );

    rerender(
      <I18nProvider>
        <LimpiezaPanel
          ingesta={{
            ...ingesta,
            decisiones: { "quitar-columna:nombre_completo": "aprobado" },
          }}
          origen={null}
          onDecidir={onDecidir}
        />
      </I18nProvider>,
    );
    const activo = screen.getByRole("button", {
      name: /Aprobar · nombre_completo/,
    });
    expect(activo.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(activo);
    expect(onDecidir).toHaveBeenLastCalledWith(
      "quitar-columna:nombre_completo",
      null,
    );
  });

  it("el resumen cuenta aprobados, rechazados y sin decidir; el estado lleva su símbolo", () => {
    pintar({
      ...ingesta,
      decisiones: {
        "quitar-columna:nombre_completo": "aprobado",
        "quitar-columna:telefono": "rechazado",
      },
    });
    expect(
      screen.getByText("Aprobados: 1 · Rechazados: 1 · Sin decidir: 0"),
    ).toBeTruthy();
    const fila = (columna: string) =>
      screen
        .getByRole("button", { name: new RegExp(`Aprobar · ${columna}`) })
        .closest("li")!;
    expect(
      within(fila("nombre_completo")).getByText(/Aprobado/).textContent,
    ).toContain("Aprobado");
    expect(fila("nombre_completo").textContent).toContain("✓");
    expect(fila("telefono").textContent).toContain("✕");
  });

  it("en inglés, todo en inglés", () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    pintar(ingesta);
    expect(screen.getByText("Possible personal data")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Approve · nombre_completo/ }),
    ).toBeTruthy();
    expect(screen.getAllByText("Undecided").length).toBeGreaterThan(0);
  });
});

describe("la hoja leída", () => {
  it("dice qué hoja se leyó y, si las hay, cuántas se ignoraron", () => {
    const { rerender } = pintar(null, {
      origen: { formato: "xlsx", hoja: "Ventas", hojasIgnoradas: 2 },
    });
    expect(
      screen.getByText(
        "Se leyó la hoja «Ventas» de tu Excel; las otras 2 hojas se ignoraron.",
      ),
    ).toBeTruthy();
    rerender(
      <I18nProvider>
        <LimpiezaPanel
          ingesta={null}
          origen={{ formato: "xlsx", hoja: "Ventas", hojasIgnoradas: 1 }}
          onDecidir={() => {}}
        />
      </I18nProvider>,
    );
    expect(
      screen.getByText(
        "Se leyó la hoja «Ventas» de tu Excel; la otra hoja se ignoró.",
      ),
    ).toBeTruthy();
    rerender(
      <I18nProvider>
        <LimpiezaPanel
          ingesta={null}
          origen={{ formato: "xlsx", hoja: "Datos", hojasIgnoradas: 0 }}
          onDecidir={() => {}}
        />
      </I18nProvider>,
    );
    expect(
      screen.getByText("Se leyó la hoja «Datos» de tu Excel."),
    ).toBeTruthy();
  });

  it("sin hoja, sin avisos y sin plan no pinta nada", () => {
    const { container } = pintar({ personales: [], plan: [], decisiones: {} });
    expect(container.innerHTML).toBe("");
  });
});

describe("la ficha del modelo", () => {
  const { ingesta } = ingestaDe("clientes-con-datos-personales.csv");
  const registro = aplicarDecisiones(
    ingesta.plan,
    {
      "quitar-columna:nombre_completo": "aprobado",
      "quitar-columna:telefono": "rechazado",
    },
    "se_dio_de_baja",
  ).registro;

  it("lista cada paso con su decisión, en el idioma de la ficha", () => {
    const es = lineasDeLimpieza("es", registro).join("\n");
    expect(es).toContain("## Plan de limpieza");
    expect(es).toContain(
      "- «nombre_completo» (columna quitada): aprobado y aplicado",
    );
    expect(es).toContain("- «telefono» (columna quitada): rechazado");
    const en = lineasDeLimpieza("en", registro).join("\n");
    expect(en).toContain("## Cleaning plan");
    expect(en).toContain(
      "- “nombre_completo” (column removed): approved and applied",
    );
  });

  it("sin plan no escribe nada", () => {
    expect(lineasDeLimpieza("es", undefined)).toEqual([]);
    expect(lineasDeLimpieza("es", [])).toEqual([]);
  });

  it("un paso aprobado que no se aplicó dice por qué", () => {
    const sobreObjetivo = aplicarDecisiones(
      ingesta.plan,
      { "quitar-columna:nombre_completo": "aprobado" },
      "nombre_completo",
    ).registro;
    expect(lineasDeLimpieza("es", sobreObjetivo).join("\n")).toContain(
      "aprobado, no se aplicó: es la columna que se predice",
    );
  });
});

describe("las cifras del plan se escriben como en el resto de la app (R9, auditoría H-06 del S18)", () => {
  it("miles con coma y porcentaje con punto decimal, en español y en inglés", () => {
    const ingesta = {
      personales: [],
      plan: [
        {
          id: "vacio-indicador:ingreso",
          tipo: "vacio-indicador" as const,
          columna: "ingreso",
          celdas: 1234,
          de: 23_456,
        },
      ],
      decisiones: {},
    };
    pintar(ingesta);
    // 1234 de 23 456 = 5.26 % → «5.3» (no «5,3» del español de Intl) y «1,234» (no «1234»)
    expect(screen.getByText(/1,234 celdas vacías \(5\.3 %\)/)).toBeTruthy();
    cleanup();
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    pintar(ingesta);
    expect(screen.getByText(/1,234 empty cells \(5\.3 %\)/)).toBeTruthy();
  });
});
