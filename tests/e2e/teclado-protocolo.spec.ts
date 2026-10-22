import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { axeBothThemes } from "./axe-temas";
import {
  abrir,
  cargarCsv,
  correrLiga,
  abrirPrueba,
  cumplirEtapa2Credito,
  cumplirEtapa3,
  cumplirEtapa4Credito,
  cumplirEtapa5SinRegla,
  cumplirEtapa6Credito,
  cumplirEtapa9,
} from "./protocolo-pasos";
import {
  activarConTeclado,
  completarConTeclado,
  focoActual,
  focoAtrapado,
  recorrerConTeclado,
  tabularAtrasHasta,
  tabularHasta,
} from "./teclado";

// S16 — Protocolo DS por teclado, de punta a punta. Hasta aquí ningún e2e pulsaba Tab: axe mide el árbol, no el
// recorrido. Un solo recorrido (el de crédito, hasta «Protocolo completo»; las etapas 7 y 8 corren el worker de
// verdad): al abrirse, cada etapa se camina con Tab (paradas visibles, con nombre y con foco, en el orden del
// documento, sin trampa, y todo control usable se alcanza); la etapa 1 se llena SOLO con el teclado; el glosario
// salta a su entrada; el cuaderno y los cuatro diálogos (trampa de foco, Escape, foco al cerrar y al confirmar); y
// la vista previa de la ficha se abre y se cierra con Enter y Espacio. Solo en escritorio: Tab no aplica al teléfono.

test.skip(({ isMobile }) => isMobile, "Tab no aplica al teléfono");
test.setTimeout(600_000);

test("el recorrido por teclado detecta un control sin nombre, un foco invisible y un orden roto", async ({
  page,
}) => {
  await abrir(page);
  const inyectar = (html: string) =>
    page.evaluate((html) => {
      document.querySelector("main")!.insertAdjacentHTML("afterbegin", html);
    }, html);

  await inyectar('<button id="malo" style="width:40px;height:20px"></button>');
  await expect(recorrerConTeclado(page, "main")).rejects.toThrow(/nombre/);
  await page.evaluate(() => document.getElementById("malo")?.remove());

  await inyectar(
    '<button id="malo" style="outline:none;box-shadow:none">Sin foco</button>',
  );
  await expect(recorrerConTeclado(page, "main")).rejects.toThrow(/foco/);
  await page.evaluate(() => document.getElementById("malo")?.remove());

  // un tabindex positivo salta delante de todo: el recorrido sale del ámbito y deja controles sin alcanzar
  await inyectar('<button id="malo" tabindex="4">Fuera de orden</button>');
  await expect(recorrerConTeclado(page, "main")).rejects.toThrow(
    /no se alcanzan|orden del documento/,
  );
  await page.evaluate(() => document.getElementById("malo")?.remove());

  // un control usable que Tab no alcanza (tabindex="-1") queda sin alcanzar
  await inyectar('<button id="malo" tabindex="-1">Inalcanzable</button>');
  await expect(recorrerConTeclado(page, "main")).rejects.toThrow(
    /no se alcanzan/,
  );
  await page.evaluate(() => document.getElementById("malo")?.remove());

  // un selector sin etiqueta no se nombra con el texto de sus opciones
  await inyectar('<select id="malo"><option>una opción</option></select>');
  await expect(recorrerConTeclado(page, "main")).rejects.toThrow(/nombre/);
  await page.evaluate(() => document.getElementById("malo")?.remove());

  // sin el control malo, el mismo recorrido pasa
  await recorrerConTeclado(page, "main", { minimo: 10 });
});

test("las diez etapas, el cuaderno, el glosario y los cuatro diálogos se usan sin ratón", async ({
  page,
}) => {
  await abrir(page);

  // La página en frío: cada parada se ve, se nombra y muestra el foco; axe en los dos temas.
  await recorrerConTeclado(page, "main", { minimo: 10 });
  await axeBothThemes(page);

  // Etapa 1: se alcanza todo y se llena y registra SOLO con el teclado.
  const e1 = page.locator("#etapa-1");
  await recorrerConTeclado(page, "#etapa-1", { minimo: 8 });
  await axeBothThemes(page);
  await completarConTeclado(page, "#etapa-1", [
    {
      nombre: /^La decisión/,
      escribe: "Llamar o no al cliente antes de que venza su plan",
    },
    { nombre: /^Quién la toma/, escribe: "Jefa de retención" },
    { leyenda: /^Cómo es la decisión/, elige: /^Sí o no/ },
    { nombre: /^Unidad de costo/, escribe: "US$" },
    { nombre: /^Costo de actuar sin que hiciera falta/, escribe: "10" },
    { nombre: /^Costo de no actuar y que sí hiciera falta/, escribe: "50" },
    { nombre: /^Registrar la etapa 1/, pulsa: "Enter" },
  ]);
  await expect(e1.getByText("Cumplida")).toBeVisible();
  // al registrar, el foco queda en el título de la etapa: quien usa lector sigue en su lugar
  await expect(page.locator("#etapa-1-titulo")).toBeFocused();

  // Etapa 2: abierta con datos (el selector de archivo nativo no se maneja con teclado: el CSV entra por el input).
  await cargarCsv(page, "credito-fuga-plantada.csv");
  await expect(page.getByTestId("protocolo-datos")).toContainText(
    /credito-fuga-plantada\.csv/,
  );
  await recorrerConTeclado(page, "#etapa-2", { minimo: 4 });
  await axeBothThemes(page);
  await cumplirEtapa2Credito(page);

  // Etapa 3.
  await recorrerConTeclado(page, "#etapa-3", { minimo: 4 });
  await cumplirEtapa3(page, false);

  // Etapa 4: antes y después de revelar el inventario.
  await recorrerConTeclado(page, "#etapa-4", { minimo: 2 });
  await cumplirEtapa4Credito(page);
  await recorrerConTeclado(page, "#etapa-4");

  // El glosario: un término de la etapa lleva a su entrada y de ahí se sigue.
  await page.locator("#etapa-4-titulo").focus();
  await tabularHasta(page, '#etapa-4 a[href^="#termino-"]');
  await activarConTeclado(page);
  const ancla = await page.evaluate(() => location.hash);
  expect(ancla).toMatch(/^#termino-/);
  await expect(page.locator(ancla)).toBeInViewport();
  await page.keyboard.press("Tab");
  // Tab sigue desde la entrada a la que se saltó: o hay algo después de ella, o era lo último de la página
  const despues = await page.evaluate((ancla) => {
    const entrada = document.querySelector(ancla)!;
    const foco = document.activeElement!;
    return {
      ancla,
      foco: foco === document.body ? "body" : foco.outerHTML.slice(0, 120),
      sigue:
        foco === document.body ||
        !!(
          entrada.compareDocumentPosition(foco) &
          Node.DOCUMENT_POSITION_FOLLOWING
        ),
    };
  }, ancla);
  expect(despues.sigue, JSON.stringify(despues)).toBe(true);

  // Etapas 5 y 6.
  await recorrerConTeclado(page, "#etapa-5", { minimo: 2 });
  await cumplirEtapa5SinRegla(page);
  await recorrerConTeclado(page, "#etapa-6", { minimo: 2 });
  await axeBothThemes(page);
  await cumplirEtapa6Credito(page);

  // Etapa 7: el worker de verdad; el recorrido ve el resultado de la liga.
  await recorrerConTeclado(page, "#etapa-7", { minimo: 1 });
  await correrLiga(page);
  await recorrerConTeclado(page, "#etapa-7", { minimo: 2 });
  await page
    .locator("#etapa-7")
    .getByRole("button", { name: "Registrar la etapa 7" })
    .click();
  await expect(page.locator("#etapa-7").getByText("Cumplida")).toBeVisible();

  // Etapa 8.
  await recorrerConTeclado(page, "#etapa-8", { minimo: 1 });
  await abrirPrueba(page);
  await recorrerConTeclado(page, "#etapa-8", { minimo: 2 });
  const e8 = page.locator("#etapa-8");
  await e8
    .getByLabel("Tu patrón de fallo")
    .fill("Falla con quienes trabajan en la informalidad");
  await e8.getByRole("button", { name: "Registrar la etapa 8" }).click();
  await expect(e8.getByText("Cumplida")).toBeVisible();

  // Etapa 9.
  await recorrerConTeclado(page, "#etapa-9", { minimo: 3 });
  await cumplirEtapa9(
    page,
    "Usarlo",
    "Ahorra frente a lo de hoy y el equipo alcanza",
  );

  // Etapa 10: el dueño, la cadencia y la vista previa de la ficha con Enter y Espacio.
  const e10 = page.locator("#etapa-10");
  await recorrerConTeclado(page, "#etapa-10", { minimo: 4 });
  await e10
    .getByRole("button", { name: /Poner al decisor de la etapa 1/ })
    .click();
  await e10.getByLabel("Reentrenar cada (meses)").fill("6");
  await page.locator("#etapa-10-titulo").focus();
  await tabularHasta(page, "#etapa-10 summary");
  const vista = e10.locator("details").filter({
    has: page.getByText("Vista previa de la ficha"),
  });
  await expect(vista).not.toHaveAttribute("open", "");
  await activarConTeclado(page, "Enter");
  await expect(vista).toHaveAttribute("open", "");
  await recorrerConTeclado(page, "#etapa-10", { minimo: 6 });
  await axeBothThemes(page);
  await page.locator("#etapa-10-titulo").focus();
  await tabularHasta(page, "#etapa-10 summary");
  await activarConTeclado(page, "Space");
  await expect(vista).not.toHaveAttribute("open", "");
  await activarConTeclado(page, "Enter");
  await expect(vista).toHaveAttribute("open", "");

  await tabularHasta(page, /^Registrar la etapa 10/);
  await activarConTeclado(page, "Enter");
  await expect(e10.getByText("Cumplida")).toBeVisible();
  await expect(page.locator("#etapa-10-titulo")).toBeFocused();
  await expect(page.getByTestId("protocolo-completo")).toBeVisible();

  // La ficha escrita y el chequeo de deriva también se recorren; su descarga sale con Enter.
  await recorrerConTeclado(page, "#etapa-10", { minimo: 3 });
  await axeBothThemes(page);
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    (async () => {
      await page.locator("#etapa-10-titulo").focus();
      await tabularHasta(page, /^Descargar la ficha/);
      await activarConTeclado(page, "Enter");
    })(),
  ]);
  expect(descarga.suggestedFilename()).toBe(
    "ficha-del-modelo-credito-fuga-plantada.md",
  );

  // El cuaderno: sus botones se alcanzan en orden.
  await recorrerConTeclado(page, '[aria-labelledby="cuaderno-titulo"]', {
    minimo: 3,
  });
  await recorrerConTeclado(page, '[aria-labelledby="glosario-titulo"]', {
    minimo: 3,
  });

  // Los cuatro diálogos.
  const cargar = page.getByRole("button", { name: "Cargar otro CSV" });
  const datos = page.getByRole("alertdialog", {
    name: "Este archivo no es el del cuaderno",
  });
  await cargarCsv(page, "planes-suscripcion.csv");
  await expect(datos).toBeVisible();
  await expect(
    datos.getByRole("button", { name: "No cargarlo" }),
  ).toBeFocused();
  await focoAtrapado(page, "dialog[open]");
  await axeBothThemes(page, "dialog");
  await page.keyboard.press("Escape");
  await expect(datos).toBeHidden();
  await expect(cargar).toBeFocused();

  // Segundo paso: «otro proyecto» pide un segundo sí; Escape en él vuelve al primero, no confirma.
  await cargarCsv(page, "planes-suscripcion.csv");
  await tabularAtrasHasta(page, /^Otro proyecto/);
  await activarConTeclado(page, "Enter");
  const segundo = page.getByRole("alertdialog", {
    name: "¿Empezar un cuaderno nuevo con este archivo?",
  });
  await expect(segundo).toBeVisible();
  await expect(segundo.getByRole("button", { name: "Volver" })).toBeFocused();
  await focoAtrapado(page, "dialog[open]");
  await page.keyboard.press("Escape");
  await expect(segundo).toBeHidden();
  await expect(datos).toBeVisible();
  await expect(
    datos.getByRole("button", { name: "No cargarlo" }),
  ).toBeFocused();
  await activarConTeclado(page, "Enter");
  await expect(datos).toBeHidden();
  await expect(cargar).toBeFocused();
  await expect(page.locator("#etapa-10").getByText("Cumplida")).toBeVisible();

  // «Empezar otro cuaderno»: se abre con el teclado, atrapa el foco y Escape devuelve al botón.
  const nuevo = page.getByRole("alertdialog", {
    name: "Empezar otro cuaderno",
  });
  await tabularHasta(page, /^Empezar otro cuaderno/);
  await activarConTeclado(page, "Enter");
  await expect(nuevo).toBeVisible();
  await expect(nuevo.getByRole("button", { name: "Cancelar" })).toBeFocused();
  await focoAtrapado(page, "dialog[open]");
  await page.keyboard.press("Escape");
  await expect(nuevo).toBeHidden();
  expect((await focoActual(page)).nombre).toMatch(/^Empezar otro cuaderno/);

  // Reemplazar por un archivo: exportar primero, importar, Escape, y confirmar con el teclado.
  const [exporta] = await Promise.all([
    page.waitForEvent("download"),
    (async () => {
      await tabularHasta(page, /^Exportar cuaderno/);
      await activarConTeclado(page, "Enter");
    })(),
  ]);
  const archivo = (await exporta.path())!;
  expect(JSON.parse(readFileSync(archivo, "utf8")).formato).toBe(
    "protocolo-ds",
  );
  await page.getByTestId("protocolo-importar").setInputFiles(archivo);
  const reemplazo = page.getByRole("alertdialog", {
    name: "¿Reemplazar tu cuaderno por el del archivo?",
  });
  await expect(reemplazo).toBeVisible();
  await expect(
    reemplazo.getByRole("button", { name: "Cancelar" }),
  ).toBeFocused();
  await focoAtrapado(page, "dialog[open]");
  await page.keyboard.press("Escape");
  await expect(reemplazo).toBeHidden();
  expect((await focoActual(page)).nombre).toMatch(/^Importar cuaderno/);
  await page.getByTestId("protocolo-importar").setInputFiles(archivo);
  await tabularHasta(page, /^Sí, reemplazar/);
  await activarConTeclado(page, "Enter");
  await expect(reemplazo).toBeHidden();
  await expect(page.getByText(/Cuaderno importado/)).toBeVisible();
  expect((await focoActual(page)).nombre).toMatch(/^Importar cuaderno/);

  // Al final, empezar otro cuaderno con el teclado: confirma el segundo sí y el foco queda en el botón.
  await tabularHasta(page, /^Empezar otro cuaderno/);
  await activarConTeclado(page, "Enter");
  await expect(nuevo).toBeVisible();
  await tabularHasta(page, /^Sí, empezar otro/);
  await activarConTeclado(page, "Enter");
  await expect(nuevo).toBeHidden();
  await expect(page.getByText("El cuaderno está vacío")).toBeVisible();
  expect((await focoActual(page)).nombre).toMatch(/^Empezar otro cuaderno/);
});
