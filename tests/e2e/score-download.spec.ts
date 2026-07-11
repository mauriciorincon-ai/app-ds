import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// S3 — Outcome 1: entrenar → "Usar el modelo" → CSV nuevo (con novedad
// plantada) → panel de novedad con conteos por columna → descarga del CSV
// puntuado con contenido REAL. Garantía de privacidad (patrón S2): ninguna
// petición de red lleva valores del CSV nuevo. Columnas verificadas contra
// public/datasets/marketing-campania.csv (lección D1).

// 4 filas: dispositivo «holograma» ×2 (categoría nunca vista) y edad 999 ×1
// (fuera del rango de train) ⇒ 3 filas afectadas de 4 (75%).
const NEW_CSV = [
  "edad,ingreso_mensual,visitas_web,correos_abiertos,region,dispositivo",
  "34,5000,10,5,sur,holograma",
  "41,6000,3,2,sur,holograma",
  "999,4500,7,4,oeste,movil",
  "29,5200,15,9,sur,movil",
].join("\n");

const MISSING_COLUMN_CSV = [
  "edad,ingreso_mensual,visitas_web,correos_abiertos,region",
  "34,5000,10,5,sur",
].join("\n");

test("entrenar → puntuar con novedad plantada → descargar, sin datos en la red", async ({
  page,
}) => {
  test.setTimeout(300_000);

  // TODAS las peticiones: ni URL ni body pueden llevar valores del CSV nuevo.
  const requests: string[] = [];
  page.on("request", (request) => {
    requests.push(`${request.url()} ${request.postData() ?? ""}`);
  });

  await page.goto("/");
  await page.getByRole("button", { name: /Campaña de marketing/i }).click();
  await page.selectOption("#target", "convirtio");
  await page.getByRole("button", { name: /Entrenar modelo/i }).click();
  await expect(
    page.getByRole("button", { name: /Usar el modelo/i }),
  ).toBeVisible({ timeout: 150_000 });

  await page.getByRole("button", { name: /Usar el modelo/i }).click();
  await expect(
    page.getByRole("heading", { name: "Usar el modelo" }),
  ).toBeVisible();

  // Caso bloqueo: falta «dispositivo» ⇒ se nombra EXACTAMENTE y no se puntúa.
  const csvInput = page.locator('input[accept=".csv,text/csv"]');
  await csvInput.setInputFiles({
    name: "incompleto.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(MISSING_COLUMN_CSV),
  });
  // filter: el route announcer de Next también expone role="alert".
  const blockAlert = page
    .getByRole("alert")
    .filter({ hasText: /No se puede puntuar/ });
  await expect(blockAlert).toBeVisible();
  await expect(blockAlert).toContainText("incompleto.csv");
  await expect(blockAlert).toContainText("dispositivo");
  await page.getByRole("button", { name: /Probar con otro archivo/i }).click();

  // CSV válido con novedad plantada.
  await csvInput.setInputFiles({
    name: "clientes-nuevos.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(NEW_CSV),
  });

  // Panel de novedad ANTES de descargar: conteos exactos por columna.
  await expect(
    page.getByText("El modelo está viendo cosas nuevas"),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByText(/«dispositivo»: 2 valores con categorías nunca vistas/),
  ).toBeVisible();
  await expect(
    page.getByText(/«edad»: 1 valores fuera del rango/),
  ).toBeVisible();
  await expect(
    page.getByText(/adivinando en 3 de 4 filas \(75%\)/),
  ).toBeVisible();

  // Vista previa con las columnas nuevas resueltas.
  await expect(page.getByText("prediccion", { exact: true })).toBeVisible();
  await expect(page.getByText(/probabilidad_/).first()).toBeVisible();

  // Descarga real: el CSV puntuado está completo (4 filas + predicciones).
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Descargar CSV puntuado/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("clientes-nuevos-puntuado.csv");
  const content = readFileSync((await download.path())!, "utf8");
  const lines = content.trim().split("\n");
  expect(lines).toHaveLength(5); // cabecera + 4 filas
  // La clase positiva es la MINORITARIA: en marketing-campania es «0»
  // (85 vs 115 — verificado contra el CSV real, lección D1).
  expect(lines[0]).toBe(
    "edad,ingreso_mensual,visitas_web,correos_abiertos,region,dispositivo,prediccion,probabilidad_0",
  );
  for (const line of lines.slice(1)) {
    const fields = line.split(",");
    expect(fields).toHaveLength(8);
    // Etiqueta original de la clase (las del dataset: 0/1) + probabilidad [0,1].
    expect(["0", "1"]).toContain(fields[6]);
    const probability = Number(fields[7]);
    expect(probability).toBeGreaterThanOrEqual(0);
    expect(probability).toBeLessThanOrEqual(1);
  }

  // GARANTÍA (regla dura 2): ninguna petición llevó valores del CSV nuevo.
  const traffic = requests.join("\n");
  expect(traffic).not.toContain("holograma");
  expect(traffic).not.toContain("999,4500");
  expect(traffic).not.toContain("clientes-nuevos");

  // A11y de la pantalla completa de scoring con resultados.
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
});
