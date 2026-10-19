// Ayuda compartida de las pruebas de la etapa 4 (no es una prueba): un protocolo local con la
// etapa 4 registrada, cuadernos honestos armados por la compuerta, e inventarios completos.
import { readFileSync } from "node:fs";
import { registrar } from "@/engine/protocolo/compuerta";
import { cuadernoVacio, type Cuaderno } from "@/engine/protocolo/cuaderno";
import { chequeos1, ETAPA_1 } from "@/engine/protocolo/etapa1";
import {
  datosEtapa2,
  ETAPA_2,
  type EntradaEtapa2,
} from "@/engine/protocolo/etapa2";
import { chequeos3, ETAPA_3 } from "@/engine/protocolo/etapa3";
import {
  datosEtapa4,
  ETAPA_4,
  hallazgos4,
  type EntradaEtapa4,
} from "@/engine/protocolo/etapa4";
import {
  ENTRADA_5_VACIA,
  ETAPA_5,
  datosEtapa5,
} from "@/engine/protocolo/etapa5";
import {
  ETAPAS_BASE,
  type DatosEtapa,
  type DefinicionProtocolo,
  type Previas,
} from "@/engine/protocolo/etapas";
import {
  ENTRADA_6_VACIA,
  datosEtapa6,
  type EntradaEtapa6,
} from "@/engine/protocolo/etapa6";
import { ETAPA_IDS } from "@/engine/protocolo/ids";
import { PROTOCOLO_DS } from "@/engine/protocolo/protocolo-ds";
import { parseCsvWithLimits, type CsvTable } from "@/lib/ds/csv";

export const AHORA = new Date("2026-10-18T12:00:00.000Z");
export const HUELLA = "f".repeat(64);

const CONSTRUIDAS = { 1: ETAPA_1, 2: ETAPA_2, 3: ETAPA_3, 4: ETAPA_4 } as const;
/** El Protocolo con la etapa 4 construida (en el sprint 9 todavía no está en `PROTOCOLO_DS`). */
export const PROTOCOLO4: DefinicionProtocolo = ETAPA_IDS.map(
  (id) =>
    (CONSTRUIDAS as Record<number, DefinicionProtocolo[number]>)[id] ??
    ETAPAS_BASE[id],
);

const CONSTRUIDAS5 = { ...CONSTRUIDAS, 5: ETAPA_5 } as const;
/** El Protocolo con la etapa 5 construida (en el sprint 10 se registra en `PROTOCOLO_DS` en la F2). */
export const PROTOCOLO5: DefinicionProtocolo = ETAPA_IDS.map(
  (id) =>
    (CONSTRUIDAS5 as Record<number, DefinicionProtocolo[number]>)[id] ??
    ETAPAS_BASE[id],
);

export function tablaKit(archivo: string): CsvTable {
  return tablaDe(readFileSync(`docs/kit-de-prueba/${archivo}`, "utf8"));
}

export function tablaDe(csv: string): CsvTable {
  const r = parseCsvWithLimits(csv);
  if (!r.ok) throw new Error(`CSV ilegible: ${r.error.kind}`);
  return r.table;
}

export function etapa1De(
  forma: "binaria" | "multiclase" | "numerica",
): DatosEtapa {
  const extra: Record<string, unknown> =
    forma === "binaria"
      ? { c_fp: 10, c_fn: 50 }
      : forma === "numerica"
        ? { c_sub: 3, c_sobre: 1 }
        : {
            opciones: [
              "basico",
              "estandar",
              "premium",
              "empresa",
              "estudiante",
            ],
            costos: {
              basico: 1,
              estandar: 2,
              premium: 3,
              empresa: 4,
              estudiante: 5,
            },
          };
  const respuestas = {
    decision: "Llamar o no al cliente",
    decisor: "Jefa de retención",
    cuando: "A fin de mes",
    hoy: "Se llama a todos",
    unidad: "US$",
    forma,
    ...extra,
  } as DatosEtapa["respuestas"];
  return { respuestas, chequeos: chequeos1(respuestas) ?? {} };
}

export type Armado = {
  readonly tabla: CsvTable;
  readonly cuaderno: Cuaderno;
  readonly previas: Previas;
};

/** Cumple las etapas 1–3 con la compuerta real, sobre un CSV del kit. */
export function armar(
  archivo: string,
  forma: "binaria" | "multiclase" | "numerica",
  entrada: EntradaEtapa2,
  tabla: CsvTable = tablaKit(archivo),
  e1: DatosEtapa = etapa1De(forma),
): Armado {
  const e2 = datosEtapa2(tabla, entrada, e1);
  const base = { 1: e1, 2: e2 } as Previas;
  const r3 = {
    proposito: "predecir",
    poblacion: "Clientes",
    exclusiones: "Ninguna",
    periodo_texto: "2025",
    parametros: 3,
    r2: forma === "numerica" ? 0.2 : null,
    aviso: "El tamaño de muestra no alcanza y lo sé",
  } as DatosEtapa["respuestas"];
  const e3 = {
    respuestas: r3,
    chequeos: chequeos3(r3, base) ?? {},
  } as DatosEtapa;
  let cuaderno = cuadernoVacio(AHORA);
  for (const [id, datos] of [
    [1, e1],
    [2, e2],
    [3, e3],
  ] as const) {
    const r = registrar(PROTOCOLO4, cuaderno, id, datos, {
      huella: HUELLA,
      tabla,
      ahora: AHORA,
    });
    if (!r.ok) throw new Error(`etapa ${id}: ${JSON.stringify(r.rechazo)}`);
    cuaderno = r.cuaderno;
  }
  return { tabla, cuaderno, previas: { 1: e1, 2: e2, 3: e3 } };
}

export const ENTRADA_BAJAS: EntradaEtapa2 = {
  objetivo: "se_dio_de_baja",
  positivo: "si",
  unidadColumna: "cliente_id",
  momentoColumna: "mes_observado",
  momentoTexto: "",
  ordenFecha: null,
};

export const ENTRADA_CREDITO: EntradaEtapa2 = {
  objetivo: "incumplio",
  positivo: "1",
  unidadColumna: null,
  momentoColumna: null,
  momentoTexto: "El día que se pide el crédito",
  ordenFecha: null,
};

type Fila = readonly [momento: string, estado: string, procedencia: string];

/**
 * Un inventario por NOMBRE de columna (lo que no se nombra queda sin responder). Las listas
 * salen alineadas con las columnas que encontró el motor.
 */
export function inventario(
  columnas: readonly string[],
  filas: Readonly<Record<string, Fila>>,
  extra: Partial<Pick<EntradaEtapa4, "apuesta" | "ninguna" | "enBloque">> = {},
): EntradaEtapa4 {
  const sin: Fila = ["", "", ""];
  const dato = (c: string) => filas[c] ?? sin;
  return {
    apuesta: extra.apuesta ?? [],
    ninguna: extra.ninguna ?? (extra.apuesta ?? []).length === 0,
    procedencia: columnas.map((c) => dato(c)[2]),
    momento: columnas.map((c) => dato(c)[0]),
    estado: columnas.map((c) => dato(c)[1]),
    enBloque: extra.enBloque ?? [],
  };
}

/** El inventario honesto y completo de bajas-con-fuga.csv. */
export const FILAS_BAJAS: Readonly<Record<string, Fila>> = {
  cliente_id: ["", "excluir", ""],
  mes_observado: ["", "excluir", ""],
  plan: ["antes", "usar", ""],
  canal: ["antes", "usar", "Lo registra el vendedor al abrir la cuenta"],
  antiguedad_meses: ["antes", "usar", ""],
  tickets_soporte: ["antes", "usar", ""],
  uso_mensual_gb: ["antes", "usar", "Medidor de la red, al cierre de mes"],
  motivo_baja: ["despues", "excluir", "Lo escribe soporte al cerrar la baja"],
  referencia: ["", "excluir", ""],
};

export function datosBajas(
  armado: Armado,
  filas: Readonly<Record<string, Fila>> = FILAS_BAJAS,
  extra: Partial<Pick<EntradaEtapa4, "apuesta" | "ninguna" | "enBloque">> = {
    enBloque: ["plan", "antiguedad_meses", "tickets_soporte"],
  },
): DatosEtapa {
  const h = hallazgos4(armado.tabla, armado.previas);
  if (!h) throw new Error("sin hallazgos");
  return datosEtapa4(
    armado.tabla,
    inventario(h.columnas, filas, extra),
    armado.previas,
  );
}

/**
 * Cumple las etapas 1–4 con la compuerta real sobre un CSV: toda columna «antes + usar», salvo las
 * que la app marcó (fuga → «después + excluir»; identificador, unidad y fecha → «excluir»).
 */
export function armar4(
  archivo: string,
  forma: "binaria" | "multiclase" | "numerica",
  entrada: EntradaEtapa2,
  tabla: CsvTable = tablaKit(archivo),
  e1: DatosEtapa = etapa1De(forma),
): Armado {
  const hasta3 = armar(archivo, forma, entrada, tabla, e1);
  const h = hallazgos4(tabla, hasta3.previas);
  if (!h) throw new Error("sin hallazgos");
  const filas: Record<string, Fila> = {};
  for (const c of h.columnas) {
    const filtra = Object.hasOwn(h.fuga, c) || Object.hasOwn(h.fugaVacios, c);
    filas[c] = filtra
      ? ["despues", "excluir", "Se llena cuando ya pasó"]
      : h.roles.includes(c) || Object.hasOwn(h.identificador, c)
        ? ["", "excluir", ""]
        : ["antes", "usar", "Registro propio"];
  }
  const datos = datosEtapa4(
    tabla,
    inventario(h.columnas, filas),
    hasta3.previas,
  );
  const r = registrar(PROTOCOLO5, hasta3.cuaderno, 4, datos, {
    huella: HUELLA,
    tabla,
    ahora: AHORA,
  });
  if (!r.ok) throw new Error(`etapa 4: ${JSON.stringify(r.rechazo)}`);
  return {
    tabla,
    cuaderno: r.cuaderno,
    previas: { ...hasta3.previas, 4: datos },
  };
}

/** Un CSV desde filas de texto (la primera es la cabecera). */
export function csv(...lineas: string[]): CsvTable {
  return tablaDe(`${lineas.join("\n")}\n`);
}

/** El Protocolo con la etapa 6 construida: desde el sprint 11 es el de la app. */
export const PROTOCOLO6: DefinicionProtocolo = PROTOCOLO_DS;

/** Cumple las etapas 1–5 con la compuerta real: la 5, con «no hay regla de hoy». */
export function armar5(
  archivo: string,
  forma: "binaria" | "multiclase" | "numerica",
  entrada: EntradaEtapa2,
  tabla: CsvTable = tablaKit(archivo),
  e1: DatosEtapa = etapa1De(forma),
): Armado {
  const hasta4 = armar4(archivo, forma, entrada, tabla, e1);
  const datos = datosEtapa5(
    tabla,
    { ...ENTRADA_5_VACIA, regla: "ninguna" },
    hasta4.previas,
  );
  const r = registrar(PROTOCOLO6, hasta4.cuaderno, 5, datos, {
    huella: HUELLA,
    tabla,
    ahora: AHORA,
  });
  if (!r.ok) throw new Error(`etapa 5: ${JSON.stringify(r.rechazo)}`);
  return {
    tabla,
    cuaderno: r.cuaderno,
    previas: { ...hasta4.previas, 5: datos },
  };
}

/** Etapa 6 de crédito (sin fecha ni unidad): estratificada, como la sugiere la app. */
export const ENTRADA_6_CREDITO: EntradaEtapa6 = {
  ...ENTRADA_6_VACIA,
  esquema: "estratificada",
};

/** Etapa 6 de bajas: unidades nuevas → por tiempo y por grupo, con un mes de hueco. */
export const ENTRADA_6_BAJAS: EntradaEtapa6 = {
  ...ENTRADA_6_VACIA,
  unidades: "nuevas",
  esquema: "tiempo-grupo",
  horizonte: 1,
  horizonteUnidad: "meses",
};

/** Cumple las etapas 1–6 con la compuerta real (la 5 con «no hay regla»; la 6 sellada). */
export function armar6(
  archivo: string,
  forma: "binaria" | "multiclase" | "numerica",
  entrada: EntradaEtapa2,
  e6: EntradaEtapa6,
  tabla: CsvTable = tablaKit(archivo),
): Armado {
  const hasta5 = armar5(archivo, forma, entrada, tabla);
  const datos = datosEtapa6(tabla, e6, hasta5.previas, HUELLA);
  const r = registrar(PROTOCOLO_DS, hasta5.cuaderno, 6, datos, {
    huella: HUELLA,
    tabla,
    ahora: AHORA,
  });
  if (!r.ok) throw new Error(`etapa 6: ${JSON.stringify(r.rechazo)}`);
  return {
    tabla,
    cuaderno: r.cuaderno,
    previas: { ...hasta5.previas, 6: datos },
  };
}
