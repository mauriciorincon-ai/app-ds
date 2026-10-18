// Pasada de capturas del S10 (contrapeso del cierre — regla 12 y /deploy-check): el build de
// producción servido en un puerto propio (`BASE=http://localhost:3300`, ver el cierre del S9: el
// 3000 lo comparten otras sesiones), 360 px y 1280 px, tema claro y oscuro, SOLO en español
// (el otro idioma va al cierre del hito, regla 20). Cada encuadre MIDE scrollWidth ≤ clientWidth.
//
// Recorre la etapa 5 del Protocolo con el kit (credito-fuga-plantada.csv): la tabla de referencias
// rotulada, la pregunta «¿hay una regla?» (los RADIOS EN TEMA OSCURO, criterio de D1 del S9), la
// regla de hoy con una y con dos condiciones, «no hay regla», el registro y el cuaderno.
//
// EXTREMOS DE MAGNITUD (regla 22), generados EN MEMORIA (no entran al kit): una columna de ~110
// caracteres, un valor de texto de 100 caracteres, y una regla con los dos.
//
// PASADA DE INTERACCIÓN (regla 22): cada control que se activa debe cambiar algo —el DOM, una casilla,
// un valor, un botón que se enciende—; si no cambia, es un hallazgo. Las capturas se LEEN como imagen.
//
// Uso: OUT=<carpeta> BASE=http://localhost:3300 node scripts/capturas-s10.mjs
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
  "ingreso_mensual_declarado_por_la_persona_en_la_solicitud_de_credito_antes_de_la_verificacion_del_banco_v2";
const VALOR_LARGO =
  "trabajador independiente sin contrato formal ni cotizacion y con ingresos variables segun la temporada alta".slice(
    0,
    100,
  );
function extremo() {
  const filas = [["id_fila", LARGA, "ocupacion", "y"].join(",")];
  for (let i = 0; i < 120; i++) {
    filas.push(
      [
        `F${i}`,
        String(((i * 37) % 91) + 10),
        i % 4 === 0 ? VALOR_LARGO : i % 4 === 1 ? "empleado" : "estudiante",
        (i * 11) % 7 < 2 ? "si" : "no",
      ].join(","),
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

async function etapa2(page, objetivo, positivo) {
  const e2 = page.locator("#etapa-2");
  await e2
    .getByLabel("Columna objetivo", { exact: true })
    .selectOption(objetivo);
  await e2.getByLabel(/Valor que significa/).selectOption(positivo);
  await e2.getByLabel("No hay columna: lo escribo").check();
  await e2
    .getByLabel("El momento, escrito")
    .fill("El día que se pide el crédito");
  await e2.getByRole("button", { name: "Registrar la etapa 2" }).click();
  await e2.getByText("Cumplida").waitFor();
}

async function etapa3(page) {
  const e3 = page.locator("#etapa-3");
  await e3.getByLabel("Predecir lo que va a pasar").check();
  await e3.getByLabel("Población").fill("Solicitantes del archivo");
  await e3.getByLabel("Exclusiones").fill("Ninguna");
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

    // ================= credito-fuga-plantada.csv =================
    await page.goto(`${BASE}/protocolo`);
    await page.getByText("Abriendo tu cuaderno…").waitFor({ state: "hidden" });
    await nuevoCuaderno(page);
    await etapa1(page);
    await cargar(page, KIT("credito-fuga-plantada.csv"));
    await etapa2(page, "incumplio", "1");
    await etapa3(page);
    await etapa4(page, { fuga: ["monto_recuperado"] });
    const e5 = page.locator("#etapa-5");

    await shot(
      page,
      `${tag}-01-referencias`,
      `${tag} lo que se logra sin modelo`,
      {
        en: "#etapa-5",
      },
    );
    await changed(page, `${tag} «Sí, hay una regla»`, async () => {
      await e5.getByLabel("Sí, hay una regla que se aplica hoy").check();
    });
    // los radios, leídos como imagen en los dos temas (criterio de D1)
    await shot(page, `${tag}-02-radios`, `${tag} los radios de la regla`, {
      en: '#etapa-5 fieldset:has(input[type="radio"])',
    });
    const c0 = e5.locator('[data-condicion="0"]');
    await changed(page, `${tag} elegir la columna`, async () => {
      await c0.getByLabel("Columna").selectOption("ingreso_mensual");
    });
    await changed(page, `${tag} cambiar el operador`, async () => {
      await c0.getByLabel("Operador").selectOption("<=");
    });
    await changed(page, `${tag} escribir el valor`, async () => {
      await c0.getByLabel("Valor", { exact: true }).fill("3000");
    });
    await shot(page, `${tag}-03-regla-medida`, `${tag} una condición, medida`, {
      en: "#etapa-5",
    });
    await changed(page, `${tag} añadir otra condición`, async () => {
      await e5.getByRole("button", { name: "Añadir otra condición" }).click();
    });
    const c1 = e5.locator('[data-condicion="1"]');
    await changed(page, `${tag} columna de texto en la segunda`, async () => {
      await c1.getByLabel("Columna").selectOption("empleo");
    });
    await changed(page, `${tag} valor de la lista`, async () => {
      await c1.getByLabel("Valor", { exact: true }).selectOption("informal");
    });
    await changed(page, `${tag} unión «O»`, async () => {
      await e5.getByLabel("O: basta con que se cumpla una").check();
    });
    await shot(
      page,
      `${tag}-04-dos-condiciones`,
      `${tag} dos condiciones unidas por «o»`,
      {
        en: "#etapa-5",
      },
    );
    await changed(page, `${tag} quitar la segunda`, async () => {
      await e5
        .getByRole("button", { name: "Quitar la segunda condición" })
        .click();
    });
    await changed(page, `${tag} «No, hoy no hay regla»`, async () => {
      await e5.getByLabel("No, hoy no hay regla").check();
    });
    await shot(page, `${tag}-05-sin-regla`, `${tag} sin regla de hoy`, {
      en: "#etapa-5",
    });
    await changed(page, `${tag} volver a «Sí» y registrar`, async () => {
      await e5.getByLabel("Sí, hay una regla que se aplica hoy").check();
      await e5
        .locator('[data-condicion="0"]')
        .getByLabel("Columna")
        .selectOption("ingreso_mensual");
      await e5
        .locator('[data-condicion="0"]')
        .getByLabel("Valor", { exact: true })
        .fill("3000");
      await e5.getByRole("button", { name: "Registrar la etapa 5" }).click();
      await e5.getByText("Cumplida").waitFor();
    });
    if (
      !(await page
        .locator("#etapa-5-titulo")
        .evaluate((el) => el === document.activeElement))
    )
      fail(`${tag}: el foco no pasó al título de la etapa 5`);
    await shot(page, `${tag}-06-registrada`, `${tag} la etapa 5 cumplida`, {
      en: "#etapa-5",
    });
    await shot(
      page,
      `${tag}-07-cuaderno`,
      `${tag} el cuaderno con el resumen`,
      {
        en: 'section[aria-labelledby="cuaderno-titulo"]',
      },
    );
    {
      const antes = await page.evaluate(() => window.scrollY);
      await e5.getByRole("link", { name: "Regla de hoy", exact: true }).click();
      await page.waitForTimeout(150);
      const despues = await page.evaluate(() => window.scrollY);
      interactions++;
      if (antes === despues || !page.url().endsWith("#termino-regla-de-hoy"))
        fail(`${tag}: el término «Regla de hoy» no llevó al glosario`);
    }

    // ================= extremo: columna de ~105 caracteres y un valor de texto de 100 =================
    await nuevoCuaderno(page);
    await etapa1(page);
    await cargar(page, {
      name: "extremo.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(extremo()),
    });
    await etapa2(page, "y", "si");
    await etapa3(page);
    await etapa4(page);
    await e5.getByLabel("Sí, hay una regla que se aplica hoy").check();
    const x0 = e5.locator('[data-condicion="0"]');
    await x0.getByLabel("Columna").selectOption(LARGA);
    await x0.getByLabel("Valor", { exact: true }).fill("55");
    await e5.getByRole("button", { name: "Añadir otra condición" }).click();
    const x1 = e5.locator('[data-condicion="1"]');
    await x1.getByLabel("Columna").selectOption("ocupacion");
    await x1.getByLabel("Valor", { exact: true }).selectOption(VALOR_LARGO);
    await shot(
      page,
      `${tag}-08-extremo-regla`,
      `${tag} extremo: columna de ${LARGA.length} caracteres y valor de ${VALOR_LARGO.length}`,
      { en: "#etapa-5" },
    );
    await e5.getByRole("button", { name: "Registrar la etapa 5" }).click();
    await e5.getByText("Cumplida").waitFor();
    await shot(
      page,
      `${tag}-09-extremo-cuaderno`,
      `${tag} extremo: el cuaderno con la regla larga`,
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
