import path from "node:path";
import { defineConfig } from "vitest/config";

// Config que el ci.yml del kit ya asume (job quality: "pnpm test" con coverage).
// Patrón validado en app-nutri-kids S1. Cada app ajusta `coverage.include` a sus motores
// puros y puede subir los umbrales (el CLAUDE.md exige >80% en motores; 70 es el piso del kit).
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/engine/**"],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
});
