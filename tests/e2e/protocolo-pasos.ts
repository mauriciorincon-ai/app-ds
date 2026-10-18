import { resolve } from "node:path";
import { expect, type Page } from "@playwright/test";

// Protocolo DS — los pasos que repiten los e2e de las etapas 4, 5 y 6 (S10, S11): son los mismos clics que
// hace una persona, con los dos archivos del kit (crédito sin fecha, bajas con unidad y fecha).

export const KIT = (nombre: string) =>
  resolve(process.cwd(), "docs/kit-de-prueba", nombre);

export async function abrir(page: Page) {
  await page.goto("/protocolo");
  await expect(
    page.getByRole("heading", { level: 1, name: "Protocolo DS" }),
  ).toBeVisible();
  await expect(page.getByText("Abriendo tu cuaderno…")).toBeHidden();
}

export async function cargarCsv(page: Page, archivo: string) {
  await page.getByTestId("protocolo-csv").setInputFiles(KIT(archivo));
}

export async function cumplirEtapa1(page: Page) {
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

export async function cumplirEtapa3(page: Page, conFecha: boolean) {
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

export async function prepararCredito(page: Page) {
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

export async function prepararBajas(page: Page) {
  await abrir(page);
  await cumplirEtapa1(page);
  await cargarCsv(page, "bajas-con-fuga.csv");
  await cumplirEtapa2Bajas(page);
  await cumplirEtapa3(page, true);
}

export async function cumplirEtapa2Bajas(page: Page) {
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
export async function esperarGuardado(page: Page) {
  await expect(
    page.getByTestId("cuaderno-guardado").filter({ hasText: "Guardado" }),
  ).toBeVisible();
}

export const ANTES = "Antes de decidir";
export const DESPUES = "Después de decidir (o del resultado)";

export async function responder(
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

export async function sinDesborde(page: Page, ancho: number) {
  await page.setViewportSize({ width: ancho, height: 800 });
  const desborde = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(desborde, `desborde horizontal a ${ancho} px`).toBeLessThanOrEqual(0);
}

/** Etapa 4 de crédito: ninguna apuesta, la fuga fuera, y las demás columnas en bloque con su declaración. */
export async function cumplirEtapa4Credito(page: Page) {
  const e4 = page.locator("#etapa-4");
  await e4.getByLabel("Ninguna", { exact: true }).check();
  await e4.getByTestId("protocolo-revelar").click();
  await responder(page, "monto_recuperado", {
    momento: DESPUES,
    procedencia: "Lo registra cobranza",
  });
  await e4.getByTestId("protocolo-bloque-declaro").check();
  await e4.getByTestId("protocolo-bloque-aplicar").click();
  await e4.getByRole("button", { name: "Registrar la etapa 4" }).click();
  await expect(e4.getByText("Cumplida")).toBeVisible();
}

/** Etapa 4 de bajas: el inventario honesto y completo del kit. */
export async function cumplirEtapa4Bajas(page: Page) {
  const e4 = page.locator("#etapa-4");
  await e4.getByLabel("Ninguna", { exact: true }).check();
  await e4.getByTestId("protocolo-revelar").click();
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
}

/** Etapa 5: «no hay regla de hoy» (la 6 la necesita cumplida). */
export async function cumplirEtapa5SinRegla(page: Page) {
  const e5 = page.locator("#etapa-5");
  await e5.getByLabel("No, hoy no hay regla").check();
  await e5.getByRole("button", { name: "Registrar la etapa 5" }).click();
  await expect(e5.getByText("Cumplida")).toBeVisible();
}
