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
      // S2: la capa UI entra a la medición (deuda S1 pagada) — componentes y
      // hooks con Testing Library; page/layout quedan al e2e.
      include: [
        "src/lib/**/*.ts",
        "src/engine/**/*.ts",
        "src/components/**/*.tsx",
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
        // El CLAUDE.md exige >80% en los motores puros de engine/ (el split
        // anti-fuga, el veredicto y la heurística de fuga son la garantía del sprint).
        "src/engine/**": {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
        },
        // Motores puros del S3 (chequeo de esquema, manifiesto+hash, CSV
        // puntuado): misma exigencia que engine/ — son la garantía del sprint.
        "src/lib/ds/schema-check.ts": {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
        },
        "src/lib/model-file.ts": {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
        },
        "src/lib/scored-csv.ts": {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
        },
      },
    },
  },
});
