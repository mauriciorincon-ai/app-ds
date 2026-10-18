// Protocolo DS (S8): las etapas 1–3 sobre datos reales del kit de prueba, de punta a punta por la
// compuerta (`registrar` + `evaluar`). Cada trampa y cada chequeo se verifica contra una cuenta
// hecha a mano o contra el motor de la fórmula; cada criterio, con su caso rojo.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluar, registrar } from "@/engine/protocolo/compuerta";
import {
  cuadernoVacio,
  ultimaEvidencia,
  type Cuaderno,
} from "@/engine/protocolo/cuaderno";
import { datosEtapa2, type EntradaEtapa2 } from "@/engine/protocolo/etapa2";
import { chequeos1 } from "@/engine/protocolo/etapa1";
import { chequeos3 } from "@/engine/protocolo/etapa3";
import type { DatosEtapa, EtapaId, Previas } from "@/engine/protocolo/etapas";
import { leerFechas } from "@/engine/protocolo/fechas";
import { muestraBinaria, muestraCantidad } from "@/engine/protocolo/muestra";
import { PROTOCOLO_DS } from "@/engine/protocolo/protocolo-ds";
import { contarParametros, costoConstante } from "@/engine/protocolo/tabla";
import { parseCsvWithLimits, type CsvTable } from "@/lib/ds/csv";

const AHORA = new Date("2026-10-17T12:00:00.000Z");

function tabla(archivo: string): CsvTable {
  const r = parseCsvWithLimits(
    readFileSync(`docs/kit-de-prueba/${archivo}`, "utf8"),
  );
  if (!r.ok) throw new Error(`CSV del kit ilegible: ${archivo}`);
  return r.table;
}

function datos1(extra: Record<string, unknown>): DatosEtapa {
  const respuestas = {
    decision: "Llamar o no al cliente antes de que venza",
    decisor: "Jefa de retención",
    cuando: "El día 25 de cada mes",
    hoy: "Se llama a todos los de plan premium",
    unidad: "US$",
    ...extra,
  } as DatosEtapa["respuestas"];
  return { respuestas, chequeos: chequeos1(respuestas) ?? {} };
}

const BINARIA = datos1({ forma: "binaria", c_fp: 10, c_fn: 50 });
const OPCIONES = ["basico", "estandar", "premium", "empresa", "estudiante"];
const MULTI = datos1({
  forma: "multiclase",
  opciones: OPCIONES,
  costos: { basico: 5, estandar: 10, premium: 40, empresa: 80, estudiante: 2 },
});
const NUMERICA = datos1({
  forma: "numerica",
  c_sub: 3,
  c_sobre: 1,
  unidad: "kWh",
});

const HUELLA = "d".repeat(64);

// La compuerta vuelve a calcular la etapa 2 contra la tabla cargada: cada prueba que registra o
// evalúa esa etapa le pasa la tabla sobre la que se armó.
const TABLAS = new WeakMap<DatosEtapa, CsvTable>();

function etapa2(
  t: CsvTable,
  entrada: EntradaEtapa2,
  etapa1: DatosEtapa,
): DatosEtapa {
  const datos = datosEtapa2(t, entrada, etapa1);
  TABLAS.set(datos, t);
  return datos;
}

function tablaDe(cuaderno: Cuaderno, datos?: DatosEtapa): CsvTable | null {
  const e2 = ultimaEvidencia(cuaderno, 2)?.datos;
  return (datos && TABLAS.get(datos)) || (e2 && TABLAS.get(e2)) || null;
}

function evaluarDS(cuaderno: Cuaderno, huella: string | null = HUELLA) {
  return evaluar(PROTOCOLO_DS, cuaderno, huella, tablaDe(cuaderno));
}

function paso(
  cuaderno: Cuaderno,
  id: EtapaId,
  datos: DatosEtapa,
  huella: string | null = HUELLA,
) {
  return registrar(PROTOCOLO_DS, cuaderno, id, datos, {
    huella,
    tabla: tablaDe(cuaderno, datos),
    ahora: AHORA,
  });
}

function cumplir(cuaderno: Cuaderno, id: EtapaId, datos: DatosEtapa): Cuaderno {
  const r = paso(cuaderno, id, datos);
  if (!r.ok) throw new Error(`etapa ${id}: ${JSON.stringify(r.rechazo)}`);
  return r.cuaderno;
}

const ENTRADA_RENOVACIONES: EntradaEtapa2 = {
  objetivo: "renovo",
  positivo: "si",
  unidadColumna: "cliente_id",
  momentoColumna: "mes_observado",
  momentoTexto: "",
  ordenFecha: null,
};

function previas(...pares: [EtapaId, DatosEtapa][]): Previas {
  return Object.fromEntries(pares);
}

describe("etapa 1 · la decisión y lo que cuesta equivocarse", () => {
  it("dos clases: el umbral sale de los costos, no de 0,5 (Elkan 2001)", () => {
    expect(BINARIA.chequeos.umbral).toBeCloseTo(10 / 60, 12);
    expect(BINARIA.chequeos.razon).toBe(5);
    expect(cumplir(cuadernoVacio(AHORA), 1, BINARIA).evidencias).toHaveLength(
      1,
    );
  });

  it("estimar: el cuantil sale de cuánto cuesta quedarse corto frente a pasarse", () => {
    expect(NUMERICA.chequeos.cuantil).toBeCloseTo(0.75, 12);
  });

  it("varias clases: el costo menor y el mayor de las opciones", () => {
    expect(MULTI.chequeos).toEqual({
      n_opciones: 5,
      costo_menor: 2,
      costo_mayor: 80,
    });
  });

  it.each([
    ["sin decisión", { decision: "  " }, "decision"],
    ["sin decisor", { decisor: "" }, "decisor"],
    ["sin unidad de costo", { unidad: "" }, "unidad"],
    ["un costo en cero", { c_fp: 0 }, "costos"],
    ["un costo negativo", { c_fn: -5 }, "costos"],
  ])("%s no abre la etapa 2 (nombra %s)", (_nombre, cambio, falta) => {
    const respuestas = { ...BINARIA.respuestas, ...cambio };
    const r = paso(cuadernoVacio(AHORA), 1, {
      respuestas,
      chequeos: chequeos1(respuestas) ?? {},
    });
    expect(!r.ok && r.rechazo).toMatchObject({
      tipo: "criterio-no-cumplido",
      faltan: [falta],
    });
  });

  it("varias clases: menos de tres opciones, repetidas o sin costo no cumplen", () => {
    for (const cambio of [
      { opciones: ["a", "b"], costos: { a: 1, b: 2 } },
      { opciones: ["a", "a", "b"], costos: { a: 1, b: 2 } },
      { opciones: ["a", "b", "c"], costos: { a: 1, b: 2 } },
    ]) {
      const respuestas = { ...MULTI.respuestas, ...cambio };
      const r = paso(cuadernoVacio(AHORA), 1, {
        respuestas,
        chequeos: chequeos1(respuestas) ?? {},
      });
      expect(r.ok, JSON.stringify(cambio)).toBe(false);
    }
  });

  it("un cuaderno con el umbral cambiado a mano no cumple (el criterio se recalcula)", () => {
    const r = paso(cuadernoVacio(AHORA), 1, {
      respuestas: BINARIA.respuestas,
      chequeos: { umbral: 0.5, razon: 5 },
    });
    expect(!r.ok && r.rechazo).toMatchObject({
      tipo: "criterio-no-cumplido",
      faltan: ["chequeos"],
    });
  });
});

describe("etapa 2 · el objetivo y la unidad, con su momento (renovaciones-mensuales.csv)", () => {
  const t = tabla("renovaciones-mensuales.csv");
  const e2 = etapa2(t, ENTRADA_RENOVACIONES, BINARIA);
  const c = e2.chequeos;

  it("cuenta filas, vacíos, tasa base y unidades en los datos", () => {
    expect(c.filas).toBe(361);
    expect(c.filas_utiles).toBe(361);
    expect(c.objetivo_vacios).toBe(0);
    expect(c.tarea_detectada).toBe("binaria");
    expect(c.clases).toEqual({ no: 295, si: 66 });
    expect(c.tasa_base).toBeCloseTo(66 / 361, 12);
    expect(c.unidades).toBe(100);
    expect(c.unidad_repetida).toBe(true);
    expect(c.filas_por_unidad_max).toBeGreaterThan(1);
  });

  it("lee la cobertura de la fecha sin adivinar", () => {
    expect(c.fecha_estado).toBe("leida");
    expect(String(c.fecha_min)).toMatch(/^2025-\d\d-15$/);
    expect(String(c.fecha_max) >= String(c.fecha_min)).toBe(true);
    expect(c.fecha_sin_leer).toBe(0);
  });

  it("el costo de no hacer nada: nunca actuar y siempre actuar, con los costos de la etapa 1", () => {
    const pi = 66 / 361;
    expect(c.costo_nunca_actuar).toBeCloseTo(pi * 50, 12);
    expect(c.costo_siempre_actuar).toBeCloseTo((1 - pi) * 10, 12);
  });

  it("cumple con la etapa 1 cumplida y la deja registrada con la huella", () => {
    const cuaderno = cumplir(cumplir(cuadernoVacio(AHORA), 1, BINARIA), 2, e2);
    const estados = evaluarDS(cuaderno).map((e) => e.estado.tipo);
    expect(estados.slice(0, 3)).toEqual(["cumplida", "cumplida", "abierta"]);
    expect(cuaderno.evidencias[1]).toMatchObject({
      etapa: 2,
      huella: HUELLA,
      base: { 1: 1 },
    });
  });

  it("un objetivo de otra forma que la decisión no cumple, nombrando la tarea", () => {
    const e = etapa2(
      t,
      { ...ENTRADA_RENOVACIONES, objetivo: "plan", positivo: "" },
      BINARIA,
    );
    expect(e.chequeos.tarea_detectada).toBe("multiclase");
    const r = paso(cumplir(cuadernoVacio(AHORA), 1, BINARIA), 2, e);
    expect(!r.ok && r.rechazo).toMatchObject({
      tipo: "criterio-no-cumplido",
      faltan: ["tarea"],
    });
  });

  it("dos clases: el valor «hay que actuar» debe ser uno de los dos que hay", () => {
    const e = etapa2(
      t,
      { ...ENTRADA_RENOVACIONES, positivo: "quizá" },
      BINARIA,
    );
    const r = paso(cumplir(cuadernoVacio(AHORA), 1, BINARIA), 2, e);
    expect(!r.ok && r.rechazo).toMatchObject({ faltan: ["positivo"] });
  });

  it("una columna de fecha que no se lee no cumple; el momento escrito sí", () => {
    const mala = etapa2(
      t,
      { ...ENTRADA_RENOVACIONES, momentoColumna: "plan" },
      BINARIA,
    );
    expect(mala.chequeos.fecha_estado).toBe("ninguna");
    const base = cumplir(cuadernoVacio(AHORA), 1, BINARIA);
    const r = paso(base, 2, mala);
    expect(!r.ok && r.rechazo).toMatchObject({ faltan: ["fecha"] });
    const escrita = etapa2(
      t,
      {
        ...ENTRADA_RENOVACIONES,
        momentoColumna: null,
        momentoTexto: "Al cierre de cada mes",
      },
      BINARIA,
    );
    expect(paso(base, 2, escrita).ok).toBe(true);
  });

  it("otra versión de los datos sin las columnas elegidas no rompe: esas columnas cuentan como vacías y la etapa no cumple", () => {
    // Hallazgo del e2e: cargar otro archivo dejaba al formulario apuntando a columnas que no existen.
    const otra = tabla("planes-suscripcion.csv");
    const e = etapa2(otra, ENTRADA_RENOVACIONES, BINARIA);
    expect(e.chequeos.tarea_detectada).toBe("sin-objetivo");
    expect(e.chequeos.unidad_vacios).toBe(otra.rows.length);
    expect(e.chequeos.fecha_estado).toBe("ninguna");
    const r = paso(cumplir(cuadernoVacio(AHORA), 1, BINARIA), 2, e);
    expect(r.ok).toBe(false);
  });

  it("sin columna objetivo el Protocolo se detiene y lleva a agrupar (G-Plan 3a)", () => {
    const sin = etapa2(t, { ...ENTRADA_RENOVACIONES, objetivo: null }, BINARIA);
    expect(sin.chequeos).toEqual({});
    const cuaderno = cumplir(cumplir(cuadernoVacio(AHORA), 1, BINARIA), 2, sin);
    const e2Estado = evaluarDS(cuaderno)[1]!.estado;
    expect(e2Estado).toMatchObject({ tipo: "detenida", razon: "sin-objetivo" });
    expect(evaluarDS(cuaderno)[2]!.estado.tipo).toBe("cerrada");
  });

  it("el cuaderno no tiene un camino de salto: la etapa 3 no abre con la 2 detenida", () => {
    const sin = etapa2(t, { ...ENTRADA_RENOVACIONES, objetivo: null }, BINARIA);
    const cuaderno = cumplir(cumplir(cuadernoVacio(AHORA), 1, BINARIA), 2, sin);
    const r = paso(cuaderno, 3, { respuestas: {}, chequeos: {} });
    expect(!r.ok && r.rechazo).toMatchObject({
      tipo: "etapa-cerrada",
      etapa: 3,
      bloquea: 2,
    });
  });

  it("varias clases: las clases de los datos sin costo en la etapa 1 se nombran", () => {
    const planes = tabla("planes-suscripcion.csv");
    const completa = etapa2(
      planes,
      {
        ...ENTRADA_RENOVACIONES,
        objetivo: "plan",
        positivo: "",
        unidadColumna: null,
        momentoColumna: null,
        momentoTexto: "Al contratar",
      },
      MULTI,
    );
    expect(completa.chequeos.clases_sin_costo).toEqual([]);
    expect(completa.chequeos.tarea_detectada).toBe("multiclase");
    expect(Number(completa.chequeos.costo_mayoria)).toBeGreaterThan(0);
    expect(paso(cumplir(cuadernoVacio(AHORA), 1, MULTI), 2, completa).ok).toBe(
      true,
    );

    const cuatro = datos1({
      forma: "multiclase",
      opciones: OPCIONES.slice(0, 4),
      costos: { basico: 5, estandar: 10, premium: 40, empresa: 80 },
    });
    const incompleta = etapa2(
      planes,
      {
        ...ENTRADA_RENOVACIONES,
        objetivo: "plan",
        positivo: "",
        unidadColumna: null,
        momentoColumna: null,
        momentoTexto: "Al contratar",
      },
      cuatro,
    );
    expect(incompleta.chequeos.clases_sin_costo).toEqual(["estudiante"]);
    const r = paso(cumplir(cuadernoVacio(AHORA), 1, cuatro), 2, incompleta);
    expect(!r.ok && r.rechazo).toMatchObject({ faltan: ["costos"] });
  });

  it("estimar: una columna numérica con muchos valores sirve; el costo de la constante sale del cuantil", () => {
    const energia = tabla("consumo-energia.csv");
    const e = etapa2(
      energia,
      {
        ...ENTRADA_RENOVACIONES,
        objetivo: "consumo_kwh",
        positivo: "",
        unidadColumna: null,
        momentoColumna: null,
        momentoTexto: "Al cierre del mes",
      },
      NUMERICA,
    );
    expect(e.chequeos.tarea_detectada).toBe("numerica");
    const valores = energia.rows.map((fila) =>
      Number(fila[energia.headers.indexOf("consumo_kwh")]),
    );
    expect(e.chequeos.costo_constante).toBeCloseTo(
      costoConstante(valores, 3, 1),
      9,
    );
    expect(paso(cumplir(cuadernoVacio(AHORA), 1, NUMERICA), 2, e).ok).toBe(
      true,
    );
  });
});

describe("fechas: nunca se adivina el orden", () => {
  it("ISO no tiene ambigüedad y da el periodo", () => {
    expect(leerFechas(["2025-03-01", "2025-01-31", ""])).toMatchObject({
      tipo: "leida",
      orden: "iso",
      minimo: "2025-01-31",
      maximo: "2025-03-01",
      vacias: 1,
      sinLeer: 0,
    });
  });

  it("un día mayor que 12 delata el orden", () => {
    expect(leerFechas(["31/01/2025", "05/02/2025"])).toMatchObject({
      tipo: "leida",
      orden: "dia-mes",
      minimo: "2025-01-31",
    });
    expect(leerFechas(["01/31/2025", "02/05/2025"])).toMatchObject({
      tipo: "leida",
      orden: "mes-dia",
      minimo: "2025-01-31",
    });
  });

  it("si todo cabe en los dos órdenes, pregunta; con la respuesta, lee", () => {
    const valores = ["05/06/2025", "07/08/2025"];
    expect(leerFechas(valores)).toMatchObject({ tipo: "ambigua", leidas: 2 });
    expect(leerFechas(valores, "dia-mes")).toMatchObject({
      tipo: "leida",
      minimo: "2025-06-05",
      maximo: "2025-08-07",
    });
    expect(leerFechas(valores, "mes-dia")).toMatchObject({
      tipo: "leida",
      minimo: "2025-05-06",
      maximo: "2025-07-08",
    });
  });

  it("mezclar formatos, o un orden y el contrario, no se resuelve en silencio", () => {
    expect(leerFechas(["2025-01-01", "01/02/2025"]).tipo).toBe("mezclada");
    expect(leerFechas(["31/01/2025", "01/31/2025"]).tipo).toBe("mezclada");
  });

  it("una fecha imposible queda sin leer, no corregida", () => {
    expect(leerFechas(["2025-02-30", "2025-02-28"])).toMatchObject({
      tipo: "leida",
      sinLeer: 1,
      minimo: "2025-02-28",
    });
    expect(leerFechas(["hola", "mañana"]).tipo).toBe("ninguna");
    expect(leerFechas(["29/02/2024", "01/03/2024"], "dia-mes")).toMatchObject({
      tipo: "leida",
      sinLeer: 0,
    });
  });
});

describe("etapa 3 · ¿predecir o explicar? y el diseño", () => {
  const t = tabla("renovaciones-mensuales.csv");
  const e2 = etapa2(t, ENTRADA_RENOVACIONES, BINARIA);
  const base = cumplir(cumplir(cuadernoVacio(AHORA), 1, BINARIA), 2, e2);
  const previa = previas([1, BINARIA], [2, e2]);

  function datos3(respuestas: Record<string, unknown>): DatosEtapa {
    const completas = {
      proposito: "predecir",
      poblacion: "Clientes con plan activo",
      exclusiones: "Cuentas de prueba",
      periodo_texto: "",
      parametros: 3,
      r2: null,
      aviso: "",
      ...respuestas,
    } as DatosEtapa["respuestas"];
    if (completas.proposito === "explicar")
      return { respuestas: completas, chequeos: {} };
    return {
      respuestas: completas,
      chequeos: (chequeos3(completas, previa) ?? {}) as DatosEtapa["chequeos"],
    };
  }

  it("cuenta los parámetros candidatos de los datos: numéricas, y una menos que las categorías", () => {
    expect(contarParametros(t, ["renovo", "cliente_id", "mes_observado"])).toBe(
      2 + 1 + 1 + 1,
    );
  });

  it("el tamaño sale de la fórmula de Riley con la tasa base de la etapa 2", () => {
    const d = datos3({ parametros: 5 });
    const m = muestraBinaria({ parametros: 5, prevalencia: 66 / 361 });
    expect(d.chequeos.n_requerido).toBe(m.final);
    expect(d.chequeos.n_disponible).toBe(361);
    expect(d.chequeos.suficiente).toBe(361 >= m.final);
    expect(d.chequeos.manda).toBe(m.manda);
  });

  it("con la muestra suficiente cumple; la etapa 4 queda sin construir", () => {
    const d = datos3({ parametros: 3 });
    expect(d.chequeos.suficiente).toBe(true);
    const cuaderno = cumplir(base, 3, d);
    const estados = evaluarDS(cuaderno).map((e) => e.estado.tipo);
    expect(estados.slice(0, 4)).toEqual([
      "cumplida",
      "cumplida",
      "cumplida",
      "no-construida",
    ]);
  });

  it("con la muestra corta pide el aviso escrito; con el aviso, cumple y queda dicho", () => {
    const corta = datos3({ parametros: 60 });
    expect(corta.chequeos.suficiente).toBe(false);
    const r = paso(base, 3, corta);
    expect(!r.ok && r.rechazo).toMatchObject({
      tipo: "criterio-no-cumplido",
      faltan: ["muestra"],
    });
    const conAviso = datos3({
      parametros: 60,
      aviso: "Lo sé: es un piloto de un mes",
    });
    const cuaderno = cumplir(base, 3, conAviso);
    expect(cuaderno.evidencias.at(-1)!.datos.respuestas.aviso).toBe(
      "Lo sé: es un piloto de un mes",
    );
  });

  it("«explicar una causa» detiene el Protocolo con su razón, y se puede reformular", () => {
    const cuaderno = cumplir(base, 3, datos3({ proposito: "explicar" }));
    expect(evaluarDS(cuaderno)[2]!.estado).toMatchObject({
      tipo: "detenida",
      razon: "causal",
    });
    const reformulado = cumplir(cuaderno, 3, datos3({ proposito: "predecir" }));
    expect(evaluarDS(reformulado)[2]!.estado.tipo).toBe("cumplida");
  });

  it("la ficha incompleta nombra lo que falta", () => {
    const r = paso(
      base,
      3,
      datos3({ poblacion: " ", exclusiones: "", parametros: null }),
    );
    expect(!r.ok && r.rechazo).toMatchObject({
      tipo: "criterio-no-cumplido",
      faltan: ["poblacion", "exclusiones", "parametros"],
    });
  });

  it("con la fecha leída en la etapa 2 no se pide el periodo; sin ella, sí", () => {
    const sinFecha = etapa2(
      t,
      {
        ...ENTRADA_RENOVACIONES,
        momentoColumna: null,
        momentoTexto: "Al cierre del mes",
      },
      BINARIA,
    );
    const b = cumplir(cumplir(cuadernoVacio(AHORA), 1, BINARIA), 2, sinFecha);
    const p = previas([1, BINARIA], [2, sinFecha]);
    const respuestas = {
      proposito: "predecir",
      poblacion: "x",
      exclusiones: "y",
      periodo_texto: "",
      parametros: 3,
      r2: null,
      aviso: "",
    } as DatosEtapa["respuestas"];
    const d = {
      respuestas,
      chequeos: (chequeos3(respuestas, p) ?? {}) as DatosEtapa["chequeos"],
    };
    const r = paso(b, 3, d);
    expect(!r.ok && r.rechazo).toMatchObject({ faltan: ["periodo"] });
    expect(
      paso(b, 3, {
        ...d,
        respuestas: { ...respuestas, periodo_texto: "Todo 2025" },
      }).ok,
    ).toBe(true);
  });

  it("estimar pide el R² anticipado y usa los cuatro criterios", () => {
    const energia = tabla("consumo-energia.csv");
    const e2n = etapa2(
      energia,
      {
        ...ENTRADA_RENOVACIONES,
        objetivo: "consumo_kwh",
        positivo: "",
        unidadColumna: null,
        momentoColumna: null,
        momentoTexto: "Al cierre del mes",
      },
      NUMERICA,
    );
    const b = cumplir(cumplir(cuadernoVacio(AHORA), 1, NUMERICA), 2, e2n);
    const p = previas([1, NUMERICA], [2, e2n]);
    const sinR2 = {
      proposito: "predecir",
      poblacion: "x",
      exclusiones: "y",
      periodo_texto: "Todo 2025",
      parametros: 6,
      r2: null,
      aviso: "",
    } as DatosEtapa["respuestas"];
    expect(chequeos3(sinR2, p)).toBeNull();
    const r = paso(b, 3, { respuestas: sinR2, chequeos: {} });
    expect(!r.ok && r.rechazo).toMatchObject({
      faltan: ["r2", "chequeos"].slice(0, 1),
    });
    const con = { ...sinR2, r2: 0.3 };
    const chequeos = chequeos3(con, p)!;
    // 200 filas no alcanzan: la desviación residual pide 234 + P. Sin aviso, no cumple.
    expect(chequeos.suficiente).toBe(false);
    expect(chequeos.manda).toBe("varianza");
    const sinAviso = paso(b, 3, {
      respuestas: con,
      chequeos: chequeos as DatosEtapa["chequeos"],
    });
    expect(!sinAviso.ok && sinAviso.rechazo).toMatchObject({
      faltan: ["muestra"],
    });
    const m = muestraCantidad({
      parametros: 6,
      r2: 0.3,
      media: Number(e2n.chequeos.objetivo_media),
      desviacion: Number(e2n.chequeos.objetivo_desv),
    });
    expect(chequeos.n_requerido).toBe(m.final);
    expect(chequeos.varianza).toBe(234 + 6);
    const firmado = { ...con, aviso: "Es un piloto: lo sé" };
    expect(
      paso(b, 3, {
        respuestas: firmado,
        chequeos: chequeos as DatosEtapa["chequeos"],
      }).ok,
    ).toBe(true);
  });

  it("varias clases: uno contra el resto, con la clase que manda", () => {
    const planes = tabla("planes-suscripcion.csv");
    const e2m = etapa2(
      planes,
      {
        ...ENTRADA_RENOVACIONES,
        objetivo: "plan",
        positivo: "",
        unidadColumna: null,
        momentoColumna: null,
        momentoTexto: "Al contratar",
      },
      MULTI,
    );
    const p = previas([1, MULTI], [2, e2m]);
    const respuestas = {
      proposito: "predecir",
      poblacion: "x",
      exclusiones: "y",
      periodo_texto: "Todo 2025",
      parametros: 6,
      r2: null,
      aviso: "",
    } as DatosEtapa["respuestas"];
    const c = chequeos3(respuestas, p)!;
    expect(typeof c.clase_que_manda).toBe("string");
    expect(c.n_requerido).toBe(
      Math.max(...Object.values(c.por_clase as Record<string, number>)),
    );
  });

  it("si cambia la etapa 2, la 3 vuelve a verificarse (se construyó sobre la anterior)", () => {
    const cuaderno = cumplir(base, 3, datos3({ parametros: 3 }));
    const corregido = cumplir(cuaderno, 2, e2);
    expect(evaluarDS(corregido)[2]!.estado).toMatchObject({
      tipo: "por-verificar",
      motivo: "anterior-cambio",
    });
  });
});
