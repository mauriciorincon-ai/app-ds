// Protocolo DS (S8, regla 19): el lector de cada etapa es la orilla que valida lo que vuelve del
// cuaderno (IndexedDB o un `.protocolo.json`). Cada campo trae su CARNADA: una mutación de ese solo
// campo que el lector debe rechazar NOMBRÁNDOLO; se reporta «detectó k de n». Y las trampas de cada
// etapa, en cada rama de los datos (costos iguales, desiguales, en un sentido y en el otro).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chequeos1, ETAPA_1 } from "@/engine/protocolo/etapa1";
import {
  datosEtapa2,
  ETAPA_2,
  type EntradaEtapa2,
} from "@/engine/protocolo/etapa2";
import { chequeos3, ETAPA_3 } from "@/engine/protocolo/etapa3";
import type {
  DatosEtapa,
  EtapaConstruida,
  Previas,
} from "@/engine/protocolo/etapas";
import { parseCsvWithLimits, type CsvTable } from "@/lib/ds/csv";

function tabla(archivo: string): CsvTable {
  const r = parseCsvWithLimits(
    readFileSync(`docs/kit-de-prueba/${archivo}`, "utf8"),
  );
  if (!r.ok) throw new Error(archivo);
  return r.table;
}

function datos1(extra: Record<string, unknown>): DatosEtapa {
  const respuestas = {
    decision: "Llamar o no",
    decisor: "Jefa",
    cuando: "A fin de mes",
    hoy: "Se llama a todos",
    unidad: "US$",
    ...extra,
  } as DatosEtapa["respuestas"];
  return { respuestas, chequeos: chequeos1(respuestas) ?? {} };
}

const BINARIA = datos1({ forma: "binaria", c_fp: 10, c_fn: 50 });
const MULTI = datos1({
  forma: "multiclase",
  opciones: ["basico", "estandar", "premium", "empresa", "estudiante"],
  costos: { basico: 5, estandar: 10, premium: 40, empresa: 80, estudiante: 2 },
});
const NUMERICA = datos1({ forma: "numerica", c_sub: 3, c_sobre: 1 });

const ENTRADA: EntradaEtapa2 = {
  objetivo: "renovo",
  positivo: "si",
  unidadColumna: "cliente_id",
  momentoColumna: "mes_observado",
  momentoTexto: "",
  ordenFecha: null,
};
const renovaciones = tabla("renovaciones-mensuales.csv");
const E2 = datosEtapa2(renovaciones, ENTRADA, BINARIA);
const PREVIAS: Previas = { 1: BINARIA, 2: E2 };
const R3 = {
  proposito: "predecir",
  poblacion: "Clientes",
  exclusiones: "Ninguna",
  periodo_texto: "",
  parametros: 3,
  r2: null,
  aviso: "",
} as DatosEtapa["respuestas"];
const E3: DatosEtapa = {
  respuestas: R3,
  chequeos: chequeos3(R3, PREVIAS) as DatosEtapa["chequeos"],
};

/** Un valor del tipo equivocado para el campo: un texto donde va otra cosa, y un número donde va un texto. */
const equivocado = (valor: unknown) =>
  typeof valor === "string" ? 123456 : "__carnada__";

type Caso = {
  nombre: string;
  etapa: EtapaConstruida;
  datos: DatosEtapa;
  respuestas: string[];
  chequeos: string[];
};

const CASOS: Caso[] = [
  {
    nombre: "etapa 1 · dos clases",
    etapa: ETAPA_1,
    datos: BINARIA,
    respuestas: [
      "decision",
      "decisor",
      "cuando",
      "hoy",
      "unidad",
      "forma",
      "c_fp",
      "c_fn",
    ],
    chequeos: [],
  },
  {
    nombre: "etapa 1 · varias clases",
    etapa: ETAPA_1,
    datos: MULTI,
    respuestas: ["decision", "unidad", "forma", "opciones", "costos"],
    chequeos: [],
  },
  {
    nombre: "etapa 1 · una cantidad",
    etapa: ETAPA_1,
    datos: NUMERICA,
    respuestas: ["decisor", "forma", "c_sub", "c_sobre"],
    chequeos: [],
  },
  {
    nombre: "etapa 2",
    etapa: ETAPA_2,
    datos: E2,
    respuestas: [
      "objetivo",
      "positivo",
      "unidad",
      "unidad_columna",
      "momento",
      "momento_columna",
      "momento_texto",
    ],
    chequeos: [
      "filas",
      "filas_utiles",
      "objetivo_vacios",
      "tarea_detectada",
      "tarea_motivo",
      "clases",
      "unidades",
      "filas_por_unidad_max",
      "unidad_repetida",
      "unidad_vacios",
      "objetivo_media".replace("objetivo_media", "tasa_base"),
      "clases_sin_costo",
      "fecha_min",
      "costo_nunca_actuar",
    ],
  },
  {
    nombre: "etapa 3",
    etapa: ETAPA_3,
    datos: E3,
    respuestas: [
      "proposito",
      "poblacion",
      "exclusiones",
      "periodo_texto",
      "aviso",
      "parametros",
    ],
    chequeos: ["n_disponible", "n_requerido", "suficiente"],
  },
];

describe("las carnadas de cada campo: el lector las rechaza nombrándolas (regla 19)", () => {
  it.each(CASOS)(
    "$nombre: un valor de otro tipo en cada campo",
    ({ etapa, datos, respuestas, chequeos }) => {
      const sinNombrar: string[] = [];
      let detectadas = 0;
      let total = 0;
      for (const [grupo, campos] of [
        ["respuestas", respuestas],
        ["chequeos", chequeos],
      ] as const)
        for (const campo of campos) {
          total += 1;
          const original = datos[grupo][campo];
          const mutado = {
            ...datos,
            [grupo]: { ...datos[grupo], [campo]: equivocado(original) },
          } as DatosEtapa;
          const r = etapa.leer(mutado);
          if (!r.ok && r.campo === `${grupo}.${campo}`) detectadas += 1;
          else sinNombrar.push(`${grupo}.${campo} (${JSON.stringify(r)})`);
        }
      console.log(
        `[contrato ${etapa.id} · ${total} campos] detectó ${detectadas} de ${total}`,
      );
      expect(sinNombrar).toEqual([]);
    },
  );

  it.each(CASOS)(
    "$nombre: una clave que la etapa no registra se rechaza",
    ({ etapa, datos }) => {
      for (const grupo of ["respuestas", "chequeos"] as const) {
        const mutado = {
          ...datos,
          [grupo]: { ...datos[grupo], intrusa: 1 },
        } as DatosEtapa;
        const r = etapa.leer(mutado);
        expect(r, grupo).toEqual({ ok: false, campo: `${grupo}.intrusa` });
      }
    },
  );

  it("etapa 3: parametros fraccionario o r2 no numérico, y el propósito desconocido", () => {
    const casos: [string, unknown][] = [
      ["parametros", 2.5],
      ["r2", "mucho"],
      ["proposito", "adivinar"],
    ];
    for (const [campo, valor] of casos) {
      const r = ETAPA_3.leer({
        ...E3,
        respuestas: { ...R3, [campo]: valor },
      } as DatosEtapa);
      expect(r, campo).toEqual({ ok: false, campo: `respuestas.${campo}` });
    }
  });

  it("etapa 2: el orden de las fechas, la unidad y el momento solo admiten sus valores", () => {
    for (const [campo, valor] of [
      ["orden_fecha", "año-mes"],
      ["unidad", "tabla"],
      ["momento", "luego"],
    ] as const) {
      const r = ETAPA_2.leer({
        ...E2,
        respuestas: { ...E2.respuestas, [campo]: valor },
      });
      expect(r, campo).toEqual({ ok: false, campo: `respuestas.${campo}` });
    }
    const sin = datosEtapa2(
      renovaciones,
      { ...ENTRADA, objetivo: null },
      BINARIA,
    );
    expect(ETAPA_2.leer({ ...sin, chequeos: { filas: 1 } })).toEqual({
      ok: false,
      campo: "chequeos.filas",
    });
  });
});

describe("las trampas de cada etapa, en cada rama", () => {
  const claves = (
    etapa: EtapaConstruida,
    datos: DatosEtapa,
    previas: Previas = {},
  ) => etapa.trampas(datos, previas).map((t) => t.clave);

  it("etapa 1 · dos clases: umbral bajo, alto e igual", () => {
    expect(claves(ETAPA_1, BINARIA)).toEqual(["umbral"]);
    expect(
      claves(ETAPA_1, datos1({ forma: "binaria", c_fp: 50, c_fn: 10 })),
    ).toEqual(["umbral-alto"]);
    expect(
      claves(ETAPA_1, datos1({ forma: "binaria", c_fp: 7, c_fn: 7 })),
    ).toEqual(["umbral-igual"]);
  });

  it("etapa 1 · varias clases: costos distintos e iguales", () => {
    expect(claves(ETAPA_1, MULTI)).toEqual(["costos"]);
    const iguales = datos1({
      forma: "multiclase",
      opciones: ["a", "b", "c"],
      costos: { a: 4, b: 4, c: 4 },
    });
    expect(claves(ETAPA_1, iguales)).toEqual(["costos-iguales"]);
  });

  it("etapa 1 · una cantidad: cuantil alto, bajo e igual", () => {
    expect(claves(ETAPA_1, NUMERICA)).toEqual(["cuantil"]);
    expect(
      claves(ETAPA_1, datos1({ forma: "numerica", c_sub: 1, c_sobre: 3 })),
    ).toEqual(["cuantil-bajo"]);
    expect(
      claves(ETAPA_1, datos1({ forma: "numerica", c_sub: 2, c_sobre: 2 })),
    ).toEqual(["cuantil-igual"]);
  });

  it("etapa 1 sin la forma o con costos que no se leen: sin trampa", () => {
    expect(ETAPA_1.trampas({ respuestas: {}, chequeos: {} }, {})).toEqual([]);
    expect(ETAPA_1.trampas({ ...BINARIA, chequeos: {} }, {})).toEqual([]);
  });

  it("etapa 2: la unidad que es la fila, la repetida y la única", () => {
    const fila = datosEtapa2(
      renovaciones,
      { ...ENTRADA, unidadColumna: null },
      BINARIA,
    );
    expect(claves(ETAPA_2, fila, { 1: BINARIA })[0]).toBe("unidad-fila");
    expect(claves(ETAPA_2, E2, { 1: BINARIA })).toEqual([
      "unidad-repetida",
      "tasa-base",
      "costo-binaria",
    ]);
    const unica = datosEtapa2(
      renovaciones,
      { ...ENTRADA, unidadColumna: "mes_observado" },
      BINARIA,
    );
    expect(
      claves(
        ETAPA_2,
        { ...unica, chequeos: { ...unica.chequeos, unidad_repetida: false } },
        { 1: BINARIA },
      )[0],
    ).toBe("unidad-unica");
  });

  it("etapa 2: con varias clases y con una cantidad", () => {
    const planes = tabla("planes-suscripcion.csv");
    const entrada = {
      ...ENTRADA,
      objetivo: "plan",
      positivo: "",
      unidadColumna: null,
      momentoColumna: null,
      momentoTexto: "Al contratar",
    };
    const m = datosEtapa2(planes, entrada, MULTI);
    expect(claves(ETAPA_2, m, { 1: MULTI })).toEqual([
      "unidad-fila",
      "mayoria",
      "costo-mayoria",
    ]);
    const energia = tabla("consumo-energia.csv");
    const n = datosEtapa2(
      energia,
      { ...entrada, objetivo: "consumo_kwh" },
      NUMERICA,
    );
    expect(claves(ETAPA_2, n, { 1: NUMERICA })).toEqual([
      "unidad-fila",
      "costo-constante",
    ]);
  });

  it("etapa 2 sin objetivo, o sin la etapa 1: sin trampas que decir", () => {
    const sin = datosEtapa2(
      renovaciones,
      { ...ENTRADA, objetivo: null },
      BINARIA,
    );
    expect(claves(ETAPA_2, sin, { 1: BINARIA })).toEqual([]);
    expect(claves(ETAPA_2, E2, {})).toEqual(["unidad-repetida"]);
  });

  it("etapa 3: causal, muestra que alcanza, muestra corta y periodo", () => {
    expect(
      claves(
        ETAPA_3,
        { respuestas: { ...R3, proposito: "explicar" }, chequeos: {} },
        PREVIAS,
      ),
    ).toEqual(["causal"]);
    expect(claves(ETAPA_3, E3, PREVIAS)).toEqual([
      "muestra-alcanza",
      "periodo",
    ]);
    const corta = {
      respuestas: { ...R3, parametros: 60 },
      chequeos: chequeos3(
        { ...R3, parametros: 60 },
        PREVIAS,
      ) as DatosEtapa["chequeos"],
    };
    expect(claves(ETAPA_3, corta, PREVIAS)[0]).toBe("muestra-corta");
    expect(claves(ETAPA_3, { respuestas: R3, chequeos: {} }, PREVIAS)).toEqual(
      [],
    );
  });
});

describe("los criterios, en sus ramas de error", () => {
  it("etapa 1 sin la forma, y etapa 2 y 3 sin sus etapas previas", () => {
    expect(ETAPA_1.criterio({ respuestas: {}, chequeos: {} }, {})).toEqual({
      tipo: "falta",
      faltan: ["forma"],
    });
    expect(ETAPA_2.criterio(E2, {})).toEqual({
      tipo: "falta",
      faltan: ["etapa1"],
    });
    expect(ETAPA_3.criterio(E3, {})).toEqual({
      tipo: "falta",
      faltan: ["etapas-previas"],
    });
  });

  it("etapa 3: cifras que no cuadran, parámetros sin contar y R² fuera de rango", () => {
    expect(
      ETAPA_3.criterio(
        { ...E3, chequeos: { ...E3.chequeos, n_requerido: 1 } },
        PREVIAS,
      ),
    ).toEqual({ tipo: "falta", faltan: ["chequeos"] });
    expect(
      ETAPA_3.criterio(
        { respuestas: { ...R3, parametros: null }, chequeos: {} },
        PREVIAS,
      ),
    ).toMatchObject({ faltan: ["parametros"] });
    const energia = tabla("consumo-energia.csv");
    const e2n = datosEtapa2(
      energia,
      {
        ...ENTRADA,
        objetivo: "consumo_kwh",
        positivo: "",
        unidadColumna: null,
        momentoColumna: null,
        momentoTexto: "Mensual",
      },
      NUMERICA,
    );
    const previas: Previas = { 1: NUMERICA, 2: e2n };
    for (const r2 of [null, 0, 1, 1.5])
      expect(
        ETAPA_3.criterio({ respuestas: { ...R3, periodo_texto: "Todo 2025", r2 }, chequeos: {} }, previas),
      ).toMatchObject({ faltan: ["r2"] });
  });

  it("etapa 2: la columna elegida debe existir en los datos cargados", () => {
    expect(
      ETAPA_2.criterio(
        { ...E2, respuestas: { ...E2.respuestas, objetivo: " " } },
        { 1: BINARIA },
      ),
    ).toMatchObject({ faltan: ["objetivo"] });
    const sinColumna = {
      ...E2,
      respuestas: { ...E2.respuestas, unidad_columna: "" },
    };
    expect(ETAPA_2.criterio(sinColumna, { 1: BINARIA })).toMatchObject({
      faltan: ["unidad"],
    });
    const sinMomento = {
      ...E2,
      respuestas: { ...E2.respuestas, momento: "texto", momento_texto: " " },
    };
    expect(ETAPA_2.criterio(sinMomento, { 1: BINARIA })).toMatchObject({
      faltan: ["momento"],
    });
  });
});
