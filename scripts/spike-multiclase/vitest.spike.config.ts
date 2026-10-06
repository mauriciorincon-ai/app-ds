import path from "node:path";
import { defineConfig } from "vitest/config";

// Config SOLO del spike multiclase (S7 F0): arma los payloads con las funciones REALES de la app
// (sanitizeTable, selectFeatures, stratifiedSplit). No es parte de ninguna suite; se corre a mano:
// SPIKE_OUT=<dir> pnpm exec vitest run --config scripts/spike-multiclase/vitest.spike.config.ts
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "../../src") } },
  test: {
    environment: "node",
    include: ["scripts/spike-multiclase/**/*.spike.ts"],
    testTimeout: 120_000,
  },
});
