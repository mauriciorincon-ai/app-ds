// Protocolo DS (S13), etapa 8: la prueba sellada, abierta una vez, con el kit real. Crédito llega a la 8 con
// las etapas 1–7 cumplidas con la compuerta, y la prueba abierta es la que escribió el emisor real en Pyodide
// (tests/fixtures/contrato/test-result.json, validada con el lector del contrato). Lo que tiene que valer:
//  · la 8 abre con la 7 cumplida y el sello de la 6 igual; sin abrir la prueba o sin tu patrón, la compuerta
//    nombra lo que falta; con las dos cosas se registra y la 9 abre (S14; la 10 se ve sin construir);
//  · lo que se puede rehacer con la tabla se rehace: un cuaderno editado a mano no cuadra; lo del worker se
//    copia (límite declarado en el manual);
//  · un segmento sin soporte nunca es el peor; misma semilla, mismo intervalo; la calibración se mide con
//    probabilidades, «no se puede medir» sin ellas y «no aplica» al estimar un número;
//  · los peores casos se calculan en pantalla y al cuaderno va solo cuántos.
import { describe, expect, it } from "vitest";
import { evaluar, registrar } from "@/engine/protocolo/compuerta";
import type { Cuaderno } from "@/engine/protocolo/cuaderno";
import {
  CHEQUEOS_8,
  ETAPA_8,
  PATRON_MAX,
  PEORES,
  RESPUESTAS_8,
  claveApertura,
  datosEtapa8,
  leerSegmento,
  peoresCasos,
  plan8,
  resumenEtapa8,
  tramosDe,
  type Corrida8,
} from "@/engine/protocolo/etapa8";
import { SEMILLA_8 } from "@/engine/protocolo/bootstrap";
import type { DatosEtapa, Previas } from "@/engine/protocolo/etapas";
import { cuantilEmpirico } from "@/engine/protocolo/tabla";
import { empaquetar, leerArchivo } from "@/lib/protocolo/archivo";
import { PROTOCOLO_DS } from "@/engine/protocolo/protocolo-ds";
import { envio8 } from "@/lib/protocolo/prueba8";
import {
  AHORA,
  ENTRADA_6_CREDITO,
  ENTRADA_CREDITO,
  armar6,
  csv,
  type Armado,
} from "./protocolo-etapa4-helpers";
import {
  HUELLA,
  armarBajas6,
  armarCredito7,
  armarPlanes6,
  armarPrecio6,
  con7,
  corridaFixture,
  sintetico,
} from "./protocolo-etapa8-helpers";

type Libre = Record<string, unknown>;

const CREDITO = armarCredito7();
const CORRIDA = corridaFixture("test-result", CREDITO);
const PATRON = { patron: "Falla con quienes trabajan en la informalidad" };
const PLAN = plan8(CREDITO.tabla, CREDITO.previas, HUELLA)!;

const datosDe = (
  a: Armado,
  corrida: Corrida8 | null,
  entrada = PATRON,
  aperturas: number | null = 1,
) => datosEtapa8(a.tabla, a.previas, HUELLA, corrida, entrada, aperturas);
const DATOS = datosDe(CREDITO, CORRIDA);

function registrado(): Cuaderno {
  const r = registrar(PROTOCOLO_DS, CREDITO.cuaderno, 8, DATOS, {
    huella: HUELLA,
    tabla: CREDITO.tabla,
    ahora: AHORA,
  });
  if (!r.ok) throw new Error(JSON.stringify(r.rechazo));
  return r.cuaderno;
}

const estados = (cuaderno: Cuaderno) =>
  evaluar(PROTOCOLO_DS, cuaderno, HUELLA, CREDITO.tabla).map((e) =>
    e.estado.tipo === "por-verificar"
      ? `por-verificar:${e.estado.motivo}`
      : e.estado.tipo,
  );

/** El cuaderno con la última evidencia de la etapa 8 editada a mano. */
function editado(cuaderno: Cuaderno, editar: (c: Libre) => void): Cuaderno {
  const copia = JSON.parse(JSON.stringify(cuaderno)) as Cuaderno;
  const ultima = [...copia.evidencias].reverse().find((e) => e.etapa === 8)!;
  editar(ultima.datos.chequeos as Libre);
  return copia;
}

const con = (datos: DatosEtapa, chequeos: Libre): DatosEtapa => ({
  ...datos,
  chequeos: { ...datos.chequeos, ...chequeos } as DatosEtapa["chequeos"],
});

describe("el plan de la etapa 8 sobre el kit", () => {
  it("crédito: el sello cuadra, cada fila es su propio conglomerado y la línea base sale del entrenamiento", () => {
    expect(PLAN.selloOk).toBe(true);
    expect(PLAN.ganador).toBe(CREDITO.previas[7]!.chequeos.ganador);
    expect(PLAN.conglomerado).toBe("fila");
    const prueba = PLAN.plan7.particion.prueba;
    expect(PLAN.grupos).toHaveLength(prueba.length);
    expect(new Set(PLAN.grupos).size).toBe(prueba.length);
    expect(PLAN.base).not.toBeNull();
    expect(PLAN.base!.costos).toHaveLength(prueba.length);
    // la etapa 5 de crédito dijo «no hay regla de hoy»
    expect(PLAN.regla).toBeNull();
  });

  it("crédito: los segmentos salen de columnas en «usar», solo con filas de la prueba, y los cuartiles con cortes del entrenamiento", () => {
    const usar = new Set([...PLAN.plan7.numericas, ...PLAN.plan7.categoricas]);
    const prueba = new Set(PLAN.plan7.particion.prueba);
    expect(PLAN.segmentos.length).toBeGreaterThan(0);
    for (const s of PLAN.segmentos) {
      expect(usar.has(s.columna!), s.id).toBe(true);
      expect(
        s.filas.every((f) => prueba.has(f)),
        s.id,
      ).toBe(true);
    }
    expect(PLAN.segmentos.map((s) => s.columna)).not.toContain(
      "monto_recuperado",
    );
    const q = PLAN.segmentos.filter(
      (s) => s.tipo === "tramo" && s.columna === "ingreso_mensual",
    );
    const j = CREDITO.tabla.headers.indexOf("ingreso_mensual");
    const ordenados = PLAN.plan7.particion.entrenamiento
      .map((f) => Number(CREDITO.tabla.rows[f]![j]))
      .sort((a, b) => a - b);
    expect(q[0]!.desde).toBeNull();
    expect(q[0]!.hasta).toBe(cuantilEmpirico(ordenados, 0.25));
    expect(q.at(-1)!.hasta).toBeNull();
  });

  it("bajas: por tiempo y grupo, el conglomerado es el cliente, hay periodos y ninguna fila del hueco entra a un segmento", () => {
    const b = con7(armarBajas6(), "logistic", "auc", 0.7);
    const plan = plan8(b.tabla, b.previas, HUELLA)!;
    expect(plan.conglomerado).toBe("unidad");
    const d = plan.plan7.diseno;
    const unidades = new Set(
      plan.plan7.particion.prueba.map((f) => d.unidades![f]),
    );
    expect(new Set(plan.grupos).size).toBe(unidades.size);
    expect(new Set(plan.grupos).size).toBeLessThan(plan.grupos.length);
    const periodos = plan.segmentos.filter((s) => s.tipo === "periodo");
    expect(periodos.length).toBeGreaterThan(1);
    for (const p of periodos) expect(p.id).toMatch(/^p:\d{4}-\d{2}$/);
    const hueco = new Set(plan.plan7.particion.hueco);
    expect(hueco.size).toBeGreaterThan(0);
    expect(
      plan.segmentos.flatMap((s) => s.filas).filter((f) => hueco.has(f)),
    ).toEqual([]);
  });

  it("el plan se guarda por tabla y por lo registrado, y sin huella no hay plan", () => {
    expect(plan8(CREDITO.tabla, CREDITO.previas, HUELLA)).toBe(PLAN);
    expect(plan8(CREDITO.tabla, CREDITO.previas, null)).toBeNull();
    // sin la etapa 6 no hay partición sellada que abrir
    const sin6 = { ...CREDITO.previas, 6: undefined } as Previas;
    expect(plan8(CREDITO.tabla, sin6, HUELLA)).toBeNull();
  });

  it("con un sello alterado la prueba no abre: el envío es nulo", () => {
    const e6 = CREDITO.previas[6]!;
    const alterado: Previas = {
      ...CREDITO.previas,
      6: { ...e6, chequeos: { ...e6.chequeos, sello: "0".repeat(64) } },
    };
    const plan = plan8(CREDITO.tabla, alterado, HUELLA)!;
    expect(plan.selloOk).toBe(false);
    expect(envio8(CREDITO.tabla, plan, HUELLA)).toBeNull();
    // con el sello bueno sí abre; sin huella, o con una que no es sha256, no
    expect(envio8(CREDITO.tabla, PLAN, HUELLA)).not.toBeNull();
    expect(envio8(CREDITO.tabla, PLAN, null)).toBeNull();
    expect(envio8(CREDITO.tabla, PLAN, "abc")).toBeNull();
    expect(
      envio8(CREDITO.tabla, { ...PLAN, ganador: null }, HUELLA),
    ).toBeNull();
    expect(
      envio8(CREDITO.tabla, { ...PLAN, ganador: "kmeans" }, HUELLA),
    ).toBeNull();
    expect(
      envio8(CREDITO.tabla, { ...PLAN, metrica: "rmse" }, HUELLA),
    ).toBeNull();
  });

  it("el envío lleva solo las columnas en «usar» y el objetivo, con las filas selladas de cada lado", () => {
    const e = envio8(CREDITO.tabla, PLAN, HUELLA)!;
    const p7 = PLAN.plan7;
    expect(e.payload.headers).toEqual([
      ...p7.numericas,
      ...p7.categoricas,
      p7.objetivo,
    ]);
    expect(e.payload.train).toHaveLength(p7.particion.entrenamiento.length);
    expect(e.payload.test).toHaveLength(p7.particion.prueba.length);
    expect(e.payload.sello).toBe(p7.sello6);
    expect(e.payload.winner).toBe(PLAN.ganador);
    expect(e.sent).toMatchObject({
      n_train: p7.particion.entrenamiento.length,
      n_test: p7.particion.prueba.length,
      positive: "1",
    });
  });
  it("bajas: el envío lleva las filas selladas de cada lado, en su orden, y ninguna del hueco", () => {
    const b = con7(armarBajas6(), "logistic", "auc", 0.7);
    const plan = plan8(b.tabla, b.previas, HUELLA)!;
    const e = envio8(b.tabla, plan, HUELLA)!;
    const { entrenamiento, prueba, hueco } = plan.plan7.particion;
    const columnas = e.payload.headers.map((h) => b.tabla.headers.indexOf(h));
    const fila = (f: number) => columnas.map((j) => b.tabla.rows[f]![j]!);
    expect(e.payload.train).toEqual(entrenamiento.map(fila));
    expect(e.payload.test).toEqual(prueba.map(fila));
    const enviadas = new Set([...entrenamiento, ...prueba]);
    expect(hueco.length).toBeGreaterThan(0);
    expect(hueco.filter((f) => enviadas.has(f))).toEqual([]);
    // la unidad y la fecha no viajan: no están en «usar»
    expect(e.payload.headers).not.toContain("cliente_id");
    expect(e.payload.headers).not.toContain("mes_observado");
  });

  it("varias clases mandan sus clases en orden y ninguna «hay que actuar»; un número, ni lo uno ni lo otro", () => {
    const planes = con7(armarPlanes6(), "logistic", "balanced_accuracy", 0.6);
    const e = envio8(
      planes.tabla,
      plan8(planes.tabla, planes.previas, HUELLA)!,
      HUELLA,
    )!;
    expect(e.payload.classes).toEqual([
      "basico",
      "empresa",
      "estandar",
      "estudiante",
      "premium",
    ]);
    expect(e.sent.classes).toEqual(e.payload.classes);
    expect("positive" in e.payload).toBe(false);
    const precio = con7(armarPrecio6(), "linear", "mae", 20_000);
    const n = envio8(
      precio.tabla,
      plan8(precio.tabla, precio.previas, HUELLA)!,
      HUELLA,
    )!;
    expect("classes" in n.payload || "positive" in n.payload).toBe(false);
    expect(n.payload.headers.at(-1)).toBe("precio_usd");
  });
});

describe("la compuerta de la etapa 8", () => {
  it("sin abrir la prueba la compuerta nombra «prueba»; sin tu patrón, «patron»", () => {
    const sinPrueba = datosDe(CREDITO, null, { patron: "" });
    expect(ETAPA_8.leer(sinPrueba)).toEqual({ ok: true });
    expect(ETAPA_8.criterio(sinPrueba, CREDITO.previas)).toEqual({
      tipo: "falta",
      faltan: ["prueba", "patron"],
    });
    const sinPatron = datosDe(CREDITO, CORRIDA, { patron: "   " });
    expect(ETAPA_8.criterio(sinPatron, CREDITO.previas)).toEqual({
      tipo: "falta",
      faltan: ["patron"],
    });
    const r = registrar(PROTOCOLO_DS, CREDITO.cuaderno, 8, sinPatron, {
      huella: HUELLA,
      tabla: CREDITO.tabla,
      ahora: AHORA,
    });
    expect(r.ok).toBe(false);
  });

  // S14: la 9 abre con la 8 cumplida; S15: la 10 está construida y espera a la 9
  it("con la prueba abierta y tu patrón se registra: la 8 queda cumplida y la 9 abre", () => {
    expect(estados(CREDITO.cuaderno).slice(6, 10)).toEqual([
      "cumplida",
      "abierta",
      "cerrada",
      "cerrada",
    ]);
    expect(ETAPA_8.criterio(DATOS, CREDITO.previas)).toEqual({
      tipo: "cumple",
    });
    expect(estados(registrado()).slice(6, 10)).toEqual([
      "cumplida",
      "cumplida",
      "abierta",
      "cerrada",
    ]);
  });

  it("sin la 7 cumplida la 8 no abre", () => {
    const sin7 = { ...CREDITO.previas, 7: undefined } as Previas;
    expect(ETAPA_8.criterio(DATOS, sin7)).toEqual({
      tipo: "falta",
      faltan: ["etapas-previas"],
    });
    const copia = JSON.parse(JSON.stringify(registrado())) as Cuaderno;
    const siete = [...copia.evidencias].reverse().find((e) => e.etapa === 7)!;
    (siete.datos.chequeos as Libre).ganador_costo = { 1: 0 };
    expect(estados(copia).slice(6, 8)).toEqual([
      "por-verificar:no-cuadra",
      "cerrada",
    ]);
  });

  it("otro ganador que el de la 7, u otro sello que el de la 6, se nombran", () => {
    const otro = sintetico(
      PLAN,
      () => 0,
      () => 0.1,
    );
    const datos = datosDe(CREDITO, {
      resultado: { ...otro.resultado, winner: "knn" },
    });
    expect(ETAPA_8.criterio(datos, CREDITO.previas)).toEqual({
      tipo: "falta",
      faltan: ["ganador"],
    });
    expect(
      ETAPA_8.criterio(
        con(DATOS, { sello_6: "1".repeat(64) }),
        CREDITO.previas,
      ),
    ).toEqual({ tipo: "falta", faltan: ["sello"] });
    expect(
      ETAPA_8.criterio(
        con(DATOS, { peor_segmento: null, calibracion: null }),
        CREDITO.previas,
      ),
    ).toEqual({ tipo: "falta", faltan: ["segmento", "calibracion"] });
  });

  it("un cuaderno editado a mano no gana nada: el sello, un segmento, la línea base, el costo del ganador, el peor segmento o el optimismo", () => {
    const cuaderno = registrado();
    const casos: [string, (c: Libre) => void][] = [
      ["otro sello de la 6", (c) => (c.sello_6 = "1".repeat(64))],
      [
        "un segmento con más filas",
        (c) => ((c.seg_n as Record<string, number>)["c:empleo=formal"]! += 1),
      ],
      [
        "una línea base más cara",
        (c) => (c.base_costo = (c.base_costo as number) + 1),
      ],
      [
        "un ganador más barato",
        (c) => (c.ganador_costo = (c.ganador_costo as number) - 1),
      ],
      ["otro peor segmento", (c) => (c.peor_segmento = "c:empleo=formal")],
      ["sin optimismo", (c) => (c.optimismo = 0)],
      ["otra semilla", (c) => (c.semilla = SEMILLA_8 + 1)],
    ];
    for (const [caso, editar] of casos)
      expect(estados(editado(cuaderno, editar))[7], caso).toBe(
        "por-verificar:no-cuadra",
      );
  });

  it("lo que ninguna compuerta ve: lo que dijo el worker, cambiado sin tocar lo que se deriva de ello, pasa (se declara)", () => {
    const cuaderno = registrado();
    // el Brier sale de las probabilidades del worker y nada se deriva de él: la compuerta lo copia
    const coherente = editado(cuaderno, (c) => (c.brier = 0.01));
    expect(estados(coherente)[7]).toBe("cumplida");
  });

  it("al importar, una cota rota se rechaza nombrando el campo", () => {
    type Archivo = { cuaderno: Cuaderno };
    const exportar = (editar: (c: Libre) => void) => {
      const archivo = JSON.parse(empaquetar(registrado(), AHORA)) as Archivo;
      const ev = archivo.cuaderno.evidencias.findLast((e) => e.etapa === 8)!;
      editar(ev.datos.chequeos as Libre);
      return leerArchivo(JSON.stringify(archivo), PROTOCOLO_DS);
    };
    expect(exportar(() => undefined).ok).toBe(true);
    const roto = exportar((c) => (c.brier = 3));
    expect(roto.ok).toBe(false);
    if (!roto.ok && roto.rechazo.tipo === "invalid-format")
      expect(roto.rechazo.campo).toMatch(/datos\.chequeos\.brier$/);
    else throw new Error(JSON.stringify(roto));
  });
});

describe("lo que se mide en la prueba", () => {
  const c = DATOS.chequeos as Libre;
  const segN = c.seg_n as Record<string, number>;
  const segCasos = c.seg_casos as Record<string, number>;
  const segCosto = c.seg_costo as Record<string, number>;
  const soporta = (id: string) => segN[id]! >= 10 && segCasos[id]! >= 3;

  it("un segmento sin soporte nunca es el peor, aunque cueste más", () => {
    const peor = c.peor_segmento as string;
    expect(soporta(peor)).toBe(true);
    const sinSoporte = Object.keys(segN).filter((id) => !soporta(id));
    expect(sinSoporte.length).toBeGreaterThan(0);
    // en el kit, el segmento más caro de todos no tiene soporte: no es un caso armado
    const masCaro = Object.keys(segCosto).reduce((a, b) =>
      segCosto[b]! > segCosto[a]! ? b : a,
    );
    expect(soporta(masCaro)).toBe(false);
    expect(segCosto[masCaro]!).toBeGreaterThan(segCosto[peor]!);
    // ni con un costo enorme en un segmento sin soporte cambia el peor
    const forzado = ETAPA_8.recalcular!(
      con(DATOS, { seg_costo: { ...segCosto, [sinSoporte[0]!]: 1000 } }),
      CREDITO.previas,
      CREDITO.tabla,
      HUELLA,
    );
    expect(forzado.chequeos.peor_segmento).toBe(peor);
    expect(c.seg_con_soporte).toBe(
      Object.keys(segN).filter((id) => soporta(id)).length,
    );
  });

  // S14 (M1): al peor segmento se le exige exceso > 0. Con todos los segmentos con soporte en el total o por debajo,
  // no hay peor: ni «▲ el peor» ni un «cuesta −N más»; y no es lo mismo que «ninguno tiene soporte».
  it.each([
    ["por debajo del total", -1],
    ["justo en el total", 0],
  ])(
    "si ningún segmento con soporte está peor que el total (%s), no se marca ninguno",
    (_nombre, delta) => {
      const global = c.ganador_costo as number;
      const parejo = Object.fromEntries(
        Object.keys(segCosto).map((id) => [id, global + delta]),
      );
      const datos = ETAPA_8.recalcular!(
        con(DATOS, { seg_costo: parejo }),
        CREDITO.previas,
        CREDITO.tabla,
        HUELLA,
      );
      expect(datos.chequeos.peor_segmento).toBe("ninguno");
      expect(datos.chequeos.peor_exceso).toBeNull();
      expect(datos.chequeos.seg_con_soporte as number).toBeGreaterThan(0);
      expect(ETAPA_8.criterio(datos, CREDITO.previas)).toEqual({
        tipo: "cumple",
      });
      const trampas = ETAPA_8.trampas!(datos, CREDITO.previas);
      expect(trampas).toContainEqual({ clave: "ninguno-peor", params: {} });
      expect(trampas.map((x) => x.clave)).not.toContain("ningun-segmento");
      for (const x of trampas) expect(x.clave).not.toMatch(/^peor-/);
      expect(resumenEtapa8(datos).conSoporte).toBeGreaterThan(0);
    },
  );

  it("si ningún segmento tiene soporte, lo dice: «ningún segmento con soporte»", () => {
    const filas = Array.from(
      { length: 40 },
      (_, i) => `${i + 1},${i % 2 ? "a" : "b"},${i % 3 === 0 ? "si" : "no"}`,
    );
    const chica = con7(
      armar6(
        "chica.csv",
        "binaria",
        { ...ENTRADA_CREDITO, objetivo: "y", positivo: "si" },
        ENTRADA_6_CREDITO,
        csv("x,g,y", ...filas),
      ),
      "logistic",
      "f1",
      0.5,
    );
    const plan = plan8(chica.tabla, chica.previas, HUELLA)!;
    const datos = datosDe(
      chica,
      sintetico(
        plan,
        () => 1,
        () => 0.9,
      ),
    );
    expect(datos.chequeos.peor_segmento).toBe("ninguno");
    expect(datos.chequeos.seg_con_soporte).toBe(0);
    expect(ETAPA_8.criterio(datos, chica.previas)).toEqual({ tipo: "cumple" });
    expect(ETAPA_8.trampas!(datos, chica.previas)).toContainEqual({
      clave: "ningun-segmento",
      params: {},
    });
  });

  it("misma semilla, mismo intervalo; y el intervalo rodea la media", () => {
    const otra = datosDe(CREDITO, CORRIDA).chequeos;
    for (const k of ["ganador_bajo", "ganador_alto", "base_bajo", "base_alto"])
      expect(otra[k], k).toBe(c[k]);
    expect(c.semilla).toBe(SEMILLA_8);
    expect(c.ganador_bajo as number).toBeLessThanOrEqual(
      c.ganador_costo as number,
    );
    expect(c.ganador_alto as number).toBeGreaterThanOrEqual(
      c.ganador_costo as number,
    );
    expect(c.base_bajo as number).toBeLessThanOrEqual(c.base_costo as number);
    expect(c.base_alto as number).toBeGreaterThanOrEqual(
      c.base_costo as number,
    );
  });

  it("el optimismo de la selección: la medida de la 7 menos la misma métrica en la prueba (mayor es mejor)", () => {
    const seleccion = c.seleccion as number;
    expect(seleccion).toBe(
      (CREDITO.previas[7]!.chequeos.liga_cv as Record<string, number>)[
        PLAN.ganador!
      ],
    );
    expect(c.prueba_metrica).toBe(CORRIDA.resultado.metric.value);
    expect(c.optimismo).toBeCloseTo(
      seleccion - (c.prueba_metrica as number),
      12,
    );
    expect(ETAPA_8.trampas!(DATOS, CREDITO.previas)).toContainEqual({
      clave: "optimismo",
      params: { seleccion, prueba: c.prueba_metrica },
    });
  });

  it("la calibración con dos clases: tramos con su conteo, el Brier junto al de la tasa base y la lectura del más desajustado", () => {
    expect(c.calibracion).toBe("medida");
    const tramos = tramosDe(DATOS.chequeos)!;
    expect(tramos).toHaveLength(5);
    expect(tramos.reduce((s, t) => s + t.n, 0)).toBe(c.n_prueba);
    const r = CORRIDA.resultado;
    const d = PLAN.plan7.diseno;
    const pasa = PLAN.plan7.particion.prueba.map((f): number =>
      d.clases![f] === d.positivo ? 1 : 0,
    );
    const brier =
      r.proba!.reduce((s, p, i) => s + (p - pasa[i]!) ** 2, 0) / pasa.length;
    expect(c.brier).toBeCloseTo(brier, 12);
    const tasa = pasa.reduce((a, b) => a + b, 0) / pasa.length;
    expect(c.brier_base).toBeCloseTo(tasa * (1 - tasa), 12);
    const lectura = c.cal_lectura as number;
    const brecha = (t: (typeof tramos)[number]) =>
      Math.abs(t.predicho - t.observado);
    for (const t of tramos.filter((t) => t.n >= 5))
      expect(brecha(t)).toBeLessThanOrEqual(brecha(tramos[lectura - 1]!));
  });

  it("un ganador sin probabilidades: la calibración «no se puede medir», la trampa lo dice y la compuerta acepta", () => {
    const sinProba: Corrida8 = {
      resultado: { ...CORRIDA.resultado, proba: null },
    };
    const datos = datosDe(CREDITO, sinProba);
    expect(datos.chequeos.calibracion).toBe("sin-probabilidades");
    for (const k of ["cal_n", "cal_pred", "cal_obs", "brier", "cal_lectura"])
      expect(datos.chequeos[k], k).toBeNull();
    expect(ETAPA_8.criterio(datos, CREDITO.previas)).toEqual({
      tipo: "cumple",
    });
    expect(ETAPA_8.trampas!(datos, CREDITO.previas)).toContainEqual({
      clave: "sin-probabilidades",
      params: {},
    });
  });

  it("un número (precio): la calibración no aplica, y el optimismo se lee al revés (menor es mejor)", () => {
    const p = con7(armarPrecio6(), "linear", "mae", 20_000);
    const plan = plan8(p.tabla, p.previas, HUELLA)!;
    const d = plan.plan7.diseno;
    const datos = datosDe(
      p,
      sintetico(plan, (f) => d.valores![f]! * 1.1, null, 25_000),
    );
    expect(datos.chequeos.calibracion).toBe("no-aplica");
    expect(datos.chequeos.optimismo).toBe(25_000 - 20_000);
    expect(ETAPA_8.criterio(datos, p.previas)).toEqual({ tipo: "cumple" });
    expect(
      ETAPA_8.trampas!(datos, p.previas).map((t) => t.clave),
    ).not.toContain("sin-probabilidades");
    // los peores casos al estimar un número: los más caros primero
    const peores = peoresCasos(
      plan,
      sintetico(plan, (f) => d.valores![f]! * 1.1, null),
    );
    expect(peores.length).toBe(PEORES);
    for (let i = 1; i < peores.length; i++)
      expect(peores[i - 1]!.costo).toBeGreaterThanOrEqual(peores[i]!.costo);
  });

  it("varias clases (planes): se calibra la confianza de la clase elegida contra si acertó", () => {
    const p = con7(armarPlanes6(), "logistic", "balanced_accuracy", 0.6);
    const plan = plan8(p.tabla, p.previas, HUELLA)!;
    const d = plan.plan7.diseno;
    // acierta en las filas pares de la prueba, con confianza 0.9; en las impares dice «basico» con 0.6
    const corrida = sintetico(
      plan,
      (f, i) => (i % 2 === 0 ? d.clases![f]! : "basico"),
      (_, i) => (i % 2 === 0 ? 0.9 : 0.6),
    );
    const datos = datosDe(p, corrida);
    expect(datos.chequeos.calibracion).toBe("medida");
    const tramos = tramosDe(datos.chequeos)!;
    const alto = tramos[4]!;
    expect(alto.n).toBe(Math.ceil(plan.plan7.particion.prueba.length / 2));
    expect(alto.observado).toBe(1);
    expect(ETAPA_8.criterio(datos, p.previas)).toEqual({ tipo: "cumple" });
    expect(peoresCasos(plan, corrida).every((x) => x.posicion % 2 === 1)).toBe(
      true,
    );
    // sin probabilidades, tampoco con varias clases se inventan
    const sin = datosDe(p, {
      resultado: { ...corrida.resultado, proba: null },
    });
    expect(sin.chequeos.calibracion).toBe("sin-probabilidades");
  });

  it("una regla de hoy se mide en la prueba con su intervalo, junto a la línea base", () => {
    const e5 = CREDITO.previas[5]!;
    const conRegla: Previas = {
      ...CREDITO.previas,
      5: {
        ...e5,
        respuestas: {
          ...e5.respuestas,
          regla: "hay",
          regla_columnas: ["puntaje_credito"],
          regla_operadores: ["<="],
          regla_valores: ["600"],
          regla_union: "",
          regla_si: "actuar",
          regla_no: "no-actuar",
        },
      },
    };
    const plan = plan8(CREDITO.tabla, conRegla, HUELLA)!;
    expect(plan.regla).not.toBeNull();
    const datos = datosEtapa8(
      CREDITO.tabla,
      conRegla,
      HUELLA,
      CORRIDA,
      PATRON,
      1,
    );
    const ch = datos.chequeos as Record<string, number>;
    expect(ch.regla_costo).toBe(plan.regla!.intervalo.media);
    expect(ch.regla_bajo!).toBeLessThanOrEqual(ch.regla_costo!);
    expect(ch.regla_alto!).toBeGreaterThanOrEqual(ch.regla_costo!);
  });
});

describe("las trampas hablan de lo que pasó en tus datos", () => {
  const claves = (datos: DatosEtapa) =>
    ETAPA_8.trampas!(datos, CREDITO.previas).map((t) => t.clave);

  it("crédito: prueba chica, el peor segmento por categoría y los segmentos sin soporte", () => {
    const t = ETAPA_8.trampas!(DATOS, CREDITO.previas);
    expect(t).toContainEqual({ clave: "prueba-chica", params: { n: 40 } });
    const peor = t.find((x) => x.clave === "peor-categoria")!;
    expect(peor.params).toMatchObject({ columna: "empleo", valor: "informal" });
    const total = Object.keys(DATOS.chequeos.seg_n as object).length;
    expect(t).toContainEqual({
      clave: "sin-soporte",
      params: {
        n: total - (DATOS.chequeos.seg_con_soporte as number),
        total,
      },
    });
    // abierta una sola vez: no se rotula
    expect(claves(DATOS)).not.toContain("reabierta");
  });

  it("abrir otra vez con otra configuración se cuenta y se rotula, sin bloquear", () => {
    const dos = datosDe(CREDITO, CORRIDA, PATRON, 2);
    expect(ETAPA_8.trampas!(dos, CREDITO.previas)).toContainEqual({
      clave: "reabierta",
      params: { n: 2 },
    });
    expect(ETAPA_8.criterio(dos, CREDITO.previas)).toEqual({ tipo: "cumple" });
  });

  it("el peor segmento por periodo y por tramo se nombra con su valor", () => {
    const base = con(DATOS, { peor_exceso: 0.25 });
    const periodo = ETAPA_8.trampas!(
      con(base, { peor_segmento: "p:2025-10" }),
      CREDITO.previas,
    );
    expect(periodo).toContainEqual({
      clave: "peor-periodo",
      params: { valor: "2025-10", exceso: 25 },
    });
    const tramo = ETAPA_8.trampas!(
      con(base, { peor_segmento: "q:ingreso_mensual#2" }),
      CREDITO.previas,
    );
    expect(tramo).toContainEqual({
      clave: "peor-tramo",
      params: { columna: "ingreso_mensual", tramo: 2, exceso: 25 },
    });
  });

  it("sin abrir la prueba no hay trampas que mostrar", () => {
    expect(claves(datosDe(CREDITO, null))).toEqual([]);
  });
});

describe("los peores casos, solo en pantalla", () => {
  it("los más caros primero, como mucho diez, solo errores; y al cuaderno va cuántos, nunca cuáles", () => {
    const peores = peoresCasos(PLAN, CORRIDA);
    expect(peores).toHaveLength(PEORES);
    expect(peores.every((x) => x.costo > 0)).toBe(true);
    for (let i = 1; i < peores.length; i++)
      expect(peores[i - 1]!.costo).toBeGreaterThanOrEqual(peores[i]!.costo);
    expect(DATOS.chequeos.peores_n).toBe(PEORES);
    // ningún campo del cuaderno es una lista de filas: las únicas listas son las columnas
    const listas = Object.entries(DATOS.chequeos)
      .filter(([, v]) => Array.isArray(v))
      .map(([k]) => k);
    expect(listas.sort()).toEqual([
      "columnas_categoricas",
      "columnas_numericas",
    ]);
    const filas = new Set(peores.map((x) => String(x.fila)));
    const texto = JSON.stringify(DATOS);
    for (const x of peores)
      expect(texto.includes(`"fila":${x.fila}`)).toBe(false);
    expect(filas.size).toBe(PEORES);
  });

  it("en un empate de costo va primero el más seguro y equivocado", () => {
    const peores = peoresCasos(PLAN, CORRIDA);
    const r = CORRIDA.resultado;
    const d = PLAN.plan7.diseno;
    const seguridad = (x: (typeof peores)[number]) =>
      Math.abs(
        r.proba![x.posicion]! - (d.clases![x.fila] === d.positivo ? 1 : 0),
      );
    for (let i = 1; i < peores.length; i++)
      if (peores[i - 1]!.costo === peores[i]!.costo)
        expect(seguridad(peores[i - 1]!)).toBeGreaterThanOrEqual(
          seguridad(peores[i]!),
        );
  });
});

describe("la clave de una apertura", () => {
  it("abrir lo mismo da la misma clave; otro ganador, otra; sin ganador, ninguna", () => {
    const k = claveApertura(HUELLA, PLAN)!;
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(claveApertura(HUELLA, PLAN)).toBe(k);
    expect(claveApertura(HUELLA, { ...PLAN, ganador: "knn" })).not.toBe(k);
    expect(claveApertura("e".repeat(64), PLAN)).not.toBe(k);
    expect(claveApertura(HUELLA, { ...PLAN, ganador: null })).toBeNull();
  });
});

describe("leer: la forma de lo registrado, también al importar", () => {
  const roto = (chequeos: Libre, respuestas?: Libre): DatosEtapa => ({
    respuestas: (respuestas ?? DATOS.respuestas) as DatosEtapa["respuestas"],
    chequeos: { ...DATOS.chequeos, ...chequeos } as DatosEtapa["chequeos"],
  });
  const campo = (d: DatosEtapa) => {
    const l = ETAPA_8.leer(d);
    return l.ok ? null : l.campo;
  };

  it("lo registrado se lee; la clave de cada cosa está declarada", () => {
    expect(ETAPA_8.leer(DATOS)).toEqual({ ok: true });
    expect(Object.keys(DATOS.chequeos).sort()).toEqual([...CHEQUEOS_8].sort());
    expect(Object.keys(DATOS.respuestas)).toEqual([...RESPUESTAS_8]);
  });

  it.each<[string, Libre | null, Libre | undefined, string]>([
    [
      "una respuesta de más",
      null,
      { patron: "x", otra: "y" },
      "respuestas.otra",
    ],
    ["sin patrón", null, {}, "respuestas.patron"],
    ["un patrón que no es texto", null, { patron: 3 }, "respuestas.patron"],
    [
      "un patrón demasiado largo",
      null,
      { patron: "x".repeat(PATRON_MAX + 1) },
      "respuestas.patron",
    ],
    ["un chequeo de más", { fila_peor: 3 }, undefined, "chequeos.fila_peor"],
    ["un texto que es número", { ganador: 3 }, undefined, "chequeos.ganador"],
    // S16 (S13 B1): el modelo y la métrica son identificadores, y un intervalo no se da vuelta
    ["un modelo que es texto libre", { ganador: "<b>x</b>" }, undefined, "chequeos.ganador"],
    ["una métrica que es texto libre", { metrica: "Mi métrica" }, undefined, "chequeos.metrica"],
    ["una línea base que es texto libre", { base_id: "la de siempre" }, undefined, "chequeos.base_id"],
    ["un intervalo del modelo dado vuelta", { ganador_bajo: 5, ganador_alto: 1 }, undefined, "chequeos.ganador_bajo"],
    ["un intervalo de la línea base dado vuelta", { base_bajo: 5, base_alto: 1 }, undefined, "chequeos.base_bajo"],
    [
      "un número que es texto",
      { n_prueba: "40" },
      undefined,
      "chequeos.n_prueba",
    ],
    [
      "una lista que no es lista",
      { columnas_numericas: "x" },
      undefined,
      "chequeos.columnas_numericas",
    ],
    ["un mapa que no es mapa", { seg_n: [1] }, undefined, "chequeos.seg_n"],
    [
      "un sello que no es sha256",
      { sello_6: "abc" },
      undefined,
      "chequeos.sello_6",
    ],
    ["otro esquema", { esquema: "azar" }, undefined, "chequeos.esquema"],
    [
      "otro conglomerado",
      { conglomerado: "barrio" },
      undefined,
      "chequeos.conglomerado",
    ],
    [
      "otra calibración",
      { calibracion: "perfecta" },
      undefined,
      "chequeos.calibracion",
    ],
    [
      "una semilla con decimales",
      { semilla: 1.5 },
      undefined,
      "chequeos.semilla",
    ],
    ["una prueba negativa", { n_prueba: -1 }, undefined, "chequeos.n_prueba"],
    ["cero aperturas", { aperturas: 0 }, undefined, "chequeos.aperturas"],
    [
      "una lectura del tramo 0",
      { cal_lectura: 0 },
      undefined,
      "chequeos.cal_lectura",
    ],
    ["un costo negativo", { base_costo: -1 }, undefined, "chequeos.base_costo"],
    ["un Brier mayor que 1", { brier: 1.5 }, undefined, "chequeos.brier"],
    [
      "un segmento con filas a medias",
      { seg_n: { a: 1.5 } },
      undefined,
      "chequeos.seg_n",
    ],
    [
      "el costo de un segmento que no existe",
      { seg_costo: { ...(DATOS.chequeos.seg_costo as object), "c:x=y": 1 } },
      undefined,
      "chequeos.seg_costo",
    ],
    ["casos sin segmentos", { seg_n: null }, undefined, "chequeos.seg_casos"],
    [
      "casos negativos",
      {
        seg_casos: {
          ...(DATOS.chequeos.seg_casos as object),
          "c:empleo=formal": -1,
        },
      },
      undefined,
      "chequeos.seg_casos",
    ],
    [
      "casos a medias",
      {
        seg_casos: {
          ...(DATOS.chequeos.seg_casos as object),
          "c:empleo=formal": 1.5,
        },
      },
      undefined,
      "chequeos.seg_casos",
    ],
    [
      "un tramo con casos a medias",
      { cal_n: { ...(DATOS.chequeos.cal_n as object), 1: 1.5 } },
      undefined,
      "chequeos.cal_n",
    ],
    [
      "una tasa mayor que 1",
      { cal_obs: { ...(DATOS.chequeos.cal_obs as object), 1: 2 } },
      undefined,
      "chequeos.cal_obs",
    ],
    [
      "un tramo que falta",
      { cal_pred: { 1: 0.1, 2: 0.3 } },
      undefined,
      "chequeos.cal_n",
    ],
  ])("rechaza %s", (_, chequeos, respuestas, esperado) => {
    expect(campo(roto(chequeos ?? {}, respuestas))).toBe(esperado);
  });

  it("falta un chequeo: se nombra", () => {
    const sin = { ...DATOS.chequeos } as Libre;
    delete sin.brier;
    expect(campo({ ...DATOS, chequeos: sin as DatosEtapa["chequeos"] })).toBe(
      "chequeos.brier",
    );
  });
});

describe("el id de un segmento, leído de vuelta", () => {
  it.each<[string, ReturnType<typeof leerSegmento>]>([
    ["p:2025-10", { tipo: "periodo", valor: "2025-10" }],
    [
      "c:empleo=formal",
      { tipo: "categoria", columna: "empleo", valor: "formal" },
    ],
    ["c:a=b=c", { tipo: "categoria", columna: "a", valor: "b=c" }],
    ["q:ingreso#3", { tipo: "tramo", columna: "ingreso", tramo: 3 }],
    ["q:a#b#2", { tipo: "tramo", columna: "a#b", tramo: 2 }],
    ["c:sin-igual", null],
    ["q:sin-numeral", null],
    ["q:col#x", null],
    ["z:otro", null],
  ])("%s", (id, esperado) => {
    expect(leerSegmento(id)).toEqual(esperado);
  });
});

describe("el resumen para el cuaderno", () => {
  it("lleva lo que se midió y tu patrón", () => {
    const r = resumenEtapa8(DATOS);
    const c = DATOS.chequeos;
    expect(r).toEqual({
      ganador: c.ganador,
      costo: c.ganador_costo,
      bajo: c.ganador_bajo,
      alto: c.ganador_alto,
      base: c.base_costo,
      baseId: c.base_id,
      regla: null,
      seleccion: c.seleccion,
      enPrueba: c.prueba_metrica,
      metrica: c.metrica,
      peor: c.peor_segmento,
      conSoporte: c.seg_con_soporte,
      calibracion: "medida",
      brier: c.brier,
      brierBase: c.brier_base,
      aperturas: 1,
      patron: PATRON.patron,
    });
  });
});
