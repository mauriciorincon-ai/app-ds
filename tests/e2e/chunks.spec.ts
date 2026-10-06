import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// S7 (AU-S7-19): configurar, entrenar, resultados y puntuar llegan en sus propios
// chunks (R15). Mientras uno llega, la pantalla dice «Cargando…»; si no llega (sin red,
// o un despliegue nuevo cambió sus nombres), el límite de error de la ruta lo dice, en
// vez de dejar la página en blanco. Se prueba con el build de producción real: la
// petición del chunk se retiene o se corta en la red del navegador.

const SEGMENTOS = resolve(
  process.cwd(),
  "docs/kit-de-prueba/segmentos-clientes.csv",
);

async function landing(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // La portada ya cargó sus chunks; desde aquí, solo se piden los de las fases.
  await page.waitForLoadState("networkidle");
}

test("mientras llega el chunk de la fase siguiente, «Cargando…»", async ({
  page,
}) => {
  await landing(page);
  let release: () => void = () => {};
  const held = new Promise<void>((done) => (release = done));
  await page.route("**/_next/static/chunks/**", async (route) => {
    await held;
    await route.continue();
  });
  await page.locator('input[accept=".csv,text/csv"]').setInputFiles(SEGMENTOS);
  await expect(
    page.getByRole("status").filter({ hasText: "Cargando…" }),
  ).toBeVisible();
  release();
  await expect(page.getByLabel("¿Qué quieres predecir?")).toBeVisible();
});

test("si el chunk no llega, la página lo dice (y no queda en blanco)", async ({
  page,
}) => {
  await landing(page);
  await page.route("**/_next/static/chunks/**", (route) => route.abort());
  await page.locator('input[accept=".csv,text/csv"]').setInputFiles(SEGMENTOS);
  await expect(
    page.getByText(
      "No se pudo cargar esta parte de la app. Revisa tu conexión y vuelve a intentarlo; tus datos siguen solo en este navegador.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Volver a empezar" }),
  ).toBeVisible();
});
