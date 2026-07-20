import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// S4 — "sobrevive datos reales": cargar el CSV sucio del kit → informe de
// saneamiento con conteos → alerta de desbalance al elegir objetivo → entrenar →
// veredicto con candidatos → exportar (format_version 1 + saneamiento en el
// manifiesto). Garantía de privacidad (regla dura 2): ninguna petición de red
// lleva valores de celda del dataset (ids "C-00…", categoría "fax").
test("cargar sucio → informe → alerta → entrenar → veredicto → exportar, sin datos en la red", async ({
  page,
}) => {
  test.setTimeout(240_000);

  // TODAS las peticiones: ni URL ni body pueden llevar valores de celda.
  const requests: string[] = [];
  page.on("request", (request) => {
    requests.push(`${request.url()} ${request.postData() ?? ""}`);
  });

  await page.goto("/");
  await page
    .getByRole("button", { name: /Clientes \(datos sucios\)/i })
    .click();

  // Informe de saneamiento con conteos exactos (verificados contra el CSV real).
  await expect(
    page.getByText(/Saneamos el dataset antes de entrenar/i),
  ).toBeVisible();
  await expect(page.getByText(/10 filas duplicadas/)).toBeVisible();
  // id_cliente excluido (identificador) + pais excluido (constante).
  await expect(page.getByText(/Excluimos «id_cliente»/)).toBeVisible();
  await expect(page.getByText(/Excluimos «pais»/)).toBeVisible();
  // edad coaccionada: celdas "error" a vacío.
  await expect(page.getByText(/En «edad»/)).toBeVisible();

  // Al elegir el objetivo, la EDA avisa del desbalance (role=status).
  await page.selectOption("#target", "contrato");
  await expect(page.getByText(/desbalanceado/i)).toBeVisible();

  // Entrenar → veredicto con candidatos.
  await page.getByRole("button", { name: /Entrenar modelo/i }).click();
  await expect(
    page.getByRole("button", { name: /Nuevo experimento/i }),
  ).toBeVisible({ timeout: 180_000 });
  await expect(page.getByText(/Modelos que compitieron/i)).toBeVisible();
  await expect(page.getByText("elegido")).toBeVisible();

  // Exportar el modelo: archivo .probeta.json con format_version 1 y el
  // saneamiento registrado en el manifiesto (campo aditivo opcional).
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Exportar modelo/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.probeta\.json$/);
  const file = JSON.parse(readFileSync((await download.path())!, "utf8"));
  expect(file.format_version).toBe(1);
  expect(file.manifest.model_name).toMatch(/^(forest|hgb)$/);
  expect(file.manifest.sanitation.duplicateRowsRemoved).toBe(10);
  expect(
    file.manifest.sanitation.exclusions.map(
      (e: { column: string }) => e.column,
    ),
  ).toEqual(expect.arrayContaining(["id_cliente", "pais"]));

  // GARANTÍA (regla dura 2): ninguna petición llevó valores de celda del dataset.
  const traffic = requests.join("\n");
  expect(traffic).not.toContain("C-00"); // prefijo de los id_cliente
  expect(traffic).not.toContain('"fax"'); // categoría rara (valor de celda)

  // A11y de la pantalla de resultados con los bloques nuevos.
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
});
