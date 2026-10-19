// Protocolo DS (S12), etapa 7: la definición de la etapa con el kit real, cumplido con la compuerta, y la
// corrida del worker que escribió la prueba de integración (tests/fixtures/contrato/validation-result.json,
// validada con el lector del contrato). Lo que tiene que valer:
//  · la 7 abre con la 6 sellada y no abre sin ella; sin correr la liga, la compuerta nombra «liga»;
//  · lo que la compuerta puede rehacer (pliegues, verificación, sello, columnas, línea base) se rehace, y lo
//    del worker se copia pero el veredicto y el valor p se rehacen con esos números: un número cambiado no
//    cuadra; uno cambiado con todo lo que depende de él, sí (límite declarado en el manual);
//  · la 8 se ve sin construir; las trampas hablan de lo que pasó en tus datos.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluar, registrar } from "@/engine/protocolo/compuerta";
import type { Cuaderno } from "@/engine/protocolo/cuaderno";
import { comparar } from "@/engine/protocolo/comparacion";
import { chooseCvK } from "@/engine/encarrilador";
import {
  CHEQUEOS_7,
  ETAPA_7,
  datosEtapa7,
  direccionDe,
  plan7,
  resumenEtapa7,
  type Corrida7,
} from "@/engine/protocolo/etapa7";
import type { DatosEtapa } from "@/engine/protocolo/etapas";
import { kPedidoPara, sinSolape } from "@/engine/protocolo/pliegues";
import { PROTOCOLO_DS } from "@/engine/protocolo/protocolo-ds";
import { envio7 } from "@/lib/protocolo/liga7";
import { validateValidationResult } from "@/workers/contract";
import {
  AHORA,
  ENTRADA_6_BAJAS,
  ENTRADA_6_CREDITO,
  ENTRADA_BAJAS,
  ENTRADA_CREDITO,
  HUELLA,
  armar6,
} from "./protocolo-etapa4-helpers";

const CREDITO = armar6(
  "credito-fuga-plantada.csv",
  "binaria",
  ENTRADA_CREDITO,
  ENTRADA_6_CREDITO,
);
const BAJAS = armar6(
  "bajas-con-fuga.csv",
  "binaria",
  ENTRADA_BAJAS,
  ENTRADA_6_BAJAS,
);

function corridaCredito(): Corrida7 {
  const raw = JSON.parse(
    readFileSync("tests/fixtures/contrato/validation-result.json", "utf8"),
  ) as unknown;
  const e = envio7(
    CREDITO.tabla,
    plan7(CREDITO.tabla, CREDITO.previas, HUELLA)!,
  )!;
  const r = validateValidationResult(raw, {
    ...e.sent,
    permutations: { min: 20, max: 20 },
  });
  if (!r.ok) throw new Error(`el fixture no pasa el lector: ${r.field}`);
  return { metrica: e.metrica, roster: e.roster, resultado: r.value };
}
const CORRIDA = corridaCredito();

const registrado = (): { cuaderno: Cuaderno; datos: DatosEtapa } => {
  const datos = datosEtapa7(CREDITO.tabla, CREDITO.previas, HUELLA, CORRIDA);
  const r = registrar(PROTOCOLO_DS, CREDITO.cuaderno, 7, datos, {
    huella: HUELLA,
    tabla: CREDITO.tabla,
    ahora: AHORA,
  });
  if (!r.ok) throw new Error(JSON.stringify(r.rechazo));
  return { cuaderno: r.cuaderno, datos };
};

const estados = (cuaderno: Cuaderno) =>
  evaluar(PROTOCOLO_DS, cuaderno, HUELLA, CREDITO.tabla).map((e) =>
    e.estado.tipo === "por-verificar"
      ? `por-verificar:${e.estado.motivo}`
      : e.estado.tipo,
  );

/** El cuaderno con la última evidencia de la etapa 7 editada a mano. */
function editado(
  cuaderno: Cuaderno,
  editar: (c: Record<string, unknown>) => void,
): Cuaderno {
  const copia = JSON.parse(JSON.stringify(cuaderno)) as Cuaderno;
  const ultima = [...copia.evidencias].reverse().find((e) => e.etapa === 7)!;
  editar(ultima.datos.chequeos as Record<string, unknown>);
  return copia;
}

describe("el plan de la etapa 7 sobre el kit", () => {
  it("crédito: pliegues estratificados dentro del entrenamiento, sin solape, y las columnas en «usar»", () => {
    const plan = plan7(CREDITO.tabla, CREDITO.previas, HUELLA)!;
    expect(plan.pliegues.ok).toBe(true);
    if (!plan.pliegues.ok) return;
    expect(plan.parametros.esquema).toBe("estratificada");
    expect(sinSolape(plan.verificacion!)).toBe(true);
    expect(plan.verificacion!.sinValidar).toBe(0);
    // la columna con fuga quedó en «excluir» en la etapa 4, y el objetivo nunca es una columna
    expect([...plan.numericas, ...plan.categoricas]).not.toContain(
      "monto_recuperado",
    );
    expect([...plan.numericas, ...plan.categoricas]).not.toContain("incumplio");
    expect(plan.base).toHaveLength(plan.pliegues.k);
    expect(plan.huellaPliegues).toMatch(/^[0-9a-f]{64}$/);
    // ningún pliegue toca la prueba sellada
    const prueba = new Set(plan.particion.prueba);
    const vistos = plan.pliegues.pliegues.flatMap((p) => [
      ...p.entrenamiento,
      ...p.validacion,
    ]);
    expect(vistos.filter((f) => prueba.has(f))).toEqual([]);
  });

  it("bajas: por tiempo y por grupo, con el hueco del horizonte, sin unidades ni fechas cruzadas", () => {
    const plan = plan7(BAJAS.tabla, BAJAS.previas, HUELLA)!;
    expect(plan.parametros).toMatchObject({
      esquema: "tiempo-grupo",
      horizonte: 1,
      unidad: "meses",
    });
    expect(plan.pliegues.ok).toBe(true);
    expect(sinSolape(plan.verificacion!)).toBe(true);
  });

  it("k sale como en Probeta: 5, y 3 con muchas filas (paridad con el encarrilador)", () => {
    for (const filas of [10, 200, 20_000, 20_001, 50_000])
      expect(kPedidoPara(filas)).toBe(
        chooseCvK(filas, Number.POSITIVE_INFINITY),
      );
  });

  it("la dirección de la métrica: mayor es mejor salvo al estimar un número", () => {
    expect([
      direccionDe("binaria"),
      direccionDe("multiclase"),
      direccionDe("numerica"),
    ]).toEqual(["higher", "higher", "lower"]);
  });
});

describe("la compuerta de la etapa 7", () => {
  it("con la 6 sellada la 7 abre; sin correr la liga, la compuerta nombra «liga»", () => {
    expect(estados(CREDITO.cuaderno).slice(5, 8)).toEqual([
      "cumplida",
      "abierta",
      "no-construida",
    ]);
    const sinLiga = datosEtapa7(CREDITO.tabla, CREDITO.previas, HUELLA, null);
    expect(ETAPA_7.leer(sinLiga)).toEqual({ ok: true });
    expect(ETAPA_7.criterio(sinLiga, CREDITO.previas)).toEqual({
      tipo: "falta",
      faltan: ["liga"],
    });
    const r = registrar(PROTOCOLO_DS, CREDITO.cuaderno, 7, sinLiga, {
      huella: HUELLA,
      tabla: CREDITO.tabla,
      ahora: AHORA,
    });
    expect(r.ok).toBe(false);
  });

  it("con la liga corrida, se registra: la 7 queda cumplida y la 8 se ve sin construir", () => {
    const { cuaderno, datos } = registrado();
    expect(ETAPA_7.criterio(datos, CREDITO.previas)).toEqual({
      tipo: "cumple",
    });
    expect(estados(cuaderno).slice(6, 8)).toEqual([
      "cumplida",
      "no-construida",
    ]);
    // el veredicto y el valor p se pueden rehacer con lo registrado
    const c = datos.chequeos as Record<string, unknown>;
    const k = c.k as number;
    const porPliegue = (m: unknown) =>
      Array.from(
        { length: k },
        (_, j) => (m as Record<string, number>)[String(j + 1)]!,
      );
    expect(c.veredicto).toBe(
      comparar(porPliegue(c.base_costo), porPliegue(c.ganador_costo)).veredicto,
    );
    expect(c.perm_p).toBe(
      (1 + (c.perm_mejores as number)) /
        ((c.perm_n as number) - (c.perm_fallidas as number) + 1),
    );
  });

  it("la 7 no abre sin la 6 sellada", () => {
    const { cuaderno } = registrado();
    const copia = JSON.parse(JSON.stringify(cuaderno)) as Cuaderno;
    const seis = [...copia.evidencias].reverse().find((e) => e.etapa === 6)!;
    (seis.datos.chequeos as Record<string, unknown>).sello = "0".repeat(64);
    expect(estados(copia).slice(5, 7)).toEqual([
      "por-verificar:no-cuadra",
      "cerrada",
    ]);
  });

  it("un cuaderno editado a mano no gana nada: pliegues, sello, línea base, costo del ganador, veredicto o permutación", () => {
    const { cuaderno } = registrado();
    const casos: [string, (c: Record<string, unknown>) => void][] = [
      [
        "un pliegue de otro tamaño",
        (c) => ((c.pliegue_validacion as Record<string, number>)["1"]! += 1),
      ],
      ["otro sello de la 6", (c) => (c.sello_6 = "1".repeat(64))],
      [
        "una línea base más cara",
        (c) => ((c.base_costo as Record<string, number>)["1"]! += 1),
      ],
      [
        "un ganador más barato",
        (c) => ((c.ganador_costo as Record<string, number>)["1"]! -= 1),
      ],
      [
        "el veredicto al revés",
        (c) =>
          (c.veredicto = c.veredicto === "supera" ? "no-supera" : "supera"),
      ],
      [
        "una permutación de menos",
        (c) => (c.perm_mejores = (c.perm_mejores as number) + 3),
      ],
    ];
    for (const [caso, editar] of casos)
      expect(estados(editado(cuaderno, editar))[6], caso).toBe(
        "por-verificar:no-cuadra",
      );
  });

  it("lo que ninguna compuerta ve: el costo del ganador cambiado junto con todo lo que depende de él pasa (se declara)", () => {
    const { cuaderno } = registrado();
    const coherente = editado(cuaderno, (c) => {
      const k = c.k as number;
      const g = c.ganador_costo as Record<string, number>;
      for (let j = 1; j <= k; j++) g[String(j)] = 0;
      const b = Array.from(
        { length: k },
        (_, j) => (c.base_costo as Record<string, number>)[String(j + 1)]!,
      );
      const r = comparar(b, Array(k).fill(0));
      Object.assign(c, {
        diferencia_media: r.media,
        diferencia_ee: r.ee,
        ic_bajo: r.icBajo,
        ic_alto: r.icAlto,
        veredicto: r.veredicto,
      });
    });
    expect(estados(coherente)[6]).toBe("cumplida");
  });
});

describe("leer: la forma de lo registrado, también al importar", () => {
  const { datos } = registrado();
  const con = (
    cambio: (d: {
      respuestas: Record<string, unknown>;
      chequeos: Record<string, unknown>;
    }) => void,
  ) => {
    const copia = JSON.parse(JSON.stringify(datos)) as {
      respuestas: Record<string, unknown>;
      chequeos: Record<string, unknown>;
    };
    cambio(copia);
    return ETAPA_7.leer(copia as unknown as DatosEtapa);
  };

  it("lo honesto se lee, y trae todas sus claves", () => {
    expect(ETAPA_7.leer(datos)).toEqual({ ok: true });
    expect(Object.keys(datos.chequeos).sort()).toEqual([...CHEQUEOS_7].sort());
  });

  it("nombra el campo que no cuadra", () => {
    expect(con((d) => (d.respuestas.ganador = "hgb"))).toEqual({
      ok: false,
      campo: "respuestas.ganador",
    });
    expect(con((d) => (d.chequeos.extra = 1))).toEqual({
      ok: false,
      campo: "chequeos.extra",
    });
    expect(con((d) => delete d.chequeos.k)).toEqual({
      ok: false,
      campo: "chequeos.k",
    });
    expect(con((d) => (d.chequeos.k = "5"))).toEqual({
      ok: false,
      campo: "chequeos.k",
    });
    expect(con((d) => (d.chequeos.sello_6 = "no-es-hex"))).toEqual({
      ok: false,
      campo: "chequeos.sello_6",
    });
    expect(con((d) => (d.chequeos.veredicto = "quizás"))).toEqual({
      ok: false,
      campo: "chequeos.veredicto",
    });
    expect(con((d) => (d.chequeos.liga_cv = { hgb: "0.9" }))).toEqual({
      ok: false,
      campo: "chequeos.liga_cv",
    });
  });
});

describe("las trampas y el resumen", () => {
  const { datos } = registrado();
  const variante = (cambio: Record<string, unknown>): DatosEtapa => ({
    respuestas: {},
    chequeos: { ...datos.chequeos, ...cambio } as DatosEtapa["chequeos"],
  });
  const claves = (d: DatosEtapa) =>
    ETAPA_7.trampas(d, CREDITO.previas).map((t) => t.clave);

  it("lo que evitó: la liga probó sus modelos sin abrir la prueba", () => {
    const sinMirar = ETAPA_7.trampas(datos, CREDITO.previas).find(
      (t) => t.clave === "sin-mirar",
    )!;
    expect(sinMirar.params).toEqual({
      n: CORRIDA.roster.length,
      k: datos.chequeos.k,
    });
  });

  it("dice cuando no supera, cuando no hay señal, cuando k bajó y cuando hay pocos pliegues", () => {
    expect(claves(variante({ veredicto: "no-supera" }))).toContain("no-supera");
    expect(claves(variante({ senal: "sin-senal", perm_p: 0.4 }))).toContain(
      "sin-senal",
    );
    expect(
      claves(variante({ razon_k: "pocos-casos", k: 3, k_pedido: 5 })),
    ).toEqual(expect.arrayContaining(["k-pocos-casos", "pocos-pliegues"]));
    expect(claves(variante({ perm_fallidas: 2 }))).toContain("perm-fallidas");
  });

  it("el resumen del cuaderno: el ganador con su medida de selección, el veredicto y la señal", () => {
    const r = resumenEtapa7(datos);
    expect(r.ganador).toBe(CORRIDA.resultado.winner);
    expect(r.seleccion).toBe(
      CORRIDA.resultado.league.find((x) => x.name === r.ganador)!.cv!.mean,
    );
    expect(r.veredicto).toBe(datos.chequeos.veredicto);
    expect(r.n).toBe(CORRIDA.resultado.permutation.scores.length);
  });
});
