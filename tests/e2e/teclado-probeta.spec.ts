import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { axeBothThemes } from "./axe-temas";
import { sinDesborde } from "./protocolo-pasos";
import {
  activarConTeclado,
  focoActual,
  focoAtrapado,
  recorrerConTeclado,
  tabularHasta,
} from "./teclado";

// S16 — Probeta por teclado, de punta a punta. El Protocolo ya se recorre en teclado-protocolo.spec.ts; Probeta no tenía
// un solo Tab ni una sola medida a 360 px. Aquí: portada → ejemplo → configurar (el objetivo se elige escribiendo en el
// selector) → entrenando → resultados → ficha de un modelo (trampa de foco, Escape, foco al cerrar) → exportar → recargar
// → importar → usar el modelo → puntuar un CSV nuevo → descargarlo → y el error con su «Volver a empezar». En cada pantalla:
// paradas visibles, con nombre y con foco, en el orden del documento, sin trampa; axe en los dos temas y sin desborde a
// 360 px. Solo en escritorio: Tab no aplica al teléfono (el desborde a 360 px se mide igual con el viewport estrecho).

test.skip(({ isMobile }) => isMobile, "Tab no aplica al teléfono");
test.setTimeout(480_000);

const NUEVO = [
  "edad,ingreso_mensual,visitas_web,correos_abiertos,region,dispositivo",
  "34,5000,10,5,sur,movil",
  "52,3800,4,1,oeste,escritorio",
].join("\n");

/** Mide el desborde a 360 px y devuelve la página a su ancho de escritorio. */
async function a360(page: Page) {
  const antes = page.viewportSize()!;
  await sinDesborde(page, 360);
  await page.setViewportSize(antes);
}

test("Probeta se usa sin ratón: del ejemplo al archivo puntuado, y el error", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /Elegir archivo/i }).first(),
  ).toBeVisible();
  await recorrerConTeclado(page, "main", { minimo: 8 });
  await a360(page);

  // El ejemplo se elige con el teclado.
  await tabularHasta(page, /^Campaña de marketing/);
  await activarConTeclado(page);
  await expect(page.getByText(/nada que sanear/i)).toBeVisible();

  // Configurar: el objetivo se elige escribiendo en el selector y se entrena con Enter.
  await tabularHasta(page, "#target");
  await page.keyboard.type("conv");
  await expect(page.locator("#target")).toHaveValue("convirtio");
  await recorrerConTeclado(page, "main", { minimo: 4 });
  await a360(page);
  await axeBothThemes(page);
  await tabularHasta(page, /^Entrenar modelo/);
  await activarConTeclado(page);

  // Entrenando: la pantalla de espera se alcanza, se lee y pasa axe.
  await expect(
    page.getByRole("heading", { level: 1, name: "Entrenando…" }),
  ).toBeVisible();
  await recorrerConTeclado(page, "main", { minimo: 0 });
  await a360(page);
  await axeBothThemes(page);

  // Resultados.
  await expect(
    page.getByRole("button", { name: /Exportar modelo/i }),
  ).toBeVisible({ timeout: 180_000 });
  await recorrerConTeclado(page, "main", { minimo: 8 });
  await a360(page);
  await axeBothThemes(page);

  // La ficha de un modelo: se abre con Enter, atrapa el foco, Escape la cierra y el foco vuelve al botón.
  await tabularHasta(page, /^Ficha de /);
  const botonFicha = (await focoActual(page)).nombre;
  await activarConTeclado(page);
  await expect(page.getByRole("dialog")).toBeVisible();
  await focoAtrapado(page, "dialog[open]");
  await axeBothThemes(page, "dialog");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  expect((await focoActual(page)).nombre).toBe(botonFicha);

  // Exportar con el teclado.
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    (async () => {
      await tabularHasta(page, /^Exportar modelo/);
      await activarConTeclado(page);
    })(),
  ]);
  const archivo = (await descarga.path())!;
  expect(JSON.parse(readFileSync(archivo, "utf8")).format_version).toBe(1);

  // S17 — «Estrésalo» sigue a «Exportar» en el documento: se alcanza con Tab, se activa con Enter, la lectura (tablas con
  // símbolo y palabra) llega y la pantalla sigue sin trampa, sin desborde a 360 px y con axe en los dos temas.
  await tabularHasta(page, /^Estrésalo/);
  await activarConTeclado(page);
  await expect(page.getByTestId("estres-lectura")).toBeVisible({
    timeout: 240_000,
  });
  await recorrerConTeclado(page, "main", { minimo: 8 });
  await a360(page);
  await axeBothThemes(page);

  // Sesión nueva: importar el modelo, ver el resumen y usarlo.
  await page.reload();
  await expect(page.getByText("Empieza tu experimento")).toBeVisible();
  await page
    .locator('input[accept=".json,application/json"]')
    .setInputFiles(archivo);
  await expect(page.getByText(/Modelo válido/)).toBeVisible();
  await recorrerConTeclado(page, "main", { minimo: 8 });
  await a360(page);
  await axeBothThemes(page);
  await tabularHasta(page, /^Usar este modelo/);
  await activarConTeclado(page);
  await expect(
    page.getByRole("heading", { name: "Usar el modelo" }),
  ).toBeVisible();
  await expect(page.getByText(/Arrastra tu CSV nuevo/)).toBeVisible({
    timeout: 180_000,
  });
  await recorrerConTeclado(page, "main", { minimo: 2 });
  await a360(page);

  // Puntuar un CSV nuevo y descargarlo con el teclado.
  await page.locator('input[accept^=".csv,text/csv"]').setInputFiles({
    name: "clientes.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(NUEVO),
  });
  await expect(
    page.getByRole("button", { name: /Descargar CSV puntuado/i }),
  ).toBeVisible({ timeout: 60_000 });
  await recorrerConTeclado(page, "main", { minimo: 3 });
  await a360(page);
  const [csv] = await Promise.all([
    page.waitForEvent("download"),
    (async () => {
      await tabularHasta(page, /^Descargar CSV puntuado/);
      await activarConTeclado(page);
    })(),
  ]);
  expect(csv.suggestedFilename()).toMatch(/\.csv$/);
});

test("un archivo vacío lleva a la pantalla de error, que se recorre, pasa axe y se sale con el teclado", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /Elegir archivo/i }).first(),
  ).toBeVisible();
  await page.locator('input[accept^=".csv,text/csv"]').setInputFiles({
    name: "vacio.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("a,b\n"),
  });
  await expect(
    page.getByRole("heading", { level: 1, name: "Algo no cuadra" }),
  ).toBeVisible();
  await recorrerConTeclado(page, "main", { minimo: 1 });
  await a360(page);
  await axeBothThemes(page);
  await tabularHasta(page, /^Volver a empezar/);
  await activarConTeclado(page);
  await expect(page.getByText("Empieza tu experimento")).toBeVisible();
});
