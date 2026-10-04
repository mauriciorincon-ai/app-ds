import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

// axe en ambos temas (S5, AU-S5-08), compartido por las specs de la liga.
//
// axe mide contraste con la opacidad del momento: un botón que se rehabilita
// funde de 0,5 a 1 en 150 ms y, medido a mitad, «falla» contraste. Se espera a
// que no quede ninguna transición en curso (misma lección que la pasada de
// capturas: el botón pálido era la transición a medio camino). El cursor sale
// de la página antes: un primario bajo el puntero queda en hover:opacity-90.
export async function settle(page: Page) {
  await page.mouse.move(0, 0);
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].every(
      (button) => button.disabled || getComputedStyle(button).opacity === "1",
    ),
  );
}

// Con un modal abierto, lo de atrás es inerte (no se percibe ni se alcanza): se
// audita el diálogo (`scope`). Sin modal, la página entera. Vuelve al tema claro.
export async function axeBothThemes(page: Page, scope?: string) {
  await settle(page);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    // El cambio de tema dispara las `transition-colors` (fondo y borde funden 150 ms):
    // medido a mitad, el texto del tema nuevo queda sobre el fondo del viejo y «falla»
    // contraste (S6: Inicio vacío, primera pantalla con contenedores con transición).
    await page.waitForFunction(() =>
      document.getAnimations().every((a) => a.playState !== "running"),
    );
    const builder = new AxeBuilder({ page });
    const axe = await (scope ? builder.include(scope) : builder).analyze();
    expect(axe.violations, `axe (${colorScheme})`).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: "light" });
}
