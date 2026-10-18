// Protocolo DS (S9), etapa 4 — ¿existe al decidir?: lo que el código encuentra (por tarea, sobre
// los CSV del kit con cada cosa plantada), la comparación con la apuesta, el criterio regla por
// regla, los nombres de columna hostiles, la caché y el tamaño máximo. «detectó k de n» al final.
import { describe, expect, it } from "vitest";
import {
  CLAVES_4,
  ETAPA_4,
  TRAMPAS_4,
  chequeos4,
  columnasParaEntrenar,
  datosEtapa4,
  elegiblesEnBloque,
  entradaDesdeAnterior,
  estadosPermitidos,
  hallazgos4,
  ordenPorRiesgo,
} from "@/engine/protocolo/etapa4";
import type { DatosEtapa, Previas } from "@/engine/protocolo/etapas";
import { lista, mapa, numero, texto } from "@/engine/protocolo/valores";
import {
  ENTRADA_BAJAS,
  ENTRADA_CREDITO,
  FILAS_BAJAS,
  armar,
  datosBajas,
  inventario,
  tablaDe,
  tablaKit,
} from "./protocolo-etapa4-helpers";

const BAJAS = armar("bajas-con-fuga.csv", "binaria", ENTRADA_BAJAS);

function criterio(datos: DatosEtapa, previas: Previas = BAJAS.previas) {
  return ETAPA_4.criterio(datos, previas);
}

describe("lo que el código encuentra (kit)", () => {
  it("bajas-con-fuga: la fuga por vacíos, el identificador, las repetidas y la deriva, cada una donde se plantó", () => {
    const h = hallazgos4(BAJAS.tabla, BAJAS.previas)!;
    expect(h.columnas).toEqual([
      "cliente_id",
      "mes_observado",
      "plan",
      "canal",
      "antiguedad_meses",
      "tickets_soporte",
      "uso_mensual_gb",
      "motivo_baja",
      "referencia",
    ]);
    expect(h.roles).toEqual(["cliente_id", "mes_observado"]);
    expect(h.filas).toBe(480);
    expect(h.fuga).toEqual({});
    expect(h.fugaVacios).toEqual({ motivo_baja: 1 });
    expect(Object.keys(h.identificador)).toEqual(["referencia"]);
    expect(h.identificador.referencia).toBeCloseTo(476 / 480, 12);
    expect([h.duplicadosFila, h.duplicadosUnidadMomento]).toEqual([4, 7]);
    expect(h.derivaEstado).toBe("medida");
    expect([h.derivaCorte, h.derivaHistorico, h.derivaReciente]).toEqual([
      "2025-09-15",
      355,
      125,
    ]);
    // la deriva plantada alerta; lo demás, no
    expect(h.derivaPsi.canal).toBeGreaterThan(0.25);
    expect(h.derivaPsi.uso_mensual_gb).toBeGreaterThan(0.25);
    for (const c of ["plan", "antiguedad_meses", "tickets_soporte"])
      expect(h.derivaPsi[c]).toBeLessThan(0.1);
    // el KS sale solo de las numéricas
    expect(Object.keys(h.derivaKs).sort()).toEqual([
      "antiguedad_meses",
      "tickets_soporte",
      "uso_mensual_gb",
    ]);
    // las columnas sin filas para medir lo dicen, no se inventan
    expect(h.derivaSinMedir).toEqual(["motivo_baja"]);
    expect(h.alertasBase).toEqual([
      "cliente_id",
      "mes_observado",
      "canal",
      "uso_mensual_gb",
      "motivo_baja",
      "referencia",
    ]);
  });

  it.each([
    [
      "credito-fuga-plantada.csv",
      "binaria",
      ENTRADA_CREDITO,
      "monto_recuperado",
    ],
    [
      "planes-fuga-plantada.csv",
      "multiclase",
      { ...ENTRADA_CREDITO, objetivo: "plan", positivo: "" },
      "cargo_corporativo_usd",
    ],
    [
      "precio-fuga-plantada.csv",
      "numerica",
      { ...ENTRADA_CREDITO, objetivo: "precio_usd", positivo: "" },
      "impuesto_transferencia_usd",
    ],
  ] as const)(
    "%s (%s): la fuga plantada sale con la tarea que corresponde, y sin fecha la deriva dice por qué",
    (archivo, forma, entrada, columna) => {
      const a = armar(archivo, forma, entrada);
      const h = hallazgos4(a.tabla, a.previas)!;
      expect(Object.keys(h.fuga)).toEqual([columna]);
      expect(h.fuga[columna]).toBeGreaterThanOrEqual(0.98);
      expect(h.derivaEstado).toBe("sin-fecha");
      expect(h.derivaCorte).toBeNull();
      expect(h.duplicadosUnidadMomento).toBeNull();
      expect(h.derivaPsi).toEqual({});
    },
  );

  it("renovaciones: nada plantado, nada marcado (solo la unidad y la fecha por su rol)", () => {
    const a = armar("renovaciones-mensuales.csv", "binaria", {
      objetivo: "renovo",
      positivo: "si",
      unidadColumna: "cliente_id",
      momentoColumna: "mes_observado",
      momentoTexto: "",
      ordenFecha: null,
    });
    const h = hallazgos4(a.tabla, a.previas)!;
    expect(h.alertasBase).toEqual(["cliente_id", "mes_observado"]);
    expect([h.fuga, h.fugaVacios, h.identificador]).toEqual([{}, {}, {}]);
    expect([h.duplicadosFila, h.duplicadosUnidadMomento]).toEqual([0, 0]);
    expect(Object.keys(h.derivaPsi)).toHaveLength(4);
  });

  it("clientes-sucio: las 10 repetidas exactas y el identificador, aunque la edad traiga basura", () => {
    const a = armar("clientes-sucio.csv", "binaria", {
      ...ENTRADA_CREDITO,
      objetivo: "contrato",
      positivo: "si",
    });
    const h = hallazgos4(a.tabla, a.previas)!;
    expect(h.duplicadosFila).toBe(10);
    expect(Object.keys(h.identificador)).toEqual(["id_cliente"]);
  });
});

describe("lo que Probeta no ve, o ve a medias", () => {
  const previasA = (objetivo: string, positivo = "1"): Previas =>
    ({
      1: { respuestas: { forma: "binaria" }, chequeos: {} },
      2: {
        respuestas: {
          objetivo,
          positivo,
          unidad: "fila",
          unidad_columna: null,
          momento: "texto",
          momento_columna: null,
          orden_fecha: null,
        },
        chequeos: {},
      },
    }) as Previas;

  it("una columna vacía hasta que ocurre el resultado se marca, sea fecha o texto; el azar no", () => {
    const filas = Array.from({ length: 200 }, (_, i) => {
      const y = i % 4 === 0 ? 1 : 0;
      return [
        y === 1 ? `2026-0${1 + (i % 9)}-1${i % 9}` : "",
        y === 1 ? ["precio", "servicio", "mudanza"][i % 3]! : "",
        i % 2 === 0 ? "algo" : "",
        String(i % 7),
        String(y),
      ].join(",");
    });
    const t = tablaDe(["fecha_baja,motivo,notas,x,y", ...filas].join("\n"));
    const h = hallazgos4(t, previasA("y"))!;
    expect(Object.keys(h.fugaVacios).sort()).toEqual(["fecha_baja", "motivo"]);
    // la fecha no es una variable para el modelo (regla de Probeta): no entra a la fuga por valores
    expect(Object.keys(h.fuga)).toEqual([]);
  });

  it("un objetivo «1», «1.0» y «0» es dos clases: la fuga no se queda en «nada» por escribirlas distinto", () => {
    const filas = Array.from({ length: 150 }, (_, i) => {
      const y = i % 3 === 0 ? 0 : 1;
      return `${y},${y === 1 ? (i % 2 ? "1" : "1.0") : "0"}`;
    });
    const t = tablaDe(["x,y", ...filas].join("\n"));
    const h = hallazgos4(t, previasA("y"))!;
    expect(Object.keys(h.fuga)).toEqual(["x"]);
  });

  it("una numérica con basura sigue siendo numérica: ni identificador ni «categórica»", () => {
    const filas = Array.from({ length: 120 }, (_, i) => {
      const edad = i < 6 ? "error" : String(20 + i * 0.37);
      return `${edad},${i % 2}`;
    });
    const t = tablaDe(["edad,y", ...filas].join("\n"));
    const h = hallazgos4(t, previasA("y"))!;
    expect(h.identificador).toEqual({});
  });

  it("sin etapa 1 o 2, o con un objetivo que no está en el archivo, no hay hallazgos (no se inventan)", () => {
    const t = tablaDe("x,y\n1,0\n2,1\n");
    expect(hallazgos4(t, {})).toBeNull();
    expect(hallazgos4(t, { 1: previasA("y")[1]! })).toBeNull();
    expect(hallazgos4(t, previasA("no_existe"))).toBeNull();
  });
});

describe("la caché", () => {
  it("el mismo archivo con las mismas respuestas devuelve lo mismo, aunque lleguen en otro objeto", () => {
    const a = hallazgos4(BAJAS.tabla, BAJAS.previas);
    const copia: Previas = {
      1: { ...BAJAS.previas[1]! },
      2: { ...BAJAS.previas[2]! },
      3: BAJAS.previas[3]!,
    };
    expect(hallazgos4(BAJAS.tabla, copia)).toBe(a);
  });

  it("otras respuestas de la etapa 2, u otro archivo, se calculan aparte", () => {
    const a = hallazgos4(BAJAS.tabla, BAJAS.previas);
    const otroObjetivo = armar("bajas-con-fuga.csv", "binaria", {
      ...ENTRADA_BAJAS,
      unidadColumna: null,
    });
    expect(hallazgos4(BAJAS.tabla, otroObjetivo.previas)).not.toBe(a);
    const otraTabla = tablaKit("bajas-con-fuga.csv");
    expect(hallazgos4(otraTabla, BAJAS.previas)).not.toBe(a);
    expect(hallazgos4(otraTabla, BAJAS.previas)).toEqual(a);
  });

  it("lo guardado sale de la tabla, no de lo que registra el cuaderno", () => {
    const a = hallazgos4(BAJAS.tabla, BAJAS.previas)!;
    const forjado = chequeos4(a, []);
    (forjado.fuga_vacios as Record<string, number>).motivo_baja = 0;
    expect(hallazgos4(BAJAS.tabla, BAJAS.previas)!.fugaVacios.motivo_baja).toBe(
      1,
    );
  });
});

describe("la apuesta y su comparación", () => {
  it("aciertos, sorpresas y falsas alarmas, en el orden de la tabla aunque hayas hecho clic al revés", () => {
    const h = hallazgos4(BAJAS.tabla, BAJAS.previas)!;
    const d = datosEtapa4(
      BAJAS.tabla,
      inventario(h.columnas, {}, { apuesta: ["referencia", "motivo_baja"] }),
      BAJAS.previas,
    );
    expect(lista(d.respuestas, "apuesta")).toEqual([
      "motivo_baja",
      "referencia",
    ]);
    expect(lista(d.chequeos, "aciertos")).toEqual(["motivo_baja"]);
    expect(lista(d.chequeos, "sorpresas")).toEqual([]);
    expect(lista(d.chequeos, "falsas_alarmas")).toEqual(["referencia"]);
  });

  it("apostar «ninguna» deja todo lo que filtra como sorpresa; una columna apostada cuenta como alerta", () => {
    const h = hallazgos4(BAJAS.tabla, BAJAS.previas)!;
    const nada = chequeos4(h, []);
    expect(lista(nada, "sorpresas")).toEqual(["motivo_baja"]);
    const conPlan = chequeos4(h, ["plan"]);
    expect(lista(conPlan, "falsas_alarmas")).toEqual(["plan"]);
    expect(lista(conPlan, "alertas")).toContain("plan");
    expect(elegiblesEnBloque(conPlan)).not.toContain("plan");
    expect(elegiblesEnBloque(nada)).toEqual([
      "plan",
      "antiguedad_meses",
      "tickets_soporte",
    ]);
  });

  it("el orden por riesgo: lo que filtra, lo que apostaste, identificadores, deriva, roles, el resto", () => {
    const h = hallazgos4(BAJAS.tabla, BAJAS.previas)!;
    expect(ordenPorRiesgo(chequeos4(h, ["plan"]))).toEqual([
      "motivo_baja",
      "plan",
      "referencia",
      "canal",
      "uso_mensual_gb",
      "cliente_id",
      "mes_observado",
      "antiguedad_meses",
      "tickets_soporte",
    ]);
  });
});

describe("el criterio, regla por regla", () => {
  it("un inventario honesto y completo cumple, y registra lo mismo que calcula la tabla", () => {
    const d = datosBajas(BAJAS);
    expect(criterio(d)).toEqual({ tipo: "cumple" });
    expect(ETAPA_4.leer(d)).toEqual({ ok: true });
    expect(ETAPA_4.recalcular!(d, BAJAS.previas, BAJAS.tabla)).toEqual(d);
  });

  const con = (cambios: Record<string, readonly [string, string, string]>) =>
    datosBajas(BAJAS, { ...FILAS_BAJAS, ...cambios });
  const faltan = (d: DatosEtapa) => {
    const v = criterio(d);
    return v.tipo === "falta" ? v.faltan : [];
  };

  it.each([
    ["una columna sin estado", { plan: ["antes", "", ""] as const }, "estado"],
    [
      "«se llena después» pero «usar»",
      { motivo_baja: ["despues", "usar", "x"] as const },
      "despues-excluir",
    ],
    [
      "«no sé cuándo se llena» pero «usar»",
      { plan: ["nose", "usar", ""] as const },
      "nose-usar",
    ],
    [
      "«usar» sin decir cuándo se llena",
      { plan: ["", "usar", ""] as const },
      "usar-sin-antes",
    ],
    [
      "una columna con alerta en «usar» sin procedencia",
      { canal: ["antes", "usar", "  "] as const },
      "procedencia",
    ],
  ])("%s no cumple: falta «%s»", (_nombre, cambio, esperado) => {
    expect(faltan(con(cambio))).toContain(esperado);
  });

  it("«no sé» como estado cumple (la columna no entrena) y «después» con «excluir» también", () => {
    const sinPlanEnBloque = (fila: readonly [string, string, string]) =>
      datosBajas(
        BAJAS,
        { ...FILAS_BAJAS, plan: fila },
        { enBloque: ["antiguedad_meses", "tickets_soporte"] },
      );
    expect(criterio(sinPlanEnBloque(["nose", "nose", ""]))).toEqual({
      tipo: "cumple",
    });
    expect(criterio(sinPlanEnBloque(["despues", "excluir", ""]))).toEqual({
      tipo: "cumple",
    });
  });

  it("sin apuesta, o con «ninguna» y columnas, o con una columna que no existe o repetida, no cumple", () => {
    const base = datosBajas(BAJAS);
    const con = (apuesta: string[], ninguna: boolean): DatosEtapa => ({
      ...base,
      respuestas: {
        ...base.respuestas,
        apuesta,
        apuesta_ninguna: ninguna,
      },
    });
    expect(faltan(con([], false))).toContain("apuesta");
    expect(faltan(con(["plan"], true))).toContain("apuesta");
    expect(faltan(con(["no_existe"], false))).toContain("apuesta");
    expect(faltan(con(["plan", "plan"], false))).toContain("apuesta");
    expect(faltan(con([], true))).not.toContain("apuesta");
  });

  it("una columna apostada es una alerta: en «usar» pide su procedencia, y sin ella no cumple", () => {
    const h = hallazgos4(BAJAS.tabla, BAJAS.previas)!;
    const conPlan = (procedencia: string) =>
      datosEtapa4(
        BAJAS.tabla,
        inventario(
          h.columnas,
          { ...FILAS_BAJAS, plan: ["antes", "usar", procedencia] },
          {
            apuesta: ["plan"],
            enBloque: ["antiguedad_meses", "tickets_soporte"],
          },
        ),
        BAJAS.previas,
      );
    expect(faltan(conPlan(""))).toEqual(["procedencia"]);
    expect(criterio(conPlan("Lo registra el vendedor"))).toEqual({
      tipo: "cumple",
    });
  });

  it("la acción en bloque: solo columnas sin alerta, y solo si quedaron en antes + usar", () => {
    const h = hallazgos4(BAJAS.tabla, BAJAS.previas)!;
    const bloque = (enBloque: string[], filas = FILAS_BAJAS) =>
      faltan(
        datosEtapa4(
          BAJAS.tabla,
          inventario(h.columnas, filas, { enBloque }),
          BAJAS.previas,
        ),
      );
    expect(bloque(["plan", "tickets_soporte"])).toEqual([]);
    expect(bloque(["canal"])).toContain("bloque"); // tiene alerta
    expect(bloque(["no_existe"])).toContain("bloque");
    expect(bloque(["plan", "plan"])).toContain("bloque");
    expect(
      bloque(["plan"], { ...FILAS_BAJAS, plan: ["antes", "nose", ""] }),
    ).toContain("bloque");
    expect(
      bloque(["plan"], { ...FILAS_BAJAS, plan: ["nose", "excluir", ""] }),
    ).toContain("bloque");
  });

  it("todo en «excluir» cumple, pero no queda nada para entrenar y la etapa lo dice", () => {
    const todo = Object.fromEntries(
      lista(BAJAS.previas[3]!.chequeos, "columnas")?.map(() => []) ?? [],
    );
    const h = hallazgos4(BAJAS.tabla, BAJAS.previas)!;
    const filas = Object.fromEntries(
      h.columnas.map((c) => [c, ["", "excluir", ""] as const]),
    );
    void todo;
    const d = datosEtapa4(
      BAJAS.tabla,
      inventario(h.columnas, filas),
      BAJAS.previas,
    );
    expect(criterio(d)).toEqual({ tipo: "cumple" });
    expect(columnasParaEntrenar(d)).toEqual([]);
    expect(ETAPA_4.trampas(d, BAJAS.previas).map((t) => t.clave)).toContain(
      "nada-para-entrenar",
    );
  });

  it("solo entrenan las columnas en «usar»", () => {
    expect(columnasParaEntrenar(datosBajas(BAJAS))).toEqual([
      "plan",
      "canal",
      "antiguedad_meses",
      "tickets_soporte",
      "uso_mensual_gb",
    ]);
  });

  it("estadosPermitidos es la única fuente: «usar» solo con «antes»", () => {
    expect(estadosPermitidos("antes")).toEqual(["usar", "excluir", "nose"]);
    expect(estadosPermitidos("despues")).toEqual(["excluir"]);
    expect(estadosPermitidos("nose")).toEqual(["excluir", "nose"]);
    expect(estadosPermitidos("")).toEqual(["excluir", "nose"]);
  });

  it("sin las etapas previas, no cumple", () => {
    expect(ETAPA_4.criterio(datosBajas(BAJAS), {})).toEqual({
      tipo: "falta",
      faltan: ["etapas-previas"],
    });
  });
});

describe("nombres de columna hostiles", () => {
  const previas = (objetivo: string): Previas =>
    ({
      1: { respuestas: { forma: "binaria" }, chequeos: {} },
      2: {
        respuestas: {
          objetivo,
          positivo: "1",
          unidad: "fila",
          unidad_columna: null,
          momento: "texto",
          momento_columna: null,
          orden_fecha: null,
        },
        chequeos: {},
      },
      3: { respuestas: {}, chequeos: {} },
    }) as Previas;
  const filasY = Array.from({ length: 80 }, (_, i) => i % 2);

  it("«constructor», «toString» y «valueOf» son columnas como cualquiera: ni falsa alerta ni error", () => {
    const t = tablaDe(
      [
        "constructor,toString,valueOf,y",
        ...filasY.map((y, i) => `${i % 5},${i % 3},grupo${i % 3},${y}`),
      ].join("\n"),
    );
    const h = hallazgos4(t, previas("y"))!;
    expect(h.columnas).toEqual(["constructor", "toString", "valueOf"]);
    expect([h.fuga, h.fugaVacios, h.identificador]).toEqual([{}, {}, {}]);
    const d = datosEtapa4(
      t,
      inventario(h.columnas, {
        constructor: ["antes", "usar", ""] as const,
        toString: ["", "excluir", ""] as const,
        valueOf: ["", "nose", ""] as const,
      }),
      previas("y"),
    );
    expect(ETAPA_4.criterio(d, previas("y"))).toEqual({ tipo: "cumple" });
  });

  it("una fuga en una columna llamada «constructor» se encuentra y se guarda con su nombre", () => {
    const t = tablaDe(
      [
        "constructor,y",
        ...filasY.map((y) => `${y === 1 ? "alto" : "bajo"},${y}`),
      ].join("\n"),
    );
    const h = hallazgos4(t, previas("y"))!;
    expect(Object.hasOwn(h.fuga, "constructor")).toBe(true);
    expect(mapa(chequeos4(h, []), "fuga")).toEqual({ constructor: 1 });
  });

  it("«__proto__» y los nombres repetidos (también el del objetivo) no cumplen", () => {
    for (const encabezado of ["__proto__,a,y", "a,a,y", "y,a,y"]) {
      const t = tablaDe(
        [encabezado, ...filasY.map((y, i) => `${i % 5},${i % 3},${y}`)].join(
          "\n",
        ),
      );
      const h = hallazgos4(t, previas("y"));
      const d = datosEtapa4(
        t,
        inventario(
          h?.columnas ?? [],
          Object.fromEntries(
            (h?.columnas ?? []).map((c) => [c, ["", "excluir", ""] as const]),
          ),
        ),
        previas("y"),
      );
      const v = ETAPA_4.criterio(d, previas("y"));
      expect(
        v.tipo === "falta" && v.faltan.includes("nombres-columnas"),
        encabezado,
      ).toBe(true);
    }
  });
});

describe("las trampas", () => {
  it("dicen lo que la etapa evitó, con las columnas del usuario, y solo con claves conocidas", () => {
    const d = datosBajas(BAJAS);
    const trampas = ETAPA_4.trampas(d, BAJAS.previas);
    const claves = trampas.map((t) => t.clave);
    for (const c of claves) expect(TRAMPAS_4).toContain(c);
    expect(claves).toEqual(
      expect.arrayContaining([
        "fuga-vacios-excluida",
        "filas-repetidas",
        "unidad-momento-repetida",
        "deriva",
      ]),
    );
    const por = (c: string) => trampas.find((t) => t.clave === c)!.params;
    expect(por("fuga-vacios-excluida")).toEqual({
      columna: "motivo_baja",
      n: 1,
    });
    expect(por("filas-repetidas")).toEqual({ n: 4, filas: 480 });
    expect(por("unidad-momento-repetida")).toEqual({ n: 7 });
    expect(por("deriva").columna).toBe("uso_mensual_gb");
  });

  it("si dejas la columna que filtra en «usar», la trampa lo dice distinto", () => {
    const d = datosBajas(BAJAS, {
      ...FILAS_BAJAS,
      motivo_baja: ["antes", "usar", "Lo escribe soporte"],
    });
    expect(ETAPA_4.trampas(d, BAJAS.previas).map((t) => t.clave)).toContain(
      "fuga-vacios-usada",
    );
  });

  it("sin fecha, o con una sola, la deriva dice por qué no se midió", () => {
    const a = armar("credito-fuga-plantada.csv", "binaria", ENTRADA_CREDITO);
    const h = hallazgos4(a.tabla, a.previas)!;
    const d = datosEtapa4(
      a.tabla,
      inventario(
        h.columnas,
        Object.fromEntries(
          h.columnas.map((c) => [c, ["", "excluir", ""] as const]),
        ),
      ),
      a.previas,
    );
    const claves = ETAPA_4.trampas(d, a.previas).map((t) => t.clave);
    expect(claves).toContain("sin-fecha");
    expect(claves).toContain("fuga-excluida");
  });

  it("un archivo sin nada que marcar lo dice con cautela: «sin hallazgos»", () => {
    const a = armar("marketing-campania.csv", "binaria", {
      ...ENTRADA_CREDITO,
      objetivo: "convirtio",
    });
    const h = hallazgos4(a.tabla, a.previas)!;
    const d = datosEtapa4(
      a.tabla,
      inventario(
        h.columnas,
        Object.fromEntries(
          h.columnas.map((c) => [c, ["antes", "usar", ""] as const]),
        ),
      ),
      a.previas,
    );
    expect(ETAPA_4.trampas(d, a.previas).map((t) => t.clave)).toContain(
      "sin-hallazgos",
    );
  });
});

describe("las trampas no afirman lo que el usuario aún no respondió (auditoría S9, A1)", () => {
  it("con el inventario sin responder, no dice «la dejaste fuera» ni «nada para entrenar»", () => {
    const d = datosBajas(BAJAS, {}, {});
    const claves = ETAPA_4.trampas(d, BAJAS.previas).map((t) => t.clave);
    expect(claves).not.toContain("fuga-excluida");
    expect(claves).not.toContain("fuga-vacios-excluida");
    expect(claves).not.toContain("nada-para-entrenar");
    // lo que sí se sabe sin respuestas, sigue
    expect(claves).toContain("filas-repetidas");
  });

  it("con columnas sin responder o en «no sé», «excluida» no se dice; con todas excluidas sí", () => {
    const mezcla = datosBajas(
      BAJAS,
      { ...FILAS_BAJAS, motivo_baja: ["despues", "nose", ""] },
      {},
    );
    expect(
      ETAPA_4.trampas(mezcla, BAJAS.previas).map((t) => t.clave),
    ).not.toContain("fuga-vacios-excluida");
    const todas = datosBajas(
      BAJAS,
      Object.fromEntries(
        Object.keys(FILAS_BAJAS).map((c) => [c, ["despues", "excluir", ""]]),
      ),
      {},
    );
    expect(ETAPA_4.trampas(todas, BAJAS.previas).map((t) => t.clave)).toContain(
      "fuga-vacios-excluida",
    );
  });

  it("«nada para entrenar» solo cuando todo está respondido y nada quedó en «usar»", () => {
    const sinUsar = datosBajas(
      BAJAS,
      Object.fromEntries(
        Object.keys(FILAS_BAJAS).map((c) => [c, ["antes", "nose", ""]]),
      ),
      {},
    );
    expect(
      ETAPA_4.trampas(sinUsar, BAJAS.previas).map((t) => t.clave),
    ).toContain("nada-para-entrenar");
    const aMedias = datosBajas(
      BAJAS,
      { ...FILAS_BAJAS, plan: ["", "", ""] },
      {},
    );
    expect(
      ETAPA_4.trampas(aMedias, BAJAS.previas).map((t) => t.clave),
    ).not.toContain("nada-para-entrenar");
  });
});

describe("entradaDesdeAnterior", () => {
  it("realinea por NOMBRE cuando cambian las columnas, y una columna con alerta sale del bloque", () => {
    const anterior = datosBajas(BAJAS);
    const nuevas = ["tickets_soporte", "columna_nueva", "plan"];
    const e = entradaDesdeAnterior(anterior, nuevas, ["plan"]);
    expect(e.estado).toEqual(["usar", "", "usar"]);
    expect(e.momento).toEqual(["antes", "", "antes"]);
    expect(e.enBloque).toEqual(["tickets_soporte"]);
    expect(entradaDesdeAnterior(null, nuevas, []).estado).toEqual(["", "", ""]);
  });

  it("la apuesta se queda con lo que sigue existiendo", () => {
    const h = hallazgos4(BAJAS.tabla, BAJAS.previas)!;
    const anterior = datosEtapa4(
      BAJAS.tabla,
      inventario(h.columnas, FILAS_BAJAS, { apuesta: ["plan", "motivo_baja"] }),
      BAJAS.previas,
    );
    expect(
      entradaDesdeAnterior(anterior, ["plan", "otra"], []).apuesta,
    ).toEqual(["plan"]);
    const ninguna = datosBajas(BAJAS);
    expect(entradaDesdeAnterior(ninguna, ["plan"], []).ninguna).toBe(true);
  });
});

describe("el lector (regla 19): cada campo trae su carnada", () => {
  const BUENO = datosBajas(BAJAS);
  const equivocado = (valor: unknown) =>
    typeof valor === "string" ? 123456 : "__carnada__";

  it("[contrato 4 · respuestas y chequeos] detectó k de n", () => {
    let detectados = 0;
    let total = 0;
    for (const [parte, claves] of [
      ["respuestas", CLAVES_4.respuestas],
      ["chequeos", CLAVES_4.chequeos],
    ] as const)
      for (const clave of claves) {
        total += 1;
        const malo: DatosEtapa = {
          ...BUENO,
          [parte]: {
            ...BUENO[parte],
            [clave]: equivocado(BUENO[parte][clave]),
          },
        };
        const lectura = ETAPA_4.leer(malo);
        if (!lectura.ok && lectura.campo === `${parte}.${clave}`)
          detectados += 1;
      }
    expect(detectados, `detectó ${detectados} de ${total}`).toBe(total);
    expect(total).toBe(CLAVES_4.respuestas.length + CLAVES_4.chequeos.length);
  });

  it("una clave de más, o de menos, se rechaza nombrándola", () => {
    expect(
      ETAPA_4.leer({
        ...BUENO,
        respuestas: { ...BUENO.respuestas, intrusa: 1 },
      }),
    ).toEqual({
      ok: false,
      campo: "respuestas.intrusa",
    });
    const { apuesta: _quitada, ...sin } = BUENO.respuestas;
    void _quitada;
    expect(ETAPA_4.leer({ ...BUENO, respuestas: sin })).toEqual({
      ok: false,
      campo: "respuestas.apuesta",
    });
    expect(
      ETAPA_4.leer({ ...BUENO, chequeos: { ...BUENO.chequeos, intrusa: 1 } }),
    ).toEqual({
      ok: false,
      campo: "chequeos.intrusa",
    });
  });

  it("listas desalineadas, valores fuera de la lista y procedencias larguísimas se rechazan", () => {
    const n = lista(BUENO.chequeos, "columnas")!.length;
    const con = (clave: string, valor: unknown) =>
      ETAPA_4.leer({
        ...BUENO,
        respuestas: {
          ...BUENO.respuestas,
          [clave]: valor,
        } as DatosEtapa["respuestas"],
      });
    expect(con("estado", Array(n - 1).fill("usar"))).toEqual({
      ok: false,
      campo: "respuestas.estado",
    });
    expect(con("momento", Array(n).fill("ayer"))).toEqual({
      ok: false,
      campo: "respuestas.momento",
    });
    expect(con("estado", Array(n).fill("quizá"))).toEqual({
      ok: false,
      campo: "respuestas.estado",
    });
    expect(con("procedencia", Array(n).fill("x".repeat(201)))).toEqual({
      ok: false,
      campo: "respuestas.procedencia",
    });
    expect(numero(BUENO.chequeos, "filas")).toBe(480);
    expect(texto(BUENO.chequeos, "deriva_estado")).toBe("medida");
  });
});

describe("el tamaño máximo (50 000 filas × 80 columnas)", () => {
  it("se calcula una vez; después, la caché lo devuelve al instante", () => {
    const filas = 50_000;
    let semilla = 12345;
    const azar = () => {
      semilla = (Math.imul(semilla, 1664525) + 1013904223) | 0;
      return ((semilla >>> 0) % 100_000) / 100_000;
    };
    const categorias = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const encabezados = [
      "unidad",
      "fecha",
      ...Array.from({ length: 38 }, (_, i) => `n${i}`),
      ...Array.from({ length: 38 }, (_, i) => `c${i}`),
      "y",
    ];
    const rows: string[][] = [];
    for (let i = 0; i < filas; i++) {
      const fila = [
        `U${i % 9000}`,
        `2025-${String(1 + (i % 12)).padStart(2, "0")}-15`,
      ];
      for (let k = 0; k < 38; k++) fila.push(azar().toFixed(2));
      for (let k = 0; k < 38; k++)
        fila.push(categorias[Math.floor(azar() * 8)]!);
      fila.push(azar() < 0.2 ? "1" : "0");
      rows.push(fila);
    }
    expect(encabezados).toHaveLength(79);
    const tabla = { headers: encabezados, rows };
    const previas: Previas = {
      1: { respuestas: { forma: "binaria" }, chequeos: {} },
      2: {
        respuestas: {
          objetivo: "y",
          positivo: "1",
          unidad: "columna",
          unidad_columna: "unidad",
          momento: "columna",
          momento_columna: "fecha",
          orden_fecha: null,
        },
        chequeos: {},
      },
    };
    const t0 = performance.now();
    const h = hallazgos4(tabla, previas)!;
    const frio = performance.now() - t0;
    expect(h.columnas).toHaveLength(78);
    expect(h.derivaEstado).toBe("medida");
    const t1 = performance.now();
    expect(hallazgos4(tabla, previas)).toBe(h);
    expect(performance.now() - t1).toBeLessThan(50);
    // generoso a propósito: la cifra medida va al cierre, no es una compuerta de la CI
    expect(frio).toBeLessThan(60_000);
  }, 120_000);
});
