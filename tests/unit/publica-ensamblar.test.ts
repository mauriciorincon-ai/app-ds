// S17 (ADR 024): lo que el usuario se lleva, armado. Puro y sin red. Lo que tiene que valer:
//  · la receta toma de pipeline.py los bloques marcados (y falla nombrando el que falte); su declaración sobrevive a comillas,
//    `$&` y `</script` en un nombre de columna y es JSON válido tal cual;
//  · el puntuador lleva el archivo del modelo completo y legible, con el `<` escapado, y se niega a armarse si el motor trae `</script`;
//  · el ZIP lo lee un lector independiente: nombres, tamaños y CRC; y el CRC-32 da el valor conocido;
//  · la declaración sale del resultado con SOLO nombres y números del modelo (ninguna fila ni clase);
//  · las plantillas y los espejos que viven en dos lenguajes dicen lo mismo (fracción de prueba, celdas nulas).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NULL_TOKENS } from "@/lib/ds/csv";
import {
  AZAR_SENSIBLE,
  FRACCION_PRUEBA,
  TOLERANCIA_APROXIMADA,
  declaracionDe,
} from "@/lib/publica/declaracion";
import {
  BLOQUES,
  armarPuntuador,
  armarReceta,
  armarServicio,
  bloquesDe,
  versionesDe,
  type Declaracion,
} from "@/lib/publica/ensamblar";
import { NO_SERVIBLES, esServible } from "@/lib/publica/no-servibles";
import { crc32 } from "@/lib/publica/zip";
import type { SupervisedResult } from "@/workers/protocol";

const leer = (ruta: string) => readFileSync(resolve(__dirname, "../..", ruta), "utf8");
const PIPELINE = leer("src/lib/ds/pipeline.py");
const P = "src/lib/ds/plantillas";
const RECETA = leer(`${P}/receta.py`);
const PUNTUAR = leer(`${P}/puntuar.py`);
const PUNTUADOR = leer(`${P}/puntuador.html`);
const REQ = leer(`${P}/requirements-receta.txt`);

const DECL: Declaracion = {
  formato: "probeta-receta/1",
  app: "probeta-ds 0.0.0",
  idioma: "es",
  archivo: "tienda 'ñ' $& </script>.csv",
  tarea: "binaria",
  objetivo: "compró",
  numericas: ["edad", "it's $& </script>"],
  categoricas: ["región"],
  excluidas: ["id"],
  semilla: 42,
  fraccion_prueba: 0.25,
  metrica: "auc",
  miembro: "forest",
  tolerancia: { tipo: "aproximada", relativa: 0.1, absoluta: 0.03 },
  esperado: { n_entrenamiento: 150, n_prueba: 50, metricas: { auc: 0.9, mape: null } },
};

describe("la receta toma sus bloques de pipeline.py", () => {
  it("están todos, cada uno no vacío, y en el orden de BLOQUES", () => {
    const b = bloquesDe(PIPELINE);
    expect(Object.keys(b).sort()).toEqual([...BLOQUES].sort());
    for (const id of BLOQUES) expect(b[id]!.trim().length, id).toBeGreaterThan(40);
    expect(b.fabricas).toContain("_FACTORIES = {");
    expect(b.fabricas).toContain("_REGRESSORS = {");
    expect(b.objetivos).toContain("def _prepare(p):");
    expect(b.prueba).toContain("def _test_metrics(");
  });

  it("falla NOMBRANDO el bloque que falta o el cierre que no está", () => {
    expect(() => bloquesDe(PIPELINE.replace("# plantilla:inicio fabricas\n", ""))).toThrow(/fabricas/);
    expect(() => bloquesDe(PIPELINE.replace("# plantilla:fin base\n", ""))).toThrow(/base/);
  });

  it("la receta armada no deja marcas y su declaración es el JSON que se le dio, con cualquier nombre de columna", () => {
    const receta = armarReceta(PIPELINE, RECETA, DECL, REQ);
    expect(receta).not.toContain("@@");
    expect(receta).toContain("def _prepare(p):");
    const dentro = /DECLARACION = json\.loads\(r'''([\s\S]*?)'''\)/.exec(receta)![1]!;
    expect(JSON.parse(dentro)).toEqual(DECL);
    // ninguna comilla simple cruda dentro del literal: el `'` de un nombre de columna no lo cierra
    expect(dentro).not.toContain("'");
    const versiones = /VERSIONES_FIJAS = json\.loads\(r'''([\s\S]*?)'''\)/.exec(receta)![1]!;
    expect(JSON.parse(versiones)).toEqual(versionesDe(REQ));
    expect(versionesDe(REQ)["scikit-learn"]).toBe("1.8.0");
  });

  it("un nombre de columna o de archivo que se llame como una marca NO se sustituye por segunda vez (AU-S17-08)", () => {
    const hostil: Declaracion = {
      ...DECL,
      archivo: "@@VERSIONES@@.csv",
      numericas: ["@@VERSIONES@@", "# @@PIPELINE@@", "@@DECLARACION@@"],
      categoricas: ["# @@IMPORTS@@"],
    };
    const receta = armarReceta(PIPELINE, RECETA, hostil, REQ);
    const dentro = /DECLARACION = json\.loads\(r'''([\s\S]*?)'''\)/.exec(receta)![1]!;
    expect(JSON.parse(dentro)).toEqual(hostil);
    const versiones = /VERSIONES_FIJAS = json\.loads\(r'''([\s\S]*?)'''\)/.exec(receta)![1]!;
    expect(JSON.parse(versiones)).toEqual(versionesDe(REQ));
    expect(receta).toContain("def _prepare(p):");
  });

  it("las versiones que la receta lista en su encabezado son las del requirements", () => {
    const receta = armarReceta(PIPELINE, RECETA, DECL, REQ);
    for (const [nombre, version] of Object.entries(versionesDe(REQ)))
      expect(receta).toContain(`#   ${nombre}==${version}`);
  });
});

describe("el puntuador portátil", () => {
  const archivo = JSON.stringify({ format_version: 1, manifest: { dato: "</script><b>" }, payload: "abc" });

  it("lleva el archivo completo y legible, y un `<` en él no cierra el <script>", () => {
    const html = armarPuntuador(PUNTUADOR, PUNTUAR, archivo);
    expect(html).not.toContain("__MODELO_JSON__");
    expect(html).not.toContain("__PUNTUAR_PY__");
    const dentro = /<script type="application\/json" id="modelo">([\s\S]*?)<\/script>/.exec(html)![1]!;
    expect(JSON.parse(dentro)).toEqual(JSON.parse(archivo));
    expect(dentro).not.toContain("<");
    expect(/<script type="text\/plain" id="puntuar-py">([\s\S]*?)<\/script>/.exec(html)![1]).toBe(PUNTUAR);
  });

  it("un valor del modelo que se llame como una marca no se sustituye por segunda vez (AU-S17-08)", () => {
    const hostil = JSON.stringify({
      format_version: 1,
      manifest: { dato: "__PUNTUAR_PY__", archivo: "__MODELO_JSON__.csv" },
      payload: "abc",
    });
    const html = armarPuntuador(PUNTUADOR, PUNTUAR, hostil);
    const dentro = /<script type="application\/json" id="modelo">([\s\S]*?)<\/script>/.exec(html)![1]!;
    expect(JSON.parse(dentro)).toEqual(JSON.parse(hostil));
    expect(/<script type="text\/plain" id="puntuar-py">([\s\S]*?)<\/script>/.exec(html)![1]).toBe(PUNTUAR);
  });

  it("se niega a armarse si el motor trae `</script`, y la plantilla trae sus dos marcas una vez", () => {
    expect(() => armarPuntuador(PUNTUADOR, "x = '</script>'", archivo)).toThrow(/script/);
    expect(PUNTUAR).not.toMatch(/<\/script/i);
    for (const marca of ["__MODELO_JSON__", "__PUNTUAR_PY__"])
      expect(PUNTUADOR.split(marca)).toHaveLength(2);
  });

  it("solo habla con el CDN público de Pyodide en la versión del proyecto, y no con la app", () => {
    const version = (JSON.parse(leer("package.json")) as { devDependencies: Record<string, string> }).devDependencies.pyodide;
    expect(PUNTUADOR).toContain(`var PYODIDE = "${version}"`);
    // el único anfitrión al que el HTML nombra es el CDN público de Pyodide (ni la app, ni un despliegue, ni telemetría)
    const anfitriones = new Set(PUNTUADOR.match(/https?:\/\/[^\s"'<>/)]+/g) ?? []);
    expect([...anfitriones]).toEqual(["https://cdn.jsdelivr.net"]);
  });
});

/** Un lector de ZIP independiente del escritor: directorio central → nombre, tamaño, CRC y contenido. */
function leerZip(zip: Uint8Array) {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const fin = zip.length - 22;
  expect(v.getUint32(fin, true)).toBe(0x06054b50);
  const n = v.getUint16(fin + 10, true);
  let cursor = v.getUint32(fin + 16, true);
  const salida: { nombre: string; datos: Uint8Array; crc: number }[] = [];
  for (let i = 0; i < n; i++) {
    expect(v.getUint32(cursor, true)).toBe(0x02014b50);
    const crc = v.getUint32(cursor + 16, true);
    const tamano = v.getUint32(cursor + 24, true);
    const largoNombre = v.getUint16(cursor + 28, true);
    const posicion = v.getUint32(cursor + 42, true);
    const nombre = new TextDecoder().decode(zip.subarray(cursor + 46, cursor + 46 + largoNombre));
    const largoLocal = v.getUint16(posicion + 26, true);
    const inicio = posicion + 30 + largoLocal + v.getUint16(posicion + 28, true);
    salida.push({ nombre, datos: zip.subarray(inicio, inicio + tamano), crc });
    cursor += 46 + largoNombre;
  }
  return salida;
}

describe("el servicio en ZIP", () => {
  it("el CRC-32 da el valor conocido", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("trae los cinco archivos, con su contenido y su CRC, también con nombres y textos no ASCII", () => {
    const modelo = JSON.stringify({ nota: "ñandú ✓ 日本" });
    const zip = armarServicio({
      servicio: "print('hola')\n",
      puntuar: PUNTUAR,
      requirements: "numpy==2.4.3\n",
      readme: "# ñ\n",
      modelo,
    });
    const archivos = leerZip(zip);
    expect(archivos.map((a) => a.nombre)).toEqual([
      "servicio.py",
      "puntuar.py",
      "modelo.probeta.json",
      "requirements.txt",
      "README.md",
    ]);
    for (const a of archivos) expect(crc32(a.datos), a.nombre).toBe(a.crc);
    expect(new TextDecoder().decode(archivos[2]!.datos)).toBe(modelo);
    expect(new TextDecoder().decode(archivos[4]!.datos)).toBe("# ñ\n");
  });
});

describe("la declaración sale del resultado con nombres y números, nada más", () => {
  const resultado = {
    task: "binaria",
    modelName: "forest",
    nTrain: 150,
    nTest: 50,
    model: { accuracy: 0.8, precision: 0.7, recall: 0.6, f1: 0.65, auc: 0.9 },
    verdict: { primaryMetric: "auc" },
    explainability: {
      features: [
        { name: "edad", kind: "numeric" },
        { name: "región", kind: "categorical" },
      ],
    },
  } as unknown as SupervisedResult;

  it("columnas por tipo, saneamiento, semilla, fracción, métrica, miembro y métricas esperadas", () => {
    const d = declaracionDe({
      result: resultado,
      target: "compró",
      seed: 42,
      datasetName: "tienda.csv",
      sanitation: {
        clean: false,
        duplicateRowsRemoved: 2,
        exclusions: [{ column: "id", reason: "id-column" }],
        coercions: [],
        rowsBefore: 202,
        rowsAfter: 200,
        colsBefore: 5,
        colsAfter: 4,
        usable: true,
      },
      appVersion: "1.2.3",
      idioma: "en",
    });
    expect(d).toMatchObject({
      tarea: "binaria",
      objetivo: "compró",
      numericas: ["edad"],
      categoricas: ["región"],
      excluidas: ["id"],
      semilla: 42,
      fraccion_prueba: 0.25,
      metrica: "auc",
      miembro: "forest",
      idioma: "en",
      app: "probeta-ds 1.2.3",
      esperado: { n_entrenamiento: 150, n_prueba: 50 },
      tolerancia: TOLERANCIA_APROXIMADA,
    });
    expect(d.esperado.metricas).toEqual(resultado.model);
    // solo texto y números: ni filas ni etiquetas de clase
    expect(JSON.stringify(d)).not.toMatch(/positive|classes|rows/i);
  });

  it("S18: el plan de limpieza aprobado viaja como nombres de columnas; sin plan, la receta no gana la clave", () => {
    const base = {
      result: resultado,
      target: "compró",
      seed: 42,
      datasetName: "tienda.csv",
      sanitation: null,
      appVersion: "0",
      idioma: "es" as const,
    };
    expect("limpieza" in declaracionDe(base)).toBe(false);
    expect("limpieza" in declaracionDe({ ...base, limpieza: null })).toBe(false);
    const spec = { indicador_vacio: ["edad"], sin_dato: ["región"], cuantiles: [] };
    expect(declaracionDe({ ...base, limpieza: spec }).limpieza).toEqual(spec);
    // solo nombres: ningún número de celdas ni valor
    expect(JSON.stringify(declaracionDe({ ...base, limpieza: spec }).limpieza)).toBe(
      '{"indicador_vacio":["edad"],"sin_dato":["región"],"cuantiles":[]}',
    );
  });

  it("solo los bosques de árboles declaran tolerancia aproximada; los demás, exacta", () => {
    const de = (miembro: string) =>
      declaracionDe({
        result: { ...resultado, modelName: miembro } as unknown as SupervisedResult,
        target: "y",
        seed: 1,
        datasetName: "x.csv",
        sanitation: null,
        appVersion: "0",
        idioma: "es",
      }).tolerancia;
    expect([...AZAR_SENSIBLE].sort()).toEqual(["extra_trees", "forest", "forest_balanced"]);
    for (const m of AZAR_SENSIBLE) expect(de(m)).toEqual(TOLERANCIA_APROXIMADA);
    for (const m of ["logistic", "hgb", "xgboost", "lightgbm", "mlp", "knn"])
      expect(de(m)).toEqual({ tipo: "exacta" });
  });
});

describe("los espejos entre la app (TypeScript) y lo que se lleva (Python)", () => {
  it("la fracción de prueba es la de experiment.ts", () => {
    const m = /const TEST_SIZE = ([0-9.]+);/.exec(leer("src/lib/experiment.ts"));
    expect(Number(m![1])).toBe(FRACCION_PRUEBA);
  });

  it("puntuar.py y la receta cuentan como nulas las mismas celdas que csv.ts", () => {
    const tokens = (texto: string) => {
      const m = /NULL_TOKENS = \{([^}]*)\}/.exec(texto)!;
      return new Set([...m[1]!.matchAll(/"([^"]*)"/g)].map((x) => x[1]!));
    };
    expect(tokens(PUNTUAR)).toEqual(NULL_TOKENS);
    expect(tokens(PIPELINE)).toEqual(NULL_TOKENS); // el bloque `base` que la receta copia
  });

  it("el servicio no ofrece los modelos que no se abren fuera del navegador, y sí los demás", () => {
    expect(Object.keys(NO_SERVIBLES)).toEqual(["knn"]);
    expect(esServible("knn")).toBe(false);
    for (const m of ["logistic", "forest", "hgb", "xgboost", "lightgbm", "mlp", "linear"])
      expect(esServible(m)).toBe(true);
  });
});
