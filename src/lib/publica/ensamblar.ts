// S17 (ADR 024): armar lo que el usuario se lleva. Puro y sin red: recibe los textos de las plantillas
// (src/lib/ds/plantillas/, servidas desde /plantillas/ y /pyodide/pipeline.py) y devuelve el archivo. Lo usa la pantalla
// y lo usa la prueba de integración, que escribe lo MISMO para que la CI lo ejecute en CPython.
//
// Nada de lo que se arma lleva un valor del dataset: la receta solo trae nombres de columnas y números del modelo; el
// puntuador y el servicio llevan el modelo (con su manifiesto) y lo dicen.
import type { PrimaryMetric } from "@/engine/verdict";
import { crearZip } from "./zip";

export type Tolerancia =
  | { readonly tipo: "exacta" }
  | { readonly tipo: "aproximada"; readonly relativa: number; readonly absoluta: number };

/** Lo que la receta declara de la corrida, con nombres y números, jamás una fila. */
export type Declaracion = {
  readonly formato: "probeta-receta/1";
  readonly app: string;
  /** El idioma de lo que imprime la receta: el de la app al descargarla. */
  readonly idioma: "es" | "en";
  /** El nombre del archivo que se usó (un nombre, no su contenido). */
  readonly archivo: string;
  readonly tarea: "binaria" | "multiclase" | "numerica";
  readonly objetivo: string;
  readonly numericas: readonly string[];
  readonly categoricas: readonly string[];
  /** Las columnas que el saneamiento apartó (identificadores y constantes). */
  readonly excluidas: readonly string[];
  /** S18: el plan de limpieza que el usuario aprobó (solo nombres de columnas); ausente si no aprobó ninguno. */
  readonly limpieza?: {
    readonly indicador_vacio: readonly string[];
    readonly sin_dato: readonly string[];
    readonly cuantiles: readonly string[];
  };
  readonly semilla: number;
  readonly fraccion_prueba: number;
  readonly metrica: PrimaryMetric;
  readonly miembro: string;
  /** «exacta» (1e-6) para casi todos; los bosques de árboles declaran una aproximada y la receta lo dice (ADR 024). */
  readonly tolerancia: Tolerancia;
  readonly esperado: {
    readonly n_entrenamiento: number;
    readonly n_prueba: number;
    readonly metricas: Readonly<Record<string, number | null>>;
  };
};

/** Los bloques que la receta toma de pipeline.py, en el orden en que están marcados allí. */
export const BLOQUES = [
  "imports",
  "base",
  "metricas",
  "fabricas",
  "despacho",
  "objetivos",
  "metricas-multi",
  "prueba",
] as const;

const ABRE = /^# plantilla:inicio (\S+)\n/gm;

/** Los bloques marcados de pipeline.py por nombre. Falla nombrando el que falte (las marcas son parte del contrato). */
export function bloquesDe(pipeline: string): Record<string, string> {
  const bloques: Record<string, string> = {};
  for (const m of pipeline.matchAll(ABRE)) {
    const id = m[1]!;
    const desde = m.index + m[0].length;
    const cierre = `# plantilla:fin ${id}\n`;
    const hasta = pipeline.indexOf(cierre, desde);
    if (hasta < 0) throw new Error(`plantilla: falta el cierre de «${id}»`);
    bloques[id] = pipeline.slice(desde, hasta).replace(/\s+$/, "") + "\n";
  }
  for (const id of BLOQUES)
    if (!bloques[id]) throw new Error(`plantilla: falta el bloque «${id}»`);
  return bloques;
}

/** `paquete==versión` de un requirements.txt, sin comentarios. */
export function versionesDe(requirements: string): Record<string, string> {
  const versiones: Record<string, string> = {};
  for (const linea of requirements.split("\n")) {
    const limpia = linea.split("#", 1)[0]!.trim();
    const m = /^([A-Za-z0-9_.-]+)==(\S+)$/.exec(limpia);
    if (m) versiones[m[1]!] = m[2]!;
  }
  return versiones;
}

/**
 * Sustituye todas las marcas EN UNA SOLA PASADA: lo insertado nunca se vuelve a escanear. Con sustituciones en secuencia, un
 * dato del usuario que se llamara como una marca posterior (una columna `@@VERSIONES@@`, una categoría `__PUNTUAR_PY__`) se
 * sustituiría por segunda vez y dejaría el archivo roto. `Function` como reemplazo: `por` puede traer `$&` y compañía.
 */
function sustituir(texto: string, valores: Readonly<Record<string, string>>): string {
  const marcas = Object.keys(valores);
  for (const marca of marcas)
    if (!texto.includes(marca)) throw new Error(`plantilla: falta la marca ${marca}`);
  const alternativas = marcas.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return texto.replace(new RegExp(alternativas, "g"), (marca) => valores[marca]!);
}

/** JSON apto para ir dentro de un literal `r'''…'''` de Python: sin comillas simples crudas. */
function jsonPython(valor: unknown): string {
  return JSON.stringify(valor, null, 2).replaceAll("'", "\\u0027");
}

export function armarReceta(
  pipeline: string,
  plantilla: string,
  declaracion: Declaracion,
  requirements: string,
): string {
  const bloques = bloquesDe(pipeline);
  const versiones = versionesDe(requirements);
  const lista = Object.entries(versiones)
    .map(([nombre, version]) => `#   ${nombre}==${version}`)
    .join("\n");
  const imports =
    `# Versiones fijas con las que se entrenó el modelo (Python 3.14):\n${lista}\n\n` +
    bloques.imports!;
  const resto = BLOQUES.filter((id) => id !== "imports")
    .map((id) => bloques[id]!)
    .join("\n\n");
  return sustituir(plantilla, {
    "# @@IMPORTS@@": imports.trimEnd(),
    "# @@PIPELINE@@": resto.trimEnd(),
    "@@DECLARACION@@": jsonPython(declaracion),
    "@@VERSIONES@@": jsonPython(versiones),
  });
}

/** El puntuador portátil: un HTML con el modelo y el motor de puntuar adentro. */
export function armarPuntuador(
  plantilla: string,
  puntuarPy: string,
  archivoModelo: string,
): string {
  if (/<\/script/i.test(puntuarPy))
    throw new Error("plantilla: puntuar.py no puede traer «</script»");
  // dentro de <script type="application/json"> lo único que corta es «</script»: cualquier «<» va escapado
  const json = archivoModelo.replaceAll("<", "\\u003c");
  return sustituir(plantilla, {
    __MODELO_JSON__: json,
    __PUNTUAR_PY__: puntuarPy,
  });
}

export type EntradasServicio = {
  readonly servicio: string;
  readonly puntuar: string;
  readonly requirements: string;
  readonly readme: string;
  /** El `.probeta.json` tal cual se descarga de la app. */
  readonly modelo: string;
};

/** El servicio: un ZIP con el servicio, el motor de puntuar, el modelo, las versiones fijas y el README. */
export function armarServicio(e: EntradasServicio, fecha?: Date) {
  return crearZip(
    [
      { nombre: "servicio.py", datos: e.servicio },
      { nombre: "puntuar.py", datos: e.puntuar },
      { nombre: "modelo.probeta.json", datos: e.modelo },
      { nombre: "requirements.txt", datos: e.requirements },
      { nombre: "README.md", datos: e.readme },
    ],
    fecha,
  );
}
