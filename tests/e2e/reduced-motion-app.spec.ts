import { expect, test, type Locator } from "@playwright/test";

// S5 — reduced-motion sobre las pantallas de la APP (el brochure tiene su propio
// e2e). Con «reducir movimiento» la experiencia es completa y quieta: lo que se
// muestra se VE de verdad (opacidad efectiva 1, contando ancestros; nada a medio
// fundido) y las transiciones de botones y zonas de carga se apagan
// (motion-reduce:transition-none). toBeVisible() no basta: un elemento con opacity 0 es «visible»
// para Playwright.

async function effectiveOpacity(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    let opacity = 1;
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.visibility === "hidden" || style.display === "none") return 0;
      opacity *= Number(style.opacity);
    }
    return opacity;
  });
}

/** motion-reduce:transition-none ⇒ no hay propiedad que transicione. */
async function transitionOff(locator: Locator): Promise<boolean> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return (
      style.transitionProperty === "none" ||
      style.transitionDuration.split(",").every((d) => parseFloat(d) === 0)
    );
  });
}

async function expectReallyVisible(locator: Locator) {
  await expect(locator).toBeVisible();
  await locator.scrollIntoViewIfNeeded();
  expect(await effectiveOpacity(locator)).toBe(1);
  const box = await locator.boundingBox();
  expect(box && box.width > 0 && box.height > 0).toBe(true);
}

test.use({ reducedMotion: "reduce" });

test("reduced-motion: configurar → liga → ficha, todo visible y sin transiciones", async ({
  page,
}) => {
  test.setTimeout(240_000);

  await page.goto("/");
  expect(
    await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);

  const example = page.getByRole("button", { name: /Rotación de empleados/i });
  await expectReallyVisible(example);
  // motion-reduce: las tarjetas de ejemplo no animan su borde.
  expect(await transitionOff(example)).toBe(true);
  await example.click();

  await page.selectOption("#target", "renuncio");
  const train = page.getByRole("button", { name: /Entrenar modelos/i });
  await expectReallyVisible(train);
  // Los botones no funden su opacidad al habilitarse (pasada de capturas S5:
  // un botón capturado a mitad de transición se veía pálido).
  expect(await transitionOff(train)).toBe(true);
  await expectReallyVisible(
    page.getByRole("heading", { name: "Quién compite" }),
  );
  await train.click();

  const league = page.getByRole("heading", { name: /La liga: \d+ modelos/ });
  await expect(league).toBeVisible({ timeout: 150_000 });
  await expectReallyVisible(page.getByRole("heading", { level: 1 }));
  await expectReallyVisible(league);
  await expectReallyVisible(page.getByText("Ganador (validación cruzada)"));

  await page.getByRole("button", { name: /Ver puntajes de prueba/i }).click();
  await expectReallyVisible(
    page.getByText(/Estos puntajes son del conjunto de prueba/),
  );

  await page
    .getByRole("button", { name: /^Ficha de / })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expectReallyVisible(dialog);
  await expectReallyVisible(dialog.getByRole("heading"));

  // Quieto de verdad: ninguna animación ni transición en curso.
  expect(
    await page.evaluate(
      () =>
        document.getAnimations().filter((a) => a.playState === "running")
          .length,
    ),
  ).toBe(0);
});

// S6: Resultados al estimar — el veredicto en unidades y el gráfico estimado
// frente a real se VEN de verdad y la pantalla queda quieta.
test("reduced-motion: estimar una cantidad, veredicto y gráfico visibles y quietos", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.goto("/");
  await page.getByRole("button", { name: /Consumo de energía/i }).click();
  await page.selectOption("#target", "ocupantes");
  const answer = page.getByRole("button", { name: /Una cantidad/ });
  await expectReallyVisible(answer);
  expect(await transitionOff(answer)).toBe(true);
  await page.selectOption("#target", "consumo_kwh");
  await page.getByRole("button", { name: /Entrenar modelos/i }).click();

  await expect(
    page.getByRole("heading", { name: /La liga: \d+ modelos/ }),
  ).toBeVisible({ timeout: 150_000 });
  await expectReallyVisible(page.getByRole("heading", { level: 1 }));
  await expectReallyVisible(
    page.getByRole("img", { name: /Gráfico de dispersión/ }),
  );
  await expectReallyVisible(page.getByText(/9 de cada 10 se equivocan/));
  expect(
    await page.evaluate(
      () =>
        document.getAnimations().filter((a) => a.playState === "running")
          .length,
    ),
  ).toBe(0);
});

const stillness = (page: import("@playwright/test").Page) =>
  page.evaluate(
    () =>
      document.getAnimations().filter((a) => a.playState === "running").length,
  );

// S7: Resultados de varias categorías — el veredicto, la matriz de confusión y la
// tabla por categoría se VEN de verdad, y la pantalla queda quieta.
test("reduced-motion: varias categorías, veredicto y matriz visibles y quietos", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.goto("/");
  const example = page.getByRole("button", { name: /Planes de suscripción/ });
  await expectReallyVisible(example);
  expect(await transitionOff(example)).toBe(true);
  await example.click();
  await page.selectOption("#target", "plan");
  await expectReallyVisible(page.getByText(/Vas a clasificar en 5 categorías/));
  await page.getByRole("button", { name: /Entrenar modelos/i }).click();

  const matrix = page.getByRole("region", {
    name: "Matriz de confusión (prueba)",
  });
  await expect(matrix).toBeVisible({ timeout: 150_000 });
  await expectReallyVisible(page.getByRole("heading", { level: 1 }));
  await expectReallyVisible(matrix);
  await expectReallyVisible(matrix.getByText("✓").first());
  await expectReallyVisible(
    page.getByRole("region", { name: "Por categoría (prueba)" }),
  );
  expect(await stillness(page)).toBe(0);
});

// S7: Resultados de agrupar — la lectura, las tarjetas de grupo, la tabla de
// agrupadores y el detalle «Ver las otras columnas» se VEN de verdad, quietos.
test("reduced-motion: agrupar, lectura, grupos y tabla visibles y quietos", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.goto("/");
  const example = page.getByRole("button", { name: /Segmentos de clientes/ });
  await expectReallyVisible(example);
  await example.click();
  await page.selectOption("#target", {
    label: "Sin objetivo: agrupar filas parecidas",
  });
  const run = page.getByRole("button", { name: /Agrupar filas/ });
  await expectReallyVisible(run);
  expect(await transitionOff(run)).toBe(true);
  await run.click();

  const table = page.getByRole("region", { name: /Los agrupadores: \d/ });
  await expect(table).toBeVisible({ timeout: 150_000 });
  await expectReallyVisible(page.getByRole("heading", { level: 1 }));
  await expectReallyVisible(
    page.getByRole("heading", { name: /^Grupo \d+$/ }).first(),
  );
  await expectReallyVisible(table);
  const others = page
    .getByText(/Ver las otras \d+ columnas|Ver la otra columna/)
    .first();
  await others.click();
  await expectReallyVisible(others.locator("xpath=..").locator("li").last());
  expect(await stillness(page)).toBe(0);
});
