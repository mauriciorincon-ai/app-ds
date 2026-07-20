import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { computeEdaAlerts } from "@/engine/eda";
import { sanitizeTable } from "@/engine/sanitize";
import { parseCsvWithLimits } from "@/lib/ds/csv";

// El dataset sucio empaquetado (clientes-sucio.csv) es un ENTREGABLE: demuestra
// el saneamiento transparente en la UI. Este test lo ancla — si el generador
// cambia y deja de demostrar el saneamiento, falla (lección D1: verificar contra
// el CSV real, no de memoria).

function loadDirty() {
  const path = resolve(
    process.cwd(),
    "public",
    "datasets",
    "clientes-sucio.csv",
  );
  const parsed = parseCsvWithLimits(readFileSync(path, "utf8"));
  if (!parsed.ok) throw new Error(`no se pudo parsear: ${parsed.error.kind}`);
  return parsed.table;
}

describe("clientes-sucio.csv — el dataset sucio demuestra el saneamiento", () => {
  it("dedup, exclusión de ID y constante, y coerción con conteos", () => {
    const table = loadDirty();
    expect(table.rows).toHaveLength(200); // 190 + 10 duplicados

    const { table: clean, report } = sanitizeTable(table);
    expect(report.usable).toBe(true);
    expect(report.clean).toBe(false);

    // 10 filas duplicadas exactas eliminadas.
    expect(report.duplicateRowsRemoved).toBe(10);
    expect(report.rowsAfter).toBe(190);

    // id_cliente excluido (ID exacta tras dedup) + pais excluido (constante).
    const excluded = Object.fromEntries(
      report.exclusions.map((e) => [e.column, e.reason]),
    );
    expect(excluded["id_cliente"]).toBe("id-column");
    expect(excluded["pais"]).toBe("constant-column");

    // edad coaccionada: las celdas "error" pasaron a vacío (contadas).
    const edadCoercion = report.coercions.find((c) => c.column === "edad");
    expect(edadCoercion).toBeDefined();
    expect(edadCoercion!.cellsNulled).toBeGreaterThan(0);

    // Quedan las columnas modelables: edad, ingreso, canal, contrato.
    expect(clean.headers).toEqual(["edad", "ingreso", "canal", "contrato"]);
  });

  it("no dispara falsa fuga; el objetivo tiene señal aprendible", () => {
    const { table: clean } = sanitizeTable(loadDirty());
    const alerts = computeEdaAlerts(clean, "contrato");
    // Ninguna feature legítima es un proxy casi perfecto ⇒ sin alerta de fuga.
    expect(alerts.some((a) => a.kind === "possible-leak")).toBe(false);
  });
});
