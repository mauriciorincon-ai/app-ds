import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { axeBothThemes } from "./axe-temas";
import { activarConTeclado, tabularHasta } from "./teclado";

// S18 — entender los datos y confiar en la cifra, de punta a punta en el navegador real (build de producción en CI):
//  · la exploración se pide (no hay nada antes), trae su resumen verificado, la matriz con signos y pasa axe en los dos temas;
//    con el teclado se llega a «Explorar» y se activa;
//  · en cada tarea con objetivo, el margen de error de la cifra aparece solo con su semilla, y el texto estándar lleva la insignia
//    «Verificada contra tus números»;
//  · al agrupar, la descripción de cada grupo lleva la misma insignia y el margen de error dice por qué no aplica.

const kit = (name: string) =>
  resolve(process.cwd(), "docs/kit-de-prueba", name);
const entrada = (page: Page) => page.locator('input[accept^=".csv,text/csv"]');

async function entrenar(page: Page, archivo: string, objetivo: string) {
  await page.goto("/");
  await entrada(page).setInputFiles(kit(archivo));
  await page.selectOption("#target", objetivo);
  await page.getByRole("button", { name: /Entrenar modelos/i }).click();
  await expect(
    page.getByRole("heading", { name: /La liga: \d+ modelos/ }),
  ).toBeVisible({ timeout: 180_000 });
}

test("la exploración se pide, trae su resumen verificado y la matriz con signos; el teclado la alcanza; axe en los dos temas", async ({
  page,
}) => {
  await page.goto("/");
  await entrada(page).setInputFiles(kit("marketing-campania.csv"));
  await expect(page.getByTestId("exploracion-panel")).toBeVisible();
  // nada antes de pedirla
  await expect(page.getByTestId("exploracion-resumen")).toHaveCount(0);

  // con el teclado: Tab hasta «Explorar» y Enter
  await tabularHasta(page, /^Explorar$/);
  await activarConTeclado(page);
  const resumen = page.getByTestId("exploracion-resumen");
  await expect(resumen).toBeVisible();
  await expect(resumen).toContainText(/^Tu tabla tiene 200 filas\./);
  await expect(page.getByText("Verificado contra tus números")).toBeVisible();

  const matriz = page.getByRole("region", {
    name: /Correlación entre columnas numéricas/,
  });
  await expect(matriz).toContainText("1.00");
  await expect(matriz).toContainText(/[+−]\d\.\d\d/);
  // una distribución se abre con el teclado y trae sus cifras
  const primera = page.locator("details").first();
  await primera.locator("summary").focus();
  await activarConTeclado(page);
  await expect(primera.locator("li").first()).toBeVisible();

  await axeBothThemes(page);

  // ocultar la exploración
  await page.getByRole("button", { name: "Ocultar la exploración" }).click();
  await expect(page.getByTestId("exploracion-resumen")).toHaveCount(0);
});

const TAREAS = [
  ["dos clases", "marketing-campania.csv", "convirtio", /AUC|F1/],
  [
    "varias categorías",
    "planes-suscripcion.csv",
    "plan",
    /Exactitud balanceada/,
  ],
  ["estimar un número", "consumo-energia.csv", "consumo_kwh", /MAE/],
] as const;

for (const [nombre, archivo, objetivo, metrica] of TAREAS) {
  test(`${nombre}: el margen de error aparece solo, con su semilla, y el texto estándar lleva la insignia de verificado`, async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await entrenar(page, archivo, objetivo);

    const linea = page.getByTestId("intervalo-linea");
    await expect(linea).toBeVisible({ timeout: 60_000 });
    await expect(linea).toContainText(metrica);
    await expect(linea).toContainText(/con un intervalo del 95 % de .+ a /);
    await expect(
      page.getByText(/1,?000 veces, con la semilla 42/),
    ).toBeVisible();

    // el texto estándar de «por qué»: pasó la comprobación contra los números
    await expect(
      page.getByText("Verificada contra tus números").first(),
    ).toBeVisible();
    await axeBothThemes(page);
  });
}

test("agrupar: la descripción de cada grupo está verificada y el margen de error dice por qué no aplica", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await entrada(page).setInputFiles(kit("segmentos-clientes.csv"));
  await page.selectOption("#target", {
    label: "Sin objetivo: agrupar filas parecidas",
  });
  await page.getByRole("button", { name: /Agrupar filas/ }).click();
  const texto = page.getByTestId("explicacion-grupos");
  await expect(texto).toBeVisible({ timeout: 180_000 });
  await expect(texto).toContainText(/Los grupos se separan sobre todo por/);
  await expect(texto).toContainText(/El grupo 1 \(\d+ %, [\d,]+ filas\)/);
  await expect(page.getByText("Verificada contra tus números")).toBeVisible();
  await expect(
    page.getByText(
      /Agrupar no tiene objetivo ni prueba: no hay una cifra con margen de error/,
    ),
  ).toBeVisible();
  await axeBothThemes(page);
});
