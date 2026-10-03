import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// S5 (R1) — cancelar el Nivel 2 no deja la app sin modelo. Con liga-mediana.csv
// (5.000 filas, D6) el Nivel 1 no lo abarca todo: la tarjeta del Nivel 2 estima la
// liga completa EN ESTE EQUIPO; se arranca, se cancela a media liga (terminate +
// worker nuevo + restaurar la instantánea) y la app sigue usable: vuelve el
// resultado anterior y el modelo se EXPORTA.

const MEDIANA = resolve(__dirname, "../../docs/kit-de-prueba/liga-mediana.csv");

test("Nivel 2: estimar → arrancar → cancelar → el Nivel 1 vuelve y exporta", async ({
  page,
}) => {
  test.setTimeout(300_000);

  await page.goto("/");
  await page.locator('input[accept=".csv,text/csv"]').setInputFiles({
    name: "liga-mediana.csv",
    mimeType: "text/csv",
    buffer: readFileSync(MEDIANA),
  });
  await page.selectOption("#target", "objetivo");
  await expect(page.getByText(/Nivel 2 · después, si quieres/)).toBeVisible();
  await page.getByRole("button", { name: /Entrenar modelos/i }).click();

  const title = page.getByRole("heading", { name: /La liga: \d+ modelos/ });
  await expect(title).toBeVisible({ timeout: 180_000 });
  const level1Title = await title.innerText();
  // Pendientes del Nivel 2 a la vista, como filas con su razón.
  await expect(page.getByText(/Nivel 2 · pendiente/).first()).toBeVisible();

  // La tarjeta del Nivel 2: qué suma y cuánto tardaría EN ESTE EQUIPO.
  await expect(
    page.getByRole("heading", { name: "Nivel 2: la liga completa" }),
  ).toBeVisible();
  await expect(page.getByText("Calibrado con lo que tardó la corrida anterior.")).toBeVisible();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);

  await page.getByRole("button", { name: /Correr el Nivel 2/ }).click();
  await expect(page.getByText(/Nivel 2 · \d+ modelos · unos/)).toBeVisible();
  // Se cancela con la liga ya corriendo (la instantánea ya se tomó).
  await expect(
    page.getByText(/Validación cruzada · modelo \d+ de \d+/),
  ).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "Cancelar el Nivel 2" }).click();

  // Vuelve el resultado anterior, dicho de frente.
  await expect(
    page.getByText(
      /Cancelaste el Nivel 2. Sigue vigente el resultado anterior./,
    ),
  ).toBeVisible();
  await expect(title).toHaveText(level1Title);

  // El modelo vuelve (worker nuevo: recarga Pyodide + import de la instantánea)
  // y la app sigue usable: exportar funciona.
  const exportButton = page.getByRole("button", { name: /Exportar modelo/i });
  await expect(exportButton).toBeEnabled({ timeout: 150_000 });
  await expect(page.getByText("Recuperando el modelo anterior…")).toHaveCount(
    0,
  );
  const downloadPromise = page.waitForEvent("download");
  await exportButton.click();
  const download = await downloadPromise;
  const exported = JSON.parse(
    readFileSync((await download.path())!, "utf8"),
  ) as {
    manifest: {
      model_name: string;
      league?: unknown[];
      selection?: { by: string };
    };
  };
  expect(exported.manifest.selection?.by).toBe("cv");
  // El manifiesto es el del Nivel 1: la liga que corrió, no la cancelada.
  const level1Count = Number(level1Title.match(/\d+/)![0]);
  expect(exported.manifest.league).toHaveLength(level1Count);

  await expect(
    page.getByRole("button", { name: "Usar el modelo" }),
  ).toBeEnabled();
});
