// @vitest-environment node
//
// S20 (ADR 029): el gemelo sintético en el Pyodide REAL. Garantías que estos tests hacen FALLAR si se rompen:
//  - el EMISOR real (`run_synthesize`) y el lector (`validateSynthesizeResult`) se entienden; este test escribe el fixture del contrato
//    (CONTRATO_ACTUALIZAR=1 lo regenera) y tests/unit/contract-gemelo.test.ts corre sus carnadas;
//  - el gemelo del kit: cero copias exactas (recontadas por el LECTOR con la tabla real delante), «se puede compartir», los enteros
//    siguen siendo enteros, los vacíos siguen existiendo y las categorías raras viajan juntas como «otras»;
//  - la misma tabla y la misma semilla dan el mismo gemelo; otra semilla, otro;
//  - un gemelo forzado a copiar (una tabla con pocas combinaciones posibles) da «no compartir» y lo dice;
//  - lo que no viaja no está en el resultado; un payload con una clave de más se rechaza nombrándola.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PyodideInterface } from "pyodide";
import { envioGemelo, leerRelaciones, planGemelo, veredictoGemelo } from "@/engine/gemelo";
import { parseCsvWithLimits, type CsvTable } from "@/lib/ds/csv";
import { validateSynthesizeResult } from "@/workers/contrato-gemelo";
import type { SynthesizePayload, SynthesizeResult } from "@/workers/protocol";
import { loadRuntime, pyFunction } from "./runtime";

let py: PyodideInterface;
beforeAll(async () => {
  py = await loadRuntime();
}, 300_000);

const call = (payload: unknown): SynthesizeResult =>
  JSON.parse(pyFunction(py, "run_synthesize")(JSON.stringify(payload))) as SynthesizeResult;

function failure(payload: unknown): string {
  try {
    call(payload);
  } catch (error) {
    return String((error as Error).message);
  }
  return "";
}

const FIXTURES = resolve(process.cwd(), "tests/fixtures/contrato");
const UPDATE = process.env.CONTRATO_ACTUALIZAR === "1";

function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.length ? ["array", shape(value[0])] : ["array"];
  if (value === null) return "null";
  if (typeof value === "object")
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((k) => [k, shape((value as Record<string, unknown>)[k])]),
    );
  return typeof value;
}

function emit(name: string, value: unknown) {
  const file = resolve(FIXTURES, `${name}.json`);
  if (UPDATE) {
    mkdirSync(FIXTURES, { recursive: true });
    writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
    return;
  }
  expect(existsSync(file), `falta el fixture ${name}.json (CONTRATO_ACTUALIZAR=1)`).toBe(true);
  expect(shape(value), `la forma de ${name} cambió: regenera con CONTRATO_ACTUALIZAR=1`).toEqual(
    shape(JSON.parse(readFileSync(file, "utf8"))),
  );
}

const kit = (archivo: string): CsvTable => {
  const p = parseCsvWithLimits(readFileSync(resolve(process.cwd(), "docs/kit-de-prueba", archivo), "utf8"));
  if (!p.ok) throw new Error("csv");
  return p.table;
};

const sinReloj = (r: SynthesizeResult) => ({ ...r, elapsed_ms: 0 });
const valido = (payload: SynthesizePayload, raw: unknown) => {
  const v = validateSynthesizeResult(raw, { payload });
  if (!v.ok) throw new Error(`el lector rechazó el resultado: ${v.field}`);
  return v.value;
};

describe("el gemelo del kit", () => {
  const tabla = kit("marketing-campania.csv");
  const plan = planGemelo(tabla, []);
  const payload = envioGemelo(tabla, plan, tabla.rows.length);

  it("cero copias, «se puede compartir», y el lector (que recuenta las copias él mismo) lo acepta", () => {
    const raw = call(payload);
    emit("synthesize-result", raw);
    const r = valido(payload, raw);
    expect(r.copies).toBe(0);
    expect(r.rows).toHaveLength(tabla.rows.length);
    const real: CsvTable = { headers: payload.headers, rows: payload.rows };
    const informe = veredictoGemelo(r, leerRelaciones(real, { headers: r.headers, rows: r.rows }));
    expect(informe.razones).toEqual([]);
    expect(informe.veredicto).toBe("compartir");
    expect(informe.columnas.nivel).toBe("bien");
    expect(informe.relaciones.nivel).toBe("bien");
    expect(informe.cercania.nivel).toBe("bien");
  });

  it("los enteros siguen siendo enteros, las categorías son las de los datos y ninguna fila sintética es una real", () => {
    const r = valido(payload, call(payload));
    const j = (name: string) => r.headers.indexOf(name);
    for (const fila of r.rows) expect(fila[j("edad")]).toMatch(/^-?\d+$/);
    const regiones = new Set(tabla.rows.map((f) => f[tabla.headers.indexOf("region")]));
    for (const fila of r.rows) expect(regiones).toContain(fila[j("region")]);
    const reales = new Set(payload.rows.map((f) => JSON.stringify(f)));
    expect(r.rows.filter((f) => reales.has(JSON.stringify(f)))).toHaveLength(0);
  });

  it("es determinista: la misma tabla y la misma semilla dan el mismo gemelo; otra semilla, otro", () => {
    expect(sinReloj(call(payload))).toEqual(sinReloj(call(payload)));
    expect(call({ ...payload, seed: payload.seed + 1 }).rows).not.toEqual(call(payload).rows);
  });

  it("n filas pedidas es lo que sale, también más que las reales", () => {
    const grande = call({ ...payload, n_rows: 500 });
    expect(grande.rows).toHaveLength(500);
    expect(valido({ ...payload, n_rows: 500 }, grande).copies).toBe(0);
  });
});

describe("lo que el gemelo no deja pasar", () => {
  it("un gemelo forzado a copiar (pocas combinaciones posibles) da «no compartir» y lo dice", () => {
    const filas = Array.from({ length: 200 }, (_, i) => [["a", "b"][i % 2]!, ["x", "y"][(i >> 1) % 2]!]);
    const payload: SynthesizePayload = { headers: ["uno", "dos"], kinds: ["categorical", "categorical"], rows: filas, n_rows: 200, seed: 42 };
    const r = valido(payload, call(payload));
    expect(r.copies).toBeGreaterThan(0);
    expect(r.resampled).toBeGreaterThan(0);
    const informe = veredictoGemelo(r, leerRelaciones({ headers: payload.headers, rows: payload.rows }, { headers: r.headers, rows: r.rows }));
    expect(informe.veredicto).toBe("no_compartir");
    expect(informe.razones).toContain("copias");
  });

  it("las categorías con menos de 5 filas viajan juntas como «otras»: ninguna aparece tal cual", () => {
    const raras = ["rara1", "rara2", "rara3"];
    const filas = Array.from({ length: 120 }, (_, i) => [
      i < 3 ? raras[i]! : ["alta", "media", "baja"][i % 3]!,
      String(100 + (i % 17)),
    ]);
    const payload: SynthesizePayload = { headers: ["plan", "monto"], kinds: ["categorical", "numeric"], rows: filas, n_rows: 300, seed: 7 };
    const r = valido(payload, call(payload));
    const vistas = new Set(r.rows.map((f) => f[0]));
    for (const rara of raras) expect(vistas).not.toContain(rara);
    expect(r.rare_merged).toEqual([{ column: "plan", merged: 3 }]);
    expect(vistas).toContain("otras");
  });

  it("los vacíos siguen existiendo en la proporción de los datos", () => {
    const filas = Array.from({ length: 200 }, (_, i) => [i % 5 === 0 ? "" : String(10 + (i % 23)), ["a", "b", "c"][i % 3]!]);
    const payload: SynthesizePayload = { headers: ["v", "c"], kinds: ["numeric", "categorical"], rows: filas, n_rows: 2000, seed: 3 };
    const r = valido(payload, call(payload));
    const vacios = r.rows.filter((f) => f[0] === "").length / r.rows.length;
    expect(vacios).toBeGreaterThan(0.12);
    expect(vacios).toBeLessThan(0.28);
  });

  it("una tabla grande (20 000 filas) se gemela sin colgarse", () => {
    const filas = Array.from({ length: 20_000 }, (_, i) => [String(i % 90), ["a", "b", "c", "d"][i % 4]!, String((i * 7919) % 1000)]);
    const payload: SynthesizePayload = { headers: ["x", "g", "y"], kinds: ["numeric", "categorical", "numeric"], rows: filas, n_rows: 20_000, seed: 1 };
    const r = valido(payload, call(payload));
    expect(r.rows).toHaveLength(20_000);
  }, 180_000);
});

describe("el payload se valida al entrar", () => {
  const base: SynthesizePayload = {
    headers: ["a", "b"],
    kinds: ["numeric", "categorical"],
    rows: Array.from({ length: 30 }, (_, i) => [String(i), i % 2 ? "x" : "y"]),
    n_rows: 30,
    seed: 1,
  };
  it.each([
    ["una clave de más", { ...base, fechas: [] }, "contract:fechas"],
    ["encabezados repetidos", { ...base, headers: ["a", "a"] }, "contract:headers"],
    ["un tipo que no existe", { ...base, kinds: ["numeric", "fecha"] }, "contract:kinds"],
    ["tipos que no son los encabezados", { ...base, kinds: ["numeric"] }, "contract:kinds"],
    ["una fila más corta", { ...base, rows: [...base.rows.slice(1), ["1"]] }, "contract:rows"],
    ["muy pocas filas pedidas", { ...base, n_rows: 5 }, "contract:n_rows"],
    ["una semilla de texto", { ...base, seed: "1" }, "contract:seed"],
  ])("rechaza %s", (_nombre, payload, esperado) => {
    expect(failure(payload)).toContain(esperado);
  });
  it("con pocas filas reales dice «too-few-rows»", () => {
    expect(failure({ ...base, rows: base.rows.slice(0, 10) })).toContain("too-few-rows");
  });
});
