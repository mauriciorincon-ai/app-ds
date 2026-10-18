// Protocolo DS (S12), etapa 7 — PRUEBA ESPÍA: lo que viaja al worker. El payload se arma con la tabla en la
// que TODAS las celdas de las filas de la prueba se reemplazan por un marcador («ESPIA-<fila>»): si el envío
// leyera una sola fila de la prueba, el marcador aparecería. Además: los pliegues son posiciones dentro de
// las filas enviadas, no hay test_idx ni train_idx, la clase «hay que actuar» es la de la etapa 2 y, sin
// columnas en «usar», no hay envío.
import { describe, expect, it } from "vitest";
import { plan7 } from "@/engine/protocolo/etapa7";
import { isMemberOf } from "@/engine/roster";
import { envio7 } from "@/lib/protocolo/liga7";
import type { CsvTable } from "@/lib/ds/csv";
import {
  ENTRADA_6_BAJAS,
  ENTRADA_6_CREDITO,
  ENTRADA_BAJAS,
  ENTRADA_CREDITO,
  HUELLA,
  armar6,
} from "./protocolo-etapa4-helpers";

const CASOS = [
  [
    "crédito (estratificada)",
    armar6(
      "credito-fuga-plantada.csv",
      "binaria",
      ENTRADA_CREDITO,
      ENTRADA_6_CREDITO,
    ),
  ],
  [
    "bajas (por tiempo y por grupo)",
    armar6("bajas-con-fuga.csv", "binaria", ENTRADA_BAJAS, ENTRADA_6_BAJAS),
  ],
] as const;

describe.each(CASOS)("el envío de la etapa 7 con %s", (_, armado) => {
  const plan = plan7(armado.tabla, armado.previas, HUELLA)!;
  const prueba = new Set(plan.particion.prueba);
  const espia: CsvTable = {
    ...armado.tabla,
    rows: armado.tabla.rows.map((fila, i) =>
      prueba.has(i) ? fila.map(() => `ESPIA-${i}`) : fila,
    ),
  };
  const envio = envio7(espia, plan)!;

  it("ninguna celda de la prueba llega al payload", () => {
    expect(prueba.size).toBeGreaterThan(0);
    const texto = JSON.stringify(envio.payload);
    expect(texto).not.toMatch(/ESPIA-/);
  });

  it("el payload no tiene con qué nombrar la prueba: ni test_idx ni train_idx", () => {
    expect(Object.keys(envio.payload)).not.toContain("test_idx");
    expect(Object.keys(envio.payload)).not.toContain("train_idx");
  });

  it("las filas son las del entrenamiento sellado, en orden, y los pliegues son posiciones dentro de ellas", () => {
    const n = plan.particion.entrenamiento.length;
    expect(envio.payload.rows).toHaveLength(n);
    const posiciones = envio.payload.folds.flatMap((f) => [
      ...f.train,
      ...f.val,
    ]);
    expect(
      posiciones.every((p) => Number.isInteger(p) && p >= 0 && p < n),
    ).toBe(true);
    // el pliegue j del payload es el pliegue j del plan, traducido a posiciones
    if (!plan.pliegues.ok) throw new Error("sin pliegues");
    const deVuelta = envio.payload.folds.map((f) =>
      f.val.map((p) => plan.particion.entrenamiento[p]),
    );
    expect(deVuelta).toEqual(
      plan.pliegues.pliegues.map((p) => [...p.validacion]),
    );
  });

  it("la clase «hay que actuar» es la de la etapa 2, y compiten miembros de la tarea", () => {
    expect(envio.payload.positive).toBe(plan.diseno.positivo);
    expect(envio.payload.classes).toBeUndefined();
    expect(envio.roster.length).toBeGreaterThan(0);
    expect(envio.roster.every((m) => isMemberOf("binaria", m))).toBe(true);
    expect(envio.sent.folds).toBe(envio.payload.folds);
  });
});

it("sin columnas en «usar», no hay envío", () => {
  const [, armado] = CASOS[0];
  const plan = plan7(armado.tabla, armado.previas, HUELLA)!;
  expect(
    envio7(armado.tabla, { ...plan, numericas: [], categoricas: [] }),
  ).toBeNull();
});

// --- varias clases y un número: la métrica, las clases y el roster de su tarea ------------------
import type { Plan7 } from "@/engine/protocolo/etapa7";
import type { Diseno } from "@/engine/protocolo/particion";
import { repartirPliegues } from "@/engine/protocolo/pliegues";
import { csv } from "./protocolo-etapa4-helpers";

function planA_mano(forma: "multiclase" | "numerica"): {
  tabla: CsvTable;
  plan: Plan7;
} {
  const n = 60;
  const lineas = ["x,y"];
  for (let i = 0; i < n; i++)
    lineas.push(
      `${i % 7},${forma === "multiclase" ? ["c", "a", "b"][i % 3] : 2 * i}`,
    );
  const tabla = csv(...lineas);
  const filas = Array.from({ length: n }, (_, i) => i);
  const d: Diseno = {
    forma,
    filasTabla: n,
    filas,
    clases:
      forma === "multiclase" ? filas.map((i) => ["c", "a", "b"][i % 3]!) : null,
    valores: forma === "numerica" ? filas.map((i) => 2 * i) : null,
    positivo: null,
    unidades: null,
    unidadRepetida: false,
    fechas: null,
  };
  const entrenamiento = filas.filter((i) => i % 5 !== 0);
  const parametros = {
    esquema: "estratificada" as const,
    k: 3,
    horizonte: 0,
    unidad: "dias" as const,
  };
  return {
    tabla,
    plan: {
      forma,
      objetivo: "y",
      diseno: d,
      particion: {
        esquema: "estratificada",
        entrenamiento,
        prueba: filas.filter((i) => i % 5 === 0),
        hueco: [],
        corte: null,
        fuera: {
          sinObjetivo: 0,
          sinFecha: 0,
          sinUnidad: 0,
          unidadesDePrueba: 0,
        },
      },
      sello6: "a".repeat(64),
      parametros,
      pliegues: repartirPliegues(d, entrenamiento, parametros),
      verificacion: null,
      huellaPliegues: null,
      numericas: ["x"],
      categoricas: [],
      costos: null,
      base: null,
    },
  };
}

it("varias clases: exactitud balanceada, las clases en orden y miembros de varias clases", () => {
  const { tabla, plan } = planA_mano("multiclase");
  const e = envio7(tabla, plan)!;
  expect(e.metrica).toBe("balanced_accuracy");
  expect(e.payload.classes).toEqual(["a", "b", "c"]);
  expect(e.payload.positive).toBeUndefined();
  expect(e.roster.every((m) => isMemberOf("multiclase", m))).toBe(true);
});

it("un número: el error medio, sin clases ni «hay que actuar», y miembros que estiman", () => {
  const { tabla, plan } = planA_mano("numerica");
  const e = envio7(tabla, plan)!;
  expect(e.metrica).toBe("mae");
  expect(e.payload.classes).toBeUndefined();
  expect(e.payload.positive).toBeUndefined();
  expect(e.roster.every((m) => isMemberOf("numerica", m))).toBe(true);
});
