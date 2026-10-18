import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { axeBothThemes } from "./axe-temas";

// S8 (ADR 020) — Protocolo DS: las etapas 1–3 (la 4, en protocolo-etapa4.spec.ts) se recorren con datos propios y la compuerta
// no deja saltar. Un CSV del kit (renovaciones-mensuales.csv: el mismo cliente en varias filas,
// una fecha ISO, renovó sí/no) recorre la decisión, el objetivo y el diseño; la etapa 2 no abre
// sin la 1; el cuaderno sobrevive a recargar la página (IndexedDB), la huella dice si es el mismo
// archivo, y se exporta y se importa. Regla dura 2: ningún dato del CSV en la red.

const CSV = resolve(
  process.cwd(),
  "docs/kit-de-prueba/renovaciones-mensuales.csv",
);
const OTRO_CSV = resolve(
  process.cwd(),
  "docs/kit-de-prueba/planes-suscripcion.csv",
);

async function abrir(page: Page) {
  await page.goto("/protocolo");
  await expect(
    page.getByRole("heading", { level: 1, name: "Protocolo DS" }),
  ).toBeVisible();
  await expect(page.getByText("Abriendo tu cuaderno…")).toBeHidden();
}

async function cargarCsv(page: Page, ruta = CSV) {
  await page.getByTestId("protocolo-csv").setInputFiles(ruta);
}

async function cumplirEtapa1(page: Page) {
  const e1 = page.locator("#etapa-1");
  await e1
    .getByLabel("La decisión", { exact: true })
    .fill("Llamar o no al cliente antes de que venza su plan");
  await e1
    .getByLabel("Quién la toma", { exact: true })
    .fill("Jefa de retención");
  await e1.getByLabel("Sí o no (actuar o no actuar)").check();
  await e1.getByLabel("Unidad de costo", { exact: true }).fill("US$");
  await e1.getByLabel(/Costo de actuar sin que hiciera falta/).fill("10");
  await e1.getByLabel(/Costo de no actuar y que sí hiciera falta/).fill("50");
  await expect(page.getByTestId("protocolo-umbral")).toContainText("0.17");
  await e1.getByRole("button", { name: "Registrar la etapa 1" }).click();
  await expect(e1.getByText("Cumplida")).toBeVisible();
}

async function cumplirEtapa2(page: Page) {
  const e2 = page.locator("#etapa-2");
  await e2
    .getByLabel("Columna objetivo", { exact: true })
    .selectOption("renovo");
  await expect(page.getByTestId("protocolo-deteccion")).toContainText(
    "dos clases",
  );
  await e2.getByLabel(/Valor que significa/).selectOption("si");
  await e2.getByLabel(/Una columna identifica la unidad/).check();
  await e2
    .getByLabel("Columna que identifica la unidad")
    .selectOption("cliente_id");
  await e2
    .getByLabel("Columna de fecha", { exact: true })
    .selectOption("mes_observado");
  await expect(page.getByTestId("protocolo-fechas")).toContainText(
    "Se leen 361 fechas",
  );
  await expect(
    e2.getByText(/Tu unidad se repite: 361 filas para 100 unidades/),
  ).toBeVisible();
  await e2.getByRole("button", { name: "Registrar la etapa 2" }).click();
  await expect(e2.getByText("Cumplida")).toBeVisible();
}

test("la compuerta: la etapa 2 no abre sin la 1, no hay botón de saltar, y 1–3 se recorren con datos propios", async ({
  page,
}) => {
  const peticiones: string[] = [];
  page.on("request", (r) =>
    peticiones.push(`${r.url()} ${r.postData() ?? ""}`),
  );

  // La puerta está en la portada, junto a la de Probeta.
  await page.goto("/");
  await page.getByRole("link", { name: "Abrir el Protocolo DS" }).click();
  await expect(page).toHaveURL(/\/protocolo$/);
  await expect(page.getByText("Abriendo tu cuaderno…")).toBeHidden();

  // Sin la etapa 1, la 2 está cerrada: dice qué la abre y no tiene formulario.
  const e1 = page.locator("#etapa-1");
  const e2 = page.locator("#etapa-2");
  await expect(e2.getByText("Cerrada")).toBeVisible();
  await expect(
    e2.getByText("Se abre cuando cumplas la etapa 1."),
  ).toBeVisible();
  await expect(e2.getByLabel("Columna objetivo", { exact: true })).toHaveCount(
    0,
  );
  await expect(e2.getByRole("button")).toHaveCount(0);

  // Ningún control de saltar, omitir o continuar sin cumplir.
  for (const control of await page.getByRole("button").all())
    expect((await control.textContent()) ?? "").not.toMatch(
      /saltar|omitir|skip|continuar sin/i,
    );

  // La etapa 1 sola, sin datos: no usa el archivo. Con la forma elegida pero nada escrito, la
  // compuerta rechaza y dice qué falta.
  await e1.getByLabel("Sí o no (actuar o no actuar)").check();
  await e1.getByRole("button", { name: "Registrar la etapa 1" }).click();
  await expect(e1.getByRole("alert")).toContainText("El criterio no se cumple");
  await expect(e1.getByRole("alert")).toContainText("la decisión");
  await cumplirEtapa1(page);
  await expect(
    page.getByText(
      /Con tus costos conviene actuar desde una probabilidad de 0\.17/,
    ),
  ).toBeVisible();

  // La etapa 2 usa los datos: sin CSV lo dice; con CSV se verifica en ellos.
  await expect(e2.getByText("Carga tu CSV arriba")).toBeVisible();
  await cargarCsv(page);
  await expect(page.getByTestId("protocolo-datos")).toContainText(
    /renovaciones-mensuales\.csv · 361 filas × 7 columnas · huella [0-9a-f]{12}/,
  );
  await cumplirEtapa2(page);

  // Etapa 3: la muestra no alcanza con 5 parámetros → pide el aviso; con él, cumple.
  const e3 = page.locator("#etapa-3");
  await e3.getByLabel("Predecir lo que va a pasar").check();
  await e3.getByLabel("Población").fill("Clientes con un plan activo");
  await e3.getByLabel("Exclusiones").fill("Cuentas de prueba");
  await expect(
    e3.getByText(/Periodo: del 2025-\d\d-15 al 2025-\d\d-15/),
  ).toBeVisible();
  await expect(page.getByTestId("protocolo-muestra")).toContainText(
    "Hacen falta 464 filas; tienes 361.",
  );
  await expect(page.getByTestId("protocolo-muestra")).toContainText(
    "La muestra no alcanza",
  );
  await e3.getByRole("button", { name: "Registrar la etapa 3" }).click();
  await expect(e3.getByRole("alert")).toContainText(
    "tu aviso: la muestra no alcanza",
  );
  await e3.getByLabel("Tu aviso").fill("Es un piloto de un trimestre; lo sé");
  await e3.getByRole("button", { name: "Registrar la etapa 3" }).click();
  await expect(e3.getByText("Cumplida")).toBeVisible();

  // La etapa 4 abre con la 3 cumplida y pide la APUESTA antes de mostrar nada de los datos; la
  // 5 y la 6 existen pero siguen cerradas hasta que la 4 se cumpla, y la 7 se ve con su criterio y no abre.
  const e4 = page.locator("#etapa-4");
  await expect(e4.getByText("Abierta", { exact: true })).toBeVisible();
  await expect(e4.getByLabel("Sí, marco las que creo")).toBeVisible();
  await expect(e4.getByTestId("protocolo-revelar")).toBeDisabled();
  await expect(e4.getByTestId("protocolo-hallazgo-fuga")).toHaveCount(0);
  await expect(page.locator("#etapa-5").getByText("Cerrada")).toBeVisible();
  await expect(page.locator("#etapa-6").getByText("Cerrada")).toBeVisible();
  await expect(
    page.locator("#etapa-7").getByText("Sin construir"),
  ).toBeVisible();

  // El cuaderno se escribió solo: una evidencia por etapa.
  await expect(
    page.getByTestId("cuaderno-evidencias").locator("> li"),
  ).toHaveCount(3);
  await axeBothThemes(page);

  // Regla dura 2: ni narración ni un solo valor del CSV salieron de la página.
  expect(peticiones.filter((p) => p.includes("/api/narrate"))).toEqual([]);
  expect(
    peticiones.filter((p) => p.includes("C001") || p.includes("2025-")),
  ).toEqual([]);
});

test("el cuaderno sobrevive a recargar: la huella reconoce el mismo archivo y avisa de otro", async ({
  page,
}) => {
  await abrir(page);
  await cumplirEtapa1(page);
  await cargarCsv(page);
  await cumplirEtapa2(page);

  // Recargar solo cuando el navegador terminó de guardar (la línea del cuaderno lo dice).
  await expect(page.getByTestId("cuaderno-guardado")).toContainText(
    "Guardado en este navegador.",
  );
  await page.reload();
  await expect(page.getByText("Abriendo tu cuaderno…")).toBeHidden();
  // El cuaderno está; los datos, no: lo que los usa pide verificarse otra vez.
  await expect(
    page.getByTestId("cuaderno-evidencias").locator("> li"),
  ).toHaveCount(2);
  await expect(
    page.getByText(/Tu cuaderno trabajó con renovaciones-mensuales\.csv/),
  ).toBeVisible();
  await expect(page.locator("#etapa-1").getByText("Cumplida")).toBeVisible();
  await expect(
    page.locator("#etapa-2").getByText("Por verificar"),
  ).toBeVisible();
  await expect(
    page.locator("#etapa-2").getByText("Usa tus datos: cárgalos de nuevo"),
  ).toBeVisible();

  // El mismo archivo: la huella coincide y la etapa vuelve a cumplida.
  await cargarCsv(page);
  await expect(
    page.getByText("Es el mismo archivo del cuaderno: la huella coincide."),
  ).toBeVisible();
  await expect(page.locator("#etapa-2").getByText("Cumplida")).toBeVisible();

  // Otro archivo: pregunta si es otra versión o es otro proyecto.
  await cargarCsv(page, OTRO_CSV);
  // M2 (S8 → S9): el diálogo tiene nombre (axe `aria-dialog-name`), el foco entra en él,
  // Escape lo cancela y el foco vuelve al botón que abrió el flujo.
  const dialogo = page.getByRole("alertdialog", {
    name: "Este archivo no es el del cuaderno",
  });
  await expect(dialogo).toBeVisible();
  await expect(
    dialogo.getByRole("button", { name: "No cargarlo" }),
  ).toBeFocused();
  await axeBothThemes(page, "dialog");
  await page.keyboard.press("Escape");
  await expect(dialogo).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Cargar otro CSV" }),
  ).toBeFocused();
  await expect(page.locator("#etapa-2").getByText("Cumplida")).toBeVisible();

  await cargarCsv(page, OTRO_CSV);
  await dialogo.getByRole("button", { name: "No cargarlo" }).click();
  await expect(dialogo).toBeHidden();
  await expect(page.locator("#etapa-2").getByText("Cumplida")).toBeVisible();

  // «Otro proyecto» reemplaza el cuaderno: pide un segundo sí, con Volver.
  await cargarCsv(page, OTRO_CSV);
  await dialogo
    .getByRole("button", { name: "Otro proyecto: cuaderno nuevo" })
    .click();
  const segundo = page.getByRole("alertdialog", {
    name: "¿Empezar un cuaderno nuevo con este archivo?",
  });
  await expect(segundo).toContainText("2 entradas");
  await axeBothThemes(page, "dialog");
  await segundo.getByRole("button", { name: "Volver" }).click();
  await expect(dialogo).toBeVisible();

  // Una versión nueva de los datos: lo que los usa vuelve a verificarse.
  await dialogo
    .getByRole("button", { name: "Otra versión de los mismos datos" })
    .click();
  await expect(
    page.locator("#etapa-2").getByText("Por verificar"),
  ).toBeVisible();
  await expect(
    page.locator("#etapa-2").getByText(/no son con los que se verificó/),
  ).toBeVisible();
});

test("el cuaderno se exporta, se reemplaza y se importa; un archivo malo se rechaza nombrando el campo", async ({
  page,
}) => {
  await abrir(page);
  await cumplirEtapa1(page);

  const descarga = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar cuaderno" }).click();
  const archivo = (await (await descarga).path())!;
  const exportado = JSON.parse(readFileSync(archivo, "utf8")) as {
    formato: string;
    version: number;
    cuaderno: { evidencias: { etapa: number }[] };
  };
  expect(exportado.formato).toBe("protocolo-ds");
  expect(exportado.cuaderno.evidencias.map((e) => e.etapa)).toEqual([1]);

  // Empezar otro cuaderno lo vacía (con confirmación); importar lo devuelve.
  await page.getByRole("button", { name: "Empezar otro cuaderno" }).click();
  const nuevo = page.getByRole("alertdialog", {
    name: "Empezar otro cuaderno",
  });
  await expect(nuevo.getByRole("button", { name: "Cancelar" })).toBeFocused();
  await axeBothThemes(page, "dialog");
  await page.keyboard.press("Escape");
  await expect(nuevo).toBeHidden();
  await expect(
    page.getByTestId("cuaderno-evidencias").locator("> li"),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Empezar otro cuaderno" }).click();
  await page.getByRole("button", { name: "Sí, empezar otro" }).click();
  await expect(page.getByText("El cuaderno está vacío")).toBeVisible();
  await page.getByTestId("protocolo-importar").setInputFiles(archivo);
  await expect(page.getByText(/Cuaderno importado/)).toBeVisible();
  await expect(
    page.getByTestId("cuaderno-evidencias").locator("> li"),
  ).toHaveCount(1);
  await expect(page.locator("#etapa-1").getByText("Cumplida")).toBeVisible();

  // M3 (S8 → S9): importar sobre un cuaderno con entradas pide un sí; Escape no reemplaza.
  await page.getByTestId("protocolo-importar").setInputFiles(archivo);
  const reemplazo = page.getByRole("alertdialog", {
    name: "¿Reemplazar tu cuaderno por el del archivo?",
  });
  await expect(reemplazo).toBeVisible();
  await expect(
    reemplazo.getByRole("button", { name: "Cancelar" }),
  ).toBeFocused();
  await axeBothThemes(page, "dialog");
  await page.keyboard.press("Escape");
  await expect(reemplazo).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Importar cuaderno" }),
  ).toBeFocused();
  await page.getByTestId("protocolo-importar").setInputFiles(archivo);
  await reemplazo.getByRole("button", { name: "Sí, reemplazar" }).click();
  await expect(reemplazo).toBeHidden();
  await expect(page.getByText(/Cuaderno importado/)).toBeVisible();

  // Un cuaderno con el umbral cambiado a mano se rechaza nombrando el campo (nunca se confía).
  const malo = JSON.parse(readFileSync(archivo, "utf8")) as Record<
    string,
    unknown
  >;
  (
    malo.cuaderno as { evidencias: { huella: string }[] }
  ).evidencias[0]!.huella = "no-es-una-huella";
  await page.getByTestId("protocolo-importar").setInputFiles({
    name: "malo.protocolo.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(malo)),
  });
  await expect(page.getByRole("alert").first()).toContainText(
    "cuaderno.evidencias[0].huella",
  );
});

test("«explicar una causa» detiene el Protocolo, y reformular lo reabre", async ({
  page,
}) => {
  await abrir(page);
  await cumplirEtapa1(page);
  await cargarCsv(page);
  await cumplirEtapa2(page);

  const e3 = page.locator("#etapa-3");
  await e3.getByLabel("Explicar una causa (qué provoca qué)").check();
  await e3.getByRole("button", { name: "Registrar la etapa 3" }).click();
  await expect(e3.getByText("Detenida")).toBeVisible();
  await expect(e3.getByText(/Estás buscando una causa/)).toBeVisible();
  // Con la 3 detenida, la 4 sigue cerrada.
  await expect(page.locator("#etapa-4").getByText("Cerrada")).toBeVisible();
  await axeBothThemes(page);
});

test("sin columna objetivo el Protocolo se detiene y lleva a agrupar en Probeta", async ({
  page,
}) => {
  await abrir(page);
  await cumplirEtapa1(page);
  await cargarCsv(page);
  const e2 = page.locator("#etapa-2");
  await e2
    .getByLabel("Columna objetivo")
    .selectOption({ label: "No tengo una columna objetivo" });
  await e2.getByRole("button", { name: "Registrar la etapa 2" }).click();
  await expect(e2.getByText("Detenida")).toBeVisible();
  await expect(
    e2.getByRole("link", { name: "Ir a Probeta para agrupar" }),
  ).toHaveAttribute("href", "/");
  await expect(page.locator("#etapa-3").getByText("Cerrada")).toBeVisible();
});

test("sin IndexedDB avisa que el cuaderno solo vive en la pestaña", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, "indexedDB", {
      value: undefined,
      configurable: true,
    });
  });
  await abrir(page);
  await expect(
    page.getByText(/Exporta tu cuaderno antes de irte/),
  ).toBeVisible();
  await cumplirEtapa1(page);
  await expect(
    page.getByTestId("cuaderno-evidencias").locator("> li"),
  ).toHaveCount(1);
});
