import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { axeBothThemes } from "./axe-temas";
import {
  KIT,
  cargarCsv,
  cumplirEtapa4Bajas,
  cumplirEtapa4Credito,
  cumplirEtapa5SinRegla,
  esperarGuardado,
  prepararBajas,
  prepararCredito,
  sinDesborde,
} from "./protocolo-pasos";

// S11 — Protocolo DS, etapa 6 (la prueba sellada) con los dos archivos del kit:
//  · credito-fuga-plantada.csv (sin fecha ni unidad): la app sugiere estratificada y dice por qué;
//    la tabla cuenta 160 y 40 filas, la verificación y el sello se leen, registrar es sellar; axe
//    en los dos temas, 360 px sin desborde, y regla dura 2 (nada a /api/narrate, ninguna fila del
//    CSV en la red ni en el archivo exportado);
//  · bajas-con-fuga.csv (120 clientes, meses): primero la pregunta de unidades; con «nuevas», por
//    tiempo y por grupo con un mes de hueco y cero solape; al recargar y volver a cargar el CSV el
//    sello se recalcula y sigue intacto; un archivo editado con otro tamaño deja la 6 por verificar.

test("etapa 6 con crédito: estratificada sugerida, conteos por lado, sello, y nada viaja", async ({
  page,
}) => {
  const peticiones: string[] = [];
  page.on("request", (r) =>
    peticiones.push(`${r.url()} ${r.postData() ?? ""}`),
  );
  await prepararCredito(page);
  await cumplirEtapa4Credito(page);
  await cumplirEtapa5SinRegla(page);
  const e6 = page.locator("#etapa-6");
  await expect(e6.getByText("Abierta", { exact: true })).toBeVisible();

  // la sugerencia y su porqué; sin fecha ni unidad no hay pregunta
  await expect(e6.getByTestId("protocolo-sugerencia")).toContainText(
    "Estratificada: al azar",
  );
  await expect(e6.getByLabel("Estratificada · sugerido")).toBeChecked();
  await expect(
    e6.getByText(/unidades nuevas o con las que ya conoces/),
  ).toHaveCount(0);

  // la tabla: conteos y rangos, sin hueco; la verificación y el sello
  const tabla = e6.getByTestId("protocolo-particion");
  await expect(
    tabla.locator('tr[data-lado="entrenamiento"] td').first(),
  ).toHaveText("160");
  await expect(tabla.locator('tr[data-lado="prueba"] td').first()).toHaveText(
    "40",
  );
  await expect(tabla.locator('tr[data-lado="hueco"]')).toHaveCount(0);
  await expect(e6.getByTestId("protocolo-verificacion")).toContainText(
    "Ninguna fila está en dos lados.",
  );
  await expect(e6.getByTestId("protocolo-sello")).toContainText(
    /Sello: [0-9a-f]{12}…/,
  );
  await expect(e6.getByTestId("protocolo-sello")).toContainText(
    "no una promesa",
  );
  await axeBothThemes(page);
  await sinDesborde(page, 360);

  // registrar es sellar: la compuerta acepta, el foco vuelve al título, la 7 se ve sin construir
  await e6.getByRole("button", { name: "Registrar la etapa 6" }).click();
  await expect(e6.getByText("Cumplida")).toBeVisible();
  await expect(page.locator("#etapa-6-titulo")).toBeFocused();
  await expect(
    page.locator("#etapa-7").getByText("Sin construir"),
  ).toBeVisible();
  const resumen = page.getByTestId("cuaderno-resumen6");
  await expect(resumen).toContainText("Esquema: Estratificada.");
  await expect(resumen).toContainText("Entrenamiento: 160 filas · prueba: 40");
  await expect(resumen).toContainText(/Sello: [0-9a-f]{12}…/);
  await axeBothThemes(page);

  // regla dura 2: el archivo exportado lleva el sello y conteos, jamás filas; nada viajó
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar cuaderno" }).click(),
  ]);
  const exportado = readFileSync((await descarga.path())!, "utf8");
  expect(exportado).toMatch(/"sello": ?"[0-9a-f]{64}"/);
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

test("etapa 6 con bajas: unidades nuevas → tiempo y grupo con hueco; el sello sobrevive a recargar y un archivo editado no pasa", async ({
  page,
}) => {
  await prepararBajas(page);
  await cumplirEtapa4Bajas(page);
  await cumplirEtapa5SinRegla(page);
  const e6 = page.locator("#etapa-6");
  await expect(e6.getByText("Abierta", { exact: true })).toBeVisible();

  // sin decir con qué unidades se usará el modelo, no hay sugerencia y la compuerta lo nombra
  await expect(e6.getByTestId("protocolo-sugerencia")).toContainText(
    "Responde la pregunta de las unidades",
  );
  await e6.getByRole("button", { name: "Registrar la etapa 6" }).click();
  await expect(e6.getByRole("alert")).toContainText(
    "unidades nuevas o con las que ya conoces",
  );

  // unidades nuevas, con el teclado: por tiempo y por grupo, con un mes de horizonte
  await e6.getByLabel("Con unidades nuevas, que el modelo no vio").focus();
  await page.keyboard.press("Space");
  await expect(
    e6.getByLabel("Por tiempo y por grupo · sugerido"),
  ).toBeChecked();
  await e6
    .getByLabel("Horizonte: cuánto tarda en conocerse el resultado")
    .fill("1");
  await e6.getByLabel("Unidad del horizonte").selectOption("meses");
  const tabla = e6.getByTestId("protocolo-particion");
  await expect(tabla.locator('tr[data-lado="hueco"]')).toHaveCount(1);
  await expect(tabla.locator('tr[data-lado="fuera"]')).toContainText(
    "de unidades que están en la prueba",
  );
  await expect(e6.getByTestId("protocolo-tamano-real")).toContainText(
    "La prueba empieza el 2025-09-15.",
  );
  const verificado = e6.getByTestId("protocolo-verificacion");
  await expect(verificado).toContainText(
    "Ninguna unidad tiene filas en entrenamiento y en prueba.",
  );
  await expect(verificado).toContainText(
    "Ninguna fila de entrenamiento está a menos de un horizonte de la prueba.",
  );
  await expect(e6.getByText(/El hueco de 1 mes deja fuera/)).toBeVisible();
  await axeBothThemes(page);
  await sinDesborde(page, 360);
  await e6.getByRole("button", { name: "Registrar la etapa 6" }).click();
  await expect(e6.getByText("Cumplida")).toBeVisible();
  await expect(page.getByTestId("cuaderno-resumen6")).toContainText(
    "El modelo se usará con unidades nuevas.",
  );

  // al recargar, la 6 pide los datos; con el mismo CSV, el sello se recalcula y sigue intacto
  await esperarGuardado(page);
  await page.reload();
  await expect(page.getByText("Abriendo tu cuaderno…")).toBeHidden();
  await expect(e6.getByText("Cerrada")).toBeVisible();
  await cargarCsv(page, "bajas-con-fuga.csv");
  await expect(e6.getByText("Cumplida")).toBeVisible();

  // un archivo editado con otro tamaño de prueba (y el sello viejo) deja la 6 por verificar
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar cuaderno" }).click(),
  ]);
  const archivo = JSON.parse(
    readFileSync((await descarga.path())!, "utf8"),
  ) as {
    cuaderno: {
      evidencias: {
        etapa: number;
        datos: { respuestas: Record<string, unknown> };
      }[];
    };
  };
  archivo.cuaderno.evidencias.findLast(
    (e) => e.etapa === 6,
  )!.datos.respuestas.tamano = 30;
  await page.getByTestId("protocolo-importar").setInputFiles({
    name: "editado.protocolo.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(archivo)),
  });
  await page
    .getByRole("alertdialog", {
      name: "¿Reemplazar tu cuaderno por el del archivo?",
    })
    .getByRole("button", { name: "Sí, reemplazar" })
    .click();
  await expect(page.getByText(/Cuaderno importado/)).toBeVisible();
  await expect(e6.getByText("Por verificar")).toBeVisible();
  await expect(e6).toContainText(
    "Lo registrado no coincide con lo que dan tus datos",
  );
  await expect(page.locator("#etapa-5").getByText("Cumplida")).toBeVisible();
  await axeBothThemes(page);
});
