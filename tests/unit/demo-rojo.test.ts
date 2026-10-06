// @vitest-environment node
/**
 * S7 (AU-S7-12, AC-12): `scripts/demo-rojo.sh` es la herramienta con la que se demuestra en rojo
 * cada gate (regla 11). Un gate que muere por una SEÑAL no llegó a su aserción, así que no cuenta
 * como rojo, aunque haya impreso el texto de `--debe-nombrar` antes de morir. Se corre el script
 * real sobre un archivo de un directorio temporal: nada del repo se muta.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const script = resolve("scripts/demo-rojo.sh");

function demo(gate: string) {
  const dir = mkdtempSync(join(tmpdir(), "demo-rojo-"));
  const archivo = join(dir, "objetivo.txt");
  writeFileSync(archivo, "valor = bueno\n");
  const r = spawnSync(
    "/bin/bash",
    [
      script,
      "--archivo",
      archivo,
      "--buscar",
      "bueno",
      "--reemplazar",
      "malo",
      "--gate",
      gate,
      "--debe-nombrar",
      "NOMBRADO",
    ],
    {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, DEMO_ROJO_DIR: join(dir, ".respaldo") },
    },
  );
  return { ...r, restaurado: readFileSync(archivo, "utf8") };
}

describe("demo-rojo.sh: qué cuenta como rojo (regla 11)", () => {
  it("un gate que falla nombrando lo esperado es un rojo, y el archivo vuelve intacto", () => {
    const r = demo("echo NOMBRADO; exit 1");
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("el gate falló con la mutación");
    expect(r.restaurado).toBe("valor = bueno\n");
  });

  it("un gate que muere por una señal no es un rojo, aunque haya impreso el nombre", () => {
    const r = demo("echo NOMBRADO; kill -9 $$");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("murió por una señal");
    expect(r.restaurado).toBe("valor = bueno\n");
  });

  it("un gate que no corrió (127) no es un rojo", () => {
    const r = demo("comando-que-no-existe-en-ningun-lado");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("el gate no corrió");
    expect(r.restaurado).toBe("valor = bueno\n");
  });
});
