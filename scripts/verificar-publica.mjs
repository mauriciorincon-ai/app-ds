// S17 (ADR 024): lo que el puntuador y el servicio PROMETEN existe de verdad. Tres comprobaciones, con la red:
//  1. cada archivo de Pyodide que el puntuador baja del CDN público (el motor, el lock y las wheels de pandas, scikit-learn,
//     xgboost y lightgbm con su cierre) responde 200 en la versión fija de `pyodide` del package.json;
//  2. cada `paquete==versión` de los requirements (el servicio y la receta) existe en PyPI con una wheel que se instala en
//     Linux x86_64 con el Python de la CI (sin compilar nada);
//  3. `actions/setup-python` ofrece ESA versión de Python en el runner (ubuntu-latest).
// Si algo falta, falla nombrándolo: el sprint para y se pregunta, no se improvisa otra versión.
// Uso: node scripts/verificar-publica.mjs
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CORE_FILES, REQUIRED, resolveWheels } from "./pyodide-paquetes.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLANTILLAS = resolve(raiz, "src", "lib", "ds", "plantillas");
const MANIFIESTO_PYTHON =
  "https://raw.githubusercontent.com/actions/python-versions/main/versions-manifest.json";

/** `paquete==versión` de un requirements.txt (sin comentarios). */
export function pinsDe(texto) {
  const pins = [];
  for (const linea of texto.split("\n")) {
    const limpia = linea.split("#", 1)[0].trim();
    const m = /^([A-Za-z0-9_.-]+)==(\S+)$/.exec(limpia);
    if (m) pins.push({ nombre: m[1], version: m[2] });
  }
  return pins;
}

/**
 * ¿Esta wheel se instala en Linux x86_64 (manylinux) con CPython `menor` (14 = 3.14) sin compilar? Sirve la universal
 * (`py3-none-any`), la de una versión exacta (`cp314-cp314`), la estable entre versiones (`abi3`, de una versión igual o
 * anterior) y la `py3-none-manylinux…x86_64` (xgboost y lightgbm). No sirve musllinux ni otra arquitectura.
 */
export function compatible(archivo, menor = 14) {
  if (!archivo.endsWith(".whl")) return false;
  const partes = archivo.slice(0, -4).split("-");
  const [python, abi, plataforma] = partes.slice(-3);
  if (!python || !abi || !plataforma) return false;
  const universal = plataforma === "any";
  const linux = /manylinux/.test(plataforma) && /x86_64/.test(plataforma) && !/musllinux/.test(plataforma);
  if (!universal && !linux) return false;
  if (python.split(".").includes("py3")) return true; // py3 y también py2.py3 (six, pytz, dateutil)
  const exacta = python === `cp3${menor}` && abi === `cp3${menor}`;
  const estable = abi === "abi3" && Number(python.replace(/^cp3/, "")) <= menor;
  return exacta || estable;
}

async function existe(buscar, url, metodo = "HEAD") {
  try {
    const r = await buscar(url, { method: metodo });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Las tres comprobaciones, con `buscar` inyectable (la prueba la usa para demostrar que falla). Devuelve las líneas ✓ y las
 * fallas; no imprime ni sale.
 */
/**
 * La red de verdad, con dos reintentos para lo TRANSITORIO (el servicio no contesta o responde 5xx): `integration` es un check
 * requerido y un parpadeo de PyPI o del CDN no debe ponerlo en rojo. Un 404 NO se reintenta: ese es el hallazgo del gate.
 */
async function conReintentos(url, opciones) {
  let ultimo;
  for (let intento = 0; intento < 3; intento++) {
    try {
      const respuesta = await fetch(url, { ...opciones, signal: AbortSignal.timeout(30_000) });
      if (respuesta.status < 500) return respuesta;
      ultimo = respuesta;
    } catch (error) {
      ultimo = error;
    }
    if (intento < 2) await new Promise((listo) => setTimeout(listo, 1500 * (intento + 1)));
  }
  if (ultimo instanceof Error) throw ultimo;
  return ultimo;
}

export async function verificar({
  buscar,
  version,
  archivosPyodide,
  pins,
  python,
  menor = 14,
}) {
  const bien = [];
  const fallas = [];
  const base = `https://cdn.jsdelivr.net/pyodide/v${version}/full/`;
  for (const archivo of archivosPyodide) {
    if (await existe(buscar, base + archivo)) bien.push(`CDN de Pyodide ${version}: ${archivo}`);
    else fallas.push(`CDN de Pyodide ${version}: falta ${archivo}`);
  }
  for (const { nombre, version: v } of pins) {
    try {
      const r = await buscar(`https://pypi.org/pypi/${nombre}/${v}/json`);
      if (!r.ok) {
        fallas.push(`PyPI: ${nombre}==${v} no existe (${r.status})`);
        continue;
      }
      const datos = await r.json();
      const archivos = (datos.urls ?? []).map((u) => u.filename);
      if (archivos.some((a) => compatible(a, menor))) bien.push(`PyPI: ${nombre}==${v}`);
      else fallas.push(`PyPI: ${nombre}==${v} no trae wheel para CPython 3.${menor} en Linux x86_64`);
    } catch {
      fallas.push(`PyPI: no se pudo consultar ${nombre}==${v}`);
    }
  }
  try {
    const r = await buscar(MANIFIESTO_PYTHON);
    const manifiesto = r.ok ? await r.json() : [];
    const oferta = manifiesto.find((m) => m.version === python);
    const linux = oferta?.files?.some((f) => f.platform === "linux" && f.arch === "x64");
    if (linux) bien.push(`setup-python ofrece ${python} (linux x64)`);
    else fallas.push(`setup-python no ofrece Python ${python} para linux x64`);
  } catch {
    fallas.push("setup-python: no se pudo consultar el manifiesto de versiones");
  }
  return { bien, fallas };
}

async function principal() {
  const require = createRequire(import.meta.url);
  const version = require("pyodide/package.json").version;
  const lock = JSON.parse(await readFile(require.resolve("pyodide/pyodide-lock.json"), "utf8"));
  const archivosPyodide = [...CORE_FILES, "pyodide.js", ...resolveWheels(lock, REQUIRED)];
  const pins = [];
  for (const archivo of ["requirements-servicio.txt", "requirements-receta.txt"])
    for (const pin of pinsDe(await readFile(resolve(PLANTILLAS, archivo), "utf8")))
      if (!pins.some((p) => p.nombre === pin.nombre && p.version === pin.version)) pins.push(pin);
  const ci = await readFile(resolve(raiz, ".github", "workflows", "ci.yml"), "utf8");
  const python = /python-version:\s*["']?(3\.\d+\.\d+)["']?/.exec(ci)?.[1];
  if (!python) {
    console.error("verificar-publica: ci.yml no fija un `python-version: 3.x.y`");
    process.exit(1);
  }
  const { bien, fallas } = await verificar({
    buscar: conReintentos,
    version,
    archivosPyodide,
    pins,
    python,
  });
  if (fallas.length > 0) {
    for (const f of fallas) console.error(`✗ ${f}`);
    console.error(`verificar-publica: ${fallas.length} falla(s) de ${bien.length + fallas.length} comprobaciones.`);
    process.exit(1);
  }
  console.log(
    `✓ verificar-publica: ${archivosPyodide.length} archivos de Pyodide ${version} en el CDN, ${pins.length} versiones fijas en PyPI y Python ${python} en setup-python.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await principal();
