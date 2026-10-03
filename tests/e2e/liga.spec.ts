import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// S5 — la liga de punta a punta en el navegador real (build de producción en CI):
// Nivel 1 → tabla → ficha de lectura (<dialog> nativo: foco, Esc) → prueba a
// pedido y etiquetada → elegir a mano → «◆ Elegido por ti» en el veredicto y en la
// model card → volver al ganador. axe en ambos temas con la ficha abierta.

// Con un modal abierto, lo de atrás es inerte (no se percibe ni se alcanza): se
// audita el diálogo. Sin modal, la página entera.
// axe mide contraste con la opacidad del momento: un botón que se rehabilita
// funde de 0,5 a 1 en 150 ms y, medido a mitad, «falla» contraste. Se espera a
// que no quede ninguna transición en curso (misma lección que la pasada de
// capturas: el botón pálido era la transición a medio camino).
async function settle(page: Page) {
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].every(
      (button) => button.disabled || getComputedStyle(button).opacity === "1",
    ),
  );
}

async function axeBothThemes(page: Page, scope?: string) {
  await settle(page);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    const builder = new AxeBuilder({ page });
    const axe = await (scope ? builder.include(scope) : builder).analyze();
    expect(axe.violations, `axe (${colorScheme})`).toEqual([]);
  }
}

test("liga: tabla, ficha, prueba etiquetada y elección manual registrada", async ({
  page,
}) => {
  test.setTimeout(240_000);

  await page.goto("/");
  await page.getByRole("button", { name: /Rotación de empleados/i }).click();
  await page.selectOption("#target", "renuncio");
  // E1 + E2 antes de entrenar: la tarea y quién compite.
  await expect(
    page.getByText(/valores distintos → clasificación binaria/),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Quién compite" }),
  ).toBeVisible();
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
  await page.emulateMedia({ colorScheme: "light" });

  // Esc cierra y el foco vuelve al botón que la abrió.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(fichaButton).toBeFocused();
  await axeBothThemes(page);
  await page.emulateMedia({ colorScheme: "light" });

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
