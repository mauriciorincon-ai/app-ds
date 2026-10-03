import path from "node:path";
import { defineConfig } from "vitest/config";

// Config SOLO del spike de la liga (S5 F0): arma los payloads con el `prepareRun` REAL de la
// app (TS) para que el navegador mida con el mismo preprocesamiento que el producto. No es
// parte de ninguna suite; se corre a mano: pnpm exec vitest run --config scripts/spike-liga/vitest.spike.config.ts
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "../../src") } },
  test: {
    environment: "node",
    include: ["scripts/spike-liga/**/*.spike.ts"],
    testTimeout: 120_000,
  },
});
