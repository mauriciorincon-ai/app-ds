import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { axeBothThemes } from "./axe-temas";
import {
  KIT,
  cumplirEtapa4Credito,
  cumplirEtapa4Precio,
  cumplirEtapa5SinRegla,
  cumplirEtapa6Credito,
  cumplirEtapa6Sugerida,
  cumplirEtapa7,
  cumplirEtapa8,
  cumplirEtapa9,
  prepararCredito,
  prepararPrecio,
  sinDesborde,
} from "./protocolo-pasos";

// S15 — Protocolo DS, etapa 10 (la ficha que se escribe sola) con dos archivos del kit y el worker de Pyodide de
// verdad hasta la etapa 8:
//  · credito-fuga-plantada.csv (dos clases), «usar»: la 10 abre con la 9 registrada; sin dueño no pasa; la
//    cadencia la escribes porque la prueba no fue por tiempo; la ficha sale del cuaderno con sus secciones, sus
//    fuentes y «Lo que este modelo cumplió»; «Protocolo completo»; se descarga en Markdown sin una sola fila; el
//    chequeo de deriva da «sigue» con el mismo archivo y «reentrenar» con el ingreso desplazado; la etapa 10 no
//    manda nada al worker ni a la red; axe en los dos temas y 360 px; la columna de texto («empleo») se ofrece
//    SIN marcar: nada de ella se guarda (ni en el cuaderno exportado) y la ficha y el chequeo lo dicen;
//  · precio-fuga-plantada.csv (estimar un número), «usar»: llega a «Protocolo completo» con su ficha descargada
//    (la calibración «no aplica» y sin piso en beneficio neto); aquí SÍ se marca la columna de texto «barrio»;
//  · crédito, «no usar»: su ficha dice qué tendría que cambiar, sin plan de vigilancia ni chequeo.

test.setTimeout(480_000);

const DESCARGA = "Descargar la ficha (Markdown)";

/** Cuenta los mensajes al worker desde que carga la página (la 7 y la 8 los mandan; la 10 no manda ninguno). */
async function contarMensajes(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { mensajes: number };
    w.mensajes = 0;
    const original = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (
      this: Worker,
      ...args: Parameters<Worker["postMessage"]>
    ) {
      w.mensajes += 1;
      return original.apply(this, args);
    } as Worker["postMessage"];
  });
}
const mensajes = (page: Page) =>
  page.evaluate(() => (window as unknown as { mensajes: number }).mensajes);

/** La ficha descargada, como texto. */
async function descargarFicha(page: Page) {
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: DESCARGA }).click(),
  ]);
  return {
    nombre: descarga.suggestedFilename(),
    contenido: readFileSync((await descarga.path())!, "utf8"),
  };
}

/** El CSV del kit con una columna cambiada, como archivo en memoria para el chequeo de deriva. */
function csvConColumna(
  archivo: string,
  columna: string,
  cambio: (v: string) => string,
) {
  const [cabecera, ...filas] = readFileSync(KIT(archivo), "utf8")
    .trimEnd()
    .split("\n");
  const j = cabecera!.split(",").indexOf(columna);
  const texto = [
    cabecera,
    ...filas.map((f) =>
      f
        .split(",")
        .map((v, k) => (k === j ? cambio(v) : v))
        .join(","),
    ),
  ].join("\n");
  return {
    name: "nuevo.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(texto),
  };
}

test("etapa 10 con crédito y «usar»: la ficha sale del cuaderno, se descarga sin filas y el chequeo mide la deriva", async ({
  page,
}) => {
  const peticiones: string[] = [];
  page.on("request", (r) =>
    peticiones.push(`${r.url()} ${r.postData() ?? ""}`),
  );
  await contarMensajes(page);
  await prepararCredito(page);
  await cumplirEtapa4Credito(page);
  await cumplirEtapa5SinRegla(page);
  await cumplirEtapa6Credito(page);
  await cumplirEtapa7(page);
  await cumplirEtapa8(page, "Falla con quienes trabajan en la informalidad");
  await cumplirEtapa9(
    page,
    "Usarlo",
    "Ahorra frente a lo de hoy y el equipo alcanza",
  );
  const e10 = page.locator("#etapa-10");
  await expect(e10.getByText("Abierta", { exact: true })).toBeVisible();
  await expect(page.getByTestId("protocolo-completo")).toHaveCount(0);
  const antes = await mensajes(page);
  expect(antes, "la 7 y la 8 usaron el worker").toBeGreaterThan(0);

  await expect(e10.getByTestId("protocolo-lee10")).toContainText(
    "no recalcula nada ni vuelve a abrir la prueba",
  );
  await expect(e10.getByTestId("protocolo-decision10")).toContainText(
    "Usarlo: la ficha lleva un plan de vigilancia.",
  );
  // el plan: columnas y filas de referencia, y que mide las entradas
  await expect(e10.getByTestId("protocolo-plan10")).toContainText(
    "mide las entradas, no el desempeño",
  );

  // sin dueño nombrado la compuerta no pasa y lo nombra; el campo empieza vacío
  const dueno = e10.getByLabel("Persona o rol que responde por este modelo");
  await expect(dueno).toHaveValue("");
  const registrar = e10.getByRole("button", {
    name: "Registrar la etapa 10",
  });
  await registrar.click();
  await expect(e10.getByRole("alert")).toContainText(
    "el nombre de quien responde por el modelo",
  );
  // un clic pone al decisor de la etapa 1
  await e10
    .getByRole("button", { name: /Poner al decisor de la etapa 1/ })
    .click();
  await expect(dueno).toHaveValue("Jefa de retención");
  // la prueba no fue por tiempo: la cadencia la escribes tú
  await expect(e10.getByTestId("protocolo-cadencia10")).toContainText(
    "no fue por tiempo",
  );
  await registrar.click();
  await expect(e10.getByRole("alert")).toContainText(
    "cada cuántos meses se reentrena",
  );
  await e10.getByLabel("Reentrenar cada (meses)").fill("6");
  await e10
    .getByLabel("Para qué NO usarlo (opcional)")
    .fill("Clientes con menos de seis meses en el banco");
  // la columna de texto del modelo se ofrece sin marcar: tú decides si se guardan los nombres de sus categorías
  const texto = e10.getByTestId("protocolo-texto10");
  await expect(texto.getByRole("checkbox", { name: "empleo" })).not.toBeChecked();
  await expect(texto.getByTestId("protocolo-texto10-estado")).toContainText(
    "Marcadas: 0 de 1",
  );

  // la vista previa sale del cuaderno más lo que escribiste, con la 10 por registrar
  await e10.getByText("Vista previa de la ficha").click();
  const previa = e10.getByTestId("protocolo-preview10-secciones");
  await expect(previa).toContainText(
    "Responde por el modelo: Jefa de retención.",
  );
  await expect(previa).toContainText("se registra con esta etapa");
  await axeBothThemes(page);
  await sinDesborde(page, 360);

  await registrar.click();
  await expect(e10.getByText("Cumplida")).toBeVisible();
  await expect(page.locator("#etapa-10-titulo")).toBeFocused();
  // la 10 no abrió nada en el worker
  expect(await mensajes(page)).toBe(antes);

  // «Protocolo completo»: en la página y en el cuaderno
  await expect(page.getByTestId("protocolo-completo")).toContainText(
    "Protocolo completo",
  );
  await expect(page.getByTestId("cuaderno-completo")).toContainText(
    "Protocolo completo.",
  );
  const resumen = page.getByTestId("cuaderno-resumen10");
  await expect(resumen).toContainText("Ficha de un modelo para usar.");
  await expect(resumen).toContainText("Responde: Jefa de retención.");
  await expect(resumen).toContainText("Cadencia de reentreno (en meses): 6.");

  // la ficha, con sus secciones y cada línea con su etapa, fecha y huella
  const constancia = e10.getByTestId("protocolo-constancia10");
  await expect(constancia.getByTestId("ficha-titular")).toHaveText(
    "Un modelo para usar",
  );
  for (const seccion of [
    "datos",
    "poblacion",
    "metricas",
    "decision",
    "limites",
    "cumplio",
    "vigilancia",
    "responde",
  ])
    await expect(
      constancia.getByTestId(`ficha-seccion-${seccion}`),
    ).toBeVisible();
  await expect(constancia.getByTestId("ficha-seccion-variante")).toHaveCount(0);
  const cumplio = constancia.getByTestId("ficha-seccion-cumplio");
  await expect(cumplio).toContainText("Fuga de datos revisada");
  await expect(cumplio).toContainText(
    "Partición Estratificada con prueba sellada",
  );
  await expect(cumplio).toContainText("Calibración medida");
  await expect(cumplio).toContainText(/Etapa 6 · .* · huella [0-9a-f]{12}/);
  await expect(constancia.getByTestId("ficha-seccion-responde")).toContainText(
    "Escrito por el dueño",
  );
  await expect(constancia.getByTestId("ficha-seccion-vigilancia")).toContainText(
    "Sin vigilar por decisión del dueño (1): empleo.",
  );
  await expect(constancia).not.toContainText(/protocol\.stage\./);
  await axeBothThemes(page);
  await sinDesborde(page, 360);

  // la descarga: Markdown en español, con sus secciones y sin una sola fila de tus datos
  const { nombre, contenido } = await descargarFicha(page);
  expect(nombre).toBe("ficha-del-modelo-credito-fuga-plantada.md");
  expect(contenido).toMatch(/^# Ficha del modelo\n/);
  for (const encabezado of [
    "## Los datos",
    "## Población, periodo y exclusiones",
    "## Lo que midió la prueba",
    "## La decisión, con números",
    "## Límites y para qué NO usarlo",
    "## Lo que este modelo cumplió",
    "## Plan de vigilancia",
    "## Quién responde",
  ])
    expect(contenido).toContain(encabezado);
  expect(contenido).toContain("Responde por el modelo: Jefa de retención.");
  expect(contenido).toContain("Sin vigilar por decisión del dueño (1): empleo.");
  expect(contenido).toContain(
    "Para qué NO usarlo (escrito por el dueño): Clientes con menos de seis meses en el banco",
  );
  expect(contenido).toMatch(/_Etapa 4 · .* · huella [0-9a-f]{12}_/);
  expect(contenido).toMatch(/_Escrito por el dueño · /);
  expect(contenido).not.toMatch(/protocol\.stage\./);
  const csv = readFileSync(KIT("credito-fuga-plantada.csv"), "utf8").split(
    "\n",
  );
  for (const fila of csv.slice(1).filter(Boolean))
    expect(contenido, `una fila del CSV en la ficha: ${fila}`).not.toContain(
      fila,
    );

  // el chequeo de deriva: el mismo archivo sigue; con el ingreso ×3, reentrenar, en esa columna
  const deriva = constancia.getByTestId("protocolo-deriva10");
  await expect(deriva).toContainText("Mide si las entradas de hoy se parecen");
  await deriva
    .getByTestId("protocolo-deriva10-csv")
    .setInputFiles(KIT("credito-fuga-plantada.csv"));
  await expect(
    deriva.getByTestId("protocolo-deriva10-veredicto"),
  ).toContainText("Sigue: ninguna columna cambió");
  await deriva
    .getByTestId("protocolo-deriva10-csv")
    .setInputFiles(
      csvConColumna("credito-fuga-plantada.csv", "ingreso_mensual", (v) =>
        String(Number(v) * 3),
      ),
    );
  await expect(
    deriva.getByTestId("protocolo-deriva10-veredicto"),
  ).toContainText("Reentrena");
  const alerta = deriva.locator('tr[data-estado="alerta"]');
  await expect(alerta).toContainText("ingreso_mensual");
  await expect(alerta).toContainText("Alerta");
  await expect(deriva).toContainText("esto mide las entradas, no el desempeño");
  await expect(deriva.getByTestId("protocolo-deriva10-sin-vigilar")).toContainText(
    "empleo",
  );
  await axeBothThemes(page);
  await sinDesborde(page, 360);

  // regla dura 2: ni el cuaderno exportado ni la red llevan una fila de tus datos, y nada fue a la narración
  const [exporta] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar cuaderno" }).click(),
  ]);
  const exportado = readFileSync((await exporta.path())!, "utf8");
  expect(exportado).toContain('"decision": "usar"');
  expect(exportado).toContain('"dueno": "Jefa de retención"');
  // lo que no marcaste no deja ningún nombre de categoría: solo la referencia numérica y la lista de lo no vigilado
  const archivo = JSON.parse(exportado) as {
    cuaderno: {
      evidencias: {
        etapa: number;
        datos: {
          respuestas: Record<string, unknown>;
          chequeos: Record<string, unknown>;
        };
      }[];
    };
  };
  const e10Guardada = archivo.cuaderno.evidencias.find((e) => e.etapa === 10)!;
  expect(e10Guardada.datos.respuestas.vigilar_texto).toEqual([]);
  expect(e10Guardada.datos.chequeos.vig_omitidas).toEqual(["empleo"]);
  for (const ref of e10Guardada.datos.chequeos.vig_referencia as string[])
    expect((JSON.parse(ref) as { tipo: string }).tipo).toBe("numero");
  const red = peticiones.join("\n");
  expect(red).not.toContain("/api/narrate");
  for (const fila of csv.slice(1).filter(Boolean)) {
    expect(exportado, `una fila del CSV en el cuaderno: ${fila}`).not.toContain(
      fila,
    );
    expect(red, `una fila del CSV en la red: ${fila}`).not.toContain(fila);
  }
});

test("etapa 10 con precio y «usar»: llega a «Protocolo completo» con su ficha, sin calibración ni piso en beneficio neto", async ({
  page,
}) => {
  await prepararPrecio(page);
  await cumplirEtapa4Precio(page);
  await cumplirEtapa5SinRegla(page);
  await cumplirEtapa6Sugerida(page);
  await cumplirEtapa7(page);
  await cumplirEtapa8(page, "Falla con las casas más grandes del centro");
  await cumplirEtapa9(
    page,
    "Usarlo",
    "Cuesta menos que pedir siempre la mediana",
  );
  const e10 = page.locator("#etapa-10");
  await expect(e10.getByText("Abierta", { exact: true })).toBeVisible();
  await e10
    .getByLabel("Persona o rol que responde por este modelo")
    .fill("Corredora principal");
  await e10.getByLabel("Reentrenar cada (meses)").fill("12");
  // aquí sí se marca la columna de texto: sus categorías con soporte entran a lo que se vigila
  await e10.getByRole("checkbox", { name: "barrio" }).check();
  await expect(e10.getByTestId("protocolo-texto10-estado")).toContainText("Marcadas: 1 de");
  await sinDesborde(page, 360);
  await e10.getByRole("button", { name: "Registrar la etapa 10" }).click();
  await expect(e10.getByText("Cumplida")).toBeVisible();
  await expect(page.getByTestId("protocolo-completo")).toBeVisible();

  const constancia = e10.getByTestId("protocolo-constancia10");
  await expect(constancia.getByTestId("ficha-titular")).toHaveText(
    "Un modelo para usar",
  );
  await expect(constancia.getByTestId("ficha-seccion-cumplio")).toContainText(
    "Calibración: no aplica al estimar una cantidad.",
  );
  await expect(
    constancia.getByTestId("ficha-seccion-vigilancia"),
  ).not.toContainText("beneficio neto");
  await expect(
    constancia.getByTestId("ficha-seccion-vigilancia"),
  ).toContainText(/Columnas vigiladas por deriva \(\d+\): .*barrio/);
  const { nombre, contenido } = await descargarFicha(page);
  expect(nombre).toBe("ficha-del-modelo-precio-fuga-plantada.md");
  expect(contenido).toContain("## Lo que este modelo cumplió");
  expect(contenido).toContain(
    "Calibración: no aplica al estimar una cantidad.",
  );
  expect(contenido).toContain("Responde por el modelo: Corredora principal.");
  const csv = readFileSync(KIT("precio-fuga-plantada.csv"), "utf8").split("\n");
  for (const fila of csv.slice(1).filter(Boolean))
    expect(contenido, `una fila del CSV en la ficha: ${fila}`).not.toContain(
      fila,
    );
  await axeBothThemes(page);
});

test("etapa 10 con crédito y «no usar»: su ficha dice qué tendría que cambiar, sin plan de vigilancia ni chequeo", async ({
  page,
}) => {
  await prepararCredito(page);
  await cumplirEtapa4Credito(page);
  await cumplirEtapa5SinRegla(page);
  await cumplirEtapa6Credito(page);
  await cumplirEtapa7(page);
  await cumplirEtapa8(page, "Falla con quienes trabajan en la informalidad");
  await cumplirEtapa9(
    page,
    "No usarlo",
    "Con 40 filas de prueba no me fío: junto más datos antes",
  );
  const e10 = page.locator("#etapa-10");
  await expect(e10.getByTestId("protocolo-decision10")).toContainText(
    "No usarlo: la ficha deja escrito por qué",
  );
  await expect(e10.getByTestId("protocolo-cadencia10")).toHaveCount(0);
  await expect(e10.getByTestId("protocolo-plan10")).toHaveCount(0);
  await e10
    .getByLabel("Persona o rol que responde por este modelo")
    .fill("Jefa de retención");
  const registrar = e10.getByRole("button", { name: "Registrar la etapa 10" });
  await registrar.click();
  await expect(e10.getByRole("alert")).toContainText(
    "qué tendría que cambiar para que sirva",
  );
  await e10
    .getByLabel("Qué tendría que cambiar para que sirva")
    .fill(
      "Juntar un año más de datos y medir el ingreso declarado contra el real",
    );
  await registrar.click();
  await expect(e10.getByText("Cumplida")).toBeVisible();
  await expect(page.getByTestId("protocolo-completo")).toBeVisible();

  const constancia = e10.getByTestId("protocolo-constancia10");
  await expect(constancia.getByTestId("ficha-titular")).toHaveText(
    "Un modelo que no se usa",
  );
  await expect(constancia.getByTestId("ficha-seccion-vigilancia")).toHaveCount(
    0,
  );
  await expect(constancia.getByTestId("protocolo-deriva10")).toHaveCount(0);
  await expect(constancia.getByTestId("ficha-seccion-variante")).toContainText(
    "Juntar un año más de datos",
  );
  const { contenido } = await descargarFicha(page);
  expect(contenido).toContain("## Qué cambiar");
  expect(contenido).not.toContain("## Plan de vigilancia");
  expect(contenido).toContain(
    "Qué tendría que cambiar para que sirva (escrito por el dueño): Juntar un año más de datos",
  );
  await axeBothThemes(page);
  await sinDesborde(page, 360);
});

test("etapa 10 con crédito e «iterar» (S16, S15 B6): su ficha dice qué cambiar antes de volver a probar y que la prueba ya se abrió, sin plan de vigilancia ni chequeo", async ({
  page,
}) => {
  await prepararCredito(page);
  await cumplirEtapa4Credito(page);
  await cumplirEtapa5SinRegla(page);
  await cumplirEtapa6Credito(page);
  await cumplirEtapa7(page);
  await cumplirEtapa8(page, "Falla con quienes trabajan en la informalidad");
  await cumplirEtapa9(
    page,
    "Iterar: mejorarlo antes de decidir",
    "Falla con quienes trabajan en la informalidad: sumo esa señal",
  );
  const e10 = page.locator("#etapa-10");
  await expect(e10.getByTestId("protocolo-decision10")).toContainText(
    "Iterar: la ficha deja escrito qué cambiar",
  );
  await expect(e10.getByTestId("protocolo-cadencia10")).toHaveCount(0);
  await expect(e10.getByTestId("protocolo-plan10")).toHaveCount(0);
  await e10
    .getByLabel("Persona o rol que responde por este modelo")
    .fill("Jefa de retención");
  const registrar = e10.getByRole("button", { name: "Registrar la etapa 10" });
  await registrar.click();
  await expect(e10.getByRole("alert")).toContainText(
    "qué tendría que cambiar para que sirva",
  );
  await e10
    .getByLabel("Qué vas a cambiar antes de volver a probar")
    .fill("Sumar la señal de informalidad y volver con una partición nueva");
  await registrar.click();
  await expect(e10.getByText("Cumplida")).toBeVisible();
  await expect(page.getByTestId("protocolo-completo")).toBeVisible();

  const constancia = e10.getByTestId("protocolo-constancia10");
  await expect(constancia.getByTestId("ficha-titular")).toHaveText(
    "Un modelo para iterar",
  );
  await expect(constancia.getByTestId("ficha-seccion-vigilancia")).toHaveCount(
    0,
  );
  await expect(constancia.getByTestId("protocolo-deriva10")).toHaveCount(0);
  const variante = constancia.getByTestId("ficha-seccion-variante");
  await expect(variante).toContainText("Sumar la señal de informalidad");
  await expect(variante).toContainText("La prueba ya se abrió");
  const { contenido } = await descargarFicha(page);
  expect(contenido).toContain("## Qué cambiar");
  expect(contenido).not.toContain("## Plan de vigilancia");
  expect(contenido).toContain(
    "Qué cambiar antes de volver a probar (escrito por el dueño): Sumar la señal de informalidad",
  );
  await axeBothThemes(page);
  await sinDesborde(page, 360);
});
