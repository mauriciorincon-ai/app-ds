import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { axeBothThemes } from "./axe-temas";
import {
  KIT,
  cargarCsv,
  correrLiga,
  cumplirEtapa4Bajas,
  cumplirEtapa4Credito,
  cumplirEtapa5SinRegla,
  cumplirEtapa6Bajas,
  cumplirEtapa6Credito,
  esperarGuardado,
  prepararBajas,
  prepararCredito,
  sinDesborde,
} from "./protocolo-pasos";

// S12 — Protocolo DS, etapa 7 (el ganador, con la prueba cerrada) con los dos archivos del kit, con el worker
// de Pyodide de verdad:
//  · credito-fuga-plantada.csv (estratificada): lo que hereda, los pliegues verificados, la liga como medida
//    de selección, por qué ganó, la comparación con la línea base con su intervalo y la permutación; registrar
//    abre la 8 (S13); axe en los dos temas, 360 px sin desborde, y regla dura 2 (nada a
//    /api/narrate, ninguna fila del CSV en la red ni en el archivo exportado);
//  · bajas-con-fuga.csv (por tiempo y por grupo, un mes de hueco): pliegues con el hueco y sin unidades
//    cruzadas; al recargar, la 7 pide los datos y con el mismo CSV vuelve a cuadrar.

test.setTimeout(420_000);

test("etapa 7 con crédito: la liga en sus pliegues, contra la línea base, con su permutación, y nada viaja", async ({
  page,
}) => {
  const peticiones: string[] = [];
  page.on("request", (r) =>
    peticiones.push(`${r.url()} ${r.postData() ?? ""}`),
  );
  await prepararCredito(page);
  await cumplirEtapa4Credito(page);
  await cumplirEtapa5SinRegla(page);
  await cumplirEtapa6Credito(page);
  const e7 = page.locator("#etapa-7");
  await expect(e7.getByText("Abierta", { exact: true })).toBeVisible();

  // lo que hereda y los pliegues, antes de correr nada
  await expect(e7.getByTestId("protocolo-hereda")).toContainText(
    "Estratificada",
  );
  await expect(e7.getByTestId("protocolo-hereda")).not.toContainText(
    "monto_recuperado",
  );
  await expect(
    e7.getByTestId("protocolo-pliegues").locator("tr[data-pliegue]"),
  ).toHaveCount(5);
  await expect(e7.getByTestId("protocolo-verificacion7")).toContainText(
    "Ninguna fila de la prueba entra a un pliegue.",
  );
  await expect(
    e7.getByRole("button", { name: "Registrar la etapa 7" }),
  ).toBeDisabled();

  await correrLiga(page);
  await expect(e7.getByTestId("protocolo-liga")).toContainText(
    "medida de selección",
  );
  await expect(e7.getByTestId("protocolo-liga")).toContainText("ganador");
  await expect(e7.getByTestId("protocolo-porque-gano")).toContainText(
    "error estándar",
  );
  await expect(
    e7.getByTestId("protocolo-comparacion").locator("tr[data-pliegue]"),
  ).toHaveCount(5);
  await expect(e7.getByTestId("protocolo-comparacion")).toContainText(
    "intervalo del 95",
  );
  await expect(e7.getByTestId("protocolo-veredicto7")).toContainText(
    /(No supera|Supera) a la línea base/,
  );
  await expect(e7.getByTestId("protocolo-permutacion")).toContainText(
    /barajadas \d+ veces/,
  );
  // con la fuga plantada del kit, el ganador encuentra algo que el azar no encuentra
  await expect(e7.getByTestId("protocolo-permutacion")).toContainText(
    "Hay señal",
  );
  await axeBothThemes(page);
  await sinDesborde(page, 360);

  // registrar: la compuerta acepta, la 8 abre, y el cuaderno lo resume
  await e7.getByRole("button", { name: "Registrar la etapa 7" }).click();
  await expect(e7.getByText("Cumplida")).toBeVisible();
  await expect(page.locator("#etapa-7-titulo")).toBeFocused();
  await expect(
    page.locator("#etapa-8").getByText("Abierta", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("#etapa-9").getByText("Cerrada", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("#etapa-10").getByText("Cerrada", { exact: true }),
  ).toBeVisible();
  const resumen = page.getByTestId("cuaderno-resumen7");
  await expect(resumen).toContainText("Ganador:");
  await expect(resumen).toContainText("medida de selección");
  await expect(resumen).toContainText("La prueba sigue cerrada");
  await axeBothThemes(page);

  // regla dura 2: el archivo exportado lleva agregados por pliegue, jamás filas; nada viajó
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar cuaderno" }).click(),
  ]);
  const exportado = readFileSync((await descarga.path())!, "utf8");
  expect(exportado).toMatch(/"huella_pliegues": ?"[0-9a-f]{64}"/);
  const csv = readFileSync(KIT("credito-fuga-plantada.csv"), "utf8").split(
    "\n",
  );
  for (const fila of csv.slice(1).filter(Boolean))
    expect(exportado, `una fila del CSV en el archivo: ${fila}`).not.toContain(
      fila,
    );
  const red = peticiones.join("\n");
  expect(red).not.toContain("/api/narrate");
  for (const fila of csv.slice(1, 60).filter(Boolean))
    expect(red, `una fila del CSV en la red: ${fila}`).not.toContain(fila);
});

test("etapa 7 con bajas: por tiempo y por grupo, con el hueco; al recargar vuelve a cuadrar con el mismo CSV", async ({
  page,
}) => {
  await prepararBajas(page);
  await cumplirEtapa4Bajas(page);
  await cumplirEtapa5SinRegla(page);
  await cumplirEtapa6Bajas(page);
  const e7 = page.locator("#etapa-7");
  await expect(e7.getByText("Abierta", { exact: true })).toBeVisible();
  await expect(e7.getByTestId("protocolo-hereda")).toContainText(
    "Por tiempo y por grupo",
  );
  const verificado = e7.getByTestId("protocolo-verificacion7");
  await expect(verificado).toContainText(
    "Ninguna unidad tiene filas en los dos lados de un pliegue.",
  );
  await expect(verificado).toContainText(
    "Ningún entrenamiento está a menos de un horizonte de su validación.",
  );
  await expect(e7.getByTestId("protocolo-pliegues")).toContainText(
    "el primer periodo solo enseña",
  );
  await sinDesborde(page, 360);

  await correrLiga(page);
  await expect(e7.getByTestId("protocolo-veredicto7")).toBeVisible();
  await e7.getByRole("button", { name: "Registrar la etapa 7" }).click();
  await expect(e7.getByText("Cumplida")).toBeVisible();

  // al recargar, la 7 pide los datos; con el mismo CSV, los pliegues se rehacen y cuadran
  await esperarGuardado(page);
  await page.reload();
  await expect(page.getByText("Abriendo tu cuaderno…")).toBeHidden();
  await expect(e7.getByText("Cerrada", { exact: true })).toBeVisible();
  await cargarCsv(page, "bajas-con-fuga.csv");
  await expect(e7.getByText("Cumplida")).toBeVisible();
  await expect(
    page.locator("#etapa-8").getByText("Abierta", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("#etapa-9").getByText("Cerrada", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("#etapa-10").getByText("Cerrada", { exact: true }),
  ).toBeVisible();
});
