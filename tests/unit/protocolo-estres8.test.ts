// S17 (ADR 023), etapa 8: la prueba de estrés como evidencia del cuaderno. Lo que tiene que valer:
//  · la lectura de estrés es OPCIONAL: sin ella la etapa se registra igual y las tres claves quedan vacías (no inventadas);
//  · con ella, el cuaderno guarda solo tres cosas: la métrica con 10 % de ruido, el mejor rival sin modelo en la misma
//    prueba y cuál es — ningún valor del dataset ni ningún nombre de columna;
//  · un registro de ANTES (sin esas claves) se sigue leyendo y recalculando sin inventárselas;
//  · el lector rechaza lo que no cuadra (una cifra sin rival, un identificador con cualquier cosa).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluar, registrar } from "@/engine/protocolo/compuerta";
import {
  CHEQUEOS_8,
  ETAPA_8,
  NUEVOS_S17,
  datosEtapa8,
  resumenEtapa8,
  type Corrida8,
} from "@/engine/protocolo/etapa8";
import { PROTOCOLO_DS } from "@/engine/protocolo/protocolo-ds";
import type { StressResult, TestResult } from "@/workers/protocol";
import {
  AHORA,
  HUELLA,
  armarCredito7,
} from "./protocolo-etapa8-helpers";

const fixture = <T>(name: string): T =>
  JSON.parse(
    readFileSync(
      resolve(__dirname, `../fixtures/contrato/${name}.json`),
      "utf8",
    ),
  ) as T;

const A = armarCredito7();
const RESULTADO = fixture<TestResult>("test-result");
const ESTRES = fixture<StressResult>("estres-test-result");
const SIN_ESTRES: Corrida8 = { resultado: RESULTADO };
const CON_ESTRES: Corrida8 = { resultado: RESULTADO, estres: ESTRES };

const datos = (corrida: Corrida8) =>
  datosEtapa8(A.tabla, A.previas, HUELLA, corrida, { patron: "Falla con los clientes nuevos" }, 1);

describe("la etapa 8 guarda la lectura de estrés, si la pediste", () => {
  it("con ella: la cifra con 10 % de ruido, el rival sin modelo y cuál es; nada más", () => {
    const c = datos(CON_ESTRES).chequeos;
    const con10 = ESTRES.noise.find((n) => n.level === 0.1)!;
    expect(c.estres_ruido).toBe(con10.value);
    expect(c.estres_rival).toBe(ESTRES.baseline!.value);
    expect(c.estres_rival_id).toBe(ESTRES.baseline!.name);
    // ningún nombre de columna ni lista de ellas: solo tres claves nuevas
    const nuevas = Object.keys(c).filter((k) => k.startsWith("estres_"));
    expect(nuevas.sort()).toEqual([...NUEVOS_S17].sort());
  });

  it("sin ella: las tres claves van vacías y la etapa se registra y cumple igual", () => {
    const d = datos(SIN_ESTRES);
    expect(d.chequeos.estres_ruido).toBeNull();
    expect(d.chequeos.estres_rival).toBeNull();
    expect(d.chequeos.estres_rival_id).toBeNull();
    const r = registrar(PROTOCOLO_DS, A.cuaderno, 8, d, {
      huella: HUELLA,
      tabla: A.tabla,
      ahora: AHORA,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const estado = evaluar(PROTOCOLO_DS, r.cuaderno, HUELLA, A.tabla)[7]!
        .estado.tipo;
      expect(estado).toBe("cumplida");
    }
  });

  it("con ella también se registra, y la compuerta no pierde la lectura al recalcular", () => {
    const r = registrar(PROTOCOLO_DS, A.cuaderno, 8, datos(CON_ESTRES), {
      huella: HUELLA,
      tabla: A.tabla,
      ahora: AHORA,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const guardado = r.cuaderno.evidencias.at(-1)!;
    expect(guardado.datos.chequeos.estres_ruido).toBe(
      ESTRES.noise.find((n) => n.level === 0.1)!.value,
    );
    const resumen = resumenEtapa8(guardado.datos);
    expect(resumen.estresRuido).toBe(guardado.datos.chequeos.estres_ruido);
    expect(resumen.estresRival).toBe(ESTRES.baseline!.value);
  });

  it("un dataset sin columnas numéricas (noise: []) se registra y cumple: el rival queda, la cifra con ruido no (AU-S17-01)", () => {
    const sinNumericas: Corrida8 = {
      resultado: RESULTADO,
      estres: { ...ESTRES, noise: [], shift: [] },
    };
    const d = datos(sinNumericas);
    expect(d.chequeos.estres_ruido).toBeNull();
    expect(d.chequeos.estres_rival).toBe(ESTRES.baseline!.value);
    expect(ETAPA_8.leer(d)).toEqual({ ok: true });
    const r = registrar(PROTOCOLO_DS, A.cuaderno, 8, d, {
      huella: HUELLA,
      tabla: A.tabla,
      ahora: AHORA,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(
      evaluar(PROTOCOLO_DS, r.cuaderno, HUELLA, A.tabla)[7]!.estado.tipo,
    ).toBe("cumplida");
    const resumen = resumenEtapa8(r.cuaderno.evidencias.at(-1)!.datos);
    expect(resumen.estresRuido).toBeNull();
    expect(resumen.estresRival).toBe(ESTRES.baseline!.value);
  });

  it("un registro de ANTES (sin las tres claves) se sigue leyendo y no se las inventa", () => {
    const viejo = datos(SIN_ESTRES);
    const chequeos = { ...viejo.chequeos };
    for (const k of NUEVOS_S17) delete chequeos[k];
    const sinClaves = { ...viejo, chequeos };
    expect(ETAPA_8.leer(sinClaves)).toEqual({ ok: true });
    if (!ETAPA_8.recalcular) throw new Error("la etapa 8 recalcula");
    const recalculado = ETAPA_8.recalcular(sinClaves, A.previas, A.tabla, HUELLA);
    for (const k of NUEVOS_S17) expect(Object.hasOwn(recalculado.chequeos, k)).toBe(false);
    expect(resumenEtapa8(recalculado).estresRuido).toBeNull();
  });
});

describe("el lector de la etapa 8 rechaza lo que no cuadra de la lectura de estrés", () => {
  const con = (cambios: Record<string, unknown>) => {
    const d = datos(CON_ESTRES);
    return { ...d, chequeos: { ...d.chequeos, ...cambios } } as typeof d;
  };

  it("una cifra con ruido sin su rival no es una lectura (el rival sin cifra sí: AU-S17-01)", () => {
    expect(ETAPA_8.leer(con({ estres_rival: null, estres_rival_id: null }))).toEqual({
      ok: false,
      campo: "chequeos.estres_ruido",
    });
    // sin columnas numéricas no hay dónde poner ruido, y el rival se mide igual
    expect(ETAPA_8.leer(con({ estres_ruido: null }))).toEqual({ ok: true });
  });

  it("el rival es un identificador, no texto libre", () => {
    expect(ETAPA_8.leer(con({ estres_rival_id: "Mayoría <b>" }))).toEqual({
      ok: false,
      campo: "chequeos.estres_rival_id",
    });
    expect(ETAPA_8.leer(con({ estres_ruido: "mucho" }))).toMatchObject({
      ok: false,
    });
  });

  it("las claves nuevas están en la lista cerrada de la etapa (y una de más se rechaza)", () => {
    for (const k of NUEVOS_S17) expect(CHEQUEOS_8).toContain(k);
    expect(ETAPA_8.leer(con({ estres_extra: 1 }))).toEqual({
      ok: false,
      campo: "chequeos.estres_extra",
    });
  });
});
