// Arma los payloads del spike de REGRESIÓN (S6 F0) con el camino real de la app hasta donde existe:
// CSV → parseCsvWithLimits → sanitizeTable → selectFeatures (la regla real de features). La rama
// numérica de prepareRun todavía no existe (llega en la F1), así que el SPLIT lo arma aquí el arnés
// con la regla propuesta (P4): bandas por cuantiles del objetivo + el stratifiedSplit real sobre la
// banda. LÍMITE DECLARADO: en la F1 el cruce de punta a punta usa el prepareRun real.
// Salida: $SPIKE_OUT/payloads.json (fuera del repo).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { isNullToken, parseCsvWithLimits, parseNumber } from "@/lib/ds/csv";
import { sanitizeTable } from "@/engine/sanitize";
import { selectFeatures } from "@/lib/experiment";
import { stratifiedSplit } from "@/engine/split";
import { regresionSintetica } from "./datos.mjs";

const out = process.env.SPIKE_OUT ?? "/tmp/spike-regresion";
const TEST_SIZE = 0.25;
const BANDS = 5;

const kit = (file: string) =>
  readFileSync(join("docs/kit-de-prueba", file), "utf8");

/** Quita una columna de un CSV simple (sin comillas): el «mismo dataset sin la fuga». */
function dropColumn(csv: string, column: string): string {
  const lines = csv.trimEnd().split("\n");
  const index = lines[0].split(",").indexOf(column);
  return (
    lines
      .map((line) =>
        line
          .split(",")
          .filter((_, i) => i !== index)
          .join(","),
      )
      .join("\n") + "\n"
  );
}

const precio = kit("precio-fuga-plantada.csv");
const datasets: { id: string; csv: string; target: string }[] = [
  { id: "consumo-200", csv: kit("consumo-energia.csv"), target: "consumo_kwh" },
  { id: "precio-fuga-200", csv: precio, target: "precio_usd" },
  {
    id: "precio-sin-fuga-200",
    csv: dropColumn(precio, "impuesto_transferencia_usd"),
    target: "precio_usd",
  },
  // R19: `edad` en Rotación deja de ser «no entrenable». En ese generador la edad es ruido puro:
  // es el caso honesto en que el baseline debe ganar o empatar.
  {
    id: "rotacion-edad-200",
    csv: kit("rotacion-empleados.csv"),
    target: "edad",
  },
  {
    id: "consumo-5000",
    csv: kit("consumo-energia-mediano.csv"),
    target: "consumo_kwh",
  },
  {
    id: "sintetico-2000",
    csv: regresionSintetica({ n: 2_000, seed: 601 }),
    target: "objetivo",
  },
  {
    id: "ancho-2000",
    csv: regresionSintetica({
      n: 2_000,
      seed: 602,
      numericas: 30,
      cardinalidades: [30, 40, 12],
    }),
    target: "objetivo",
  },
  {
    id: "sintetico-5000",
    csv: regresionSintetica({ n: 5_000, seed: 603 }),
    target: "objetivo",
  },
  {
    id: "sintetico-20000",
    csv: regresionSintetica({ n: 20_000, seed: 604 }),
    target: "objetivo",
  },
];

/** P4: banda por cuantiles (rango) del objetivo → stratifiedSplit sobre la banda. */
function quantileSplit(values: number[], seed: number) {
  const order = values
    .map((v, i) => [v, i] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const band = new Array<number>(values.length);
  order.forEach(([, i], rank) => {
    band[i] = Math.min(BANDS - 1, Math.floor((rank * BANDS) / values.length));
  });
  return stratifiedSplit(band, TEST_SIZE, seed);
}

it("arma los payloads de regresión", () => {
  mkdirSync(out, { recursive: true });
  const payloads = datasets.map(({ id, csv, target }) => {
    const parsed = parseCsvWithLimits(csv);
    if (!parsed.ok) throw new Error(`${id}: ${parsed.error.kind}`);
    const { table } = sanitizeTable(parsed.table);
    const ti = table.headers.indexOf(target);
    const rows = table.rows.filter((row) => !isNullToken(row[ti]));
    const y = rows.map((row) => parseNumber(row[ti].trim()));
    if (y.some((v) => v === null))
      throw new Error(`${id}: objetivo no numérico`);
    const { numeric, categorical } = selectFeatures(table, target);
    const { trainIdx, testIdx } = quantileSplit(y as number[], 42);
    return {
      id,
      rows: rows.length,
      cols: table.headers.length,
      csvBytes: Buffer.byteLength(csv),
      payload: {
        headers: table.headers,
        rows,
        target,
        numeric,
        categorical,
        train_idx: trainIdx,
        test_idx: testIdx,
        seed: 42,
        primary_metric: "mae",
      },
    };
  });
  writeFileSync(join(out, "payloads.json"), JSON.stringify(payloads));
  for (const p of payloads) {
    console.log(
      `${p.id}: ${p.rows} filas · ${p.payload.numeric.length} num + ${p.payload.categorical.length} cat · train ${p.payload.train_idx.length} / test ${p.payload.test_idx.length} · ${(p.csvBytes / 1024).toFixed(0)} KB`,
    );
  }
  expect(payloads).toHaveLength(datasets.length);
});
