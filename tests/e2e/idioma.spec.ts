import { expect, test, type Page } from "@playwright/test";

// S11 — un idioma por página. El español va en el bundle (la página se prerenderiza en español y
// debe hidratar con él); el inglés es otro chunk que llega al elegirlo. Se prueba con el build de
// producción real: quién se descarga, el cambio en los dos sentidos, que ninguna clave cruda se vea
// mientras el inglés llega, y qué pasa si no llega. La suite completa corre en español (regla 20:
// un idioma por sprint); esta spec cubre en inglés solo lo que el cambio de diccionarios toca.

const FRASE_EN = "Honest data science, end to end.";
const FRASE_ES = "Ciencia de datos honesta, de principio a fin.";
// Una clave de diccionario sin traducir se vería así: «protocol.stage.1.…», «start.…».
const CLAVE_CRUDA = /\b(protocol|start|language|common|results|league)\.[a-z]/;

/** Las respuestas JS de la página cuyo cuerpo contiene `frase`. */
function vigilar(page: Page, frase: string) {
  const con: string[] = [];
  const pendientes: Promise<void>[] = [];
  page.on("response", (res) => {
    if (!/\/_next\/static\/chunks\/.*\.js/.test(res.url())) return;
    pendientes.push(
      res
        .text()
        .then((cuerpo) => {
          if (cuerpo.includes(frase)) con.push(res.url());
        })
        .catch(() => undefined),
    );
  });
  return {
    async urls() {
      await Promise.all(pendientes);
      return [...con];
    },
  };
}

for (const ruta of ["/", "/protocolo"]) {
  test(`${ruta}: en español no se descarga el diccionario inglés`, async ({
    page,
  }) => {
    const ingles = vigilar(page, FRASE_EN);
    const espanol = vigilar(page, FRASE_ES);
    await page.goto(ruta);
    await expect(
      page.getByRole("navigation", { name: "Idioma" }),
    ).toBeVisible();
    await page.waitForLoadState("networkidle");
    // el detector no está ciego: el español sí viaja
    expect((await espanol.urls()).length).toBeGreaterThan(0);
    expect(await ingles.urls()).toEqual([]);
  });
}

test("elegir English trae el diccionario inglés y volver a Español no pide nada", async ({
  page,
}) => {
  const ingles = vigilar(page, FRASE_EN);
  await page.goto("/protocolo");
  await expect(page.getByRole("navigation", { name: "Idioma" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(await ingles.urls()).toEqual([]);

  await page.getByRole("button", { name: "English" }).click();
  await expect(
    page.getByRole("navigation", { name: "Language" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("heading", { level: 1, name: "Protocolo DS" }),
  ).toBeVisible();
  expect((await ingles.urls()).length).toBe(1);
  expect(await page.locator("body").innerText()).not.toMatch(CLAVE_CRUDA);

  // de vuelta: el español ya estaba, y el inglés no se vuelve a pedir
  await page.getByRole("button", { name: "Español" }).click();
  await expect(page.getByRole("navigation", { name: "Idioma" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await page.getByRole("button", { name: "English" }).click();
  await expect(
    page.getByRole("navigation", { name: "Language" }),
  ).toBeVisible();
  expect((await ingles.urls()).length).toBe(1);
});

test("quien ya había elegido inglés entra a la portada y al Protocolo en inglés, sin claves crudas", async ({
  page,
}) => {
  await page.addInitScript(() =>
    window.localStorage.setItem("probeta-ds.locale", "en"),
  );
  for (const ruta of ["/", "/protocolo"]) {
    await page.goto(ruta);
    await expect(
      page.getByRole("navigation", { name: "Language" }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    expect(await page.locator("body").innerText()).not.toMatch(CLAVE_CRUDA);
    expect(await page.locator("body").innerText()).not.toContain(FRASE_ES);
  }
});

test("si el inglés no llega, la página sigue en español y lo dice; al reintentar, llega", async ({
  page,
}) => {
  let cortar = true;
  await page.route("**/_next/static/chunks/**", async (route) => {
    if (!cortar) return route.continue();
    const respuesta = await route.fetch();
    const cuerpo = await respuesta.text();
    if (cuerpo.includes(FRASE_EN)) return route.abort();
    return route.fulfill({ response: respuesta, body: cuerpo });
  });
  await page.goto("/protocolo");
  await expect(page.getByRole("navigation", { name: "Idioma" })).toBeVisible();

  await page.getByRole("button", { name: "English" }).click();
  const aviso = page.getByTestId("idioma-fallo");
  await expect(aviso).toBeVisible();
  await expect(aviso).toContainText("sigue en español");
  await expect(page.getByRole("navigation", { name: "Idioma" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  expect(await page.locator("body").innerText()).not.toMatch(CLAVE_CRUDA);

  cortar = false;
  await page.getByRole("button", { name: "English" }).click();
  await expect(
    page.getByRole("navigation", { name: "Language" }),
  ).toBeVisible();
  await expect(aviso).toBeHidden();
});
