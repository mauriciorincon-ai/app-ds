// Protocolo DS (S10, M1 del S9): el identificador numérico. Enteros, casi todos distintos y en
// secuencia. La regla de solo «distintos como filas» marcaría ocho medidas del kit: aquí se fija
// que ninguna columna de medida del kit se marca, y que un id 1..N sí.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hallazgos4 } from "@/engine/protocolo/etapa4";
import {
  ID_NUMERICO_SECUENCIA_MIN,
  identificadorNumerico,
  vistaColumna,
} from "@/engine/protocolo/tabla";
import { columnValues, parseCsvWithLimits } from "@/lib/ds/csv";
import {
  ENTRADA_BAJAS,
  armar,
  tablaDe,
  tablaKit,
} from "./protocolo-etapa4-helpers";

const secuencia = (n: number, desde = 1) =>
  Array.from({ length: n }, (_, i) => desde + i);

describe("identificadorNumerico", () => {
  it("un id 1..N se marca, con su proporción de distintos", () => {
    expect(identificadorNumerico(secuencia(100))).toBe(1);
  });

  it("un autoincremental con huecos y un id que no arranca en 1 también", () => {
    const conHuecos = secuencia(100).filter((i) => i % 20 !== 0);
    expect(identificadorNumerico(conHuecos)).toBe(1);
    expect(identificadorNumerico(secuencia(100, 90001))).toBe(1);
  });

  it("los vacíos bajan la proporción de distintos, no la anulan", () => {
    const conVacios: (number | null)[] = [...secuencia(98), null, null];
    expect(identificadorNumerico(conVacios)).toBeCloseTo(0.98, 12);
    const demasiados: (number | null)[] = [
      ...secuencia(90),
      ...Array(10).fill(null),
    ];
    expect(identificadorNumerico(demasiados)).toBeNull();
  });

  it("una medida entera dispersa no se marca aunque todo sea distinto", () => {
    // 100 enteros distintos repartidos en un rango de 100 000: ingresos, montos, precios…
    const dispersa = secuencia(100).map((i) => i * 1000);
    expect(identificadorNumerico(dispersa)).toBeNull();
  });

  it("una columna con decimales nunca es un identificador", () => {
    expect(identificadorNumerico([1, 2, 3, 4.5])).toBeNull();
    expect(identificadorNumerico(secuencia(50).map((i) => i / 2))).toBeNull();
  });

  it("una columna con repetidos (conteos, edades) no se marca", () => {
    expect(identificadorNumerico(secuencia(100).map((i) => i % 10))).toBeNull();
  });

  it("sin valores o toda vacía: no se marca", () => {
    expect(identificadorNumerico([])).toBeNull();
    expect(identificadorNumerico([null, null, null])).toBeNull();
  });

  it("el límite de la secuencia está declarado", () => {
    expect(ID_NUMERICO_SECUENCIA_MIN).toBe(0.9);
    // justo bajo el límite: 100 distintos en un rango de 112 (0,893) no es secuencia
    const casi = [...secuencia(99), 112];
    expect(identificadorNumerico(casi)).toBeNull();
  });
});

describe("sobre el kit de prueba", () => {
  const archivos = readdirSync("docs/kit-de-prueba").filter((f) =>
    f.endsWith(".csv"),
  );

  it("ninguna columna de medida de ningún CSV del kit se marca como identificador", () => {
    const marcadas: string[] = [];
    for (const archivo of archivos) {
      // el CSV con «;» de Excel no se lee (Probeta lo rechaza con su aviso): no es una tabla
      const leida = parseCsvWithLimits(
        readFileSync(`docs/kit-de-prueba/${archivo}`, "utf8"),
      );
      if (!leida.ok) continue;
      const tabla = leida.table;
      tabla.headers.forEach((nombre, i) => {
        const vista = vistaColumna(nombre, columnValues(tabla, i));
        if (vista.tipo !== "numero") return;
        if (identificadorNumerico(vista.valores) !== null)
          marcadas.push(`${archivo}:${nombre}`);
      });
    }
    expect(marcadas).toEqual([]);
  });

  it("el kit de bajas da los mismos identificadores que antes (solo «referencia», de texto)", () => {
    const bajas = armar("bajas-con-fuga.csv", "binaria", ENTRADA_BAJAS);
    const h = hallazgos4(bajas.tabla, bajas.previas)!;
    expect(Object.keys(h.identificador)).toEqual(["referencia"]);
  });
});

describe("en la etapa 4", () => {
  it("un id numérico 1..N entra a los identificadores y sale de la fuga; una medida entera, no", () => {
    const filas = secuencia(60).map(
      (i) => `${i},${1000 * ((i * 7) % 13) + 500},${i % 2 === 0 ? "si" : "no"}`,
    );
    const tabla = tablaDe(
      `id_cliente,ingreso,se_dio_de_baja\n${filas.join("\n")}\n`,
    );
    const previas = armar(
      "bajas-con-fuga.csv",
      "binaria",
      ENTRADA_BAJAS,
      tablaKit("bajas-con-fuga.csv"),
    ).previas;
    const h = hallazgos4(tabla, {
      ...previas,
      2: {
        ...previas[2]!,
        respuestas: {
          ...previas[2]!.respuestas,
          objetivo: "se_dio_de_baja",
          unidad: "fila",
          momento: "texto",
          unidad_columna: "",
          momento_columna: "",
        },
      },
    });
    expect(h).not.toBeNull();
    expect(Object.keys(h!.identificador)).toEqual(["id_cliente"]);
    expect(Object.keys(h!.fuga)).not.toContain("id_cliente");
  });
});
