import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { axeBothThemes } from "./axe-temas";
import {
  KIT,
  cumplirEtapa4Credito,
  cumplirEtapa4Precio,
  cumplirEtapa5SinRegla,
  cumplirEtapa6Credito,
  cumplirEtapa6Sugerida,
  cumplirEtapa7,
  cumplirEtapa8,
  prepararCredito,
  prepararPrecio,
  sinDesborde,
} from "./protocolo-pasos";

// S14 — Protocolo DS, etapa 9 (¿sirve para la decisión?) con dos archivos del kit y el worker de Pyodide de
// verdad hasta la etapa 8:
//  · credito-fuga-plantada.csv (dos clases): la 9 lee lo que dejó la 8 sin abrir la prueba (ningún mensaje al
//    worker durante la etapa), el umbral de tus costos con sus cifras frente a no hacer nada y actuar con
//    todos, la capacidad que no alcanza con el umbral que sí, mover el umbral sin razón no pasa, y «no usarlo»
//    queda cumplido y escrito; la 10 se ve sin construir; axe en los dos temas, 360 px, y regla dura 2;
//  · precio-fuga-plantada.csv (estimar un número): el costo del modelo frente a lo de hoy y el cuantil de tus
//    costos, e «iterar» queda cumplido.

test.setTimeout(480_000);

/** Cuenta los mensajes al worker desde que carga la página (la 8 abre la prueba; la 9 no manda ninguno). */
async function contarMensajes(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { mensajes: number };
    w.mensajes = 0;
    const original = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (
      this: Worker,
      ...args: Parameters<Worker["postMessage"]>
    ) {
      w.mensajes += 1;
      return original.apply(this, args);
    } as Worker["postMessage"];
  });
}
const mensajes = (page: Page) =>
  page.evaluate(() => (window as unknown as { mensajes: number }).mensajes);

test("etapa 9 con crédito: la decisión con números, sin volver a abrir la prueba, y «no usarlo» queda escrito", async ({
  page,
}) => {
  const peticiones: string[] = [];
  page.on("request", (r) =>
    peticiones.push(`${r.url()} ${r.postData() ?? ""}`),
  );
  await contarMensajes(page);
  await prepararCredito(page);
  await cumplirEtapa4Credito(page);
  await cumplirEtapa5SinRegla(page);
  await cumplirEtapa6Credito(page);
  await cumplirEtapa7(page);
  await cumplirEtapa8(page, "Falla con quienes trabajan en la informalidad");
  const e9 = page.locator("#etapa-9");
  await expect(e9.getByText("Abierta", { exact: true })).toBeVisible();
  const antes = await mensajes(page);
  expect(antes, "la 8 abrió la prueba en el worker").toBeGreaterThan(0);

  await expect(e9.getByTestId("protocolo-lee9")).toContainText(
    "La prueba no se vuelve a abrir",
  );
  // el umbral de tus costos (etapa 1: 10 y 50) es 10 / 60
  const umbral = e9.getByLabel("Umbral con que se actúa");
  await expect(umbral).toHaveValue("e1");
  await expect(e9.getByTestId("protocolo-umbral9")).toContainText(
    "dan un umbral de 0.17",
  );
  const cifras = e9.getByTestId("protocolo-cifras9");
  await expect(cifras).toContainText("Falsas alarmas por cada 100 alertas");
  await expect(cifras).toContainText("No hacer nada");
  await expect(cifras).toContainText("Actuar con todos");
  await expect(cifras).toContainText("· lo de hoy");
  await expect(e9.getByTestId("protocolo-ahorro9")).toContainText(
    "Frente a lo de hoy",
  );
  await expect(e9.getByTestId("protocolo-curva9")).toContainText(
    "◆ tus costos",
  );

  // la capacidad que no alcanza nombra el umbral que sí
  const capacidad = e9.getByLabel(
    "De cada 100 casos, ¿cuántos alcanza a atender tu equipo?",
  );
  await capacidad.fill("5");
  await expect(e9.getByTestId("protocolo-capacidad9-lectura")).toContainText(
    "El umbral de tu capacidad es",
  );
  await capacidad.fill("100");
  await expect(e9.getByTestId("protocolo-capacidad9-lectura")).toContainText(
    "tu equipo alcanza",
  );

  // mover el umbral leyendo la curva lo rotula y pide tu razón
  await umbral.selectOption("0.30");
  await expect(e9.getByTestId("protocolo-movido9")).toContainText(
    "Elegido mirando la prueba: optimista",
  );
  await e9.getByLabel("No usarlo").check();
  await e9
    .getByLabel("Tu razón", { exact: true })
    .fill("Con 40 filas de prueba no me fío: junto más datos antes de decidir");
  const registrar = e9.getByRole("button", { name: "Registrar la etapa 9" });
  await registrar.click();
  await expect(e9.getByRole("alert")).toContainText(
    "tu razón para mover el umbral",
  );
  await umbral.selectOption("e1");

  await axeBothThemes(page);
  await sinDesborde(page, 360);

  await registrar.click();
  await expect(e9.getByText("Cumplida")).toBeVisible();
  await expect(page.locator("#etapa-9-titulo")).toBeFocused();
  await expect(
    page.locator("#etapa-10").getByText("Abierta", { exact: true }),
  ).toBeVisible();
  const resumen = page.getByTestId("cuaderno-resumen9");
  await expect(resumen).toContainText("Decisión: no usarlo.");
  await expect(resumen).toContainText(
    "Tu equipo atiende 100 de cada 100 casos.",
  );
  await expect(resumen).toContainText("por cada 100 decisiones");
  // la etapa 9 no mandó nada al worker: no volvió a abrir la prueba
  expect(await mensajes(page)).toBe(antes);
  await axeBothThemes(page);

  // regla dura 2: el archivo exportado lleva conteos y tus razones, jamás filas
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar cuaderno" }).click(),
  ]);
  const exportado = readFileSync((await descarga.path())!, "utf8");
  expect(exportado).toContain('"decision": "no-usar"');
  const csv = readFileSync(KIT("credito-fuga-plantada.csv"), "utf8").split(
    "\n",
  );
  for (const fila of csv.slice(1).filter(Boolean))
    expect(exportado, `una fila del CSV en el archivo: ${fila}`).not.toContain(
      fila,
    );
  const red = peticiones.join("\n");
  expect(red).not.toContain("/api/narrate");
  for (const fila of csv.slice(1).filter(Boolean))
    expect(red, `una fila del CSV en la red: ${fila}`).not.toContain(fila);
});

test("etapa 9 con precio: el costo del modelo frente a lo de hoy, con el cuantil de tus costos, e «iterar»", async ({
  page,
}) => {
  await prepararPrecio(page);
  await cumplirEtapa4Precio(page);
  await cumplirEtapa5SinRegla(page);
  await cumplirEtapa6Sugerida(page);
  await cumplirEtapa7(page);
  await cumplirEtapa8(page, "Falla con las casas más grandes del centro");
  const e9 = page.locator("#etapa-9");
  const cifras = e9.getByTestId("protocolo-cifras9");
  await expect(cifras).toContainText("Costo por cada 100 decisiones");
  await expect(cifras).toContainText("Con el modelo");
  // costos 2 y 1: conviene apuntar al cuantil 2 / 3
  await expect(e9).toContainText("lo que conviene apuntar es el cuantil 0.67");
  await expect(e9.getByLabel("Umbral con que se actúa")).toHaveCount(0);
  await expect(e9.getByTestId("protocolo-capacidad9")).toHaveCount(0);
  await sinDesborde(page, 360);
  await e9.getByLabel("Iterar: mejorarlo antes de decidir").check();
  await e9
    .getByLabel("Tu razón", { exact: true })
    .fill("Falla con las casas grandes: sumo la ubicación exacta y vuelvo");
  await e9.getByRole("button", { name: "Registrar la etapa 9" }).click();
  await expect(e9.getByText("Cumplida")).toBeVisible();
  await expect(page.getByTestId("cuaderno-resumen9")).toContainText(
    "Decisión: iterar.",
  );
});
