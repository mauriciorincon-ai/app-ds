// @vitest-environment node
//
// S21 — las dos medidas que el S20 dejó sin cifra (M-4 y Holt-Winters largo), con el Pyodide REAL. NO corre por defecto: es una
// medición, no un gate (`MEDIR=1 pnpm exec vitest run --config vitest.integration.config.ts tests/integration/medidas-s21.test.ts`).
// Imprime líneas `MEDIDA|…` con el tiempo total, el de Python (`elapsed_ms`), el tamaño del heap de WebAssembly y el RSS del proceso.
// Los presupuestos se fijaron ANTES de medir (plan del S21, decisión 8):
//  - el peor caso que `planGemelo` deja pasar termina en ≤ 30 s sin caer;
//  - Holt-Winters con 2 000 días (horizontes 7, 30 y 120; n = 2 000 y 2 100) termina en ≤ 45 s.
// El gate permanente de lo que se decida a partir de estas cifras vive en `gemelo.test.ts` y `pronostico.test.ts`.
import { appendFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import type { PyodideInterface } from "pyodide";
import { envioGemelo, leerRelaciones, planGemelo } from "@/engine/gemelo";
import type { CsvTable } from "@/lib/ds/csv";
import type { ForecastPayload, SynthesizeResult } from "@/workers/protocol";
import { loadRuntime, pyFunction } from "./runtime";

const MEDIR = process.env.MEDIR === "1";

let py: PyodideInterface;
beforeAll(async () => {
  if (!MEDIR) return;
  py = await loadRuntime();
}, 300_000);

const heapMiB = (): number => {
  try {
    const m = (py as unknown as { _module: { HEAPU8: Uint8Array } })._module;
    return Math.round(m.HEAPU8.length / 1024 / 1024);
  } catch {
    return -1;
  }
};
const rssMiB = (): number =>
  Math.round(process.memoryUsage().rss / 1024 / 1024);
const dicho = (linea: Record<string, string | number | boolean>) => {
  const texto = `MEDIDA|${Object.entries(linea).map(([k, v]) => `${k}=${v}`).join("|")}`;
  console.log(texto);
  if (process.env.MEDIDAS_SALIDA) appendFileSync(process.env.MEDIDAS_SALIDA, `${texto}\n`);
};

/** n filas, 3 numéricas y `columnas` categóricas de `k` categorías con n/k filas cada una (cada una ≥ 5, así que ninguna se junta en «otras»). */
function tablaAncha(n: number, k: number, columnas: number): CsvTable {
  const headers = [
    "a",
    "b",
    "c",
    ...Array.from({ length: columnas }, (_, j) => `cat${j + 1}`),
  ];
  const mult = [7919, 104729, 1299709, 15485863];
  const rows = Array.from({ length: n }, (_, i) => [
    String(50 + ((i * 37) % 101) / 3),
    String(((i * 53) % 997) / 7),
    String(((i * 91) % 313) * 1.5),
    ...Array.from(
      { length: columnas },
      (_, j) => `c${j + 1}_${(i * mult[j]!) % k}`,
    ),
  ]);
  return { headers, rows };
}

describe.skipIf(!MEDIR)(
  "M-4 · la cercanía del gemelo con categóricas de miles de valores",
  () => {
    const casos: [string, number, number, number][] = [
      ["ancho 50", 50_000, 50, 1],
      ["ancho 1 000", 50_000, 1_000, 1],
      ["ancho 5 000", 50_000, 5_000, 1],
      ["ancho 10 000", 50_000, 10_000, 1],
      ["ancho 30 000 (3 × 10 000)", 50_000, 10_000, 3],
    ];
    it.each(casos)(
      "%s",
      (nombre, n, k, columnas) => {
        const tabla = tablaAncha(n, k, columnas);
        const plan = planGemelo(tabla, []);
        // el caso vale solo si la puerta de TypeScript deja viajar todas las columnas
        expect(plan.incluidas).toHaveLength(3 + columnas);
        const payload = envioGemelo(tabla, plan, n);
        const antes = heapMiB();
        const t0 = performance.now();
        let r: SynthesizeResult | null = null;
        let error = "";
        try {
          r = JSON.parse(
            pyFunction(py, "run_synthesize")(JSON.stringify(payload)),
          ) as SynthesizeResult;
        } catch (e) {
          error = String((e as Error).message).slice(0, 120);
        }
        const ms = Math.round(performance.now() - t0);
        dicho({
          caso: "gemelo",
          nombre,
          filas: n,
          ancho: k * columnas,
          total_ms: ms,
          python_ms: r?.elapsed_ms ?? -1,
          heap_antes_mib: antes,
          heap_despues_mib: heapMiB(),
          rss_mib: rssMiB(),
          error: error || "no",
        });
        if (r) {
          const t1 = performance.now();
          leerRelaciones(
            { headers: payload.headers, rows: payload.rows },
            { headers: r.headers, rows: r.rows },
          );
          dicho({
            caso: "relaciones",
            nombre,
            filas: n,
            hilo_principal_ms: Math.round(performance.now() - t1),
          });
        }
        expect(error).toBe("");
        expect(ms).toBeLessThanOrEqual(30_000);
      },
      600_000,
    );
  },
);

describe.skipIf(!MEDIR)("Holt-Winters con 2 000 periodos diarios", () => {
  const serie = (n: number): number[] =>
    Array.from(
      { length: n },
      (_, i) =>
        100 +
        0.05 * i +
        12 * Math.sin((2 * Math.PI * i) / 7) +
        (((i * 7919) % 13) - 6) * 0.8,
    );
  const casos: [number, number][] = [
    [2000, 7],
    [2000, 30],
    [2000, 120],
    [2100, 7],
  ];
  it.each(casos)(
    "n = %i, horizonte %i",
    (n, horizon) => {
      const payload: ForecastPayload = {
        y: serie(n),
        season: 7,
        horizon,
        period: "dia",
      };
      const t0 = performance.now();
      const r = JSON.parse(
        pyFunction(py, "run_forecast")(JSON.stringify(payload)),
      ) as {
        viable: boolean;
        elapsed_ms?: number;
        winner?: string;
        origins?: unknown[];
      };
      const ms = Math.round(performance.now() - t0);
      dicho({
        caso: "holt_winters",
        n,
        horizonte: horizon,
        total_ms: ms,
        python_ms: r.elapsed_ms ?? -1,
        pliegues: r.origins?.length ?? -1,
        ganador: r.winner ?? "-",
        heap_mib: heapMiB(),
      });
      expect(r.viable).toBe(true);
      expect(ms).toBeLessThanOrEqual(45_000);
    },
    600_000,
  );
});

describe("las medidas son opcionales", () => {
  it("sin MEDIR=1 este archivo no mide nada", () => {
    expect(typeof MEDIR).toBe("boolean");
  });
});
