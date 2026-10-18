import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { axeBothThemes } from "./axe-temas";
import {
  KIT,
  cargarCsv,
  cumplirEtapa4Bajas,
  cumplirEtapa4Credito,
  esperarGuardado,
  prepararBajas,
  prepararCredito,
  sinDesborde,
} from "./protocolo-pasos";

// S10 — Protocolo DS, etapa 5 (lo que ya se logra sin modelo y la regla de hoy) con dos archivos:
//  · credito-fuga-plantada.csv: la tabla de referencias rotulada como referencia, la regla de hoy
//    escrita con dos condiciones y medida en vivo, solo con columnas que la etapa 4 dejó en
//    «usar»; axe en los dos temas, 360 px sin desborde, y regla dura 2 (ni una petición a
//    /api/narrate, ningún valor de celda en la red ni en el archivo exportado);
//  · bajas-con-fuga.csv: sin elegir si hay regla la compuerta dice qué falta; «no hay regla» se
//    elige con el teclado, se registra, y la etapa se verifica de nuevo contra el archivo al
//    volver a cargarlo.

test("etapa 5 con crédito: referencias, regla de hoy medida en vivo y registro", async ({
  page,
}) => {
  const peticiones: string[] = [];
  page.on("request", (r) =>
    peticiones.push(`${r.url()} ${r.postData() ?? ""}`),
  );
  await prepararCredito(page);
  await cumplirEtapa4Credito(page);
  const e5 = page.locator("#etapa-5");

  // 1 · lo que ya se logra sin modelo, rotulado como referencia
  await expect(e5.getByText("Abierta", { exact: true })).toBeVisible();
  await expect(e5.getByTestId("protocolo-referencia")).toContainText(
    "referencia, no un resultado",
  );
  await expect(e5.getByTestId("protocolo-referencia")).toContainText(
    "La etapa 8 la vuelve a medir sobre la prueba",
  );
  const tabla = e5.getByRole("table");
  await expect(tabla).toContainText("Nunca actuar");
  await expect(tabla).toContainText("Siempre actuar");
  await expect(tabla).toContainText("Costo por cada 100 decisiones (US$)");
  // el «qué se hace hoy» de la etapa 1 es opcional y aquí no se escribió: no se muestra un recordatorio vacío
  await expect(e5.getByTestId("protocolo-hoy")).toHaveCount(0);
  await axeBothThemes(page);

  // 2 · la regla de hoy: solo columnas en «usar», operadores según el tipo
  await e5.getByLabel("Sí, hay una regla que se aplica hoy").check();
  const c0 = e5.locator('[data-condicion="0"]');
  await expect(c0.getByLabel("Columna").locator("option")).toHaveText([
    "Elige…",
    "ingreso_mensual",
    "monto_prestamo",
    "puntaje_credito",
    "empleo",
  ]);
  await c0.getByLabel("Columna").selectOption("ingreso_mensual");
  await expect(c0.getByLabel("Operador").locator("option")).toHaveCount(6);
  await c0.getByLabel("Valor", { exact: true }).fill("3000");
  const medida = e5.getByTestId("protocolo-regla-medida");
  await expect(medida).toContainText("La regla se cumple en");
  await expect(medida).toContainText("de 200 filas");
  await expect(
    e5.getByRole("rowheader", { name: "Tu regla de hoy" }),
  ).toBeVisible();

  // 3 · una segunda condición: el foco va a ella, y ya no se ofrece una tercera
  await e5.getByRole("button", { name: "Añadir otra condición" }).click();
  const c1 = e5.locator('[data-condicion="1"]');
  await expect(c1.getByLabel("Columna")).toBeFocused();
  await expect(
    e5.getByRole("button", { name: "Añadir otra condición" }),
  ).toHaveCount(0);
  await c1.getByLabel("Columna").selectOption("empleo");
  await expect(c1.getByLabel("Operador").locator("option")).toHaveCount(2);
  await c1.getByLabel("Valor", { exact: true }).selectOption("informal");
  await e5.getByLabel("O: basta con que se cumpla una").check();
  await expect(e5.getByTestId("protocolo-regla-medida")).toContainText(
    "La regla se cumple en",
  );
  await axeBothThemes(page);
  await sinDesborde(page, 360);

  // 4 · registrar: la compuerta acepta, el foco vuelve al título y el cuaderno resume
  await e5.getByRole("button", { name: "Registrar la etapa 5" }).click();
  await expect(e5.getByText("Cumplida")).toBeVisible();
  await expect(page.locator("#etapa-5-titulo")).toBeFocused();
  await expect(
    page.locator("#etapa-6").getByText("Sin construir"),
  ).toBeVisible();
  const resumen = page.getByTestId("cuaderno-resumen5");
  await expect(resumen).toContainText("no un resultado");
  await expect(resumen).toContainText(
    "ingreso_mensual menor que (<) 3000 o empleo es informal",
  );
  await expect(resumen).toContainText(
    "Si se cumple: actuar. Si no: no actuar.",
  );
  await axeBothThemes(page);

  // regla dura 2: el archivo exportado lleva nombres y números, jamás filas; nada viajó
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar cuaderno" }).click(),
  ]);
  const exportado = readFileSync((await descarga.path())!, "utf8");
  expect(exportado).toContain("regla_columnas");
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

test("etapa 5 con bajas: la compuerta dice qué falta; «no hay regla» con el teclado, y se verifica de nuevo al recargar", async ({
  page,
}) => {
  await prepararBajas(page);
  await cumplirEtapa4Bajas(page);
  const e5 = page.locator("#etapa-5");
  await expect(e5.getByText("Abierta", { exact: true })).toBeVisible();

  // sin elegir si hay regla, no se puede registrar; con «hay» y sin escribirla, la compuerta dice qué falta
  await expect(
    e5.getByRole("button", { name: "Registrar la etapa 5" }),
  ).toBeDisabled();
  await e5.getByLabel("Sí, hay una regla que se aplica hoy").check();
  await e5.getByRole("button", { name: "Registrar la etapa 5" }).click();
  await expect(e5.getByRole("alert")).toContainText("la regla completa");

  // «no hay regla», elegida con el teclado
  await e5.getByLabel("No, hoy no hay regla").focus();
  await page.keyboard.press("Space");
  await expect(e5.getByLabel("No, hoy no hay regla")).toBeChecked();
  await expect(e5.locator("[data-condicion]")).toHaveCount(0);
  await expect(
    e5.getByText(/Sin regla de hoy, el modelo competirá/),
  ).toBeVisible();
  await axeBothThemes(page);
  await e5.getByRole("button", { name: "Registrar la etapa 5" }).click();
  await expect(e5.getByText("Cumplida")).toBeVisible();
  await expect(page.getByTestId("cuaderno-resumen5")).toContainText(
    "Regla de hoy: no hay regla.",
  );

  // La etapa 5 depende de los datos: tras recargar pide el archivo y vuelve a verificar contra él
  await esperarGuardado(page);
  await page.reload();
  await expect(page.getByText("Abriendo tu cuaderno…")).toBeHidden();
  await expect(
    page.locator("#etapa-2").getByText("Por verificar"),
  ).toBeVisible();
  await expect(e5.getByText("Cerrada")).toBeVisible();
  await cargarCsv(page, "bajas-con-fuga.csv");
  await expect(e5.getByText("Cumplida")).toBeVisible();
  await axeBothThemes(page);
});
