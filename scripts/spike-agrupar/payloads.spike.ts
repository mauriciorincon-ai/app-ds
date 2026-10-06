// Arma los payloads del spike de AGRUPAR (S7 F0): CSV → parseCsvWithLimits → sanitizeTable →
// selectFeatures (la regla real de features). Agrupar no tiene objetivo: `exclude` nombra la
// columna que se deja fuera (el identificador de `segmentos`; en la F2 lo decide la regla de
// id-like de la app, aquí el arnés lo declara a mano). LÍMITE DECLARADO: la entrada de agrupar
// (`prepareClusterRun`) llega en la F2. Salida: $SPIKE_OUT/payloads.json (fuera del repo).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { parseCsvWithLimits } from "@/lib/ds/csv";
import { sanitizeTable } from "@/engine/sanitize";
import { selectFeatures } from "@/lib/experiment";
import { nubes, uniforme } from "./datos.mjs";

const out = process.env.SPIKE_OUT ?? "/tmp/spike-agrupar";
const kit = (file: string) =>
  readFileSync(join("docs/kit-de-prueba", file), "utf8");

type Spec = {
  id: string;
  csv: string;
  exclude?: string;
  reps?: number;
  /** Solo la sonda de tamaño de Agglomerative (un `linkage(ward)`), nada más. */
  aggloOnly?: boolean;
};

const datasets: Spec[] = [
  {
    id: "segmentos-300",
    csv: kit("segmentos-clientes.csv"),
    exclude: "cliente_id",
  },
  { id: "sin-grupos-300", csv: kit("sin-grupos.csv") },
  { id: "consumo-200", csv: kit("consumo-energia.csv") },
  { id: "planes-200", csv: kit("planes-suscripcion.csv"), exclude: "plan" },
  { id: "uniforme-500-1d", csv: uniforme({ n: 500, seed: 801, dims: 1 }) },
  { id: "uniforme-500-2d", csv: uniforme({ n: 500, seed: 802, dims: 2 }) },
  { id: "uniforme-2000-4d", csv: uniforme({ n: 2_000, seed: 803, dims: 4 }) },
  { id: "nubes-2000-k4", csv: nubes({ n: 2_000, seed: 804 }) },
  { id: "nubes-5000-k4", csv: nubes({ n: 5_000, seed: 805 }) },
  { id: "nubes-20000-k4", csv: nubes({ n: 20_000, seed: 806 }), reps: 1 },
  // Sondas de memoria/tiempo de Agglomerative (O(n²)): de menor a mayor; el corredor sigue
  // aunque una falle, y la tabla marca desde dónde no cabe.
  ...[8_000, 12_000, 16_000].map((n) => ({
    id: `agglo-${n}`,
    csv: nubes({ n, seed: 810 + n / 1000 }),
    aggloOnly: true,
    reps: 1,
  })),
];

it("arma los payloads de agrupar", () => {
  mkdirSync(out, { recursive: true });
  const payloads = datasets.map(
    ({ id, csv, exclude = "", reps, aggloOnly = false }) => {
      const parsed = parseCsvWithLimits(csv);
      if (!parsed.ok) throw new Error(`${id}: ${parsed.error.kind}`);
      const { table } = sanitizeTable(parsed.table);
      const { numeric, categorical } = selectFeatures(table, exclude);
      return {
        id,
        rows: table.rows.length,
        cols: table.headers.length,
        ...(reps ? { reps } : {}),
        payload: {
          headers: table.headers,
          rows: table.rows,
          numeric,
          categorical,
          seed: 42,
          agglo_only: aggloOnly,
        },
      };
    },
  );
  writeFileSync(join(out, "payloads.json"), JSON.stringify(payloads));
  for (const p of payloads) {
    console.log(
      `${p.id}: ${p.rows} filas · ${p.payload.numeric.length} num + ${p.payload.categorical.length} cat${p.payload.agglo_only ? " · solo Agglomerative" : ""}`,
    );
  }
  expect(payloads).toHaveLength(datasets.length);
});
