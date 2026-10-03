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
  // ^: la plantilla de narración también dice "la métrica principal aquí es…".
  await expect(page.getByText(/^Métrica principal:/)).toBeVisible();

  // Gate ⭐ S4 (bloque B): el veredicto NOMBRA al modelo ganador.
  await expect(
    page.getByRole("heading", { name: /«.+» supera al baseline/ }),
  ).toBeVisible();

  // S5 (R4, cambio esperado): la liga reemplaza a los dos candidatos de H1.
  // El ganador lleva marca + TEXTO (no solo color) y la regla está a la vista.
  await expect(
    page.getByRole("heading", { name: /La liga: \d+ modelos/ }),
  ).toBeVisible();
  await expect(page.getByText("Ganador (validación cruzada)")).toBeVisible();
  await expect(
    page.getByText(
      /La tabla se calcula con validación cruzada: sirve para elegir/,
    ),
  ).toBeVisible();
  // Los puntajes de prueba existen, pero se abren a pedido y etiquetados.
  await expect(page.getByText(/Prueba · .* no sirve para elegir/i)).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: /Ver puntajes de prueba/i }).click();
  await expect(
    page.getByText(/Estos puntajes son del conjunto de prueba/),
  ).toBeVisible();

  // A11y: sin violaciones en la pantalla de resultados.
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
