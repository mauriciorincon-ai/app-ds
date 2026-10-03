// Arma los payloads del spike con el camino REAL de la app: CSV → parseCsvWithLimits →
// sanitizeTable → prepareRun (split estratificado, métrica primaria, numéricas/categóricas).
// Salida: $SPIKE_OUT/payloads.json (fuera del repo). Los datasets: los 4 del kit de prueba
// (200 filas, objetivos reales) + sintéticos con categóricas y nulos (2.000 · 5.000 · 20.000 y
// uno ANCHO de 2.000 filas para ver cómo escala con las columnas tras one-hot).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { parseCsvWithLimits } from "@/lib/ds/csv";
import { sanitizeTable } from "@/engine/sanitize";
import { prepareRun } from "@/lib/experiment";
import { ligaSintetica } from "./datos.mjs";

const out = process.env.SPIKE_OUT ?? "/tmp/spike-liga";

const kit = (file: string) =>
  readFileSync(join("docs/kit-de-prueba", file), "utf8");

const datasets: { id: string; csv: string; target: string }[] = [
  {
    id: "marketing-200",
    csv: kit("marketing-campania.csv"),
    target: "convirtio",
  },
  {
    id: "rotacion-200",
    csv: kit("rotacion-empleados.csv"),
    target: "renuncio",
  },
  {
    id: "credito-fuga-200",
    csv: kit("credito-fuga-plantada.csv"),
    target: "incumplio",
  },
  {
    id: "clientes-sucio-200",
    csv: kit("clientes-sucio.csv"),
    target: "contrato",
  },
  {
    id: "sintetico-2000",
    csv: ligaSintetica({ n: 2_000, seed: 501 }),
    target: "objetivo",
  },
  {
    id: "ancho-2000",
    csv: ligaSintetica({
      n: 2_000,
      seed: 502,
      numericas: 30,
      cardinalidades: [30, 40, 12],
    }),
    target: "objetivo",
  },
  {
    id: "sintetico-5000",
    csv: ligaSintetica({ n: 5_000, seed: 503 }),
    target: "objetivo",
  },
  {
    id: "sintetico-20000",
    csv: ligaSintetica({ n: 20_000, seed: 504 }),
    target: "objetivo",
  },
];

it("arma los payloads con prepareRun real", () => {
  mkdirSync(out, { recursive: true });
  const payloads = datasets.map(({ id, csv, target }) => {
    const parsed = parseCsvWithLimits(csv);
    if (!parsed.ok) throw new Error(`${id}: ${parsed.error.kind}`);
    const { table } = sanitizeTable(parsed.table);
    const prepared = prepareRun(table, target, 42);
    if (!prepared.ok) throw new Error(`${id}: ${prepared.error}`);
    return {
      id,
      rows: table.rows.length,
      cols: table.headers.length,
      csvBytes: Buffer.byteLength(csv),
      payload: prepared.payload,
    };
  });
  writeFileSync(join(out, "payloads.json"), JSON.stringify(payloads));
  for (const p of payloads) {
    console.log(
      `${p.id}: ${p.rows} filas · ${p.payload.numeric.length} num + ${p.payload.categorical.length} cat · train ${p.payload.train_idx.length} / test ${p.payload.test_idx.length} · métrica ${p.payload.primary_metric} · ${(p.csvBytes / 1024).toFixed(0)} KB`,
    );
  }
  expect(payloads).toHaveLength(datasets.length);
});
