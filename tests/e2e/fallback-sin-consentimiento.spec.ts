import { expect, test } from "@playwright/test";

// Fallback honesto: SIN consentimiento la sección "¿Por qué?" muestra SIEMPRE
// la plantilla determinista local — y no sale NI UNA petición a /api/narrate
// (la privacidad no depende del servidor: el cliente ni siquiera llama).
test("sin consentimiento: plantilla local y cero peticiones de narración", async ({
  page,
}) => {
  test.setTimeout(180_000);

  const narrateRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/narrate")) {
      narrateRequests.push(request.url());
    }
  });

  await page.goto("/");
  await page.getByRole("button", { name: /Rotación de empleados/i }).click();
  await page.selectOption("#target", "renuncio");
  await page.getByRole("button", { name: /Entrenar modelo/i }).click();

  await expect(
    page.getByRole("button", { name: /Nuevo experimento/i }),
  ).toBeVisible({ timeout: 150_000 });

  // Nunca sección vacía: plantilla visible, con la etiqueta que la distingue.
  await expect(page.getByText("¿Por qué predice así?")).toBeVisible();
  // exact: la nota del consentimiento también contiene "texto estándar" (minúsculas).
  await expect(page.getByText("Texto estándar", { exact: true })).toBeVisible();
  const template = page.locator("[aria-live='polite'] p");
  await expect(template).not.toBeEmpty();

  // El consentimiento está OFF por defecto ⇒ cero red hacia la narración.
  expect(narrateRequests).toHaveLength(0);
});
