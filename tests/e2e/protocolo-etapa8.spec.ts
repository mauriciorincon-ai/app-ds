import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { axeBothThemes } from "./axe-temas";
import {
  KIT,
  abrirPrueba,
  cumplirEtapa4Bajas,
  cumplirEtapa4Credito,
  cumplirEtapa5SinRegla,
  cumplirEtapa6Bajas,
  cumplirEtapa6Credito,
  cumplirEtapa7,
  prepararBajas,
  prepararCredito,
  sinDesborde,
} from "./protocolo-pasos";

// S13 — Protocolo DS, etapa 8 (la prueba, abierta una vez) con los dos archivos del kit y el worker de Pyodide
// de verdad:
//  · credito-fuga-plantada.csv (estratificada): lo que se abre y el aviso, abrir la prueba, la medida con su
//    intervalo y el optimismo, el peor segmento marcado, la calibración con su Brier y los peores casos en
//    pantalla; abrir otra vez lo mismo no suma; sin patrón no se registra; con él, la 8 queda cumplida y la 9
//    abre (S14; la 10 se ve sin construir); axe en los dos temas, 360 px sin desborde, y regla dura 2 (nada a /api/narrate,
//    ninguna fila del CSV en la red ni en el archivo exportado, ni los peores casos);
//  · bajas-con-fuga.csv (por tiempo y por grupo): el intervalo remuestrea clientes enteros y los segmentos
//    incluyen el periodo.

test.setTimeout(480_000);

test("etapa 8 con crédito: la prueba se abre una vez, se lee por segmento y calibración, y nada viaja", async ({
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
  await cumplirEtapa7(page);
  const e8 = page.locator("#etapa-8");
  await expect(e8.getByText("Abierta", { exact: true })).toBeVisible();

  // lo que se abre, antes de abrir nada
  const abre = e8.getByTestId("protocolo-abre8");
  await expect(abre).toContainText("40 filas");
  await expect(abre).toContainText("La prueba se abre una vez.");
  await expect(abre).not.toContainText("monto_recuperado");
  await expect(
    e8.getByRole("button", { name: "Registrar la etapa 8" }),
  ).toBeDisabled();

  await abrirPrueba(page);
  await expect(e8.getByTestId("protocolo-aperturas")).toHaveText(
    "Ya la abriste una vez.",
  );
  await expect(e8.getByTestId("protocolo-medida8")).toContainText(
    "Costo por cada 100 decisiones",
  );
  await expect(e8.getByTestId("protocolo-medida8")).toContainText(
    "remuestrea filas 1,000 veces",
  );
  await expect(e8.getByTestId("protocolo-optimismo")).toContainText(
    "Medida de selección (etapa 7)",
  );
  const peor = e8.locator("[data-testid=protocolo-segmento][data-peor]");
  await expect(peor).toHaveCount(1);
  await expect(peor).toContainText("el peor");
  await expect(e8.getByTestId("protocolo-segmentos")).toContainText(
    "sin soporte",
  );
  await expect(e8.getByTestId("protocolo-brier")).toContainText("Brier:");
  await expect(e8.getByTestId("protocolo-tramo")).toHaveCount(5);
  await expect(e8.getByTestId("protocolo-peor")).toHaveCount(10);

  // abrir otra vez lo mismo no suma: la cuenta sigue en una. Un observador anota cada texto del progreso desde
  // antes del clic, para saber que la segunda apertura terminó (puede durar menos que un sondeo)
  await page.evaluate(() => {
    const el = document.querySelector(
      "#etapa-8 [data-testid=protocolo-progreso8]",
    )!;
    const w = window as unknown as { progreso8: string[] };
    w.progreso8 = [];
    new MutationObserver(() => w.progreso8.push(el.textContent ?? "")).observe(
      el,
      { childList: true, characterData: true, subtree: true },
    );
  });
  await e8.getByRole("button", { name: "Abrir la prueba otra vez" }).click();
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as unknown as { progreso8: string[] }).progreso8,
        ),
      { timeout: 240_000 },
    )
    .toEqual(expect.arrayContaining([expect.stringMatching(/…$/), ""]));
  await expect(e8.getByTestId("protocolo-medida8")).toBeVisible();
  await expect(e8.getByTestId("protocolo-aperturas")).toHaveText(
    "Ya la abriste una vez.",
  );

  await axeBothThemes(page);
  await sinDesborde(page, 360);

  // sin patrón la compuerta lo nombra; con él, se registra
  const registrar = e8.getByRole("button", { name: "Registrar la etapa 8" });
  await registrar.click();
  await expect(e8.getByRole("alert")).toContainText("tu patrón de fallo");
  await e8
    .getByLabel("Tu patrón de fallo")
    .fill("Falla con quienes trabajan en la informalidad");
  await registrar.click();
  await expect(e8.getByText("Cumplida")).toBeVisible();
  await expect(page.locator("#etapa-8-titulo")).toBeFocused();
  await expect(
    page.locator("#etapa-9").getByText("Abierta", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("#etapa-10").getByText("Cerrada", { exact: true }),
  ).toBeVisible();
  const resumen = page.getByTestId("cuaderno-resumen8");
  await expect(resumen).toContainText("Peor segmento:");
  await expect(resumen).toContainText("La prueba se abrió una vez.");
  await expect(resumen).toContainText(
    "«Falla con quienes trabajan en la informalidad»",
  );
  await expect(page.getByTestId("cuaderno-resumen7")).toContainText(
    "abrió la prueba después",
  );
  await axeBothThemes(page);

  // regla dura 2: el archivo exportado lleva conteos y tu patrón, jamás filas ni los peores casos
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar cuaderno" }).click(),
  ]);
  const exportado = readFileSync((await descarga.path())!, "utf8");
  expect(exportado).toMatch(/"peores_n": ?10/);
  // S16 (S13 B5): abrirla dos veces con lo mismo anota UNA apertura (la misma clave no se repite en el cuaderno)
  const aperturas = (
    JSON.parse(exportado) as { cuaderno: { aperturas: { clave: string }[] } }
  ).cuaderno.aperturas;
  expect(aperturas).toHaveLength(1);
  expect(new Set(aperturas.map((a) => a.clave)).size).toBe(1);
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

test("etapa 8 con bajas: el intervalo remuestrea clientes enteros y el periodo es un segmento", async ({
  page,
}) => {
  await prepararBajas(page);
  await cumplirEtapa4Bajas(page);
  await cumplirEtapa5SinRegla(page);
  await cumplirEtapa6Bajas(page);
  await cumplirEtapa7(page);
  const e8 = page.locator("#etapa-8");
  await abrirPrueba(page);
  await expect(e8.getByTestId("protocolo-medida8")).toContainText(
    "unidades enteras",
  );
  await expect(e8.getByTestId("protocolo-segmentos")).toContainText(
    "el periodo 2025-",
  );
  await expect(
    e8.locator("[data-testid=protocolo-segmento][data-peor]"),
  ).toHaveCount(1);
  await sinDesborde(page, 360);
  await e8
    .getByLabel("Tu patrón de fallo")
    .fill("Falla con los clientes de plan básico");
  await e8.getByRole("button", { name: "Registrar la etapa 8" }).click();
  await expect(e8.getByText("Cumplida")).toBeVisible();
});
