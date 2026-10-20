// Protocolo DS (S12), etapa 7: la definición de la etapa con el kit real, cumplido con la compuerta, y la
// corrida del worker que escribió la prueba de integración (tests/fixtures/contrato/validation-result.json,
// validada con el lector del contrato). Lo que tiene que valer:
//  · la 7 abre con la 6 sellada y no abre sin ella; sin correr la liga, la compuerta nombra «liga»;
//  · lo que la compuerta puede rehacer (pliegues, verificación, sello, columnas, línea base) se rehace, y lo
//    del worker se copia pero el veredicto y el valor p se rehacen con esos números: un número cambiado no
//    cuadra; uno cambiado con todo lo que depende de él, sí (límite declarado en el manual);
//  · con la 7 cumplida la 8 abre (S13); las trampas hablan de lo que pasó en tus datos.
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
import { empaquetar, leerArchivo } from "@/lib/protocolo/archivo";
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
      "cerrada",
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

  it("con la liga corrida, se registra: la 7 queda cumplida y la 8 abre", () => {
    const { cuaderno, datos } = registrado();
    expect(ETAPA_7.criterio(datos, CREDITO.previas)).toEqual({
      tipo: "cumple",
    });
    expect(estados(cuaderno).slice(6, 8)).toEqual(["cumplida", "abierta"]);
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

  it("«no supera» se registra: la compuerta pasa, la 7 queda cumplida y la trampa lo dice (G-Plan 2a, M1 del S12)", () => {
    // un ganador que nunca actúa: ni una predicción positiva, ni una probabilidad que cruce el umbral. Su costo
    // por pliegue no baja del de la línea base (que incluye «nunca actuar»), así que el intervalo no queda sobre cero
    const nunca: Corrida7 = {
      ...CORRIDA,
      resultado: {
        ...CORRIDA.resultado,
        oof: CORRIDA.resultado.oof.map((f) => ({
          pred: f.pred.map(() => 0),
          proba: f.proba ? f.proba.map(() => 0) : null,
        })),
      },
    };
    const datos = datosEtapa7(CREDITO.tabla, CREDITO.previas, HUELLA, nunca);
    expect(datos.chequeos.veredicto).toBe("no-supera");
    expect(ETAPA_7.criterio(datos, CREDITO.previas)).toEqual({
      tipo: "cumple",
    });
    const r = registrar(PROTOCOLO_DS, CREDITO.cuaderno, 7, datos, {
      huella: HUELLA,
      tabla: CREDITO.tabla,
      ahora: AHORA,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(estados(r.cuaderno).slice(6, 8)).toEqual(["cumplida", "abierta"]);
    expect(ETAPA_7.trampas!(datos, CREDITO.previas)).toContainEqual({
      clave: "no-supera",
      params: {},
    });
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

describe("leer acota los números del worker (B1 del S12)", () => {
  type Libre = Record<string, unknown>;
  const num = (c: Libre, k: string) => c[k] as number;
  const base = () => {
    const datos = datosEtapa7(CREDITO.tabla, CREDITO.previas, HUELLA, CORRIDA);
    return JSON.parse(JSON.stringify(datos)) as DatosEtapa;
  };
  const conCambio = (editar: (c: Libre) => void) => {
    const datos = base();
    editar(datos.chequeos as Libre);
    return datos;
  };

  it("lo que escribe la app pasa", () => {
    expect(ETAPA_7.leer(base())).toEqual({ ok: true });
  });

  const casos: [string, (c: Libre) => void, string][] = [
    ["k fraccionario", (c) => (c.k = 2.5), "k"],
    ["k_pedido negativo", (c) => (c.k_pedido = -1), "k_pedido"],
    ["semilla fraccionaria", (c) => (c.semilla = 1.5), "semilla"],
    ["perm_n fraccionario", (c) => (c.perm_n = 20.5), "perm_n"],
    ["perm_n negativo", (c) => (c.perm_n = -20), "perm_n"],
    [
      "más permutaciones fallidas que permutaciones",
      (c) => (c.perm_fallidas = num(c, "perm_n") + 1),
      "perm_fallidas",
    ],
    ["perm_mejores negativo", (c) => (c.perm_mejores = -10), "perm_mejores"],
    [
      "más permutaciones tan buenas como el ganador que permutaciones puntuadas",
      (c) => (c.perm_mejores = num(c, "perm_n") - num(c, "perm_fallidas") + 1),
      "perm_mejores",
    ],
    ["error estándar negativo", (c) => (c.ee = -0.1), "ee"],
    [
      "error estándar de la diferencia negativo",
      (c) => (c.diferencia_ee = -1),
      "diferencia_ee",
    ],
    [
      "costo de la línea base negativo",
      (c) => (c.base_costo = { ...(c.base_costo as object), "1": -1 }),
      "base_costo",
    ],
    [
      "costo del ganador negativo",
      (c) => (c.ganador_costo = { ...(c.ganador_costo as object), "1": -1 }),
      "ganador_costo",
    ],
    ["ganador fuera del roster", (c) => (c.ganador = "fantasma"), "ganador"],
    ["mejor fuera del roster", (c) => (c.mejor = "fantasma"), "mejor"],
    [
      "un modelo ajeno en la liga",
      (c) => (c.liga_cv = { ...(c.liga_cv as object), fantasma: 0.5 }),
      "liga_cv",
    ],
    [
      "una liga sin el puntaje del ganador",
      (c) => {
        const resto = { ...(c.liga_cv as Record<string, number>) };
        delete resto[c.ganador as string];
        c.liga_cv = resto;
      },
      "liga_cv",
    ],
    [
      "un estado de un modelo ajeno",
      (c) =>
        (c.liga_estados = [...(c.liga_estados as string[]), "fantasma:ok"]),
      "liga_estados",
    ],
    [
      "un estado mal formado",
      (c) =>
        (c.liga_estados = [...(c.liga_estados as string[]), "sin-dos-puntos"]),
      "liga_estados",
    ],
  ];

  it.each(casos)("%s se rechaza nombrando el campo", (_n, editar, campo) => {
    expect(ETAPA_7.leer(conCambio(editar))).toEqual({
      ok: false,
      campo: `chequeos.${campo}`,
    });
  });

  it("por el camino del usuario: un archivo exportado y editado con una cota rota no se importa, y dice el campo", () => {
    const { cuaderno } = registrado();
    type Archivo = { cuaderno: Cuaderno };
    const exportar = (editar: (c: Libre) => void) => {
      const archivo = JSON.parse(empaquetar(cuaderno, AHORA)) as Archivo;
      const ev = archivo.cuaderno.evidencias.findLast((e) => e.etapa === 7)!;
      editar(ev.datos.chequeos as Libre);
      return leerArchivo(JSON.stringify(archivo), PROTOCOLO_DS);
    };
    expect(exportar(() => undefined).ok).toBe(true);
    const roto = exportar((c) => (c.perm_mejores = -10));
    expect(roto.ok).toBe(false);
    if (!roto.ok && roto.rechazo.tipo === "invalid-format")
      expect(roto.rechazo.campo).toMatch(/datos\.chequeos\.perm_mejores$/);
    else throw new Error(JSON.stringify(roto));
  });
});
