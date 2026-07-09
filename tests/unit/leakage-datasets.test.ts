import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { detectLeakage, type LeakageColumn } from "@/engine/leakage";
import {
  columnValues,
  isNullToken,
  parseCsvWithLimits,
  parseNumber,
  profileColumn,
} from "@/lib/ds/csv";

// Valida el criterio de aceptación del sprint sobre los datasets REALES:
// el de fuga plantada dispara la advertencia; los limpios no. Compone
// csv.ts (parseo/perfilado) con engine/leakage.ts, sin Pyodide.

function loadDataset(file: string) {
  const path = resolve(process.cwd(), "public", "datasets", file);
  const result = parseCsvWithLimits(readFileSync(path, "utf8"));
  if (!result.ok)
    throw new Error(`no se pudo parsear ${file}: ${result.error.kind}`);
  return result.table;
}

// Construye entradas de fuga: target = última columna (binaria) → 0/1;
// features = el resto, tipadas por su perfil.
function leakageInputsOf(file: string) {
  const table = loadDataset(file);
  const targetIndex = table.headers.length - 1;
  const rawTarget = columnValues(table, targetIndex);
  const classes = [
    ...new Set(rawTarget.filter((v) => !isNullToken(v)).map((v) => v.trim())),
  ].sort();
  const target = rawTarget.map((v) => (v.trim() === classes[1] ? 1 : 0)) as (
    0 | 1
  )[];

  const columns: LeakageColumn[] = table.headers
    .slice(0, targetIndex)
    .map((name, index) => {
      const raw = columnValues(table, index);
      const profile = profileColumn(name, raw);
      return profile.kind === "numeric"
        ? { name, kind: "numeric", values: raw.map((v) => parseNumber(v)) }
        : {
            name,
            kind: "categorical",
            values: raw.map((v) => (isNullToken(v) ? null : v.trim())),
          };
    });

  return { columns, target };
}

describe("heurística de fuga sobre los datasets empaquetados", () => {
  it("el dataset con fuga plantada marca 'monto_recuperado'", () => {
    const { columns, target } = leakageInputsOf("credito-fuga-plantada.csv");
    const findings = detectLeakage(columns, target);
    expect(findings.map((f) => f.column)).toContain("monto_recuperado");
  });

  it.each(["marketing-campania.csv", "rotacion-empleados.csv"])(
    "el dataset limpio %s no dispara advertencia de fuga",
    (file) => {
      const { columns, target } = leakageInputsOf(file);
      expect(detectLeakage(columns, target)).toEqual([]);
    },
  );
});
