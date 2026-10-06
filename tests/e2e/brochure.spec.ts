import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// El brochure vivo servido en /conoce (docs/BROCHURE.html copiado a public/ en prebuild).
//
// Estos chequeos existen por los defectos concretos del piloto de app-habla: la CI estuvo
// VERDE con un entregable rechazado, y el hero quedaba EN BLANCO bajo reduced-motion
// pasando 12 e2e + Lighthouse 100/100 — porque ningún gate automático miraba esa rama.

test.describe("brochure vivo — /conoce", () => {
  // S7 (D-B): la página abre en el idioma del navegador; estas pruebas la leen en español.
  test.use({ locale: "es-ES" });

  test("la ruta responde y el titular está presente", async ({ page }) => {
    const respuesta = await page.goto("/conoce");
    expect(respuesta?.status()).toBe(200);

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Construye un modelo que puedas defender",
      }),
    ).toBeVisible();
  });

  test("progressive disclosure: las tarjetas llegan CERRADAS y solo el toque las abre", async ({
    page,
  }) => {
    await page.goto("/conoce");

    // S7 (D-A): cinco puertas — la quinta, «Agrupar sin objetivo».
    const botones = page.locator(".tarjeta h3 > button");
    await expect(botones).toHaveCount(5);
    for (const boton of await botones.all()) {
      await expect(boton).toHaveAttribute("aria-expanded", "false");
    }

    const estrella = page.getByRole("button", { name: /El veredicto honesto/ });
    await estrella.click();
    await expect(estrella).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("Matriz de confusión")).toBeVisible();
  });

  // El defecto que axe NO ve: grid-rows:0fr + overflow:hidden engaña al ojo, pero un lector
  // de pantalla recita TODO el contenido "cerrado". Se verifica contra el árbol REAL por CDP.
  test("lo cerrado queda FUERA del árbol de accesibilidad", async ({
    page,
  }) => {
    await page.goto("/conoce");

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Accessibility.enable");

    const arbolCerrado = await cdp.send("Accessibility.getFullAXTree");
    const textoCerrado = JSON.stringify(arbolCerrado.nodes);
    expect(textoCerrado).not.toContain("Matriz de confusión");

    await page.getByRole("button", { name: /El veredicto honesto/ }).click();
    await expect(page.getByText("Matriz de confusión")).toBeVisible();

    const arbolAbierto = await cdp.send("Accessibility.getFullAXTree");
    expect(JSON.stringify(arbolAbierto.nodes)).toContain("Matriz de confusión");
  });

  // OBLIGATORIO (regla 6 del molde): reduced-motion es una experiencia COMPLETA, no una
  // página vacía. Se afirma VISIBILIDAD REAL — opacidad y tamaño — de los elementos clave.
  test("con reduced-motion el mensaje entero está visible, sin un solo frame", async ({
    browser,
    baseURL,
  }) => {
    // Contexto propio en vez de test.use(): así la opción viaja explícita y este chequeo no
    // depende de la herencia de fixtures del describe.
    const contexto = await browser.newContext({ reducedMotion: "reduce" });
    const page = await contexto.newPage();
    await page.goto(`${baseURL}/conoce`);

    const claves = [
      page.getByRole("heading", { level: 1 }),
      // S7 · E04b: las cuatro fichas, completas y quietas desde el primer frame.
      page.getByRole("heading", { name: "Cuatro preguntas, la misma vara" }),
      page.getByRole("heading", { name: "¿Sí o no?" }),
      page.getByRole("heading", { name: "¿Qué grupos hay?" }),
      page.getByText("Los grupos existen, son frágiles o no hay estructura."),
      page.getByText("«Random Forest» NO supera al baseline"),
      page.getByText("Esto también te lo decimos."),
      page.locator(".conteo-glosa"),
    ];

    for (const clave of claves) {
      await expect(clave).toBeVisible();
      await expect(clave).toHaveCSS("opacity", "1");
      const caja = await clave.boundingBox();
      expect(caja).not.toBeNull();
      expect(caja!.width).toBeGreaterThan(0);
      expect(caja!.height).toBeGreaterThan(0);
    }

    // La barra del clímax llega MEDIDA (scaleY(1)), no colapsada en cero.
    const cajaBarra = await page.locator(".med-barra").boundingBox();
    expect(cajaBarra!.height).toBeGreaterThan(50);

    await contexto.close();
  });

  test("el conteo del pie está en el DOM como texto desde el primer byte", async ({
    page,
  }) => {
    await page.goto("/conoce");
    await expect(page.locator(".conteo-glosa")).toContainText(
      "41 funcionalidades",
    );
  });

  test("axe sin violaciones, con el detalle abierto", async ({ page }) => {
    await page.goto("/conoce");

    for (const boton of await page.locator(".tarjeta h3 > button").all()) {
      await boton.click();
    }
    for (const resumen of await page.locator("details > summary").all()) {
      await resumen.click();
    }

    // Esperar a que TODA animación termine antes de auditar: a mitad de un fundido el texto
    // se mezcla con el fondo y axe reporta un contraste que no existe en ningún estado real
    // (medido: #76797d = la tinta al ~60 % de opacidad sobre blanco, a mitad de "asentar").
    await page.waitForFunction(() =>
      document.getAnimations().every((a) => a.playState !== "running"),
    );

    const resultado = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(resultado.violations).toEqual([]);
  });
});

// S7 (decisión D-B del usuario): la misma página en español y en inglés. Abre en el idioma
// del navegador, el conmutador la cambia, y los dos idiomas cuentan lo mismo: las mismas
// escenas, puertas, funcionalidades por puerta, fichas, etapas y el mismo conteo.
test.describe("brochure vivo — los dos idiomas", () => {
  test.use({ locale: "en-US" });

  test("con un navegador en inglés abre en inglés, y el conmutador vuelve al español", async ({
    page,
  }) => {
    await page.goto("/conoce");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Build a model you can defend",
      }),
    ).toBeVisible();
    await expect(page).toHaveTitle("Probeta DS — Meet it");
    await expect(page.locator(".conteo-glosa")).toContainText("41 features");
    // axe también en inglés, con las puertas y lo fino abiertos.
    for (const boton of await page.locator(".tarjeta h3 > button").all()) {
      await boton.click();
    }
    for (const resumen of await page.locator("details > summary").all()) {
      await resumen.click();
    }
    await page.waitForFunction(() =>
      document.getAnimations().every((a) => a.playState !== "running"),
    );
    const enIngles = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(enIngles.violations).toEqual([]);
    await page.getByRole("button", { name: "Español" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "es-CO");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Construye un modelo que puedas defender",
      }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Español" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("paridad: cada texto tiene su par, y los dos idiomas cuentan lo mismo", async ({
    page,
  }) => {
    await page.goto("/conoce");
    // Cada bloque en español va seguido de su par en inglés, con la misma etiqueta.
    const huerfanos = await page.evaluate(() =>
      [...document.querySelectorAll(".es")]
        .filter((es) => {
          const en = es.nextElementSibling;
          return (
            !en || !en.classList.contains("en") || en.tagName !== es.tagName
          );
        })
        .map((es) => es.textContent?.trim().slice(0, 40)),
    );
    expect(huerfanos, "textos en español sin su par en inglés").toEqual([]);

    const cuenta = () =>
      page.evaluate(() => {
        const visibles = (selector: string) =>
          [...document.querySelectorAll(selector)].filter(
            (el) => el.getClientRects().length > 0,
          );
        return {
          escenas: visibles("section h2").length,
          puertas: visibles(".tarjeta").length,
          porPuerta: visibles(".tarjeta").map(
            (t) => t.querySelectorAll(".features li").length,
          ),
          insignias: visibles(".tarjeta-n").map((n) => n.textContent),
          fichas: visibles(".ficha-pregunta").length,
          etapas: visibles(".historial tr").length,
          conteo: document
            .querySelector(".conteo-cifra")
            ?.getAttribute("data-contador"),
          // Lo visible es de UN solo idioma.
          otroIdioma: visibles(
            document.documentElement.lang === "en" ? ".es" : ".en",
          ).length,
        };
      });
    const ingles = await cuenta();
    await page.getByRole("button", { name: "Español" }).click();
    const espanol = await cuenta();
    expect(ingles.otroIdioma).toBe(0);
    expect(espanol.otroIdioma).toBe(0);
    expect({ ...ingles, otroIdioma: 0 }).toEqual({ ...espanol, otroIdioma: 0 });
    expect(espanol.puertas).toBe(5);
    expect(espanol.fichas).toBe(4);
    expect(espanol.conteo).toBe("41");
    expect(
      espanol.porPuerta.reduce((a, b) => a + b, 0) + 2,
      "las funcionalidades de las puertas + las 2 de «lo fino» = el conteo del pie",
    ).toBe(41);
  });
});
