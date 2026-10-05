import path from "node:path";
import { defineConfig } from "vitest/config";

// Config SOLO de la medición de costos de agrupar (S7 F2): arma los payloads con la entrada REAL
// del producto (prepareClusterRun). No es parte de ninguna suite; se corre a mano:
// SPIKE_OUT=<dir> pnpm exec vitest run --config scripts/costos-agrupar/vitest.spike.config.ts
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "../../src") } },
  test: {
    environment: "node",
    include: ["scripts/costos-agrupar/**/*.spike.ts"],
    testTimeout: 120_000,
  },
});
