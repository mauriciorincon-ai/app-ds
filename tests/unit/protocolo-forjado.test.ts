// Protocolo DS (S8, auditoría A2): un cuaderno editado a mano no gana nada. El criterio de la
// etapa 2 lee lo que el código calculó sobre la TABLA; la compuerta lo vuelve a calcular contra
// la tabla cargada y, si no coincide, la etapa vuelve a «por verificar» y la siguiente no abre.
// Se prueba con la definición real del Protocolo (la etapa 4 ya está construida: queda «cerrada»
// mientras la 3 no cumple), por el mismo camino del usuario: exportar el
// `.protocolo.json`, editarlo y leerlo de nuevo.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluar, registrar } from "@/engine/protocolo/compuerta";
import { cuadernoVacio, type Cuaderno } from "@/engine/protocolo/cuaderno";
import { chequeos1 } from "@/engine/protocolo/etapa1";
import { datosEtapa2, type EntradaEtapa2 } from "@/engine/protocolo/etapa2";
import type { DatosEtapa, EtapaId } from "@/engine/protocolo/etapas";
import { PROTOCOLO_DS } from "@/engine/protocolo/protocolo-ds";
import { parseCsvWithLimits, type CsvTable } from "@/lib/ds/csv";
import { empaquetar, leerArchivo } from "@/lib/protocolo/archivo";

const AHORA = new Date("2026-10-17T12:00:00.000Z");
const HUELLA = "e".repeat(64);

function cargar(texto: string): CsvTable {
  const r = parseCsvWithLimits(texto);
  if (!r.ok) throw new Error("CSV ilegible");
  return r.table;
}

const CSV = readFileSync(
  "docs/kit-de-prueba/renovaciones-mensuales.csv",
  "utf8",
);
const LIMPIA = cargar(CSV);

const RESPUESTAS_1 = {
  decision: "Llamar o no al cliente antes de que venza",
  decisor: "Jefa de retención",
  cuando: "El día 25 de cada mes",
  hoy: "Se llama a todos los de plan premium",
  unidad: "US$",
  forma: "binaria",
  c_fp: 10,
  c_fn: 50,
} as DatosEtapa["respuestas"];
const ETAPA_1: DatosEtapa = {
  respuestas: RESPUESTAS_1,
  chequeos: chequeos1(RESPUESTAS_1) ?? {},
};

const ENTRADA: EntradaEtapa2 = {
  objetivo: "renovo",
  positivo: "si",
  unidadColumna: "cliente_id",
  momentoColumna: "mes_observado",
  momentoTexto: "",
  ordenFecha: null,
};

function registrarEn(
  cuaderno: Cuaderno,
  id: EtapaId,
  datos: DatosEtapa,
  tabla: CsvTable | null,
) {
  return registrar(PROTOCOLO_DS, cuaderno, id, datos, {
    huella: HUELLA,
    tabla,
    ahora: AHORA,
  });
}

/** Un cuaderno honesto con las etapas 1 y 2 cumplidas sobre la tabla limpia. */
function honesto(): Cuaderno {
  const uno = registrarEn(cuadernoVacio(AHORA), 1, ETAPA_1, LIMPIA);
  if (!uno.ok) throw new Error(JSON.stringify(uno.rechazo));
  const dos = registrarEn(
    uno.cuaderno,
    2,
    datosEtapa2(LIMPIA, ENTRADA, ETAPA_1),
    LIMPIA,
  );
  if (!dos.ok) throw new Error(JSON.stringify(dos.rechazo));
  return dos.cuaderno;
}

/** Exporta el cuaderno, deja que `editar` toque el JSON, y lo lee como si lo importara el usuario. */
function importado(
  cuaderno: Cuaderno,
  editar: (archivo: { cuaderno: Cuaderno }) => void = () => undefined,
): Cuaderno {
  const archivo = JSON.parse(empaquetar(cuaderno, AHORA)) as {
    cuaderno: Cuaderno;
  };
  editar(archivo);
  const lectura = leerArchivo(JSON.stringify(archivo), PROTOCOLO_DS);
  if (!lectura.ok) throw new Error(JSON.stringify(lectura.rechazo));
  return lectura.cuaderno;
}

function tipos(cuaderno: Cuaderno, tabla: CsvTable | null) {
  return evaluar(PROTOCOLO_DS, cuaderno, HUELLA, tabla)
    .slice(0, 4)
    .map((e) => e.estado.tipo);
}

/** Cambia un chequeo de la evidencia de la etapa 2 en el archivo. */
function tocarChequeo(clave: string, valor: unknown) {
  return (archivo: { cuaderno: Cuaderno }) => {
    const evidencia = archivo.cuaderno.evidencias.find((e) => e.etapa === 2);
    if (!evidencia) throw new Error("falta la evidencia de la etapa 2");
    (evidencia.datos.chequeos as Record<string, unknown>)[clave] = valor;
  };
}

describe("un cuaderno editado a mano no gana nada (A2)", () => {
  it("el cuaderno honesto, exportado e importado, sigue cumplido (el ida y vuelta no lo rompe)", () => {
    expect(tipos(importado(honesto()), LIMPIA)).toEqual([
      "cumplida",
      "cumplida",
      "abierta",
      "cerrada",
    ]);
  });

  it.each([
    ["una cifra cambiada", "filas", 99999],
    ["una tasa base inventada", "tasa_base", 0.5],
    ["una fecha «leída» que no lo era", "fecha_estado", "ninguna"],
    ["una unidad que no se repite", "unidad_repetida", false],
  ])(
    "%s: la etapa 2 vuelve a «por verificar» y la 3 no abre",
    (_nombre, clave, valor) => {
      const editado = importado(honesto(), tocarChequeo(clave, valor));
      expect(tipos(editado, LIMPIA)).toEqual([
        "cumplida",
        "por-verificar",
        "cerrada",
        "cerrada",
      ]);
      const [, dos] = evaluar(PROTOCOLO_DS, editado, HUELLA, LIMPIA);
      expect(dos?.estado).toMatchObject({
        tipo: "por-verificar",
        motivo: "no-cuadra",
      });
    },
  );

  it("el caso que importa: chequeos de una tabla limpia, huella de una tabla con fechas ilegibles", () => {
    const filas = CSV.trimEnd().split("\n");
    const sucia = cargar(
      filas
        .map((fila, i) =>
          i >= 1 && i <= 12 ? fila.replace(/\d{4}-\d{2}-\d{2}/, "ayer") : fila,
        )
        .join("\n"),
    );
    // Honestamente, la compuerta rechaza registrar la etapa 2 sobre esa tabla…
    const uno = registrarEn(cuadernoVacio(AHORA), 1, ETAPA_1, sucia);
    if (!uno.ok) throw new Error("la etapa 1 debía cumplir");
    const honestaSucia = registrarEn(
      uno.cuaderno,
      2,
      datosEtapa2(sucia, ENTRADA, ETAPA_1),
      sucia,
    );
    expect(honestaSucia).toMatchObject({
      ok: false,
      rechazo: { tipo: "criterio-no-cumplido", faltan: ["fecha"] },
    });
    // …y el cuaderno que trae los chequeos de la tabla limpia no pasa por cumplida contra ella.
    expect(tipos(importado(honesto()), sucia)).toEqual([
      "cumplida",
      "por-verificar",
      "cerrada",
      "cerrada",
    ]);
  });

  it("registrar no confía en los chequeos que le llegan: los vuelve a calcular", () => {
    const e2 = datosEtapa2(LIMPIA, ENTRADA, ETAPA_1);
    const uno = registrarEn(cuadernoVacio(AHORA), 1, ETAPA_1, LIMPIA);
    if (!uno.ok) throw new Error("la etapa 1 debía cumplir");
    const manipulado: DatosEtapa = {
      respuestas: e2.respuestas,
      chequeos: { ...e2.chequeos, tasa_base: 0.5 },
    };
    expect(registrarEn(uno.cuaderno, 2, manipulado, LIMPIA)).toMatchObject({
      ok: false,
      rechazo: { tipo: "datos-invalidos", etapa: 2, campo: "chequeos" },
    });
    expect(registrarEn(uno.cuaderno, 2, e2, LIMPIA).ok).toBe(true);
  });

  it("sin la tabla cargada la etapa 2 no se da por buena ni se registra", () => {
    expect(tipos(honesto(), null)).toEqual([
      "cumplida",
      "por-verificar",
      "cerrada",
      "cerrada",
    ]);
    const [, dos] = evaluar(PROTOCOLO_DS, honesto(), HUELLA, null);
    expect(dos?.estado).toMatchObject({ motivo: "sin-datos" });
    const uno = registrarEn(cuadernoVacio(AHORA), 1, ETAPA_1, LIMPIA);
    if (!uno.ok) throw new Error("la etapa 1 debía cumplir");
    expect(
      registrarEn(uno.cuaderno, 2, datosEtapa2(LIMPIA, ENTRADA, ETAPA_1), null),
    ).toMatchObject({ ok: false, rechazo: { tipo: "sin-datos", etapa: 2 } });
  });
});
