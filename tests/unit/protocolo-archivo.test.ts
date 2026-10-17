// Protocolo DS (S8, ADR 020): el `.protocolo.json` y lo que vuelve de IndexedDB. El lado que
// emite (`empaquetar`) escribe el fixture; el que lee (`leerArchivo` / `leerCuaderno`) lo
// valida, y cada campo trae su carnada: una mutación de ese solo campo que el lector rechaza
// NOMBRÁNDOLO («detectó k de n», regla 19).
import { describe, expect, it } from "vitest";
import { registrar } from "@/engine/protocolo/compuerta";
import { cuadernoVacio, type Cuaderno } from "@/engine/protocolo/cuaderno";
import type {
  DatosEtapa,
  DefinicionProtocolo,
  EtapaConstruida,
  EtapaId,
} from "@/engine/protocolo/etapas";
import { almacenEnMemoria, abrirAlmacen } from "@/lib/protocolo/almacen";
import {
  MAX_PROTOCOL_FILE_BYTES,
  empaquetar,
  leerArchivo,
  leerCuaderno,
  type RechazoArchivo,
} from "@/lib/protocolo/archivo";

const AHORA = new Date("2026-10-17T12:00:00.000Z");
const HUELLA = "c".repeat(64);

function etapa(id: EtapaId, dependeDeDatos: boolean): EtapaConstruida {
  return {
    id,
    construida: true,
    dependeDeDatos,
    terminos: [],
    preguntas: ["ok"],
    chequeos: [],
    leer: (datos) =>
      typeof datos.respuestas.ok === "boolean"
        ? { ok: true }
        : { ok: false, campo: "respuestas.ok" },
    criterio: (datos) =>
      datos.respuestas.ok
        ? { tipo: "cumple" }
        : { tipo: "falta", faltan: ["ok"] },
  };
}

const PROTOCOLO: DefinicionProtocolo = [
  etapa(1, false),
  etapa(2, true),
  { id: 3, construida: false, dependeDeDatos: true, terminos: [] },
];

const SI: DatosEtapa = {
  respuestas: { ok: true, nota: "texto del usuario", clases: ["a", "b"] },
  chequeos: { filas: 300, conteo: { a: 2, b: 1 } },
};

function cuadernoValido(): Cuaderno {
  let c: Cuaderno = {
    ...cuadernoVacio(AHORA),
    cargas: [
      {
        fecha: AHORA.toISOString(),
        sha256: HUELLA,
        nombre: "mis-datos.csv",
        filas: 300,
        columnas: 6,
      },
    ],
  };
  for (const id of [1, 2] as const) {
    const r = registrar(PROTOCOLO, c, id, SI, { huella: HUELLA, ahora: AHORA });
    if (!r.ok) throw new Error(JSON.stringify(r.rechazo));
    c = r.cuaderno;
  }
  return c;
}

type Mutable = Record<string, unknown>;

/** Una carnada: qué campo toca y cómo; el lector debe nombrar `campo`. */
const CARNADAS: {
  campo: string;
  muta: (a: Mutable) => void;
  rechazo?: RechazoArchivo;
}[] = [
  { campo: "formato", muta: (a) => (a.formato = "probeta") },
  {
    campo: "version",
    muta: (a) => (a.version = 2),
    rechazo: { tipo: "unsupported-version", version: "2" },
  },
  { campo: "exportado", muta: (a) => (a.exportado = "ayer") },
  { campo: "cuaderno.version", muta: (a) => (cu(a).version = 9) },
  { campo: "cuaderno.creado", muta: (a) => (cu(a).creado = "17/10/2026") },
  {
    campo: "cuaderno.cargas[0].sha256",
    muta: (a) => (carga(a).sha256 = "xyz"),
  },
  { campo: "cuaderno.cargas[0].filas", muta: (a) => (carga(a).filas = -1) },
  { campo: "cuaderno.cargas[0].nombre", muta: (a) => (carga(a).nombre = 7) },
  { campo: "cuaderno.cargas[0].extra", muta: (a) => (carga(a).extra = 1) },
  { campo: "cuaderno.evidencias[0].seq", muta: (a) => (ev(a, 0).seq = 5) },
  { campo: "cuaderno.evidencias[0].etapa", muta: (a) => (ev(a, 0).etapa = 11) },
  { campo: "cuaderno.evidencias[1].etapa", muta: (a) => (ev(a, 1).etapa = 3) },
  {
    campo: "cuaderno.evidencias[0].fecha",
    muta: (a) => (ev(a, 0).fecha = "hoy"),
  },
  {
    campo: "cuaderno.evidencias[1].huella",
    muta: (a) => (ev(a, 1).huella = null),
  },
  {
    campo: "cuaderno.evidencias[0].huella",
    muta: (a) => (ev(a, 0).huella = HUELLA),
  },
  {
    campo: "cuaderno.evidencias[1].base",
    muta: (a) => (ev(a, 1).base = { 1: 2 }),
  },
  {
    campo: "cuaderno.evidencias[1].base",
    muta: (a) => (ev(a, 1).base = { 2: 1 }),
  },
  {
    campo: "cuaderno.evidencias[1].datos.respuestas.ok",
    muta: (a) => (datos(a, 1).respuestas = { ok: "sí" }),
  },
  {
    campo: "cuaderno.evidencias[0].datos.chequeos.filas",
    muta: (a) => (datos(a, 0).chequeos = { filas: { a: "b" } }),
  },
  {
    campo: "cuaderno.evidencias[0].datos.extra",
    muta: (a) => (datos(a, 0).extra = true),
  },
];

const cu = (a: Mutable) => a.cuaderno as Mutable;
const carga = (a: Mutable) => (cu(a).cargas as Mutable[])[0]!;
const ev = (a: Mutable, i: number) => (cu(a).evidencias as Mutable[])[i]!;
const datos = (a: Mutable, i: number) => ev(a, i).datos as Mutable;

describe(".protocolo.json", () => {
  it("ida y vuelta: lo que se empaqueta se lee igual", () => {
    const c = cuadernoValido();
    const r = leerArchivo(empaquetar(c, AHORA), PROTOCOLO);
    expect(r).toEqual({ ok: true, cuaderno: c });
  });

  it("cada campo tiene su carnada y el lector la rechaza nombrándolo", () => {
    const texto = empaquetar(cuadernoValido(), AHORA);
    let detectadas = 0;
    for (const { campo, muta, rechazo } of CARNADAS) {
      const archivo = JSON.parse(texto) as Mutable;
      muta(archivo);
      const r = leerArchivo(JSON.stringify(archivo), PROTOCOLO);
      const esperado = rechazo ?? { tipo: "invalid-format", campo };
      if (!r.ok && JSON.stringify(r.rechazo) === JSON.stringify(esperado))
        detectadas++;
      expect(r, campo).toEqual({ ok: false, rechazo: esperado });
    }
    console.log(
      `[contrato .protocolo.json] detectó ${detectadas} de ${CARNADAS.length}`,
    );
    expect(detectadas).toBe(CARNADAS.length);
  });

  it("no JSON, otra cosa o demasiado grande se rechazan por su nombre", () => {
    expect(leerArchivo("{no", PROTOCOLO)).toEqual({
      ok: false,
      rechazo: { tipo: "invalid-json" },
    });
    expect(leerArchivo("[1,2]", PROTOCOLO)).toEqual({
      ok: false,
      rechazo: { tipo: "invalid-format", campo: "formato" },
    });
    expect(leerArchivo("{}", PROTOCOLO, MAX_PROTOCOL_FILE_BYTES + 1)).toEqual({
      ok: false,
      rechazo: { tipo: "file-too-large", bytes: MAX_PROTOCOL_FILE_BYTES + 1 },
    });
  });

  it("lo que vuelve de IndexedDB pasa por el mismo lector", () => {
    const c = cuadernoValido();
    expect(leerCuaderno(structuredClone(c), PROTOCOLO)).toEqual({
      ok: true,
      cuaderno: c,
    });
    expect(leerCuaderno({ ...c, evidencias: "x" }, PROTOCOLO)).toEqual({
      ok: false,
      rechazo: { tipo: "invalid-format", campo: "evidencias" },
    });
  });
});

describe("almacén del cuaderno", () => {
  it("en memoria guarda, lee y borra", async () => {
    const almacen = almacenEnMemoria();
    expect(almacen.tipo).toBe("memoria");
    expect(await almacen.leer()).toBeNull();
    const c = cuadernoValido();
    await almacen.guardar(c);
    expect(await almacen.leer()).toEqual(c);
    await almacen.borrar();
    expect(await almacen.leer()).toBeNull();
  });

  it("sin IndexedDB (o si no abre), cae a memoria", async () => {
    expect((await abrirAlmacen(undefined)).tipo).toBe("memoria");
    const rota = {
      open: () => {
        throw new Error("SecurityError");
      },
    } as unknown as IDBFactory;
    expect((await abrirAlmacen(rota)).tipo).toBe("memoria");
  });
});
