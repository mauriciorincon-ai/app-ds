import path from "node:path";
import { defineConfig } from "vitest/config";

// Config SOLO del spike de regresión (S6 F0): arma los payloads con la regla real de features de
// la app (TS). No es parte de ninguna suite; se corre a mano:
//   SPIKE_OUT=<dir> pnpm exec vitest run --config scripts/spike-regresion/vitest.spike.config.ts
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "../../src") } },
  test: {
    environment: "node",
    include: ["scripts/spike-regresion/**/*.spike.ts"],
    testTimeout: 120_000,
  },
});
