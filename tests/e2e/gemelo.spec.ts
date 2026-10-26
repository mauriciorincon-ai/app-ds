import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { axeBothThemes } from "./axe-temas";

// S20 (ADR 029) — el gemelo sintético de punta a punta en el navegador real: junto a la exploración, lo marcado como dato personal NO
// viaja y se nombra; el gemelo del ejemplo de marketing sale «se puede compartir» con su informe (columnas, relaciones, cercanía y cero
// copias), se descarga como CSV con la misma forma, y ninguna petición lleva filas (regla dura 2). axe en ambos temas con el informe a la vista.

const kit = (name: string) => resolve(process.cwd(), "docs/kit-de-prueba", name);

async function cargar(page: Page, archivo: string) {
  await page.goto("/");
  await page.locator('input[accept^=".csv,text/csv"]').setInputFiles(kit(archivo));
  await expect(page.getByTestId("gemelo-panel")).toBeVisible();
  // el aviso de datos personales se arma al cargar: hasta entonces no se puede generar
  await expect(page.getByTestId("gemelo-revisando")).toHaveCount(0, { timeout: 30_000 });
}

test("el gemelo del ejemplo de marketing: se puede compartir, con su informe y su CSV", async ({ page }) => {
  test.setTimeout(240_000);
  const peticiones: string[] = [];
  page.on("request", (r) => peticiones.push(`${r.url()} ${r.postData() ?? ""}`));
  await cargar(page, "marketing-campania.csv");
  await expect(page.getByTestId("gemelo-plan")).toContainText("Viajan 7 columnas");
  await page.getByRole("button", { name: "Generar el gemelo" }).click();
  await expect(page.getByTestId("gemelo-lectura")).toBeVisible({ timeout: 180_000 });
  const veredicto = page.getByTestId("gemelo-veredicto");
  await expect(veredicto).toContainText("Se puede compartir");
  await expect(veredicto).toContainText("✓");
  await expect(page.getByTestId("gemelo-columnas")).toContainText("✓ bien");
  await expect(page.getByTestId("gemelo-relaciones")).toContainText("✓ bien");
  await expect(page.getByTestId("gemelo-cercania")).toContainText("✓ bien");
  await expect(page.getByTestId("gemelo-copias")).toContainText("Ninguna fila sintética es idéntica a una tuya");
  await axeBothThemes(page);
  // en un móvil el informe no desborda la página (lección del S19: R10)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const descarga = page.waitForEvent("download");
  await page.getByTestId("gemelo-descargar").click();
  const archivo = await descarga;
  expect(archivo.suggestedFilename()).toBe("gemelo-marketing-campania.csv");
  const real = readFileSync(kit("marketing-campania.csv"), "utf8").trim().split("\n");
  const lineas = readFileSync((await archivo.path())!, "utf8").trim().split("\n");
  expect(lineas).toHaveLength(real.length);
  expect(lineas[0]!.split(",")).toHaveLength(real[0]!.split(",").length);
  // ninguna fila del gemelo es una fila de los datos
  const reales = new Set(real.slice(1));
  expect(lineas.slice(1).filter((l) => reales.has(l))).toEqual([]);
  // ni el archivo ni sus filas salieron del navegador
  expect(peticiones.join("\n")).not.toMatch(/,movil,|,escritorio,/);
});

test("lo marcado como dato personal no viaja al gemelo y se nombra", async ({ page }) => {
  test.setTimeout(240_000);
  await cargar(page, "clientes-con-datos-personales.csv");
  const fuera = page.getByTestId("gemelo-fuera");
  await expect(fuera).toBeVisible();
  await expect(fuera).toContainText("marcada como posible dato personal");
  const viajan = (await page.getByTestId("gemelo-plan").innerText()).split("\n")[0]!;
  expect(viajan).not.toMatch(/correo|telefono|nombre/i);
  await page.getByRole("button", { name: "Generar el gemelo" }).click();
  await expect(page.getByTestId("gemelo-lectura")).toBeVisible({ timeout: 180_000 });
});
