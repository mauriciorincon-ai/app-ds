// Protocolo DS (S11), etapa 6 — la prueba sellada, sobre los CSV del kit y sobre tablas a mano: qué
// sugiere y por qué, cada motivo de falta, lo que se lee de lo registrado (con carnadas), las trampas
// en los números del usuario y la compuerta de verdad (la etapa 7 no abre sin el sello).
import { describe, expect, it } from "vitest";
import { evaluar, registrar } from "@/engine/protocolo/compuerta";
import {
  CLAVES_6,
  ENTRADA_6_VACIA,
  ETAPA_6,
  RAZON_MAX,
  TRAMPAS_6,
  datosEtapa6,
  entradaDesdeRespuestas,
  resumenEtapa6,
  sellosDistintos,
  type EntradaEtapa6,
} from "@/engine/protocolo/etapa6";
import type { EntradaEtapa2 } from "@/engine/protocolo/etapa2";
import type { DatosEtapa } from "@/engine/protocolo/etapas";
import { valoresDe } from "@/engine/protocolo/tabla";
import {
  AHORA,
  ENTRADA_BAJAS,
  ENTRADA_CREDITO,
  HUELLA,
  PROTOCOLO6,
  armar5,
  csv,
  etapa1De,
  type Armado,
} from "./protocolo-etapa4-helpers";

const CREDITO = armar5("credito-fuga-plantada.csv", "binaria", ENTRADA_CREDITO);
const BAJAS = armar5("bajas-con-fuga.csv", "binaria", ENTRADA_BAJAS);

const E = (x: Partial<EntradaEtapa6>): EntradaEtapa6 => ({
  ...ENTRADA_6_VACIA,
  ...x,
});
const NUEVAS = E({
  unidades: "nuevas",
  esquema: "tiempo-grupo",
  horizonte: 1,
  horizonteUnidad: "meses",
});
const CONOCIDAS = E({
  unidades: "conocidas",
  esquema: "tiempo",
  horizonte: 1,
  horizonteUnidad: "meses",
});

const datos = (a: Armado, e: EntradaEtapa6) =>
  datosEtapa6(a.tabla, e, a.previas, HUELLA);
const criterio = (d: DatosEtapa, a: Armado) => ETAPA_6.criterio(d, a.previas);
const faltan = (d: DatosEtapa, a: Armado) => {
  const v = criterio(d, a);
  return v.tipo === "falta" ? v.faltan : [];
};
const claves = (d: DatosEtapa, a: Armado, historia: DatosEtapa[] = []) =>
  ETAPA_6.trampas(d, a.previas, historia).map((t) => t.clave);
const trampa = (d: DatosEtapa, a: Armado, clave: string) =>
  ETAPA_6.trampas(d, a.previas).find((t) => t.clave === clave)?.params;

/** Un diseño con unidad y fecha: el objetivo «baja», la unidad «u», la fecha «mes». */
const PANEL: EntradaEtapa2 = {
  objetivo: "baja",
  positivo: "si",
  unidadColumna: "u",
  momentoColumna: "mes",
  momentoTexto: "",
  ordenFecha: null,
};

describe("sobre el kit de prueba", () => {
  it("crédito (sin fecha ni unidad): sugiere estratificada sin preguntar, 20 de cada 100 a la prueba, las dos clases en cada lado", () => {
    const d = datos(CREDITO, E({ esquema: "estratificada" }));
    const c = d.chequeos;
    expect(c.disponibles).toEqual(["estratificada"]);
    expect(c.pregunta_unidades).toBe(false);
    expect(c.sugerido).toBe("estratificada");
    expect([c.n_entrenamiento, c.n_prueba]).toEqual([160, 40]);
    expect(criterio(d, CREDITO)).toEqual({ tipo: "cumple" });
    expect(c.sello).toMatch(/^[0-9a-f]{64}$/);
    // la proporción de la clase rara se guarda en los dos lados
    const [e, p] = [
      c.clases_entrenamiento as Record<string, number>,
      c.clases_prueba as Record<string, number>,
    ];
    expect(e["1"]! / 160).toBeCloseTo(p["1"]! / 40, 1);
    expect(claves(d, CREDITO)).toEqual(["clase-rara"]);
  });

  it("bajas (fecha y unidad que se repite): pregunta por las unidades antes de sugerir", () => {
    const d = datos(BAJAS, E({}));
    expect(d.chequeos.pregunta_unidades).toBe(true);
    expect(d.chequeos.sugerido).toBe("");
    expect(faltan(d, BAJAS)).toEqual(
      expect.arrayContaining(["unidades", "esquema"]),
    );
  });

  it("bajas con unidades nuevas: por tiempo y por grupo, un mes de hueco, cero solape, y lo que evitó", () => {
    const d = datos(BAJAS, NUEVAS);
    const c = d.chequeos;
    expect(c.sugerido).toBe("tiempo-grupo");
    expect(criterio(d, BAJAS)).toEqual({ tipo: "cumple" });
    expect([c.solape_filas, c.solape_unidades, c.solape_tiempo]).toEqual([
      0, 0, 0,
    ]);
    expect(c.recientes_entrenamiento).toBe(0);
    expect(c.n_hueco).toBeGreaterThan(0);
    expect(c.fuera_unidades_prueba).toBeGreaterThan(0);
    // la prueba es de las fechas más recientes: después del entrenamiento y del hueco
    expect(String(c.fecha_min_prueba) > String(c.fecha_max_entrenamiento)).toBe(
      true,
    );
    expect(c.corte).toBe(c.fecha_min_prueba);
    const k = claves(d, BAJAS);
    expect(k).toEqual(
      expect.arrayContaining([
        "evito-tiempo",
        "evito-unidades",
        "hueco-meses-uno",
        "clase-rara",
      ]),
    );
    expect(trampa(d, BAJAS, "evito-tiempo")).toMatchObject({ corte: c.corte });
  });

  it("bajas con las mismas unidades: solo por tiempo; las unidades en los dos lados se dicen, no se esconden", () => {
    const d = datos(BAJAS, CONOCIDAS);
    expect(d.chequeos.sugerido).toBe("tiempo");
    expect(criterio(d, BAJAS)).toEqual({ tipo: "cumple" });
    const n = d.chequeos.solape_unidades as number;
    expect(n).toBeGreaterThan(0);
    expect(trampa(d, BAJAS, "unidades-conocidas")).toEqual({ n });
  });

  it("elegir otro esquema pide la razón; con ella cumple, y la trampa dice lo que se arriesga", () => {
    const sin = datos(BAJAS, { ...NUEVAS, esquema: "estratificada" });
    expect(faltan(sin, BAJAS)).toEqual(["razon"]);
    const con = datos(BAJAS, {
      ...NUEVAS,
      esquema: "estratificada",
      razon: "  Solo quiero una idea rápida  ",
    });
    expect(con.respuestas.razon).toBe("Solo quiero una idea rápida");
    expect(criterio(con, BAJAS)).toEqual({ tipo: "cumple" });
    expect(claves(con, BAJAS)).toEqual(
      expect.arrayContaining(["riesgo-tiempo", "riesgo-unidades"]),
    );
    // el cuaderno guarda el sugerido, el elegido y la razón
    const r = resumenEtapa6(con);
    expect([r.sugerido, r.esquema, r.razon]).toEqual([
      "tiempo-grupo",
      "estratificada",
      "Solo quiero una idea rápida",
    ]);
  });

  it("con el sugerido no se guarda razón, y lo que no corresponde al esquema tampoco", () => {
    const d = datos(
      CREDITO,
      E({
        esquema: "estratificada",
        razon: "x",
        horizonte: 3,
        horizonteUnidad: "dias",
      }),
    );
    expect(d.respuestas).toMatchObject({
      razon: "",
      horizonte: null,
      horizonte_unidad: "",
      unidades: "",
    });
  });

  it("ningún valor de la unidad viaja en lo registrado (solo conteos, clases y rangos de fecha)", () => {
    const texto = JSON.stringify(datos(BAJAS, NUEVAS));
    for (const valor of new Set(valoresDe(BAJAS.tabla, "cliente_id")))
      expect(texto).not.toContain(`"${valor}"`);
    for (const valor of new Set(valoresDe(BAJAS.tabla, "referencia")))
      expect(texto).not.toContain(valor);
  });

  it("la misma entrada da exactamente lo mismo (semilla del motor)", () => {
    expect(datos(BAJAS, NUEVAS)).toEqual(datos(BAJAS, NUEVAS));
    expect(datos(CREDITO, E({ esquema: "estratificada" }))).toEqual(
      datos(CREDITO, E({ esquema: "estratificada" })),
    );
  });
});

describe("cada motivo de falta", () => {
  it("sin las etapas 1 a 5", () => {
    const d = datos(CREDITO, E({ esquema: "estratificada" }));
    const sin5 = { ...CREDITO.previas };
    delete sin5[5];
    expect(ETAPA_6.criterio(d, sin5)).toEqual({
      tipo: "falta",
      faltan: ["etapas-previas"],
    });
  });

  it("un esquema que los datos no permiten", () => {
    expect(faltan(datos(CREDITO, E({ esquema: "grupo" })), CREDITO)).toContain(
      "esquema",
    );
  });

  it("un tamaño fuera de 10–40 o no entero", () => {
    for (const tamano of [5, 45, 20.5, null])
      expect(
        faltan(
          datos(CREDITO, E({ esquema: "estratificada", tamano })),
          CREDITO,
        ),
        String(tamano),
      ).toContain("tamano");
  });

  it("el horizonte en un esquema por tiempo: sin escribir, sin unidad, de más", () => {
    for (const extra of [
      { horizonte: null },
      { horizonteUnidad: "" as const },
      { horizonte: 121 },
      { horizonte: 1.5 },
    ])
      expect(
        faltan(datos(BAJAS, { ...CONOCIDAS, ...extra }), BAJAS),
        JSON.stringify(extra),
      ).toContain("horizonte");
    expect(faltan(datos(BAJAS, { ...CONOCIDAS, horizonte: 0 }), BAJAS)).toEqual(
      [],
    );
  });

  it("unidades nuevas en un panel donde toda unidad llega a la prueba: lo dice y propone «conocidas»", () => {
    const filas = ["u,mes,x,baja"];
    for (let u = 0; u < 12; u++)
      for (let m = 1; m <= 6; m++)
        filas.push(
          `U${u},2025-0${m}-15,${(u + m) % 5},${(u * 6 + m) % 4 === 0 ? "si" : "no"}`,
        );
    const a = armar5("panel.csv", "binaria", PANEL, csv(...filas));
    const d = datos(a, { ...NUEVAS, horizonte: 0 });
    expect(d.chequeos.n_entrenamiento).toBe(0);
    expect(faltan(d, a)).toEqual(["sin-nuevas"]);
    expect(criterio(datos(a, { ...CONOCIDAS, horizonte: 0 }), a)).toEqual({
      tipo: "cumple",
    });
  });

  it("dos clases: la prueba por tiempo sin ningún «sí» no se acepta", () => {
    const filas = ["u,mes,x,baja"];
    for (let i = 0; i < 40; i++) {
      const mes = 1 + Math.floor(i / 4);
      filas.push(
        `U${i},2025-${String(mes).padStart(2, "0")}-15,${i % 3},${mes <= 3 && i % 2 === 0 ? "si" : "no"}`,
      );
    }
    const a = armar5("tardio.csv", "binaria", { ...PANEL }, csv(...filas));
    // cada unidad aparece una vez: no hay pregunta, se sugiere por tiempo
    const d = datos(
      a,
      E({ esquema: "tiempo", horizonte: 0, horizonteUnidad: "meses" }),
    );
    expect(d.chequeos.sugerido).toBe("tiempo");
    expect(faltan(d, a)).toEqual(["clases-lado"]);
  });

  it("una sola fecha: por tiempo, el entrenamiento queda vacío", () => {
    const filas = ["u,mes,baja"];
    for (let i = 0; i < 20; i++)
      filas.push(`U${i},2025-01-15,${i % 3 === 0 ? "si" : "no"}`);
    const a = armar5("dia.csv", "binaria", PANEL, csv(...filas));
    const d = datos(
      a,
      E({ esquema: "tiempo", horizonte: 0, horizonteUnidad: "dias" }),
    );
    expect(faltan(d, a)).toEqual(["lado-vacio"]);
  });

  it("un solape que el esquema promete en cero no pasa (el criterio lee la cuenta de la tabla)", () => {
    const d = datos(BAJAS, NUEVAS);
    const editado = {
      ...d,
      chequeos: { ...d.chequeos, solape_unidades: 1 },
    };
    expect(faltan(editado, BAJAS)).toEqual(["solape"]);
  });
});

describe("lo registrado: la forma (también al importar)", () => {
  const honesta = datos(BAJAS, NUEVAS);
  const con = (
    parte: "respuestas" | "chequeos",
    cambio: Record<string, unknown>,
  ): DatosEtapa => ({
    ...honesta,
    [parte]: { ...honesta[parte], ...cambio },
  });

  it("la honesta se lee", () => {
    expect(ETAPA_6.leer(honesta)).toEqual({ ok: true });
  });

  it.each([
    ["respuestas", { otra: 1 }, "respuestas.otra"],
    ["respuestas", { unidades: "quizas" }, "respuestas.unidades"],
    ["respuestas", { esquema: "aleatoria" }, "respuestas.esquema"],
    ["respuestas", { razon: "x".repeat(RAZON_MAX + 1) }, "respuestas.razon"],
    ["respuestas", { tamano: "20" }, "respuestas.tamano"],
    ["respuestas", { horizonte: "1" }, "respuestas.horizonte"],
    [
      "respuestas",
      { horizonte_unidad: "semanas" },
      "respuestas.horizonte_unidad",
    ],
    ["chequeos", { intrusa: 1 }, "chequeos.intrusa"],
    ["chequeos", { sello: "zz" }, "chequeos.sello"],
    ["chequeos", { sello: "F".repeat(64) }, "chequeos.sello"],
    ["chequeos", { disponibles: ["al-azar"] }, "chequeos.disponibles"],
    ["chequeos", { clases_prueba: { si: "3" } }, "chequeos.clases_prueba"],
    ["chequeos", { n_prueba: "125" }, "chequeos.n_prueba"],
    ["chequeos", { corte: 20250915 }, "chequeos.corte"],
  ] as const)("%s %j → %s", (parte, cambio, campo) => {
    expect(ETAPA_6.leer(con(parte, cambio))).toEqual({ ok: false, campo });
  });

  it("una clave que falta se nombra", () => {
    const sinSello: Record<string, DatosEtapa["chequeos"][string]> = {
      ...honesta.chequeos,
    };
    delete sinSello.sello;
    expect(ETAPA_6.leer({ ...honesta, chequeos: sinSello })).toEqual({
      ok: false,
      campo: "chequeos.sello",
    });
  });

  it("las respuestas registradas vuelven a la entrada (ida y vuelta)", () => {
    expect(entradaDesdeRespuestas(honesta.respuestas)).toEqual(NUEVAS);
  });
});

describe("las trampas, en los números del usuario", () => {
  it("el hueco en días y en meses, con el singular; sin hueco, lo dice", () => {
    expect(
      trampa(
        datos(BAJAS, { ...CONOCIDAS, horizonte: 31, horizonteUnidad: "dias" }),
        BAJAS,
        "hueco-dias",
      ),
    ).toMatchObject({ h: 31 });
    expect(
      claves(
        datos(BAJAS, { ...CONOCIDAS, horizonte: 1, horizonteUnidad: "dias" }),
        BAJAS,
      ),
    ).toContain("hueco-dias-uno");
    expect(
      claves(datos(BAJAS, { ...CONOCIDAS, horizonte: 2 }), BAJAS),
    ).toContain("hueco-meses");
    expect(
      claves(datos(BAJAS, { ...CONOCIDAS, horizonte: 0 }), BAJAS),
    ).toContain("sin-hueco");
  });

  it("los sellos distintos se cuentan; volver a registrar la misma partición no suma", () => {
    const a = datos(BAJAS, NUEVAS);
    const b = datos(BAJAS, CONOCIDAS);
    expect(sellosDistintos([a, a])).toBe(1);
    expect(claves(a, BAJAS, [a])).not.toContain("sellos");
    const sellos = ETAPA_6.trampas(a, BAJAS.previas, [b, a]).find(
      (t) => t.clave === "sellos",
    );
    expect(sellos?.params).toEqual({ n: 2 });
  });

  it("varias clases: una clase que no llega a la prueba se nombra", () => {
    const filas = ["u,mes,x,plan"];
    for (let i = 0; i < 60; i++) {
      const mes = 1 + Math.floor(i / 6);
      const plan =
        mes <= 2 && i % 2 === 0
          ? "premium"
          : i % 3 === 0
            ? "basico"
            : "estandar";
      filas.push(
        `U${i},2025-${String(mes).padStart(2, "0")}-15,${i % 4},${plan}`,
      );
    }
    const a = armar5(
      "planes.csv",
      "multiclase",
      { ...PANEL, objetivo: "plan", positivo: "" },
      csv(...filas),
      etapa1De("multiclase"),
    );
    const d = datos(
      a,
      E({ esquema: "tiempo", horizonte: 0, horizonteUnidad: "meses" }),
    );
    expect(trampa(d, a, "clase-ausente")).toEqual({ clase: "premium" });
    // con varias clases, la clase ausente es un aviso, no una falta
    expect(criterio(d, a)).toEqual({ tipo: "cumple" });
  });

  it("la clase con menos casos: cuántos quedan para medirla, y si son menos de 10, el aviso de escasa", () => {
    // 200 filas (110 «0», 90 «1»): con una prueba de 20 de cada 100 quedan 18 «1»; con 10, quedan 9
    expect(
      trampa(
        datos(CREDITO, E({ esquema: "estratificada" })),
        CREDITO,
        "clase-rara",
      ),
    ).toEqual({ clase: "1", n: 18 });
    expect(
      trampa(
        datos(CREDITO, E({ esquema: "estratificada", tamano: 10 })),
        CREDITO,
        "clase-escasa",
      ),
    ).toEqual({ clase: "1", n: 9 });
  });

  it("todas las frases tienen su clave declarada", () => {
    for (const e of [
      NUEVAS,
      CONOCIDAS,
      { ...NUEVAS, esquema: "estratificada" as const, razon: "x" },
    ])
      for (const k of claves(datos(BAJAS, e), BAJAS))
        expect(TRAMPAS_6 as readonly string[]).toContain(k);
  });
});

describe("la compuerta", () => {
  it("con la 6 sellada, la 6 queda cumplida, la 7 abre y la 8 espera a la 7", () => {
    const r = registrar(PROTOCOLO6, BAJAS.cuaderno, 6, datos(BAJAS, NUEVAS), {
      huella: HUELLA,
      tabla: BAJAS.tabla,
      ahora: AHORA,
    });
    if (!r.ok) throw new Error(JSON.stringify(r.rechazo));
    const estados = evaluar(PROTOCOLO6, r.cuaderno, HUELLA, BAJAS.tabla).map(
      (e) => e.estado.tipo,
    );
    expect(estados.slice(0, 8)).toEqual([
      "cumplida",
      "cumplida",
      "cumplida",
      "cumplida",
      "cumplida",
      "cumplida",
      "abierta",
      "cerrada",
    ]);
  });

  it("registrar no le cree al sello que le llega: lo vuelve a calcular", () => {
    const d = datos(BAJAS, NUEVAS);
    const r = registrar(
      PROTOCOLO6,
      BAJAS.cuaderno,
      6,
      { ...d, chequeos: { ...d.chequeos, sello: "0".repeat(64) } },
      { huella: HUELLA, tabla: BAJAS.tabla, ahora: AHORA },
    );
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.rechazo).toEqual({
        tipo: "datos-invalidos",
        etapa: 6,
        campo: "chequeos",
      });
  });

  it("la 6 no abre sin la 5", () => {
    const { cuaderno } = BAJAS;
    const sin5 = {
      ...cuaderno,
      evidencias: cuaderno.evidencias.filter((e) => e.etapa !== 5),
    };
    const r = registrar(PROTOCOLO6, sin5, 6, datos(BAJAS, NUEVAS), {
      huella: HUELLA,
      tabla: BAJAS.tabla,
      ahora: AHORA,
    });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.rechazo).toEqual({
        tipo: "etapa-cerrada",
        etapa: 6,
        bloquea: 5,
      });
  });

  it("declara sus claves (las etiquetas del cuaderno las usan)", () => {
    const d = datos(BAJAS, NUEVAS);
    expect(Object.keys(d.respuestas)).toEqual([...CLAVES_6.respuestas]);
    expect(Object.keys(d.chequeos).sort()).toEqual(
      [...CLAVES_6.chequeos].sort(),
    );
  });
});
