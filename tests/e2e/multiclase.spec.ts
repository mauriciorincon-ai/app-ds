import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { axeBothThemes } from "./axe-temas";

// S7 (ADR 015) — clasificar en VARIAS categorías de punta a punta en el navegador
// real (build de producción en CI): la tarjeta dice cuántas categorías → la liga
// en exactitud balanceada → el veredicto → la matriz K×K con los aciertos
// marcados con símbolo y texto → las métricas por categoría. P10: no hay botón de
// IA y NI UNA petición sale a /api/narrate. La fuga por clase nombra la columna Y
// la categoría. axe en ambos temas en cada pantalla.

const kit = (name: string) =>
  resolve(process.cwd(), "docs/kit-de-prueba", name);

async function load(page: Page, name: string) {
  await page.goto("/");
  await page.locator('input[accept=".csv,text/csv"]').setInputFiles(kit(name));
  await page.selectOption("#target", "plan");
}

test("varias categorías: veredicto, matriz K×K, por categoría y cero peticiones de narración", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const narrateRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/narrate"))
      narrateRequests.push(request.url());
  });

  // S7 (decisión 7): por el botón de ejemplo de la portada, el mismo CSV del kit.
  await page.goto("/");
  await page.getByRole("button", { name: /Planes de suscripción/ }).click();
  await page.selectOption("#target", "plan");
  await expect(
    page.getByText(
      /5 categorías distintas → clasificación en varias categorías/,
    ),
  ).toBeVisible();
  await expect(
    page.getByText(/Vas a clasificar en 5 categorías/),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Quién compite" }),
  ).toBeVisible();
  await axeBothThemes(page);
  await page.getByRole("button", { name: /Entrenar modelos/i }).click();

  await expect(
    page.getByRole("heading", { name: /La liga: \d+ modelos/ }),
  ).toBeVisible({ timeout: 150_000 });
  await expect(
    page.getByRole("columnheader", {
      name: "Validación cruzada · Exactitud balanceada",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /supera al baseline|empata|NO supera|nada mejor/,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/Con 5 categorías, adivinar al azar da 0\.20/),
  ).toBeVisible();

  // La matriz: región desplazable con nombre, 5 aciertos marcados con ✓.
  const matrix = page.getByRole("region", {
    name: "Matriz de confusión (prueba)",
  });
  await expect(matrix).toBeVisible();
  await expect(matrix.getByRole("row")).toHaveCount(6);
  await expect(matrix.getByText("✓")).toHaveCount(5);
  await expect(
    page.getByText(/La confusión más frecuente|no confundió ninguna/),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Por categoría (prueba)" }),
  ).toBeVisible();
  // Sin marcas de la binaria.
  await expect(page.getByText(/clase positiva/i)).toHaveCount(0);

  // P10: texto estándar sí; IA no, dicho de frente.
  await expect(page.getByText("Texto estándar", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Narrar con IA/i }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/Con varias categorías, la lectura es el texto estándar/),
  ).toBeVisible();
  await axeBothThemes(page);

  // La ficha de la logística con varias categorías: sin «sí»/«no».
  await page
    .getByRole("button", { name: "Ficha de Regresión logística" })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(/una probabilidad por categoría/),
  ).toBeVisible();
  await expect(dialog.getByText(/«sí» o hacia «no»/)).toHaveCount(0);
  await axeBothThemes(page, "dialog");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  expect(narrateRequests).toEqual([]);
});

test("varias categorías: la fuga por clase nombra la columna y la categoría", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await load(page, "planes-fuga-plantada.csv");
  await page.getByRole("button", { name: /Entrenar modelos/i }).click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Posible fuga de datos — sospechoso",
    }),
  ).toBeVisible({ timeout: 150_000 });
  await expect(
    page.getByText(
      "La columna «cargo_corporativo_usd» separa casi a la perfección la categoría «empresa» del resto: podría ser un proxy del objetivo.",
    ),
  ).toBeVisible();
  await axeBothThemes(page);
});
