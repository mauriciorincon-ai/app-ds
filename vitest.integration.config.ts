import path from "node:path";
import { defineConfig } from "vitest/config";

// Config separada para los tests de integración con Pyodide (entorno node, no
// jsdom, para no confundir al loader de Pyodide) y timeouts amplios por la carga
// del runtime WASM + pandas + scikit-learn. No corre en la suite unit rápida.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
