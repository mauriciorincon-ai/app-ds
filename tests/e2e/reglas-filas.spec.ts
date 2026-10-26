import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { axeBothThemes } from "./axe-temas";

// S20 (ADR 027, adenda) — las reglas de un modelo IMPORTADO, que no conserva las filas de su entrenamiento: con las filas del archivo
// que se carga en «Usar el modelo» el árbol se arma (y su SQL se descarga). Si el archivo trae el resultado real, también se mide contra
// la verdad; si no, la pantalla lo dice. Entrenar → exportar → recargar → importar → puntuar un archivo → «Ver el modelo en reglas».

const kit = (name: string) => resolve(process.cwd(), "docs/kit-de-prueba", name);

test("un modelo importado arma sus reglas con las filas del archivo cargado; con el resultado real, también se mide contra la verdad", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.getByRole("button", { name: /Campaña de marketing/i }).click();
  await page.selectOption("#target", "convirtio");
  await page.getByRole("button", { name: /Entrenar modelo/i }).click();
  await expect(page.getByRole("button", { name: /Exportar modelo/i })).toBeVisible({ timeout: 150_000 });
  const exportado = page.waitForEvent("download");
  await page.getByRole("button", { name: /Exportar modelo/i }).click();
  const archivo = (await (await exportado).path())!;

  await page.reload();
  await page.locator('input[accept=".json,application/json"]').setInputFiles(archivo);
  await page.getByRole("button", { name: /Usar este modelo/i }).click();
  await expect(page.getByText(/Arrastra tu CSV nuevo/)).toBeVisible({ timeout: 150_000 });

  // filas sin el resultado real: el árbol se arma con ellas y la pantalla dice que no hay verdad contra la cual medirlo
  await page.locator('input[accept^=".csv,text/csv"]').setInputFiles(kit("marketing-filas-para-reglas.csv"));
  await expect(page.getByRole("button", { name: /Descargar CSV puntuado/i })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Ver el modelo en reglas" }).click();
  await expect(page.getByTestId("reglas-lectura")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("reglas-lectura")).toContainText("filas de tu archivo");
  await expect(page.getByTestId("reglas-sin-verdad")).toBeVisible();
  await expect(page.getByTestId("reglas-fidelidad")).toContainText("de 75 filas que el árbol no vio");
  await axeBothThemes(page);
  const sql = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar el SQL (.sql)" }).click();
  expect((await sql).suggestedFilename()).toMatch(/\.sql$/);

  // otro archivo, esta vez con el resultado real: también se mide contra la verdad
  await page.getByRole("button", { name: /Puntuar otro CSV/i }).click();
  await page.locator('input[accept^=".csv,text/csv"]').setInputFiles(kit("marketing-resultados-sin-cambio.csv"));
  await expect(page.getByRole("button", { name: /Descargar CSV puntuado/i })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Ver el modelo en reglas" }).click();
  await expect(page.getByTestId("reglas-lectura")).toContainText("Frente a la verdad, las reglas aciertan", { timeout: 60_000 });
  await expect(page.getByTestId("reglas-sin-verdad")).toHaveCount(0);
});
