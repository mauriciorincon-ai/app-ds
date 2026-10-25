import { expect, type Page } from "@playwright/test";

// S17 (ADR 023): «Estrésalo» en los resultados de Probeta. Mide bajo demanda: hasta el clic no hay lectura. Devuelve el
// bloque de la lectura (la frase, el ✓/⚠ con su palabra y tres tablas: ruido, columna revuelta y corrimiento).
export async function estresar(page: Page) {
  await expect(page.getByTestId("estres-lectura")).toHaveCount(0);
  await page.getByRole("button", { name: "Estrésalo" }).click();
  const lectura = page.getByTestId("estres-lectura");
  await expect(lectura).toBeVisible({ timeout: 240_000 });
  await expect(page.getByTestId("estres-frase")).toContainText(
    /^Con 10 % de ruido en los números, tu /,
  );
  // el criterio dice SIEMPRE su palabra, además del símbolo (el color nunca va solo)
  await expect(page.getByTestId("estres-sello")).toContainText(
    /^(✓ Con 10 % de ruido sigue ganándole|⚠ )/,
  );
  await expect(lectura.getByRole("table")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Volver a medir" }),
  ).toBeVisible();
  return lectura;
}
