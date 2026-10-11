// Spike S7 F0 — D8 en la BINARIA: ¿cuántas columnas de los datasets heredados cambiarían de veredicto
// de fuga con la regla por clase propuesta? Corre `prepareRun` REAL (la fuga de hoy, sobre train) en
// cada objetivo binario de docs/kit-de-prueba/ y, sobre las mismas filas de train, la regla propuesta:
//   numérica   → AUC de rango (agnóstica a la dirección) ≥ 0,98, solo si cada clase tiene ≥ S filas con valor;
//   categórica → pureza NORMALIZADA ((pureza − base) / (1 − base)) ≥ 0,98, con el mismo soporte S.
// Separa el efecto del soporte del de la normalización (columna «solo soporte»). Matemática, no navegador.
// SPIKE_OUT=<dir> pnpm exec vitest run --config scripts/spike-multiclase/vitest.spike.config.ts d8-binaria
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { isNullToken, parseCsvWithLimits, parseNumber } from "@/lib/ds/csv";
import { sanitizeTable } from "@/engine/sanitize";
import { categoryPurity, rankAuc } from "@/engine/leakage";
import { prepareRun } from "@/lib/experiment";

const KIT = "docs/kit-de-prueba";
const THRESHOLD = 0.98;
const SUPPORTS = [1, 3, 5, 10];

type Row = {
  dataset: string;
  target: string;
  minority: number;
  columns: number;
  today: string[];
  bySupport: Record<number, { raw: string[]; norm: string[] }>;
};

it("D8 en la binaria: la fuga de hoy frente a la regla por clase con soporte", () => {
  const out: Row[] = [];
  for (const file of readdirSync(KIT)
    .filter((f) => f.endsWith(".csv"))
    .sort()) {
    const parsed = parseCsvWithLimits(readFileSync(join(KIT, file), "utf8"));
    if (!parsed.ok) continue;
    const { table } = sanitizeTable(parsed.table);
    for (const target of table.headers) {
      const run = prepareRun(table, target, 42);
      if (!run.ok || run.payload.task !== "binaria") continue;
      const { rows, numeric, categorical, train_idx: trainIdx } = run.payload;
      const ti = table.headers.indexOf(target);
      const raw = trainIdx.map((i) => rows[i][ti].trim());
      const classes = [...new Set(raw)].sort();
      const y = raw.map((v) => (v === classes[1] ? 1 : 0)) as (0 | 1)[];
      const bySupport: Row["bySupport"] = {};
      for (const S of SUPPORTS) bySupport[S] = { raw: [], norm: [] };
      for (const name of [...numeric, ...categorical]) {
        const ci = table.headers.indexOf(name);
        const isNum = numeric.includes(name);
        const vals: (number | string)[] = [];
        const lab: (0 | 1)[] = [];
        trainIdx.forEach((i, k) => {
          const cell = rows[i][ci];
          if (isNum) {
            const v = parseNumber(cell);
            if (v === null || !Number.isFinite(v)) return;
            vals.push(v);
          } else {
            if (isNullToken(cell)) return;
            vals.push(cell.trim());
          }
          lab.push(y[k]);
        });
        const pos = lab.filter((v) => v === 1).length;
        const support = Math.min(pos, lab.length - pos);
        let rawScore: number;
        let normScore: number;
        if (isNum) {
          const auc = rankAuc(vals as number[], lab);
          rawScore = normScore = Math.max(auc, 1 - auc);
        } else {
          rawScore = categoryPurity(vals as string[], lab);
          const base = lab.length
            ? Math.max(pos, lab.length - pos) / lab.length
            : 1;
          normScore = base < 1 ? (rawScore - base) / (1 - base) : 0;
        }
        for (const S of SUPPORTS) {
          if (support < S) continue;
          if (rawScore >= THRESHOLD) bySupport[S].raw.push(name);
          if (normScore >= THRESHOLD) bySupport[S].norm.push(name);
        }
      }
      const minority = Math.min(
        y.filter((v) => v === 1).length,
        y.length - y.filter((v) => v === 1).length,
      );
      out.push({
        dataset: file,
        target,
        minority,
        columns: numeric.length + categorical.length,
        today: run.leakage.map((f) => f.column),
        bySupport,
      });
    }
  }
  const lines = [
    "| Dataset | Objetivo | Minoritaria (train) | Columnas | Marca HOY | S=1 normalizada | S=3 normalizada | S=5 solo soporte (pureza cruda) | **S=5 normalizada (propuesta)** | S=10 normalizada | ¿cambia con la propuesta? |",
    "| --- | --- | ---: | ---: | --- | --- | --- | --- | --- | --- | :---: |",
  ];
  const fmt = (xs: string[]) => (xs.length ? xs.join(", ") : "—");
  let changed = 0;
  for (const r of out) {
    const prop = r.bySupport[5].norm;
    const same =
      prop.length === r.today.length && prop.every((c) => r.today.includes(c));
    if (!same) changed += 1;
    lines.push(
      `| ${r.dataset} | ${r.target} | ${r.minority} | ${r.columns} | ${fmt(r.today)} | ${fmt(r.bySupport[1].norm)} | ${fmt(r.bySupport[3].norm)} | ${fmt(r.bySupport[5].raw)} | ${fmt(prop)} | ${fmt(r.bySupport[10].norm)} | ${same ? "no" : "**sí**"} |`,
    );
  }
  lines.push(
    "",
    `Objetivos binarios: ${out.length} · cambian de veredicto con la propuesta: ${changed}.`,
  );
  const dir = process.env.SPIKE_OUT ?? "/tmp/spike-multiclase";
  writeFileSync(join(dir, "d8-binaria.md"), lines.join("\n") + "\n");
  console.log(lines.join("\n"));
  expect(out.length).toBeGreaterThan(0);
});
