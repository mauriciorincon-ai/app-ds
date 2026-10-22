import { expect, type Page } from "@playwright/test";

// S16 — teclado completo por e2e. Hasta aquí ningún spec pulsaba Tab: axe mide el árbol, no el recorrido.
//
// `recorrerConTeclado` camina un ámbito con Tab y comprueba lo que una persona sin ratón necesita:
//  · cada parada es visible, tiene nombre accesible y muestra el indicador de foco (el contorno de
//    `:focus-visible` de globals.css);
//  · el orden de las paradas es el del documento (ningún tabindex positivo, ningún salto atrás);
//  · el ámbito se puede abandonar (sin trampa) y cada control que se ve y se puede usar se alcanza
//    (de un grupo de radios basta una parada: las flechas mueven dentro del grupo).

export type Parada = {
  etiqueta: string;
  nombre: string;
  rol: string;
};

type Foto = {
  dentro: boolean;
  etiqueta: string;
  nombre: string;
  rol: string;
  visible: boolean;
  contorno: boolean;
  orden: number;
  leyenda: string;
};

const CONTROLES =
  'button, a[href], input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';

/** Foto del elemento con el foco, medida en la página. */
async function fotografiar(page: Page, ambito: string): Promise<Foto> {
  return page.evaluate(
    ({ ambito }) => {
      const raiz = document.querySelector(ambito);
      const el = document.activeElement as HTMLElement | null;
      if (!raiz || !el || el === document.body)
        return {
          dentro: false,
          etiqueta: "",
          nombre: "",
          rol: "",
          visible: false,
          contorno: false,
          orden: -1,
          leyenda: "",
        };
      const dentro = raiz.contains(el) && raiz !== el;
      const texto = (nodo: Element | null) =>
        (nodo?.textContent ?? "").replace(/\s+/g, " ").trim();
      const nombreDe = (nodo: HTMLElement): string => {
        const etiqueta = nodo.getAttribute("aria-label");
        if (etiqueta?.trim()) return etiqueta.trim();
        const por = nodo.getAttribute("aria-labelledby");
        if (por) {
          const t = por
            .split(/\s+/)
            .map((id) => texto(document.getElementById(id)))
            .join(" ")
            .trim();
          if (t) return t;
        }
        const labels = (nodo as HTMLInputElement).labels;
        if (labels && labels.length) {
          const t = [...labels].map((l) => texto(l)).join(" ");
          if (t.trim()) return t.trim();
        }
        // Un campo sin etiqueta no se nombra con su contenido (las opciones de un selector, el texto escrito, un marcador):
        // solo un botón, un enlace o un resumen se nombran con lo que dicen (auditoría S16, H-12).
        const esCampo =
          nodo instanceof HTMLSelectElement ||
          nodo instanceof HTMLTextAreaElement ||
          (nodo instanceof HTMLInputElement &&
            !["button", "submit", "reset"].includes(nodo.type));
        if (!esCampo) {
          const t = texto(nodo);
          if (t) return t;
        }
        return (
          nodo.getAttribute("title") ??
          (nodo instanceof HTMLInputElement && !esCampo ? nodo.value : "")
        );
      };
      const caja = el.getBoundingClientRect();
      const estilo = getComputedStyle(el);
      // El foco visible de la app es un contorno (`:focus-visible` de globals.css): una sombra fija no lo sustituye (H-29)
      const contorno =
        estilo.outlineStyle !== "none" && parseFloat(estilo.outlineWidth) > 0;
      const todos = [...document.querySelectorAll("*")];
      return {
        dentro,
        etiqueta: el.tagName.toLowerCase(),
        nombre: nombreDe(el),
        rol:
          el.getAttribute("role") ??
          (el instanceof HTMLInputElement ? el.type : el.tagName.toLowerCase()),
        visible:
          caja.width > 0 &&
          caja.height > 0 &&
          estilo.visibility !== "hidden" &&
          estilo.display !== "none",
        contorno,
        orden: todos.indexOf(el),
        leyenda: texto(el.closest("fieldset")?.querySelector("legend") ?? null),
      };
    },
    { ambito },
  );
}

/** Los controles del ámbito que una persona ve y puede usar, con su grupo de radios si lo tienen. */
async function controlesDelAmbito(page: Page, ambito: string) {
  return page.evaluate(
    ({ ambito, controles }) => {
      const raiz = document.querySelector(ambito);
      if (!raiz) return [];
      const todos = [...document.querySelectorAll("*")];
      return [...raiz.querySelectorAll<HTMLElement>(controles)]
        .filter((el) => {
          const caja = el.getBoundingClientRect();
          const estilo = getComputedStyle(el);
          const inerte = el.closest("[inert]") !== null;
          const cerrado = el.closest("details:not([open])");
          const enResumen = el.tagName === "SUMMARY";
          return (
            // lo oculto a los lectores a propósito (el selector de archivos del botón «Cargar») no cuenta; un control usable
            // con tabindex="-1" sí: es justo el defecto que esta guarda debe cazar (H-08)
            !el.closest('[aria-hidden="true"]') &&
            caja.width > 0 &&
            caja.height > 0 &&
            estilo.visibility !== "hidden" &&
            estilo.display !== "none" &&
            !inerte &&
            !(el as HTMLButtonElement).disabled &&
            (!cerrado ||
              (enResumen && cerrado.querySelector(":scope > summary") === el))
          );
        })
        .map((el) => ({
          orden: todos.indexOf(el),
          grupo:
            el instanceof HTMLInputElement && el.type === "radio" && el.name
              ? `radio:${el.name}`
              : "",
          nombre:
            el.getAttribute("aria-label") ??
            (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
        }));
    },
    { ambito, controles: CONTROLES },
  );
}

/**
 * Camina `ambito` con Tab. Devuelve las paradas. Falla si una parada no se ve, no tiene nombre o no
 * muestra el foco, si el orden retrocede, si el ámbito no se abandona, o si un control usable no se alcanza.
 */
export async function recorrerConTeclado(
  page: Page,
  ambito: string,
  { minimo = 1, max = 200 }: { minimo?: number; max?: number } = {},
): Promise<Parada[]> {
  // El foco parte de la propia sección (tabindex -1, solo para el recorrido): el siguiente Tab cae en su primer control.
  await page.evaluate((ambito) => {
    const raiz = document.querySelector<HTMLElement>(ambito);
    if (!raiz) throw new Error(`no hay ámbito ${ambito}`);
    raiz.dataset.tecladoTabindex = raiz.getAttribute("tabindex") ?? "";
    raiz.setAttribute("tabindex", "-1");
    raiz.focus({ preventScroll: true });
  }, ambito);

  const paradas: Parada[] = [];
  const visitados: number[] = [];
  let anterior = -1;
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const foto = await fotografiar(page, ambito);
    if (!foto.dentro) break;
    const donde = `parada ${i + 1} en ${ambito}: <${foto.etiqueta}> «${foto.nombre}»`;
    expect(foto.visible, `${donde} se ve`).toBe(true);
    expect(foto.nombre, `${donde} tiene nombre`).not.toBe("");
    expect(foto.contorno, `${donde} muestra el foco`).toBe(true);
    // un grupo de radios y sus vecinos comparten orden: no retrocede
    expect(foto.orden, `${donde} sigue el orden del documento`).toBeGreaterThan(
      anterior,
    );
    anterior = foto.orden;
    visitados.push(foto.orden);
    paradas.push({
      etiqueta: foto.etiqueta,
      nombre: foto.nombre,
      rol: foto.rol,
    });
  }
  await page.evaluate((ambito) => {
    const raiz = document.querySelector<HTMLElement>(ambito);
    if (!raiz) return;
    const previo = raiz.dataset.tecladoTabindex ?? "";
    if (previo) raiz.setAttribute("tabindex", previo);
    else raiz.removeAttribute("tabindex");
    delete raiz.dataset.tecladoTabindex;
  }, ambito);

  expect(
    paradas.length,
    `${ambito}: el recorrido salió del ámbito (sin trampa) y tuvo paradas`,
  ).toBeGreaterThanOrEqual(minimo);
  expect(
    paradas.length,
    `${ambito}: Tab no se queda dando vueltas`,
  ).toBeLessThan(max);

  const alcanzado = new Set(visitados);
  const grupos = new Set<string>();
  for (const orden of visitados) {
    const control = (await controlesDelAmbito(page, ambito)).find(
      (c) => c.orden === orden,
    );
    if (control?.grupo) grupos.add(control.grupo);
  }
  const sinAlcanzar = (await controlesDelAmbito(page, ambito)).filter(
    (c) => !alcanzado.has(c.orden) && !(c.grupo && grupos.has(c.grupo)),
  );
  expect(
    sinAlcanzar.map((c) => c.nombre),
    `${ambito}: controles que se ven y no se alcanzan con Tab`,
  ).toEqual([]);
  if (process.env.TECLADO_VERBOSO)
    console.log(`${ambito}: ${paradas.length} paradas`);
  return paradas;
}

/** Activa con el teclado el control que tiene el foco: Enter en enlaces, botones y resúmenes; Espacio en casillas. */
export async function activarConTeclado(page: Page, tecla = "Enter") {
  await page.keyboard.press(tecla);
}

/**
 * Lleva el foco al destino solo con Tab, desde donde esté: un selector CSS o una expresión sobre el nombre
 * accesible del control. Devuelve cuántas pulsaciones hicieron falta; falla si no llega.
 */
export async function tabularHasta(
  page: Page,
  destino: RegExp | string,
  max = 150,
) {
  for (let i = 0; i <= max; i++) {
    const llegó =
      typeof destino === "string"
        ? await page.evaluate(
            (selector) => document.activeElement?.matches(selector) ?? false,
            destino,
          )
        : destino.test((await fotografiar(page, "body")).nombre);
    if (llegó) return i;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Tab no llegó a ${String(destino)} en ${max} pulsaciones`);
}

/** Mayús+Tab hacia atrás hasta el destino (mismo contrato que `tabularHasta`). */
export async function tabularAtrasHasta(
  page: Page,
  destino: RegExp | string,
  max = 150,
) {
  for (let i = 0; i <= max; i++) {
    const llegó =
      typeof destino === "string"
        ? await page.evaluate(
            (selector) => document.activeElement?.matches(selector) ?? false,
            destino,
          )
        : destino.test((await fotografiar(page, "body")).nombre);
    if (llegó) return i;
    await page.keyboard.press("Shift+Tab");
  }
  throw new Error(
    `Mayús+Tab no llegó a ${String(destino)} en ${max} pulsaciones`,
  );
}

/** El elemento con el foco, para comprobar adónde fue a parar tras cerrar un diálogo o registrar una etapa. */
export async function focoActual(page: Page) {
  return fotografiar(page, "body");
}

/**
 * Dentro de un diálogo modal, Tab y Mayús+Tab no llegan nunca a la página de atrás: el foco da la vuelta por los
 * controles del diálogo (o sale un instante a la interfaz del navegador, que aquí se ve como `body`) y, en el
 * recorrido completo, pasa por todos. Es la trampa de foco que pide un modal.
 */
export async function focoAtrapado(page: Page, dialogo: string) {
  const estado = () =>
    page.evaluate((dialogo) => {
      const raiz = document.querySelector(dialogo);
      const el = document.activeElement;
      if (!raiz || !el || el === document.body)
        return { donde: "navegador", orden: -1 };
      return raiz.contains(el)
        ? {
            donde: "dentro",
            orden: [...raiz.querySelectorAll("*")].indexOf(el),
          }
        : {
            donde: "FUERA",
            orden: -1,
            etiqueta: `${el.tagName} ${(el.textContent ?? "").slice(0, 40)}`,
          };
    }, dialogo);
  const total = await page.evaluate(
    (dialogo) =>
      document
        .querySelector(dialogo)
        ?.querySelectorAll(
          "button:not([disabled]), a[href], input, select, textarea",
        ).length ?? 0,
    dialogo,
  );
  expect(total, `${dialogo} tiene controles`).toBeGreaterThan(0);
  for (const tecla of ["Tab", "Shift+Tab"]) {
    const vistos = new Set<number>();
    for (let i = 0; i < total * 2 + 2; i++) {
      await page.keyboard.press(tecla);
      const ahora = await estado();
      expect(
        ahora.donde,
        `${tecla} ${i + 1}: el foco no sale a la página de atrás`,
      ).not.toBe("FUERA");
      if (ahora.donde === "dentro") vistos.add(ahora.orden);
    }
    expect(
      vistos.size,
      `${tecla}: recorre todos los controles del diálogo`,
    ).toBe(total);
  }
}

export type Paso =
  | { nombre: RegExp; escribe: string }
  | { nombre: RegExp; marca: true }
  | { leyenda: RegExp; elige: RegExp }
  | { nombre: RegExp; pulsa: string };

/**
 * Rellena un ámbito como lo haría quien no usa ratón: Tab hasta cada control, texto con el teclado, Espacio en
 * una casilla, flechas dentro de un grupo de radios y Enter en el botón. Falla si un paso no encuentra su control.
 */
export async function completarConTeclado(
  page: Page,
  ambito: string,
  pasos: readonly Paso[],
  { max = 200 }: { max?: number } = {},
) {
  await page.evaluate((ambito) => {
    const raiz = document.querySelector<HTMLElement>(ambito);
    if (!raiz) throw new Error(`no hay ámbito ${ambito}`);
    raiz.setAttribute("tabindex", "-1");
    raiz.focus({ preventScroll: true });
  }, ambito);
  const pendientes = [...pasos];
  for (let i = 0; i < max && pendientes.length > 0; i++) {
    await page.keyboard.press("Tab");
    const foto = await fotografiar(page, ambito);
    if (!foto.dentro) break;
    const paso = pendientes[0]!;
    if ("elige" in paso) {
      if (!paso.leyenda.test(foto.leyenda)) continue;
      // las flechas mueven el foco dentro del grupo y marcan la opción a la que llegan
      for (let k = 0; k < 12; k++) {
        const actual = await fotografiar(page, ambito);
        if (paso.elige.test(actual.nombre)) break;
        await page.keyboard.press("ArrowDown");
      }
      const elegida = await fotografiar(page, ambito);
      expect(elegida.nombre, `grupo «${foto.leyenda}»`).toMatch(paso.elige);
      await page.keyboard.press("Space");
      pendientes.shift();
      continue;
    }
    if (!paso.nombre.test(foto.nombre)) continue;
    if ("escribe" in paso) await page.keyboard.type(paso.escribe);
    else if ("marca" in paso) await page.keyboard.press("Space");
    else await page.keyboard.press(paso.pulsa);
    pendientes.shift();
  }
  await page.evaluate((ambito) => {
    document.querySelector(ambito)?.removeAttribute("tabindex");
  }, ambito);
  expect(
    pendientes.map((p) => ("nombre" in p ? p.nombre.source : p.leyenda.source)),
    `${ambito}: pasos que el teclado no encontró`,
  ).toEqual([]);
}
