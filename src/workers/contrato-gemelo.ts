// S20 (ADR 029): el lector de lo que `synthesize` entrega. Vive aparte de contract.ts (que ya llega al bundle inicial de `/`): solo lo
// importa el panel diferido del gemelo. Además de la forma cruza lo que solo el lector puede comprobar: es de lo que se envió (las
// mismas columnas, el mismo tipo, cuántas filas reales y sintéticas, la semilla), cada fila sintética tiene una celda por columna,
// y —lo que el informe afirma sobre la privacidad— **recuenta él mismo las filas sintéticas idénticas a una real** (con las mismas
// reglas: números a 6 cifras significativas, categorías con menos de 5 filas juntas en «otras») y exige que sea el número que el
// worker dijo. Rechaza nombrando el campo, jamás con un valor (regla dura 2).
import { isNullToken, parseNumber } from "@/lib/ds/csv";
import {
  arr,
  check,
  int,
  num,
  obj,
  oneOf,
  refine,
  str,
  type Checked,
} from "@/lib/validate";
import type { SynthesizePayload, SynthesizeResult } from "@/workers/protocol";

/** Lo que fija `pipeline.py` (SYNTH_RARE_CATEGORY, SYNTH_PROXIMITY_MAX, SYNTH_OTHERS, SYNTH_SIG) y el lector comprueba. */
export const GEMELO_CATEGORIA_RARA = 5;
export const GEMELO_CERCANIA_MAX = 2000;
const OTRAS = "otras";
const CIFRAS = 6;

export type GemeloSent = { readonly payload: SynthesizePayload };

const unidad = refine(num, (v) => (v as number) >= 0 && (v as number) <= 1);
const positivo = refine(num, (v) => (v as number) >= 0);
const tipo = oneOf(["numeric", "categorical"]);

/** La firma de una fila (las celdas vacías son `null`; los números, a 6 cifras significativas). */
function firma(celdas: readonly (number | string | null)[]): string {
  return JSON.stringify(celdas);
}

/** Las firmas de las filas reales, con las categorías raras juntas como las junta el worker. */
function firmasReales(payload: SynthesizePayload): Set<string> {
  const { headers, kinds, rows } = payload;
  const etiqueta = headers.map((_, j) => {
    if (kinds[j] !== "categorical") return null;
    const cuentas = new Map<string, number>();
    for (const fila of rows) {
      const c = fila[j] ?? "";
      if (isNullToken(c)) continue;
      cuentas.set(c.trim(), (cuentas.get(c.trim()) ?? 0) + 1);
    }
    const mantenidas = new Set([...cuentas].filter(([, n]) => n >= GEMELO_CATEGORIA_RARA).map(([c]) => c));
    let otras = OTRAS;
    while (mantenidas.has(otras)) otras += "_";
    return (c: string) => (mantenidas.has(c) ? c : otras);
  });
  const set = new Set<string>();
  for (const fila of rows) {
    set.add(
      firma(
        headers.map((_, j) => {
          const c = fila[j] ?? "";
          if (isNullToken(c)) return null;
          if (kinds[j] === "numeric") {
            const v = parseNumber(c);
            return v === null ? null : Number(v.toPrecision(CIFRAS));
          }
          return etiqueta[j]!(c.trim());
        }),
      ),
    );
  }
  return set;
}

export function validateSynthesizeResult(
  raw: unknown,
  sent: GemeloSent,
): Checked<SynthesizeResult> {
  const { payload } = sent;
  const shaped = check<SynthesizeResult>(
    obj({
      headers: arr(str, 1),
      kinds: arr(tipo, 1),
      n_real: refine(int, (v) => (v as number) >= 1),
      n_rows: refine(int, (v) => (v as number) >= 1),
      seed: int,
      rows: arr(arr(str)),
      columns: arr(obj({ name: str, kind: tipo, value: unidad, floor: unidad }), 1),
      proximity: obj({
        median_syn: positivo,
        median_real: positivo,
        p5_real: positivo,
        share_below: unidad,
        n_real: refine(int, (v) => (v as number) >= 1),
        n_syn: refine(int, (v) => (v as number) >= 1),
      }),
      copies: refine(int, (v) => (v as number) >= 0),
      resampled: refine(int, (v) => (v as number) >= 0),
      rounds: refine(int, (v) => (v as number) >= 0),
      rare_merged: arr(obj({ column: str, merged: refine(int, (v) => (v as number) >= 1) })),
      elapsed_ms: num,
    }),
    raw,
  );
  if (!shaped.ok) return shaped;
  const r = shaped.value;

  // es de lo que se envió
  if (r.headers.join("\u0000") !== payload.headers.join("\u0000")) return { ok: false, field: "headers" };
  if (r.kinds.join(",") !== payload.kinds.join(",")) return { ok: false, field: "kinds" };
  if (r.n_real !== payload.rows.length) return { ok: false, field: "n_real" };
  if (r.n_rows !== payload.n_rows) return { ok: false, field: "n_rows" };
  if (r.seed !== payload.seed) return { ok: false, field: "seed" };
  if (r.rows.length !== r.n_rows) return { ok: false, field: "rows" };
  for (const fila of r.rows) if (fila.length !== r.headers.length) return { ok: false, field: "rows" };
  // un número es un número (o vacío)
  for (let j = 0; j < r.kinds.length; j++)
    if (r.kinds[j] === "numeric")
      for (const fila of r.rows) if (fila[j] !== "" && parseNumber(fila[j]!) === null) return { ok: false, field: "rows" };
  if (r.columns.map((c) => c.name).join("\u0000") !== r.headers.join("\u0000")) return { ok: false, field: "columns" };
  if (r.columns.map((c) => c.kind).join(",") !== r.kinds.join(",")) return { ok: false, field: "columns" };
  const categoricas = new Set(r.headers.filter((_, j) => r.kinds[j] === "categorical"));
  for (const m of r.rare_merged) if (!categoricas.has(m.column)) return { ok: false, field: "rare_merged" };
  if (r.proximity.n_real !== Math.min(r.n_real, GEMELO_CERCANIA_MAX)) return { ok: false, field: "proximity" };
  if (r.proximity.n_syn !== Math.min(r.n_rows, GEMELO_CERCANIA_MAX)) return { ok: false, field: "proximity" };

  // la privacidad que el informe afirma: las copias exactas se recuentan aquí, con la tabla real delante
  const reales = firmasReales(payload);
  let copias = 0;
  for (const fila of r.rows)
    if (
      reales.has(
        firma(
          fila.map((c, j) => {
            if (c === "") return null;
            if (r.kinds[j] === "numeric") return Number(Number(c).toPrecision(CIFRAS));
            return c;
          }),
        ),
      )
    )
      copias += 1;
  if (copias !== r.copies) return { ok: false, field: "copies" };
  return shaped;
}
