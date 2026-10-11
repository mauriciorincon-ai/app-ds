// Arma los payloads de la medición de COSTOS de agrupar (S7 F2) con la entrada REAL del
// producto: CSV → parseCsvWithLimits → sanitizeTable → prepareClusterRun (columnas, distancia,
// rango de k). El roster se fuerza a los cuatro agrupadores: se mide cada uno, no el reparto.
// Salida: $SPIKE_OUT/payloads.json (fuera del repo).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { CLUSTER_MEMBER_IDS } from "@/engine/roster";
import { sanitizeTable } from "@/engine/sanitize";
import { parseCsvWithLimits } from "@/lib/ds/csv";
import { prepareClusterRun } from "@/lib/experiment";
import { nubes, uniforme } from "../spike-agrupar/datos.mjs";

const out = process.env.SPIKE_OUT ?? "/tmp/costos-agrupar";
const kit = (file: string) =>
  readFileSync(join("docs/kit-de-prueba", file), "utf8");

type Spec = { id: string; csv: string; reps?: number };

// Los sintéticos `nubes` (4 grupos en 4 dimensiones + una numérica de ruido + una categórica)
// dan 5 columnas de distancia: la referencia del ancho. `nubes-ancho` (12 dimensiones) da 13,
// para el exponente del ancho. Los del kit fijan t0 (lo mínimo, con pocas filas).
const datasets: Spec[] = [
  { id: "segmentos-300", csv: kit("segmentos-clientes.csv") },
  { id: "sin-grupos-300", csv: kit("sin-grupos.csv") },
  { id: "consumo-200", csv: kit("consumo-energia.csv") },
  { id: "planes-200", csv: kit("planes-suscripcion.csv") },
  { id: "nubes-500", csv: nubes({ n: 500, seed: 901 }) },
  { id: "nubes-2000", csv: nubes({ n: 2_000, seed: 902 }) },
  { id: "nubes-ancho-2000", csv: nubes({ n: 2_000, seed: 903, dims: 12 }) },
  { id: "nubes-5000", csv: nubes({ n: 5_000, seed: 904 }) },
  { id: "uniforme-5000", csv: uniforme({ n: 5_000, seed: 905, dims: 4 }) },
  { id: "nubes-8000", csv: nubes({ n: 8_000, seed: 906 }), reps: 2 },
  { id: "nubes-12000", csv: nubes({ n: 12_000, seed: 907 }), reps: 1 },
  { id: "nubes-20000", csv: nubes({ n: 20_000, seed: 908 }), reps: 1 },
];

it("arma los payloads de costos de agrupar", () => {
  mkdirSync(out, { recursive: true });
  const payloads = datasets.map(({ id, csv, reps }) => {
    const parsed = parseCsvWithLimits(csv);
    if (!parsed.ok) throw new Error(`${id}: ${parsed.error.kind}`);
    const { table } = sanitizeTable(parsed.table);
    const run = prepareClusterRun(table, 42);
    if (!run.ok) throw new Error(`${id}: ${run.error}`);
    return {
      id,
      rows: table.rows.length,
      width: run.profile.width,
      ...(reps ? { reps } : {}),
      payload: { ...run.payload, roster: [...CLUSTER_MEMBER_IDS] },
    };
  });
  writeFileSync(join(out, "payloads.json"), JSON.stringify(payloads));
  for (const p of payloads) {
    console.log(
      `${p.id}: ${p.rows} filas · ancho ${p.width} · distancia ${p.payload.distance} · k ${p.payload.k_range.join("..")}`,
    );
  }
  expect(payloads).toHaveLength(datasets.length);
});
