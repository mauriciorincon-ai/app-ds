// Pasada de capturas del S6 (contrapeso del ⭐ diferido — regla «Brochure vivo» y
// /deploy-check): el build de producción en :3000 (`pnpm build && pnpm start`),
// 360 px y 1280 px, tema claro y oscuro. Cada encuadre MIDE scrollWidth ≤
// clientWidth (sin desplazamiento lateral). La pasada de interacción recorre
// estimar una cantidad:
// - la tarjeta de la tarea y la pregunta de la ambigua (sin responder y respondida);
// - Resultados en unidades, con el veredicto, el gráfico y la tabla;
// - la ficha de un modelo compartido al estimar (con su alto medido contra la ventana);
// - la model card con «Estimación»;
// - puntuar con novedad plantada, la fuga plantada y el Nivel 2 con 5 000 filas.
// Además deja en el reporte las CIFRAS que cita la guía v3 (se cuadran midiendo,
// no a ojo). Las capturas se LEEN como imagen antes de presentar.
//
// Uso: OUT=<carpeta> node scripts/capturas-s6.mjs
// No es un gate de CI (la CI no lee imágenes): es evidencia para la bitácora.
import { chromium } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const OUT = process.env.OUT;
if (!OUT) throw new Error("OUT=<carpeta> es obligatorio");
const BASE = "http://localhost:3000";
const KIT = (file) => resolve("docs/kit-de-prueba", file);
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

/** Espera a que ningún botón esté a mitad de su fundido, con el cursor fuera. */
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
  report.push(
    `${ok ? "OK" : "✗ DESBORDA"} ${name}: scrollWidth ${m.sw} ≤ ${m.cw}`,
  );
}

async function element(page, locator, name) {
  await settle(page);
  await locator.screenshot({ path: `${OUT}/${name}.png` });
}

async function waitResults(page) {
  await page
    .getByRole("heading", { name: /La liga: \d+ modelos/ })
    .waitFor({ timeout: 240_000 });
}

const text = async (locator) =>
  (await locator.innerText()).replace(/\s+/g, " ");

for (const [width, scheme] of [
  [360, "light"],
  [360, "dark"],
  [1280, "light"],
  [1280, "dark"],
]) {
  const tag = `${width}-${scheme}`;
  const { ctx, page } = await session(width, scheme);

  // Inicio: cinco ejemplos, el de consumo entre ellos.
  await page.goto(BASE);
  await shot(page, `${tag}-01-inicio`);

  // Configuración: la cantidad con su unidad y la pregunta de la ambigua.
  await page.getByRole("button", { name: /Consumo de energía/i }).click();
  await page.selectOption("#target", "ocupantes");
  await element(page, page.getByRole("group"), `${tag}-02-pregunta`);
  await page.getByRole("button", { name: /Una cantidad/ }).click();
  await shot(page, `${tag}-03-respondida`);
  await page.selectOption("#target", "consumo_kwh");
  await shot(page, `${tag}-04-config-consumo`);
  if (tag === "1280-light") {
    report.push(
      `cifra · quién compite: ${await text(page.getByRole("heading", { name: /Nivel 1/ }))}`,
    );
  }

  // Resultados en unidades.
  await page.getByRole("button", { name: /Entrenar modelos/i }).click();
  await waitResults(page);
  await shot(page, `${tag}-05-resultados`);
  const verdict = page
    .locator("h1")
    .first()
    .locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
  await element(page, verdict, `${tag}-06-veredicto`);
  await element(page, page.locator("figure"), `${tag}-07-grafico`);
  await page.getByRole("button", { name: /Ver puntajes de prueba/i }).click();
  await element(
    page,
    page.locator("#league-table"),
    `${tag}-08-liga-con-prueba`,
  );
  if (tag === "1280-light") {
    report.push(`cifra · veredicto: ${await text(verdict)}`);
    report.push(
      `cifra · errores: ${await text(page.getByText(/9 de cada 10 se equivocan/))}`,
    );
  }

  // La ficha de un modelo compartido al estimar.
  await page.getByRole("button", { name: "Ficha de Ridge" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  const fit = await dialog.evaluate((d) => ({
    h: d.getBoundingClientRect().height,
    vh: window.innerHeight,
  }));
  const dialogOk = fit.h <= fit.vh;
  if (!dialogOk) failures++;
  report.push(
    `${dialogOk ? "OK" : "✗ NO CABE"} ${tag}-09 ficha Ridge: alto ${Math.round(fit.h)} ≤ ventana ${fit.vh}`,
  );
  await shot(page, `${tag}-09-ficha-ridge`, { full: false });
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });

  // La model card con «Estimación».
  await page.getByText("Ver el contenido").click();
  await element(
    page,
    page.getByRole("region", { name: /contenido/i }),
    `${tag}-10-model-card`,
  );

  // Puntuar con novedad plantada.
  await page.getByRole("button", { name: /Usar el modelo/i }).click();
  await page.getByText(/Arrastra tu CSV nuevo/).waitFor({ timeout: 60_000 });
  await page
    .locator('input[type="file"][accept=".csv,text/csv"]')
    .setInputFiles(KIT("casas-nuevas.csv"));
  await page.getByText(/Estimaciones \(8 filas\)/).waitFor({ timeout: 60_000 });
  await shot(page, `${tag}-11-puntuar`);
  if (tag === "1280-light") {
    report.push(
      `cifra · novedad: ${await text(page.getByText(/El modelo está adivinando en/))}`,
    );
  }

  // La fuga plantada al estimar (solo en claro: el oscuro ya pasó por todo lo nuevo).
  if (scheme === "light") {
    await page
      .getByRole("button", { name: /Volver al inicio|Volver a los resultados/ })
      .first()
      .click();
    await page.getByRole("button", { name: /Nuevo experimento/i }).click();
    await page
      .locator('input[type="file"][accept=".csv,text/csv"]')
      .setInputFiles(KIT("precio-fuga-plantada.csv"));
    await page.selectOption("#target", "precio_usd");
    await shot(page, `${tag}-12-config-precio`);
    await page.getByRole("button", { name: /Entrenar modelos/i }).click();
    await waitResults(page);
    await element(page, verdict, `${tag}-13-veredicto-fuga`);

    // El Nivel 2 con 5 000 filas.
    await page.getByRole("button", { name: /Nuevo experimento/i }).click();
    await page
      .locator('input[type="file"][accept=".csv,text/csv"]')
      .setInputFiles(KIT("consumo-energia-mediano.csv"));
    await page.selectOption("#target", "consumo_kwh");
    await shot(page, `${tag}-14-config-mediano`);
    if (tag === "1280-light") {
      for (const name of [/Nivel 1/, /Nivel 2/, /Fuera/]) {
        const heading = page.getByRole("heading", { name });
        if (await heading.count())
          report.push(`cifra · mediano: ${await text(heading)}`);
      }
    }
  }
  await ctx.close();
}

// La guía v3 (documento autocontenido): que se lea en móvil y escritorio.
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
