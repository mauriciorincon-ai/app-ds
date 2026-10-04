// Pasada de capturas del S5 (contrapeso del ⭐ diferido — regla «Brochure vivo» y
// /deploy-check): el build de producción en :3000 (`pnpm build && pnpm start`),
// 360 px y 1280 px, tema claro y oscuro. Cada encuadre MIDE scrollWidth ≤
// clientWidth (sin desplazamiento lateral), y la pasada de interacción abre lo
// que solo existe tras un clic: el desplegable de prueba, la ficha (<dialog>, con
// su alto medido contra la ventana), el Nivel 2 corriendo, cancelar y la
// recuperación del modelo. Las capturas se LEEN como imagen antes de presentar.
//
// Uso: OUT=<carpeta> node scripts/capturas-s5.mjs
// No es un gate de CI (la CI no lee imágenes): es evidencia para la bitácora.
import { chromium } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const OUT = process.env.OUT;
if (!OUT) throw new Error("OUT=<carpeta> es obligatorio");
const BASE = "http://localhost:3000";
const MEDIANA = resolve("docs/kit-de-prueba/liga-mediana.csv");
const GUIA = pathToFileURL(resolve("docs/GUIA-DE-PRUEBA.html")).href;

const browser = await chromium.launch();
const report = [];
let failures = 0;

async function session(width, scheme) {
  const ctx = await browser.newContext({
    viewport: { width, height: width < 600 ? 780 : 900 },
    colorScheme: scheme,
    locale: "es-ES",
    acceptDownloads: true,
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => {
    failures++;
    report.push(`✗ pageerror: ${e.message}`);
  });
  return { ctx, page };
}

/** Espera a que ningún botón esté a mitad de su fundido (botón pálido = falso hallazgo).
 *  El cursor sale de la página antes: un primario bajo el puntero queda en
 *  hover:opacity-90 para siempre. */
async function settle(page) {
  await page.mouse.move(0, 0);
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].every(
      (b) => b.disabled || getComputedStyle(b).opacity === "1",
    ),
  );
}

async function shot(page, name, { full = true } = {}) {
  await settle(page);
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  const ok = m.sw <= m.cw;
  if (!ok) failures++;
  report.push(`${ok ? "OK" : "✗ DESBORDA"} ${name}: scrollWidth ${m.sw} ≤ ${m.cw}`);
}

async function card(page, selector, name) {
  await settle(page);
  await page
    .locator(selector)
    .locator("xpath=ancestor-or-self::div[contains(@class,'rounded-lg')][1]")
    .screenshot({ path: `${OUT}/${name}.png` });
}

async function waitResults(page) {
  await page
    .getByRole("heading", { name: /La liga: \d+ modelos/ })
    .waitFor({ timeout: 240_000 });
}

for (const [width, scheme] of [
  [360, "light"],
  [360, "dark"],
  [1280, "light"],
  [1280, "dark"],
]) {
  const tag = `${width}-${scheme}`;
  const { ctx, page } = await session(width, scheme);

  // Configuración (E1 + E2).
  await page.goto(BASE);
  await page.getByRole("button", { name: /Rotación de empleados/i }).click();
  await page.selectOption("#target", "edad");
  await shot(page, `${tag}-01-config-edad`);
  await page.selectOption("#target", "renuncio");
  await shot(page, `${tag}-02-config-renuncio`);

  // Resultados: la liga, la prueba a pedido, la ficha y el Nivel 2 (U3).
  await page.getByRole("button", { name: /Entrenar modelos/i }).click();
  await waitResults(page);
  await shot(page, `${tag}-03-resultados`);
  await page.getByRole("button", { name: /Ver puntajes de prueba/i }).click();
  await card(page, "#league-title", `${tag}-04-liga-con-prueba`);
  await shot(page, `${tag}-04b-resultados-con-prueba`);

  const ficha = page
    .getByRole("row")
    .filter({ hasText: "Ganador (validación cruzada)" })
    .getByRole("button", { name: /^Ficha de / });
  await ficha.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  const fit = await dialog.evaluate((d) => ({
    h: d.getBoundingClientRect().height,
    vh: window.innerHeight,
    scrolls: d.scrollHeight > d.clientHeight,
  }));
  const dialogOk = fit.h <= fit.vh;
  if (!dialogOk) failures++;
  report.push(
    `${dialogOk ? "OK" : "✗ NO CABE"} ${tag}-05 ficha: alto ${Math.round(fit.h)} ≤ ventana ${fit.vh}${fit.scrolls ? " (con scroll interno)" : ""}`,
  );
  await shot(page, `${tag}-05-ficha`, { full: false });
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });

  await page.getByRole("checkbox", { name: /Red neuronal/ }).check();
  await card(page, "#level2-title", `${tag}-06-nivel2-incluir`);

  await page
    .getByRole("button", { name: "Elegir Random Forest", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Volver al ganador" })
    .waitFor({ timeout: 60_000 });
  await card(page, "#league-title", `${tag}-07-liga-elegido`);
  await page
    .locator("h1")
    .first()
    .locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]")
    .screenshot({ path: `${OUT}/${tag}-07b-veredicto-elegido.png` });

  // Nivel 2 con liga-mediana: tarjeta, corriendo, cancelar, recuperar.
  if (scheme === "light") {
    await page.getByRole("button", { name: /Nuevo experimento/i }).click();
    await page
      .locator('input[type="file"][accept=".csv,text/csv"]')
      .setInputFiles(MEDIANA);
    await page.selectOption("#target", "objetivo");
    await shot(page, `${tag}-08-config-mediana`);
    await page.getByRole("button", { name: /Entrenar modelos/i }).click();
    await waitResults(page);
    await card(page, "#level2-title", `${tag}-09-nivel2-tarjeta`);
    await page.getByRole("button", { name: /Correr el Nivel 2/ }).click();
    await page
      .getByText(/Validación cruzada · modelo \d+ de \d+/)
      .waitFor({ timeout: 60_000 });
    await shot(page, `${tag}-10-nivel2-corriendo`);
    await page.getByRole("button", { name: "Cancelar el Nivel 2" }).click();
    await page.getByText(/Cancelaste el Nivel 2/).waitFor();
    await card(page, "#level2-title", `${tag}-11-cancelado-recuperando`);
    const exportButton = page.getByRole("button", { name: /Exportar modelo/i });
    await exportButton.waitFor();
    await page.waitForFunction(
      () =>
        ![...document.querySelectorAll("button")].find((b) =>
          /Exportar modelo/.test(b.textContent ?? ""),
        )?.disabled,
      null,
      { timeout: 150_000 },
    );
    await card(page, "#level2-title", `${tag}-12-cancelado-listo`);
    await shot(page, `${tag}-12b-resultados-tras-cancelar`);
    report.push(`OK ${tag} tras cancelar: «Exportar modelo» habilitado`);
  }
  await ctx.close();
}

// La guía v2 (documento autocontenido): que se lea en móvil y escritorio.
for (const [width, scheme] of [
  [360, "light"],
  [1280, "dark"],
]) {
  const { ctx, page } = await session(width, scheme);
  await page.goto(GUIA);
  await shot(page, `guia-${width}-${scheme}`);
  await page.getByRole("button", { name: "⭐ Solo el gate H2" }).click();
  await shot(page, `guia-${width}-${scheme}-gate-h2`, { full: false });
  report.push(
    `guía ${width}-${scheme}: ${await page.locator("#contador").innerText()} con el filtro ⭐ H2`,
  );
  await ctx.close();
}

await browser.close();
console.log(report.join("\n"));
if (failures > 0) {
  console.log(`✗ ${failures} hallazgo(s)`);
  process.exit(1);
}
