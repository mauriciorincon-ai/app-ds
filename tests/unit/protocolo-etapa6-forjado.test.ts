// Protocolo DS (S11), etapa 6: un cuaderno editado a mano con la prueba cambiada no gana nada. El
// sello sale de la tabla (la huella, el esquema, sus parámetros, la semilla y los índices de la
// prueba) y la compuerta lo rehace en cada evaluación: si lo registrado no cuadra con lo que la tabla
// da hoy, la etapa 6 vuelve a «por verificar» y la 7 no abre. Se prueba por el camino del usuario:
// exportar el `.protocolo.json`, editarlo y leerlo de nuevo. Lo que NO se detecta —un archivo con
// parámetros y sello rehechos a mano de forma coherente— se declara: el sello es higiene y
// trazabilidad, no una promesa.
import { describe, expect, it } from "vitest";
import { evaluar, registrar } from "@/engine/protocolo/compuerta";
import type { Cuaderno } from "@/engine/protocolo/cuaderno";
import {
  ENTRADA_6_VACIA,
  datosEtapa6,
  type EntradaEtapa6,
} from "@/engine/protocolo/etapa6";
import { empaquetar, leerArchivo } from "@/lib/protocolo/archivo";
import {
  AHORA,
  ENTRADA_BAJAS,
  HUELLA,
  PROTOCOLO6,
  armar5,
} from "./protocolo-etapa4-helpers";

const BAJAS = armar5("bajas-con-fuga.csv", "binaria", ENTRADA_BAJAS);
const contexto = { huella: HUELLA, tabla: BAJAS.tabla, ahora: AHORA };
const NUEVAS: EntradaEtapa6 = {
  ...ENTRADA_6_VACIA,
  unidades: "nuevas",
  esquema: "tiempo-grupo",
  horizonte: 1,
  horizonteUnidad: "meses",
};

function sellada(entrada: EntradaEtapa6 = NUEVAS): Cuaderno {
  const r = registrar(
    PROTOCOLO6,
    BAJAS.cuaderno,
    6,
    datosEtapa6(BAJAS.tabla, entrada, BAJAS.previas, HUELLA),
    contexto,
  );
  if (!r.ok) throw new Error(JSON.stringify(r.rechazo));
  return r.cuaderno;
}

type Archivo = { cuaderno: Cuaderno };
type Mutable = Record<string, unknown>;

function etapa6(archivo: Archivo): { r: Mutable; c: Mutable } {
  const ev = archivo.cuaderno.evidencias.findLast((e) => e.etapa === 6);
  if (!ev) throw new Error("falta la evidencia de la etapa 6");
  return { r: ev.datos.respuestas as Mutable, c: ev.datos.chequeos as Mutable };
}

function importado(
  cuaderno: Cuaderno,
  editar: (archivo: Archivo) => void = () => undefined,
): Cuaderno {
  const archivo = JSON.parse(empaquetar(cuaderno, AHORA)) as Archivo;
  editar(archivo);
  const lectura = leerArchivo(JSON.stringify(archivo), PROTOCOLO6);
  if (!lectura.ok) throw new Error(JSON.stringify(lectura.rechazo));
  return lectura.cuaderno;
}

function estados(cuaderno: Cuaderno) {
  return evaluar(PROTOCOLO6, cuaderno, HUELLA, BAJAS.tabla)
    .slice(4, 7)
    .map((e) =>
      e.estado.tipo === "por-verificar"
        ? `por-verificar:${e.estado.motivo}`
        : e.estado.tipo,
    );
}

// S12: con la 6 sellada, la 7 abre
const SELLADA = ["cumplida", "cumplida", "abierta"];
// un sello que no cuadra: la 6 vuelve a «por verificar» y la 7 no abre sin ella (S12: ya construida)
const NO_CUADRA = ["cumplida", "por-verificar:no-cuadra", "cerrada"];

describe("la etapa 6 de un cuaderno editado a mano no gana nada", () => {
  it("el cuaderno honesto, exportado e importado, sigue sellado (el ida y vuelta no lo rompe)", () => {
    expect(estados(importado(sellada()))).toEqual(SELLADA);
  });

  it("un sello que no cuadra: el sello cambiado a mano", () => {
    const c = importado(sellada(), (a) => {
      etapa6(a).c.sello = "0".repeat(64);
    });
    expect(estados(c)).toEqual(NO_CUADRA);
  });

  it("un sello que no cuadra: otro tamaño de prueba con el sello viejo", () => {
    const c = importado(sellada(), (a) => {
      etapa6(a).r.tamano = 30;
    });
    expect(estados(c)).toEqual(NO_CUADRA);
  });

  it("un sello que no cuadra: otro esquema (por tiempo, con unidades conocidas) con los conteos viejos", () => {
    const c = importado(sellada(), (a) => {
      const { r } = etapa6(a);
      r.esquema = "tiempo";
      r.unidades = "conocidas";
    });
    expect(estados(c)).toEqual(NO_CUADRA);
  });

  it("un sello que no cuadra: sin hueco, con el mismo sello", () => {
    const c = importado(sellada(), (a) => {
      etapa6(a).r.horizonte = 0;
    });
    expect(estados(c)).toEqual(NO_CUADRA);
  });

  it("un sello que no cuadra: el corte o los conteos maquillados", () => {
    for (const editar of [
      (c: Mutable) => {
        c.corte = "2025-10-15";
      },
      (c: Mutable) => {
        c.n_prueba = 200;
      },
      (c: Mutable) => {
        c.fuera_unidades_prueba = 0;
      },
    ]) {
      const cuaderno = importado(sellada(), (a) => {
        editar(etapa6(a).c);
      });
      expect(estados(cuaderno)).toEqual(NO_CUADRA);
    }
  });

  it("al recargar, con el mismo CSV cargado, el sello se vuelve a calcular y sigue intacto", () => {
    const cuaderno = sellada();
    // otra evaluación, desde cero: lo mismo que pasa al recargar la página y volver a cargar el CSV
    expect(estados(cuaderno)).toEqual(SELLADA);
    expect(estados(importado(cuaderno))).toEqual(SELLADA);
  });

  it("con otro archivo cargado (otra huella), la 6 deja de estar cumplida: la primera etapa que usa los datos se re-verifica y la cierra", () => {
    const e = evaluar(PROTOCOLO6, sellada(), "e".repeat(64), BAJAS.tabla);
    expect(e[1]!.estado).toMatchObject({
      tipo: "por-verificar",
      motivo: "datos-distintos",
    });
    expect(e[5]!.estado).toEqual({ tipo: "cerrada", bloquea: 2 });
  });

  it("lo que ninguna compuerta ve: parámetros y sello rehechos a mano de forma coherente pasan (se declara)", () => {
    // quien edita el archivo y recalcula el sello por su cuenta deja un cuaderno coherente: la app
    // dice que la prueba de hoy es la sellada, no que nadie la haya mirado (manual, «Etapa 6, límites»)
    const otra = datosEtapa6(
      BAJAS.tabla,
      { ...NUEVAS, tamano: 30 },
      BAJAS.previas,
      HUELLA,
    );
    const c = importado(sellada(), (a) => {
      const ev = a.cuaderno.evidencias.findLast((x) => x.etapa === 6)!;
      (ev as unknown as { datos: unknown }).datos = otra;
    });
    expect(estados(c)).toEqual(SELLADA);
  });
});
