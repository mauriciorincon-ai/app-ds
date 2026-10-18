// Protocolo DS (S10), etapa 5 — lo que ya se logra sin modelo: las referencias por forma de la
// decisión (a mano, y contra los costos de la etapa 2 sobre el kit), la regla de hoy medida, el
// criterio regla por regla, la forma de lo registrado y las trampas. «k de n» al final.
import { describe, expect, it } from "vitest";
import { registrar } from "@/engine/protocolo/compuerta";
import { chequeos1 } from "@/engine/protocolo/etapa1";
import {
  ACTUAR,
  CLAVES_5,
  ENTRADA_5_VACIA,
  ETAPA_5,
  NO_ACTUAR,
  TRAMPAS_5,
  datosEtapa5,
  referencias5,
  valoresDeColumna,
  vistaDe,
  type EntradaEtapa5,
} from "@/engine/protocolo/etapa5";
import type { DatosEtapa, Previas } from "@/engine/protocolo/etapas";
import { costoConstante, numerosDe } from "@/engine/protocolo/tabla";
import { lista, mapa, numero, texto } from "@/engine/protocolo/valores";
import {
  AHORA,
  ENTRADA_BAJAS,
  ENTRADA_CREDITO,
  HUELLA,
  PROTOCOLO5,
  armar4,
  csv,
  tablaKit,
} from "./protocolo-etapa4-helpers";

const regla = (extra: Partial<EntradaEtapa5>): EntradaEtapa5 => ({
  ...ENTRADA_5_VACIA,
  regla: "hay",
  ...extra,
});
const cierra = (c: number, esperado: number) =>
  expect(c).toBeCloseTo(esperado, 10);

const e1Con = (extra: Record<string, unknown>): DatosEtapa => {
  const respuestas = {
    decision: "Qué hacer",
    decisor: "La jefa",
    cuando: "A fin de mes",
    hoy: "Lo que se hace hoy",
    unidad: "US$",
    ...extra,
  } as DatosEtapa["respuestas"];
  return { respuestas, chequeos: chequeos1(respuestas) ?? {} };
};

function criterio(datos: DatosEtapa, previas: Previas) {
  return ETAPA_5.criterio(datos, previas);
}

// --- dos clases, a mano ---------------------------------------------------------------
// 10 filas: 3 «si» (edad 20, 25, 30) y 7 «no». c_fp = 10, c_fn = 50.
const BINARIA = (() => {
  const tabla = csv(
    "edad,plan,baja",
    "20,a,si",
    "25,a,si",
    "30,b,si",
    "35,a,no",
    "40,b,no",
    "45,b,no",
    "50,a,no",
    "55,b,no",
    "60,a,no",
    "65,b,no",
  );
  const a = armar4(
    "a-mano.csv",
    "binaria",
    {
      objetivo: "baja",
      positivo: "si",
      unidadColumna: null,
      momentoColumna: null,
      momentoTexto: "hoy",
      ordenFecha: null,
    },
    tabla,
  );
  return a;
})();

describe("dos clases (a mano)", () => {
  const base = referencias5(BINARIA.tabla, BINARIA.previas)!;
  const ref = (id: string) => base.referencias.find((r) => r.id === id)!;

  it("nunca / siempre actuar: costo, exactitud balanceada y aciertos", () => {
    expect(base.referencias.map((r) => r.id)).toEqual([
      "nunca-actuar",
      "siempre-actuar",
    ]);
    // nunca: se pierden las 3 bajas (3 × 50) de 10; siempre: 7 llamadas de más (7 × 10)
    cierra(ref("nunca-actuar").costo, 15);
    cierra(ref("siempre-actuar").costo, 7);
    cierra(ref("nunca-actuar").metrica, 0.5);
    cierra(ref("siempre-actuar").metrica, 0.5);
    cierra(ref("nunca-actuar").aciertos!, 0.7);
    cierra(ref("siempre-actuar").aciertos!, 0.3);
    expect(base.mayoritaria).toBe("nunca-actuar");
    expect(base.filas).toHaveLength(10);
  });

  it("la regla «edad < 32» las acierta todas", () => {
    const d = datosEtapa5(
      BINARIA.tabla,
      regla({ columnas: ["edad"], operadores: ["<"], valores: ["32"] }),
      BINARIA.previas,
    );
    const c = d.chequeos;
    expect([c.regla_costo, c.regla_metrica, c.regla_aciertos]).toEqual([
      0, 1, 1,
    ]);
    expect([c.regla_cumple, c.regla_vacios]).toEqual([3, 0]);
    expect(c.regla_tipos).toEqual(["numero"]);
    // se guarda fija la salida de sí o no
    expect([d.respuestas.regla_si, d.respuestas.regla_no]).toEqual([
      ACTUAR,
      NO_ACTUAR,
    ]);
  });

  it.each([
    // [condiciones, unión, cumple, costo, balanceada, aciertos]
    ["edad < 42", [["edad", "<", "42"]], "", 5, 2, (1 + 5 / 7) / 2, 0.8],
    [
      "edad < 42 y plan = a",
      [
        ["edad", "<", "42"],
        ["plan", "=", "a"],
      ],
      "y",
      3,
      6,
      (2 / 3 + 6 / 7) / 2,
      0.8,
    ],
    [
      "edad < 27 o plan = b",
      [
        ["edad", "<", "27"],
        ["plan", "=", "b"],
      ],
      "o",
      7,
      4,
      (1 + 3 / 7) / 2,
      0.6,
    ],
  ] as const)(
    "%s",
    (_, condiciones, union, cumple, costo, balanceada, aciertos) => {
      const d = datosEtapa5(
        BINARIA.tabla,
        regla({
          columnas: condiciones.map((c) => c[0]),
          operadores: condiciones.map((c) => c[1]),
          valores: condiciones.map((c) => c[2]),
          union,
        }),
        BINARIA.previas,
      );
      expect(d.chequeos.regla_cumple).toBe(cumple);
      cierra(numero(d.chequeos, "regla_costo")!, costo);
      cierra(numero(d.chequeos, "regla_metrica")!, balanceada);
      cierra(numero(d.chequeos, "regla_aciertos")!, aciertos);
    },
  );

  it("sin regla no hay medida; con la regla a medias se cuenta lo que sí se sabe", () => {
    const sin = datosEtapa5(
      BINARIA.tabla,
      { ...ENTRADA_5_VACIA, regla: "ninguna" },
      BINARIA.previas,
    );
    expect(sin.chequeos.regla_costo).toBeNull();
    expect(sin.respuestas.regla_columnas).toEqual([]);
    const mal = datosEtapa5(
      BINARIA.tabla,
      regla({ columnas: ["edad"], operadores: ["<"], valores: ["1,5"] }),
      BINARIA.previas,
    );
    expect(mal.chequeos.regla_cumple).toBeNull();
    expect(mal.chequeos.regla_tipos).toEqual(["numero"]);
    const ausente = datosEtapa5(
      BINARIA.tabla,
      regla({ columnas: ["no-existe"], operadores: ["="], valores: ["a"] }),
      BINARIA.previas,
    );
    expect(ausente.chequeos.regla_tipos).toEqual(["ausente"]);
  });

  it("lo que se escribe se guarda normalizado: números canónicos, textos sin espacios, unión solo con dos", () => {
    const d = datosEtapa5(
      BINARIA.tabla,
      regla({
        columnas: ["edad", "plan"],
        operadores: ["<", "="],
        valores: ["42.0", " a "],
        union: "y",
      }),
      BINARIA.previas,
    );
    expect(d.respuestas.regla_valores).toEqual(["42", "a"]);
    const una = datosEtapa5(
      BINARIA.tabla,
      regla({
        columnas: ["edad"],
        operadores: ["<"],
        valores: ["42"],
        union: "y",
      }),
      BINARIA.previas,
    );
    expect(una.respuestas.regla_union).toBe("");
  });

  it("la referencia es la misma, con cualquier regla, y está guardada por tabla (misma identidad)", () => {
    expect(referencias5(BINARIA.tabla, BINARIA.previas)).toBe(base);
    expect(referencias5(BINARIA.tabla, { ...BINARIA.previas })).toBe(base);
  });
});

// --- varias clases, a mano ---------------------------------------------------------------
const MULTI = (() => {
  const filas = [
    ...Array(5).fill("a"),
    ...Array(3).fill("b"),
    ...Array(2).fill("c"),
  ];
  const tabla = csv(
    "x,z,plan",
    ...filas.map((p, i) => `${i % 4},${p === "a" ? "u" : "v"},${p}`),
  );
  const e1 = e1Con({
    forma: "multiclase",
    opciones: ["a", "b", "c"],
    costos: { a: 1, b: 4, c: 10 },
  });
  return armar4(
    "multi.csv",
    "multiclase",
    {
      objetivo: "plan",
      positivo: "",
      unidadColumna: null,
      momentoColumna: null,
      momentoTexto: "hoy",
      ordenFecha: null,
    },
    tabla,
    e1,
  );
})();

describe("varias clases (a mano)", () => {
  const base = referencias5(MULTI.tabla, MULTI.previas)!;
  const ref = (id: string) => base.referencias.find((r) => r.id === id)!;

  it("la clase más frecuente y la opción fija más barata con tus costos son dos filas distintas", () => {
    expect(base.referencias.map((r) => r.id)).toEqual([
      "clase-mayoritaria",
      "opcion-barata",
    ]);
    expect([base.claseMayoritaria, base.opcionBarata]).toEqual(["a", "c"]);
    // siempre «a»: fallan b (3 × 4) y c (2 × 10) de 10 → 3,2
    cierra(ref("clase-mayoritaria").costo, 3.2);
    // siempre «c»: fallan a (5 × 1) y b (3 × 4) de 10 → 1,7
    cierra(ref("opcion-barata").costo, 1.7);
    cierra(ref("clase-mayoritaria").metrica, 1 / 3);
    cierra(ref("clase-mayoritaria").aciertos!, 0.5);
    cierra(ref("opcion-barata").aciertos!, 0.2);
    expect(base.mayoritaria).toBe("clase-mayoritaria");
  });

  it("la regla elige una de tus opciones cuando se cumple y otra cuando no", () => {
    // z = u ⇔ plan a
    const d = datosEtapa5(
      MULTI.tabla,
      regla({
        columnas: ["z"],
        operadores: ["="],
        valores: ["u"],
        si: "a",
        no: "b",
      }),
      MULTI.previas,
    );
    // acierta las 5 «a» y las 3 «b»; las 2 «c» salen «b»: cuesta 2 × 10 de 10
    cierra(numero(d.chequeos, "regla_costo")!, 2);
    cierra(numero(d.chequeos, "regla_aciertos")!, 0.8);
    cierra(numero(d.chequeos, "regla_metrica")!, (1 + 1 + 0) / 3);
  });

  it("una opción que no es de la etapa 1 no se mide", () => {
    const d = datosEtapa5(
      MULTI.tabla,
      regla({
        columnas: ["z"],
        operadores: ["="],
        valores: ["u"],
        si: "a",
        no: "zzz",
      }),
      MULTI.previas,
    );
    expect(d.chequeos.regla_costo).toBeNull();
    expect(d.chequeos.regla_cumple).toBe(5);
  });

  it("si la opción más barata es también la más frecuente, hay una sola fila", () => {
    const e1 = e1Con({
      forma: "multiclase",
      opciones: ["a", "b", "c"],
      costos: { a: 5, b: 1, c: 1 },
    });
    const filas = [
      ...Array(5).fill("a"),
      ...Array(3).fill("b"),
      ...Array(2).fill("c"),
    ];
    const tabla = csv("x,plan", ...filas.map((p, i) => `${i},${p}`));
    const a = armar4(
      "unica.csv",
      "multiclase",
      {
        objetivo: "plan",
        positivo: "",
        unidadColumna: null,
        momentoColumna: null,
        momentoTexto: "hoy",
        ordenFecha: null,
      },
      tabla,
      e1,
    );
    const b = referencias5(a.tabla, a.previas)!;
    expect(b.referencias.map((r) => r.id)).toEqual(["clase-mayoritaria"]);
    expect(b.opcionBarata).toBe("a");
  });
});

// --- un número, a mano ---------------------------------------------------------------
function numerica(cSub: number, cSobre: number) {
  const y = [1, 2, 3, 4, 10, 1, 2, 3, 4, 10, 1, 2, 3, 4, 10, 1, 2, 3, 4, 10];
  const tabla = csv(
    "x,valor",
    ...y.map((v, i) => `${i % 5 === 0 ? "alto" : "bajo"},${v}`),
  );
  return armar4(
    "num.csv",
    "numerica",
    {
      objetivo: "valor",
      positivo: "",
      unidadColumna: null,
      momentoColumna: null,
      momentoTexto: "hoy",
      ordenFecha: null,
    },
    tabla,
    e1Con({ forma: "numerica", c_sub: cSub, c_sobre: cSobre }),
  );
}

describe("un número (a mano)", () => {
  it("mediana, media y el cuantil de tus costos; el último valor no está sin unidad ni fecha", () => {
    const a = numerica(3, 1);
    const base = referencias5(a.tabla, a.previas)!;
    expect(base.referencias.map((r) => r.id)).toEqual([
      "mediana",
      "media",
      "cuantil",
    ]);
    const ref = (id: string) => base.referencias.find((r) => r.id === id)!;
    cierra(ref("mediana").costo, 5.4);
    cierra(ref("mediana").metrica, 2.2);
    cierra(ref("media").costo, 4.8);
    cierra(ref("media").metrica, 2.4);
    // el cuantil 0,75 de [1, 2, 3, 4, 10] es 4: coincide con la media en este conjunto
    cierra(ref("cuantil").costo, 4.8);
    expect(ref("mediana").aciertos).toBeNull();
    expect(base.mayoritaria).toBeNull();
    expect(base.nSinAnterior).toBeNull();
  });

  it("con costos iguales no hay cuantil aparte: es la mediana", () => {
    const a = numerica(2, 2);
    const base = referencias5(a.tabla, a.previas)!;
    expect(base.referencias.map((r) => r.id)).toEqual(["mediana", "media"]);
  });

  it("la regla estima un número cuando se cumple y otro cuando no", () => {
    const a = numerica(3, 1);
    const d = datosEtapa5(
      a.tabla,
      regla({
        columnas: ["x"],
        operadores: ["="],
        valores: ["alto"],
        si: "1",
        no: "4.0",
      }),
      a.previas,
    );
    expect(d.respuestas.regla_no).toBe("4");
    expect(d.chequeos.regla_cumple).toBe(4);
    expect(numero(d.chequeos, "regla_costo")).not.toBeNull();
    expect(d.chequeos.regla_aciertos).toBeNull();
    // un número mal escrito no se mide
    const mal = datosEtapa5(
      a.tabla,
      regla({
        columnas: ["x"],
        operadores: ["="],
        valores: ["alto"],
        si: "1,5",
        no: "4",
      }),
      a.previas,
    );
    expect(mal.chequeos.regla_costo).toBeNull();
  });
});

describe("último valor por unidad (a mano)", () => {
  // A: ene 1, feb 5, mar 9 · B: ene 2, mar 6 · C: ene 7 (su única fila)
  const tabla = csv(
    "u,mes,valor",
    "A,2025-01-15,1",
    "A,2025-02-15,5",
    "A,2025-03-15,9",
    "B,2025-01-15,2",
    "B,2025-03-15,6",
    "C,2025-01-15,7",
  );
  const a = armar4(
    "ult.csv",
    "numerica",
    {
      objetivo: "valor",
      positivo: "",
      unidadColumna: "u",
      momentoColumna: "mes",
      momentoTexto: "",
      ordenFecha: null,
    },
    tabla,
    e1Con({ forma: "numerica", c_sub: 1, c_sobre: 1 }),
  );

  it("cada fila predice con el valor anterior de su unidad; la primera de cada una usa la mediana y se cuenta", () => {
    const base = referencias5(a.tabla, a.previas)!;
    const ultimo = base.referencias.find((r) => r.id === "ultimo-valor")!;
    // mediana de [1, 5, 9, 2, 6, 7] = 5,5 · errores: 4,5 · 4 · 4 · 3,5 · 4 · 1,5
    cierra(ultimo.metrica, 21.5 / 6);
    expect(base.nSinAnterior).toBe(3);
  });

  it("no existe si ninguna unidad se repite", () => {
    const sola = csv(
      "u,mes,valor",
      "A,2025-01-15,1",
      "B,2025-02-15,2",
      "C,2025-03-15,3",
    );
    const b = armar4(
      "sola.csv",
      "numerica",
      {
        objetivo: "valor",
        positivo: "",
        unidadColumna: "u",
        momentoColumna: "mes",
        momentoTexto: "",
        ordenFecha: null,
      },
      sola,
      e1Con({ forma: "numerica", c_sub: 1, c_sobre: 1 }),
    );
    expect(
      referencias5(b.tabla, b.previas)!.referencias.map((r) => r.id),
    ).toEqual(["mediana", "media"]);
  });

  it("con varias filas el mismo día toma la última de ese día, y no usa filas del mismo día como anterior", () => {
    const t = csv(
      "u,mes,valor",
      "A,2025-01-15,1",
      "A,2025-01-15,2",
      "A,2025-02-15,10",
    );
    const b = armar4(
      "dia.csv",
      "numerica",
      {
        objetivo: "valor",
        positivo: "",
        unidadColumna: "u",
        momentoColumna: "mes",
        momentoTexto: "",
        ordenFecha: null,
      },
      t,
      e1Con({ forma: "numerica", c_sub: 1, c_sobre: 1 }),
    );
    const base = referencias5(b.tabla, b.previas)!;
    // mediana de [1, 2, 10] = 2: las dos del 15-ene usan 2 (error 1 y 0); la de febrero, el último del 15-ene = 2 (error 8)
    cierra(
      base.referencias.find((r) => r.id === "ultimo-valor")!.metrica,
      9 / 3,
    );
    expect(base.nSinAnterior).toBe(2);
  });
});

// --- el kit: las referencias coinciden con lo que la etapa 2 ya calculó -----------------------
describe("sobre el kit de prueba, coinciden con los costos de la etapa 2", () => {
  it("credito (dos clases): nunca y siempre actuar son los costos de no hacer nada", () => {
    const a = armar4("credito-fuga-plantada.csv", "binaria", ENTRADA_CREDITO);
    const c2 = a.previas[2]!.chequeos;
    const base = referencias5(a.tabla, a.previas)!;
    const costo = (id: string) =>
      base.referencias.find((r) => r.id === id)!.costo;
    cierra(costo("nunca-actuar"), numero(c2, "costo_nunca_actuar")!);
    cierra(costo("siempre-actuar"), numero(c2, "costo_siempre_actuar")!);
    // la más frecuente es «no actuar» si la tasa base está bajo la mitad
    expect(base.mayoritaria).toBe(
      numero(c2, "tasa_base")! > 0.5 ? "siempre-actuar" : "nunca-actuar",
    );
    expect(base.filas).toHaveLength(numero(c2, "filas_utiles")!);
  });

  it("planes (varias clases): la clase más frecuente cuesta lo que dice la etapa 2", () => {
    const a = armar4("planes-fuga-plantada.csv", "multiclase", {
      ...ENTRADA_CREDITO,
      objetivo: "plan",
      positivo: "",
    });
    const c2 = a.previas[2]!.chequeos;
    const base = referencias5(a.tabla, a.previas)!;
    const mayoritaria = base.referencias.find(
      (r) => r.id === "clase-mayoritaria",
    )!;
    cierra(mayoritaria.costo, numero(c2, "costo_mayoria")!);
    expect(base.claseMayoritaria).toBe(texto(c2, "clase_mayoritaria"));
    cierra(mayoritaria.aciertos!, numero(c2, "mayoritaria")!);
    // la opción fija más barata nunca cuesta más que la más frecuente
    const barata = base.referencias.find((r) => r.id === "opcion-barata");
    if (barata) expect(barata.costo).toBeLessThanOrEqual(mayoritaria.costo);
  });

  it("precio (un número): el cuantil de tus costos cuesta lo que dice la etapa 2", () => {
    const a = armar4("precio-fuga-plantada.csv", "numerica", {
      ...ENTRADA_CREDITO,
      objetivo: "precio_usd",
      positivo: "",
    });
    const base = referencias5(a.tabla, a.previas)!;
    const r1 = a.previas[1]!.respuestas;
    const esperado = costoConstante(
      numerosDe(a.tabla, "precio_usd"),
      numero(r1, "c_sub")!,
      numero(r1, "c_sobre")!,
    );
    const cuantil = base.referencias.find((r) => r.id === "cuantil")!;
    cierra(cuantil.costo, esperado);
    cierra(cuantil.costo, numero(a.previas[2]!.chequeos, "costo_constante")!);
    // y ninguna otra constante lo mejora (el cuantil es el óptimo para esa pérdida)
    for (const r of base.referencias.filter((x) => x.id !== "ultimo-valor"))
      expect(cuantil.costo).toBeLessThanOrEqual(r.costo + 1e-9);
  });

  it("renovaciones (un número, con unidad repetida y fecha): aparece el último valor por unidad", () => {
    const a = armar4("renovaciones-mensuales.csv", "numerica", {
      objetivo: "uso_mensual_gb",
      positivo: "",
      unidadColumna: "cliente_id",
      momentoColumna: "mes_observado",
      momentoTexto: "",
      ordenFecha: null,
    });
    const base = referencias5(a.tabla, a.previas)!;
    expect(base.referencias.map((r) => r.id)).toContain("ultimo-valor");
    const unidades = numero(a.previas[2]!.chequeos, "unidades")!;
    // por lo menos la primera fila de cada unidad usa la mediana
    expect(base.nSinAnterior).toBeGreaterThanOrEqual(unidades);
    expect(base.nSinAnterior).toBeLessThan(base.filas.length);
  });

  it("bajas (dos clases, con unidad y fecha): no hay «último valor», eso es de un número", () => {
    const a = armar4("bajas-con-fuga.csv", "binaria", ENTRADA_BAJAS);
    const base = referencias5(a.tabla, a.previas)!;
    expect(base.referencias.map((r) => r.id)).toEqual([
      "nunca-actuar",
      "siempre-actuar",
    ]);
    expect(base.nSinAnterior).toBeNull();
  });
});

// --- hostiles -------------------------------------------------------------------------
describe("nombres hostiles", () => {
  it("una columna llamada «constructor» o «toString» se usa en una regla sin tropezar", () => {
    const tabla = csv(
      "constructor,toString,baja",
      "1,a,si",
      "2,a,si",
      "3,b,no",
      "4,b,no",
      "5,b,no",
      "6,a,no",
    );
    const a = armar4(
      "hostil.csv",
      "binaria",
      {
        objetivo: "baja",
        positivo: "si",
        unidadColumna: null,
        momentoColumna: null,
        momentoTexto: "hoy",
        ordenFecha: null,
      },
      tabla,
    );
    const d = datosEtapa5(
      a.tabla,
      regla({
        columnas: ["constructor", "toString"],
        operadores: ["<", "="],
        valores: ["3", "a"],
        union: "y",
      }),
      a.previas,
    );
    expect(d.chequeos.regla_cumple).toBe(2);
    expect(vistaDe(a.tabla, "__proto__")).toBeNull();
    expect(valoresDeColumna(a.tabla, "toString")).toEqual({
      valores: ["a", "b"],
      distintos: 2,
    });
    expect(valoresDeColumna(a.tabla, "constructor")).toBeNull();
  });
});

// --- criterio, forma de lo registrado y trampas (sobre un crédito real) ------------------------
const CREDITO = armar4("credito-fuga-plantada.csv", "binaria", ENTRADA_CREDITO);
const BUENA = regla({
  columnas: ["ingreso_mensual"],
  operadores: ["<"],
  valores: ["3000"],
});

function honesta(entrada: EntradaEtapa5 = BUENA) {
  return datosEtapa5(CREDITO.tabla, entrada, CREDITO.previas);
}

describe("el criterio de salida", () => {
  it("una regla bien escrita cumple; «no hay regla» también", () => {
    expect(criterio(honesta(), CREDITO.previas)).toEqual({ tipo: "cumple" });
    expect(
      criterio(
        honesta({ ...ENTRADA_5_VACIA, regla: "ninguna" }),
        CREDITO.previas,
      ),
    ).toEqual({ tipo: "cumple" });
  });

  it("sin haber elegido nada, falta la regla", () => {
    expect(criterio(honesta(ENTRADA_5_VACIA), CREDITO.previas)).toEqual({
      tipo: "falta",
      faltan: ["regla"],
    });
  });

  it.each<[string, Partial<EntradaEtapa5>, string]>([
    [
      "sin condiciones",
      { columnas: [], operadores: [], valores: [] },
      "regla-condicion",
    ],
    [
      "una condición a medias (sin valor)",
      { columnas: ["ingreso_mensual"], operadores: ["<"], valores: [""] },
      "regla-condicion",
    ],
    [
      "una columna que la etapa 4 excluyó (la fuga)",
      { columnas: ["monto_recuperado"], operadores: ["<"], valores: ["10"] },
      "regla-columna",
    ],
    [
      "una columna que no existe",
      { columnas: ["no_existe"], operadores: ["="], valores: ["a"] },
      "regla-columna",
    ],
    [
      "un operador de número en una columna de texto",
      { columnas: ["empleo"], operadores: ["<"], valores: ["informal"] },
      "regla-operador",
    ],
    [
      "un número mal escrito",
      {
        columnas: ["ingreso_mensual"],
        operadores: ["<"],
        valores: ["3.000,5"],
      },
      "regla-valor",
    ],
    [
      "dos condiciones sin unión",
      {
        columnas: ["ingreso_mensual", "empleo"],
        operadores: ["<", "="],
        valores: ["3000", "informal"],
        union: "",
      },
      "regla-union",
    ],
  ])("%s", (_, extra, falta) => {
    const datos = honesta(regla(extra));
    const v = criterio(datos, CREDITO.previas);
    expect(v.tipo).toBe("falta");
    expect(v.tipo === "falta" && v.faltan).toContain(falta);
  });

  it("la columna es de «usar» solo si la etapa 4 la dejó así: las excluidas no cuentan", () => {
    // sin la etapa 4, la etapa 5 ni empieza
    const sin4: Previas = {
      1: CREDITO.previas[1]!,
      2: CREDITO.previas[2]!,
      3: CREDITO.previas[3]!,
    };
    expect(criterio(honesta(), sin4)).toEqual({
      tipo: "falta",
      faltan: ["etapas-previas"],
    });
  });

  it("las referencias tienen que estar: las que faltan, las de otra forma y las repetidas", () => {
    const base = honesta();
    const con = (c: Record<string, unknown>): DatosEtapa => ({
      respuestas: base.respuestas,
      chequeos: { ...base.chequeos, ...c } as DatosEtapa["chequeos"],
    });
    for (const malo of [
      con({ base_ids: [] }),
      con({ base_ids: ["nunca-actuar"] }),
      con({ base_ids: ["nunca-actuar", "siempre-actuar", "mediana"] }),
      con({ base_ids: ["nunca-actuar", "siempre-actuar", "siempre-actuar"] }),
      con({ base_costo: {} }),
    ]) {
      const v = criterio(malo, CREDITO.previas);
      expect(v.tipo === "falta" && v.faltan).toContain("referencias");
    }
  });

  it("una regla sin medida registrada (nunca debería pasar) tampoco cumple", () => {
    const base = honesta();
    const v = criterio(
      {
        respuestas: base.respuestas,
        chequeos: { ...base.chequeos, regla_costo: null },
      },
      CREDITO.previas,
    );
    expect(v).toEqual({ tipo: "falta", faltan: ["regla-medida"] });
  });

  it("«no hay regla» con restos de una regla no cumple", () => {
    const base = honesta({ ...ENTRADA_5_VACIA, regla: "ninguna" });
    const v = criterio(
      {
        respuestas: { ...base.respuestas, regla_si: "actuar" },
        chequeos: base.chequeos,
      },
      CREDITO.previas,
    );
    expect(v.tipo === "falta" && v.faltan).toEqual(["regla-condicion"]);
  });

  it("en varias clases y en un número se piden las salidas de esa forma", () => {
    const d = datosEtapa5(
      MULTI.tabla,
      regla({
        columnas: ["x"],
        operadores: ["<"],
        valores: ["2"],
        si: "a",
        no: "zzz",
      }),
      MULTI.previas,
    );
    const v = criterio(d, MULTI.previas);
    expect(v.tipo === "falta" && v.faltan).toContain("regla-salida");
    const ok = datosEtapa5(
      MULTI.tabla,
      regla({
        columnas: ["x"],
        operadores: ["<"],
        valores: ["2"],
        si: "a",
        no: "b",
      }),
      MULTI.previas,
    );
    expect(criterio(ok, MULTI.previas)).toEqual({ tipo: "cumple" });
    const num = numerica(3, 1);
    const malo = datosEtapa5(
      num.tabla,
      regla({
        columnas: ["x"],
        operadores: ["="],
        valores: ["alto"],
        si: "",
        no: "4",
      }),
      num.previas,
    );
    expect(criterio(malo, num.previas).tipo).toBe("falta");
  });
});

describe("la forma de lo registrado", () => {
  const ok = honesta();
  const leer = (r: Record<string, unknown>, c: Record<string, unknown> = {}) =>
    ETAPA_5.leer({
      respuestas: { ...ok.respuestas, ...r } as DatosEtapa["respuestas"],
      chequeos: { ...ok.chequeos, ...c } as DatosEtapa["chequeos"],
    });

  it("lo honesto se lee", () => {
    expect(ETAPA_5.leer(ok)).toEqual({ ok: true });
    expect(ETAPA_5.leer(honesta(ENTRADA_5_VACIA))).toEqual({ ok: true });
  });

  it.each<[string, Record<string, unknown>, Record<string, unknown>, string]>([
    ["una regla desconocida", { regla: "quizá" }, {}, "respuestas.regla"],
    [
      "las listas desalineadas",
      { regla_valores: ["1", "2"] },
      {},
      "respuestas.regla_valores",
    ],
    [
      "tres condiciones",
      {
        regla_columnas: ["a", "b", "c"],
        regla_operadores: ["<", "<", "<"],
        regla_valores: ["1", "2", "3"],
      },
      {},
      "respuestas.regla_columnas",
    ],
    [
      "una unión inventada",
      { regla_union: "xor" },
      {},
      "respuestas.regla_union",
    ],
    ["una salida que no es texto", { regla_si: 5 }, {}, "respuestas.regla_si"],
    [
      "un valor larguísimo",
      { regla_valores: ["x".repeat(101)] },
      {},
      "respuestas.regla_valores",
    ],
    [
      "una lista con números",
      { regla_columnas: [1] },
      {},
      "respuestas.regla_columnas",
    ],
    ["un chequeo sin lista", {}, { base_ids: "x" }, "chequeos.base_ids"],
    [
      "un mapa con texto",
      {},
      { base_costo: { a: "x" } },
      "chequeos.base_costo",
    ],
    [
      "un chequeo que no es número",
      {},
      { regla_costo: "5" },
      "chequeos.regla_costo",
    ],
    ["una clave que no existe", {}, { inventada: 1 }, "chequeos.inventada"],
    [
      "una mayoritaria que no es texto",
      {},
      { base_mayoritaria: 4 },
      "chequeos.base_mayoritaria",
    ],
  ])("%s", (_, r, c, campo) => {
    expect(leer(r, c)).toEqual({ ok: false, campo });
  });

  it("falta una respuesta o un chequeo", () => {
    const sin = (obj: Record<string, unknown>, clave: string) =>
      Object.fromEntries(Object.entries(obj).filter(([k]) => k !== clave));
    const sinNo = sin(ok.respuestas, "regla_no") as DatosEtapa["respuestas"];
    expect(ETAPA_5.leer({ respuestas: sinNo, chequeos: ok.chequeos })).toEqual({
      ok: false,
      campo: "respuestas.regla_no",
    });
    const sinFilas = sin(ok.chequeos, "filas") as DatosEtapa["chequeos"];
    expect(
      ETAPA_5.leer({ respuestas: ok.respuestas, chequeos: sinFilas }),
    ).toEqual({
      ok: false,
      campo: "chequeos.filas",
    });
  });
});

describe("las trampas, en los números del usuario", () => {
  const claves = (d: DatosEtapa, p: Previas = CREDITO.previas) =>
    ETAPA_5.trampas(d, p).map((t) => t.clave);

  it("dice cuánto acierta ya la clase más frecuente, y el costo de la regla de hoy por cada 100", () => {
    const d = honesta();
    const trampas = ETAPA_5.trampas(d, CREDITO.previas);
    expect(trampas.map((t) => t.clave)).toEqual(
      expect.arrayContaining(["mayoritaria", "regla"]),
    );
    const mayor = trampas.find((t) => t.clave === "mayoritaria")!;
    const base = referencias5(CREDITO.tabla, CREDITO.previas)!;
    const acierto = base.referencias.find(
      (r) => r.id === base.mayoritaria,
    )!.aciertos!;
    expect(mayor.params).toEqual({ aciertosPct: acierto });
    const costo = trampas.find((t) => t.clave === "regla")!;
    cierra(
      costo.params.regla100 as number,
      numero(d.chequeos, "regla_costo")! * 100,
    );
    expect(costo.params.unidad).toBe("US$");
  });

  it("compara la regla con la mejor referencia sin modelo: peor, mejor o igual", () => {
    // una regla que acierta todo (en la tabla a mano)
    const mejor = datosEtapa5(
      BINARIA.tabla,
      regla({ columnas: ["edad"], operadores: ["<"], valores: ["32"] }),
      BINARIA.previas,
    );
    expect(claves(mejor, BINARIA.previas)).toContain("regla-mejor");
    // una que actúa con todos: igual que «siempre actuar»
    const igual = datosEtapa5(
      BINARIA.tabla,
      regla({ columnas: ["edad"], operadores: [">="], valores: ["0"] }),
      BINARIA.previas,
    );
    expect(claves(igual, BINARIA.previas)).toContain("regla-igual");
    // una que actúa con quienes no hay que actuar y con nadie más: peor que no hacer nada
    const peor = datosEtapa5(
      BINARIA.tabla,
      regla({ columnas: ["edad"], operadores: [">"], valores: ["32"] }),
      BINARIA.previas,
    );
    expect(claves(peor, BINARIA.previas)).toContain("regla-peor");
  });

  it("sin regla dice contra qué competirá el modelo", () => {
    const d = honesta({ ...ENTRADA_5_VACIA, regla: "ninguna" });
    const t = ETAPA_5.trampas(d, CREDITO.previas).find(
      (x) => x.clave === "sin-regla",
    )!;
    const base = referencias5(CREDITO.tabla, CREDITO.previas)!;
    cierra(
      t.params.mejor100 as number,
      Math.min(...base.referencias.map((r) => r.costo)) * 100,
    );
  });

  it("en un número habla del error medio de la mediana; con unidad, de las filas sin anterior", () => {
    const a = numerica(3, 1);
    const d = datosEtapa5(
      a.tabla,
      { ...ENTRADA_5_VACIA, regla: "ninguna" },
      a.previas,
    );
    const t = ETAPA_5.trampas(d, a.previas);
    expect(t.map((x) => x.clave)).toEqual(["mediana", "sin-regla"]);
    cierra(t[0]!.params.error as number, 2.2);
  });

  it("cada frase que el motor puede decir está declarada (para su texto y su paridad)", () => {
    const dichas = new Set<string>();
    for (const [d, p] of [
      [honesta(), CREDITO.previas],
      [honesta({ ...ENTRADA_5_VACIA, regla: "ninguna" }), CREDITO.previas],
      [
        datosEtapa5(
          BINARIA.tabla,
          regla({ columnas: ["edad"], operadores: ["<"], valores: ["32"] }),
          BINARIA.previas,
        ),
        BINARIA.previas,
      ],
      [
        datosEtapa5(
          BINARIA.tabla,
          regla({ columnas: ["edad"], operadores: [">="], valores: ["0"] }),
          BINARIA.previas,
        ),
        BINARIA.previas,
      ],
      [
        datosEtapa5(
          BINARIA.tabla,
          regla({ columnas: ["edad"], operadores: [">"], valores: ["32"] }),
          BINARIA.previas,
        ),
        BINARIA.previas,
      ],
      [
        datosEtapa5(
          numerica(3, 1).tabla,
          { ...ENTRADA_5_VACIA, regla: "ninguna" },
          numerica(3, 1).previas,
        ),
        numerica(3, 1).previas,
      ],
    ] as const)
      for (const t of ETAPA_5.trampas(d, p)) dichas.add(t.clave);
    // «sin-anterior» sale en el cuaderno con unidad y fecha (ver arriba)
    dichas.add("sin-anterior");
    expect([...dichas].sort()).toEqual([...TRAMPAS_5].sort());
  });

  it("sin referencias no dice nada", () => {
    const vacio = datosEtapa5(CREDITO.tabla, ENTRADA_5_VACIA, {});
    expect(ETAPA_5.trampas(vacio, CREDITO.previas)).toEqual([]);
  });
});

describe("la compuerta", () => {
  it("registra con la compuerta real una regla bien escrita y rechaza la que usa una columna excluida", () => {
    const contexto = { huella: HUELLA, tabla: CREDITO.tabla, ahora: AHORA };
    const bien = registrar(
      PROTOCOLO5,
      CREDITO.cuaderno,
      5,
      honesta(),
      contexto,
    );
    expect(bien.ok).toBe(true);
    const mal = registrar(
      PROTOCOLO5,
      CREDITO.cuaderno,
      5,
      honesta(
        regla({
          columnas: ["monto_recuperado"],
          operadores: [">"],
          valores: ["0"],
        }),
      ),
      contexto,
    );
    expect(mal.ok).toBe(false);
    expect(!mal.ok && mal.rechazo).toMatchObject({
      tipo: "criterio-no-cumplido",
      faltan: ["regla-columna"],
    });
  });

  it("recalcular da lo mismo que lo registrado, y las claves están declaradas", () => {
    const d = honesta();
    expect(ETAPA_5.recalcular!(d, CREDITO.previas, CREDITO.tabla)).toEqual(d);
    expect(Object.keys(d.respuestas)).toEqual([...CLAVES_5.respuestas]);
    expect(Object.keys(d.chequeos)).toEqual([...CLAVES_5.chequeos]);
    expect(lista(d.chequeos, "base_ids")).toEqual([
      "nunca-actuar",
      "siempre-actuar",
    ]);
    expect(mapa(d.chequeos, "base_costo")).not.toBeNull();
  });

  it("el kit de crédito sin el crédito cargado: la tabla distinta cambia las referencias", () => {
    const otra = tablaKit("credito-fuga-plantada.csv");
    expect(referencias5(otra, CREDITO.previas)).not.toBe(
      referencias5(CREDITO.tabla, CREDITO.previas),
    );
  });
});
