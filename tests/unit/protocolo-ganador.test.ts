// @vitest-environment node
/**
 * S19 (ADR 027): lo que viaja al worker para volver a ajustar al ganador del Protocolo. Garantías que estos tests hacen FALLAR:
 *  - el envío NO lleva la prueba: ni una clave `test`, ni una fila de ella; son EXACTAMENTE las filas de entrenamiento con que
 *    se abre la prueba (el mismo ayudante arma los dos envíos);
 *  - sale solo con el sello de la etapa 6 vigente, la huella del archivo y un ganador y una métrica de la etapa 7;
 *  - la tabla de la etapa 9 son las filas de entrenamiento, con todas las columnas, y ninguna de la prueba.
 */
import { describe, expect, it } from "vitest";
import { plan7 } from "@/engine/protocolo/etapa7";
import { plan8 } from "@/engine/protocolo/etapa8";
import type { Previas } from "@/engine/protocolo/etapas";
import { envioGanador, tablaDeEntrenamiento } from "@/lib/protocolo/ganador";
import { envio8 } from "@/lib/protocolo/prueba8";
import {
  HUELLA,
  armarCredito7,
  armarPlanes6,
  armarPrecio6,
  con7,
} from "./protocolo-etapa8-helpers";

const CASOS = [
  ["dos clases", () => armarCredito7()],
  ["varias clases", () => con7(armarPlanes6(), "forest", "balanced_accuracy", 0.5)],
  ["un número", () => con7(armarPrecio6(), "forest", "mae", 100)],
] as const;

describe.each(CASOS)("el envío del ganador (%s)", (_, armar) => {
  it("lleva las filas de entrenamiento y NINGUNA de la prueba", () => {
    const a = armar();
    const e = envioGanador(a.tabla, a.previas, HUELLA)!;
    expect(e).not.toBeNull();
    expect(Object.keys(e.payload)).not.toContain("test");
    const abre = envio8(a.tabla, plan8(a.tabla, a.previas, HUELLA)!, HUELLA)!;
    // las mismas filas, en el mismo orden, con las mismas columnas que abrieron la prueba
    expect(e.payload.train).toEqual(abre.payload.train);
    expect(e.payload.headers).toEqual(abre.payload.headers);
    expect(e.payload.train.length + abre.payload.test.length).toBe(a.tabla.rows.length);
    // y el resto del envío es el mismo: ganador, métrica, semilla, sello y huella
    for (const k of ["task", "winner", "primary_metric", "seed", "sello", "huella", "target"] as const)
      expect(e.payload[k]).toEqual(abre.payload[k]);
    expect(e.sent).toEqual({
      task: e.payload.task,
      winner: e.payload.winner,
      n_train: e.payload.train.length,
      huella: HUELLA,
      sello: e.payload.sello,
    });
  });

  it("la tabla de la etapa 9 son las filas de entrenamiento con todas las columnas", () => {
    const a = armar();
    const p7 = plan7(a.tabla, a.previas, HUELLA)!;
    const t = tablaDeEntrenamiento(a.tabla, p7.particion.entrenamiento);
    expect(t.headers).toEqual(a.tabla.headers);
    expect(t.rows).toHaveLength(p7.particion.entrenamiento.length);
    expect(t.rows.length).toBeLessThan(a.tabla.rows.length);
    const prueba = new Set(p7.particion.prueba.map((f) => a.tabla.rows[f]));
    // ninguna fila de la tabla es una fila de la prueba (por identidad: son los mismos arreglos de la tabla cargada)
    expect(t.rows.some((fila) => prueba.has(fila))).toBe(false);
  });
});

describe("cuándo NO sale el envío", () => {
  const a = armarCredito7();
  const sin = (cambio: (p: Previas) => Previas) => envioGanador(a.tabla, cambio(a.previas), HUELLA);

  it("sin huella, o con una que no es de 64 hex", () => {
    expect(envioGanador(a.tabla, a.previas, null)).toBeNull();
    expect(envioGanador(a.tabla, a.previas, "abc")).toBeNull();
  });

  it("si el sello de hoy no es el que registró la etapa 6", () => {
    expect(
      sin((p) => ({
        ...p,
        6: { ...p[6]!, chequeos: { ...p[6]!.chequeos, sello: "f".repeat(64) } },
      })),
    ).toBeNull();
  });

  it("sin etapa 7, sin ganador o con un ganador que no es de la tarea", () => {
    expect(sin((p) => ({ ...p, 7: undefined }))).toBeNull();
    expect(
      sin((p) => ({ ...p, 7: { ...p[7]!, chequeos: { ...p[7]!.chequeos, ganador: "kmeans" } } })),
    ).toBeNull();
    expect(
      sin((p) => ({ ...p, 7: { ...p[7]!, chequeos: { ...p[7]!.chequeos, metrica: "nada" } } })),
    ).toBeNull();
  });
});
