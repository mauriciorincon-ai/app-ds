// S17 (ADR 024): el gate de versiones y CDN de lo que el usuario se lleva. Corre sin red (la búsqueda se inyecta) y demuestra
// que FALLA —y nombra qué— cuando una wheel de Pyodide no está, un pin de PyPI no existe o no trae wheel para Linux, o el
// runner no ofrece el Python. (La CI lo corre contra la red de verdad: `node scripts/verificar-publica.mjs`.)
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  compatible,
  pinsDe,
  verificar,
  type Buscar,
} from "../../scripts/verificar-publica.mjs";

describe("las wheels que se instalan en Linux x86_64 con CPython 3.14", () => {
  it.each([
    ["numpy-2.4.3-cp314-cp314-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl", true],
    ["xgboost-2.1.4-py3-none-manylinux_2_28_x86_64.whl", true],
    ["joblib-1.5.3-py3-none-any.whl", true],
    ["six-1.17.0-py2.py3-none-any.whl", true],
    ["pydantic_core-2.41.5-cp314-cp314-manylinux_2_17_x86_64.manylinux2014_x86_64.whl", true],
    ["scipy-1.18.0-cp311-abi3-manylinux_2_28_x86_64.whl", true],
    ["numpy-2.4.3-cp314-cp314-manylinux_2_27_aarch64.manylinux_2_28_aarch64.whl", false],
    ["numpy-2.4.3-cp314-cp314-musllinux_1_2_x86_64.whl", false],
    ["numpy-2.4.3-cp313-cp313-manylinux_2_27_x86_64.whl", false],
    ["numpy-2.4.3-cp314-cp314-macosx_14_0_arm64.whl", false],
    ["numpy-2.4.3.tar.gz", false],
  ])("%s → %s", (archivo, esperado) => {
    expect(compatible(archivo)).toBe(esperado);
  });
});

describe("los requirements", () => {
  it("se leen sin comentarios, y todos los de la plantilla están fijados con ==", () => {
    expect(pinsDe("# hola\nnumpy==2.4.3  # fijo\n\npandas==3.0.2\nsuelta\n")).toEqual([
      { nombre: "numpy", version: "2.4.3" },
      { nombre: "pandas", version: "3.0.2" },
    ]);
    for (const f of ["requirements-servicio.txt", "requirements-receta.txt"]) {
      const texto = readFileSync(`src/lib/ds/plantillas/${f}`, "utf8");
      const lineas = texto
        .split("\n")
        .map((l) => l.split("#", 1)[0]!.trim())
        .filter(Boolean);
      expect(lineas.length).toBeGreaterThan(5);
      expect(lineas.filter((l) => !/^[A-Za-z0-9_.-]+==\S+$/.test(l)), f).toEqual([]);
    }
  });
});

const respuesta = (ok: boolean, datos: unknown = {}, status = ok ? 200 : 404) => ({
  ok,
  status,
  json: async () => datos,
});
const PYPI_BIEN = { urls: [{ filename: "numpy-2.4.3-cp314-cp314-manylinux_2_27_x86_64.whl" }] };
const MANIFIESTO = [
  { version: "3.14.0", files: [{ platform: "linux", arch: "x64" }] },
];
const ENTRADA = {
  version: "314.0.2",
  archivosPyodide: ["pyodide.js", "numpy-2.4.3-cp314-cp314-pyemscripten_2026_0_wasm32.whl"],
  pins: [{ nombre: "numpy", version: "2.4.3" }],
  python: "3.14.0",
};
function buscar(cambios: Partial<Record<string, ReturnType<typeof respuesta>>> = {}): Buscar {
  return async (url) => {
    for (const [fragmento, r] of Object.entries(cambios)) if (url.includes(fragmento)) return r!;
    if (url.includes("cdn.jsdelivr.net")) return respuesta(true);
    if (url.includes("pypi.org")) return respuesta(true, PYPI_BIEN);
    return respuesta(true, MANIFIESTO);
  };
}

describe("verificar (con red inyectada)", () => {
  it("con todo en su sitio, no hay fallas", async () => {
    const r = await verificar({ buscar: buscar(), ...ENTRADA });
    expect(r.fallas).toEqual([]);
    expect(r.bien).toHaveLength(2 + 1 + 1);
  });

  it("DEMO EN ROJO: una wheel del CDN que no existe falla y la nombra", async () => {
    const r = await verificar({
      buscar: buscar({ "numpy-2.4.3-cp314": respuesta(false) }),
      ...ENTRADA,
    });
    expect(r.fallas).toEqual([
      expect.stringContaining("falta numpy-2.4.3-cp314-cp314-pyemscripten_2026_0_wasm32.whl"),
    ]);
  });

  it("DEMO EN ROJO: un pin que no existe en PyPI, o que no trae wheel para Linux, falla", async () => {
    const noExiste = await verificar({
      buscar: buscar({ "pypi.org": respuesta(false) }),
      ...ENTRADA,
    });
    expect(noExiste.fallas).toEqual([expect.stringContaining("numpy==2.4.3 no existe")]);
    const sinWheel = await verificar({
      buscar: buscar({ "pypi.org": respuesta(true, { urls: [{ filename: "numpy-2.4.3.tar.gz" }] }) }),
      ...ENTRADA,
    });
    expect(sinWheel.fallas).toEqual([expect.stringContaining("no trae wheel para CPython 3.14")]);
  });

  it("DEMO EN ROJO: un Python que el runner no ofrece falla; sin red, también", async () => {
    const r = await verificar({ buscar: buscar(), ...ENTRADA, python: "3.99.0" });
    expect(r.fallas).toEqual([expect.stringContaining("no ofrece Python 3.99.0")]);
    const sinRed = await verificar({
      buscar: async () => {
        throw new Error("sin red");
      },
      ...ENTRADA,
    });
    expect(sinRed.fallas.length).toBeGreaterThan(0);
    expect(sinRed.bien).toEqual([]);
  });
});
