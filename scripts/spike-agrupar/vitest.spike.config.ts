import path from "node:path";
import { defineConfig } from "vitest/config";

// Config SOLO del spike de agrupar (S7 F0): arma los payloads con las funciones REALES de la app
// (sanitizeTable, selectFeatures). No es parte de ninguna suite; se corre a mano:
// SPIKE_OUT=<dir> pnpm exec vitest run --config scripts/spike-agrupar/vitest.spike.config.ts
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "../../src") } },
  test: {
    environment: "node",
    include: ["scripts/spike-agrupar/**/*.spike.ts"],
    testTimeout: 120_000,
  },
});
