import { expect, test } from "@playwright/test";

// Fallback honesto: SIN pedir la narración, la sección "¿Por qué?" muestra
// SIEMPRE la plantilla determinista local — y no sale NI UNA petición a
// /api/narrate (la privacidad no depende del servidor: el cliente ni llama).
// Gate ⭐ S4: la IA es a demanda, así que "no pedirla" es el estado por defecto.
test("sin pedir la IA: plantilla local y cero peticiones de narración", async ({
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

  // Nunca sección vacía: el bloque de texto estándar existe y trae contenido.
  await expect(page.getByText("¿Por qué predice así?")).toBeVisible();
  await expect(page.getByText("Texto estándar", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/supera al baseline|empata con el baseline|NO supera/).last(),
  ).toBeVisible();

  // El bloque de IA está en reposo: ofrece el botón y NO ha pedido nada.
  await expect(
    page.getByRole("button", { name: /Narrar con IA/i }),
  ).toBeVisible();
  expect(narrateRequests).toHaveLength(0);
});
