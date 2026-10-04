import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// S5 (R10) — un booster elegido a mano sobrevive a la pestaña: elegir LightGBM →
// exportar (manifiesto con «elegido por ti» y la versión de LightGBM) → recargar →
// importar → puntuar SIN re-entrenar. El pickle de un booster exige su paquete
// cargado al importar: el runner los carga siempre.

const NEW_CSV = [
  "edad,antiguedad_anios,horas_mensuales,satisfaccion,departamento,horas_extra",
  "29,1.5,210,0.21,soporte,si",
  "45,12.0,150,0.83,ingenieria,no",
].join("\n");

test("elegir LightGBM → exportar → recargar → importar → puntuar", async ({
  page,
}) => {
  test.setTimeout(300_000);

  await page.goto("/");
  await page.getByRole("button", { name: /Rotación de empleados/i }).click();
  await page.selectOption("#target", "renuncio");
  await page.getByRole("button", { name: /Entrenar modelos/i }).click();
  await expect(
    page.getByRole("heading", { name: /La liga: \d+ modelos/ }),
  ).toBeVisible({ timeout: 150_000 });

  const choose = page.getByRole("button", {
    name: "Elegir LightGBM",
    exact: true,
  });
  // Si LightGBM ganó la liga, ya está en uso: el archivo igual lo lleva.
  const chosenByUser = (await choose.count()) > 0;
  if (chosenByUser) {
    await choose.click();
    await expect(
      page.getByRole("button", { name: "Volver al ganador" }),
    ).toBeVisible({ timeout: 60_000 });
  }

  const exportButton = page.getByRole("button", { name: /Exportar modelo/i });
  await expect(exportButton).toBeEnabled();
  const downloadPromise = page.waitForEvent("download");
  await exportButton.click();
  const filePath = (await (await downloadPromise).path())!;
  const exported = JSON.parse(readFileSync(filePath, "utf8")) as {
    manifest: {
      model_name: string;
      selection?: { by: string; cv_winner: string };
      versions: { lightgbm?: string; xgboost?: string };
    };
  };
  expect(exported.manifest.model_name).toBe("lightgbm");
  expect(exported.manifest.selection?.by).toBe(chosenByUser ? "user" : "cv");
  expect(exported.manifest.versions.lightgbm).toBe("4.6.0");

  // Sesión nueva: nada en memoria; el worker nuevo restaura el booster.
  await page.reload();
  await page
    .locator('input[accept=".json,application/json"]')
    .setInputFiles(filePath);
  await expect(page.getByText(/Modelo válido/)).toBeVisible();
  // La etiqueta cruza el archivo: el resumen del import dice cómo se eligió (AU-S5-06).
  await expect(
    page.getByText(
      chosenByUser
        ? /◆ Elegido por ti, no por la validación cruzada/
        : /Elegido por validación cruzada de \d+ pliegues/,
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: /Usar este modelo/i }).click();
  await expect(page.getByText(/Arrastra tu CSV nuevo/)).toBeVisible({
    timeout: 150_000,
  });

  await page.locator('input[accept=".csv,text/csv"]').setInputFiles({
    name: "empleados-nuevos.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(NEW_CSV),
  });
  await expect(
    page.getByRole("button", { name: /Descargar CSV puntuado/i }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Predicciones \(2 filas\)/)).toBeVisible();
});
