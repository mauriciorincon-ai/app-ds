// Protocolo DS (S15), etapa 10 — la compuerta de la ficha y del plan de vigilancia, con el crédito registrado
// por la compuerta real hasta la 9. Lo que tiene que valer:
//  · DEMO EN ROJO: sin dueño nombrado la compuerta no pasa, y lo nombra; con él, el Protocolo queda completo;
//  · «usar»: la referencia de deriva sale del entrenamiento sellado (una por columna del modelo, que cuenta
//    exactamente sus filas), solo agregados; la cadencia es obligatoria, acortarla es libre y alargarla
//    más allá de lo que respalda la prueba exige razón;
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
  mesesEntre,
} from "@/engine/protocolo/etapa10";
import type { DatosEtapa, Previas } from "@/engine/protocolo/etapas";
import { leerReferencia } from "@/engine/protocolo/referencia-deriva";
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
      n_referencia: null,
      cadencia_sugerida: null,
    });
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
  const d = datos10(USAR, ENTRADA_USAR);
  const plan = plan7(USAR.tabla, USAR.previas, HUELLA)!;

  it("una referencia por columna del modelo, y cada una cuenta exactamente el entrenamiento sellado", () => {
    expect(d.chequeos.vig_columnas).toEqual([...plan.numericas, ...plan.categoricas]);
    expect(d.chequeos.n_referencia).toBe(plan.particion.entrenamiento.length);
    const refs = (d.chequeos.vig_referencia as string[]).map(leerReferencia);
    for (const [i, ref] of refs.entries()) {
      expect(ref?.columna).toBe((d.chequeos.vig_columnas as string[])[i]);
      expect(ref!.cuentas.reduce((s, n) => s + n, 0)).toBe(d.chequeos.n_referencia);
    }
  });

  it("solo agregados: cortes de 3 cifras y ninguna fila del CSV", () => {
    for (const guardada of d.chequeos.vig_referencia as string[]) {
      const ref = leerReferencia(guardada)!;
      if (ref.tipo === "numero")
        for (const c of ref.cortes) expect(Number(c.toPrecision(3))).toBe(c);
    }
    const guardado = JSON.stringify(d);
    const filas = readFileSync("docs/kit-de-prueba/credito-fuga-plantada.csv", "utf8")
      .split("\n")
      .slice(1)
      .filter(Boolean);
    for (const fila of filas) expect(guardado).not.toContain(fila);
  });
});

describe("el cuaderno editado a mano no pasa", () => {
  const d = datos10(USAR, ENTRADA_USAR);
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
  ])("%s se rechaza nombrando el campo", (_, forjado, campo) => {
    expect(ETAPA_10.leer(forjado)).toEqual({ ok: false, campo });
  });

  it("lo registrado se lee", () => {
    expect(ETAPA_10.leer(d)).toEqual({ ok: true });
    expect(ETAPA_10.leer(datos10(NO_USAR, ENTRADA_NO_USAR))).toEqual({ ok: true });
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
