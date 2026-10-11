import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { axeBothThemes } from "./axe-temas";

// S6 — estimar una cantidad de punta a punta en el navegador real (build de
// producción en CI): el ejemplo de consumo de energía → la tarjeta dice «en kWh» →
// la liga con «menor es mejor» → el veredicto en unidades → el gráfico estimado
// frente a real con su equivalente en texto → el texto estándar. P7: al estimar
// no hay botón de IA y NI UNA petición sale a /api/narrate. axe en ambos temas.

test("estimar: veredicto en unidades, gráfico y cero peticiones de narración", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const narrateRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/narrate"))
      narrateRequests.push(request.url());
  });

  await page.goto("/");
  await page.getByRole("button", { name: /Consumo de energía/i }).click();
  await page.selectOption("#target", "consumo_kwh");
  await expect(
    page.getByText(/Vas a estimar una cantidad, en kWh/),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Quién compite" }),
  ).toBeVisible();
  await axeBothThemes(page);
  await page.getByRole("button", { name: /Entrenar modelos/i }).click();

  await expect(
    page.getByRole("heading", { name: /La liga: \d+ modelos/ }),
  ).toBeVisible({ timeout: 150_000 });
  await expect(page.getByText(/En esta tabla, menor es mejor/)).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /supera al baseline|empata|NO supera/,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/En promedio se equivoca por ±[\d.,]+\skWh/).first(),
  ).toBeVisible();

  // El gráfico es una imagen con descripción, y lo dice también en texto.
  await expect(
    page.getByRole("img", {
      name: /Gráfico de dispersión de \d+ filas de prueba/,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/9 de cada 10 se equivocan por menos de/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ficha de Mediana" }),
  ).toBeVisible();

  // P7: texto estándar sí; IA no, dicho de frente.
  await expect(page.getByText("Texto estándar", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Narrar con IA/i }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/narración con IA solo cubre la clasificación/),
  ).toBeVisible();
  await axeBothThemes(page);

  // AU-S6-17: axe en los dos temas también con la liga mostrando la prueba y con
  // la ficha de un modelo compartido al estimar (el diálogo con su párrafo de
  // regresión; con el modal abierto, lo de atrás es inerte).
  await page.getByRole("button", { name: /Ver puntajes de prueba/i }).click();
  await axeBothThemes(page);
  await page.getByRole("button", { name: "Ficha de Ridge" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Al estimar, Ridge compite/)).toBeVisible();
  await axeBothThemes(page, "dialog");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect(narrateRequests).toHaveLength(0);
});

test("estimar con una fuga plantada: la nombra antes y después de entrenar", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.goto("/");
  await page
    .locator('input[type="file"][accept=".csv,text/csv"]')
    .setInputFiles({
      name: "precio-fuga-plantada.csv",
      mimeType: "text/csv",
      buffer: readFileSync(resolve("public/datasets/precio-fuga-plantada.csv")),
    });
  await page.selectOption("#target", "precio_usd");
  await expect(
    page.getByText(
      /«impuesto_transferencia_usd» predice el objetivo casi a la perfección/,
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: /Entrenar modelos/i }).click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Posible fuga de datos — sospechoso",
    }),
  ).toBeVisible({ timeout: 150_000 });
  await expect(
    page.getByText(/impuesto_transferencia_usd/).first(),
  ).toBeVisible();
  // El veredicto con fuga, en los dos temas (AU-S6-17).
  await axeBothThemes(page);
});
