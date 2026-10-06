#!/usr/bin/env node
// Regla 18 (matriz de envejecimiento) aplicada a esta app — S7 (AU-S7-05, AC-2).
//
// Las excepciones de `pnpm audit` (`auditConfig.ignoreGhsas` de pnpm-workspace.yaml) se retiran por
// un EVENTO, no por una fecha: el día que el aviso publica una versión parcheada (ADR 012: «as soon
// as braces ≥ 3.0.4 is published»). Este script consulta cada aviso en la base de GitHub y FALLA si
// alguno ya tiene parche: la excepción venció y se paga con el bump, no se arrastra.
//
// Usa red, así que NO corre en `pnpm test` (regla 20): corre como paso propio del job `quality` y en
// `/deploy-check`. Falla cerrado: un aviso que no se pudo leer es rojo, no «se omite».
//
// Uso: node scripts/verificar-retiros.mjs [--respuestas <dir>]
//   --respuestas <dir>: lee `<dir>/<GHSA>.json` en vez de la red (pruebas sin red).
//   GITHUB_TOKEN (opcional): se manda como Authorization, para no chocar con el límite anónimo.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const i = args.indexOf("--respuestas");
const respuestas = i >= 0 ? args[i + 1] : undefined;

const workspace = parse(readFileSync(join(root, "pnpm-workspace.yaml"), "utf8")) ?? {};
const ids = workspace.auditConfig?.ignoreGhsas ?? [];

/** La versión parcheada de una vulnerabilidad: texto (API global) u objeto (API de repos). */
function parche(v) {
  const p = v?.first_patched_version;
  if (p == null) return null;
  return typeof p === "string" ? p : (p.identifier ?? null);
}

async function leer(id) {
  if (respuestas) return JSON.parse(readFileSync(join(respuestas, `${id}.json`), "utf8"));
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "probeta-verificar-retiros" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const r = await fetch(`https://api.github.com/advisories/${id}`, { headers });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

let rojo = false;
if (ids.length === 0) console.log("✓ verificar-retiros: no hay excepciones de auditoría que vigilar");
for (const id of ids) {
  let aviso;
  try {
    aviso = await leer(id);
  } catch (err) {
    console.error(`✗ verificar-retiros: no se pudo leer ${id} (${err.message}) — falla cerrado`);
    rojo = true;
    continue;
  }
  const vulns = Array.isArray(aviso?.vulnerabilities) ? aviso.vulnerabilities : [];
  if (vulns.length === 0) {
    console.error(`✗ verificar-retiros: ${id} no trae vulnerabilidades legibles — falla cerrado`);
    rojo = true;
    continue;
  }
  const parcheadas = vulns
    .map((v) => ({ paquete: v?.package?.name ?? "?", version: parche(v) }))
    .filter((v) => v.version !== null);
  if (parcheadas.length > 0) {
    const lista = parcheadas.map((v) => `${v.paquete} ${v.version}`).join(", ");
    console.error(
      `✗ verificar-retiros: ${id} ya tiene parche (${lista}) — la excepción VENCIÓ: actualiza, quita el id de ignoreGhsas y marca su ADR como superseded`,
    );
    rojo = true;
  } else {
    console.log(`✓ verificar-retiros: ${id} sigue sin parche publicado — la excepción sigue vigente`);
  }
}
process.exit(rojo ? 1 : 0);
