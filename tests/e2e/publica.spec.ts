import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { expect, test, type Download, type Page } from "@playwright/test";
import { axeBothThemes } from "./axe-temas";

// S17 (ADR 024) — «Llévatelo» de punta a punta en el navegador real: el ejemplo de marketing → resultados → aviso antes de
// descargar → la receta (sin una sola fila) → el servicio (un ZIP) → el puntuador portátil, que se abre en OTRO contexto del
// navegador, SIN sesión (ni el almacenamiento ni la app), y puntúa el CSV solo con el motor de Pyodide que le sirve «el CDN»
// (aquí, los archivos de public/pyodide con los mismos nombres: así se prueba la URL de verdad sin depender de la red).
// Solo en escritorio: Pyodide y 35 MB de wheels en un celular de pruebas no suman nada que el flujo no haya dicho.

const CDN = "https://cdn.jsdelivr.net/pyodide/v314.0.2/full/";
const TIPOS: Record<string, string> = {
  ".wasm": "application/wasm",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".zip": "application/zip",
  ".whl": "application/octet-stream",
};

test.setTimeout(480_000);

async function descargar(page: Page, testid: string): Promise<{ download: Download; ruta: string }> {
  const espera = page.waitForEvent("download");
  await page.getByTestId(testid).click();
  const download = await espera;
  // con su nombre y extensión: el navegador abre un .html por su extensión, no un archivo temporal sin ella
  const ruta = test.info().outputPath(download.suggestedFilename());
  await download.saveAs(ruta);
  return { download, ruta };
}

async function resultadosDelEjemplo(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Campaña de marketing/i }).click();
  await page.selectOption("#target", "convirtio");
  await page.getByRole("button", { name: /Entrenar modelo/i }).click();
  await expect(page.getByRole("button", { name: /Nuevo experimento/i })).toBeVisible({
    timeout: 240_000,
  });
}

test("Llévatelo: el aviso, la receta sin filas, el servicio y un puntuador que puntúa en otro navegador sin sesión", async ({
  page,
  browser,
  isMobile,
}) => {
  test.skip(isMobile, "Pyodide y sus wheels, una vez, en escritorio");
  const peticionesApp: string[] = [];
  page.on("request", (r) => peticionesApp.push(r.url()));
  await resultadosDelEjemplo(page);

  // el aviso está a la vista ANTES de descargar nada, con símbolo y palabra
  const panel = page.getByTestId("publica-panel");
  await panel.scrollIntoViewIfNeeded();
  await expect(panel.getByText(/Antes de descargar: qué lleva cada archivo/)).toBeVisible();
  await expect(panel.getByText(/La receta no lleva ni una fila/)).toBeVisible();
  await axeBothThemes(page);

  // la receta: un .py con la declaración y ni una fila del CSV; no se pidió el modelo (no hay petición a nada fuera de la app)
  const receta = await descargar(page, "publica-receta");
  expect(receta.download.suggestedFilename()).toMatch(/^receta-campana-de-marketing.*\.py$|^receta-marketing-campania-.*\.py$/);
  const textoReceta = readFileSync(receta.ruta, "utf8");
  expect(textoReceta).toContain("def _prepare(p):");
  expect(textoReceta).toContain('"objetivo": "convirtio"');
  const filas = readFileSync(resolve("public/datasets/marketing-campania.csv"), "utf8").split("\n").slice(1).filter(Boolean);
  for (const fila of filas.slice(0, 40)) expect(textoReceta, `una fila en la receta: ${fila}`).not.toContain(fila);
  await expect(page.getByTestId("publica-estado")).toContainText("✓ Descargado: receta-");

  // el servicio: un ZIP (empieza por «PK»); la CI lo abre con zipfile y lo corre en CPython
  const servicio = await descargar(page, "publica-servicio");
  expect(servicio.download.suggestedFilename()).toMatch(/^servicio-.*\.zip$/);
  expect(readFileSync(servicio.ruta).subarray(0, 2).toString("latin1")).toBe("PK");

  // el puntuador: un .html autocontenido
  const puntuador = await descargar(page, "publica-puntuador");
  expect(puntuador.download.suggestedFilename()).toMatch(/^puntuador-.*\.html$/);
  const html = readFileSync(puntuador.ruta, "utf8");
  expect(html).toContain('id="modelo"');
  expect(html).not.toMatch(/vercel\.app/);
  await axeBothThemes(page);
  // nada de «Llévatelo» salió de la app hacia otro sitio
  expect(peticionesApp.filter((u) => /cdn\.jsdelivr\.net|api\/narrate/.test(u))).toEqual([]);

  // ——— OTRO navegador, sin sesión: un contexto nuevo (sin almacenamiento) en inglés, abierto desde el disco ———
  const contexto = await browser.newContext({ locale: "en-US" });
  const afuera = await contexto.newPage();
  const pedidas: string[] = [];
  afuera.on("request", (r) => pedidas.push(r.url()));
  await contexto.route(`${CDN}**`, async (route) => {
    const archivo = basename(new URL(route.request().url()).pathname);
    const ext = archivo.slice(archivo.lastIndexOf("."));
    await route.fulfill({
      path: resolve("public/pyodide", archivo),
      contentType: TIPOS[ext] ?? "application/octet-stream",
      headers: { "access-control-allow-origin": "*" },
    });
  });
  await afuera.goto(`file://${puntuador.ruta}`);
  await expect(afuera.getByRole("heading", { level: 1, name: "Portable scorer" })).toBeVisible();
  await expect(afuera.locator("#aviso")).toContainText("Share it only with someone you can give that to");
  await expect(afuera.locator("#estado")).toContainText("✓ Ready", { timeout: 240_000 });
  await axeBothThemes(afuera);

  // arrastra el CSV (las 200 filas del ejemplo) y recibe sus puntajes
  await afuera.locator("#archivo").setInputFiles(resolve("public/datasets/marketing-campania.csv"));
  await expect(afuera.locator("#res-resumen")).toContainText("200 rows scored.", { timeout: 120_000 });
  await expect(afuera.locator("#res-resumen")).toContainText("The probability is that of the class");
  await expect(afuera.locator("#res-body tr")).toHaveCount(20);
  await expect(afuera.locator("#res-novedad")).not.toBeEmpty();
  await axeBothThemes(afuera);

  // el CSV puntuado: las 200 filas de siempre, más la predicción y la probabilidad
  const espera = afuera.waitForEvent("download");
  await afuera.getByRole("button", { name: "Download the scored CSV" }).click();
  const salida = test.info().outputPath("puntuado.csv");
  await (await espera).saveAs(salida);
  const puntuado = readFileSync(salida, "utf8").trim().split("\n");
  expect(puntuado[0]).toMatch(/,prediccion,probabilidad$/);
  expect(puntuado).toHaveLength(201);
  expect(Number(puntuado[1]!.split(",").at(-1))).toBeGreaterThanOrEqual(0);

  // lo único que pidió fuera del disco fue el motor de Pyodide en su versión fija, ni la app ni nada más
  const externas = pedidas.filter((u) => !u.startsWith("file:") && !u.startsWith("blob:") && !u.startsWith("data:"));
  expect(externas.length).toBeGreaterThan(5);
  expect(externas.filter((u) => !u.startsWith(CDN))).toEqual([]);
  await contexto.close();
});

test("el puntuador se niega a abrirse si su modelo cambió (SHA-256) y lo dice, sin bajar el motor", async ({
  page,
  browser,
  isMobile,
}) => {
  test.skip(isMobile, "se prueba una vez, en escritorio");
  await resultadosDelEjemplo(page);
  const { ruta } = await descargar(page, "publica-puntuador");
  const alterado = readFileSync(ruta, "utf8").replace(/"payload_sha256":\s*"[0-9a-f]{64}"/, `"payload_sha256": "${"0".repeat(64)}"`);
  expect(alterado).not.toBe(readFileSync(ruta, "utf8"));
  const contexto = await browser.newContext({ locale: "es-ES" });
  const afuera = await contexto.newPage();
  const externas: string[] = [];
  afuera.on("request", (r) => {
    if (!/^(file|blob|data):/.test(r.url())) externas.push(r.url());
  });
  const archivoAlterado = test.info().outputPath("puntuador-alterado.html");
  writeFileSync(archivoAlterado, alterado);
  await afuera.goto(`file://${archivoAlterado}`);
  await expect(afuera.locator("#estado")).toContainText("SHA-256 del modelo no coincide");
  expect(externas).toEqual([]);
  await contexto.close();
});
