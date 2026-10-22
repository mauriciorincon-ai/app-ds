// Protocolo DS (S8, ADR 020): el `.protocolo.json` y lo que vuelve de IndexedDB. El lado que
// emite (`empaquetar`) escribe el fixture; el que lee (`leerArchivo` / `leerCuaderno`) lo
// valida, y cada campo trae su carnada: una mutación de ese solo campo que el lector rechaza
// NOMBRÁNDOLO («detectó k de n», regla 19).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { registrar } from "@/engine/protocolo/compuerta";
import {
  APERTURAS_MAX,
  agregarApertura,
  aperturasDistintas,
  cuadernoVacio,
  type Cuaderno,
} from "@/engine/protocolo/cuaderno";
import type {
  DatosEtapa,
  DefinicionProtocolo,
  EtapaConstruida,
  EtapaId,
} from "@/engine/protocolo/etapas";
import { almacenEnMemoria, abrirAlmacen } from "@/lib/protocolo/almacen";
import {
  MAX_PROTOCOL_FILE_BYTES,
  claveDeEtapa,
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
    trampas: () => [],
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

  it("S13: las aperturas de la prueba son opcionales; con ellas se leen, y una rota se nombra", () => {
    const sin = cuadernoValido();
    expect("aperturas" in sin).toBe(false);
    expect(aperturasDistintas(sin)).toBe(0);
    const apertura = (clave: string) => ({
      fecha: AHORA.toISOString(),
      huella: HUELLA,
      clave,
    });
    // abrir lo mismo dos veces no suma ni agranda la lista (S16, S13 B5); otra cosa, sí; la lista solo crece
    const con = [
      apertura("a".repeat(64)),
      apertura("a".repeat(64)),
      apertura("b".repeat(64)),
    ].reduce(agregarApertura, sin);
    expect(con.aperturas).toHaveLength(2);
    expect(aperturasDistintas(con)).toBe(2);
    expect(leerArchivo(empaquetar(con, AHORA), PROTOCOLO)).toEqual({
      ok: true,
      cuaderno: con,
    });
    const roto = (muta: (a: Mutable) => void) => {
      const archivo = JSON.parse(empaquetar(con, AHORA)) as Mutable;
      muta((cu(archivo).aperturas as Mutable[])[0]!);
      return leerArchivo(JSON.stringify(archivo), PROTOCOLO);
    };
    for (const [campo, muta] of [
      ["clave", (a: Mutable) => (a.clave = "x")],
      ["huella", (a: Mutable) => (a.huella = null)],
      ["fecha", (a: Mutable) => (a.fecha = "hoy")],
      ["filas", (a: Mutable) => (a.filas = [1, 2])],
    ] as const)
      expect(roto(muta), campo).toEqual({
        ok: false,
        rechazo: {
          tipo: "invalid-format",
          campo: `cuaderno.aperturas[0].${campo}`,
        },
      });
  });

  it("S16 (S13 B5): las aperturas tienen tope: la app no pasa de APERTURAS_MAX y el archivo con más se rechaza nombrándolas", () => {
    const apertura = (i: number) => ({
      fecha: AHORA.toISOString(),
      huella: HUELLA,
      clave: i.toString(16).padStart(64, "0"),
    });
    const lleno = Array.from({ length: APERTURAS_MAX }, (_, i) => apertura(i)).reduce(
      agregarApertura,
      cuadernoValido(),
    );
    expect(lleno.aperturas).toHaveLength(APERTURAS_MAX);
    // una más ya no entra; el cuaderno queda como estaba
    expect(agregarApertura(lleno, apertura(APERTURAS_MAX))).toBe(lleno);
    expect(leerArchivo(empaquetar(lleno, AHORA), PROTOCOLO).ok).toBe(true);
    const demasiadas = {
      ...lleno,
      aperturas: [...lleno.aperturas!, apertura(APERTURAS_MAX)],
    };
    expect(leerArchivo(empaquetar(demasiadas, AHORA), PROTOCOLO)).toEqual({
      ok: false,
      rechazo: { tipo: "invalid-format", campo: "cuaderno.aperturas" },
    });
  });

  it("S16 (S8 B3): una clave inventada no se repite entera en el mensaje", () => {
    const archivo = JSON.parse(empaquetar(cuadernoValido(), AHORA)) as Mutable;
    cu(archivo)["x".repeat(5000)] = 1;
    const r = leerArchivo(JSON.stringify(archivo), PROTOCOLO);
    expect(r.ok).toBe(false);
    if (r.ok || r.rechazo.tipo !== "invalid-format") return;
    expect(r.rechazo.campo.length).toBeLessThanOrEqual("cuaderno.".length + 61);
    expect(r.rechazo.campo.startsWith("cuaderno.xxxx")).toBe(true);
  });

  it("S16 (S8 B6): las claves de `base` salen de los ids de las etapas, no de un regex cableado a diez", () => {
    for (const ok of ["1", "2", "9", "10"]) expect(claveDeEtapa(ok), ok).toBe(true);
    for (const mal of ["0", "11", "010", "1.0", "", "-1", "+1", " 1"])
      expect(claveDeEtapa(mal), JSON.stringify(mal)).toBe(false);
    expect(readFileSync("src/lib/protocolo/archivo.ts", "utf8")).not.toMatch(/\(10\|\[1-9\]\)/);
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
