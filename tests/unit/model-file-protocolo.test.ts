// @vitest-environment node
/**
 * S19 (ADR 027): el `.probeta.json` del ganador del Protocolo. Garantías que estos tests hacen FALLAR si se rompen:
 *  - lo que se empaqueta se valida (ida y vuelta), con el hash del payload;
 *  - es una VARIANTE: trae `origin: "protocolo"` y el bloque `protocol`, y NO trae liga, baselines, fuga, selección ni veredicto;
 *  - un archivo de Probeta de siempre NO se confunde con uno del Protocolo, ni al revés: el validador de Probeta rechaza este
 *    (una versión anterior al S19 también lo haría) y este rechaza uno de Probeta;
 *  - cada carnada rompe UNA cosa y el validador la nombra: otra tarea, un ganador que no es el modelo del archivo, una métrica que
 *    no es de la tarea, una huella que no es de 64 hex, filas imposibles, un payload alterado (el hash no cuadra);
 *  - el reconocimiento por el inicio del texto no se deja engañar por un `origin` que vive en el payload;
 *  - (AUDITORÍA A-04) la guarda del manifiesto mira el valor de `origin`; que el validador de Probeta rechace la clave se prueba en
 *    model-file.test.ts.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  esArchivoDelProtocolo,
  esManifiestoDelProtocolo,
  validateModelFile,
} from "@/lib/model-file";
import {
  packProtocolModelFile,
  validateProtocolModelFile,
  type ProtocolBlock,
} from "@/lib/model-file-protocolo";
import type { ExportResult } from "@/workers/protocol";

const exportacion = (nombre: string): ExportResult =>
  JSON.parse(
    readFileSync(resolve(__dirname, `../fixtures/contrato/${nombre}.json`), "utf8"),
  ) as ExportResult;

const HEX_A = "a".repeat(64);
const HEX_B = "b".repeat(64);
const BLOQUE: ProtocolBlock = {
  winner: "forest",
  metric: "auc",
  test_value: 0.87,
  n_train: 160,
  n_test: 40,
  huella: HEX_A,
  sello: HEX_B,
};
const FECHA = new Date("2026-10-25T12:00:00Z");

async function empaquetar(
  nombre = "export-result",
  bloque: ProtocolBlock = BLOQUE,
) {
  return packProtocolModelFile({
    datasetName: "credito.csv",
    exported: exportacion(nombre),
    protocol: bloque,
    date: FECHA,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- el archivo se muta a propósito
type Json = Record<string, any>;
const texto = async (cambio: (f: Json) => void = () => undefined) => {
  const f = JSON.parse(JSON.stringify(await empaquetar())) as Json;
  cambio(f);
  return JSON.stringify(f);
};

describe("el archivo del Protocolo", () => {
  it("se empaqueta y se valida de ida y vuelta, con su hash", async () => {
    const archivo = await empaquetar();
    const v = await validateProtocolModelFile(JSON.stringify(archivo));
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.file.manifest.origin).toBe("protocolo");
    expect(v.file.manifest.task).toBe("binaria");
    expect(v.file.manifest.model_name).toBe("forest");
    expect(v.file.manifest.protocol).toEqual(BLOQUE);
    expect(v.file.manifest.dataset).toEqual({ name: "credito.csv", n_train: 160, n_test: 40 });
    expect(v.file.manifest.payload_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(v.file.manifest.created_at).toBe(FECHA.toISOString());
    expect(v.warnings).toEqual([]);
  });

  it("es una variante: no trae lo que el Protocolo nunca midió, y ni una fila", async () => {
    const m = (await empaquetar()).manifest as unknown as Json;
    for (const k of ["league", "selection", "metrics", "verdict", "leakage", "positive_rate", "baselines", "rows", "train", "test"])
      expect(m).not.toHaveProperty(k);
  });

  it("las tres tareas con objetivo se empaquetan y se validan", async () => {
    const m = await empaquetar("export-result-multiclase", { ...BLOQUE, metric: "balanced_accuracy" });
    expect((await validateProtocolModelFile(JSON.stringify(m))).ok).toBe(true);
    const r = await empaquetar("export-result-regresion", { ...BLOQUE, metric: "mae", test_value: 12.5 });
    expect((await validateProtocolModelFile(JSON.stringify(r))).ok).toBe(true);
  });

  it("agrupar no existe en el Protocolo: no se empaqueta", async () => {
    await expect(empaquetar("export-result-agrupar")).rejects.toThrow(/no agrupa/);
  });
});

describe("no se confunden", () => {
  it("el validador de Probeta rechaza el archivo del Protocolo por su forma", async () => {
    const v = await validateModelFile(JSON.stringify(await empaquetar()));
    expect(v.ok).toBe(false);
  });

  it("el del Protocolo rechaza un archivo de Probeta", async () => {
    const probeta = readFileSync(resolve(__dirname, "../../docs/kit-de-prueba/modelo-ajeno.json"), "utf8");
    expect((await validateProtocolModelFile(probeta)).ok).toBe(false);
  });

  it("se reconoce por el inicio del texto; un origin dentro del payload no lo engaña", async () => {
    expect(esArchivoDelProtocolo(JSON.stringify(await empaquetar()))).toBe(true);
    expect(esArchivoDelProtocolo(JSON.stringify({ format_version: 1, manifest: { task: "binaria" } }))).toBe(false);
    const relleno = "x".repeat(30_000);
    expect(esArchivoDelProtocolo(`{"a":"${relleno}","origin":"protocolo"}`)).toBe(false);
  });

  it("la guarda del manifiesto mira el valor, no la mera presencia de la clave", async () => {
    const protocolo = await empaquetar();
    expect(esManifiestoDelProtocolo(protocolo.manifest)).toBe(true);
    expect(esManifiestoDelProtocolo({ ...protocolo.manifest, origin: "otro" } as never)).toBe(false);
  });
});

describe("las carnadas: cada una rompe una cosa y el validador la nombra", () => {
  const rechaza = async (cambio: (f: Json) => void, campo: string, error = "invalid-format") => {
    const v = await validateProtocolModelFile(await texto(cambio));
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.error).toBe(error);
    if (campo) expect(v.field).toContain(campo);
  };

  it("la forma", async () => {
    await rechaza((f) => (f.manifest.task = "agrupar"), "task");
    await rechaza((f) => (f.manifest.origin = "otro"), "origin");
    await rechaza((f) => delete f.manifest.protocol, "protocol");
    await rechaza((f) => delete f.manifest.schema, "schema");
    await rechaza((f) => delete f.manifest.versions, "versions");
    await rechaza((f) => (f.payload = ""), "payload");
    await rechaza((f) => (f.manifest.app.name = "otra-app"), "app");
  });

  it("el bloque del Protocolo", async () => {
    await rechaza((f) => (f.manifest.protocol.huella = "abc"), "huella");
    await rechaza((f) => (f.manifest.protocol.sello = "G".repeat(64)), "sello");
    await rechaza((f) => (f.manifest.protocol.metric = "nada"), "metric");
    await rechaza((f) => (f.manifest.protocol.n_train = 0), "n_train");
    await rechaza((f) => (f.manifest.protocol.n_test = 1.5), "n_test");
    await rechaza((f) => (f.manifest.protocol.test_value = "alto"), "test_value");
  });

  it("lo que el resumen muestra tiene que ser lo que el archivo puntúa", async () => {
    await rechaza((f) => (f.manifest.protocol.winner = "logistic"), "protocol.winner");
    await rechaza((f) => (f.manifest.model_name = "linear"), "model_name");
    // una métrica que existe pero no es de la tarea del archivo
    await rechaza((f) => (f.manifest.protocol.metric = "mae"), "protocol.metric");
  });

  it("el formato y el hash", async () => {
    await rechaza((f) => (f.format_version = 2), "", "unsupported-version");
    await rechaza((f) => delete f.format_version, "", "invalid-format");
    await rechaza((f) => (f.payload = f.payload.slice(0, -8) + "AAAAAAAA"), "", "hash-mismatch");
    expect((await validateProtocolModelFile("no es json")).ok).toBe(false);
    expect(await validateProtocolModelFile("[]")).toEqual({ ok: false, error: "invalid-format" });
  });
});
