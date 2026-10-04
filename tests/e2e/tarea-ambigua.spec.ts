import { expect, test } from "@playwright/test";
import { axeBothThemes } from "./axe-temas";

// S6 (D2) — una columna con pocos números distintos no se adivina: la app
// pregunta «¿categorías o una cantidad?», con la lectura más probable marcada con
// símbolo + texto, y se responde con teclado. «Una cantidad» entrena la
// regresión; «Categorías» lleva a la multiclase, que todavía no se entrena (y se
// dice). La respuesta se puede cambiar. axe en ambos temas en cada estado.

test("ambigua: la pregunta, las dos respuestas y cambiarla", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Consumo de energía/i }).click();
  await page.selectOption("#target", "ocupantes");

  const question = page.getByRole("group", {
    name: "¿«ocupantes» guarda categorías o una cantidad?",
  });
  await expect(question).toBeVisible();
  await expect(question.getByText("Sugerida")).toBeVisible();
  const train = page.getByRole("button", { name: /Entrenar modelos/i });
  await expect(train).toBeDisabled();
  await axeBothThemes(page);

  // Por teclado: foco en «Una cantidad» y Enter.
  await question.getByRole("button", { name: /Una cantidad/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Respondiste: Una cantidad.")).toBeVisible();
  await expect(page.getByText(/Vas a estimar una cantidad/)).toBeVisible();
  await expect(train).toBeEnabled();
  await axeBothThemes(page);

  await page.getByRole("button", { name: /Cambiar la respuesta/ }).click();
  await question.getByRole("button", { name: /Categorías/ }).click();
  await expect(page.getByText("Respondiste: Categorías.")).toBeVisible();
  await expect(
    page.getByText(/llega en una próxima versión/).first(),
  ).toBeVisible();
  await expect(train).toBeDisabled();
  await axeBothThemes(page);
});
