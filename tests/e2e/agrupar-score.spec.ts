import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { axeBothThemes } from "./axe-temas";

// S7 (ADR 016, P12) — el agrupamiento sobrevive a la pestaña: agrupar → exportar
// (.probeta.json con `task: "agrupar"`, la regla y SIN filas de entrenamiento) →
// RECARGAR → importar (el resumen dice sus grupos y su lectura) → asignar filas
// nuevas SIN re-agrupar → la columna `grupo`. Regla dura 2: ni el payload del
// modelo ni el CSV nuevo en la red.

const NEW_CSV = [
  "gasto_mensual_usd,visitas_mes,antiguedad_meses,canal",
  "655.2,5,30,tienda",
  "120.4,1,4,web",
  "310.8,12,60,app",
].join("\n");

test("agrupar: exportar → recargar → importar → asignar filas nuevas con «grupo»", async ({
  page,
}) => {
  test.setTimeout(300_000);

  await page.goto("/");
  await page
    .locator('input[accept=".csv,text/csv"]')
    .setInputFiles(
      resolve(process.cwd(), "docs/kit-de-prueba/segmentos-clientes.csv"),
    );
  await page.selectOption("#target", {
    label: "Sin objetivo: agrupar filas parecidas",
  });
  await page.getByRole("button", { name: /Agrupar filas/ }).click();
  await expect(
    page.getByRole("button", { name: /Exportar modelo/i }),
  ).toBeVisible({ timeout: 150_000 });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Exportar modelo/i }).click();
  const filePath = (await (await downloadPromise).path())!;
  const text = readFileSync(filePath, "utf8");
  const exported = JSON.parse(text) as {
    manifest: { task: string; groups: number; schema: { task: string } };
    payload: string;
  };
  expect(exported.manifest.task).toBe("agrupar");
  expect(exported.manifest.schema.task).toBe("agrupar");
  // P13: ninguna fila del entrenamiento ni etiqueta por fila en el archivo.
  expect(text).not.toContain('"labels"');
  expect(text).not.toContain("C0001");
  const payloadNeedle = exported.payload.slice(100, 140);

  await page.reload();
  await expect(page.getByText("Empieza tu experimento")).toBeVisible();
  const requests: string[] = [];
  page.on("request", (request) => {
    requests.push(`${request.url()} ${request.postData() ?? ""}`);
  });

  await page
    .locator('input[accept=".json,application/json"]')
    .setInputFiles(filePath);
  await expect(page.getByText(/Modelo válido/)).toBeVisible();
  await expect(
    page.getByText(
      `Agrupa filas sin objetivo: ${exported.manifest.groups} grupos`,
      {
        exact: false,
      },
    ),
  ).toBeVisible();
  await expect(page.getByText(/Lectura al entrenar:/)).toBeVisible();
  await axeBothThemes(page);

  await page.getByRole("button", { name: /Usar este modelo/i }).click();
  await expect(
    page.getByText(
      `Modelo: segmentos-clientes.csv · ${exported.manifest.groups} grupos`,
    ),
  ).toBeVisible();
  await expect(page.getByText(/Arrastra tu CSV nuevo/)).toBeVisible({
    timeout: 150_000,
  });

  await page.locator('input[accept=".csv,text/csv"]').setInputFiles({
    name: "clientes-nuevos.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(NEW_CSV),
  });
  await expect(page.getByText("Grupos asignados (3 filas)")).toBeVisible({
    timeout: 60_000,
  });

  const scoredPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Descargar CSV puntuado/i }).click();
  const scored = readFileSync((await (await scoredPromise).path())!, "utf8")
    .trim()
    .split("\n");
  expect(scored[0]).toBe(
    "gasto_mensual_usd,visitas_mes,antiguedad_meses,canal,grupo",
  );
  for (const line of scored.slice(1)) {
    expect(line.split(",").at(-1)).toMatch(/^(\d+|fuera de todo grupo)$/);
  }

  const traffic = requests.join("\n");
  expect(traffic).not.toContain(payloadNeedle);
  expect(traffic).not.toContain("655.2,5,30");

  await axeBothThemes(page);
});
