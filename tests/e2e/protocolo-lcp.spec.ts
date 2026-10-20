import { expect, test } from "@playwright/test";

// S14 — la deuda de H2 anotada en el ci.yml desde el S4: medir el LCP OBSERVADO con PerformanceObserver, que es lo
// que de verdad experimenta quien abre la página, y no solo el SIMULADO de Lighthouse (que castiga una página de
// texto sana: 3.373 ms simulados de /protocolo contra decenas de milisegundos observados en local, S14). La mediana de tres
// cargas de /protocolo no pasa de 2.500 ms: si lo pasa, algo entró al camino del primer cuadro (Pyodide, una
// pantalla de etapa, un diccionario) y esta prueba lo dice con la cifra.
// El «bueno» de Core Web Vitals para el LCP observado. El 3.500 del perf-budget.json es del LCP SIMULADO de Lighthouse.
const LCP_MAX_MS = 2500;
const CARGAS = 3;

test("/protocolo: el LCP observado (mediana de tres cargas) queda bajo 2.500 ms", async ({
  page,
}) => {
  const medidas: number[] = [];
  for (let i = 0; i < CARGAS; i++) {
    await page.goto("/protocolo", { waitUntil: "load" });
    await expect(
      page.getByRole("heading", { level: 1, name: "Protocolo DS" }),
    ).toBeVisible();
    // el LCP se afirma cuando el navegador termina de pintar; el observador con `buffered` trae lo ya pintado
    await page.waitForTimeout(500);
    const lcp = await page.evaluate(
      () =>
        new Promise<number>((resolver) => {
          const observador = new PerformanceObserver((lista) => {
            const entradas = lista.getEntries();
            const ultima = entradas[entradas.length - 1];
            if (ultima) {
              observador.disconnect();
              resolver(ultima.startTime);
            }
          });
          observador.observe({
            type: "largest-contentful-paint",
            buffered: true,
          });
          setTimeout(() => resolver(-1), 5000);
        }),
    );
    expect(lcp, "el navegador no reportó ningún LCP").toBeGreaterThan(0);
    medidas.push(lcp);
  }
  const mediana = [...medidas].sort((a, b) => a - b)[Math.floor(CARGAS / 2)]!;
  const cifras = medidas.map((m) => Math.round(m)).join(" / ");
  test.info().annotations.push({
    type: "lcp-observado",
    description: `${cifras} ms · mediana ${Math.round(mediana)} ms · techo ${LCP_MAX_MS} ms`,
  });
  console.log(
    `LCP observado de /protocolo (${test.info().project.name}): ${cifras} ms · mediana ${Math.round(mediana)} ms`,
  );
  expect(
    mediana,
    `LCP observado ${Math.round(mediana)} ms (${cifras}) sobre el techo de ${LCP_MAX_MS} ms`,
  ).toBeLessThanOrEqual(LCP_MAX_MS);
});
