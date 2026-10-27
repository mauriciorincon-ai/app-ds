import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { axeBothThemes } from "./axe-temas";

// S20 (ADR 028) — pronosticar una serie de punta a punta en el navegador real (build de producción en CI): la opción del selector →
// el panel propone el periodo → la liga con origen móvil en Pyodide → el veredicto con símbolo y palabra, la tabla de la liga, el
// gráfico y su tabla accesible → el CSV que se descarga. La serie estacional del kit «supera»; la de ruido blanco dice que no hay
// estructura. Los huecos se preguntan. Cero peticiones a /api/narrate (el pronóstico es código determinista, regla 14).
// axe en ambos temas con el resultado en pantalla.

const kit = (name: string) => resolve(process.cwd(), "docs/kit-de-prueba", name);

async function abrir(page: Page, archivo: string) {
  await page.goto("/");
  await page.locator('input[accept^=".csv,text/csv"]').setInputFiles(kit(archivo));
  await page.selectOption("#target", "__pronosticar__");
  await expect(page.getByTestId("pronostico-panel")).toBeVisible();
}

test("serie con tendencia y temporada: supera al mejor método simple, con gráfico, tabla y CSV", async ({ page }) => {
  test.setTimeout(240_000);
  const narrate: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/narrate")) narrate.push(r.url());
  });
  await abrir(page, "serie-ventas-mensual.csv");
  await expect(page.getByTestId("pronostico-serie")).toContainText("60 periodos, de 2021-01 a 2025-12");
  await expect(page.getByRole("button", { name: "Entrenar modelos" })).toHaveCount(0);

  await page.getByRole("button", { name: "Pronosticar" }).click();
  await expect(page.getByTestId("pronostico-lectura")).toBeVisible({ timeout: 180_000 });
  const veredicto = page.getByTestId("pronostico-veredicto");
  await expect(veredicto).toContainText("Supera al mejor método simple");
  await expect(veredicto).toContainText("✓");
  await expect(veredicto).toContainText("ingenuo estacional");
  const liga = page.getByTestId("pronostico-liga");
  await expect(liga.locator("tbody tr")).toHaveCount(6);
  await expect(liga).toContainText("★");
  await expect(liga).toContainText("◆");
  await expect(page.getByRole("img", { name: /Gráfico de la serie y su pronóstico/ })).toBeVisible();

  // la tabla del pronóstico es el equivalente accesible del gráfico
  await page.getByText("Ver el pronóstico en una tabla").click();
  await expect(page.getByRole("columnheader", { name: "Banda del 80 %" })).toBeVisible();
  await axeBothThemes(page);
  // en un móvil el gráfico y las tablas no desbordan la página (lección del S19: R10)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);

  const descarga = page.waitForEvent("download");
  await page.getByTestId("pronostico-descargar").click();
  const archivo = await descarga;
  expect(archivo.suggestedFilename()).toBe("pronostico-serie-ventas-mensual.csv");
  const lineas = readFileSync((await archivo.path())!, "utf8").trim().split("\n");
  expect(lineas[0]).toBe("periodo,tipo,valor,inferior_80,superior_80,inferior_95,superior_95,completado");
  expect(lineas).toHaveLength(1 + 60 + 12);
  expect(narrate).toEqual([]);
});

test("ruido blanco: ningún método le gana a la media y la pantalla lo dice", async ({ page }) => {
  test.setTimeout(240_000);
  await abrir(page, "serie-ruido.csv");
  await page.getByRole("button", { name: "Pronosticar" }).click();
  await expect(page.getByTestId("pronostico-lectura")).toBeVisible({ timeout: 180_000 });
  const veredicto = page.getByTestId("pronostico-veredicto");
  await expect(veredicto).toContainText("No supera a un método simple");
  await expect(veredicto).toContainText("⚠");
  await expect(veredicto).toContainText("Ningún método le gana a la media histórica");
});

test("una serie con meses sin dato pregunta qué hacer antes de pronosticar", async ({ page }) => {
  test.setTimeout(240_000);
  await abrir(page, "serie-ventas-con-huecos.csv");
  const huecos = page.getByTestId("pronostico-huecos");
  await expect(huecos).toContainText("Faltan 3 periodos: 2022-06, 2022-07, 2024-05");
  const boton = page.getByRole("button", { name: "Pronosticar" });
  await expect(boton).toBeDisabled();
  await page.getByRole("checkbox").check();
  await expect(boton).toBeEnabled();
  await boton.click();
  await expect(page.getByTestId("pronostico-lectura")).toBeVisible({ timeout: 180_000 });
  await expect(page.getByText(/Un punto hueco marca un periodo que se completó/)).toBeVisible();
  await axeBothThemes(page);
});
