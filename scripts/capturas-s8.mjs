// Pasada de capturas del S8 (contrapeso del cierre — regla 12 y /deploy-check): el build de
// producción en :3000 (`pnpm build && pnpm start`), 360 px y 1280 px, tema claro y oscuro,
// SOLO en español (el otro idioma va al cierre del hito, regla 20). Cada encuadre MIDE
// scrollWidth ≤ clientWidth (sin desplazamiento lateral de la página).
//
// Recorre /protocolo: la puerta en la portada, el modo vacío, las etapas 1–3 con sus
// trampas calculadas en los datos, el cuaderno y el glosario.
//
// EXTREMOS DE MAGNITUD (regla 22, S6), generados EN MEMORIA (no entran al kit): un nombre de
// columna de ~110 caracteres, una clase de ~60, costos de ~1e-11 y de ~1e9 (el umbral tiende a
// 0 y no debe leerse «0.00»), y cinco opciones de decisión con costos de seis cifras.
//
// PASADA DE INTERACCIÓN (regla 17): cada control que se activa debe cambiar algo en el DOM —la
// puerta de la portada, elegir la forma de la decisión, registrar una etapa, «Corregir», el
// enlace de un término al glosario, «Empezar otro cuaderno», cambiar el idioma—; si no cambia,
// es un hallazgo.
// Las capturas se LEEN como imagen antes de presentar.
//
// Uso: OUT=<carpeta> node scripts/capturas-s8.mjs
// No es un gate de CI (la CI no lee imágenes): es evidencia para la bitácora.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const OUT = process.env.OUT;
if (!OUT) throw new Error("OUT=<carpeta> es obligatorio");
mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:3000";
const KIT = (file) => resolve("docs/kit-de-prueba", file);

const report = [];
let failures = 0;
let shots = 0;
let interactions = 0;
const fail = (message) => {
  failures++;
  report.push(`✗ ${message}`);
};

// ---------- datos extremos, en memoria ----------
const LARGA =
  "identificador_unico_del_cliente_en_el_sistema_de_facturacion_heredado_de_la_migracion_del_ano_pasado_v2";
const CLASE_LARGA = "plan_corporativo_internacional_con_soporte_dedicado_24_7";
function extremo() {
  const filas = [`${LARGA},mes,plan,gasto,renovo`];
  for (let i = 0; i < 90; i++) {
    const cliente = `K${String(Math.floor(i / 3) + 1).padStart(3, "0")}`;
    const mes = `2025-${String((i % 12) + 1).padStart(2, "0")}-01`;
    const plan = i % 7 === 0 ? CLASE_LARGA : i % 2 ? "basico" : "premium";
    filas.push(
      `${cliente},${mes},${plan},${((i * 37) % 900) + 100},${i % 5 === 0 ? "si" : "no"}`,
    );
  }
  return filas.join("\n") + "\n";
}

const browser = await chromium.launch();

async function overflow(page, label) {
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  if (m.sw > m.cw)
    fail(`${label}: la página se desplaza de lado (${m.sw} > ${m.cw})`);
}

/**
 * Un encuadre. `en` es el recuadro que se captura (la tarjeta de una etapa, el cuaderno): una
 * página entera de ~9,000 px no se puede LEER como imagen. El desborde lateral se mide siempre
 * sobre la página completa.
 */
async function shot(page, name, label, { full = true, en = null } = {}) {
  await page.mouse.move(0, 0);
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running"),
  );
  await overflow(page, label);
  const destino = resolve(OUT, `${name}.png`);
  if (en) await page.locator(en).first().screenshot({ path: destino });
  else await page.screenshot({ path: destino, fullPage: full });
  shots++;
}

/** Algo cambió en el DOM tras activar un control (regla 17). */
async function changed(page, label, action) {
  const before = await page.evaluate(
    () =>
      document.body.innerText.length + document.querySelectorAll("*").length,
  );
  await action();
  await page.waitForTimeout(150);
  const after = await page.evaluate(
    () =>
      document.body.innerText.length + document.querySelectorAll("*").length,
  );
  interactions++;
  if (before === after) fail(`interacción sin efecto: ${label}`);
}

async function etapa1(page, { costos = ["10", "50"], unidad = "US$" } = {}) {
  const e1 = page.locator("#etapa-1");
  await e1
    .getByLabel("La decisión", { exact: true })
    .fill("Llamar o no al cliente antes de que venza su plan");
  await e1
    .getByLabel("Quién la toma", { exact: true })
    .fill("Jefa de retención");
  await e1.getByLabel("Sí o no (actuar o no actuar)").check();
  await e1.getByLabel("Unidad de costo", { exact: true }).fill(unidad);
  await e1.getByLabel(/Costo de actuar sin que hiciera falta/).fill(costos[0]);
  await e1
    .getByLabel(/Costo de no actuar y que sí hiciera falta/)
    .fill(costos[1]);
}

for (const [width, height, nombre] of [
  [360, 800, "360"],
  [1280, 900, "1280"],
]) {
  for (const scheme of ["light", "dark"]) {
    const tag = `${nombre}-${scheme}`;
    const context = await browser.newContext({
      viewport: { width, height },
      colorScheme: scheme,
      locale: "es-ES",
      acceptDownloads: true,
    });
    const page = await context.newPage();
    page.on("pageerror", (error) =>
      fail(`${tag}: error de página: ${error.message}`),
    );

    // ---- la puerta, en la portada ----
    await page.goto(BASE);
    await page.getByText("Empieza tu experimento").waitFor();
    await shot(page, `${tag}-01-portada`, `${tag} portada`);
    await changed(page, `${tag} puerta del Protocolo`, async () => {
      await page.getByRole("link", { name: "Abrir el Protocolo DS" }).click();
      await page.waitForURL(/\/protocolo$/);
      await page
        .getByText("Abriendo tu cuaderno…")
        .waitFor({ state: "hidden" });
    });
    await shot(page, `${tag}-02-vacio`, `${tag} modo vacío`, { full: false });

    // ---- etapa 1 ----
    await changed(page, `${tag} elegir la forma de la decisión`, async () => {
      await page
        .locator("#etapa-1")
        .getByLabel("Sí o no (actuar o no actuar)")
        .check();
    });
    await etapa1(page);
    await shot(page, `${tag}-03-etapa1`, `${tag} etapa 1 con trampa`, {
      en: "#etapa-1",
    });
    await changed(page, `${tag} registrar la etapa 1`, async () => {
      await page
        .locator("#etapa-1")
        .getByRole("button", { name: "Registrar la etapa 1" })
        .click();
    });

    // ---- etapa 2 ----
    await page
      .getByTestId("protocolo-csv")
      .setInputFiles(KIT("renovaciones-mensuales.csv"));
    await page.getByTestId("protocolo-datos").waitFor();
    const e2 = page.locator("#etapa-2");
    await e2
      .getByLabel("Columna objetivo", { exact: true })
      .selectOption("renovo");
    await e2.getByLabel(/Valor que significa/).selectOption("si");
    await e2.getByLabel(/Una columna identifica la unidad/).check();
    await e2
      .getByLabel("Columna que identifica la unidad", { exact: true })
      .selectOption("cliente_id");
    await e2
      .getByLabel("Columna de fecha", { exact: true })
      .selectOption("mes_observado");
    await shot(page, `${tag}-04-etapa2`, `${tag} etapa 2 con trampas`, {
      en: "#etapa-2",
    });
    await changed(page, `${tag} registrar la etapa 2`, async () => {
      await e2.getByRole("button", { name: "Registrar la etapa 2" }).click();
    });

    // ---- etapa 3 ----
    const e3 = page.locator("#etapa-3");
    await e3.getByLabel("Predecir lo que va a pasar").check();
    await e3.getByLabel("Población").fill("Clientes con un plan activo");
    await e3.getByLabel("Exclusiones").fill("Cuentas de prueba");
    await e3.getByLabel("Tu aviso").fill("Es un piloto de un trimestre; lo sé");
    await shot(
      page,
      `${tag}-05-etapa3`,
      `${tag} etapa 3 con la muestra corta`,
      { en: "#etapa-3" },
    );
    await changed(page, `${tag} registrar la etapa 3`, async () => {
      await e3.getByRole("button", { name: "Registrar la etapa 3" }).click();
    });

    // ---- el cuaderno, corregir, glosario ----
    await page
      .getByTestId("cuaderno-guardado")
      .filter({ hasText: "Guardado" })
      .waitFor();
    await shot(
      page,
      `${tag}-06-cuaderno`,
      `${tag} etapas 1–3 cumplidas y cuaderno`,
      { en: 'section[aria-labelledby="cuaderno-titulo"]' },
    );
    await changed(page, `${tag} «Corregir» la etapa 1`, async () => {
      await page
        .locator("#etapa-1")
        .getByRole("button", { name: "Corregir" })
        .click();
    });
    await shot(page, `${tag}-07-corregir`, `${tag} corregir la etapa 1`, {
      en: "#etapa-1",
    });
    {
      // Un enlace a un ancla no cambia el tamaño del DOM: se comprueba que la página se movió.
      const antes = await page.evaluate(() => window.scrollY);
      await page
        .locator("#etapa-1")
        .getByRole("link", { name: "Umbral", exact: true })
        .click();
      await page.waitForTimeout(150);
      const despues = await page.evaluate(() => window.scrollY);
      interactions++;
      if (antes === despues || !page.url().endsWith("#termino-umbral"))
        fail(`${tag}: el término no llevó al glosario`);
    }
    await shot(page, `${tag}-08-glosario`, `${tag} glosario`, { full: false });
    await changed(page, `${tag} empezar otro cuaderno`, async () => {
      await page.getByRole("button", { name: "Empezar otro cuaderno" }).click();
    });
    await shot(page, `${tag}-09-confirmar`, `${tag} confirmar cuaderno nuevo`, {
      full: false,
    });
    await page.getByRole("button", { name: "Cancelar" }).click();

    // ---- «explicar una causa» detiene ----
    await page
      .locator("#etapa-3")
      .getByRole("button", { name: "Corregir" })
      .click();
    await changed(page, `${tag} «explicar una causa»`, async () => {
      await page
        .locator("#etapa-3")
        .getByLabel("Explicar una causa (qué provoca qué)")
        .check();
      await page
        .locator("#etapa-3")
        .getByRole("button", { name: "Registrar la etapa 3" })
        .click();
    });
    await shot(page, `${tag}-10-detenida`, `${tag} etapa 3 detenida`, {
      en: "#etapa-3",
    });

    // ---- cambiar el idioma ----
    await changed(page, `${tag} cambiar a inglés`, async () => {
      await page
        .getByRole("button", { name: /English|EN/i })
        .first()
        .click();
    });
    await shot(
      page,
      `${tag}-11-english`,
      `${tag} en inglés (muestra del segundo idioma)`,
      { full: false },
    );
    await page
      .getByRole("button", { name: /Español|ES/i })
      .first()
      .click();

    // ---- EXTREMOS: nombres largos, costos de ~1e-11 y ~1e9 ----
    await page.evaluate(() => indexedDB.deleteDatabase("probeta-protocolo"));
    await page.goto(`${BASE}/protocolo`);
    await page.getByText("Abriendo tu cuaderno…").waitFor({ state: "hidden" });
    await etapa1(page, {
      costos: ["0.00000000001", "1000000000"],
      unidad: "dólares estadounidenses de 2025",
    });
    await shot(
      page,
      `${tag}-12-extremo-etapa1`,
      `${tag} extremo: costos de 1e-11 y 1e9`,
      { en: "#etapa-1" },
    );
    const umbral = await page.getByTestId("protocolo-umbral").innerText();
    if (/:\s*0\.00$/.test(umbral))
      fail(`${tag}: el umbral diminuto se lee «0.00»: ${umbral}`);
    await page
      .locator("#etapa-1")
      .getByRole("button", { name: "Registrar la etapa 1" })
      .click();
    await page.getByTestId("protocolo-csv").setInputFiles({
      name: "extremo.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(extremo()),
    });
    await page.getByTestId("protocolo-datos").waitFor();
    const x2 = page.locator("#etapa-2");
    await x2
      .getByLabel("Columna objetivo", { exact: true })
      .selectOption("renovo");
    await x2.getByLabel(/Valor que significa/).selectOption("si");
    await x2.getByLabel(/Una columna identifica la unidad/).check();
    await x2
      .getByLabel("Columna que identifica la unidad", { exact: true })
      .selectOption(LARGA);
    await x2
      .getByLabel("Columna de fecha", { exact: true })
      .selectOption("mes");
    await shot(
      page,
      `${tag}-13-extremo-etapa2`,
      `${tag} extremo: columna de 110 caracteres`,
      { en: "#etapa-2" },
    );
    await x2.getByRole("button", { name: "Registrar la etapa 2" }).click();
    await page
      .getByTestId("cuaderno-guardado")
      .filter({ hasText: "Guardado" })
      .waitFor();
    await shot(
      page,
      `${tag}-14-extremo-cuaderno`,
      `${tag} extremo: cuaderno con nombres largos`,
      { en: 'section[aria-labelledby="cuaderno-titulo"]' },
    );

    await context.close();
  }
}
await browser.close();

report.unshift(
  `encuadres: ${shots} · interacciones activadas: ${interactions} · fallas: ${failures}`,
);
writeFileSync(resolve(OUT, "reporte.txt"), report.join("\n") + "\n");
console.log(report.join("\n"));
process.exit(failures === 0 ? 0 : 1);
