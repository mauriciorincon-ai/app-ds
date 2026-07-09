import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Reportes generados (v8 coverage) — no son código fuente.
    "coverage/**",
    // Assets de Pyodide self-hosteados (runtime WASM/JS generado en prebuild).
    "public/pyodide/**",
  ]),
]);

export default eslintConfig;
