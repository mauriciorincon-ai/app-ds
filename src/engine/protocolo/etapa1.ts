// Protocolo DS (S8), etapa 1 — LA DECISIÓN Y LO QUE CUESTA EQUIVOCARSE. Antes de tocar los datos:
// qué decisión cambia con el modelo, quién la toma y cuánto cuesta cada error en su unidad.
// De ahí sale la métrica y el umbral, no de la costumbre (Elkan, IJCAI 2001: se actúa en la
// clase de menor costo esperado; con dos clases el umbral teórico es c_FP / (c_FP + c_FN)).
//
// Lo que el código NO puede saber —la decisión, el decisor, los costos— se pregunta. Compuerta:
// decisión, decisor, la forma de la decisión y los costos, todos mayores que cero.
import { byTask } from "@/engine/despacho";
import {
  MULTICLASS_MAX_CLASSES,
  MULTICLASS_MIN_CLASSES,
  type SupervisedTask,
} from "@/engine/tarea";
import type {
  DatosEtapa,
  EtapaConstruida,
  Lectura,
  Trampa,
  Valor,
  Veredicto,
} from "./etapas";
import {
  claveExtra,
  lista,
  mapa,
  mismoRegistro,
  numero,
  positivo,
  texto,
  textoLleno,
  type Registro,
} from "./valores";

/** Cómo es la decisión: sí o no · elegir entre varias opciones · cuánto. */
export const FORMAS: readonly SupervisedTask[] = [
  "binaria",
  "multiclase",
  "numerica",
];

/** Largo máximo de un texto libre y de un nombre de opción. */
export const TEXTO_MAX = 1000;
export const OPCION_MAX = 60;

const COMUNES = ["decision", "decisor", "cuando", "hoy", "forma", "unidad"];

/** Todas las claves que esta etapa puede registrar (para el cuaderno y su paridad de textos). */
export const CLAVES_1 = {
  respuestas: [
    ...COMUNES,
    "c_fp",
    "c_fn",
    "opciones",
    "costos",
    "c_sub",
    "c_sobre",
  ],
  chequeos: [
    "umbral",
    "razon",
    "n_opciones",
    "costo_menor",
    "costo_mayor",
    "cuantil",
  ],
} as const;

function camposDe(forma: SupervisedTask): readonly string[] {
  return byTask(forma, {
    binaria: ["c_fp", "c_fn"],
    multiclase: ["opciones", "costos"],
    numerica: ["c_sub", "c_sobre"],
  });
}

function chequeosDe(forma: SupervisedTask): readonly string[] {
  return byTask(forma, {
    binaria: ["umbral", "razon"],
    multiclase: ["n_opciones", "costo_menor", "costo_mayor"],
    numerica: ["cuantil", "razon"],
  });
}

export function formaDe(r: Registro): SupervisedTask | null {
  return FORMAS.find((f) => f === r.forma) ?? null;
}

/** Las opciones limpias (sin espacios sobrantes ni vacías) de un texto de una por línea. */
export function opcionesDeTexto(texto: string): string[] {
  return texto
    .split("\n")
    .map((linea) => linea.trim())
    .filter((linea) => linea !== "");
}

/** Lo que el código calcula de los costos (se guarda y se recalcula al leer). */
export function chequeos1(r: Registro): Readonly<Record<string, Valor>> | null {
  const forma = formaDe(r);
  if (!forma) return null;
  return byTask(forma, {
    binaria: (): Readonly<Record<string, Valor>> | null => {
      const [fp, fn] = [positivo(r, "c_fp"), positivo(r, "c_fn")];
      if (fp === null || fn === null) return null;
      return { umbral: fp / (fp + fn), razon: fn / fp };
    },
    multiclase: (): Readonly<Record<string, Valor>> | null => {
      const [opciones, costos] = [lista(r, "opciones"), mapa(r, "costos")];
      if (!opciones || !costos) return null;
      const valores = opciones.map((o) => costos[o]);
      if (valores.some((v) => v === undefined || !(v > 0))) return null;
      return {
        n_opciones: opciones.length,
        costo_menor: Math.min(...(valores as number[])),
        costo_mayor: Math.max(...(valores as number[])),
      };
    },
    numerica: (): Readonly<Record<string, Valor>> | null => {
      const [sub, sobre] = [positivo(r, "c_sub"), positivo(r, "c_sobre")];
      if (sub === null || sobre === null) return null;
      return { cuantil: sub / (sub + sobre), razon: sub / sobre };
    },
  })();
}

function leer(datos: DatosEtapa): Lectura {
  const r = datos.respuestas;
  const forma = formaDe(r);
  if (!forma) return { ok: false, campo: "respuestas.forma" };
  const permitidas = [...COMUNES, ...camposDe(forma)];
  const extra = claveExtra(r, permitidas);
  if (extra) return { ok: false, campo: `respuestas.${extra}` };
  for (const clave of ["decision", "decisor", "cuando", "hoy", "unidad"])
    if (texto(r, clave) === null)
      return { ok: false, campo: `respuestas.${clave}` };
  for (const clave of ["decision", "decisor", "cuando", "hoy", "unidad"])
    if ((texto(r, clave) ?? "").length > TEXTO_MAX)
      return { ok: false, campo: `respuestas.${clave}` };
  const campos = byTask(forma, {
    binaria: (): string | null =>
      numero(r, "c_fp") === null
        ? "c_fp"
        : numero(r, "c_fn") === null
          ? "c_fn"
          : null,
    multiclase: (): string | null => {
      const opciones = lista(r, "opciones");
      if (!opciones || opciones.some((o) => o.length > OPCION_MAX))
        return "opciones";
      return mapa(r, "costos") === null ? "costos" : null;
    },
    numerica: (): string | null =>
      numero(r, "c_sub") === null
        ? "c_sub"
        : numero(r, "c_sobre") === null
          ? "c_sobre"
          : null,
  })();
  if (campos) return { ok: false, campo: `respuestas.${campos}` };
  const esperadas = chequeosDe(forma);
  const sobra = claveExtra(datos.chequeos, esperadas);
  if (sobra) return { ok: false, campo: `chequeos.${sobra}` };
  // Que las cifras estén y cuadren lo decide el criterio, que las recalcula.
  return { ok: true };
}

function criterio(datos: DatosEtapa): Veredicto {
  const r = datos.respuestas;
  const forma = formaDe(r);
  if (!forma) return { tipo: "falta", faltan: ["forma"] };
  const faltan: string[] = [];
  if (textoLleno(r, "decision") === null) faltan.push("decision");
  if (textoLleno(r, "decisor") === null) faltan.push("decisor");
  if (textoLleno(r, "unidad") === null) faltan.push("unidad");
  const costos = byTask(forma, {
    binaria: (): boolean =>
      positivo(r, "c_fp") !== null && positivo(r, "c_fn") !== null,
    multiclase: (): boolean => {
      const opciones = lista(r, "opciones");
      const costos = mapa(r, "costos");
      if (!opciones || !costos) return false;
      const unicas = new Set(opciones.map((o) => o.trim()));
      return (
        opciones.length >= MULTICLASS_MIN_CLASSES &&
        opciones.length <= MULTICLASS_MAX_CLASSES &&
        unicas.size === opciones.length &&
        opciones.every(
          (o) => o.trim() !== "" && costos[o] !== undefined && costos[o] > 0,
        ) &&
        Object.keys(costos).length === opciones.length
      );
    },
    numerica: (): boolean =>
      positivo(r, "c_sub") !== null && positivo(r, "c_sobre") !== null,
  })();
  if (!costos) faltan.push("costos");
  if (faltan.length > 0) return { tipo: "falta", faltan };
  const esperados = chequeos1(r);
  if (!esperados || !mismoRegistro(esperados, datos.chequeos))
    return { tipo: "falta", faltan: ["chequeos"] };
  return { tipo: "cumple" };
}

/** Lo que esta etapa evitó, con los costos del usuario. */
function trampas(datos: DatosEtapa): readonly Trampa[] {
  const r = datos.respuestas;
  const forma = formaDe(r);
  const c = datos.chequeos;
  if (!forma) return [];
  return byTask(forma, {
    binaria: (): readonly Trampa[] => {
      const [umbral, razon] = [numero(c, "umbral"), numero(c, "razon")];
      if (umbral === null || razon === null) return [];
      if (Math.abs(umbral - 0.5) < 1e-9)
        return [{ clave: "umbral-igual", params: {} }];
      // `razon` es lo que cuesta un falso negativo frente a un falso positivo.
      return umbral < 0.5
        ? [{ clave: "umbral", params: { umbral, razon } }]
        : [{ clave: "umbral-alto", params: { umbral, razon: 1 / razon } }];
    },
    multiclase: (): readonly Trampa[] => {
      const [menor, mayor] = [
        numero(c, "costo_menor"),
        numero(c, "costo_mayor"),
      ];
      if (menor === null || mayor === null) return [];
      return [
        Math.abs(menor - mayor) < 1e-9
          ? { clave: "costos-iguales", params: {} }
          : { clave: "costos", params: { menor, mayor } },
      ];
    },
    numerica: (): readonly Trampa[] => {
      const [cuantil, razon] = [numero(c, "cuantil"), numero(c, "razon")];
      if (cuantil === null || razon === null) return [];
      if (Math.abs(cuantil - 0.5) < 1e-9)
        return [{ clave: "cuantil-igual", params: {} }];
      // `razon` es lo que cuesta quedarse corto frente a pasarse.
      return cuantil > 0.5
        ? [{ clave: "cuantil", params: { cuantil, razon } }]
        : [{ clave: "cuantil-bajo", params: { cuantil, razon: 1 / razon } }];
    },
  })();
}

export const ETAPA_1: EtapaConstruida = {
  id: 1,
  construida: true,
  dependeDeDatos: false,
  terminos: [
    "decision",
    "costo-de-error",
    "falso-positivo",
    "falso-negativo",
    "umbral",
    "cuantil",
  ],
  preguntas: [
    "decision",
    "decisor",
    "cuando",
    "hoy",
    "forma",
    "unidad",
    "costos",
  ],
  chequeos: ["umbral", "cuantil", "costo_menor", "costo_mayor"],
  leer,
  criterio,
  trampas: (datos) => trampas(datos),
};
