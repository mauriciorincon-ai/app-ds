// Pasada de capturas del S9 (contrapeso del cierre — regla 12 y /deploy-check): el build de
// producción en :3000 (`pnpm build && pnpm start`), 360 px y 1280 px, tema claro y oscuro,
// SOLO en español (el otro idioma va al cierre del hito, regla 20). Cada encuadre MIDE
// scrollWidth ≤ clientWidth (sin desplazamiento lateral de la página).
//
// Recorre la etapa 4 del Protocolo: la apuesta, la revelación con lo plantado en el kit
// (credito-fuga-plantada.csv y bajas-con-fuga.csv), el inventario columna por columna, la acción
// en bloque con su declaración, el registro y el resumen del cuaderno.
//
// EXTREMOS DE MAGNITUD (regla 22), generados EN MEMORIA (no entran al kit): 80 columnas, una con
// un nombre de ~110 caracteres, y una procedencia de 200 caracteres escrita en una de ellas.
//
// PASADA DE INTERACCIÓN (regla 22): cada control que se activa debe cambiar algo —el DOM, una casilla,
// un valor, un botón que se enciende—; si no cambia, es un hallazgo. (La firma incluye el estado de
// las casillas, los valores de los campos y los botones apagados: en S8 solo contaba nodos y texto.)
// Las capturas se LEEN como imagen antes de presentar.
//
// Uso: OUT=<carpeta> node scripts/capturas-s9.mjs
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
const PROCEDENCIA_LARGA =
  "Lo carga el área de cobranza cada noche desde el sistema heredado de facturación, después de conciliar los pagos del día con el banco; si el banco rechaza el archivo, lo completa a mano el equipo de soporte.".slice(
    0,
    200,
  );
function ancho() {
  const columnas = [LARGA, ...Array.from({ length: 77 }, (_, i) => `c${i}`)];
  const filas = [["u", "f", ...columnas, "y"].join(",")];
  for (let i = 0; i < 200; i++) {
    filas.push(
      [
        `U${i}`,
        `2025-${String((i % 12) + 1).padStart(2, "0")}-15`,
        ...columnas.map((_, k) => String(((i * 7 + k * 13) % 17) + (k % 3))),
        i % 3 === 0 ? "si" : "no",
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

/** Un encuadre de un recuadro (`en`) o de la página; el desborde se mide siempre en la página. */
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

/** Algo cambió (DOM, casillas, valores, botones) tras activar un control. */
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
    .fill("Llamar o no al cliente antes de que venza su plan");
  await e1
    .getByLabel("Quién la toma", { exact: true })
    .fill("Jefa de retención");
  await e1.getByLabel("Sí o no (actuar o no actuar)").check();
  await e1.getByLabel("Unidad de costo", { exact: true }).fill("US$");
  await e1.getByLabel(/Costo de actuar sin que hiciera falta/).fill("10");
  await e1.getByLabel(/Costo de no actuar y que sí hiciera falta/).fill("50");
  await e1.getByRole("button", { name: "Registrar la etapa 1" }).click();
  await e1.getByText("Cumplida").waitFor();
}

async function etapa3(page, conFecha) {
  const e3 = page.locator("#etapa-3");
  await e3.getByLabel("Predecir lo que va a pasar").check();
  await e3.getByLabel("Población").fill("Clientes del archivo");
  await e3.getByLabel("Exclusiones").fill("Ninguna");
  if (!conFecha) await e3.getByLabel("Periodo", { exact: true }).fill("2025");
  if ((await e3.getByLabel("Tu aviso").count()) > 0)
    await e3.getByLabel("Tu aviso").fill("Es un piloto; lo sé");
  await e3.getByRole("button", { name: "Registrar la etapa 3" }).click();
  await e3.getByText("Cumplida").waitFor();
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

const ANTES = "Antes de decidir";
const DESPUES = "Después de decidir (o del resultado)";

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

    // ================= credito-fuga-plantada.csv: apuesta equivocada, sorpresa, bloque =================
    await page.goto(`${BASE}/protocolo`);
    await page.getByText("Abriendo tu cuaderno…").waitFor({ state: "hidden" });
    await nuevoCuaderno(page);
    await etapa1(page);
    await cargar(page, KIT("credito-fuga-plantada.csv"));
    const e2 = page.locator("#etapa-2");
    await e2
      .getByLabel("Columna objetivo", { exact: true })
      .selectOption("incumplio");
    await e2.getByLabel(/Valor que significa/).selectOption("1");
    await e2.getByLabel("No hay columna: lo escribo").check();
    await e2
      .getByLabel("El momento, escrito")
      .fill("El día que se pide el crédito");
    await e2.getByRole("button", { name: "Registrar la etapa 2" }).click();
    await e2.getByText("Cumplida").waitFor();
    await etapa3(page, false);

    const e4 = page.locator("#etapa-4");
    await shot(page, `${tag}-01-apuesta`, `${tag} la apuesta, apagado`, {
      en: "#etapa-4",
    });
    await changed(page, `${tag} elegir «Sí, marco las que creo»`, async () => {
      await e4.getByLabel("Sí, marco las que creo").check();
    });
    await changed(page, `${tag} marcar una columna`, async () => {
      await e4.getByLabel("ingreso_mensual", { exact: true }).check();
    });
    await shot(page, `${tag}-02-apuesta-lista`, `${tag} la apuesta, lista`, {
      en: "#etapa-4",
    });
    await changed(page, `${tag} «Ver lo que encontró la app»`, async () => {
      await e4.getByTestId("protocolo-revelar").click();
      await e4.getByTestId("protocolo-hallazgo-comparacion").waitFor();
    });
    await shot(page, `${tag}-03-revelacion`, `${tag} la revelación`, {
      en: '#etapa-4 section[aria-labelledby$="-revelacion"]',
    });
    await shot(page, `${tag}-04-inventario`, `${tag} el inventario`, {
      en: "#etapa-4 [data-testid=protocolo-bloque]",
    });

    await changed(page, `${tag} «después de decidir» → excluir`, async () => {
      await e4
        .locator('[data-columna="monto_recuperado"]')
        .getByLabel(DESPUES)
        .check();
    });
    await changed(page, `${tag} escribir una procedencia`, async () => {
      await e4
        .locator('[data-columna="monto_recuperado"]')
        .getByLabel(/Quién o qué la produce/)
        .fill("Lo registra cobranza");
    });
    await shot(page, `${tag}-05-fila-fuga`, `${tag} la columna que filtra`, {
      en: '#etapa-4 [data-columna="monto_recuperado"]',
    });
    await changed(page, `${tag} «No sé» quita «Usar»`, async () => {
      await e4
        .locator('[data-columna="ingreso_mensual"]')
        .getByLabel("No sé", { exact: true })
        .check();
    });
    await changed(page, `${tag} «antes» + «usar»`, async () => {
      const fila = e4.locator('[data-columna="ingreso_mensual"]');
      await fila.getByLabel(ANTES).check();
      await fila.getByLabel("¿La usas?").selectOption("usar");
    });
    await shot(
      page,
      `${tag}-06-fila-obligatoria`,
      `${tag} procedencia obligatoria`,
      {
        en: '#etapa-4 [data-columna="ingreso_mensual"]',
      },
    );
    await e4
      .locator('[data-columna="ingreso_mensual"]')
      .getByLabel(/Quién o qué la produce/)
      .fill("Lo declara la persona al pedir el crédito");

    await changed(page, `${tag} abrir «Revisar una por una»`, async () => {
      await e4.getByTestId("protocolo-sin-alerta").locator("summary").click();
    });
    await shot(page, `${tag}-07-sin-alerta`, `${tag} las columnas sin alerta`, {
      en: "#etapa-4 [data-testid=protocolo-sin-alerta]",
    });
    await e4.getByTestId("protocolo-sin-alerta").locator("summary").click();
    await changed(page, `${tag} la declaración del bloque`, async () => {
      await e4.getByTestId("protocolo-bloque-declaro").check();
    });
    await changed(page, `${tag} marcar en bloque`, async () => {
      await e4.getByTestId("protocolo-bloque-aplicar").click();
    });
    await shot(
      page,
      `${tag}-08-bloque-hecho`,
      `${tag} la acción en bloque hecha`,
      {
        en: "#etapa-4 [data-testid=protocolo-bloque]",
      },
    );
    await changed(page, `${tag} deshacer el bloque`, async () => {
      await e4.getByTestId("protocolo-bloque-deshacer").click();
    });
    await e4.getByTestId("protocolo-bloque-declaro").check();
    await e4.getByTestId("protocolo-bloque-aplicar").click();

    await changed(page, `${tag} registrar la etapa 4`, async () => {
      await e4.getByRole("button", { name: "Registrar la etapa 4" }).click();
      await e4.getByText("Cumplida").waitFor();
    });
    if (
      !(await page
        .locator("#etapa-4-titulo")
        .evaluate((el) => el === document.activeElement))
    )
      fail(`${tag}: el foco no pasó al título de la etapa 4`);
    await shot(page, `${tag}-09-registrada`, `${tag} la etapa 4 cumplida`, {
      en: "#etapa-4",
    });
    await shot(
      page,
      `${tag}-10-cuaderno`,
      `${tag} el cuaderno con el resumen`,
      {
        en: 'section[aria-labelledby="cuaderno-titulo"]',
      },
    );
    {
      const antes = await page.evaluate(() => window.scrollY);
      await e4.getByRole("link", { name: "Procedencia", exact: true }).click();
      await page.waitForTimeout(150);
      const despues = await page.evaluate(() => window.scrollY);
      interactions++;
      if (antes === despues || !page.url().endsWith("#termino-procedencia"))
        fail(`${tag}: el término «Procedencia» no llevó al glosario`);
    }

    // ================= bajas-con-fuga.csv: vacíos, identificador, repetidas, deriva =================
    await nuevoCuaderno(page);
    await etapa1(page);
    await cargar(page, KIT("bajas-con-fuga.csv"));
    await e2
      .getByLabel("Columna objetivo", { exact: true })
      .selectOption("se_dio_de_baja");
    await e2.getByLabel(/Valor que significa/).selectOption("si");
    await e2.getByLabel(/Una columna identifica la unidad/).check();
    await e2
      .getByLabel("Columna que identifica la unidad", { exact: true })
      .selectOption("cliente_id");
    await e2
      .getByLabel("Columna de fecha", { exact: true })
      .selectOption("mes_observado");
    await e2.getByRole("button", { name: "Registrar la etapa 2" }).click();
    await e2.getByText("Cumplida").waitFor();
    await etapa3(page, true);
    await changed(page, `${tag} apostar «Ninguna»`, async () => {
      await e4.getByLabel("Ninguna", { exact: true }).check();
    });
    await e4.getByTestId("protocolo-revelar").click();
    await e4.getByTestId("protocolo-hallazgo-comparacion").waitFor();
    await shot(
      page,
      `${tag}-11-bajas-revelacion`,
      `${tag} bajas: vacíos, identificador, repetidas, deriva`,
      {
        en: '#etapa-4 section[aria-labelledby$="-revelacion"]',
      },
    );

    // ================= extremo: 80 columnas, un nombre de 110 caracteres, procedencia de 200 =================
    await nuevoCuaderno(page);
    await etapa1(page);
    await cargar(page, {
      name: "ancho.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(ancho()),
    });
    await e2.getByLabel("Columna objetivo", { exact: true }).selectOption("y");
    await e2.getByLabel(/Valor que significa/).selectOption("si");
    await e2.getByLabel("No hay columna: lo escribo").check();
    await e2.getByLabel("El momento, escrito").fill("Al pedirse");
    await e2.getByRole("button", { name: "Registrar la etapa 2" }).click();
    await e2.getByText("Cumplida").waitFor();
    await etapa3(page, false);
    await e4.getByLabel("Sí, marco las que creo").check();
    await shot(
      page,
      `${tag}-12-extremo-apuesta`,
      `${tag} extremo: 80 columnas para apostar`,
      {
        en: "#etapa-4",
      },
    );
    await e4.getByLabel(LARGA, { exact: true }).check();
    await e4.getByTestId("protocolo-revelar").click();
    await e4.getByTestId("protocolo-hallazgo-comparacion").waitFor();
    await shot(
      page,
      `${tag}-13-extremo-bloque`,
      `${tag} extremo: el bloque con ~79 nombres`,
      {
        en: "#etapa-4 [data-testid=protocolo-bloque]",
      },
    );
    const montadas = await e4.locator("[data-columna]").count();
    if (montadas > 40)
      fail(
        `${tag}: con 80 columnas se montaron ${montadas} filas (deben ser solo las de alerta)`,
      );
    const fila = e4.locator(`[data-columna="${LARGA}"]`);
    await fila.getByLabel(/Quién o qué la produce/).fill(PROCEDENCIA_LARGA);
    await shot(
      page,
      `${tag}-14-extremo-fila`,
      `${tag} extremo: nombre de 110 caracteres y procedencia de 200`,
      {
        en: `#etapa-4 [data-columna="${LARGA}"]`,
      },
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
