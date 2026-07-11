import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// S3 — Outcome 2: el modelo sobrevive a la pestaña. Entrenar → exportar
// (.probeta.json con manifiesto) → RECARGAR la página (sesión nueva) →
// importar el archivo → resumen honesto → puntuar SIN re-entrenar. Garantía
// de privacidad (patrón S2): ninguna petición lleva el payload del modelo ni
// valores del CSV nuevo.

const NEW_CSV = [
  "edad,ingreso_mensual,visitas_web,correos_abiertos,region,dispositivo",
  "34,5000,10,5,sur,movil",
  "52,3800,4,1,oeste,escritorio",
].join("\n");

test("exportar → recargar → importar → puntuar sin re-entrenar, sin payload en la red", async ({
  page,
}) => {
  test.setTimeout(300_000);

  await page.goto("/");
  await page.getByRole("button", { name: /Campaña de marketing/i }).click();
  await page.selectOption("#target", "convirtio");
  await page.getByRole("button", { name: /Entrenar modelo/i }).click();
  await expect(
    page.getByRole("button", { name: /Exportar modelo/i }),
  ).toBeVisible({ timeout: 150_000 });

  // Export: archivo único con manifiesto legible.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Exportar modelo/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^modelo-marketing-campania-\d{4}-\d{2}-\d{2}\.probeta\.json$/,
  );
  const filePath = (await download.path())!;
  const exported = JSON.parse(readFileSync(filePath, "utf8")) as {
    format_version: number;
    manifest: { dataset: { name: string }; payload_sha256: string };
    payload: string;
  };
  expect(exported.format_version).toBe(1);
  expect(exported.manifest.dataset.name).toBe("marketing-campania.csv");
  expect(exported.manifest.payload_sha256).toMatch(/^[0-9a-f]{64}$/);
  // Fragmento del payload para vigilar que JAMÁS viaje por la red.
  const payloadNeedle = exported.payload.slice(100, 140);

  // Sesión nueva: la pestaña se recarga y el estado en memoria muere.
  await page.reload();
  await expect(page.getByText("Empieza tu experimento")).toBeVisible();

  // Desde aquí, vigilancia de red: ni payload ni valores del CSV nuevo.
  const requests: string[] = [];
  page.on("request", (request) => {
    requests.push(`${request.url()} ${request.postData() ?? ""}`);
  });

  // Import: validación + resumen honesto del manifiesto ANTES de continuar.
  await page
    .locator('input[accept=".json,application/json"]')
    .setInputFiles(filePath);
  await expect(page.getByText(/Modelo válido/)).toBeVisible();
  await expect(page.getByText(/marketing-campania\.csv/)).toBeVisible();
  await expect(page.getByText(/Predice «convirtio»/)).toBeVisible();

  // Continuar ⇒ pantalla de scoring; el worker restaura el modelo (Pyodide
  // se carga bajo demanda — segunda carga de la prueba).
  await page.getByRole("button", { name: /Usar este modelo/i }).click();
  await expect(
    page.getByRole("heading", { name: "Usar el modelo" }),
  ).toBeVisible();
  await expect(page.getByText(/Arrastra tu CSV nuevo/)).toBeVisible({
    timeout: 150_000,
  });

  // Puntuar SIN re-entrenar (jamás pasamos por "Entrenar modelo" tras recargar).
  await page.locator('input[accept=".csv,text/csv"]').setInputFiles({
    name: "clientes.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(NEW_CSV),
  });
  await expect(
    page.getByRole("button", { name: /Descargar CSV puntuado/i }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Predicciones \(2 filas\)/)).toBeVisible();

  // GARANTÍA (regla dura 2): ni el payload del modelo ni el CSV en la red.
  const traffic = requests.join("\n");
  expect(payloadNeedle.length).toBeGreaterThan(20);
  expect(traffic).not.toContain(payloadNeedle);
  expect(traffic).not.toContain("52,3800");
  expect(traffic).not.toContain('"payload"');

  // A11y de la pantalla de scoring alcanzada vía import.
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
});
