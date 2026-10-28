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

  it("los números salen con diez cifras significativas y sin notación científica; el recuento de copias sigue siendo el mismo para Python y para el lector", () => {
    const filas = Array.from({ length: 300 }, (_, i) => [String(1234567.891 + i * 137.4271), String(i % 7)]);
    const grande: SynthesizePayload = { headers: ["importe", "grupo"], kinds: ["numeric", "numeric"], rows: filas, n_rows: 120, seed: 42 };
    const raw = call(grande);
    const importes = raw.rows.map((f) => f[0]!);
    expect(importes.filter((t) => /e[+-]/i.test(t)), "una cifra en notación científica").toEqual([]);
    expect(importes.some((t) => t.replace(/\D/g, "").length >= 8), "ninguna cifra sale con más de 6 dígitos").toBe(true);
    expect(valido(grande, raw).copies).toBe(0);
  });

  it("la cercanía con categóricas de miles de valores usa una matriz dispersa y da lo mismo que la densa (S21, M-4)", () => {
    // 700 + 700 categorías: por encima de SYNTH_SPARSE_FROM (512) → dispersa; la misma tabla con el umbral subido → densa
    const n = 3500;
    const filas = Array.from({ length: n }, (_, i) => [String(10 + ((i * 37) % 101) / 3), `a_${(i * 7919) % 700}`, `b_${(i * 104729) % 700}`]);
    const payload: SynthesizePayload = { headers: ["x", "a", "b"], kinds: ["numeric", "categorical", "categorical"], rows: filas, n_rows: 600, seed: 5 };
    const dispersa = call(payload);
    py.runPython("SYNTH_SPARSE_FROM = 10**9");
    let densa: SynthesizeResult;
    try {
      densa = call(payload);
    } finally {
      py.runPython("SYNTH_SPARSE_FROM = 512");
    }
    expect(dispersa.rows).toEqual(densa.rows);
    expect(dispersa.copies).toBe(densa.copies);
    for (const k of ["median_syn", "median_real", "p5_real", "share_below"] as const)
      expect(dispersa.proximity[k]).toBeCloseTo(densa.proximity[k], 8);
    expect(dispersa.proximity.n_real).toBe(densa.proximity.n_real);
    expect(dispersa.proximity.n_syn).toBe(densa.proximity.n_syn);
  }, 300_000);

  // El presupuesto de TIEMPO (30 s, medido en solitario: 13,7 s) vive en `medidas-s21.test.ts` (MEDIR=1): en la suite entera, con 25 archivos de
  // Pyodide a la vez, el mismo caso tardó 45 s una vez y 25 s otra, y un gate que depende del reloj de la CI es un gate intermitente. Aquí se
  // vigila lo que no depende del reloj: que el peor caso TERMINA y que la memoria de WebAssembly se queda lejos del techo (la matriz densa
  // llegaba a 1 829 MiB de 2 048; la dispersa, a 322).
  it("el peor caso que deja pasar la puerta (50 000 filas, 3 categóricas de 10 000 valores) termina y la memoria queda lejos del techo de 2 GiB", () => {
    const n = 50_000;
    const mult = [7919, 104729, 1299709];
    const filas = Array.from({ length: n }, (_, i) => [
      String(50 + ((i * 37) % 101) / 3),
      ...mult.map((m, j) => `c${j}_${(i * m) % 10_000}`),
    ]);
    const tabla: CsvTable = { headers: ["x", "c0", "c1", "c2"], rows: filas };
    const plan = planGemelo(tabla, []);
    expect(plan.incluidas).toHaveLength(4);
    const raw = call(envioGemelo(tabla, plan, n));
    expect(raw.rows).toHaveLength(n);
    const heap = (py as unknown as { _module: { HEAPU8: Uint8Array } })._module.HEAPU8.length / 1024 / 1024;
    expect(heap, "MiB del heap de WebAssembly tras el peor caso").toBeLessThan(1024);
  }, 300_000);

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
