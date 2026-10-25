// @vitest-environment node
/**
 * S18 (ADR 026) — el plan de limpieza: el código PROPONE (umbrales declarados, determinista) y lo aprobado se APLICA como una
 * instrucción al preprocesador, nunca sobre la tabla. Lo que tiene que valer: cada umbral propone en el borde y no un poco
 * antes; lo no decidido no se aplica; un paso sobre el objetivo o sobre una columna que se quita no se aplica y se dice;
 * dos corridas dan lo mismo.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analizarIngesta } from "@/engine/ingesta";
import {
  ATIPICO_CELDAS_MINIMAS,
  CODIGO_DISTINTOS_MAXIMOS,
  MAXIMO_PASOS,
  proponerPlan,
  VACIO_CATEGORICA_CELDAS_MINIMAS,
  VACIO_NUMERICA_CELDAS_MINIMAS,
} from "@/engine/limpieza";
import {
  aplicarDecisiones,
  especificacionDe,
  type PasoLimpieza,
} from "@/engine/limpieza-plan";
import { sanitizeTable } from "@/engine/sanitize";
import { parseCsvWithLimits, type CsvTable } from "@/lib/ds/csv";

/** Una tabla de `n` filas con columnas dadas por función de la fila. */
function tabla(
  n: number,
  columnas: Record<string, (i: number) => string>,
): CsvTable {
  const headers = Object.keys(columnas);
  return {
    headers,
    rows: Array.from({ length: n }, (_, i) =>
      headers.map((h) => columnas[h]!(i)),
    ),
  };
}
const ids = (plan: readonly PasoLimpieza[]) => plan.map((p) => p.id);

describe("atípicos: por cuantiles, cuando hay varios muy lejos", () => {
  const base = (extremos: number) =>
    tabla(100, { x: (i) => (i < extremos ? "100000" : String(10 + (i % 7))) });

  it("propone con tres valores muy lejos y no con dos", () => {
    expect(ids(proponerPlan(base(ATIPICO_CELDAS_MINIMAS)))).toEqual([
      "atipicos-cuantiles:x",
    ]);
    expect(proponerPlan(base(ATIPICO_CELDAS_MINIMAS - 1))).toEqual([]);
  });

  it("dice cuántos son y de cuántos", () => {
    expect(proponerPlan(base(5))[0]).toMatchObject({ celdas: 5, de: 100 });
  });

  it("no mira una columna con menos de 20 valores", () => {
    const t = tabla(19, { x: (i) => (i < 5 ? "100000" : String(10 + i)) });
    expect(proponerPlan(t)).toEqual([]);
  });
});

describe("vacíos", () => {
  it("una numérica: desde 10 celdas y 5 %; una marca de «estaba vacío»", () => {
    const con = (vacias: number) =>
      tabla(100, { x: (i) => (i < vacias ? "" : String(i)) });
    expect(ids(proponerPlan(con(VACIO_NUMERICA_CELDAS_MINIMAS)))).toEqual([
      "vacio-indicador:x",
    ]);
    expect(proponerPlan(con(VACIO_NUMERICA_CELDAS_MINIMAS - 1))).toEqual([]);
  });

  it("una numérica casi toda vacía (más de 60 %) no se propone: casi no hay columna", () => {
    expect(
      proponerPlan(tabla(100, { x: (i) => (i < 70 ? "" : String(i)) })),
    ).toEqual([]);
  });

  it("una categórica: desde 5 celdas y 2 %; «sin dato» como categoría", () => {
    const con = (vacias: number) =>
      tabla(100, { c: (i) => (i < vacias ? "NA" : ["a", "b", "c"][i % 3]!) });
    expect(ids(proponerPlan(con(VACIO_CATEGORICA_CELDAS_MINIMAS)))).toEqual([
      "vacio-categoria:c",
    ]);
    expect(proponerPlan(con(VACIO_CATEGORICA_CELDAS_MINIMAS - 1))).toEqual([]);
  });

  it("una categórica toda vacía no se propone", () => {
    expect(proponerPlan(tabla(50, { c: () => "" }))).toEqual([]);
  });
});

describe("un código escrito con números", () => {
  const col = (nombre: string, distintos: number, entero = true) =>
    tabla(60, {
      [nombre]: (i) =>
        entero ? String(1 + (i % distintos)) : `${1 + (i % distintos)}.5`,
    });

  it("se propone si es entero, tiene pocos valores y el nombre lo dice", () => {
    expect(ids(proponerPlan(col("codigo_zona", 5)))).toEqual([
      "tipo-categoria:codigo_zona",
    ]);
    expect(ids(proponerPlan(col("Region", 5)))).toEqual([
      "tipo-categoria:Region",
    ]);
  });

  it("no, si el nombre no lo dice (una cantidad pequeña es una cantidad)", () => {
    expect(proponerPlan(col("hijos", 5))).toEqual([]);
  });

  it("no, con decimales, con demasiados valores distintos o con uno solo", () => {
    expect(proponerPlan(col("codigo", 5, false))).toEqual([]);
    expect(proponerPlan(col("codigo", CODIGO_DISTINTOS_MAXIMOS + 1))).toEqual(
      [],
    );
    expect(proponerPlan(col("codigo", 1))).toEqual([]);
  });
});

describe("datos personales: la columna se propone quitar y no recibe otras propuestas", () => {
  it("quita la columna avisada y dice qué parece guardar", () => {
    const t = tabla(40, {
      correo: (i) => `u${i}@example.com`,
      x: (i) => (i < 8 ? "" : String(i)),
    });
    const plan = proponerPlan(t, [
      { column: "correo", tipo: "correo", via: "valor", cuota: 1 },
    ]);
    expect(plan[0]).toMatchObject({
      id: "quitar-columna:correo",
      tipo: "quitar-columna",
      personal: "correo",
      celdas: 40,
    });
    expect(plan.filter((p) => p.columna === "correo")).toHaveLength(1);
  });
});

describe("el plan", () => {
  const grande = tabla(200, {
    ...Object.fromEntries(
      Array.from({ length: 20 }, (_, k) => [
        `v${k}`,
        (i: number) => (i < 30 + k ? "" : String(i * (k + 1))),
      ]),
    ),
  });

  it("tiene como máximo 12 pasos, los de más alcance primero", () => {
    const plan = proponerPlan(grande);
    expect(plan).toHaveLength(MAXIMO_PASOS);
    const cuotas = plan.map((p) => p.celdas / p.de);
    expect([...cuotas].sort((a, b) => b - a)).toEqual(cuotas);
  });

  it("es determinista", () => {
    expect(proponerPlan(grande)).toEqual(proponerPlan(grande));
  });

  it("no cambia la tabla", () => {
    const antes = JSON.stringify(grande);
    proponerPlan(grande);
    expect(JSON.stringify(grande)).toBe(antes);
  });

  it("el kit de prueba da planes razonables: los archivos sin nada que proponer no traen nada", () => {
    const leer = (nombre: string) => {
      const l = parseCsvWithLimits(
        readFileSync(`docs/kit-de-prueba/${nombre}`, "utf8"),
      );
      if (!l.ok) throw new Error(nombre);
      return l.table;
    };
    expect(proponerPlan(leer("marketing-campania.csv"))).toEqual([]);
    const analizar = (nombre: string) => {
      const cruda = leer(nombre);
      return analizarIngesta(cruda, sanitizeTable(cruda).table);
    };
    expect(analizar("clientes-sucio.csv").decisiones).toEqual({});
    const personales = analizar("clientes-con-datos-personales.csv");
    // el correo y el documento (un valor distinto por fila) ya los aparta el saneamiento: se avisa, pero no se propone quitarlos
    expect(ids(personales.plan).sort()).toEqual([
      "quitar-columna:nombre_completo",
      "quitar-columna:telefono",
    ]);
    expect(personales.personales.map((a) => `${a.column}:${a.fuera}`).sort()).toEqual([
      "correo:true",
      "documento:true",
      "nombre_completo:false",
      "telefono:false",
    ]);
  });
});

describe("aplicarDecisiones", () => {
  const plan: PasoLimpieza[] = [
    {
      id: "quitar-columna:correo",
      tipo: "quitar-columna",
      columna: "correo",
      celdas: 10,
      de: 10,
      personal: "correo",
    },
    {
      id: "tipo-categoria:zona",
      tipo: "tipo-categoria",
      columna: "zona",
      celdas: 4,
      de: 10,
    },
    {
      id: "vacio-indicador:edad",
      tipo: "vacio-indicador",
      columna: "edad",
      celdas: 3,
      de: 10,
    },
    {
      id: "vacio-categoria:canal",
      tipo: "vacio-categoria",
      columna: "canal",
      celdas: 2,
      de: 10,
    },
    {
      id: "atipicos-cuantiles:ingreso",
      tipo: "atipicos-cuantiles",
      columna: "ingreso",
      celdas: 3,
      de: 10,
    },
    {
      id: "atipicos-cuantiles:zona",
      tipo: "atipicos-cuantiles",
      columna: "zona",
      celdas: 3,
      de: 10,
    },
  ];

  it("lo no decidido no se aplica", () => {
    const aplicado = aplicarDecisiones(plan, {}, "y");
    expect(aplicado.quitar).toEqual([]);
    expect(aplicado.categoricas).toEqual([]);
    expect(aplicado.limpieza).toBeNull();
    expect(
      aplicado.registro.every(
        (r) => !r.aplicado && r.decision === "sin-decidir",
      ),
    ).toBe(true);
  });

  it("lo rechazado tampoco, y queda registrado como rechazado", () => {
    const aplicado = aplicarDecisiones(
      plan,
      Object.fromEntries(plan.map((p) => [p.id, "rechazado" as const])),
      "y",
    );
    expect(aplicado.limpieza).toBeNull();
    expect(aplicado.registro.map((r) => r.decision)).toEqual(
      Array(plan.length).fill("rechazado"),
    );
  });

  it("lo aprobado se aplica: columnas que se quitan, códigos que pasan a categoría y la especificación del preprocesador", () => {
    const aplicado = aplicarDecisiones(
      plan,
      {
        "quitar-columna:correo": "aprobado",
        "tipo-categoria:zona": "aprobado",
        "vacio-indicador:edad": "aprobado",
        "vacio-categoria:canal": "aprobado",
        "atipicos-cuantiles:ingreso": "aprobado",
      },
      "y",
    );
    expect(aplicado.quitar).toEqual(["correo"]);
    expect(aplicado.categoricas).toEqual(["zona"]);
    expect(aplicado.limpieza).toEqual({
      indicador_vacio: ["edad"],
      sin_dato: ["canal"],
      cuantiles: ["ingreso"],
    });
    expect(especificacionDe(aplicado.registro)).toEqual(aplicado.limpieza);
  });

  it("un paso sobre el objetivo no se aplica y el registro lo dice", () => {
    const aplicado = aplicarDecisiones(
      plan,
      { "vacio-indicador:edad": "aprobado" },
      "edad",
    );
    expect(aplicado.limpieza).toBeNull();
    expect(aplicado.registro.find((r) => r.columna === "edad")).toMatchObject({
      decision: "aprobado",
      aplicado: false,
      motivo: "objetivo",
    });
  });

  it("un paso numérico sobre una columna que ahora es categoría, o que se quitó, no se aplica", () => {
    const aplicado = aplicarDecisiones(
      plan,
      {
        "tipo-categoria:zona": "aprobado",
        "atipicos-cuantiles:zona": "aprobado",
      },
      "y",
    );
    expect(
      aplicado.registro.find((r) => r.id === "atipicos-cuantiles:zona"),
    ).toMatchObject({
      aplicado: false,
      motivo: "ahora-categoria",
    });
    expect(aplicado.limpieza).toBeNull();
    const quitada = aplicarDecisiones(
      [
        {
          id: "quitar-columna:edad",
          tipo: "quitar-columna",
          columna: "edad",
          celdas: 5,
          de: 5,
          personal: "nombre",
        },
        {
          id: "vacio-indicador:edad",
          tipo: "vacio-indicador",
          columna: "edad",
          celdas: 3,
          de: 10,
        },
      ],
      { "quitar-columna:edad": "aprobado", "vacio-indicador:edad": "aprobado" },
      "y",
    );
    expect(quitada.quitar).toEqual(["edad"]);
    expect(quitada.registro[1]).toMatchObject({
      aplicado: false,
      motivo: "columna-quitada",
    });
  });

  it("aplicado dos veces, da exactamente lo mismo", () => {
    const decisiones = {
      "quitar-columna:correo": "aprobado",
      "vacio-indicador:edad": "aprobado",
    } as const;
    expect(JSON.stringify(aplicarDecisiones(plan, decisiones, "y"))).toBe(
      JSON.stringify(aplicarDecisiones(plan, decisiones, "y")),
    );
  });

  it("el registro lista cada paso del plan, en su orden, con su decisión", () => {
    const aplicado = aplicarDecisiones(
      plan,
      {
        "vacio-categoria:canal": "aprobado",
        "vacio-indicador:edad": "rechazado",
      },
      "y",
    );
    expect(aplicado.registro.map((r) => r.id)).toEqual(plan.map((p) => p.id));
    expect(aplicado.registro.map((r) => r.decision)).toEqual([
      "sin-decidir",
      "sin-decidir",
      "rechazado",
      "aprobado",
      "sin-decidir",
      "sin-decidir",
    ]);
  });
});
