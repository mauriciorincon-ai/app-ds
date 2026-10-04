#!/usr/bin/env node
// Regla 18 del kit (v1.32.0): ningún paquete queda POR DEBAJO de `main` al mergear dependencias.
// pnpm degrada en silencio al resolver un lockfile en conflicto y la CI pasa verde porque ninguna
// puerta compara el resultado contra la INTENCIÓN del PR. Este script es esa puerta: lee las versiones
// de pnpm-lock.yaml en el árbol actual y en origin/main y falla si alguna bajó.
// Uso: node scripts/verificar-dependencias.mjs [rama-base]   (default: origin/main)
// En CI corre solo en pull_request, tras `git fetch origin main --depth=1`.
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const base = process.argv[2] ?? "origin/main";
const LOCK = "pnpm-lock.yaml";
if (!existsSync(LOCK)) { console.log(`verificar-dependencias: no hay ${LOCK}; nada que comparar`); process.exit(0); }

// Falla CERRADO (kit v1.35.0, ds S5 K-S5-4): una base ilegible NO es un verde — es la misma ilusión
// que «un gate saltado se ve igual que uno verde». Solo pasa (con aviso) si la base EXISTE y no
// tiene lockfile (repo nuevo).
try { execSync(`git rev-parse --verify --quiet ${base}^{commit}`, { stdio: "ignore" }); }
catch {
  console.error(`✗ verificar-dependencias: no puedo leer la rama base ${base} (¿faltó \`git fetch origin main --depth=1\`?). Un gate que no puede mirar no está verde.`);
  process.exit(1);
}
let lockBase;
try { lockBase = execSync(`git show ${base}:${LOCK}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }
catch { console.log(`⚠ verificar-dependencias: ${base} existe pero no tiene ${LOCK} (repo nuevo); nada que comparar`); process.exit(0); }
const lockPR = readFileSync(LOCK, "utf8");

/** Versiones por paquete en la sección `packages:` del lockfile (v6 y v9: claves `/nombre@ver` o `nombre@ver:`). */
function versiones(texto) {
  const out = new Map();
  let dentro = false;
  for (const linea of texto.split("\n")) {
    if (/^packages:\s*$/.test(linea)) { dentro = true; continue; }
    if (dentro && /^[A-Za-z]/.test(linea)) dentro = false; // otra sección de primer nivel
    if (!dentro) continue;
    const m = linea.match(/^  ['"]?\/?((?:@[^/@'"]+\/)?[^/@'"]+)@([0-9][^('":\s]*)/);
    if (!m) continue;
    const [, nombre, ver] = m;
    if (!out.has(nombre)) out.set(nombre, []);
    out.get(nombre).push(ver);
  }
  return out;
}
const num = (v) => v.split(/[-+]/)[0].split(".").map((x) => parseInt(x, 10) || 0);
const cmp = (a, b) => { const A = num(a), B = num(b); for (let i = 0; i < Math.max(A.length, B.length); i++) { const d = (A[i] ?? 0) - (B[i] ?? 0); if (d) return d; } return 0; };
const mayor = (vs) => vs.reduce((m, v) => (cmp(v, m) > 0 ? v : m));

// Falla CERRADO también ante un lockfile que no sabe leer (ds S6, AU-S6-13): si el formato cambia
// (otra lockfileVersion, otra sangría), los nombres dejan de coincidir y cada paquete de la base pasaría
// por «quitado a propósito» — un verde sin haber comparado nada.
const lockfileVersion = (t) => (t.match(/^lockfileVersion:\s*'?([^'\n]+)'?/m) ?? [])[1];
if (lockfileVersion(lockBase) !== lockfileVersion(lockPR)) {
  console.error(`✗ verificar-dependencias: lockfileVersion ${lockfileVersion(lockBase)} (${base}) ≠ ${lockfileVersion(lockPR)} (este árbol). No sé comparar formatos distintos: compara a mano y registra la decisión.`);
  process.exit(1);
}
const enBase = versiones(lockBase), enPR = versiones(lockPR);
const faltan = [...enBase.keys()].filter((n) => !enPR.has(n));
if (enPR.size === 0 || faltan.length > Math.max(5, enBase.size * 0.2)) {
  console.error(`✗ verificar-dependencias: ${faltan.length} de ${enBase.size} paquetes de ${base} no aparecen en este lockfile. Un gate que no puede comparar no está verde.`);
  process.exit(1);
}
const degradados = [];
for (const [nombre, vsBase] of enBase) {
  const vsPR = enPR.get(nombre);
  if (!vsPR) continue; // quitado a propósito: no es degradación
  const a = mayor(vsBase), b = mayor(vsPR);
  if (cmp(b, a) < 0) degradados.push(`${nombre}: ${a} (${base}) → ${b} (este árbol)`);
}
if (degradados.length) {
  console.error(`✗ ${degradados.length} paquete(s) quedaron POR DEBAJO de ${base} (regla 18 — el lockfile no se pelea):`);
  for (const d of degradados) console.error(`  - ${d}`);
  console.error("Resuelve partiendo del lado que trae los bumps y verifica dependencia por dependencia.");
  process.exit(1);
}
console.log(`✓ verificar-dependencias: ${enPR.size} paquetes, ninguno por debajo de ${base}`);
