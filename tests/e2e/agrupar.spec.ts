import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { axeBothThemes } from "./axe-temas";

// S7 (ADR 016) — agrupar SIN objetivo de punta a punta en el navegador real (build
// de producción en CI). Segmentos de clientes → «los grupos existen» con 3 grupos,
// sus perfiles y la tabla de agrupadores; sin grupos → «no hay estructura», con la
// tabla visible igual. Decisión 8 del usuario: con más de 8.000 filas, la nota de
// la muestra del jerárquico se ve antes de correr y en su fila. P13: las filas con
// su grupo se descargan como CSV local. Ni una petición a /api/narrate. axe en
// ambos temas en cada pantalla.

const CLUSTER = { label: "Sin objetivo: agrupar filas parecidas" };

async function loadAndCluster(
  page: Page,
  file: { name: string; buffer: Buffer },
) {
  await page.goto("/");
  await page.locator('input[accept=".csv,text/csv"]').setInputFiles({
    ...file,
    mimeType: "text/csv",
  });
  await page.selectOption("#target", CLUSTER);
}

const kit = (name: string) => ({
  name,
  buffer: readFileSync(resolve(process.cwd(), "docs/kit-de-prueba", name)),
});

test("agrupar: segmentos → 3 grupos que existen, perfiles, tabla y las filas con su grupo", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const narrateRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/narrate"))
      narrateRequests.push(request.url());
  });

  // S7 (decisión 7): por el botón de ejemplo de la portada, el mismo CSV del kit.
  await page.goto("/");
  await page.getByRole("button", { name: /Segmentos de clientes/ }).click();
  await page.selectOption("#target", CLUSTER);
  await expect(
    page.getByRole("heading", {
      name: "Agrupar filas parecidas, sin objetivo",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/El parecido se mide con tus 3 columnas numéricas/),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Quién compite" }),
  ).toBeVisible();
  await axeBothThemes(page);
  await page.getByRole("button", { name: /Agrupar filas/ }).click();

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Los grupos existen: 3 grupos estables",
    }),
  ).toBeVisible({ timeout: 150_000 });
  await expect(
    page
      .getByText(/no hay conjunto de prueba ni veredicto contra un baseline/)
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Qué distingue a los 3 grupos" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Grupo \d$/ })).toHaveCount(
    3,
  );
  const table = page.getByRole("region", { name: /Los agrupadores: \d/ });
  await expect(table).toBeVisible();
  await expect(table.getByText("Ganador por consenso")).toBeVisible();
  await expect(page.getByText(/clase positiva|supera al baseline/)).toHaveCount(
    0,
  );
  await axeBothThemes(page);

  // Las otras columnas de un grupo se abren a pedido (control con su efecto).
  const others = page
    .getByText(/Ver las otras \d+ columnas|Ver la otra columna/)
    .first();
  await others.click();
  await expect(others.locator("xpath=..")).toHaveAttribute("open", "");

  // La ficha del ganador por consenso.
  await table
    .getByRole("row")
    .filter({ hasText: "Ganador por consenso" })
    .getByRole("button", { name: /^Ficha de / })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/ganador por consenso/)).toBeVisible();
  await axeBothThemes(page, "dialog");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // P13: tus filas con su grupo, como CSV local.
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: /Descargar filas con su grupo/ })
    .click();
  const csv = readFileSync((await (await download).path())!, "utf8")
    .trim()
    .split("\n");
  expect(csv[0]!.split(",").at(-1)).toBe("grupo");
  // La tabla del usuario, no la saneada: con el identificador que el saneamiento aparta.
  expect(csv[0]!.startsWith("cliente_id,")).toBe(true);
  expect(csv).toHaveLength(301);
  for (const line of csv.slice(1)) {
    expect(line.split(",").at(-1)).toMatch(/^[1-3]$/);
  }

  expect(narrateRequests).toEqual([]);
});

test("agrupar: sin grupos → «no hay estructura», con la tabla visible igual", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await loadAndCluster(page, kit("sin-grupos.csv"));
  await page.getByRole("button", { name: /Agrupar filas/ }).click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "No hay estructura de grupos",
    }),
  ).toBeVisible({ timeout: 150_000 });
  await expect(page.getByText(/no un hallazgo/).first()).toBeVisible();
  await expect(
    page.getByRole("region", { name: /Los agrupadores: \d/ }),
  ).toBeVisible();
  await axeBothThemes(page);
});

/** 9.000 filas en tres nubes (sembrado: sin azar entre corridas). */
function bigCsv(): string {
  let seed = 7;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const centres = [
    [0, 0, 5],
    [12, 12, 0],
    [24, 0, 10],
  ];
  const rows = ["a,b,c"];
  for (let i = 0; i < 9000; i += 1) {
    const [x, y, z] = centres[i % 3]!;
    rows.push(
      [x + random() * 3, y + random() * 3, z + random() * 3]
        .map((v) => v.toFixed(2))
        .join(","),
    );
  }
  return rows.join("\n");
}

test("decisión 8: con más de 8.000 filas, la muestra del jerárquico se dice antes de correr y en su fila", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await loadAndCluster(page, {
    name: "grande.csv",
    buffer: Buffer.from(bigCsv()),
  });
  await expect(
    // El saneamiento puede quitar alguna fila duplicada: la cifra se lee de la nota.
    page.getByText(
      /Con tus [\d.]+ filas, el jerárquico se ajusta sobre una muestra de 8\.000 y asigna el resto al grupo más cercano \(los otros tres usan todas\)\./,
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: /Agrupar filas/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
    timeout: 150_000,
  });

  // El jerárquico queda para el Nivel 2 (su lectura crece con n²): se corre.
  await page.getByRole("button", { name: /Correr el Nivel 2 \(\+\d+\)/ }).click();
  const table = page.getByRole("region", { name: /Los agrupadores: 4/ });
  await expect(table).toBeVisible({ timeout: 240_000 });
  await expect(
    table.getByText(
      /Ajustado sobre una muestra de 8\.000 de tus [\d.]+ filas; las demás se asignaron al grupo más cercano\./,
    ),
  ).toBeVisible();
  await axeBothThemes(page);
});
