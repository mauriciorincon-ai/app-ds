// Protocolo DS (S15), etapa 10 — la ficha del modelo, armada SOLO con lo que el cuaderno registró (el crédito
// por la compuerta real hasta la 10). Lo que tiene que valer:
//  · cada línea derivada cita su etapa, su fecha y su huella; lo que escribió el dueño va rotulado como suyo;
//  · «Lo que este modelo cumplió», compuerta por compuerta: sin fuga (4), partición y sello (6), la línea base
//    (5), frente a ella (7), la señal por permutación (7), la incertidumbre y la calibración (8);
//  · «usar» trae el plan de vigilancia (columnas, umbrales de la etapa 4, piso, cadencia y quién responde);
//    «no usar» e «iterar», qué cambiar en palabras del dueño, sin plan;
//  · PRUEBA NEGATIVA: ni una fila del CSV ni un valor individual de una columna de muchos valores;
//  · sin alguna de las diez evidencias no hay ficha.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluar } from "@/engine/protocolo/compuerta";
import type { Cuaderno } from "@/engine/protocolo/cuaderno";
import {
  armarFicha,
  cargaDe,
  evidenciasCumplidas,
  type Ficha,
  type LineaFicha,
} from "@/engine/protocolo/ficha";
import type { EntradaEtapa10 } from "@/engine/protocolo/etapa10";
import type { Armado } from "./protocolo-etapa4-helpers";
import {
  AHORA,
  ENTRADA_NO_USAR,
  ENTRADA_USAR,
  HUELLA,
  PROTOCOLO10,
  armarCredito9,
  datos10,
  registrar10,
} from "./protocolo-etapa10-helpers";

const KIT = "docs/kit-de-prueba/credito-fuga-plantada.csv";

/** Registra la 10 y arma la ficha con lo que la compuerta da por cumplido. */
function fichaDe(a: Armado, entrada: EntradaEtapa10): { ficha: Ficha; cuaderno: Cuaderno } {
  const r = registrar10(a, datos10(a, entrada));
  if (!r.ok) throw new Error(JSON.stringify(r.rechazo));
  const cuaderno: Cuaderno = {
    ...r.cuaderno,
    cargas: [
      {
        fecha: AHORA.toISOString(),
        sha256: HUELLA,
        nombre: "credito-fuga-plantada.csv",
        filas: a.tabla.rows.length,
        columnas: a.tabla.headers.length,
      },
    ],
  };
  const evaluadas = evaluar(PROTOCOLO10, cuaderno, HUELLA, a.tabla);
  const ficha = armarFicha({
    evidencias: evidenciasCumplidas(evaluadas),
    carga: cargaDe(cuaderno, HUELLA),
  });
  if (!ficha) throw new Error("sin ficha");
  return { ficha, cuaderno };
}

const lineas = (f: Ficha, seccion?: string): LineaFicha[] =>
  f.secciones.filter((s) => !seccion || s.id === seccion).flatMap((s) => [...s.lineas]);
const claves = (f: Ficha, seccion: string) => lineas(f, seccion).map((l) => l.clave);

const USAR = fichaDe(armarCredito9("usar"), {
  ...ENTRADA_USAR,
  noUsarPara: "Clientes con menos de seis meses en el banco",
});

describe("la ficha con «usar»", () => {
  const { ficha } = USAR;

  it("trae sus secciones en orden, con el plan de vigilancia y sin «qué cambiar»", () => {
    expect(ficha.decision).toBe("usar");
    expect(ficha.secciones.map((s) => s.id)).toEqual([
      "datos",
      "poblacion",
      "metricas",
      "decision",
      "limites",
      "cumplio",
      "vigilancia",
      "responde",
    ]);
  });

  it("cada línea derivada cita su etapa, su fecha y su huella; lo del dueño va rotulado", () => {
    for (const l of lineas(ficha)) {
      expect(l.fuente.fecha).toBe(AHORA.toISOString());
      if (l.fuente.tipo === "etapa") {
        expect(l.fuente.etapa).toBeGreaterThanOrEqual(1);
        expect(l.fuente.etapa).toBeLessThanOrEqual(10);
        // la etapa 1 no depende de los datos; las demás, sí, y citan su huella
        expect(l.fuente.huella).toBe(l.fuente.etapa === 1 ? null : HUELLA);
      }
    }
    const delDueno = lineas(ficha).filter((l) => l.fuente.tipo === "dueno");
    expect(delDueno.map((l) => l.clave).sort()).toEqual([
      "cadencia-sin-tiempo",
      "dueno",
      "dueno",
    ]);
    expect(delDueno.map((l) => l.params)).toContainEqual({
      texto: "Clientes con menos de seis meses en el banco",
    });
  });

  it("los datos con su archivo y la población con sus exclusiones", () => {
    expect(lineas(ficha, "datos")[0]).toMatchObject({
      clave: "archivo",
      params: { nombre: "credito-fuga-plantada.csv", filas: 200, columnas: 6 },
      fuente: { tipo: "etapa", etapa: 2 },
    });
    expect(claves(ficha, "poblacion")).toEqual([
      "poblacion",
      "exclusiones",
      "sin-periodo",
      "fuera",
    ]);
  });

  it("«Lo que este modelo cumplió», compuerta por compuerta, con lo que se midió", () => {
    const cumplio = lineas(ficha, "cumplio");
    expect(cumplio.map((l) => [l.fuente.tipo === "etapa" && l.fuente.etapa, l.clave])).toEqual([
      [4, "fuga"],
      [6, "particion"],
      [5, "linea-base"],
      [7, expect.stringMatching(/^(no-)?supera$/)],
      [7, expect.stringMatching(/^(sin-)?senal$/)],
      [8, "incertidumbre"],
      [8, "calibracion"],
    ]);
    expect(cumplio[1]!.params.sello).toMatch(/^[0-9a-f]{12}$/);
  });

  it("el plan de vigilancia: columnas con los umbrales de la etapa 4, el piso, la cadencia y quién responde", () => {
    expect(claves(ficha, "vigilancia")).toEqual([
      "columnas",
      "sin-vigilar",
      "umbrales",
      "solo-entradas",
      "piso",
      "piso-beneficio",
      "cadencia-sin-tiempo",
    ]);
    expect(lineas(ficha, "vigilancia")[2]!.params).toEqual({ moderada: 0.1, alerta: 0.25 });
    expect(lineas(ficha, "responde").map((l) => l.params)).toEqual([
      { dueno: "Jefa de retención" },
      {
        decisor: "Jefa de retención",
        decision: "Llamar o no al cliente",
      },
    ]);
  });

  it("sin marcar la columna de texto, la ficha nombra lo que quedó sin vigilar; marcada, entra a las vigiladas", () => {
    expect(lineas(ficha, "vigilancia")[1]).toMatchObject({
      clave: "sin-vigilar",
      params: { columnas: 1, lista: "empleo" },
      fuente: { tipo: "etapa", etapa: 10 },
    });
    const { ficha: marcada } = fichaDe(armarCredito9("usar"), {
      ...ENTRADA_USAR,
      vigilarTexto: ["empleo"],
    });
    expect(claves(marcada, "vigilancia")).not.toContain("sin-vigilar");
    expect(String(lineas(marcada, "vigilancia")[0]!.params.lista)).toContain("empleo");
    expect(lineas(marcada, "vigilancia")[0]!.params.columnas).toBe(4);
  });

  it("los límites dicen que predice, la población, la prueba chica y lo que escribió el dueño", () => {
    expect(claves(ficha, "limites")).toEqual(
      expect.arrayContaining(["predice", "poblacion", "prueba-chica", "dueno"]),
    );
  });
});

describe("la ficha con «no usar» y con «iterar»", () => {
  it("«no usar»: qué tendría que cambiar, en palabras del dueño, sin plan de vigilancia", () => {
    const { ficha } = fichaDe(armarCredito9("no-usar"), ENTRADA_NO_USAR);
    expect(ficha.secciones.map((s) => s.id)).not.toContain("vigilancia");
    expect(lineas(ficha, "variante")).toEqual([
      {
        clave: "que-cambiaria",
        params: { texto: ENTRADA_NO_USAR.cambiar },
        fuente: { tipo: "dueno", fecha: AHORA.toISOString() },
      },
    ]);
    expect(claves(ficha, "decision")[0]).toBe("decision-no-usar");
  });

  it("«iterar»: qué cambiar, y que la prueba ya abierta no se reutiliza", () => {
    const { ficha } = fichaDe(armarCredito9("iterar"), ENTRADA_NO_USAR);
    expect(claves(ficha, "variante")).toEqual(["que-cambiar", "prueba-gastada"]);
  });
});

describe("PRUEBA NEGATIVA: la ficha no lleva filas ni valores individuales", () => {
  const csv = readFileSync(KIT, "utf8");
  const filas = csv.split("\n").slice(1).filter(Boolean);
  const encabezados = csv.split("\n")[0]!.split(",");
  // columnas de muchos valores distintos: cada celda es prácticamente un valor individual
  const individuales = encabezados.flatMap((_, j) => {
    const valores = filas.map((f) => f.split(",")[j]!);
    return new Set(valores).size >= 50 ? valores : [];
  });

  it("ninguna fila del CSV aparece en la ficha ni en lo que guarda la etapa 10", () => {
    const guardado = JSON.stringify([USAR.ficha, USAR.cuaderno.evidencias.at(-1)]);
    for (const fila of filas) expect(guardado).not.toContain(fila);
  });

  it("ningún texto de la ficha es un valor individual de una columna de muchos valores", () => {
    const textos = lineas(USAR.ficha)
      .flatMap((l) => Object.values(l.params))
      .filter((v): v is string => typeof v === "string");
    expect(individuales.length).toBeGreaterThan(100);
    for (const t of textos) expect(individuales).not.toContain(t);
  });
});

it("sin alguna de las diez evidencias no hay ficha", () => {
  const sin7 = Object.fromEntries(
    Object.entries(
      evidenciasCumplidas(
        evaluar(PROTOCOLO10, USAR.cuaderno, HUELLA, armarCredito9("usar").tabla),
      ),
    ).filter(([k]) => k !== "7"),
  );
  expect(armarFicha({ evidencias: sin7, carga: null })).toBeNull();
});

describe("lo que cambia en la ficha según lo registrado (cada línea sale de su evidencia)", () => {
  const BASE = evidenciasCumplidas(
    evaluar(PROTOCOLO10, USAR.cuaderno, HUELLA, armarCredito9("usar").tabla),
  );
  type Libre = Record<string, unknown>;
  type Cambio = { etapa: 2 | 3 | 7 | 8 | 9 | 10; r?: Libre; c?: Libre };
  const fichaCon = (...cambios: Cambio[]) => {
    const evidencias = { ...BASE };
    for (const { etapa, r = {}, c = {} } of cambios) {
      const e = evidencias[etapa]!;
      evidencias[etapa] = {
        ...e,
        datos: {
          respuestas: { ...e.datos.respuestas, ...r },
          chequeos: { ...e.datos.chequeos, ...c },
        } as typeof e.datos,
      };
    }
    return armarFicha({ evidencias, carga: null })!;
  };
  const todas = (f: Ficha) => lineas(f).map((l) => l.clave);

  it.each([
    ["la calibración sin probabilidades", [{ etapa: 8, c: { calibracion: "sin-probabilidades" } }], "cumplio", "calibracion-sin-probabilidades"],
    ["la calibración que no aplica (un número)", [{ etapa: 8, c: { calibracion: "no-aplica" } }], "cumplio", "calibracion-no-aplica"],
    ["la prueba abierta con dos configuraciones", [{ etapa: 8, c: { aperturas: 2 } }], "limites", "reabierta"],
    ["el peor segmento", [{ etapa: 8, c: { peor_segmento: "c:empleo=informal" } }], "limites", "peor-segmento"],
    ["ningún segmento con soporte", [{ etapa: 8, c: { peor_segmento: "ninguno", seg_con_soporte: 0 } }], "metricas", "peor-sin-soporte"],
    ["ninguno peor que el total", [{ etapa: 8, c: { peor_segmento: "ninguno", seg_con_soporte: 3 } }], "metricas", "peor-ninguno"],
    ["el modelo que ganó la selección", [{ etapa: 7, c: { ganador: "random_forest" } }], "datos", "modelo"],
    ["tu regla medida en la prueba", [{ etapa: 8, c: { regla_costo: 0.5 } }], "metricas", "regla"],
    ["la clase predicha (sin probabilidades)", [{ etapa: 9, c: { modo: "clase" } }], "decision", "clase"],
    ["el umbral movido mirando la curva", [{ etapa: 9, r: { umbral: "0.30" }, c: { umbral_usado: 0.3 } }], "limites", "umbral-optimista"],
    ["la calibración corrida en la 8", [{ etapa: 9, c: { brecha: 0.2 } }], "limites", "poco-fiable"],
    ["el periodo de los datos", [{ etapa: 2, c: { fecha_min: "2024-01-01", fecha_max: "2025-06-30" } }], "poblacion", "periodo"],
    ["sin exclusiones escritas", [{ etapa: 3, r: { exclusiones: " " } }], "poblacion", "sin-exclusiones"],
    ["el modelo que no supera ni muestra señal", [{ etapa: 7, c: { veredicto: "no-supera", senal: "sin-senal" } }], "cumplio", "sin-senal"],
  ] as const)("%s", (_, cambios, seccion, clave) => {
    expect(claves(fichaCon(...(cambios as readonly Cambio[])), seccion)).toContain(clave);
  });

  it("«ninguno» no es un segmento: ni «peor» ni «peor-segmento» lo nombran como tal", () => {
    const f = fichaCon({ etapa: 8, c: { peor_segmento: "ninguno", seg_con_soporte: 3 } });
    expect(claves(f, "metricas")).not.toContain("peor");
    expect(claves(f, "limites")).not.toContain("peor-segmento");
    expect(lineas(f).some((l) => Object.values(l.params).includes("ninguno"))).toBe(false);
  });

  it("el umbral movido se rotula en la decisión y en los límites", () => {
    const f = fichaCon({ etapa: 9, r: { umbral: "0.30" }, c: { umbral_usado: 0.3 } });
    expect(claves(f, "decision")).toContain("umbral-movido");
    expect(claves(f, "decision")).not.toContain("umbral");
  });

  it("con una cadencia sugerida: igual la cita de la etapa 10; acortada o alargada, del dueño", () => {
    const con = (cadencia: number, razon = "") =>
      lineas(
        fichaCon({ etapa: 10, r: { cadencia, razon_cadencia: razon }, c: { cadencia_sugerida: 5 } }),
        "vigilancia",
      ).at(-1)!;
    expect(con(5)).toMatchObject({ clave: "cadencia", fuente: { tipo: "etapa", etapa: 10 } });
    expect(con(3)).toMatchObject({ clave: "cadencia-acortada", fuente: { tipo: "dueno" } });
    expect(con(8, "El mercado cambia lento")).toMatchObject({
      clave: "cadencia-alargada",
      params: { cadencia: 8, sugerida: 5, razon: "El mercado cambia lento" },
      fuente: { tipo: "dueno" },
    });
  });

  it("el piso en beneficio neto es el de lo de hoy: tu regla, actuar con todos o no hacer nada", () => {
    const piso = (c: Libre) =>
      lineas(fichaCon({ etapa: 9, c }), "vigilancia").find((l) => l.clave === "piso-beneficio")
        ?.params;
    expect(piso({ hoy_id: "regla", beneficio_regla: 0.05, beneficio: 0.1 })).toEqual({
      beneficio100: 10,
      hoy100: 5,
    });
    expect(piso({ hoy_id: "siempre-actuar", beneficio_todos: -0.2, beneficio: 0.1 })).toEqual({
      beneficio100: 10,
      hoy100: -20,
    });
    expect(piso({ hoy_id: "nunca-actuar", beneficio: 0.1 })).toEqual({
      beneficio100: 10,
      hoy100: 0,
    });
    // con una referencia que no tiene beneficio neto, la línea no se inventa
    expect(piso({ hoy_id: "clase-mayoritaria" })).toBeUndefined();
  });

  it("sin la carga en el cuaderno no hay línea del archivo (no se inventa)", () => {
    expect(todas(fichaCon())).not.toContain("archivo");
  });
});
