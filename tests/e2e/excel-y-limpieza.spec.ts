import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { axeBothThemes } from "./axe-temas";

// S18 (ADR 025 y 026) — Excel, datos personales y plan de limpieza de punta a punta en el navegador real:
//  · un `.xlsx` carga como el CSV (el kit en Excel, escrito por otro programa), dice qué hoja leyó y entrena;
//  · un Excel con contraseña, uno antiguo (.xls) y uno dañado se rechazan NOMBRANDO el motivo;
//  · el archivo con datos personales plantados avisa de las cuatro columnas y NO enseña ni un valor;
//  · el plan se aprueba o se rechaza paso a paso, lo no decidido se dice, y lo aprobado se entrena y queda en la ficha;
//  · axe en los dos temas con el panel abierto; el teclado llega a cada botón del plan.

const kit = (...partes: string[]) =>
  resolve(process.cwd(), "docs/kit-de-prueba", ...partes);
const entrada = (page: Page) => page.locator('input[accept^=".csv,text/csv"]');

test("un .xlsx carga como el CSV: dice la hoja que leyó, entrena y llega al veredicto", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.goto("/");
  await entrada(page).setInputFiles(kit("xlsx", "marketing-campania.xlsx"));
  await expect(
    page.getByText("Se leyó la hoja «Datos» de tu Excel."),
  ).toBeVisible();
  await expect(page.getByText(/200 filas/)).toBeVisible();
  await axeBothThemes(page);
  await page.selectOption("#target", "convirtio");
  await page.getByRole("button", { name: /Entrenar modelos/i }).click();
  await expect(
    page.getByRole("heading", { name: /La liga: \d+ modelos/ }),
  ).toBeVisible({ timeout: 150_000 });
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /supera al baseline|empata|NO supera|nada mejor/,
    }),
  ).toBeVisible();
});

test("un Excel con contraseña, uno antiguo y uno dañado se rechazan diciendo por qué", async ({
  page,
}) => {
  const ole = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  const utf16 = (s: string) => [...s].flatMap((c) => [c.charCodeAt(0), 0]);
  const casos = [
    {
      nombre: "con-clave.xlsx",
      bytes: [...ole, ...new Array(200).fill(0), ...utf16("EncryptedPackage")],
      texto: /protegido con contraseña o cifrado/,
    },
    {
      nombre: "viejo.xls",
      bytes: [...ole, ...utf16("Workbook"), ...new Array(200).fill(0)],
      texto: /Excel antiguo \(\.xls\)/,
    },
    {
      nombre: "roto.xlsx",
      bytes: [
        ...Buffer.from("no es un libro de verdad, solo texto suelto".repeat(3)),
      ],
      texto: /dañado o no es un \.xlsx de verdad/,
    },
  ];
  for (const caso of casos) {
    await page.goto("/");
    await entrada(page).setInputFiles({
      name: caso.nombre,
      mimeType: "application/octet-stream",
      buffer: Buffer.from(caso.bytes),
    });
    await expect(
      page.getByRole("heading", { level: 1, name: "Algo no cuadra" }),
    ).toBeVisible();
    await expect(page.getByText(caso.texto)).toBeVisible();
  }
});

test("datos personales: avisa por columna y tipo sin enseñar ningún valor, y no bloquea", async ({
  page,
}) => {
  const csv = readFileSync(kit("clientes-con-datos-personales.csv"), "utf8");
  await page.goto("/");
  await entrada(page).setInputFiles(kit("clientes-con-datos-personales.csv"));
  await expect(page.getByText("Posibles datos personales")).toBeVisible();
  for (const [columna, tipo] of [
    ["correo", "correos electrónicos"],
    ["telefono", "teléfonos"],
    ["documento", "documentos de identidad"],
    ["nombre_completo", "nombres de personas"],
  ])
    await expect(
      page.getByText(new RegExp(`«${columna}»: parece guardar ${tipo}`)),
    ).toBeVisible();
  // el saneamiento ya apartó, por sí solo, las dos que tienen un valor distinto por fila, y el aviso lo dice
  await expect(page.getByText(/ya la dejó fuera al sanear/)).toHaveCount(2);

  // ni un valor de esas columnas en el panel (la vista previa de la tabla es tuya y está más abajo)
  const textoPanel =
    (await page.getByTestId("limpieza-panel").textContent()) ?? "";
  for (const fila of csv.trim().split("\n").slice(1, 41)) {
    for (const valor of fila.split(",").slice(0, 4))
      expect(textoPanel).not.toContain(valor);
  }
  // no bloquea: el selector de objetivo está activo
  await expect(page.locator("#target")).toBeEnabled();
});

test("el plan se decide paso a paso: aprobar, rechazar, volver a dejar sin decidir; lo aprobado entrena y queda en la ficha", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.goto("/");
  await entrada(page).setInputFiles(kit("clientes-con-datos-personales.csv"));
  await expect(
    page.getByText("0 aprobados · 0 rechazados · 2 sin decidir"),
  ).toBeVisible();

  await page.getByRole("button", { name: /Aprobar · nombre_completo/ }).click();
  await page.getByRole("button", { name: /Rechazar · telefono/ }).click();
  await expect(
    page.getByText("1 aprobados · 1 rechazados · 0 sin decidir"),
  ).toBeVisible();
  const filaNombre = page
    .getByRole("button", { name: /Aprobar · nombre_completo/ })
    .locator("xpath=ancestor::li[1]");
  await expect(filaNombre).toContainText("✓");
  await expect(filaNombre).toContainText("Aprobado");

  // volver a pulsar el botón activo lo deja sin decidir
  await page.getByRole("button", { name: /Rechazar · telefono/ }).click();
  await expect(
    page.getByText("1 aprobados · 0 rechazados · 1 sin decidir"),
  ).toBeVisible();

  await axeBothThemes(page);

  // el teclado llega a los botones del plan y los activa
  await page.getByRole("button", { name: /Rechazar · telefono/ }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("1 aprobados · 1 rechazados · 0 sin decidir"),
  ).toBeVisible();

  await page.selectOption("#target", "se_dio_de_baja");
  await page.getByRole("button", { name: /Entrenar modelos/i }).click();
  await expect(
    page.getByRole("heading", { name: /La liga: \d+ modelos/ }),
  ).toBeVisible({ timeout: 150_000 });
  // «nombre_completo» se quitó antes de entrenar: la ficha del modelo lo registra
  await page.getByText("Ver el contenido").click();
  await expect(
    page.getByText(
      /«nombre_completo» \(columna quitada\): aprobado y aplicado/,
    ),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByText(/«telefono» \(columna quitada\): rechazado/),
  ).toBeVisible();
});
