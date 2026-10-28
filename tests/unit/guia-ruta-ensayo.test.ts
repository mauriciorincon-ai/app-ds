// @vitest-environment jsdom
/**
 * S21: el script de la guía de prueba, ejecutado. Con el filtro «Ensayo general del H-2» las 44 paradas se ven en el orden en que se
 * recorren (el de la lista de la caja, que `documentos-s21` ata a los chips «N de 44») y agrupadas por tanda; al quitar el filtro cada
 * parada vuelve a su bloque. Hasta el 2026-10-28 el filtro las mostraba en el orden de los bloques (7, 1, 6, 2…) y el ensayo obligaba a
 * saltar por la página.
 */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

const html = readFileSync("docs/GUIA-DE-PRUEBA.html", "utf8");
const caja = html.slice(
  html.indexOf('id="ensayo"'),
  html.indexOf('<div class="kit">'),
);
const orden = [
  ...caja.matchAll(/<li><strong>([A-Za-z0-9]+)<\/strong> · /g),
].map((m) => m[1]!.toLowerCase());

const bloqueDe = (id: string) =>
  document.getElementById(id)!.closest("section")!.querySelector("h2")!
    .textContent;
const pulsar = (filtro: string) =>
  document
    .querySelector<HTMLButtonElement>(`[data-filtro="${filtro}"]`)!
    .click();

beforeAll(() => {
  // el cuerpo de la página y su único script, tal como los abre el navegador
  document.body.innerHTML = html.slice(
    html.indexOf("<body>") + "<body>".length,
    html.indexOf("<script>"),
  );
  new Function(
    html.slice(
      html.indexOf("<script>") + "<script>".length,
      html.indexOf("</script>"),
    ),
  )();
});

describe("guía: el filtro del ensayo recorre las paradas en orden", () => {
  it("muestra las 44 paradas en el orden en que se recorren, por tanda, y nada más", () => {
    expect(orden).toHaveLength(44);
    pulsar("ensayo");
    const ruta = document.getElementById("ruta-ensayo")!;
    expect(ruta.hidden).toBe(false);
    const visibles = [
      ...ruta.querySelectorAll<HTMLInputElement>(
        'li:not([hidden]) input[type="checkbox"]',
      ),
    ].map((c) => c.id);
    expect(visibles).toEqual(orden);
    expect(ruta.querySelectorAll("[data-tanda-desde]")).toHaveLength(5);
    for (const sec of document.querySelectorAll<HTMLElement>("section.bloque"))
      if (sec !== ruta)
        expect(sec.hidden, sec.querySelector("h2")?.textContent ?? "").toBe(
          true,
        );
    expect(document.getElementById("contador")!.textContent).toBe("0/44");
    pulsar("todo");
  });

  it("al quitar el filtro, cada parada vuelve a su bloque y la ruta queda vacía", () => {
    const antes = orden.map(bloqueDe);
    pulsar("ensayo");
    expect(orden.map(bloqueDe)).not.toEqual(antes);
    pulsar("todo");
    expect(document.getElementById("ruta-ensayo")!.hidden).toBe(true);
    expect(document.getElementById("ruta-paradas")!.childNodes).toHaveLength(0);
    expect(orden.map(bloqueDe)).toEqual(antes);
    // y se puede volver a armar
    pulsar("ensayo");
    expect(
      [
        ...document.querySelectorAll<HTMLInputElement>(
          '#ruta-ensayo li:not([hidden]) input[type="checkbox"]',
        ),
      ].map((c) => c.id),
    ).toEqual(orden);
    pulsar("todo");
  });
});
