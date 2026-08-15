// El brochure vivo tiene DOBLE VIDA (regla 1 del molde v2): un archivo autocontenido en
// docs/BROCHURE.html que abre con doble clic, y la ruta pública /conoce de la app desplegada.
// Para que las dos sean el MISMO contenido sin duplicarlo, este script copia el canónico a
// public/conoce.html en "predev" y "prebuild" — mismo patrón que scripts/copy-pyodide.mjs.
//
// Editar SIEMPRE docs/BROCHURE.html. public/conoce.html es un derivado y está gitignored.
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const origen = resolve(root, "docs", "BROCHURE.html");
const destino = resolve(root, "public", "conoce.html");

async function main() {
  await mkdir(dirname(destino), { recursive: true });
  await copyFile(origen, destino);
  console.log(`[copy-brochure] docs/BROCHURE.html → public/conoce.html`);
}

main().catch((error) => {
  console.error("[copy-brochure] falló:", error);
  process.exit(1);
});
