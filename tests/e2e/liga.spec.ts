import { expect, test } from "@playwright/test";
import { axeBothThemes } from "./axe-temas";

// S5 — la liga de punta a punta en el navegador real (build de producción en CI):
// Nivel 1 → tabla → ficha de lectura (<dialog> nativo: foco, Esc) → prueba a
// pedido y etiquetada → elegir a mano → «◆ Elegido por ti» en el veredicto y en la
// model card → volver al ganador. axe en ambos temas en Configuración (dos tareas
// que se entrenan), en Resultados y con la ficha abierta.

test("liga: tabla, ficha, prueba etiquetada y elección manual registrada", async ({
  page,
}) => {
  test.setTimeout(240_000);

  await page.goto("/");
  await page.getByRole("button", { name: /Rotación de empleados/i }).click();
  // E1 con varias categorías, auditada en ambos temas (AU-S5-08). S7 (cambio
  // esperado, R13): el caso «todavía no se entrena» desapareció — «departamento»
  // entrena como varias categorías.
  await page.selectOption("#target", "departamento");
  await expect(
    page.getByText(/categorías distintas → clasificación en varias categorías/),
  ).toBeVisible();
  await expect(page.getByText(/Vas a clasificar en \d+ categorías/)).toBeVisible();
  await expect(page.getByText(/próxima versión/)).toHaveCount(0);
  await axeBothThemes(page);
  await page.selectOption("#target", "renuncio");
  // E1 + E2 antes de entrenar: la tarea y quién compite.
  await expect(
    page.getByText(/valores distintos → clasificación binaria/),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Quién compite" }),
  ).toBeVisible();
  await axeBothThemes(page);
  await page.getByRole("button", { name: /Entrenar modelos/i }).click();

  await expect(
    page.getByRole("heading", { name: /La liga: \d+ modelos/ }),
  ).toBeVisible({ timeout: 150_000 });
  await expect(page.getByText("Ganador (validación cruzada)")).toBeVisible();

  // E3: el nombre del ganador abre su ficha en un <dialog> modal.
  const winnerRow = page
    .getByRole("row")
    .filter({ hasText: "Ganador (validación cruzada)" });
  const fichaButton = winnerRow.getByRole("button", { name: /^Ficha de / });
  await fichaButton.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText("En esta liga: ganador por validación cruzada."),
  ).toBeVisible();
  for (const section of ["Qué es", "Cuándo sirve", "Cuándo no", "Qué mirar"]) {
    await expect(dialog.getByText(section, { exact: true })).toBeVisible();
  }
  // Modal de verdad: el foco vive dentro del diálogo.
  await expect
    .poll(() =>
      page.evaluate(() => !!document.activeElement?.closest("dialog")),
    )
    .toBe(true);
  await axeBothThemes(page, "dialog");

  // Esc cierra y el foco vuelve al botón que la abrió.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(fichaButton).toBeFocused();
  await axeBothThemes(page);

  // La prueba existe, a pedido y etiquetada «no sirve para elegir».
  await page.getByRole("button", { name: /Ver puntajes de prueba/i }).click();
  await expect(
    page.getByText(/Estos puntajes son del conjunto de prueba/),
  ).toBeVisible();

  // U1: elegir a mano Random Forest (si no es el ganador) o Naive Bayes.
  const winnerText = (await winnerRow.innerText()).toLowerCase();
  const pick = winnerText.includes("random forest")
    ? "Naive Bayes"
    : "Random Forest";
  await page
    .getByRole("button", { name: `Elegir ${pick}`, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Volver al ganador" }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByText(/◆ Elegido por ti, no por la validación cruzada/),
  ).toBeVisible();
  // En la tabla, la fila del elegido lleva ◆ + «Elegido por ti».
  await expect(
    page.getByRole("rowheader", { name: new RegExp(`${pick} Elegido por ti`) }),
  ).toBeVisible();
  // La model card lo registra (vista previa plegable).
  await page.getByText("Ver el contenido").click();
  await expect(
    page.getByText(new RegExp(`◆ Elegido por ti: ${pick}`)),
  ).toBeVisible();
  // Mientras el worker ajustó, usar/exportar esperaron; ahora vuelven.
  await expect(
    page.getByRole("button", { name: /Exportar modelo/i }),
  ).toBeEnabled();

  // Volver al ganador devuelve la selección a la validación cruzada.
  await page.getByRole("button", { name: "Volver al ganador" }).click();
  await expect(
    page.getByText(/◆ Elegido por ti, no por la validación cruzada/),
  ).toHaveCount(0, { timeout: 60_000 });

  await axeBothThemes(page);
});
