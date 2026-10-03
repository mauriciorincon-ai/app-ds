// Genera docs/kit-de-prueba/liga-mediana.csv (S5, desviación D6): 5.000 filas
// sintéticas con categóricas y ~5 % de nulos — el tamaño en que la liga YA no cabe
// entera en el Nivel 1 (techo 5 s), para probar el Nivel 2 y su cancelación.
// Determinista: misma semilla ⇒ mismo archivo. Uso: node scripts/kit-de-prueba-liga-mediana.mjs
import { writeFileSync } from "node:fs";
import { ligaSintetica } from "./spike-liga/datos.mjs";

const out = new URL("../docs/kit-de-prueba/liga-mediana.csv", import.meta.url);
writeFileSync(out, ligaSintetica({ n: 5000, seed: 2026 }));
console.log(`[kit] ${out.pathname}`);
