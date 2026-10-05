import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { axeBothThemes } from "./axe-temas";

// S7 (ADR 015) — el modelo de varias categorías sobrevive a la pestaña: entrenar →
// exportar (.probeta.json con `task: "multiclase"` y sus clases) → RECARGAR →
// importar (el resumen dice cuántas categorías) → puntuar SIN re-entrenar → la
// categoría predicha y la probabilidad de ESA categoría. Regla dura 2: ni el
// payload del modelo ni el CSV nuevo en la red.

const NEW_CSV = [
  "usuarios,uso_gb_mes,antiguedad_meses,llamadas_soporte_mes,pago,region",
  "1,12.5,40,2,mensual,centro",
  "35,620.1,18,0,anual,norte",
].join("\n");

test("varias categorías: exportar → recargar → importar → puntuar con «_predicho»", async ({
  page,
}) => {
  test.setTimeout(300_000);

  await page.goto("/");
  await page
    .locator('input[accept=".csv,text/csv"]')
    .setInputFiles(
      resolve(process.cwd(), "docs/kit-de-prueba/planes-suscripcion.csv"),
    );
  await page.selectOption("#target", "plan");
  await page.getByRole("button", { name: /Entrenar modelos/i }).click();
  await expect(
    page.getByRole("button", { name: /Exportar modelo/i }),
  ).toBeVisible({ timeout: 150_000 });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Exportar modelo/i }).click();
  const filePath = (await (await downloadPromise).path())!;
  const exported = JSON.parse(readFileSync(filePath, "utf8")) as {
    manifest: { task: string; schema: { task: string; classes: string[] } };
    payload: string;
  };
  expect(exported.manifest.task).toBe("multiclase");
  expect(exported.manifest.schema.task).toBe("multiclase");
  expect(exported.manifest.schema.classes).toHaveLength(5);
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
    page.getByText("Clasifica «plan» en 5 categorías"),
  ).toBeVisible();
  await expect(
    page.getByText(/Exactitud balanceada en prueba: \d\.\d\d/),
  ).toBeVisible();
  await axeBothThemes(page);

  await page.getByRole("button", { name: /Usar este modelo/i }).click();
  await expect(
    page.getByText(
      "Modelo: planes-suscripcion.csv · objetivo: plan · 5 categorías",
    ),
  ).toBeVisible();
  await expect(page.getByText(/Arrastra tu CSV nuevo/)).toBeVisible({
    timeout: 150_000,
  });

  await page.locator('input[accept=".csv,text/csv"]').setInputFiles({
    name: "planes-nuevos.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(NEW_CSV),
  });
  await expect(page.getByText("plan_predicho")).toBeVisible({
    timeout: 60_000,
  });

  const scoredPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Descargar CSV puntuado/i }).click();
  const scored = readFileSync((await (await scoredPromise).path())!, "utf8")
    .trim()
    .split("\n");
  const header = scored[0]!.split(",");
  expect(header.slice(-2)).toEqual(expect.arrayContaining(["plan_predicho"]));
  const classes = new Set(exported.manifest.schema.classes);
  const predictedAt = header.indexOf("plan_predicho");
  for (const line of scored.slice(1)) {
    expect(classes.has(line.split(",")[predictedAt]!)).toBe(true);
  }

  const traffic = requests.join("\n");
  expect(traffic).not.toContain(payloadNeedle);
  expect(traffic).not.toContain("35,620.1,18");

  await axeBothThemes(page);
});
