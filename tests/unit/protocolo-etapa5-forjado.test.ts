// Protocolo DS (S10), etapa 5: un cuaderno editado a mano no gana nada. Las referencias sin modelo y
// la medida de la regla de hoy salen de la TABLA; la compuerta las vuelve a calcular y, si no
// coinciden con lo registrado, la etapa vuelve a «por verificar» y la 6 no abre. Se prueba por el
// camino del usuario: exportar el `.protocolo.json`, editarlo y leerlo de nuevo. Lo que NO se puede
// detectar —que la regla escrita sea de verdad la que usa la gente— lo dice el usuario: declarado.
import { describe, expect, it } from "vitest";
import { evaluar, registrar } from "@/engine/protocolo/compuerta";
import type { Cuaderno } from "@/engine/protocolo/cuaderno";
import {
  ENTRADA_5_VACIA,
  datosEtapa5,
  type EntradaEtapa5,
} from "@/engine/protocolo/etapa5";
import { empaquetar, leerArchivo } from "@/lib/protocolo/archivo";
import {
  AHORA,
  ENTRADA_CREDITO,
  HUELLA,
  PROTOCOLO5,
  armar4,
} from "./protocolo-etapa4-helpers";

const CREDITO = armar4("credito-fuga-plantada.csv", "binaria", ENTRADA_CREDITO);
const contexto = { huella: HUELLA, tabla: CREDITO.tabla, ahora: AHORA };
const REGLA: EntradaEtapa5 = {
  ...ENTRADA_5_VACIA,
  regla: "hay",
  columnas: ["ingreso_mensual"],
  operadores: ["<"],
  valores: ["3000"],
};

function registrada(entrada: EntradaEtapa5 = REGLA): Cuaderno {
  const r = registrar(
    PROTOCOLO5,
    CREDITO.cuaderno,
    5,
    datosEtapa5(CREDITO.tabla, entrada, CREDITO.previas),
    contexto,
  );
  if (!r.ok) throw new Error(JSON.stringify(r.rechazo));
  return r.cuaderno;
}

type Archivo = { cuaderno: Cuaderno };
type Mutable = Record<string, unknown>;

function etapa5(archivo: Archivo): { r: Mutable; c: Mutable } {
  const ev = archivo.cuaderno.evidencias.findLast((e) => e.etapa === 5);
  if (!ev) throw new Error("falta la evidencia de la etapa 5");
  return { r: ev.datos.respuestas as Mutable, c: ev.datos.chequeos as Mutable };
}

function importado(
  cuaderno: Cuaderno,
  editar: (archivo: Archivo) => void = () => undefined,
): Cuaderno {
  const archivo = JSON.parse(empaquetar(cuaderno, AHORA)) as Archivo;
  editar(archivo);
  const lectura = leerArchivo(JSON.stringify(archivo), PROTOCOLO5);
  if (!lectura.ok) throw new Error(JSON.stringify(lectura.rechazo));
  return lectura.cuaderno;
}

function estados(cuaderno: Cuaderno) {
  return evaluar(PROTOCOLO5, cuaderno, HUELLA, CREDITO.tabla)
    .slice(0, 6)
    .map((e) => e.estado.tipo);
}

const NO_CUADRA = [
  "cumplida",
  "cumplida",
  "cumplida",
  "cumplida",
  "por-verificar",
  "no-construida",
];

describe("la etapa 5 de un cuaderno editado a mano no gana nada", () => {
  it("el cuaderno honesto, exportado e importado, sigue cumplido (el ida y vuelta no lo rompe)", () => {
    expect(estados(importado(registrada()))).toEqual([
      "cumplida",
      "cumplida",
      "cumplida",
      "cumplida",
      "cumplida",
      "no-construida",
    ]);
    expect(
      estados(importado(registrada({ ...ENTRADA_5_VACIA, regla: "ninguna" }))),
    ).toEqual([
      "cumplida",
      "cumplida",
      "cumplida",
      "cumplida",
      "cumplida",
      "no-construida",
    ]);
  });

  it("un baseline inventado: «nunca actuar» más barato de lo que la tabla da", () => {
    const editado = importado(registrada(), (archivo) => {
      const { c } = etapa5(archivo);
      c.base_costo = { ...(c.base_costo as Mutable), "nunca-actuar": 0.01 };
    });
    expect(estados(editado)).toEqual(NO_CUADRA);
    const evaluadas = evaluar(PROTOCOLO5, editado, HUELLA, CREDITO.tabla);
    expect(evaluadas[4]?.estado).toMatchObject({
      tipo: "por-verificar",
      motivo: "no-cuadra",
    });
  });

  it.each<[string, (archivo: Archivo) => void]>([
    [
      "una exactitud de la clase más frecuente inventada",
      (a) => {
        const { c } = etapa5(a);
        c.base_aciertos = {
          ...(c.base_aciertos as Mutable),
          "nunca-actuar": 0.99,
        };
      },
    ],
    [
      "la métrica estándar inventada",
      (a) => {
        const { c } = etapa5(a);
        c.base_metrica = {
          ...(c.base_metrica as Mutable),
          "siempre-actuar": 0.9,
        };
      },
    ],
    [
      "una referencia de más (la mediana, que es de un número)",
      (a) => {
        const { c } = etapa5(a);
        c.base_ids = [...(c.base_ids as string[]), "mediana"];
        c.base_costo = { ...(c.base_costo as Mutable), mediana: 0 };
      },
    ],
    [
      "la regla de hoy medida a mano: un costo más bajo",
      (a) => {
        etapa5(a).c.regla_costo = 0;
      },
    ],
    [
      "la regla de hoy medida a mano: más filas que la cumplen",
      (a) => {
        etapa5(a).c.regla_cumple = 1;
      },
    ],
    [
      "un conteo de filas distinto",
      (a) => {
        etapa5(a).c.filas = 5000;
      },
    ],
    [
      "la clase más frecuente cambiada",
      (a) => {
        etapa5(a).c.base_mayoritaria = "siempre-actuar";
      },
    ],
  ])("%s: la etapa 5 vuelve a «por verificar»", (_, editar) => {
    const editado = importado(registrada(), editar);
    expect(estados(editado)).toEqual(NO_CUADRA);
    const evaluadas = evaluar(PROTOCOLO5, editado, HUELLA, CREDITO.tabla);
    expect(evaluadas[4]?.estado).toMatchObject({
      tipo: "por-verificar",
      motivo: "no-cuadra",
    });
  });

  it("una regla que usa una columna que la etapa 4 excluyó, con las medidas recalculadas, no cumple", () => {
    // El archivo se edita con una medida HONESTA de la regla prohibida (monto_recuperado es la fuga):
    // los chequeos cuadran con la tabla, y lo que la frena es el criterio, no el recalculo.
    const prohibida: EntradaEtapa5 = {
      ...REGLA,
      columnas: ["monto_recuperado"],
      valores: ["100"],
    };
    const hecha = datosEtapa5(CREDITO.tabla, prohibida, CREDITO.previas);
    const editado = importado(registrada(), (archivo) => {
      const { r, c } = etapa5(archivo);
      Object.assign(r, hecha.respuestas);
      Object.assign(c, hecha.chequeos);
    });
    const evaluadas = evaluar(PROTOCOLO5, editado, HUELLA, CREDITO.tabla);
    expect(evaluadas[4]?.estado).toMatchObject({
      tipo: "abierta",
      faltan: ["regla-columna"],
    });
    expect(evaluadas[5]?.estado.tipo).toBe("no-construida");
  });

  it("registrar no confía en los chequeos que le llegan: los vuelve a calcular", () => {
    const honestos = datosEtapa5(CREDITO.tabla, REGLA, CREDITO.previas);
    const r = registrar(
      PROTOCOLO5,
      CREDITO.cuaderno,
      5,
      {
        respuestas: honestos.respuestas,
        chequeos: {
          ...honestos.chequeos,
          base_costo: { "nunca-actuar": 0, "siempre-actuar": 0 },
        },
      },
      contexto,
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.rechazo).toMatchObject({
      tipo: "datos-invalidos",
      campo: "chequeos",
    });
  });

  it("con otro archivo cargado (otra huella), la etapa 5 se re-verifica", () => {
    const evaluadas = evaluar(PROTOCOLO5, registrada(), "a".repeat(64), null);
    // la primera que depende de los datos (la 2) pide verificar, y la 5 queda cerrada por ella
    expect(evaluadas[1]?.estado).toMatchObject({
      tipo: "por-verificar",
      motivo: "datos-distintos",
    });
    expect(evaluadas[4]?.estado).toMatchObject({ tipo: "cerrada", bloquea: 2 });
  });

  it("lo que ninguna compuerta ve: la regla escrita puede no ser la que usa la gente (se declara)", () => {
    // Dos reglas distintas, ambas bien escritas y medidas, son igual de válidas para la compuerta.
    const otra: EntradaEtapa5 = { ...REGLA, valores: ["1000"] };
    expect(estados(registrada(otra))).toEqual([
      "cumplida",
      "cumplida",
      "cumplida",
      "cumplida",
      "cumplida",
      "no-construida",
    ]);
  });
});
