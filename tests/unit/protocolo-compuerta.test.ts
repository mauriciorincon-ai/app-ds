// Protocolo DS (S8, regla dura 5, ADR 020): la COMPUERTA. Gate propio del sprint: si alguien
// deja abrir una etapa sin la anterior cumplida, o abre un camino para registrar sin ella,
// esta prueba cae nombrando la regla. Nació en rojo con scripts/demo-rojo.sh (cierre del S8).
import { describe, expect, it } from "vitest";
import {
  evaluar,
  registrar,
  type EstadoEtapa,
} from "@/engine/protocolo/compuerta";
import { cuadernoVacio, type Cuaderno } from "@/engine/protocolo/cuaderno";
import type {
  DatosEtapa,
  DefinicionProtocolo,
  EtapaConstruida,
  EtapaId,
} from "@/engine/protocolo/etapas";
import { PROTOCOLO_DS } from "@/engine/protocolo/protocolo-ds";
import { ETAPA_IDS } from "@/engine/protocolo/ids";

const AHORA = new Date("2026-10-17T12:00:00.000Z");
const HUELLA = "a".repeat(64);
const OTRA = "b".repeat(64);

/** Una etapa de prueba: cumple si la respuesta «ok» es true; «parar» la detiene. */
function etapa(id: EtapaId, dependeDeDatos: boolean): EtapaConstruida {
  return {
    id,
    construida: true,
    dependeDeDatos,
    terminos: [],
    preguntas: ["ok"],
    chequeos: [],
    trampas: () => [],
    leer: (datos) =>
      typeof datos.respuestas.ok === "boolean"
        ? { ok: true }
        : { ok: false, campo: "respuestas.ok" },
    criterio: (datos) => {
      if (datos.respuestas.parar === true)
        return { tipo: "detenida", razon: "causal" };
      return datos.respuestas.ok === true
        ? { tipo: "cumple" }
        : { tipo: "falta", faltan: ["ok"] };
    },
  };
}

const PROTOCOLO: DefinicionProtocolo = [
  etapa(1, false),
  etapa(2, true),
  etapa(3, true),
  { id: 4, construida: false, dependeDeDatos: true, terminos: [] },
];

const SI: DatosEtapa = { respuestas: { ok: true }, chequeos: {} };
const NO: DatosEtapa = { respuestas: { ok: false }, chequeos: {} };
const PARA: DatosEtapa = {
  respuestas: { ok: true, parar: true },
  chequeos: {},
};

function con(
  cuaderno: Cuaderno,
  id: EtapaId,
  datos: DatosEtapa = SI,
  huella: string | null = HUELLA,
): Cuaderno {
  const r = registrar(PROTOCOLO, cuaderno, id, datos, { huella, ahora: AHORA });
  if (!r.ok)
    throw new Error(`registro rechazado: ${JSON.stringify(r.rechazo)}`);
  return r.cuaderno;
}

function estados(cuaderno: Cuaderno, huella: string | null = HUELLA) {
  return evaluar(PROTOCOLO, cuaderno, huella).map((e) => e.estado.tipo);
}

describe("la compuerta (regla dura 5)", () => {
  it("la etapa 2 no abre sin la 1", () => {
    const vacio = cuadernoVacio(AHORA);
    expect(estados(vacio)).toEqual([
      "abierta",
      "cerrada",
      "cerrada",
      "no-construida",
    ]);
    const r = registrar(PROTOCOLO, vacio, 2, SI, {
      huella: HUELLA,
      ahora: AHORA,
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.rechazo).toEqual({
      tipo: "etapa-cerrada",
      etapa: 2,
      bloquea: 1,
    });
  });

  it("la etapa 3 no abre sin la 2, aunque la 1 esté cumplida", () => {
    const c = con(cuadernoVacio(AHORA), 1);
    expect(estados(c)).toEqual([
      "cumplida",
      "abierta",
      "cerrada",
      "no-construida",
    ]);
    const r = registrar(PROTOCOLO, c, 3, SI, { huella: HUELLA, ahora: AHORA });
    expect(!r.ok && r.rechazo).toEqual({
      tipo: "etapa-cerrada",
      etapa: 3,
      bloquea: 2,
    });
  });

  it("una respuesta que no cumple el criterio no entra al cuaderno", () => {
    const vacio = cuadernoVacio(AHORA);
    const r = registrar(PROTOCOLO, vacio, 1, NO, {
      huella: null,
      ahora: AHORA,
    });
    expect(!r.ok && r.rechazo).toEqual({
      tipo: "criterio-no-cumplido",
      etapa: 1,
      faltan: ["ok"],
    });
  });

  it("lo que no tiene la forma de la etapa se rechaza nombrando el campo", () => {
    const r = registrar(
      PROTOCOLO,
      cuadernoVacio(AHORA),
      1,
      { respuestas: {}, chequeos: {} },
      { huella: null, ahora: AHORA },
    );
    expect(!r.ok && r.rechazo).toEqual({
      tipo: "datos-invalidos",
      etapa: 1,
      campo: "respuestas.ok",
    });
  });

  it("una etapa que usa los datos no registra sin datos cargados", () => {
    const c = con(cuadernoVacio(AHORA), 1, SI, null);
    const r = registrar(PROTOCOLO, c, 2, SI, { huella: null, ahora: AHORA });
    expect(!r.ok && r.rechazo).toEqual({ tipo: "sin-datos", etapa: 2 });
  });

  it("una etapa sin construir se ve, pero no abre ni registra", () => {
    let c = con(cuadernoVacio(AHORA), 1);
    c = con(c, 2);
    c = con(c, 3);
    expect(estados(c)).toEqual([
      "cumplida",
      "cumplida",
      "cumplida",
      "no-construida",
    ]);
    const r = registrar(PROTOCOLO, c, 4, SI, { huella: HUELLA, ahora: AHORA });
    expect(!r.ok && r.rechazo).toEqual({ tipo: "no-construida", etapa: 4 });
  });

  it("detenida para el protocolo: lo que sigue queda cerrado, y se puede reformular", () => {
    let c = con(cuadernoVacio(AHORA), 1);
    c = con(c, 2, PARA);
    expect(estados(c)).toEqual([
      "cumplida",
      "detenida",
      "cerrada",
      "no-construida",
    ]);
    const r = registrar(PROTOCOLO, c, 3, SI, { huella: HUELLA, ahora: AHORA });
    expect(!r.ok && r.rechazo).toMatchObject({
      tipo: "etapa-cerrada",
      bloquea: 2,
    });
    c = con(c, 2, SI);
    expect(estados(c)).toEqual([
      "cumplida",
      "cumplida",
      "abierta",
      "no-construida",
    ]);
  });

  it("un cuaderno con una evidencia que ya no cumple deja la etapa abierta (nunca se confía en un «cumple» guardado)", () => {
    const c: Cuaderno = {
      ...cuadernoVacio(AHORA),
      evidencias: [
        {
          seq: 1,
          etapa: 1,
          fecha: AHORA.toISOString(),
          huella: null,
          base: {},
          datos: NO,
        },
      ],
    };
    const [primera] = evaluar(PROTOCOLO, c, HUELLA);
    expect(primera!.estado).toMatchObject({ tipo: "abierta", faltan: ["ok"] });
  });
});

describe("el cuaderno solo crece y se re-verifica", () => {
  it("con otra huella, las etapas que usan los datos vuelven a «por verificar»; la 1 no", () => {
    let c = con(cuadernoVacio(AHORA), 1);
    c = con(c, 2);
    c = con(c, 3);
    const otra = evaluar(PROTOCOLO, c, OTRA).map((e) => e.estado);
    expect(otra[0]!.tipo).toBe("cumplida");
    expect(otra[1]).toMatchObject({
      tipo: "por-verificar",
      motivo: "datos-distintos",
    });
    expect(otra[2]!.tipo).toBe("cerrada");
    const sin = evaluar(PROTOCOLO, c, null).map((e) => e.estado);
    expect(sin[1]).toMatchObject({
      tipo: "por-verificar",
      motivo: "sin-datos",
    });
    expect(estados(c, HUELLA)).toEqual([
      "cumplida",
      "cumplida",
      "cumplida",
      "no-construida",
    ]);
  });

  it("corregir una etapa añade una evidencia y deja «por verificar» a las que se construyeron sobre la vieja", () => {
    let c = con(cuadernoVacio(AHORA), 1);
    c = con(c, 2);
    c = con(c, 1);
    expect(c.evidencias.map((e) => [e.seq, e.etapa])).toEqual([
      [1, 1],
      [2, 2],
      [3, 1],
    ]);
    const [, segunda] = evaluar(PROTOCOLO, c, HUELLA).map((e) => e.estado);
    expect(segunda).toMatchObject({
      tipo: "por-verificar",
      motivo: "anterior-cambio",
    });
    c = con(c, 2);
    expect(c.evidencias.at(-1)!.base).toEqual({ 1: 3 });
    expect(estados(c)).toEqual([
      "cumplida",
      "cumplida",
      "abierta",
      "no-construida",
    ]);
  });

  it("registrar no toca el cuaderno de entrada (lista que solo crece, sin mutar)", () => {
    const c = con(cuadernoVacio(AHORA), 1);
    const antes = JSON.stringify(c);
    con(c, 2);
    expect(JSON.stringify(c)).toBe(antes);
  });

  it("cada evidencia anota fecha, huella solo si usa los datos, y sobre qué previas se construyó", () => {
    let c = con(cuadernoVacio(AHORA), 1);
    c = con(c, 2);
    expect(c.evidencias).toEqual([
      {
        seq: 1,
        etapa: 1,
        fecha: AHORA.toISOString(),
        huella: null,
        base: {},
        datos: SI,
      },
      {
        seq: 2,
        etapa: 2,
        fecha: AHORA.toISOString(),
        huella: HUELLA,
        base: { 1: 1 },
        datos: SI,
      },
    ]);
  });
});

describe("el Protocolo DS", () => {
  it("son las diez etapas en orden, y las que no están construidas no abren", () => {
    expect(PROTOCOLO_DS.map((e) => e.id)).toEqual([...ETAPA_IDS]);
    const evaluadas = evaluar(PROTOCOLO_DS, cuadernoVacio(AHORA), null);
    for (const { etapa, estado } of evaluadas) {
      const esperado: EstadoEtapa["tipo"][] = etapa.construida
        ? ["abierta", "cerrada"]
        : ["no-construida"];
      expect(esperado, `etapa ${etapa.id}`).toContain(estado.tipo);
    }
  });

  it("solo la 1 no depende de los datos", () => {
    expect(
      PROTOCOLO_DS.filter((e) => !e.dependeDeDatos).map((e) => e.id),
    ).toEqual([1]);
  });
});
