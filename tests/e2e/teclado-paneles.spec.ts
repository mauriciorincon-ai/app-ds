import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { axeBothThemes } from "./axe-temas";
import { sinDesborde } from "./protocolo-pasos";
import { activarConTeclado, recorrerConTeclado, tabularHasta } from "./teclado";

// S21 (lote 20-03) — los paneles de la configuración que llegaron después del recorrido de teclado de Probeta (S16) se usan SIN ratón:
// «Pregúntale a tus datos» (S21), el gemelo sintético y pronosticar una serie (S20). En cada uno: se alcanzan con Tab, se escribe y
// se activa con Enter, el resultado llega a la pantalla, el recorrido del panel no tiene trampa (paradas visibles, con nombre y con
// foco, en el orden del documento), axe en los dos temas y sin desborde a 360 px. Solo en escritorio: Tab no aplica al teléfono.

test.skip(({ isMobile }) => isMobile, "Tab no aplica al teléfono");
test.setTimeout(480_000);

const kit = (name: string) =>
  resolve(process.cwd(), "docs/kit-de-prueba", name);

async function a360(page: Page) {
  const antes = page.viewportSize()!;
  await sinDesborde(page, 360);
  await page.setViewportSize(antes);
}

test("«Pregúntale a tus datos» y el gemelo se usan sin ratón", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator('input[accept^=".csv,text/csv"]')
    .setInputFiles(kit("ventas-por-region.csv"));
  await expect(page.getByTestId("pregunta-panel")).toBeVisible();
  await expect(page.getByTestId("pregunta-revisando")).toHaveCount(0, {
    timeout: 30_000,
  });

  // la pregunta se escribe con el teclado y se lee con Enter sobre «Entender la pregunta»
  await tabularHasta(page, '[data-testid="pregunta-input"]');
  await page.keyboard.type("ventas del último trimestre por región");
  await tabularHasta(page, /^Entender la pregunta/);
  await activarConTeclado(page);
  await expect(page.getByTestId("pregunta-palabras")).toContainText(
    "la suma de «ventas_usd»",
  );
  // la consulta se mostró y NO corrió sola
  await expect(page.getByTestId("pregunta-resultado")).toHaveCount(0);
  await tabularHasta(page, /^Correr la consulta/);
  await activarConTeclado(page);
  await expect(page.getByTestId("pregunta-resultado")).toBeVisible();
  await recorrerConTeclado(page, '[data-testid="pregunta-panel"]', {
    minimo: 6,
  });
  await a360(page);
  await axeBothThemes(page);

  // el gemelo: «Generar el gemelo» se alcanza con Tab y el informe llega
  await tabularHasta(page, /^Generar el gemelo/);
  await activarConTeclado(page);
  await expect(page.getByTestId("gemelo-lectura")).toBeVisible({
    timeout: 240_000,
  });
  await recorrerConTeclado(page, '[data-testid="gemelo-panel"]', { minimo: 3 });
  await a360(page);
  await axeBothThemes(page);
});

test("pronosticar una serie se usa sin ratón", async ({ page }) => {
  await page.goto("/");
  await page
    .locator('input[accept^=".csv,text/csv"]')
    .setInputFiles(kit("serie-ventas-mensual.csv"));
  await expect(page.getByTestId("pronostico-panel")).toBeVisible();
  await tabularHasta(page, /^Pronosticar$/);
  await activarConTeclado(page);
  await expect(page.getByTestId("pronostico-lectura")).toBeVisible({
    timeout: 240_000,
  });
  await recorrerConTeclado(page, '[data-testid="pronostico-panel"]', {
    minimo: 4,
  });
  await a360(page);
  await axeBothThemes(page);
});
