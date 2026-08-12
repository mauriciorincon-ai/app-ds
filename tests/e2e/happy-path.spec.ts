import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Happy path del veredicto honesto: elegir ejemplo → objetivo → entrenar → ver
// veredicto. Ejercita el flujo real en navegador, incluido el worker de Pyodide
// cargando pandas + scikit-learn. La primera carga del runtime WASM es lenta.
test("del inicio al veredicto con un dataset de ejemplo", async ({ page }) => {
  test.setTimeout(180_000);

  await page.goto("/");

  // Pantalla de inicio: elegir el ejemplo de marketing.
  await page.getByRole("button", { name: /Campaña de marketing/i }).click();

  // Configuración: un dataset limpio DICE de frente que no hubo nada que sanear.
  await expect(page.getByText(/nada que sanear/i)).toBeVisible();

  // Elegir el objetivo binario y entrenar.
  await expect(page.getByLabel(/¿Qué quieres predecir\?/i)).toBeVisible();
  await page.selectOption("#target", "convirtio");
  await page.getByRole("button", { name: /Entrenar modelo/i }).click();

  // Resultados: el veredicto aparece (carga de Pyodide + entrenamiento).
  await expect(
    page.getByRole("button", { name: /Nuevo experimento/i }),
  ).toBeVisible({
    timeout: 150_000,
  });
  await expect(page.getByText(/Métrica principal/i)).toBeVisible();

  // Gate ⭐ S4 (bloque B): el veredicto NOMBRA al modelo ganador.
  await expect(
    page.getByRole("heading", { name: /«.+» supera al baseline/ }),
  ).toBeVisible();

  // S4: los candidatos compitieron y se marcó al ganador (símbolo + texto).
  // exact:true — el nombre del ganador también aparece en el titular del
  // veredicto; aquí se afirma la celda de la tabla comparativa.
  await expect(page.getByText(/Modelos que compitieron/i)).toBeVisible();
  await expect(
    page.getByText("HistGradientBoosting", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Random Forest", { exact: true })).toBeVisible();
  await expect(page.getByText("elegido")).toBeVisible();

  // A11y: sin violaciones en la pantalla de resultados.
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
