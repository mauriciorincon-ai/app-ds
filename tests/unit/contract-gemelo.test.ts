// S20 (regla 19, el lado que LEE): lo que `run_synthesize` entrega pasa por su lector antes de usarse. El fixture lo escribió pipeline.py
// en Pyodide (tests/integration/gemelo.test.ts); aquí cada carnada rompe UNA cosa y el lector la nombra, jamás con un valor. La que más
// importa: el lector RECUENTA las copias exactas con la tabla real delante, así que un worker que dijera «cero» con una fila copiada se
// rechaza (y uno que dijera «una» sin haberla, también).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { planGemelo, envioGemelo } from "@/engine/gemelo";
import { parseCsvWithLimits } from "@/lib/ds/csv";
import { validateSynthesizeResult } from "@/workers/contrato-gemelo";
import type { SynthesizePayload } from "@/workers/protocol";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixtures JSON que las carnadas mutan a propósito
type Json = Record<string, any>;
const fixture = (): Json => JSON.parse(readFileSync(resolve(__dirname, "../fixtures/contrato/synthesize-result.json"), "utf8")) as Json;

const tabla = (() => {
  const p = parseCsvWithLimits(readFileSync(resolve(__dirname, "../../docs/kit-de-prueba/marketing-campania.csv"), "utf8"));
  if (!p.ok) throw new Error("csv");
  return p.table;
})();
const payload: SynthesizePayload = envioGemelo(tabla, planGemelo(tabla, []), tabla.rows.length);

const rechaza = (r: unknown, campo: string, p: SynthesizePayload = payload) => {
  const v = validateSynthesizeResult(r, { payload: p });
  expect(v.ok, `debía rechazar ${campo}`).toBe(false);
  if (!v.ok) expect(v.field.split(/[.[]/)[0]).toBe(campo);
};

describe("el lector del gemelo", () => {
  it("acepta lo que pipeline.py escribió", () => {
    expect(validateSynthesizeResult(fixture(), { payload }).ok).toBe(true);
  });

  it("no es de lo que se envió: otras columnas, otro tipo, otras filas, otra semilla", () => {
    const r = fixture();
    rechaza(r, "headers", { ...payload, headers: [...payload.headers].reverse() });
    rechaza(r, "kinds", { ...payload, kinds: payload.kinds.map(() => "numeric" as const) });
    rechaza(r, "n_real", { ...payload, rows: payload.rows.slice(1) });
    rechaza(r, "n_rows", { ...payload, n_rows: 77 });
    rechaza(r, "seed", { ...payload, seed: 1 });
  });

  it("la forma de las filas: una por gemelo pedido, una celda por columna, los números son números", () => {
    const a = fixture();
    a.rows.pop();
    rechaza(a, "rows");
    const b = fixture();
    b.rows[3].pop();
    rechaza(b, "rows");
    const c = fixture();
    c.rows[3][payload.kinds.indexOf("numeric")] = "alto";
    rechaza(c, "rows");
    const d = fixture();
    delete d.proximity;
    rechaza(d, "proximity");
  });

  it("el informe: una medida fuera de 0 a 1, columnas que no son las enviadas, categorías raras en una columna que no es categórica", () => {
    const a = fixture();
    a.columns[0].value = 1.5;
    rechaza(a, "columns");
    const b = fixture();
    b.columns[0].name = "otra";
    rechaza(b, "columns");
    const c = fixture();
    c.rare_merged = [{ column: payload.headers[payload.kinds.indexOf("numeric")], merged: 2 }];
    rechaza(c, "rare_merged");
    const d = fixture();
    d.proximity.n_syn += 1;
    rechaza(d, "proximity");
  });

  it("LAS COPIAS: el lector las recuenta con la tabla real delante", () => {
    // una fila real pegada en el gemelo, con el worker diciendo «cero»: se rechaza nombrando `copies`
    const copiada = fixture();
    copiada.rows[0] = [...payload.rows[5]!];
    rechaza(copiada, "copies");
    // y diciendo la verdad (una copia) se acepta
    copiada.copies = 1;
    expect(validateSynthesizeResult(copiada, { payload }).ok).toBe(true);
    // el worker dice una copia que no existe
    const inventada = fixture();
    inventada.copies = 1;
    rechaza(inventada, "copies");
  });

  it("una copia con las mismas cifras a 6 dígitos significativos también es copia", () => {
    const copiada = fixture();
    const j = payload.kinds.indexOf("numeric");
    const real = [...payload.rows[9]!];
    // el número real con ruido más allá de la sexta cifra significativa
    real[j] = String(Number(real[j]) + 1e-9);
    copiada.rows[2] = real;
    rechaza(copiada, "copies");
  });

  it("el rechazo nombra el campo, jamás un valor", () => {
    const r = fixture();
    r.rows[0][0] = "valor-secreto-12345";
    const v = validateSynthesizeResult(r, { payload });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.field).not.toMatch(/12345|secreto/);
  });
});
