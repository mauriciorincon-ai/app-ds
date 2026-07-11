import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Happy path del S2: entrenar → "¿Por qué predice así?" (gráfico + plantilla)
// → opt-in → narración VERIFICADA (route real con proveedor mock) → descargar
// la model card. Además, la garantía de privacidad sobre la request REAL:
// ninguna petición contiene valores de filas del dataset.
test("del porqué a la model card, con narración verificada y sin filas en la red", async ({
  page,
}) => {
  test.setTimeout(180_000);

  // Captura de TODAS las requests al route de narración.
  const narrateBodies: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/narrate")) {
      narrateBodies.push(request.postData() ?? "");
    }
  });

  await page.goto("/");
  await page.getByRole("button", { name: /Campaña de marketing/i }).click();
  await page.selectOption("#target", "convirtio");
  await page.getByRole("button", { name: /Entrenar modelo/i }).click();

  await expect(
    page.getByRole("button", { name: /Nuevo experimento/i }),
  ).toBeVisible({ timeout: 150_000 });

  // El porqué: gráfico visible con dirección símbolo+texto; sin consentimiento
  // aún ⇒ plantilla ("Texto estándar") y CERO llamadas a /api/narrate.
  await expect(page.getByText("¿Por qué predice así?")).toBeVisible();
  await expect(
    page
      .getByText(/a mayor valor|varía por categoría|sin dirección clara/)
      .first(),
  ).toBeVisible();
  // exact: la nota del consentimiento también contiene "texto estándar" (minúsculas).
  await expect(page.getByText("Texto estándar", { exact: true })).toBeVisible();
  expect(narrateBodies).toHaveLength(0);

  // Opt-in ⇒ el route real (mock) responde y aparece el badge de verificación.
  await page.getByRole("checkbox").check();
  await expect(page.getByText(/verificada con los números/)).toBeVisible({
    timeout: 15_000,
  });

  // GARANTÍA (ADR-006): la request real NO contiene filas ni valores de celdas.
  expect(narrateBodies.length).toBeGreaterThan(0);
  for (const body of narrateBodies) {
    expect(body).not.toContain('"rows":[');
    // Valores de celdas del CSV de marketing (1ª fila: 6089; categóricos).
    expect(body).not.toContain("6089");
    expect(body).not.toContain("escritorio");
    // Los NOMBRES de columnas sí viajan (es lo consentido).
    expect(body).toContain("convirtio");
  }

  // Model card: descarga real y contenido completo en el idioma activo.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Descargar model card/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^model-card-.+\.md$/);
  const content = readFileSync((await download.path())!, "utf8");
  expect(content).toContain("# Model card");
  expect(content).toContain("«convirtio»");
  expect(content).toContain("anti-fuga por construcción");
  expect(content).toContain("importancia por permutación");

  // A11y de la pantalla completa (incluye las secciones nuevas).
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
