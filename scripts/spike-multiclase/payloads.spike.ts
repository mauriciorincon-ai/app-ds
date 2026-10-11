// Arma los payloads del spike MULTICLASE (S7 F0) con el camino real de la app hasta donde existe:
// CSV → parseCsvWithLimits → sanitizeTable → selectFeatures (la regla real de features) → el
// stratifiedSplit REAL sobre la clase (ya maneja K clases). La rama multiclase de prepareRun llega
// en la F1, así que el split lo arma aquí el arnés. LÍMITE DECLARADO: en la F1 el cruce de punta a
// punta usa el prepareRun real. Salida: $SPIKE_OUT/payloads.json (fuera del repo).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { isNullToken, parseCsvWithLimits } from "@/lib/ds/csv";
import { sanitizeTable } from "@/engine/sanitize";
import { selectFeatures } from "@/lib/experiment";
import { stratifiedSplit } from "@/engine/split";
import { multiclaseSintetica } from "./datos.mjs";

const out = process.env.SPIKE_OUT ?? "/tmp/spike-multiclase";
const TEST_SIZE = 0.25;

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

type Spec = {
  id: string;
  csv: string;
  target: string;
  splitSeed?: number;
  reps?: number;
  explain?: boolean;
  nullSim?: boolean;
};

const fuga = kit("planes-fuga-plantada.csv");
const planes = kit("planes-suscripcion.csv");
const datasets: Spec[] = [
  {
    id: "planes-200",
    csv: planes,
    target: "plan",
    explain: true,
    nullSim: true,
  },
  { id: "planes-fuga-200", csv: fuga, target: "plan" },
  {
    id: "planes-sin-fuga-200",
    csv: dropColumn(fuga, "cargo_corporativo_usd"),
    target: "plan",
  },
  // D2: la ambigua respondida «Categorías» (ocupantes 1..6, con señal real en el consumo).
  { id: "ocupantes-200", csv: kit("consumo-energia.csv"), target: "ocupantes" },
  // Sin señal: `departamento` se sortea independiente. El caso honesto en que el baseline gana.
  {
    id: "departamento-200",
    csv: kit("rotacion-empleados.csv"),
    target: "departamento",
  },
  {
    id: "planes-5000",
    csv: kit("planes-suscripcion-mediano.csv"),
    target: "plan",
    explain: true,
  },
  {
    id: "sintetico-2000-k5",
    csv: multiclaseSintetica({ n: 2_000, seed: 701 }),
    target: "objetivo",
  },
  {
    id: "ancho-2000-k5",
    csv: multiclaseSintetica({
      n: 2_000,
      seed: 702,
      numericas: 30,
      cardinalidades: [30, 40, 12],
    }),
    target: "objetivo",
  },
  {
    id: "sintetico-5000-k5",
    csv: multiclaseSintetica({ n: 5_000, seed: 703 }),
    target: "objetivo",
  },
  {
    id: "sintetico-20000-k5",
    csv: multiclaseSintetica({ n: 20_000, seed: 704 }),
    target: "objetivo",
    // Una sola corrida (declarado en el informe): con tres, el lote pasaría de la hora.
    reps: 1,
  },
  {
    id: "sintetico-2000-k3",
    csv: multiclaseSintetica({ n: 2_000, seed: 705, clases: 3 }),
    target: "objetivo",
  },
  {
    id: "sintetico-2000-k10",
    csv: multiclaseSintetica({ n: 2_000, seed: 706, clases: 10 }),
    target: "objetivo",
  },
  {
    id: "sintetico-2000-k20",
    csv: multiclaseSintetica({ n: 2_000, seed: 707, clases: 20 }),
    target: "objetivo",
  },
  // Estabilidad del ganador entre particiones: el mismo dataset con otras 4 semillas de split.
  ...[43, 44, 45, 46].map((s) => ({
    id: `planes-200-s${s}`,
    csv: planes,
    target: "plan",
    splitSeed: s,
    reps: 1,
  })),
];

it("arma los payloads multiclase", () => {
  mkdirSync(out, { recursive: true });
  const payloads = datasets.map(
    ({ id, csv, target, splitSeed = 42, reps, explain = false, nullSim = false }) => {
      const parsed = parseCsvWithLimits(csv);
      if (!parsed.ok) throw new Error(`${id}: ${parsed.error.kind}`);
      const { table } = sanitizeTable(parsed.table);
      const ti = table.headers.indexOf(target);
      const rows = table.rows.filter((row) => !isNullToken(row[ti]));
      const labels = rows.map((row) => row[ti].trim());
      const classes = [...new Set(labels)].sort();
      const { numeric, categorical } = selectFeatures(table, target);
      const { trainIdx, testIdx } = stratifiedSplit(
        labels,
        TEST_SIZE,
        splitSeed,
      );
      return {
        id,
        rows: rows.length,
        cols: table.headers.length,
        classes: classes.length,
        csvBytes: Buffer.byteLength(csv),
        ...(reps ? { reps } : {}),
        payload: {
          headers: table.headers,
          rows,
          target,
          numeric,
          categorical,
          train_idx: trainIdx,
          test_idx: testIdx,
          seed: 42,
          explain,
          null_sim: nullSim,
        },
      };
    },
  );
  writeFileSync(join(out, "payloads.json"), JSON.stringify(payloads));
  for (const p of payloads) {
    console.log(
      `${p.id}: ${p.rows} filas · K=${p.classes} · ${p.payload.numeric.length} num + ${p.payload.categorical.length} cat · train ${p.payload.train_idx.length} / test ${p.payload.test_idx.length}`,
    );
  }
  expect(payloads).toHaveLength(datasets.length);
});
