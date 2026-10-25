import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { axeBothThemes } from "./axe-temas";

// S19 — del modelo a la decisión, en Probeta con el Pyodide de verdad (Campaña de marketing, «convirtio»):
//  · «¿Qué pasaría si?»: sube las visitas un 50 %, con sus costos escritos, y la lectura dice cuántas decisiones cambian y qué
//    significa en dinero, con la insignia «Verificada contra tus números»;
//  · «El modelo en reglas»: se pide, trae su fidelidad (con un 200 de filas de ejemplo no llega al umbral y se llama «un árbol que
//    se parece al modelo») y se descarga el SQL: un CASE WHEN sobre las columnas del modelo;
//  · vigilar el desempeño: el archivo de resultados con el canal que convierte invertido da «reentrenar», con el modelo recién
//    entrenado Y con el archivo exportado e importado en una sesión nueva; el que viene del mismo mundo no da «reentrenar»;
//  · ni una fila de los archivos de resultados sale por la red; axe en los dos temas.

const KIT = (nombre: string) =>
  resolve(process.cwd(), "docs/kit-de-prueba", nombre);
const CORRIDOS = KIT("marketing-resultados-corridos.csv");
const SIN_CAMBIO = KIT("marketing-resultados-sin-cambio.csv");

test.setTimeout(600_000);

test("entrenar → ¿qué pasaría si? → el modelo en reglas → vigilar el desempeño, también con el archivo importado, sin filas en la red", async ({
  page,
}) => {
  const peticiones: string[] = [];
  page.on("request", (r) =>
    peticiones.push(`${r.url()} ${r.postData() ?? ""}`),
  );

  await page.goto("/");
  await page.getByRole("button", { name: /Campaña de marketing/i }).click();
  await page.selectOption("#target", "convirtio");
  await page.getByRole("button", { name: /Entrenar modelo/i }).click();
  await expect(
    page.getByRole("button", { name: /Exportar modelo/i }),
  ).toBeVisible({ timeout: 240_000 });

  // ¿qué pasaría si?: +50 % de visitas, con los costos de actuar y de no actuar
  const sim = page.getByTestId("simulador-panel");
  await expect(sim.getByRole("heading", { name: "¿Qué pasaría si?" })).toBeVisible();
  await sim.getByLabel("Columna a cambiar").selectOption("visitas_web");
  await sim.getByLabel(/^Porcentaje/).fill("50");
  await sim.getByLabel(/Costo de actuar cuando no era/).fill("10");
  await sim.getByLabel(/Costo de no actuar cuando sí era/).fill("30");
  await sim.getByLabel(/^Unidad/).fill("USD");
  await sim.getByRole("button", { name: "Simular" }).click();
  const resumen = sim.getByTestId("simulador-resumen");
  await expect(resumen).toContainText("De 200 filas", { timeout: 120_000 });
  await expect(resumen).toContainText("por cada 100 decisiones");
  await expect(resumen).toContainText("USD");
  await expect(sim.getByTestId("simulador-verificada")).toContainText(
    "Verificada contra tus números",
  );

  // el modelo en reglas: la fidelidad primero; con 200 filas casi nunca llega al umbral y no se llama «el modelo en reglas»
  const reglas = page.getByTestId("reglas-panel");
  await reglas.getByRole("button", { name: "Ver el modelo en reglas" }).click();
  await expect(reglas.getByTestId("reglas-lectura")).toBeVisible({
    timeout: 120_000,
  });
  await expect(reglas.getByTestId("reglas-fidelidad")).toContainText(
    /\d+(\.\d)? % de \d+ filas que el árbol no vio/,
  );
  const veredicto = (await reglas.getByTestId("reglas-veredicto").textContent())!;
  if (veredicto.includes("⚠"))
    await expect(
      reglas.getByRole("heading", { name: "Un árbol que se parece al modelo" }),
    ).toBeVisible();
  else
    await expect(
      reglas.getByRole("heading", { name: "El modelo en reglas", exact: true }),
    ).toBeVisible();
  const [sql] = await Promise.all([
    page.waitForEvent("download"),
    reglas.getByRole("button", { name: "Descargar el SQL (.sql)" }).click(),
  ]);
  expect(sql.suggestedFilename()).toBe("reglas-marketing-campania.sql");
  const textoSql = readFileSync((await sql.path())!, "utf8");
  expect(textoSql).toMatch(/^SELECT t\.\*,\n {2}CASE\n {4}WHEN /);
  expect(textoSql).toContain('END AS "prediccion"');
  expect(textoSql).toContain('FROM "tu_tabla" t;');
  expect(textoSql).not.toContain("ELSE");
  await axeBothThemes(page);

  // guardar el modelo para la sesión nueva
  const [exportado] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /Exportar modelo/i }).click(),
  ]);
  const rutaModelo = (await exportado.path())!;

  // vigilar con el modelo recién entrenado: el mundo cambió → reentrenar
  await page.getByRole("button", { name: /Usar el modelo/i }).click();
  await page
    .locator('input[accept^=".csv,text/csv"]')
    .setInputFiles(CORRIDOS);
  const vigilar = page.getByTestId("vigilancia-panel");
  await expect(vigilar.getByTestId("vigilancia-veredicto")).toHaveAttribute(
    "data-veredicto",
    "reentrenar",
    { timeout: 120_000 },
  );
  await expect(vigilar.getByTestId("vigilancia-veredicto")).toContainText("✕");
  await expect(vigilar.getByTestId("vigilancia-cifras")).toContainText(
    /intervalo del 95 % de \d\.\d\d a \d\.\d\d \(300 filas\); en su prueba, \d\.\d\d\./,
  );
  await axeBothThemes(page);

  // el mismo mundo con otras filas: no pide reentrenar
  await page.getByRole("button", { name: "Puntuar otro CSV" }).click();
  await page
    .locator('input[accept^=".csv,text/csv"]')
    .setInputFiles(SIN_CAMBIO);
  await expect(vigilar.getByTestId("vigilancia-lectura")).toBeVisible({
    timeout: 120_000,
  });
  await expect(vigilar.getByTestId("vigilancia-veredicto")).not.toHaveAttribute(
    "data-veredicto",
    "reentrenar",
  );

  // sesión nueva: el archivo importado se vigila igual, con la cifra de su prueba tomada del manifiesto
  await page.reload();
  await expect(page.getByText("Empieza tu experimento")).toBeVisible();
  await page
    .locator('input[accept=".json,application/json"]')
    .setInputFiles(rutaModelo);
  await expect(page.getByText(/Modelo válido/)).toBeVisible();
  await page.getByRole("button", { name: /Usar este modelo/i }).click();
  await expect(page.getByText(/Arrastra tu CSV nuevo/)).toBeVisible({
    timeout: 240_000,
  });
  await page
    .locator('input[accept^=".csv,text/csv"]')
    .setInputFiles(CORRIDOS);
  await expect(
    page.getByTestId("vigilancia-panel").getByTestId("vigilancia-veredicto"),
  ).toHaveAttribute("data-veredicto", "reentrenar", { timeout: 120_000 });

  // regla dura 2: ni una fila de los archivos de resultados salió por la red
  const red = peticiones.join("\n");
  for (const archivo of [CORRIDOS, SIN_CAMBIO])
    for (const fila of readFileSync(archivo, "utf8")
      .split("\n")
      .slice(1, 30)
      .filter(Boolean))
      expect(red, `una fila de ${archivo} en la red`).not.toContain(fila);
  expect(red).not.toContain("/api/narrate");
});

test("un archivo sin la columna del objetivo no se vigila y lo dice; el simulador y las reglas no estorban a un modelo importado sin filas", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Campaña de marketing/i }).click();
  await page.selectOption("#target", "convirtio");
  await page.getByRole("button", { name: /Entrenar modelo/i }).click();
  await expect(
    page.getByRole("button", { name: /Usar el modelo/i }),
  ).toBeVisible({ timeout: 240_000 });
  await page.getByRole("button", { name: /Usar el modelo/i }).click();
  await page.locator('input[accept^=".csv,text/csv"]').setInputFiles({
    name: "sin-objetivo.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      [
        "edad,ingreso_mensual,visitas_web,correos_abiertos,region,dispositivo",
        "34,5000,10,5,sur,movil",
        "52,3800,4,1,oeste,escritorio",
      ].join("\n"),
    ),
  });
  const vigilar = page.getByTestId("vigilancia-panel");
  await expect(vigilar.getByTestId("vigilancia-sin-objetivo")).toContainText(
    "no trae la columna «convirtio»",
    { timeout: 60_000 },
  );
  await expect(vigilar.getByTestId("vigilancia-veredicto")).toHaveCount(0);
  // ¿qué pasaría si? también corre sobre las filas nuevas
  const sim = page.getByTestId("simulador-panel");
  await sim.getByRole("button", { name: "Simular" }).click();
  await expect(sim.getByTestId("simulador-resumen")).toContainText("De 2 filas", {
    timeout: 120_000,
  });
  await axeBothThemes(page);
});
