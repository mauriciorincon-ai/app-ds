// Protocolo DS (S15), etapa 10 — la compuerta de la ficha y del plan de vigilancia, con el crédito registrado
// por la compuerta real hasta la 9. Lo que tiene que valer:
//  · DEMO EN ROJO: sin dueño nombrado la compuerta no pasa, y lo nombra; con él, el Protocolo queda completo;
//  · «usar»: la referencia de deriva sale del entrenamiento sellado (una por columna vigilada, que cuenta
//    exactamente sus filas), solo agregados; de una columna de TEXTO solo se guardan los nombres de categoría
//    si el dueño la marca (decisión del usuario, 2026-10-20); la cadencia es obligatoria, acortarla es libre
//    y alargarla más allá de lo que respalda la prueba exige razón;
//  · «no usar» e «iterar» cierran con el dueño y qué cambiar, sin plan de vigilancia ni referencia;
//  · el cuaderno editado a mano no pasa: `leer` nombra el campo, y una referencia cambiada con la misma forma
//    queda por verificar (no cuadra con la tabla).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluar } from "@/engine/protocolo/compuerta";
import { plan7 } from "@/engine/protocolo/etapa7";
import {
  CADENCIA_MAX,
  DUENO_MAX,
  ETAPA_10,
  cadenciaDe,
  cadenciaSugerida,
  calcular10,
  columnasDeTexto,
  mesesEntre,
} from "@/engine/protocolo/etapa10";
import type { DatosEtapa, Previas } from "@/engine/protocolo/etapas";
import { REF_SOPORTE_MIN, leerReferencia } from "@/engine/protocolo/referencia-deriva";
import { valoresDe } from "@/engine/protocolo/tabla";
import {
  ENTRADA_NO_USAR,
  ENTRADA_USAR,
  HUELLA,
  PROTOCOLO10,
  armarCredito9,
  datos10,
  registrar10,
} from "./protocolo-etapa10-helpers";

const USAR = armarCredito9("usar");
const NO_USAR = armarCredito9("no-usar");
const ITERAR = armarCredito9("iterar");

type Libre = Record<string, unknown>;
const con = (d: DatosEtapa, respuestas: Libre = {}, chequeos: Libre = {}) =>
  ({
    respuestas: { ...d.respuestas, ...respuestas },
    chequeos: { ...d.chequeos, ...chequeos },
  }) as DatosEtapa;

/** Las previas del crédito, como si la etapa 6 hubiera partido por tiempo con ese corte. */
const conTiempo = (corte: string, fin: string): Previas => ({
  ...USAR.previas,
  2: con(USAR.previas[2]!, {}, { fecha_max: fin }),
  6: con(USAR.previas[6]!, {}, { corte }),
});

describe("la compuerta de la etapa 10", () => {
  it("DEMO EN ROJO: sin dueño nombrado no pasa, y lo nombra", () => {
    const r = registrar10(USAR, datos10(USAR, { ...ENTRADA_USAR, dueno: "   " }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.rechazo).toMatchObject({ tipo: "criterio-no-cumplido", faltan: ["dueno"] });
  });

  it("con el dueño y la cadencia, la etapa se cumple y las diez quedan cumplidas", () => {
    const r = registrar10(USAR, datos10(USAR, ENTRADA_USAR));
    if (!r.ok) throw new Error(JSON.stringify(r.rechazo));
    const estados = evaluar(PROTOCOLO10, r.cuaderno, HUELLA, USAR.tabla).map(
      (e) => e.estado.tipo,
    );
    expect(estados).toEqual(Array(10).fill("cumplida"));
  });

  it("sin la etapa 9 no abre", () => {
    const sin9: Previas = Object.fromEntries(
      Object.entries(USAR.previas).filter(([k]) => k !== "9"),
    );
    expect(ETAPA_10.criterio(datos10(USAR, ENTRADA_USAR), sin9)).toEqual({
      tipo: "falta",
      faltan: ["etapas-previas"],
    });
  });

  it("«usar» exige la cadencia", () => {
    const d = datos10(USAR, { ...ENTRADA_USAR, cadencia: "" });
    expect(ETAPA_10.criterio(d, USAR.previas)).toEqual({
      tipo: "falta",
      faltan: ["cadencia"],
    });
  });

  it("sin partición por tiempo no hay cadencia sugerida: la escribe el dueño, y la trampa lo dice", () => {
    const d = datos10(USAR, ENTRADA_USAR);
    expect(d.chequeos.base_cadencia).toBe("sin-tiempo");
    expect(d.chequeos.cadencia_sugerida).toBeNull();
    expect(ETAPA_10.trampas(d, USAR.previas).map((t) => t.clave)).toEqual([
      "sin-memoria",
      "solo-entradas",
      "sin-tiempo",
      "sin-vigilar",
    ]);
  });

  it("con partición por tiempo, acortar es libre y alargar exige razón (y queda rotulado)", () => {
    const previas = conTiempo("2025-07-01", "2025-12-31");
    expect(cadenciaSugerida(previas)).toEqual({ sugerida: 5, base: "prueba" });
    const d = datos10(USAR, ENTRADA_USAR);
    const corta = con(d, { cadencia: 3 });
    const larga = con(d, { cadencia: 8 });
    expect(ETAPA_10.criterio(corta, previas)).toEqual({ tipo: "cumple" });
    expect(ETAPA_10.criterio(larga, previas)).toEqual({
      tipo: "falta",
      faltan: ["razon-cadencia"],
    });
    const conRazon = con(larga, { razon_cadencia: "El mercado cambia lento" });
    expect(ETAPA_10.criterio(conRazon, previas)).toEqual({ tipo: "cumple" });
    expect(ETAPA_10.trampas(conRazon, previas)).toContainEqual({
      clave: "cadencia-alargada",
      params: { cadencia: 8, sugerida: 5 },
    });
  });

  it("«no usar» cierra con el dueño y qué tendría que cambiar, sin referencia de deriva", () => {
    const sinCambiar = datos10(NO_USAR, { ...ENTRADA_NO_USAR, cambiar: "" });
    expect(ETAPA_10.criterio(sinCambiar, NO_USAR.previas)).toEqual({
      tipo: "falta",
      faltan: ["cambiar"],
    });
    const d = datos10(NO_USAR, ENTRADA_NO_USAR);
    expect(d.chequeos).toMatchObject({
      decision: "no-usar",
      vig_columnas: null,
      vig_referencia: null,
      vig_omitidas: null,
      n_referencia: null,
      cadencia_sugerida: null,
    });
    expect(d.respuestas.vigilar_texto).toEqual([]);
    const r = registrar10(NO_USAR, d);
    expect(r.ok).toBe(true);
  });

  it("«iterar» dice que la prueba ya abierta no se reutiliza", () => {
    const d = datos10(ITERAR, ENTRADA_NO_USAR);
    expect(ETAPA_10.criterio(d, ITERAR.previas)).toEqual({ tipo: "cumple" });
    expect(ETAPA_10.trampas(d, ITERAR.previas)).toContainEqual({
      clave: "prueba-gastada",
      params: { aperturas: 1 },
    });
  });
});

describe("la referencia de deriva de la etapa 10", () => {
  const d = datos10(USAR, ENTRADA_USAR); // sin marcar ninguna columna de texto
  const marcado = datos10(USAR, { ...ENTRADA_USAR, vigilarTexto: ["empleo"] });
  const plan = plan7(USAR.tabla, USAR.previas, HUELLA)!;
  const modelo = [...plan.numericas, ...plan.categoricas];
  const refsDe = (x: DatosEtapa) =>
    (x.chequeos.vig_referencia as string[]).map(leerReferencia);
  const categoriasDe = (columna: string) =>
    [...new Set(valoresDe(USAR.tabla, columna).filter((v) => v !== null))] as string[];

  it("las columnas de texto del modelo son las que el dueño decide vigilar", () => {
    expect(columnasDeTexto(USAR.previas, USAR.tabla, HUELLA)).toEqual(["empleo"]);
    expect(columnasDeTexto(USAR.previas, null, HUELLA)).toEqual([]);
  });

  it("sin marcar nada, de una columna de texto no queda ni un nombre de categoría en lo registrado", () => {
    expect(d.chequeos.vig_columnas).toEqual(modelo.filter((c) => c !== "empleo"));
    expect(d.chequeos.vig_omitidas).toEqual(["empleo"]);
    expect(d.respuestas.vigilar_texto).toEqual([]);
    expect(refsDe(d).every((r) => r?.tipo === "numero")).toBe(true);
    expect(categoriasDe("empleo").length).toBeGreaterThan(1);
    for (const nombre of categoriasDe("empleo"))
      expect(JSON.stringify(d)).not.toContain(nombre);
  });

  it("sin pasar marcas, calcular10 tampoco guarda nombres (lo seguro es el valor por omisión)", () => {
    expect(calcular10(USAR.previas, USAR.tabla, HUELLA)).toEqual(d.chequeos);
  });

  it("marcando la columna, se guarda su referencia con los nombres de categoría con soporte", () => {
    expect(marcado.respuestas.vigilar_texto).toEqual(["empleo"]);
    expect(marcado.chequeos.vig_columnas).toEqual(modelo);
    expect(marcado.chequeos.vig_omitidas).toEqual([]);
    const empleo = refsDe(marcado).find((r) => r?.columna === "empleo");
    expect(empleo?.tipo).toBe("texto");
    if (empleo?.tipo !== "texto") return;
    expect(empleo.categorias.length).toBeGreaterThan(0);
    for (const [k, nombre] of empleo.categorias.entries()) {
      expect(categoriasDe("empleo")).toContain(nombre);
      expect(empleo.cuentas[k]).toBeGreaterThanOrEqual(REF_SOPORTE_MIN);
    }
    expect(registrar10(USAR, marcado).ok).toBe(true);
  });

  it("una marca que no es una columna de texto del modelo no cambia nada", () => {
    const rara = calcular10(USAR.previas, USAR.tabla, HUELLA, ["ingreso_mensual", "no-existe"]);
    expect(rara).toEqual(d.chequeos);
  });

  it("una referencia por columna vigilada, y cada una cuenta exactamente el entrenamiento sellado", () => {
    for (const x of [d, marcado]) {
      expect(x.chequeos.n_referencia).toBe(plan.particion.entrenamiento.length);
      for (const [i, ref] of refsDe(x).entries()) {
        expect(ref?.columna).toBe((x.chequeos.vig_columnas as string[])[i]);
        expect(ref!.cuentas.reduce((s, n) => s + n, 0)).toBe(x.chequeos.n_referencia);
      }
    }
  });

  it("solo agregados: cortes de 3 cifras y ninguna fila del CSV", () => {
    for (const x of [d, marcado])
      for (const guardada of x.chequeos.vig_referencia as string[]) {
        const ref = leerReferencia(guardada)!;
        if (ref.tipo === "numero")
          for (const c of ref.cortes) expect(Number(c.toPrecision(3))).toBe(c);
      }
    const filas = readFileSync("docs/kit-de-prueba/credito-fuga-plantada.csv", "utf8")
      .split("\n")
      .slice(1)
      .filter(Boolean);
    for (const x of [d, marcado])
      for (const fila of filas) expect(JSON.stringify(x)).not.toContain(fila);
  });

  it("todo el modelo en texto y nada marcado: no hay qué vigilar y la compuerta lo pide", () => {
    const solo = con(d, {}, { vig_columnas: [], vig_referencia: [], vig_omitidas: ["empleo"] });
    expect(ETAPA_10.leer(solo)).toEqual({ ok: true });
    expect(ETAPA_10.criterio(solo, USAR.previas)).toEqual({ tipo: "falta", faltan: ["vigilar"] });
  });

  it("la trampa y el chequeo dicen qué quedó sin vigilar", () => {
    expect(ETAPA_10.trampas(d, USAR.previas)).toContainEqual({
      clave: "sin-vigilar",
      params: { columnas: 1, lista: "empleo" },
    });
    expect(ETAPA_10.trampas(marcado, USAR.previas).map((t) => t.clave)).not.toContain("sin-vigilar");
  });
});

describe("el cuaderno editado a mano no pasa", () => {
  const d = datos10(USAR, ENTRADA_USAR);
  const marcado = datos10(USAR, { ...ENTRADA_USAR, vigilarTexto: ["empleo"] });
  const refs = d.chequeos.vig_referencia as string[];
  const otraColumna = JSON.stringify({ ...JSON.parse(refs[0]!), columna: "otra" });

  it.each([
    ["una respuesta de más", con(d, { notas: "x" }), "respuestas.notas"],
    ["un chequeo de más", con(d, {}, { psi: 1 }), "chequeos.psi"],
    ["un dueño demasiado largo", con(d, { dueno: "x".repeat(DUENO_MAX + 1) }), "respuestas.dueno"],
    ["sin el dueño", con(d, { dueno: undefined }), "respuestas.dueno"],
    ["cadencia 0", con(d, { cadencia: 0 }), "respuestas.cadencia"],
    ["cadencia de más", con(d, { cadencia: CADENCIA_MAX + 1 }), "respuestas.cadencia"],
    ["cadencia con decimales", con(d, { cadencia: 2.5 }), "respuestas.cadencia"],
    ["una decisión inventada", con(d, {}, { decision: "quizas" }), "chequeos.decision"],
    ["una referencia de otra columna", con(d, {}, { vig_referencia: [otraColumna, ...refs.slice(1)] }), "chequeos.vig_referencia"],
    ["un total que no es el del entrenamiento", con(d, {}, { n_referencia: 1 }), "chequeos.vig_referencia"],
    ["columnas sin referencias", con(d, {}, { vig_referencia: null }), "chequeos.vig_referencia"],
    ["nombres de categoría de una columna que no marcaste", con(marcado, { vigilar_texto: [] }), "chequeos.vig_referencia"],
    ["una marca sobre una columna que no se vigila", con(d, { vigilar_texto: ["empleo"] }), "respuestas.vigilar_texto"],
    ["una marca repetida", con(marcado, { vigilar_texto: ["empleo", "empleo"] }), "respuestas.vigilar_texto"],
    ["las marcas que no son una lista", con(d, { vigilar_texto: "empleo" }), "respuestas.vigilar_texto"],
    ["sin la lista de marcas", con(d, { vigilar_texto: undefined }), "respuestas.vigilar_texto"],
    ["una columna a la vez vigilada y sin vigilar", con(marcado, {}, { vig_omitidas: ["empleo"] }), "chequeos.vig_omitidas"],
    ["una columna sin vigilar repetida", con(d, {}, { vig_omitidas: ["empleo", "empleo"] }), "chequeos.vig_omitidas"],
    ["las sin vigilar que no son una lista", con(d, {}, { vig_omitidas: null }), "chequeos.vig_omitidas"],
  ])("%s se rechaza nombrando el campo", (_, forjado, campo) => {
    expect(ETAPA_10.leer(forjado)).toEqual({ ok: false, campo });
  });

  it("lo registrado se lee", () => {
    expect(ETAPA_10.leer(d)).toEqual({ ok: true });
    expect(ETAPA_10.leer(marcado)).toEqual({ ok: true });
    expect(ETAPA_10.leer(datos10(NO_USAR, ENTRADA_NO_USAR))).toEqual({ ok: true });
  });

  it("marcas sin plan de vigilancia (con «no usar») se rechazan", () => {
    const sinPlan = datos10(NO_USAR, ENTRADA_NO_USAR);
    expect(ETAPA_10.leer(con(sinPlan, { vigilar_texto: ["empleo"] }))).toEqual({
      ok: false,
      campo: "respuestas.vigilar_texto",
    });
  });

  it("la compuerta no deja pasar una marca que la tabla no respalda", () => {
    const r = registrar10(USAR, con(d, { vigilar_texto: ["empleo"] }));
    expect(r.ok).toBe(false);
  });

  it("una referencia cambiada con la misma forma queda por verificar: no cuadra con la tabla", () => {
    const r = registrar10(USAR, d);
    if (!r.ok) throw new Error(JSON.stringify(r.rechazo));
    const ref = JSON.parse(refs[0]!) as { cuentas: number[] };
    const i = ref.cuentas.findIndex((n) => n > 0);
    const cuentas = ref.cuentas.map((n, k) => (k === i ? n - 1 : k === i + 1 ? n + 1 : n));
    const forjada = JSON.stringify({ ...ref, cuentas });
    const ultima = r.cuaderno.evidencias.at(-1)!;
    const cuaderno = {
      ...r.cuaderno,
      evidencias: [
        ...r.cuaderno.evidencias.slice(0, -1),
        { ...ultima, datos: con(ultima.datos, {}, { vig_referencia: [forjada, ...refs.slice(1)] }) },
      ],
    };
    expect(ETAPA_10.leer(cuaderno.evidencias.at(-1)!.datos)).toEqual({ ok: true });
    expect(evaluar(PROTOCOLO10, cuaderno, HUELLA, USAR.tabla)[9]!.estado).toMatchObject({
      tipo: "por-verificar",
      motivo: "no-cuadra",
    });
  });
});

describe("la cadencia", () => {
  it.each([
    ["2025-01-15", "2026-01-15", 12],
    ["2025-01-31", "2025-03-30", 1],
    ["2025-03-01", "2025-03-20", 0],
    ["2025-03", "2025-05-01", null],
  ] as const)("de %s a %s son %s meses", (desde, hasta, meses) => {
    expect(mesesEntre(desde, hasta)).toBe(meses);
  });

  it("la sugerida va de 1 a 60 meses", () => {
    expect(cadenciaSugerida(conTiempo("2025-03-01", "2025-03-20")).sugerida).toBe(1);
    expect(cadenciaSugerida(conTiempo("2010-01-01", "2025-12-31")).sugerida).toBe(CADENCIA_MAX);
  });

  it.each([
    ["6", 6],
    [" 12 ", 12],
    ["0", null],
    ["61", null],
    ["2.5", null],
    ["-3", null],
    ["", null],
  ] as const)("«%s» se lee como %s", (escrito, meses) => {
    expect(cadenciaDe(escrito)).toBe(meses);
  });
});
