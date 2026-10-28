import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { axeBothThemes } from "./axe-temas";
import { sinDesborde } from "./protocolo-pasos";

// S21 (ADR 030) — «Pregúntale a tus datos» de punta a punta en el navegador real, en español y en inglés:
//  · «ventas del último trimestre por región» (y «sales by region last quarter») se lee, se MUESTRA en palabras y en SQL con lo que se
//    comprobó y NO corre hasta pulsar «Correr la consulta»; el resultado trae su frase, su gráfico, su tabla y su CSV;
//  · lo ambiguo se pregunta con opciones («ventas de norte»: ¿región o bodega?) y la respuesta lo cierra;
//  · NADA sale del navegador (regla dura 2): ni la pregunta, ni los nombres de las columnas, ni un valor de la tabla viajan en ninguna
//    petición, y no se llama a /api/narrate;
//  · axe en los dos temas con el resultado a la vista y sin desborde horizontal a 360 px.

const kit = (name: string) => resolve(process.cwd(), "docs/kit-de-prueba", name);

async function cargar(page: Page, archivo: string) {
  await page.goto("/");
  await page.locator('input[accept^=".csv,text/csv"]').setInputFiles(kit(archivo));
  await expect(page.getByTestId("pregunta-panel")).toBeVisible();
  // el aviso de datos personales se arma al cargar: hasta entonces no se lee la pregunta
  await expect(page.getByTestId("pregunta-revisando")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("pregunta-ejemplos")).toBeVisible();
}

async function preguntar(page: Page, texto: string) {
  await page.getByTestId("pregunta-input").fill(texto);
  await page.getByTestId("pregunta-entender").click();
}

test("«ventas del último trimestre por región»: se enseña antes de correr, corre al pulsar y se descarga", async ({ page }) => {
  test.setTimeout(120_000);
  const peticiones: string[] = [];
  page.on("request", (r) => peticiones.push(`${r.url()} ${r.postData() ?? ""}`));
  await cargar(page, "ventas-por-region.csv");
  await preguntar(page, "ventas del último trimestre por región");

  // la consulta, antes de correr: en palabras, en SQL y lo que se comprobó, con símbolo y palabra
  await expect(page.getByTestId("pregunta-palabras")).toContainText("la suma de «ventas_usd»");
  await expect(page.getByTestId("pregunta-palabras")).toContainText("del 2025-10-01 al 2025-12-31");
  await expect(page.getByTestId("pregunta-sql")).toContainText('SUM("ventas_usd")');
  await expect(page.getByTestId("pregunta-validacion")).toContainText("✓");
  await expect(page.getByTestId("pregunta-validacion")).toContainText("la tabla llega hasta el 2025-12-22");
  await expect(page.getByTestId("pregunta-propuestos")).toContainText("propuesto");
  await expect(page.getByTestId("pregunta-resultado")).toHaveCount(0);

  await page.getByTestId("pregunta-correr").click();
  const resultado = page.getByTestId("pregunta-resultado");
  await expect(resultado).toBeVisible();
  await expect(page.getByTestId("pregunta-frase")).toHaveAttribute("data-verificada", "si");
  await expect(page.getByTestId("pregunta-frase")).toContainText("Por «region»");
  await expect(page.getByTestId("pregunta-grafico")).toBeVisible();
  await axeBothThemes(page);
  await sinDesborde(page, 360);

  const descarga = page.waitForEvent("download");
  await page.getByTestId("pregunta-descargar").click();
  const archivo = await descarga;
  expect(archivo.suggestedFilename()).toBe("consulta-ventas-por-region.csv");
  const lineas = readFileSync((await archivo.path())!, "utf8").trim().split("\n");
  expect(lineas[0]).toBe("region,suma_ventas_usd,filas");
  expect(lineas).toHaveLength(1 + 4);

  // ni la pregunta, ni los nombres de las columnas, ni un valor de la tabla viajaron; tampoco se llamó a la narración
  const red = peticiones.join("\n");
  expect(red).not.toContain("/api/narrate");
  for (const secreto of ["último trimestre", "ventas_usd", "ultimo%20trimestre", "bodega", "estandar", "2025-12-22"]) {
    expect(red, `«${secreto}» en la red`).not.toContain(secreto);
  }
  for (const fila of readFileSync(kit("ventas-por-region.csv"), "utf8").split("\n").slice(1, 40).filter(Boolean)) {
    expect(red, `una fila de la tabla en la red: ${fila}`).not.toContain(fila);
  }
});

test("lo ambiguo se pregunta con opciones y la respuesta lo cierra", async ({ page }) => {
  test.setTimeout(120_000);
  await cargar(page, "ventas-por-region.csv");
  await preguntar(page, "ventas de norte");
  const abiertas = page.getByTestId("pregunta-abiertas");
  await expect(abiertas).toContainText("«norte» está en más de una columna");
  await expect(page.getByTestId("pregunta-correr")).toHaveCount(0);
  await axeBothThemes(page);
  // la pregunta desaparece al contestarla: click, no check (check espera ver el radio marcado)
  await abiertas.getByLabel("bodega").click();
  await expect(page.getByTestId("pregunta-palabras")).toContainText("«bodega» es «norte»");
  await page.getByTestId("pregunta-correr").click();
  await expect(page.getByTestId("pregunta-frase")).toBeVisible();
});

test("lo que no se entiende se dice y lo que no se leyó también", async ({ page }) => {
  test.setTimeout(120_000);
  await cargar(page, "ventas-por-region.csv");
  await preguntar(page, "hola, qué tal");
  await expect(page.getByText(/No encontré en tu pregunta nada que reconozca/)).toBeVisible();
  await expect(page.getByTestId("pregunta-entendida")).toHaveCount(0);
  await preguntar(page, "ventas por clima");
  await expect(page.getByTestId("pregunta-sin-leer").first()).toContainText("«clima»");
});

test("un ejemplo armado con tus columnas se lee de una vez; y por mes dibuja una línea", async ({ page }) => {
  test.setTimeout(120_000);
  await cargar(page, "ventas-por-region.csv");
  await page.getByTestId("pregunta-ejemplos").getByRole("button").nth(1).click();
  await expect(page.getByTestId("pregunta-entendida")).toBeVisible();
  await page.getByTestId("pregunta-correr").click();
  await expect(page.getByTestId("pregunta-grafico")).toHaveAttribute("data-modo", "linea");
  await expect(page.getByRole("img", { name: /Línea de/ })).toBeVisible();
  await axeBothThemes(page);
});

test("en inglés: «sales by region last quarter»", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => window.localStorage.setItem("probeta-ds.locale", "en"));
  await cargar(page, "sales-by-region.csv");
  await expect(page.getByRole("heading", { name: "Ask your data" })).toBeVisible();
  await preguntar(page, "sales by region last quarter");
  await expect(page.getByTestId("pregunta-palabras")).toHaveText(
    "I will calculate the sum of «sales_usd», split by «region», in the last quarter of the table (from 2025-10-01 to 2025-12-31).",
  );
  await page.getByTestId("pregunta-correr").click();
  await expect(page.getByTestId("pregunta-frase")).toContainText("By «region», the sum of «sales_usd» was");
  await axeBothThemes(page);
});

test("con el teclado: Tab hasta la pregunta, Enter la lee y el botón de correr se alcanza", async ({ page }) => {
  test.setTimeout(120_000);
  await cargar(page, "ventas-por-region.csv");
  await page.getByTestId("pregunta-input").focus();
  await page.keyboard.type("promedio de ventas por producto");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("pregunta-entendida")).toBeVisible();
  const correr = page.getByTestId("pregunta-correr");
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    if (await correr.evaluate((el) => el === document.activeElement)) break;
  }
  await expect(correr).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("pregunta-frase")).toBeVisible();
});
