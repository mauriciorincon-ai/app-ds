// Pasada de capturas del S11 (contrapeso del cierre — regla 12 y /deploy-check): el build de
// producción servido en un puerto propio (`BASE=http://localhost:3300`: el 3000 lo comparten otras
// sesiones), 360 px y 1280 px, tema claro y oscuro, SOLO en español (el otro idioma va al cierre del
// hito, regla 20). Cada encuadre MIDE scrollWidth ≤ clientWidth.
//
// Recorre la etapa 6 del Protocolo con el kit: credito-fuga-plantada.csv (estratificada sugerida, el
// tamaño cambiado y vuelto, el registro y el cuaderno) y bajas-con-fuga.csv (la pregunta de unidades,
// tiempo y grupo con un mes de hueco, otro esquema con su razón, el registro y el cuaderno).
//
// EXTREMOS DE MAGNITUD (regla 22), generados EN MEMORIA (no entran al kit): 20 000 filas (cifras con
// separador de miles en la tabla) y una columna de unidad con un nombre de ~105 caracteres, que sale
// en el porqué de la sugerencia «por grupo».
//
// PASADA DE INTERACCIÓN (regla 22): cada control que se activa debe cambiar algo; si no cambia, es un
// hallazgo. Las capturas se LEEN como imagen.
//
// Uso: OUT=<carpeta> BASE=http://localhost:3300 node scripts/capturas-s11.mjs
// No es un gate de CI (la CI no lee imágenes): es evidencia para el cierre.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const OUT = process.env.OUT;
if (!OUT) throw new Error("OUT=<carpeta> es obligatorio");
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE ?? "http://localhost:3300";
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
  "identificador_de_la_sucursal_que_atiende_a_la_persona_segun_el_registro_central_del_banco_version_dos";
function extremo() {
  const filas = [[LARGA, "monto", "y"].join(",")];
  for (let i = 0; i < 20_000; i++)
    filas.push(
      [
        `S${i % 4000}`,
        String(((i * 37) % 9100) + 100),
        (i * 11) % 7 < 2 ? "si" : "no",
      ].join(","),
    );
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

const firma = (page) =>
  page.evaluate(() =>
    JSON.stringify([
      document.body.innerText.length,
      document.querySelectorAll("*").length,
      [...document.querySelectorAll("input")]
        .map((i) => (i.type === "file" ? "" : i.checked ? 1 : i.value))
        .join("|"),
      [...document.querySelectorAll("select")].map((s) => s.value).join("|"),
      [...document.querySelectorAll("button")]
        .map((b) => (b.disabled ? 1 : 0))
        .join(""),
      document.activeElement?.tagName ?? "",
    ]),
  );

async function changed(page, label, action) {
  const before = await firma(page);
  await action();
  await page.waitForTimeout(200);
  const after = await firma(page);
  interactions++;
  if (before === after) fail(`interacción sin efecto: ${label}`);
}

async function etapa1(page) {
  const e1 = page.locator("#etapa-1");
  await e1
    .getByLabel("La decisión", { exact: true })
    .fill("Aprobar o no un crédito antes de que venza la oferta");
  await e1.getByLabel("Quién la toma", { exact: true }).fill("Jefa de riesgo");
  await e1
    .getByLabel("Qué se hace hoy")
    .fill("Se aprueba a quien gana más de 3000");
  await e1.getByLabel("Sí o no (actuar o no actuar)").check();
  await e1.getByLabel("Unidad de costo", { exact: true }).fill("US$");
  await e1.getByLabel(/Costo de actuar sin que hiciera falta/).fill("10");
  await e1.getByLabel(/Costo de no actuar y que sí hiciera falta/).fill("50");
  await e1.getByRole("button", { name: "Registrar la etapa 1" }).click();
  await e1.getByText("Cumplida").waitFor();
}

async function etapa2(
  page,
  objetivo,
  positivo,
  { unidad = null, fecha = null } = {},
) {
  const e2 = page.locator("#etapa-2");
  await e2
    .getByLabel("Columna objetivo", { exact: true })
    .selectOption(objetivo);
  await e2.getByLabel(/Valor que significa/).selectOption(positivo);
  if (unidad) {
    await e2.getByLabel(/Una columna identifica la unidad/).check();
    await e2
      .getByLabel("Columna que identifica la unidad")
      .selectOption(unidad);
  }
  if (fecha)
    await e2
      .getByLabel("Columna de fecha", { exact: true })
      .selectOption(fecha);
  else {
    await e2.getByLabel("No hay columna: lo escribo").check();
    await e2
      .getByLabel("El momento, escrito")
      .fill("El día que se pide el crédito");
  }
  await e2.getByRole("button", { name: "Registrar la etapa 2" }).click();
  await e2.getByText("Cumplida").waitFor();
}

async function etapa3(page) {
  const e3 = page.locator("#etapa-3");
  await e3.getByLabel("Predecir lo que va a pasar").check();
  await e3.getByLabel("Población").fill("Solicitantes del archivo");
  await e3.getByLabel("Exclusiones").fill("Ninguna");
  // con una columna de fecha, el periodo sale de ella
  if ((await e3.getByLabel("Periodo", { exact: true }).count()) > 0)
    await e3.getByLabel("Periodo", { exact: true }).fill("2025");
  if ((await e3.getByLabel("Tu aviso").count()) > 0)
    await e3.getByLabel("Tu aviso").fill("Es un piloto; lo sé");
  await e3.getByRole("button", { name: "Registrar la etapa 3" }).click();
  await e3.getByText("Cumplida").waitFor();
}

const DESPUES = "Después de decidir (o del resultado)";

/** Etapa 4 con apuesta «ninguna»: lo que alerta se responde una por una, lo demás va en bloque. */
async function etapa4(page, { fuga = [] } = {}) {
  const e4 = page.locator("#etapa-4");
  await e4.getByLabel("Ninguna", { exact: true }).check();
  await e4.getByTestId("protocolo-revelar").click();
  await e4.getByTestId("protocolo-hallazgo-comparacion").waitFor();
  for (const columna of fuga) {
    const fila = e4.locator(`[data-columna="${columna}"]`);
    await fila
      .getByLabel(/Quién o qué la produce/)
      .fill("Lo registra cobranza");
    await fila.getByLabel(DESPUES).check();
  }
  await e4.getByTestId("protocolo-bloque-declaro").check();
  await e4.getByTestId("protocolo-bloque-aplicar").click();
  // lo que alertó y no es fuga (un identificador, p. ej.) se excluye
  for (const fila of await e4.locator("[data-columna]").all()) {
    const estado = fila.getByLabel("¿La usas?");
    if ((await estado.count()) > 0 && (await estado.inputValue()) === "")
      await estado.selectOption("excluir");
  }
  await e4.getByRole("button", { name: "Registrar la etapa 4" }).click();
  await e4.getByText("Cumplida").waitFor();
}

async function nuevoCuaderno(page) {
  await page.evaluate(() => {
    window.sessionStorage.clear();
    return indexedDB.deleteDatabase("probeta-protocolo");
  });
  await page.goto(`${BASE}/protocolo`);
  await page.getByText("Abriendo tu cuaderno…").waitFor({ state: "hidden" });
}

async function cargar(page, archivoOBuffer) {
  await page.getByTestId("protocolo-csv").setInputFiles(archivoOBuffer);
  await page.getByTestId("protocolo-datos").waitFor();
}

/** Etapa 5: «no hay regla de hoy». */
async function etapa5(page) {
  const e5 = page.locator("#etapa-5");
  await e5.getByLabel("No, hoy no hay regla").check();
  await e5.getByRole("button", { name: "Registrar la etapa 5" }).click();
  await e5.getByText("Cumplida").waitFor();
}

const CUADERNO = 'section[aria-labelledby="cuaderno-titulo"]';

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
    const e6 = page.locator("#etapa-6");

    // ================= credito-fuga-plantada.csv: estratificada =================
    await page.goto(`${BASE}/protocolo`);
    await page.getByText("Abriendo tu cuaderno…").waitFor({ state: "hidden" });
    await nuevoCuaderno(page);
    await etapa1(page);
    await cargar(page, KIT("credito-fuga-plantada.csv"));
    await etapa2(page, "incumplio", "1");
    await etapa3(page);
    await etapa4(page, { fuga: ["monto_recuperado"] });
    await etapa5(page);
    await e6.getByTestId("protocolo-particion").waitFor();
    await shot(
      page,
      `${tag}-01-credito`,
      `${tag} crédito: estratificada sugerida`,
      {
        en: "#etapa-6",
      },
    );
    const tamano = e6.getByLabel("Tamaño de la prueba (de cada 100 filas)");
    await changed(page, `${tag} tamaño 30`, async () => {
      await tamano.fill("30");
    });
    await changed(page, `${tag} tamaño ilegible «1,500»`, async () => {
      await tamano.fill("1,500");
    });
    await shot(
      page,
      `${tag}-02-tamano-ilegible`,
      `${tag} un tamaño que no se lee`,
      {
        en: "#etapa-6",
      },
    );
    await changed(page, `${tag} tamaño 20 otra vez`, async () => {
      await tamano.fill("20");
    });
    await changed(page, `${tag} registrar (sellar)`, async () => {
      await e6.getByRole("button", { name: "Registrar la etapa 6" }).click();
      await e6.getByText("Cumplida").waitFor();
    });
    if (
      !(await page
        .locator("#etapa-6-titulo")
        .evaluate((el) => el === document.activeElement))
    )
      fail(`${tag}: el foco no pasó al título de la etapa 6`);
    await shot(page, `${tag}-03-credito-sellada`, `${tag} crédito sellado`, {
      en: "#etapa-6",
    });
    await shot(
      page,
      `${tag}-04-credito-cuaderno`,
      `${tag} el cuaderno con el sello`,
      {
        en: CUADERNO,
      },
    );
    {
      const antes = await page.evaluate(() => window.scrollY);
      await e6
        .getByRole("link", { name: "Prueba sellada", exact: true })
        .click();
      await page.waitForTimeout(150);
      const despues = await page.evaluate(() => window.scrollY);
      interactions++;
      if (antes === despues || !page.url().endsWith("#termino-prueba-sellada"))
        fail(`${tag}: el término «Prueba sellada» no llevó al glosario`);
    }

    // ================= bajas-con-fuga.csv: unidades nuevas, hueco, otro esquema =================
    await nuevoCuaderno(page);
    await etapa1(page);
    await cargar(page, KIT("bajas-con-fuga.csv"));
    await etapa2(page, "se_dio_de_baja", "si", {
      unidad: "cliente_id",
      fecha: "mes_observado",
    });
    await etapa3(page);
    await etapa4(page, { fuga: ["motivo_baja"] });
    await etapa5(page);
    await shot(
      page,
      `${tag}-05-bajas-pregunta`,
      `${tag} bajas: la pregunta de unidades`,
      {
        en: "#etapa-6",
      },
    );
    await changed(page, `${tag} «unidades nuevas»`, async () => {
      await e6.getByLabel("Con unidades nuevas, que el modelo no vio").check();
    });
    await changed(page, `${tag} horizonte 1`, async () => {
      await e6
        .getByLabel("Horizonte: cuánto tarda en conocerse el resultado")
        .fill("1");
    });
    await changed(page, `${tag} horizonte en meses`, async () => {
      await e6.getByLabel("Unidad del horizonte").selectOption("meses");
    });
    await e6.locator('tr[data-lado="hueco"]').waitFor();
    await shot(
      page,
      `${tag}-06-bajas-tiempo-grupo`,
      `${tag} bajas: tiempo y grupo con hueco`,
      {
        en: "#etapa-6",
      },
    );
    await changed(page, `${tag} otro esquema: estratificada`, async () => {
      await e6.getByLabel("Estratificada", { exact: true }).check();
    });
    await changed(page, `${tag} escribir la razón`, async () => {
      await e6
        .getByLabel("¿Por qué eliges otro esquema que el sugerido?")
        .fill("Quiero ver primero una partición al azar para comparar");
    });
    await shot(
      page,
      `${tag}-07-bajas-otro-esquema`,
      `${tag} bajas: otro esquema con su razón`,
      {
        en: "#etapa-6",
      },
    );
    await changed(page, `${tag} «las mismas unidades»`, async () => {
      await e6
        .getByLabel("Con las mismas unidades, más adelante en el tiempo")
        .check();
      await e6.getByLabel("Por tiempo · sugerido").check();
    });
    await changed(page, `${tag} registrar bajas`, async () => {
      await e6.getByRole("button", { name: "Registrar la etapa 6" }).click();
      await e6.getByText("Cumplida").waitFor();
    });
    await shot(page, `${tag}-08-bajas-sellada`, `${tag} bajas sellado`, {
      en: "#etapa-6",
    });
    await shot(page, `${tag}-09-bajas-cuaderno`, `${tag} bajas: el cuaderno`, {
      en: CUADERNO,
    });

    // ================= extremo: 20 000 filas, unidad con nombre largo =================
    await nuevoCuaderno(page);
    await etapa1(page);
    await cargar(page, {
      name: "extremo.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(extremo()),
    });
    await etapa2(page, "y", "si", { unidad: LARGA });
    await etapa3(page);
    await etapa4(page);
    await etapa5(page);
    await e6.getByTestId("protocolo-particion").waitFor();
    await shot(
      page,
      `${tag}-10-extremo`,
      `${tag} extremo: 20 000 filas y una unidad de ${LARGA.length} caracteres`,
      { en: "#etapa-6" },
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
