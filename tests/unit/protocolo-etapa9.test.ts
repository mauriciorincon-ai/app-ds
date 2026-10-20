// Protocolo DS (S14), etapa 9: ¿sirve para la decisión? Crédito llega a la 9 con las etapas 1–8 cumplidas con la
// compuerta, y la 8 con la prueba que abrió el emisor real (test-result.json). Lo que tiene que valer:
//  · la 8 guarda la tabla agregada de umbrales (conteos, ninguna fila) y un cuaderno de antes del S14 se sigue
//    leyendo: la 9 lo dice («vuelve a la etapa 8») y no abre la prueba;
//  · el umbral de costos es c_FP / (c_FP + c_FN); el beneficio neto de «no hacer nada» es 0 en todo umbral;
//  · «no usarlo» pasa la compuerta; un umbral movido sin razón no pasa, y con razón queda rotulado; sin la
//    capacidad no pasa, y si las alertas no caben se nombra el umbral de la capacidad con su costo;
//  · sin probabilidades decide la clase; con la calibración corrida, el umbral de costos es poco fiable;
//  · varias clases y un número: el costo del ganador de la 8 frente a lo de hoy;
//  · un cuaderno editado a mano no cuadra, y lo que no tiene la forma de la etapa se rechaza nombrando el campo.
import { describe, expect, it } from "vitest";
import { evaluar, registrar } from "@/engine/protocolo/compuerta";
import type { Cuaderno } from "@/engine/protocolo/cuaderno";
import {
  ETAPA_8,
  NUEVOS_S14,
  REJILLA,
  UMBRAL_CLASE,
  UMBRAL_E1,
  claveUmbral,
  plan8,
} from "@/engine/protocolo/etapa8";
import {
  BRECHA_POCO_FIABLE,
  CHEQUEOS_9,
  ENTRADA_9_VACIA,
  ETAPA_9,
  base9,
  beneficioNeto,
  capacidadDe,
  costoBinario,
  curvaDecision,
  datosEtapa9,
  opcionesUmbral,
  resumenEtapa9,
  umbralCapacidad,
  type EntradaEtapa9,
} from "@/engine/protocolo/etapa9";
import type { DatosEtapa, Previas } from "@/engine/protocolo/etapas";
import { PROTOCOLO_DS } from "@/engine/protocolo/protocolo-ds";
import { empaquetar, leerArchivo } from "@/lib/protocolo/archivo";
import type { Armado } from "./protocolo-etapa4-helpers";
import {
  armarCredito7,
  armarPlanes6,
  armarPrecio6,
  con7,
  sintetico,
} from "./protocolo-etapa8-helpers";
import {
  AHORA,
  HUELLA,
  armarCredito8,
  con8,
  registrar8,
} from "./protocolo-etapa9-helpers";

type Libre = Record<string, unknown>;

const CREDITO = armarCredito8();
const C8 = CREDITO.previas[8]!.chequeos;
const TABLA = C8.tabla_umbrales as Record<string, number>;
const [N, POS] = [C8.n_prueba as number, C8.prueba_pos as number];
const R1 = CREDITO.previas[1]!.respuestas;
const [CFP, CFN] = [R1.c_fp as number, R1.c_fn as number];

const ENTRADA: EntradaEtapa9 = {
  umbral: UMBRAL_E1,
  razonUmbral: "",
  capacidad: "100",
  decision: "no-usar",
  razon: "Con 40 filas de prueba no me fío; junto más datos antes.",
};
const datosDe = (entrada: Partial<EntradaEtapa9> = {}, a: Armado = CREDITO) =>
  datosEtapa9(a.previas, { ...ENTRADA, ...entrada });

const estados = (cuaderno: Cuaderno) =>
  evaluar(PROTOCOLO_DS, cuaderno, HUELLA, CREDITO.tabla).map((e) =>
    e.estado.tipo === "por-verificar"
      ? `por-verificar:${e.estado.motivo}`
      : e.estado.tipo,
  );

function registrado(datos: DatosEtapa = datosDe()): Cuaderno {
  const r = registrar(PROTOCOLO_DS, CREDITO.cuaderno, 9, datos, {
    huella: HUELLA,
    tabla: CREDITO.tabla,
    ahora: AHORA,
  });
  if (!r.ok) throw new Error(JSON.stringify(r.rechazo));
  return r.cuaderno;
}

const con = (datos: DatosEtapa, chequeos: Libre): DatosEtapa => ({
  ...datos,
  chequeos: { ...datos.chequeos, ...chequeos } as DatosEtapa["chequeos"],
});
const conPrevia8 = (a: Armado, chequeos: Libre): Previas => ({
  ...a.previas,
  8: con(a.previas[8]!, chequeos),
});

describe("la tabla de umbrales que guarda la etapa 8", () => {
  it("cuenta alertas acertadas y falsas en el umbral de tus costos y en la rejilla: conteos, ninguna fila", () => {
    expect(Object.keys(TABLA).sort()).toEqual(
      [UMBRAL_E1, ...REJILLA.map(claveUmbral)]
        .flatMap((u) => [`vp:${u}`, `fp:${u}`])
        .sort(),
    );
    for (const v of Object.values(TABLA))
      expect(Number.isInteger(v)).toBe(true);
    // al subir el umbral, las alertas solo bajan
    for (let i = 1; i < REJILLA.length; i++) {
      const [a, b] = [claveUmbral(REJILLA[i - 1]!), claveUmbral(REJILLA[i]!)];
      expect(TABLA[`vp:${b}`]!).toBeLessThanOrEqual(TABLA[`vp:${a}`]!);
      expect(TABLA[`fp:${b}`]!).toBeLessThanOrEqual(TABLA[`fp:${a}`]!);
    }
    expect(TABLA["vp:0.01"]! + TABLA["fp:0.01"]!).toBeLessThanOrEqual(N);
    expect(POS).toBeGreaterThan(0);
    expect(POS).toBeLessThan(N);
  });

  it("en el umbral de tus costos cuesta lo mismo que la medida de la etapa 8", () => {
    const b = base9(CREDITO.previas)!;
    const costos = b.costos as Extract<typeof b.costos, { task: "binaria" }>;
    const e1 = { vp: TABLA["vp:e1"]!, fp: TABLA["fp:e1"]! };
    expect(costoBinario(costos, N, POS, e1)).toBeCloseTo(
      C8.ganador_costo as number,
      12,
    );
  });

  it("un cuaderno de antes del S14 (sin la tabla) se sigue leyendo y cuadrando; la 9 pide volver a la 8", () => {
    const a = armarCredito7();
    const viejo = con(CREDITO.previas[8]!, {});
    for (const k of NUEVOS_S14) delete (viejo.chequeos as Libre)[k];
    expect(ETAPA_8.leer(viejo)).toEqual({ ok: true });
    const r = registrar(PROTOCOLO_DS, a.cuaderno, 8, viejo, {
      huella: HUELLA,
      tabla: a.tabla,
      ahora: AHORA,
    });
    expect(r.ok).toBe(true);
    const cuaderno = r.ok ? r.cuaderno : a.cuaderno;
    expect(estados(cuaderno).slice(7, 10)).toEqual([
      "cumplida",
      "abierta",
      "no-construida",
    ]);
    const previas = { ...a.previas, 8: viejo };
    expect(ETAPA_9.criterio(datosEtapa9(previas, ENTRADA), previas)).toEqual({
      tipo: "falta",
      faltan: ["tabla-8"],
    });
  });

  it("una prueba con otros positivos que los de la tabla cargada no pasa: la 8 deja de estar cumplida y la 9 se cierra", () => {
    const copia = JSON.parse(JSON.stringify(CREDITO.cuaderno)) as Cuaderno;
    const ocho = [...copia.evidencias].reverse().find((e) => e.etapa === 8)!;
    (ocho.datos.chequeos as Libre).prueba_pos = POS - 1;
    const [e8, e9] = estados(copia).slice(7, 9);
    expect(e8).not.toBe("cumplida");
    expect(e9).toBe("cerrada");
  });

  it.each([
    ["una clave fuera de la rejilla", { "vp:0.333": 1, "fp:0.333": 0 }],
    ["un conteo que no es entero", { "vp:0.50": 1.5 }],
    ["más alertas acertadas que positivos", { "vp:0.50": 10_000 }],
    ["una clave sin su pareja", { "vp:clase": 1 }],
  ])("la 8 rechaza %s en la tabla, nombrando el campo", (_n, cambio) => {
    const datos = con(CREDITO.previas[8]!, {
      tabla_umbrales: { ...TABLA, ...cambio },
    });
    expect(ETAPA_8.leer(datos)).toEqual({
      ok: false,
      campo: "chequeos.tabla_umbrales",
    });
  });
});

describe("las cuentas de la decisión", () => {
  it("el umbral de tus costos es c_FP / (c_FP + c_FN)", () => {
    const c = datosDe().chequeos;
    expect(c.umbral_e1).toBeCloseTo(CFP / (CFP + CFN), 15);
    expect(c.umbral_usado).toBe(c.umbral_e1);
  });

  it("el beneficio neto de «no hacer nada» es 0 en todo umbral; el de «actuar con todos», el de la fórmula", () => {
    for (const u of REJILLA)
      expect(beneficioNeto(N, { vp: 0, fp: 0 }, u / (1 - u))).toBe(0);
    for (const p of curvaDecision(base9(CREDITO.previas)!))
      expect(p.todos).toBeCloseTo(
        POS / N - ((N - POS) / N) * (p.u / (1 - p.u)),
        12,
      );
    expect(curvaDecision(base9(CREDITO.previas)!)).toHaveLength(REJILLA.length);
  });

  it("las cifras con el umbral: alertas por cada 100 casos, falsas por cada 100 alertas, costo y beneficio", () => {
    const c = datosDe({
      umbral: "0.50",
      razonUmbral: "lo pide el comité",
    }).chequeos;
    const [vp, fp] = [TABLA["vp:0.50"]!, TABLA["fp:0.50"]!];
    expect(c.alertas100).toBeCloseTo(((vp + fp) / N) * 100, 12);
    expect(c.falsas100).toBe(vp + fp === 0 ? null : (fp / (vp + fp)) * 100);
    expect(c.costo_modelo).toBeCloseTo((fp * CFP + (POS - vp) * CFN) / N, 12);
    expect(c.beneficio).toBeCloseTo((vp - fp * (CFP / CFN)) / N, 12);
    expect(c.costo_nada).toBeCloseTo((POS * CFN) / N, 12);
    expect(c.costo_todos).toBeCloseTo(((N - POS) * CFP) / N, 12);
    // el intervalo de la 8 es del umbral de tus costos: con otro umbral no se muestra
    expect(c.modelo_bajo).toBeNull();
    expect(datosDe().chequeos.modelo_bajo).toBe(C8.ganador_bajo);
  });

  it("lo de hoy es la regla de la etapa 5 o, sin ella, la línea base de la 8; el ahorro, lo de hoy menos el modelo", () => {
    const c = datosDe().chequeos;
    expect(c.costo_regla).toBeNull();
    expect(c.hoy_id).toBe(C8.base_id);
    expect(c.costo_hoy).toBe(C8.base_costo);
    expect(c.ahorro).toBeCloseTo(
      (C8.base_costo as number) - (c.costo_modelo as number),
      12,
    );
  });

  it("la capacidad: de 0 a 100, entera; si no caben las alertas, el umbral de la capacidad con su costo", () => {
    expect(capacidadDe(" 15 ")).toBe(15);
    for (const malo of ["", "101", "1.5", "-1", "diez", "1e2"])
      expect(capacidadDe(malo)).toBeNull();
    const e1 = { vp: TABLA["vp:e1"]!, fp: TABLA["fp:e1"]! };
    const alertas = ((e1.vp + e1.fp) / N) * 100;
    expect(alertas).toBeGreaterThan(5);
    const datos = datosDe({ capacidad: "5" });
    const c = datos.chequeos;
    const cap = umbralCapacidad(TABLA, N, 5)!;
    expect(c.cap_umbral).toBe(cap.u);
    expect(c.cap_alertas100 as number).toBeLessThanOrEqual(5);
    // es el umbral más bajo que cabe: el anterior de la rejilla ya no cabe
    const antes = REJILLA[REJILLA.indexOf(cap.u) - 1];
    if (antes !== undefined) {
      const p = {
        vp: TABLA[`vp:${claveUmbral(antes)}`]!,
        fp: TABLA[`fp:${claveUmbral(antes)}`]!,
      };
      expect(((p.vp + p.fp) / N) * 100).toBeGreaterThan(5);
    }
    expect(ETAPA_9.trampas(datos, CREDITO.previas)).toContainEqual({
      clave: "capacidad",
      params: {
        alertas: c.alertas100 as number,
        capacidad: 5,
        umbral: cap.u,
        capAlertas: c.cap_alertas100 as number,
        costo: Number(((c.cap_costo as number) * 100).toPrecision(12)),
      },
    });
    // con capacidad de sobra, nada que decir
    expect(datosDe({ capacidad: "100" }).chequeos.cap_umbral).toBeNull();
  });
});

describe("la compuerta de la etapa 9", () => {
  it("«no usarlo» pasa la compuerta: es un resultado, y la 10 se ve sin construir", () => {
    const datos = datosDe({ decision: "no-usar" });
    expect(ETAPA_9.criterio(datos, CREDITO.previas)).toEqual({
      tipo: "cumple",
    });
    expect(estados(registrado(datos)).slice(7, 10)).toEqual([
      "cumplida",
      "cumplida",
      "no-construida",
    ]);
    expect(resumenEtapa9(datos)).toMatchObject({
      decision: "no-usar",
      modo: "curva",
      movido: false,
      capacidad: 100,
    });
  });

  it.each(["usar", "iterar"])("«%s» también pasa, con su razón", (decision) => {
    expect(ETAPA_9.criterio(datosDe({ decision }), CREDITO.previas)).toEqual({
      tipo: "cumple",
    });
  });

  it("sin decisión, sin razón ni capacidad, la compuerta lo nombra", () => {
    const vacio = datosEtapa9(CREDITO.previas, ENTRADA_9_VACIA);
    expect(ETAPA_9.criterio(vacio, CREDITO.previas)).toEqual({
      tipo: "falta",
      faltan: ["capacidad", "decision", "razon"],
    });
  });

  it("un umbral movido sin razón no pasa; con razón pasa y queda rotulado «elegido mirando la prueba»", () => {
    const sinRazon = datosDe({ umbral: "0.30" });
    expect(ETAPA_9.criterio(sinRazon, CREDITO.previas)).toEqual({
      tipo: "falta",
      faltan: ["razon-umbral"],
    });
    const conRazon = datosDe({
      umbral: "0.30",
      razonUmbral: "El equipo no da abasto con más llamadas",
    });
    expect(ETAPA_9.criterio(conRazon, CREDITO.previas)).toEqual({
      tipo: "cumple",
    });
    expect(ETAPA_9.trampas(conRazon, CREDITO.previas)).toContainEqual({
      clave: "umbral-movido",
      params: { umbralPct: 0.3, e1Pct: CFP / (CFP + CFN) },
    });
    expect(resumenEtapa9(conRazon).movido).toBe(true);
    // el de tus costos no se rotula
    expect(
      ETAPA_9.trampas(datosDe(), CREDITO.previas).map((x) => x.clave),
    ).not.toContain("umbral-movido");
  });

  it("un umbral que no está en la tabla no pasa", () => {
    expect(
      ETAPA_9.criterio(datosDe({ umbral: UMBRAL_CLASE }), CREDITO.previas),
    ).toEqual({ tipo: "falta", faltan: ["umbral"] });
  });

  it("sin la 8 cumplida la 9 no abre", () => {
    const sin8 = { ...CREDITO.previas, 8: undefined } as Previas;
    expect(ETAPA_9.criterio(datosDe(), sin8)).toEqual({
      tipo: "falta",
      faltan: ["etapas-previas"],
    });
    expect(estados(armarCredito7().cuaderno).slice(7, 9)).toEqual([
      "abierta",
      "cerrada",
    ]);
  });

  it("un cuaderno editado a mano no cuadra: la 9 rehace sus cifras con la 1 y la 8", () => {
    const copia = JSON.parse(JSON.stringify(registrado())) as Cuaderno;
    const nueve = [...copia.evidencias].reverse().find((e) => e.etapa === 9)!;
    (nueve.datos.chequeos as Libre).costo_modelo = 0;
    expect(estados(copia)[8]).toBe("por-verificar:no-cuadra");
  });

  it("si el modelo no mejora lo de hoy lo dice, y «usarlo» igual queda escrito con su rótulo", () => {
    const peor = conPrevia8(CREDITO, {
      tabla_umbrales: Object.fromEntries(
        Object.keys(TABLA).map((k) => [k, k.startsWith("vp:") ? 0 : N - POS]),
      ),
    });
    const datos = datosEtapa9(peor, { ...ENTRADA, decision: "usar" });
    const claves = ETAPA_9.trampas(datos, peor).map((x) => x.clave);
    expect(claves).toContain("no-mejora");
    expect(claves).toContain("usar-sin-mejora");
    expect(ETAPA_9.criterio(datos, peor)).toEqual({ tipo: "cumple" });
  });

  it("la prueba chica y las aperturas de la 8 se rotulan también aquí", () => {
    const claves = ETAPA_9.trampas(
      datosEtapa9(conPrevia8(CREDITO, { aperturas: 2 }), ENTRADA),
      CREDITO.previas,
    ).map((x) => x.clave);
    expect(claves).toEqual(
      expect.arrayContaining(["reabierta", "prueba-chica"]),
    );
  });

  it("el cuaderno con la 9 se exporta y se vuelve a importar igual", () => {
    const cuaderno = registrado();
    const leido = leerArchivo(empaquetar(cuaderno, AHORA), PROTOCOLO_DS);
    expect(leido.ok && leido.cuaderno).toEqual(cuaderno);
  });
});

describe("sin probabilidades y con la calibración corrida", () => {
  it("sin probabilidades decide la clase predicha, lo dice y pasa", () => {
    const a = armarCredito7();
    const plan = plan8(a.tabla, a.previas, HUELLA)!;
    const d = plan.plan7.diseno;
    const sinProba = registrar8(
      a,
      sintetico(plan, (f) => (d.clases![f] === d.positivo ? 1 : 0), null),
    );
    const tabla = sinProba.previas[8]!.chequeos.tabla_umbrales as Record<
      string,
      number
    >;
    expect(Object.keys(tabla).sort()).toEqual(["fp:clase", "vp:clase"]);
    expect(opcionesUmbral(tabla)).toEqual([UMBRAL_CLASE]);
    const datos = datosEtapa9(sinProba.previas, {
      ...ENTRADA,
      umbral: UMBRAL_CLASE,
    });
    expect(datos.chequeos.modo).toBe("clase");
    expect(datos.chequeos.umbral_usado).toBeNull();
    expect(ETAPA_9.criterio(datos, sinProba.previas)).toEqual({
      tipo: "cumple",
    });
    expect(
      ETAPA_9.trampas(datos, sinProba.previas).map((x) => x.clave),
    ).toContain("sin-probabilidades");
    expect(curvaDecision(base9(sinProba.previas)!)).toEqual([]);
  });

  it("con la calibración corrida en la 8, el umbral de tus costos se rotula poco fiable", () => {
    const a = armarCredito7();
    const plan = plan8(a.tabla, a.previas, HUELLA)!;
    const d = plan.plan7.diseno;
    // dice 95 % a todos: pasa en la tasa de positivos, lejos de lo dicho
    const corrida = registrar8(
      a,
      sintetico(
        plan,
        () => 1,
        () => 0.95,
      ),
    );
    const datos = datosEtapa9(corrida.previas, ENTRADA);
    expect(datos.chequeos.brecha as number).toBeGreaterThanOrEqual(
      BRECHA_POCO_FIABLE,
    );
    expect(ETAPA_9.trampas(datos, corrida.previas)).toContainEqual({
      clave: "poco-fiable",
      params: { brechaPct: datos.chequeos.brecha as number },
    });
    expect(d.positivo).toBeTruthy();
    // con la del emisor real, la brecha queda por debajo de la convención o no se rotula
    const real = datosDe().chequeos.brecha as number | null;
    expect(
      ETAPA_9.trampas(datosDe(), CREDITO.previas).some(
        (x) => x.clave === "poco-fiable",
      ),
    ).toBe(real !== null && real >= BRECHA_POCO_FIABLE);
  });
});

describe("varias clases y estimar un número", () => {
  it("varias clases: el costo del ganador en la prueba frente a lo de hoy, sin umbral ni capacidad", () => {
    const planes = con7(armarPlanes6(), "logistic", "balanced_accuracy", 0.6);
    const plan = plan8(planes.tabla, planes.previas, HUELLA)!;
    const d = plan.plan7.diseno;
    const a = con8(
      planes,
      sintetico(plan, (f) => d.clases![f]!, null),
    );
    const datos = datosEtapa9(a.previas, ENTRADA);
    const c8 = a.previas[8]!.chequeos;
    expect(datos.respuestas).toMatchObject({ umbral: null, capacidad: null });
    expect(datos.chequeos).toMatchObject({
      forma: "multiclase",
      modo: "costo",
      costo_modelo: c8.ganador_costo,
      costo_base: c8.base_costo,
      cuantil: null,
    });
    expect(ETAPA_9.criterio(datos, a.previas)).toEqual({ tipo: "cumple" });
    expect(c8.tabla_umbrales).toBeNull();
  });

  it("un número: el costo con tus costos de quedarse corto y de pasarse, y el cuantil que conviene", () => {
    const precio = con7(armarPrecio6(), "linear", "mae", 20_000);
    const plan = plan8(precio.tabla, precio.previas, HUELLA)!;
    const d = plan.plan7.diseno;
    const a = con8(
      precio,
      sintetico(plan, (f) => d.valores![f]! * 1.1, null, 25_000),
    );
    const datos = datosEtapa9(a.previas, ENTRADA);
    const r1 = a.previas[1]!.respuestas;
    const [sub, sobre] = [r1.c_sub as number, r1.c_sobre as number];
    expect(datos.chequeos).toMatchObject({
      forma: "numerica",
      modo: "costo",
      costo_modelo: a.previas[8]!.chequeos.ganador_costo,
    });
    expect(datos.chequeos.cuantil).toBeCloseTo(sub / (sub + sobre), 15);
    expect(ETAPA_9.criterio(datos, a.previas)).toEqual({ tipo: "cumple" });
  });
});

describe("la forma de lo registrado", () => {
  const DATOS = datosDe();

  it("lo registrado tiene la forma de la etapa", () => {
    expect(ETAPA_9.leer(DATOS)).toEqual({ ok: true });
    expect(Object.keys(DATOS.chequeos).sort()).toEqual([...CHEQUEOS_9].sort());
  });

  it.each<
    [string, (d: { respuestas: Libre; chequeos: Libre }) => void, string]
  >([
    [
      "una respuesta de más",
      (d) => (d.respuestas.extra = 1),
      "respuestas.extra",
    ],
    [
      "un umbral fuera de la rejilla",
      (d) => (d.respuestas.umbral = "0.333"),
      "respuestas.umbral",
    ],
    [
      "una capacidad de 101",
      (d) => (d.respuestas.capacidad = 101),
      "respuestas.capacidad",
    ],
    [
      "una decisión que no existe",
      (d) => (d.respuestas.decision = "quizas"),
      "respuestas.decision",
    ],
    [
      "una razón de 501 caracteres",
      (d) => (d.respuestas.razon = "x".repeat(501)),
      "respuestas.razon",
    ],
    ["un chequeo de más", (d) => (d.chequeos.extra = 1), "chequeos.extra"],
    [
      "un costo negativo",
      (d) => (d.chequeos.costo_modelo = -1),
      "chequeos.costo_modelo",
    ],
    [
      "alertas por cada 100 sobre 100",
      (d) => (d.chequeos.alertas100 = 101),
      "chequeos.alertas100",
    ],
    [
      "más positivos que filas",
      (d) => (d.chequeos.pos = 10_000),
      "chequeos.pos",
    ],
    [
      "un modo que no existe",
      (d) => (d.chequeos.modo = "intuicion"),
      "chequeos.modo",
    ],
    [
      "un umbral de 1",
      (d) => (d.chequeos.umbral_usado = 1),
      "chequeos.umbral_usado",
    ],
  ])("rechaza %s nombrando el campo", (_n, editar, campo) => {
    const copia = JSON.parse(JSON.stringify(DATOS)) as {
      respuestas: Libre;
      chequeos: Libre;
    };
    editar(copia);
    expect(ETAPA_9.leer(copia as unknown as DatosEtapa)).toEqual({
      ok: false,
      campo,
    });
  });
});
