#!/usr/bin/env node
// Gate de PESO del runtime Pyodide (S5, DoD «el bundle de Pyodide crece ≤ 2 MB»). Suma lo que el
// navegador descarga al iniciar un experimento — los archivos core + el cierre de wheels de
// scripts/pyodide-paquetes.mjs, tal como quedaron en public/pyodide/ tras `pnpm build` — y falla
// si supera baseline + maxGrowthBytes de pyodide-budget.json. Una wheel faltante es ROJO (el
// runtime fallaría en el navegador), no «se omite».
// Uso: node scripts/verificar-peso-pyodide.mjs [ruta-del-budget]
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CORE_FILES, REQUIRED, resolveWheels } from "./pyodide-paquetes.mjs";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "public", "pyodide");
const budgetPath = resolve(root, process.argv[2] ?? "pyodide-budget.json");
const budget = JSON.parse(readFileSync(budgetPath, "utf8"));
const lock = require("pyodide/pyodide-lock.json");

const files = [...CORE_FILES, ...resolveWheels(lock)];
const missing = files.filter((f) => !existsSync(join(dir, f)));
if (missing.length > 0) {
  console.error(`✗ verificar-peso-pyodide: faltan ${missing.length} archivo(s) en public/pyodide/ (¿corrió el build?):`);
  for (const f of missing) console.error(`  - ${f}`);
  process.exit(1);
}

const total = files.reduce((sum, f) => sum + statSync(join(dir, f)).size, 0);
const limit = budget.baseline.bytes + budget.maxGrowthBytes;
const mib = (n) => (n / 1048576).toFixed(2);
const growth = total - budget.baseline.bytes;
const line = `${mib(total)} MiB (${files.length - CORE_FILES.length} wheels de ${REQUIRED.join(" + ")}) · crecimiento ${mib(growth)} MiB sobre la línea base · tope ${mib(limit)} MiB`;
if (total > limit) {
  console.error(`✗ verificar-peso-pyodide: ${line}`);
  process.exit(1);
}
console.log(`✓ verificar-peso-pyodide: ${line}`);
