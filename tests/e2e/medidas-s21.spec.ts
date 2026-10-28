import { appendFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// S21 — las dos medidas del S20 en el NAVEGADOR real, sobre el build de producción. NO corre por defecto: es una medición, no un gate
// (`MEDIR=1 MEDIDAS_SALIDA=<archivo> pnpm exec playwright test tests/e2e/medidas-s21.spec.ts --project=desktop-chromium`). Los presupuestos se
// fijaron ANTES de medir: el peor caso que `planGemelo` deja pasar termina en ≤ 30 s sin que el worker muera, y Holt-Winters con 2 000 días
// en ≤ 45 s con el estado «calculando» visible. La primera corrida de cada flujo incluye bajar el motor de Python (en frío); las siguientes no.
test.skip(process.env.MEDIR !== "1", "es una medición: MEDIR=1");
test.setTimeout(600_000);

const dicho = (linea: Record<string, string | number>) => {
  const texto = `MEDIDA|${Object.entries(linea).map(([k, v]) => `${k}=${v}`).join("|")}`;
  console.log(texto);
  if (process.env.MEDIDAS_SALIDA) appendFileSync(process.env.MEDIDAS_SALIDA, `${texto}\n`);
};

async function subir(page: Page, nombre: string, contenido: string) {
  await page.goto("/");
  await page.locator('input[accept^=".csv,text/csv"]').setInputFiles({ name: nombre, mimeType: "text/csv", buffer: Buffer.from(contenido) });
}

test("Holt-Winters con 2 000 días: en frío y en caliente", async ({ page }) => {
  const filas = ["dia,ventas"];
  for (let i = 0; i < 2000; i++) {
    const t = new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10);
    filas.push(`${t},${(100 + 0.05 * i + 12 * Math.sin((2 * Math.PI * i) / 7) + (((i * 7919) % 13) - 6) * 0.8).toFixed(2)}`);
  }
  await subir(page, "serie-diaria.csv", filas.join("\n") + "\n");
  await expect(page.locator("#target")).toBeVisible({ timeout: 60_000 });
  const opcion = await page.locator("#target option").evaluateAll((os) => (os as HTMLOptionElement[]).find((o) => o.value.startsWith("__pronosticar__"))?.value);
  expect(opcion, "la opción de pronosticar").toBeTruthy();
  await page.selectOption("#target", opcion!);
  await expect(page.getByTestId("pronostico-panel")).toBeVisible();
  const veces: number[] = [];
  for (const horizonte of ["7", "30", "120"]) {
    await page.getByLabel("Periodos a pronosticar").fill(horizonte);
    const t0 = Date.now();
    await page.getByRole("button", { name: "Pronosticar", exact: true }).click();
    await expect(page.getByTestId("pronostico-lectura")).toBeVisible({ timeout: 300_000 });
    const ms = Date.now() - t0;
    veces.push(ms);
    dicho({ caso: "holt_winters_navegador", n: 2000, horizonte, total_ms: ms, frio: veces.length === 1 ? "si" : "no" });
  }
  expect(Math.max(...veces.slice(1)), "corridas en caliente").toBeLessThanOrEqual(45_000);
});

test("el gemelo del peor caso: 50 000 filas y tres categóricas de 10 000 valores", async ({ page }) => {
  page.on("crash", () => dicho({ caso: "gemelo_navegador", error: "la página se cayó" }));
  const mult = [7919, 104729, 1299709];
  const filas = ["x,c0,c1,c2"];
  for (let i = 0; i < 50_000; i++)
    filas.push(`${(50 + ((i * 37) % 101) / 3).toFixed(3)},${mult.map((m, j) => `c${j}_${(i * m) % 10_000}`).join(",")}`);
  await subir(page, "ancha.csv", filas.join("\n") + "\n");
  await expect(page.getByTestId("gemelo-panel")).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId("gemelo-revisando")).toHaveCount(0, { timeout: 120_000 });
  await expect(page.getByTestId("gemelo-plan")).toContainText("Viajan 4 columnas");
  const veces: number[] = [];
  for (let k = 0; k < 2; k++) {
    if (k > 0) await page.getByLabel("Filas del gemelo").fill("49000");
    const t0 = Date.now();
    await page.getByRole("button", { name: "Generar el gemelo" }).click();
    await expect(page.getByTestId("gemelo-lectura")).toBeVisible({ timeout: 300_000 });
    veces.push(Date.now() - t0);
    dicho({ caso: "gemelo_navegador", filas: 50_000, ancho: 30_000, total_ms: veces[k]!, frio: k === 0 ? "si" : "no" });
  }
  expect(veces[1]!, "corrida en caliente").toBeLessThanOrEqual(30_000);
});
