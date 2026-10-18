import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { axeBothThemes } from "./axe-temas";

// S9 — Protocolo DS, etapa 4 (¿existe al decidir?) con dos archivos del kit:
//  · credito-fuga-plantada.csv (sin fecha, con `monto_recuperado` plantada): una apuesta
//    equivocada, la sorpresa, la deriva «no medible: sin fecha», la acción en bloque con su
//    declaración, y el registro; axe en los dos temas, 360 px sin desborde, y regla dura 2
//    (ni una petición a /api/narrate, ningún valor de celda en la red ni en el archivo exportado);
//  · bajas-con-fuga.csv (con unidad y fecha): la fuga por vacíos, el identificador, las filas
//    repetidas y la deriva; la apuesta sigue fija tras recargar la página, y la etapa se
//    verifica de nuevo contra el archivo al volver a cargarlo.

const KIT = (nombre: string) =>
  resolve(process.cwd(), "docs/kit-de-prueba", nombre);

// (Los pasos 1–3 repiten los de protocolo.spec.ts: son los mismos clics.)
async function abrir(page: Page) {
  await page.goto("/protocolo");
  await expect(
    page.getByRole("heading", { level: 1, name: "Protocolo DS" }),
  ).toBeVisible();
  await expect(page.getByText("Abriendo tu cuaderno…")).toBeHidden();
}

async function cargarCsv(page: Page, archivo: string) {
  await page.getByTestId("protocolo-csv").setInputFiles(KIT(archivo));
}

async function cumplirEtapa1(page: Page) {
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
  await expect(e1.getByText("Cumplida")).toBeVisible();
}

async function cumplirEtapa3(page: Page, conFecha: boolean) {
  const e3 = page.locator("#etapa-3");
  await e3.getByLabel("Predecir lo que va a pasar").check();
  await e3.getByLabel("Población").fill("Clientes del archivo");
  await e3.getByLabel("Exclusiones").fill("Ninguna");
  if (!conFecha) await e3.getByLabel("Periodo", { exact: true }).fill("2025");
  if ((await e3.getByLabel("Tu aviso").count()) > 0)
    await e3.getByLabel("Tu aviso").fill("Es un piloto; lo sé");
  await e3.getByRole("button", { name: "Registrar la etapa 3" }).click();
  await expect(e3.getByText("Cumplida")).toBeVisible();
}

async function prepararCredito(page: Page) {
  await abrir(page);
  await cumplirEtapa1(page);
  await cargarCsv(page, "credito-fuga-plantada.csv");
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
  await expect(e2.getByText("Cumplida")).toBeVisible();
  await cumplirEtapa3(page, false);
}

async function prepararBajas(page: Page) {
  await abrir(page);
  await cumplirEtapa1(page);
  await cargarCsv(page, "bajas-con-fuga.csv");
  await cumplirEtapa2Bajas(page);
  await cumplirEtapa3(page, true);
}

async function cumplirEtapa2Bajas(page: Page) {
  const e2 = page.locator("#etapa-2");
  await e2
    .getByLabel("Columna objetivo", { exact: true })
    .selectOption("se_dio_de_baja");
  await e2.getByLabel(/Valor que significa/).selectOption("si");
  await e2.getByLabel(/Una columna identifica la unidad/).check();
  await e2
    .getByLabel("Columna que identifica la unidad")
    .selectOption("cliente_id");
  await e2
    .getByLabel("Columna de fecha", { exact: true })
    .selectOption("mes_observado");
  await e2.getByRole("button", { name: "Registrar la etapa 2" }).click();
  await expect(e2.getByText("Cumplida")).toBeVisible();
}

/** El cuaderno se escribe en IndexedDB sin bloquear: recargar antes de «Guardado» pierde la última entrada. */
async function esperarGuardado(page: Page) {
  await expect(
    page.getByTestId("cuaderno-guardado").filter({ hasText: "Guardado" }),
  ).toBeVisible();
}

const ANTES = "Antes de decidir";
const DESPUES = "Después de decidir (o del resultado)";

async function responder(
  page: Page,
  columna: string,
  datos: { momento?: string; estado?: string; procedencia?: string },
) {
  const fila = page.locator(`#etapa-4 [data-columna="${columna}"]`);
  if (datos.procedencia !== undefined)
    await fila.getByLabel(/Quién o qué la produce/).fill(datos.procedencia);
  if (datos.momento) await fila.getByLabel(datos.momento).check();
  if (datos.estado)
    await fila.getByLabel("¿La usas?").selectOption(datos.estado);
}

async function sinDesborde(page: Page, ancho: number) {
  await page.setViewportSize({ width: ancho, height: 800 });
  const desborde = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(desborde, `desborde horizontal a ${ancho} px`).toBeLessThanOrEqual(0);
}

test("etapa 4 con fuga plantada: apuesta equivocada, sorpresa, bloque con declaración y registro", async ({
  page,
}) => {
  const peticiones: string[] = [];
  page.on("request", (r) =>
    peticiones.push(`${r.url()} ${r.postData() ?? ""}`),
  );
  await prepararCredito(page);
  const e4 = page.locator("#etapa-4");

  // 1 · la apuesta: nada de los datos a la vista
  await expect(e4.getByText("Abierta", { exact: true })).toBeVisible();
  await expect(e4.getByTestId("protocolo-revelar")).toBeDisabled();
  await expect(e4.locator("[data-columna]")).toHaveCount(0);
  await expect(e4.getByTestId("protocolo-hallazgo-fuga")).toHaveCount(0);
  await axeBothThemes(page);
  await e4.getByLabel("Sí, marco las que creo").check();
  await expect(e4.getByTestId("protocolo-revelar")).toBeDisabled();
  await e4.getByLabel("ingreso_mensual", { exact: true }).check();
  await expect(e4.getByTestId("protocolo-revelar")).toBeEnabled();
  await e4.getByTestId("protocolo-revelar").click();

  // 2 · la revelación: sorpresa, falsa alarma, y la deriva dice por qué no se midió
  await expect(
    e4.getByRole("heading", { name: "2 · Lo que encontró la app" }),
  ).toBeFocused();
  await expect(e4.getByTestId("protocolo-hallazgo-fuga")).toContainText(
    "monto_recuperado",
  );
  const comparacion = e4.getByTestId("protocolo-hallazgo-comparacion");
  await expect(comparacion).toContainText(
    /Te sorprendieron[^.]*monto_recuperado/,
  );
  await expect(comparacion).toContainText(
    "Apostaste y la app no las marca: ingreso_mensual",
  );
  await expect(e4.getByTestId("protocolo-hallazgo-deriva")).toContainText(
    "no elegiste una columna de fecha",
  );
  await expect(e4.getByTestId("protocolo-apuesta-fija")).toContainText(
    "ingreso_mensual",
  );
  await expect(e4.getByTestId("protocolo-revelar")).toHaveCount(0);

  // 3 · el inventario: las dos con alerta se responden una por una
  await expect(e4.getByTestId("protocolo-con-alerta")).toContainText(
    "2 columnas con alerta",
  );
  // «no sé» no ofrece «usar»
  const ingreso = e4.locator('[data-columna="ingreso_mensual"]');
  await ingreso.getByLabel("No sé", { exact: true }).check();
  await expect(
    ingreso.getByLabel("¿La usas?").locator("option", { hasText: /^Usar$/ }),
  ).toHaveCount(0);
  await responder(page, "ingreso_mensual", {
    momento: ANTES,
    estado: "usar",
    procedencia: "Lo declara la persona al pedir el crédito",
  });
  // «después» deja solo «excluir», lo dice, y lo anuncia
  await responder(page, "monto_recuperado", {
    momento: DESPUES,
    procedencia: "Lo registra cobranza",
  });
  await expect(
    e4.locator('[data-columna="monto_recuperado"]').getByLabel("¿La usas?"),
  ).toHaveValue("excluir");
  await expect(e4.getByTestId("protocolo-estado4")).toContainText(
    "monto_recuperado: se llena después de decidir",
  );

  // la acción en bloque exige la declaración
  await expect(e4.getByTestId("protocolo-bloque")).toContainText(
    "Estas 3 columnas no tienen ninguna alerta",
  );
  await expect(e4.getByTestId("protocolo-bloque-aplicar")).toBeDisabled();
  await e4.getByTestId("protocolo-bloque-declaro").check();
  await e4.getByTestId("protocolo-bloque-aplicar").click();
  await expect(e4.getByTestId("protocolo-bloque-hecho")).toContainText(
    "3 columnas",
  );
  await expect(e4.getByTestId("protocolo-progreso")).toContainText(
    "usar 4 · excluir 1 · no sé 0",
  );
  await axeBothThemes(page);
  await sinDesborde(page, 360);

  // registrar: la compuerta acepta, el foco vuelve al título y el cuaderno resume
  await e4.getByRole("button", { name: "Registrar la etapa 4" }).click();
  await expect(e4.getByText("Cumplida")).toBeVisible();
  await expect(page.locator("#etapa-4-titulo")).toBeFocused();
  await expect(
    page.locator("#etapa-5").getByText("Sin construir"),
  ).toBeVisible();
  const resumen = page.getByTestId("cuaderno-resumen4");
  await expect(resumen).toContainText("Tu apuesta: ingreso_mensual");
  await expect(resumen).toContainText("sorpresas: monto_recuperado");
  await expect(resumen).toContainText("Usar: 4 · excluir: 1 · no sé: 0");
  await expect(resumen).toContainText("Declaraste que 3 columnas");
  await axeBothThemes(page);

  // regla dura 2: el archivo exportado lleva nombres y conteos, jamás filas; nada viajó
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar cuaderno" }).click(),
  ]);
  const exportado = readFileSync((await descarga.path())!, "utf8");
  expect(exportado).toContain("monto_recuperado");
  const csv = readFileSync(KIT("credito-fuga-plantada.csv"), "utf8").split(
    "\n",
  );
  for (const fila of csv.slice(1, 40).filter(Boolean))
    expect(exportado, `una fila del CSV en el archivo: ${fila}`).not.toContain(
      fila,
    );
  const red = peticiones.join("\n");
  expect(red).not.toContain("/api/narrate");
  for (const fila of csv.slice(1, 40).filter(Boolean))
    expect(red, `una fila del CSV en la red: ${fila}`).not.toContain(fila);
});

test("etapa 4 con bajas: fuga por vacíos, identificador, repetidas y deriva; la apuesta sigue fija al recargar", async ({
  page,
}) => {
  await prepararBajas(page);
  const e4 = page.locator("#etapa-4");
  await e4.getByLabel("Ninguna", { exact: true }).check();
  await e4.getByTestId("protocolo-revelar").click();

  await expect(e4.getByTestId("protocolo-hallazgo-vacios")).toContainText(
    "motivo_baja",
  );
  await expect(
    e4.getByTestId("protocolo-hallazgo-identificador"),
  ).toContainText("referencia");
  await expect(e4.getByTestId("protocolo-hallazgo-duplicados")).toContainText(
    "Copias exactas de otra fila: 4 de 480",
  );
  await expect(e4.getByTestId("protocolo-hallazgo-duplicados")).toContainText(
    "Filas con la misma unidad en el mismo momento: 7",
  );
  const deriva = e4.getByTestId("protocolo-hallazgo-deriva");
  await expect(deriva).toContainText("desde el 2025-09-15");
  await expect(deriva).toContainText("canal: PSI");
  await expect(e4.getByTestId("protocolo-hallazgo-comparacion")).toContainText(
    "Te sorprendieron",
  );

  // Recargar NO devuelve la apuesta: queda fija en esta pestaña (la huella dice que es el mismo archivo)
  await esperarGuardado(page);
  await page.reload();
  await expect(page.getByText("Abriendo tu cuaderno…")).toBeHidden();
  await cargarCsv(page, "bajas-con-fuga.csv");
  await expect(e4.getByTestId("protocolo-apuesta-fija")).toContainText(
    "ninguna columna filtra",
  );
  await expect(e4.getByTestId("protocolo-revelar")).toHaveCount(0);
  await expect(e4.getByTestId("protocolo-hallazgo-vacios")).toBeVisible();

  await e4.getByTestId("protocolo-bloque-declaro").check();
  await e4.getByTestId("protocolo-bloque-aplicar").click();
  await responder(page, "cliente_id", { estado: "excluir" });
  await responder(page, "mes_observado", { estado: "excluir" });
  await responder(page, "canal", {
    momento: ANTES,
    estado: "usar",
    procedencia: "Lo registra el vendedor al abrir la cuenta",
  });
  await responder(page, "uso_mensual_gb", {
    momento: ANTES,
    estado: "usar",
    procedencia: "Medidor de la red, al cierre de mes",
  });
  await responder(page, "motivo_baja", {
    momento: DESPUES,
    procedencia: "Lo escribe soporte al cerrar la baja",
  });
  await responder(page, "referencia", { estado: "excluir" });
  await e4.getByRole("button", { name: "Registrar la etapa 4" }).click();
  await expect(e4.getByText("Cumplida")).toBeVisible();

  // La etapa 4 depende de los datos: tras recargar pide el archivo y vuelve a verificar contra él
  await esperarGuardado(page);
  await page.reload();
  await expect(page.getByText("Abriendo tu cuaderno…")).toBeHidden();
  await expect(
    page.locator("#etapa-2").getByText("Por verificar"),
  ).toBeVisible();
  await expect(e4.getByText("Cerrada")).toBeVisible();
  await cargarCsv(page, "bajas-con-fuga.csv");
  await expect(e4.getByText("Cumplida")).toBeVisible();
  await axeBothThemes(page);
});
