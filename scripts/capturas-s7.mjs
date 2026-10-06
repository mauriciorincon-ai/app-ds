// Pasada de capturas del S7 (contrapeso del ⭐⭐ del cierre del ciclo H2 — regla 12 y
// /deploy-check): el build de producción en :3000 (`pnpm build && pnpm start`), 360 px
// y 1280 px, tema claro y oscuro. Cada encuadre MIDE scrollWidth ≤ clientWidth (sin
// desplazamiento lateral de la página; la matriz y las tablas se desplazan dentro de
// su propio recuadro).
//
// Recorre las dos tareas nuevas:
// - varias categorías: la tarjeta de la tarea, los resultados (veredicto, matriz,
//   por categoría), la ficha, la model card, puntuar y la fuga en una categoría;
// - agrupar: el plan, la lectura, los perfiles, la tabla de agrupadores, la ficha, la
//   model card, las filas con su grupo y asignar filas nuevas; sin grupos (k = 10);
//   la columna que no sirve como objetivo; más de 8,000 filas con el Nivel 2.
//
// EXTREMOS DE MAGNITUD (regla 22, S6), generados EN MEMORIA (no entran al kit):
// 20 categorías con un nombre de ~60 caracteres; cifras de ~1e-11 en un perfil;
// ventas de cinco cifras (tiendas-ciudades.csv del kit).
//
// PASADA DE INTERACCIÓN (regla 17): cada control que se activa debe cambiar algo en
// el DOM —abrir la ficha, «Ver las otras columnas», «Elegir» y «Volver al ganador»,
// descargar las filas con su grupo, el Nivel 2, cambiar el idioma—; si no cambia,
// es un hallazgo. Además deja en el reporte las CIFRAS que cita la guía v4.
// Las capturas se LEEN como imagen antes de presentar.
//
// Uso: OUT=<carpeta> node scripts/capturas-s7.mjs
// No es un gate de CI (la CI no lee imágenes): es evidencia para la bitácora.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
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
const fail = (message) => {
  failures++;
  report.push(`✗ ${message}`);
};

// ---------- datasets extremos, en memoria (sembrados: iguales en cada corrida) ----------
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

/** 20 categorías (30 filas cada una) y una de ellas con un nombre de ~60 caracteres. */
function twentyClasses() {
  const random = rng(17);
  const LONG = "plan_corporativo_internacional_con_soporte_dedicado_24_7";
  const rows = ["x1,x2,x3,categoria"];
  for (let c = 0; c < 20; c++) {
    const name = c === 7 ? LONG : `clase_${String(c + 1).padStart(2, "0")}`;
    for (let i = 0; i < 30; i++) {
      rows.push(
        [c + random() * 1.5, (c % 5) * 2 + random() * 2, random() * 10, name]
          .map((v, j) => (j < 3 ? Number(v).toFixed(3) : v))
          .join(","),
      );
    }
  }
  return { name: "veinte-clases.csv", long: LONG, csv: rows.join("\n") };
}

/** Tres grupos con cifras diminutas (~1e-11) en una columna: el perfil no puede decir «0». */
function tinyGroups() {
  const random = rng(29);
  const rows = ["concentracion_mol,temperatura_c,lote"];
  for (let i = 0; i < 240; i++) {
    const g = i % 3;
    rows.push(
      [
        ((1 + g * 4 + random()) * 1e-11).toExponential(3),
        (10 + g * 15 + random() * 3).toFixed(2),
        ["a", "b", "c"][g],
      ].join(","),
    );
  }
  return { name: "concentraciones.csv", csv: rows.join("\n") };
}

// ---------- utilidades del arnés ----------
async function session(width, scheme) {
  const ctx = await browser.newContext({
    viewport: { width, height: width < 600 ? 780 : 900 },
    colorScheme: scheme,
    locale: "es-ES",
    acceptDownloads: true,
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fail(`pageerror: ${e.message}`));
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
  report.push(`${ok ? "OK" : "✗ DESBORDA"} ${name}: scrollWidth ${m.sw} ≤ ${m.cw}`);
}

async function element(page, locator, name) {
  await settle(page);
  await locator.screenshot({ path: `${OUT}/${name}.png` });
}

const text = async (locator) => (await locator.innerText()).replace(/\s+/g, " ");

/** Un control debe cambiar el DOM: se compara una lectura antes y después. */
async function interact(label, read, act) {
  const before = await read();
  await act();
  const after = await read();
  if (before === after) fail(`interacción sin efecto: ${label} («${before}»)`);
  else report.push(`OK interacción: ${label}`);
}

async function upload(page, file) {
  await page.goto(BASE);
  const input = page.locator('input[type="file"][accept=".csv,text/csv"]');
  if (typeof file === "string") await input.setInputFiles(KIT(file));
  else
    await input.setInputFiles({
      name: file.name,
      mimeType: "text/csv",
      buffer: Buffer.from(file.csv),
    });
  await page.locator("#target").waitFor();
}

const CLUSTER = { label: "Sin objetivo: agrupar filas parecidas" };
const waitLeague = (page) =>
  page
    .getByRole("heading", { name: /La liga: \d+ modelos/ })
    .waitFor({ timeout: 300_000 });
const waitClusters = (page, count = /\d+/) =>
  page
    .getByRole("region", { name: new RegExp(`Los agrupadores: ${count.source ?? count}`) })
    .waitFor({ timeout: 400_000 });
const verdictCard = (page) =>
  page
    .locator("h1")
    .first()
    .locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");

async function dialogFits(page, tag, name) {
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  const fit = await dialog.evaluate((d) => ({
    h: d.getBoundingClientRect().height,
    vh: window.innerHeight,
  }));
  const ok = fit.h <= fit.vh;
  if (!ok) failures++;
  report.push(`${ok ? "OK" : "✗ NO CABE"} ${tag} ${name}: alto ${Math.round(fit.h)} ≤ ventana ${fit.vh}`);
}

const TWENTY = twentyClasses();
const TINY = tinyGroups();

for (const [width, scheme] of [
  [360, "light"],
  [360, "dark"],
  [1280, "light"],
  [1280, "dark"],
]) {
  const tag = `${width}-${scheme}`;
  const figures = tag === "1280-light";
  const { ctx, page } = await session(width, scheme);

  // ---------- Inicio: siete ejemplos ----------
  await page.goto(BASE);
  await shot(page, `${tag}-01-inicio`);

  // ---------- Varias categorías ----------
  await page.getByRole("button", { name: /Planes de suscripción/ }).click();
  await page.selectOption("#target", "plan");
  await shot(page, `${tag}-02-config-planes`);
  if (figures)
    report.push(`cifra · quién compite (planes): ${await text(page.getByRole("heading", { name: /Nivel 1/ }))}`);
  await page.getByRole("button", { name: /Entrenar modelos/i }).click();
  await waitLeague(page);
  await shot(page, `${tag}-03-resultados-planes`);
  await element(page, verdictCard(page), `${tag}-04-veredicto-planes`);
  const matrix = page.getByRole("region", { name: "Matriz de confusión (prueba)" });
  await element(page, matrix, `${tag}-05-matriz`);
  if (figures) {
    report.push(`cifra · veredicto planes: ${await text(verdictCard(page))}`);
    report.push(`cifra · confusión: ${await text(page.getByText(/La confusión más frecuente/))}`);
  }
  await interact(
    "ficha de la logística balanceada (varias categorías)",
    () => page.getByRole("dialog").count(),
    async () => {
      // La ficha llega con next/dynamic: el diálogo aparece después del clic.
      await page.getByRole("button", { name: "Ficha de Logística balanceada" }).first().click();
      await page.getByRole("dialog").waitFor();
    },
  );
  await dialogFits(page, tag, "ficha logística balanceada");
  await shot(page, `${tag}-06-ficha-planes`, { full: false });
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText("Ver el contenido").click();
  await element(page, page.getByRole("region", { name: /contenido/i }), `${tag}-07-model-card-planes`);
  await page.getByRole("button", { name: /Usar el modelo/i }).click();
  await page.getByText(/Arrastra tu CSV nuevo/).waitFor({ timeout: 120_000 });
  await page.locator('input[type="file"][accept=".csv,text/csv"]').setInputFiles(KIT("planes-suscripcion.csv"));
  await page.getByText(/Predicciones \(200 filas\)/i).waitFor({ timeout: 60_000 });
  await shot(page, `${tag}-08-puntuar-planes`);

  // Extremo: 20 categorías con un nombre largo. La página no se desplaza de lado; la
  // matriz sí, dentro de su recuadro, y el nombre largo va recortado con su título.
  await upload(page, TWENTY);
  await page.selectOption("#target", "categoria");
  await page.getByRole("button", { name: /Entrenar modelos/i }).click();
  await waitLeague(page);
  await shot(page, `${tag}-09-veinte-clases`);
  const box = await page
    .getByRole("region", { name: "Matriz de confusión (prueba)" })
    .evaluate((r) => ({ sw: r.scrollWidth, cw: r.clientWidth }));
  report.push(`${box.sw > box.cw ? "OK" : "· "} ${tag}-09 la matriz de 20 se desplaza en su recuadro: ${box.sw} > ${box.cw}`);
  const titled = await page.locator(`[title="${TWENTY.long}"]`).count();
  if (titled === 0) fail(`${tag}-09 el nombre largo no lleva su título completo`);
  else report.push(`OK ${tag}-09 el nombre largo lleva su título completo (${titled} lugares)`);
  await element(page, page.getByRole("region", { name: "Matriz de confusión (prueba)" }), `${tag}-10-matriz-veinte`);

  // La fuga en una categoría (titular propio).
  if (scheme === "light") {
    await upload(page, "planes-fuga-plantada.csv");
    await page.selectOption("#target", "plan");
    await page.getByRole("button", { name: /Entrenar modelos/i }).click();
    await waitLeague(page);
    await element(page, verdictCard(page), `${tag}-11-veredicto-fuga`);
    const headline = await text(page.locator("h1").first());
    if (!/Posible fuga de datos — sospechoso/.test(headline)) fail(`${tag}-11 titular de la fuga: «${headline}»`);
  }

  // ---------- Agrupar ----------
  await page.goto(BASE);
  await page.getByRole("button", { name: /Segmentos de clientes/ }).click();
  await page.selectOption("#target", CLUSTER);
  await shot(page, `${tag}-12-plan-agrupar`);
  await page.getByRole("button", { name: /Agrupar filas/ }).click();
  await waitClusters(page);
  await shot(page, `${tag}-13-resultados-agrupar`);
  await element(page, verdictCard(page), `${tag}-14-lectura`);
  if (figures) report.push(`cifra · lectura segmentos: ${await text(verdictCard(page))}`);
  const others = page.getByText(/Ver las otras \d+ columnas|Ver la otra columna/).first();
  await interact(
    "«Ver las otras columnas» abre su detalle",
    () => others.locator("xpath=..").getAttribute("open"),
    () => others.click(),
  );
  await element(page, page.getByRole("region", { name: /Los agrupadores: \d/ }), `${tag}-15-tabla-agrupadores`);
  await interact(
    "«Elegir» GMM pasa la lectura a «Elegido por ti»",
    () => page.getByText(/◆ Elegido por ti/).count(),
    async () => {
      await page
        .getByRole("region", { name: /Los agrupadores: \d/ })
        .getByRole("row")
        .filter({ hasText: "GMM" })
        .getByRole("button", { name: /Elegir/ })
        .click();
      await page.getByText(/◆ Elegido por ti/).first().waitFor({ timeout: 120_000 });
    },
  );
  await shot(page, `${tag}-16-elegido-gmm`);
  await interact(
    "«Volver al ganador»",
    () => page.getByText(/◆ Elegido por ti/).count(),
    async () => {
      await page.getByRole("button", { name: /Volver al ganador/ }).first().click();
      await page.getByText(/◆ Elegido por ti/).first().waitFor({ state: "detached", timeout: 120_000 });
    },
  );
  await interact(
    "ficha del ganador por consenso",
    () => page.getByRole("dialog").count(),
    async () => {
      await page
        .getByRole("region", { name: /Los agrupadores: \d/ })
        .getByRole("row")
        .filter({ hasText: /Ganador por/ })
        .getByRole("button", { name: /^Ficha de / })
        .click();
      await page.getByRole("dialog").waitFor();
    },
  );
  await dialogFits(page, tag, "ficha del jerárquico");
  await shot(page, `${tag}-17-ficha-jerarquico`, { full: false });
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Descargar filas con su grupo/ }).click();
  const labels = readFileSync(await (await download).path(), "utf8").trim().split("\n");
  if (!labels[0].startsWith("cliente_id,") || !labels[0].endsWith(",grupo"))
    fail(`${tag} filas con su grupo: cabecera «${labels[0]}»`);
  else report.push(`OK interacción: filas con su grupo (${labels.length - 1} filas, «${labels[0]}»)`);
  await page.getByText("Ver el contenido").click();
  await element(page, page.getByRole("region", { name: /contenido/i }), `${tag}-18-model-card-agrupar`);
  await page.getByRole("button", { name: /Asignar filas nuevas/ }).first().click();
  await page.getByText(/Arrastra tu CSV nuevo/).waitFor({ timeout: 120_000 });
  await page.locator('input[type="file"][accept=".csv,text/csv"]').setInputFiles(KIT("segmentos-clientes.csv"));
  await page.getByText(/Grupos asignados/).waitFor({ timeout: 60_000 });
  await shot(page, `${tag}-19-asignar`);

  // El idioma: la lectura cambia de verdad (regla 17), y vuelve.
  if (width === 1280) {
    await page.getByRole("button", { name: /Volver a los resultados/ }).first().click();
    await waitClusters(page);
    await interact(
      "cambiar a English traduce la lectura",
      () => text(page.locator("h1").first()),
      () => page.getByRole("button", { name: "English" }).click(),
    );
    await shot(page, `${tag}-20-agrupar-en`);
    await page.getByRole("button", { name: "Español" }).click();
  }

  // Sin grupos: k = 10 tarjetas de grupo.
  await upload(page, "sin-grupos.csv");
  await page.selectOption("#target", CLUSTER);
  await page.getByRole("button", { name: /Agrupar filas/ }).click();
  await waitClusters(page);
  await shot(page, `${tag}-21-sin-grupos`);
  const groupCards = await page.getByRole("heading", { name: /^Grupo \d+$/ }).count();
  report.push(`${groupCards === 10 ? "OK" : "· "} ${tag}-21 sin grupos: ${groupCards} tarjetas de grupo`);

  // Extremo: cifras de ~1e-11 en un perfil (nunca «0»).
  await upload(page, TINY);
  await page.selectOption("#target", CLUSTER);
  await page.getByRole("button", { name: /Agrupar filas/ }).click();
  await waitClusters(page);
  await shot(page, `${tag}-22-cifras-diminutas`);
  const tiny = await text(page.getByText(/«concentracion_mol»:/).first());
  if (!/e-1[01]/.test(tiny)) fail(`${tag}-22 la cifra diminuta no va en notación científica: «${tiny}»`);
  else report.push(`OK ${tag}-22 cifra diminuta: «${tiny}»`);

  if (scheme === "light") {
    // Una columna que no sirve como objetivo → agrupar en su lugar (M3).
    await upload(page, "tiendas-ciudades.csv");
    await page.selectOption("#target", "ciudad");
    await shot(page, `${tag}-23-ciudad-no-sirve`);
    await interact(
      "«Agrupar filas parecidas en su lugar»",
      () => page.getByRole("heading", { name: "Agrupar filas parecidas, sin objetivo" }).count(),
      () => page.getByRole("button", { name: /Agrupar filas parecidas en su lugar/ }).click(),
    );
    await shot(page, `${tag}-24-ciudad-agrupar`);
    await page.getByRole("button", { name: /Agrupar filas/ }).click();
    await waitClusters(page);
    await shot(page, `${tag}-25-tiendas-resultados`);

    // Más de 8,000 filas: la nota antes de correr, sin consenso en el Nivel 1, y la
    // nota junto a la lectura y en la fila tras el Nivel 2.
    await upload(page, "segmentos-grande.csv");
    await page.selectOption("#target", CLUSTER);
    await shot(page, `${tag}-26-grande-plan`);
    await page.getByRole("button", { name: /Agrupar filas/ }).click();
    await waitClusters(page);
    await shot(page, `${tag}-27-grande-nivel1`);
    if (figures)
      report.push(`cifra · grande nivel 1: ${await text(page.getByText(/consenso/).first())}`);
    await interact(
      "«Correr el Nivel 2» suma el jerárquico",
      () => text(page.getByRole("heading", { name: /Los agrupadores: \d/ })),
      async () => {
        await page.getByRole("button", { name: /Correr el Nivel 2/ }).click();
        await waitClusters(page, /4/);
      },
    );
    await shot(page, `${tag}-28-grande-nivel2`);
    const sampleNotes = await page.getByText(/Ajustado sobre una muestra de 8,000 de tus 9,000 filas/).count();
    if (sampleNotes < 2) fail(`${tag}-28 la nota de la muestra aparece ${sampleNotes} vez/veces (se esperan junto a la lectura y en la fila)`);
    else report.push(`OK ${tag}-28 la nota de la muestra aparece ${sampleNotes} veces`);
  }
  await ctx.close();
}

// La guía v4 (documento autocontenido): que se lea en móvil y escritorio, y el ⭐⭐ corto.
for (const [width, scheme] of [
  [360, "light"],
  [1280, "dark"],
]) {
  const { ctx, page } = await session(width, scheme);
  await page.goto(GUIA);
  await shot(page, `guia-${width}-${scheme}`);
  await page.getByRole("button", { name: "⭐⭐ corto" }).click();
  await shot(page, `guia-${width}-${scheme}-corto`, { full: false });
  report.push(`guía ${width}-${scheme}: ${await page.locator("#contador").innerText()} con el filtro ⭐⭐ corto`);
  await ctx.close();
}

await browser.close();
console.log(report.join("\n"));
if (failures > 0) {
  console.log(`✗ ${failures} hallazgo(s)`);
  process.exit(1);
}
