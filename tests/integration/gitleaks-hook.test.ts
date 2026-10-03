// @vitest-environment node
//
// Verificación del gate de secretos (kit v1.6.3/v1.7.3 — carnada canónica PARTIDA).
// El hook `githooks/pre-commit` corre `gitleaks protect --staged`; aquí ejercitamos
// el MISMO motor de reglas de gitleaks (regla `aws-access-token`) contra la carnada
// canónica ARMADA — la única forma honesta de saber que el gate no está muerto
// (lección 2026-07-15: una carnada floja pasa en silencio dando falsa tranquilidad).
//
// La carnada viaja PARTIDA en el FUENTE (dos fragmentos que NUNCA forman una corrida
// base32 de 20 chars en este archivo, para no dispararse a sí misma al comitear) y se
// ARMA solo en runtime, en un archivo temporal FUERA del repo (jamás versionado).
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Fragmentos de la carnada canónica del pipeline. Separados a propósito:
// `AKIA` + 8 = 12 chars; el segundo son 8 chars. Ninguno solo dispara la regla
// (necesita `AKIA[0-9A-Z]{16}` = 20). Se concatenan SOLO en runtime.
const CARNADA_FRAG_A = "AKIAQ7RTZ4PX"; // 12 chars — no dispara por sí solo
const CARNADA_FRAG_B = "KM2WNB3S"; //     8 chars — no dispara por sí solo

function hasGitleaks(): boolean {
  try {
    execFileSync("gitleaks", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// gitleaks: exit 0 = limpio, exit 1 = fuga detectada. Devolvemos el código.
function scan(dir: string): number {
  try {
    execFileSync(
      "gitleaks",
      ["detect", "--no-git", "--source", dir, "--no-banner", "--redact"],
      { stdio: "ignore" },
    );
    return 0;
  } catch (err) {
    const code = (err as { status?: number }).status;
    return typeof code === "number" ? code : -1;
  }
}

const gitleaksAvailable = hasGitleaks();
let workdir: string;

beforeAll(() => {
  workdir = mkdtempSync(join(tmpdir(), "gitleaks-hook-"));
});

afterAll(() => {
  if (workdir) rmSync(workdir, { recursive: true, force: true });
});

// Si gitleaks no está instalado (p. ej. la CI de GitHub, que no lo trae — es un
// gate LOCAL), el test se salta con gracia, igual que el propio hook.
describe.skipIf(!gitleaksAvailable)(
  "gate de secretos (gitleaks — carnada canónica)",
  () => {
    it("BLOQUEA la carnada canónica armada (si no, el gate está muerto)", () => {
      const armada = `AWS_ACCESS_KEY_ID=${CARNADA_FRAG_A}${CARNADA_FRAG_B}\n`;
      const file = join(workdir, "armada.env");
      writeFileSync(file, armada, "utf8");

      expect(scan(workdir)).toBe(1);

      rmSync(file, { force: true });
    });

    it("DEJA pasar un archivo sin secretos (no es un falso positivo)", () => {
      const limpio = join(workdir, "limpio.env");
      writeFileSync(limpio, "APP_NAME=probeta-ds\nLOCALE=es\n", "utf8");

      expect(scan(workdir)).toBe(0);

      rmSync(limpio, { force: true });
    });
  },
);

// --- Kit v1.32.1 (B-8 planlang) -------------------------------------------------
// (1) El hook PreToolUse escanea el CONTENIDO que Claude Code va a escribir
//     (tool_input.content / new_string vía jq + `gitleaks detect --pipe`), no solo lo
//     staged: un secreto escrito en un archivo nuevo, aún sin `git add`, se bloquea ANTES
//     de llegar al disco. Se ejercita el comando REAL leído de .claude/settings.json.
// (2) El pre-commit FALLA CERRADO: sin gitleaks en el PATH, bloquea (exit 1) en vez de
//     avisar y dejar pasar; solo KIT_SIN_GITLEAKS=1 lo deja pasar, a sabiendas.

type HookEntry = { matcher: string; hooks: { command: string }[] };
const settings = JSON.parse(
  readFileSync(join(process.cwd(), ".claude/settings.json"), "utf8"),
) as { hooks: { PreToolUse: HookEntry[] } };
const writeHook = settings.hooks.PreToolUse.find(
  (h) => h.matcher === "Write|Edit",
)!.hooks[0].command;

function runWriteHook(toolInput: Record<string, string>): number {
  const result = spawnSync("sh", ["-c", writeHook], {
    input: JSON.stringify({ tool_name: "Write", tool_input: toolInput }),
    encoding: "utf8",
  });
  return result.status ?? -1;
}

function hasJq(): boolean {
  return spawnSync("jq", ["--version"]).status === 0;
}

describe.skipIf(!gitleaksAvailable || !hasJq())(
  "hook PreToolUse: escanea el contenido a escribir (kit v1.32.1)",
  () => {
    it("BLOQUEA (exit 2) un Write cuyo contenido trae la carnada armada", () => {
      const content = `AWS_ACCESS_KEY_ID=${CARNADA_FRAG_A}${CARNADA_FRAG_B}\n`;
      expect(runWriteHook({ file_path: "/tmp/x.env", content })).toBe(2);
    });

    it("BLOQUEA (exit 2) un Edit cuyo new_string trae la carnada armada", () => {
      const new_string = `key = "${CARNADA_FRAG_A}${CARNADA_FRAG_B}"`;
      expect(
        runWriteHook({ file_path: "/tmp/x.ts", old_string: "a", new_string }),
      ).toBe(2);
    });

    it("DEJA pasar (exit 0) contenido sin secretos", () => {
      expect(
        runWriteHook({
          file_path: "/tmp/x.ts",
          content: "export const a = 1;\n",
        }),
      ).toBe(0);
    });
  },
);

describe("pre-commit: falla CERRADO sin gitleaks (kit v1.32.1)", () => {
  // PATH mínimo del sistema: ahí no vive gitleaks (Homebrew/winget lo ponen en otro lado,
  // y la CI no lo instala en el PATH). Así se reproduce «máquina sin gitleaks».
  const hook = join(process.cwd(), "githooks/pre-commit");
  const bareEnv = { PATH: "/usr/bin:/bin" };

  it("BLOQUEA el commit (exit 1) si gitleaks no está instalado", () => {
    const result = spawnSync("sh", [hook], { env: bareEnv, encoding: "utf8" });
    expect(result.stdout).toMatch(/BLOQUEADO/);
    expect(result.status).toBe(1);
  });

  it("solo KIT_SIN_GITLEAKS=1 lo deja pasar, a sabiendas (exit 0)", () => {
    const result = spawnSync("sh", [hook], {
      env: { ...bareEnv, KIT_SIN_GITLEAKS: "1" },
      encoding: "utf8",
    });
    expect(result.stdout).toMatch(/a sabiendas/);
    expect(result.status).toBe(0);
  });
});
