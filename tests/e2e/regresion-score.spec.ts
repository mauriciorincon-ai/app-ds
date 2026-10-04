import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { axeBothThemes } from "./axe-temas";

// S6 — el modelo que estima sobrevive a la pestaña: entrenar con el ejemplo de
// consumo → exportar (.probeta.json con `task: "numerica"` y el objetivo en
// train) → RECARGAR → importar (resumen por tarea) → puntuar SIN re-entrenar →
// la columna `consumo_kwh_estimado` con los decimales del objetivo y sin
// probabilidad. Regla dura 2: ni el payload del modelo ni el CSV nuevo en la red.

const NEW_CSV = [
  "superficie_m2,ocupantes,anio_construccion,calefaccion,aislamiento,temp_media_c",
  "120,4,1995,gas,medio,12.5",
  "65,2,2010,bomba_calor,alto,15.1",
].join("\n");

test("estimar: exportar → recargar → importar → puntuar con «_estimado»", async ({
  page,
}) => {
  test.setTimeout(300_000);

  await page.goto("/");
  await page.getByRole("button", { name: /Consumo de energía/i }).click();
  await page.selectOption("#target", "consumo_kwh");
  await page.getByRole("button", { name: /Entrenar modelos/i }).click();
  await expect(
    page.getByRole("button", { name: /Exportar modelo/i }),
  ).toBeVisible({ timeout: 150_000 });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Exportar modelo/i }).click();
  const filePath = (await (await downloadPromise).path())!;
  const exported = JSON.parse(readFileSync(filePath, "utf8")) as {
    manifest: {
      task: string;
      schema: { task: string; target_stats: { decimals: number } };
    };
    payload: string;
  };
  expect(exported.manifest.task).toBe("numerica");
  expect(exported.manifest.schema.task).toBe("numerica");
  expect(exported.manifest.schema.target_stats.decimals).toBe(1);
  const payloadNeedle = exported.payload.slice(100, 140);

  await page.reload();
  await expect(page.getByText("Empieza tu experimento")).toBeVisible();
  const requests: string[] = [];
  page.on("request", (request) => {
    requests.push(`${request.url()} ${request.postData() ?? ""}`);
  });

  await page
    .locator('input[accept=".json,application/json"]')
    .setInputFiles(filePath);
  await expect(page.getByText(/Modelo válido/)).toBeVisible();
  await expect(
    page.getByText("Estima «consumo_kwh», una cantidad"),
  ).toBeVisible();
  await expect(page.getByText(/MAE en prueba: [\d.,]+\skWh/)).toBeVisible();
  // El resumen del import de un modelo que estima, en los dos temas (AU-S6-17).
  await axeBothThemes(page);

  await page.getByRole("button", { name: /Usar este modelo/i }).click();
  await expect(
    page.getByText("Modelo: consumo-energia.csv · estima: consumo_kwh"),
  ).toBeVisible();
  await expect(page.getByText(/Arrastra tu CSV nuevo/)).toBeVisible({
    timeout: 150_000,
  });

  await page.locator('input[accept=".csv,text/csv"]').setInputFiles({
    name: "casas-nuevas.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(NEW_CSV),
  });
  await expect(page.getByText("Estimaciones (2 filas)")).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("consumo_kwh_estimado")).toBeVisible();
  await expect(page.getByText(/Estimar no da una probabilidad/)).toBeVisible();

  const scoredPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Descargar CSV puntuado/i }).click();
  const scored = readFileSync((await (await scoredPromise).path())!, "utf8")
    .trim()
    .split("\n");
  expect(scored[0]).toBe(
    "superficie_m2,ocupantes,anio_construccion,calefaccion,aislamiento,temp_media_c,consumo_kwh_estimado",
  );
  // Un decimal, como el objetivo del entrenamiento.
  for (const line of scored.slice(1)) {
    expect(line.split(",").at(-1)).toMatch(/^-?\d+\.\d$/);
  }

  const traffic = requests.join("\n");
  expect(traffic).not.toContain(payloadNeedle);
  expect(traffic).not.toContain("65,2,2010");

  // Puntuar al estimar, en los dos temas (AU-S6-17).
  await axeBothThemes(page);
});
