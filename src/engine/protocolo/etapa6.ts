// Protocolo DS (S11), etapa 6 — LA PRUEBA SELLADA. La partición que pide tu caso (VISION v2.0.0,
// «Entrenar sin engañarte»): la app sugiere el esquema por reglas desde lo que registró la etapa 2
// y dice por qué; con fecha y unidad repetida pregunta si el modelo se usará con unidades nuevas o
// con las que ya conoce, porque eso el código no lo puede saber. Elegir otro esquema pide escribir
// por qué (G-Plan 1a), y el cuaderno guarda el sugerido, el elegido y la razón.
//
// La compuerta exige cero solape en lo que el esquema promete, contado en la tabla, y el SELLO:
// el SHA-256 de la receta de `particion.ts` (huella, esquema, parámetros, semilla e índices de la
// prueba). `recalcular` lo rehace en cada evaluación: un cuaderno editado con otra prueba no
// cuadra y la etapa 7 no abre. El sello es higiene y trazabilidad, no una promesa: dice que la
// prueba de hoy es la que se selló, no que nadie la haya mirado.
//
// La pantalla y el cuaderno muestran conteos y rangos, nunca filas de la prueba. La etapa 7
// entrena y compara con la prueba todavía cerrada; la etapa 8 la abre una vez.
import { byTask } from "@/engine/despacho";
import type { CsvTable } from "@/lib/ds/csv";
import type {
  DatosEtapa,
  EtapaConstruida,
  Lectura,
  Previas,
  Trampa,
  Valor,
  Veredicto,
} from "./etapas";
import { formaDe } from "./etapa1";
import {
  ESQUEMAS,
  HORIZONTE_MAX,
  SEMILLA_6,
  TAMANO_MAX,
  TAMANO_MIN,
  TAMANO_SUGERIDO,
  disenoDe,
  disponibles,
  esEsquema,
  esPorGrupo,
  esTemporal,
  esUnidadHorizonte,
  partir,
  preguntaUnidades,
  sugerido,
  type Esquema,
  type UnidadHorizonte,
} from "./particion";
import {
  booleano,
  claveExtra,
  lista,
  mapa,
  numero,
  texto,
  textoLleno,
  type Registro,
} from "./valores";

const RESPUESTAS = [
  "unidades",
  "esquema",
  "razon",
  "tamano",
  "horizonte",
  "horizonte_unidad",
] as const;

const CHEQUEOS = [
  "filas",
  "filas_objetivo",
  "disponibles",
  "pregunta_unidades",
  "sugerido",
  "semilla",
  "corte",
  "n_entrenamiento",
  "n_prueba",
  "n_hueco",
  "fuera_sin_objetivo",
  "fuera_sin_fecha",
  "fuera_sin_unidad",
  "fuera_unidades_prueba",
  "unidades_entrenamiento",
  "unidades_prueba",
  "fecha_min_entrenamiento",
  "fecha_max_entrenamiento",
  "fecha_min_prueba",
  "fecha_max_prueba",
  "clases_entrenamiento",
  "clases_prueba",
  "solape_filas",
  "solape_unidades",
  "solape_tiempo",
  "corte_referencia",
  "recientes_entrenamiento",
  "azar_unidades",
  "azar_recientes",
  "sello",
] as const;

/** Todas las claves que esta etapa puede registrar. */
export const CLAVES_6 = { respuestas: RESPUESTAS, chequeos: CHEQUEOS } as const;

/** Las frases de «lo que esta etapa evitó» (`protocol.stage.6.trap.<id>`). */
export const TRAMPAS_6 = [
  "evito-tiempo",
  "evito-unidades",
  "riesgo-tiempo",
  "riesgo-unidades",
  "unidades-conocidas",
  "sin-hueco",
  "hueco-dias",
  "hueco-dias-uno",
  "hueco-meses",
  "hueco-meses-uno",
  "clase-rara",
  "clase-escasa",
  "clase-ausente",
  "sellos",
] as const;

/**
 * Por debajo de cuántos casos en la prueba la clase con menos casos se avisa como escasa. Es una
 * convención para avisar, no un umbral estadístico: con menos, una sola fila mueve su medida en más
 * de diez puntos de cada cien.
 */
export const CASOS_ESCASOS = 10;

export const RAZON_MAX = 500;
export const UNIDADES = ["nuevas", "conocidas"] as const;
export type Unidades = (typeof UNIDADES)[number];

const HEX64 = /^[0-9a-f]{64}$/;

/** Lo que el usuario responde en la pantalla de la etapa 6. */
export type EntradaEtapa6 = {
  readonly unidades: "" | Unidades;
  readonly esquema: "" | Esquema;
  readonly razon: string;
  /** Enteros por ciento; `null` si lo escrito no se lee como número. */
  readonly tamano: number | null;
  /** Solo en los esquemas por tiempo; `null` sin escribir. */
  readonly horizonte: number | null;
  readonly horizonteUnidad: "" | UnidadHorizonte;
};

export const ENTRADA_6_VACIA: EntradaEtapa6 = {
  unidades: "",
  esquema: "",
  razon: "",
  tamano: TAMANO_SUGERIDO,
  horizonte: null,
  horizonteUnidad: "",
};

/** Lo que se respondió, leído de lo registrado (el inverso de `datosEtapa6`). */
export function entradaDesdeRespuestas(r: Registro): EntradaEtapa6 {
  const unidades = r.unidades;
  const esquema = r.esquema;
  const unidad = r.horizonte_unidad;
  return {
    unidades: unidades === "nuevas" || unidades === "conocidas" ? unidades : "",
    esquema: esEsquema(esquema) ? esquema : "",
    razon: texto(r, "razon") ?? "",
    tamano: numero(r, "tamano"),
    horizonte: numero(r, "horizonte"),
    horizonteUnidad: esUnidadHorizonte(unidad) ? unidad : "",
  };
}

const nulos = (claves: readonly string[]) =>
  Object.fromEntries(claves.map((k) => [k, null]));

/**
 * Arma lo que la etapa 6 registra: las respuestas (sin lo que no corresponde al esquema elegido)
 * y lo que el código calcula sobre la tabla, sellado con la huella de los datos.
 */
export function datosEtapa6(
  tabla: CsvTable,
  entrada: EntradaEtapa6,
  previas: Previas,
  huella: string | null,
): DatosEtapa {
  const [e1, e2] = [previas[1], previas[2]];
  const forma = e1 ? formaDe(e1.respuestas) : null;
  const d = forma && e2 ? disenoDe(tabla, forma, e2.respuestas) : null;
  const pregunta = d !== null && preguntaUnidades(d);
  const unidades = pregunta ? entrada.unidades : "";
  const sug = d ? sugerido(d, unidades) : null;
  const esquema = entrada.esquema;
  const temporal = esquema !== "" && esTemporal(esquema);
  const respuestas: Record<string, Valor> = {
    unidades,
    esquema,
    // la razón solo tiene sentido si elegiste otro esquema que el sugerido
    razon:
      esquema !== "" && sug !== null && esquema !== sug
        ? entrada.razon.trim()
        : "",
    tamano: entrada.tamano,
    horizonte: temporal ? entrada.horizonte : null,
    horizonte_unidad: temporal ? entrada.horizonteUnidad : "",
  };

  const r =
    d &&
    huella &&
    esquema !== "" &&
    entrada.tamano !== null &&
    (!temporal ||
      (entrada.horizonte !== null && entrada.horizonteUnidad !== ""))
      ? partir(
          tabla,
          d,
          {
            esquema,
            tamano: entrada.tamano,
            horizonte: temporal ? entrada.horizonte! : 0,
            unidad: temporal
              ? (entrada.horizonteUnidad as UnidadHorizonte)
              : "dias",
          },
          huella,
        )
      : null;

  const chequeos: Record<string, Valor> = {
    ...nulos(CHEQUEOS),
    filas: d?.filasTabla ?? tabla.rows.length,
    filas_objetivo: d?.filas.length ?? 0,
    disponibles: d ? disponibles(d) : [],
    pregunta_unidades: pregunta,
    sugerido: sug ?? "",
    semilla: SEMILLA_6,
  };
  if (r) {
    const p = r.particion;
    const e = p.esquema;
    Object.assign(chequeos, {
      corte: p.corte,
      n_entrenamiento: p.entrenamiento.length,
      n_prueba: p.prueba.length,
      n_hueco: p.hueco.length,
      fuera_sin_objetivo: p.fuera.sinObjetivo,
      fuera_sin_fecha: p.fuera.sinFecha,
      fuera_sin_unidad: p.fuera.sinUnidad,
      fuera_unidades_prueba: p.fuera.unidadesDePrueba,
      unidades_entrenamiento: r.entrenamiento.unidades,
      unidades_prueba: r.prueba.unidades,
      fecha_min_entrenamiento: r.entrenamiento.fechaMin,
      fecha_max_entrenamiento: r.entrenamiento.fechaMax,
      fecha_min_prueba: r.prueba.fechaMin,
      fecha_max_prueba: r.prueba.fechaMax,
      clases_entrenamiento: r.entrenamiento.clases,
      clases_prueba: r.prueba.clases,
      solape_filas: r.verificacion.solapeFilas,
      solape_unidades: r.verificacion.solapeUnidades,
      solape_tiempo: r.verificacion.solapeTiempo,
      corte_referencia: r.corteReferencia,
      recientes_entrenamiento: r.recientes,
      azar_unidades: esPorGrupo(e) && r.azar ? r.azar.unidades : null,
      azar_recientes: esTemporal(e) && r.azar ? r.azar.recientes : null,
      sello: r.sello,
    } satisfies Partial<Record<(typeof CHEQUEOS)[number], Valor>>);
  }
  return { respuestas, chequeos };
}

// --- lo registrado: forma, criterio, trampas ---------------------------------------------------

const NUMEROS_O_NULO = [
  "corte",
  "n_entrenamiento",
  "n_prueba",
  "n_hueco",
  "fuera_sin_objetivo",
  "fuera_sin_fecha",
  "fuera_sin_unidad",
  "fuera_unidades_prueba",
  "unidades_entrenamiento",
  "unidades_prueba",
  "solape_filas",
  "solape_unidades",
  "solape_tiempo",
  "recientes_entrenamiento",
  "azar_unidades",
  "azar_recientes",
] as const;
const TEXTOS_O_NULO = [
  "corte",
  "corte_referencia",
  "fecha_min_entrenamiento",
  "fecha_max_entrenamiento",
  "fecha_min_prueba",
  "fecha_max_prueba",
] as const;

function leer(datos: DatosEtapa): Lectura {
  const r = datos.respuestas;
  const extra = claveExtra(r, RESPUESTAS);
  if (extra) return { ok: false, campo: `respuestas.${extra}` };
  const falta = RESPUESTAS.find((k) => !(k in r));
  if (falta) return { ok: false, campo: `respuestas.${falta}` };
  if (r.unidades !== "" && !UNIDADES.some((u) => u === r.unidades))
    return { ok: false, campo: "respuestas.unidades" };
  if (r.esquema !== "" && !esEsquema(r.esquema))
    return { ok: false, campo: "respuestas.esquema" };
  if (texto(r, "razon") === null || texto(r, "razon")!.length > RAZON_MAX)
    return { ok: false, campo: "respuestas.razon" };
  for (const clave of ["tamano", "horizonte"] as const)
    if (r[clave] !== null && numero(r, clave) === null)
      return { ok: false, campo: `respuestas.${clave}` };
  if (r.horizonte_unidad !== "" && !esUnidadHorizonte(r.horizonte_unidad))
    return { ok: false, campo: "respuestas.horizonte_unidad" };

  const c = datos.chequeos;
  const intrusa = claveExtra(c, CHEQUEOS);
  if (intrusa) return { ok: false, campo: `chequeos.${intrusa}` };
  const ausente = CHEQUEOS.find((k) => !(k in c));
  if (ausente) return { ok: false, campo: `chequeos.${ausente}` };
  for (const clave of ["filas", "filas_objetivo", "semilla"] as const)
    if (numero(c, clave) === null)
      return { ok: false, campo: `chequeos.${clave}` };
  const disp = lista(c, "disponibles");
  if (disp === null || !disp.every(esEsquema))
    return { ok: false, campo: "chequeos.disponibles" };
  if (booleano(c, "pregunta_unidades") === null)
    return { ok: false, campo: "chequeos.pregunta_unidades" };
  if (c.sugerido !== "" && !esEsquema(c.sugerido))
    return { ok: false, campo: "chequeos.sugerido" };
  for (const clave of NUMEROS_O_NULO)
    if (clave !== "corte" && c[clave] !== null && numero(c, clave) === null)
      return { ok: false, campo: `chequeos.${clave}` };
  for (const clave of TEXTOS_O_NULO)
    if (c[clave] !== null && typeof c[clave] !== "string")
      return { ok: false, campo: `chequeos.${clave}` };
  for (const clave of ["clases_entrenamiento", "clases_prueba"] as const)
    if (c[clave] !== null && mapa(c, clave) === null)
      return { ok: false, campo: `chequeos.${clave}` };
  if (c.sello !== null && !(typeof c.sello === "string" && HEX64.test(c.sello)))
    return { ok: false, campo: "chequeos.sello" };
  return { ok: true };
}

const entero = (n: number | null, min: number, max: number) =>
  n !== null && Number.isInteger(n) && n >= min && n <= max;

function criterio(datos: DatosEtapa, previas: Previas): Veredicto {
  const [e1, e2] = [previas[1], previas[2]];
  if (!e1 || !e2 || !previas[3] || !previas[4] || !previas[5])
    return { tipo: "falta", faltan: ["etapas-previas"] };
  const forma = formaDe(e1.respuestas);
  if (!forma) return { tipo: "falta", faltan: ["etapas-previas"] };
  const [r, c] = [datos.respuestas, datos.chequeos];
  const faltan = new Set<string>();

  if (
    booleano(c, "pregunta_unidades") === true &&
    !UNIDADES.some((u) => u === r.unidades)
  )
    faltan.add("unidades");
  const esquema = texto(r, "esquema") ?? "";
  const valido =
    esEsquema(esquema) && (lista(c, "disponibles") ?? []).includes(esquema);
  if (!valido) faltan.add("esquema");
  const sug = texto(c, "sugerido") ?? "";
  if (
    valido &&
    sug !== "" &&
    esquema !== sug &&
    textoLleno(r, "razon") === null
  )
    faltan.add("razon");
  if (!entero(numero(r, "tamano"), TAMANO_MIN, TAMANO_MAX))
    faltan.add("tamano");
  if (valido && esTemporal(esquema as Esquema)) {
    const unidad = r.horizonte_unidad;
    if (
      !esUnidadHorizonte(unidad) ||
      !entero(numero(r, "horizonte"), 0, HORIZONTE_MAX[unidad])
    )
      faltan.add("horizonte");
  }

  if (faltan.size === 0) {
    const [nE, nP] = [numero(c, "n_entrenamiento"), numero(c, "n_prueba")];
    if (texto(c, "sello") === null || nE === null || nP === null)
      faltan.add("esquema");
    else if (nE === 0 || nP === 0)
      faltan.add(
        esquema === "tiempo-grupo" &&
          nE === 0 &&
          (numero(c, "fuera_unidades_prueba") ?? 0) > 0
          ? "sin-nuevas"
          : "lado-vacio",
      );
    else {
      // dos clases: cada lado necesita casos de las dos (sin la rara en la prueba, nada se mide)
      const ladosBien = byTask(forma, {
        binaria: () => {
          const positivo = texto(e2.respuestas, "positivo") ?? "";
          return (["clases_entrenamiento", "clases_prueba"] as const).every(
            (lado) => {
              const cuenta = mapa(c, lado) ?? {};
              const total = Object.values(cuenta).reduce((a, b) => a + b, 0);
              const pos = Object.hasOwn(cuenta, positivo)
                ? cuenta[positivo]!
                : 0;
              return pos > 0 && total - pos > 0;
            },
          );
        },
        multiclase: () => true,
        numerica: () => true,
      })();
      if (!ladosBien) faltan.add("clases-lado");
      const e = esquema as Esquema;
      if (
        numero(c, "solape_filas") !== 0 ||
        (esPorGrupo(e) && numero(c, "solape_unidades") !== 0) ||
        (esTemporal(e) && numero(c, "solape_tiempo") !== 0)
      )
        faltan.add("solape");
    }
  }
  return faltan.size > 0
    ? { tipo: "falta", faltan: [...faltan] }
    : { tipo: "cumple" };
}

/** Cuántos sellos DISTINTOS hay en estas evidencias de la etapa 6 (volver a registrar el mismo no suma). */
export function sellosDistintos(evidencias: readonly DatosEtapa[]): number {
  return new Set(
    evidencias
      .map((d) => texto(d.chequeos, "sello"))
      .filter((s): s is string => s !== null),
  ).size;
}

/** La clase con menos filas en la prueba (la primera por nombre en un empate). */
function masRara(
  cuenta: Readonly<Record<string, number>>,
): { clase: string; n: number } | null {
  let mejor: { clase: string; n: number } | null = null;
  for (const clase of Object.keys(cuenta).sort()) {
    const n = cuenta[clase]!;
    if (mejor === null || n < mejor.n) mejor = { clase, n };
  }
  return mejor;
}

/** Lo que la etapa 6 evitó (o lo que se arriesga con el esquema elegido), en los datos del usuario. */
function trampas(
  datos: DatosEtapa,
  previas: Previas,
  historia: readonly DatosEtapa[] = [],
): readonly Trampa[] {
  const [r, c] = [datos.respuestas, datos.chequeos];
  const esquema = r.esquema;
  if (!esEsquema(esquema) || texto(c, "sello") === null) return [];
  const salida: Trampa[] = [];
  const mas = (
    clave: string,
    n: number | null,
    extra: Record<string, string> = {},
  ) => {
    if (n !== null && n > 0) salida.push({ clave, params: { n, ...extra } });
  };
  const corte = { corte: texto(c, "corte_referencia") ?? "" };

  if (esTemporal(esquema))
    mas("evito-tiempo", numero(c, "azar_recientes"), corte);
  if (esPorGrupo(esquema)) mas("evito-unidades", numero(c, "azar_unidades"));
  if (!esTemporal(esquema))
    mas("riesgo-tiempo", numero(c, "recientes_entrenamiento"), corte);
  if (!esPorGrupo(esquema))
    mas(
      esquema === "tiempo" && r.unidades === "conocidas"
        ? "unidades-conocidas"
        : "riesgo-unidades",
      numero(c, "solape_unidades"),
    );

  if (esTemporal(esquema)) {
    const [h, unidad, n] = [
      numero(r, "horizonte"),
      r.horizonte_unidad,
      numero(c, "n_hueco"),
    ];
    if (h === 0) salida.push({ clave: "sin-hueco", params: {} });
    else if (h !== null && n !== null && esUnidadHorizonte(unidad))
      salida.push({
        clave: `hueco-${unidad}${h === 1 ? "-uno" : ""}`,
        params: { h, n },
      });
  }

  // la clase con menos casos en la prueba (dos clases o varias): cuántos tendrá la etapa 8 para medirla
  const prueba = mapa(c, "clases_prueba");
  const rara = prueba ? masRara(prueba) : null;
  if (rara)
    salida.push(
      rara.n === 0
        ? { clave: "clase-ausente", params: { clase: rara.clase } }
        : {
            clave: rara.n < CASOS_ESCASOS ? "clase-escasa" : "clase-rara",
            params: rara,
          },
    );

  const sellos = sellosDistintos([...historia, datos]);
  if (sellos >= 2) salida.push({ clave: "sellos", params: { n: sellos } });
  return salida;
}

export type ResumenEtapa6 = {
  readonly esquema: string;
  readonly sugerido: string;
  readonly razon: string;
  readonly unidades: string;
  readonly tamano: number | null;
  readonly horizonte: number | null;
  readonly horizonteUnidad: string;
  readonly entrenamiento: number | null;
  readonly prueba: number | null;
  readonly hueco: number | null;
  readonly fuera: number;
  readonly corte: string | null;
  readonly sello: string | null;
};

/** Lo esencial de una evidencia de la etapa 6, para el cuaderno. */
export function resumenEtapa6(datos: DatosEtapa): ResumenEtapa6 {
  const [r, c] = [datos.respuestas, datos.chequeos];
  const fuera = [
    "fuera_sin_objetivo",
    "fuera_sin_fecha",
    "fuera_sin_unidad",
    "fuera_unidades_prueba",
  ].reduce((suma, k) => suma + (numero(c, k) ?? 0), 0);
  return {
    esquema: texto(r, "esquema") ?? "",
    sugerido: texto(c, "sugerido") ?? "",
    razon: texto(r, "razon") ?? "",
    unidades: texto(r, "unidades") ?? "",
    tamano: numero(r, "tamano"),
    horizonte: numero(r, "horizonte"),
    horizonteUnidad: texto(r, "horizonte_unidad") ?? "",
    entrenamiento: numero(c, "n_entrenamiento"),
    prueba: numero(c, "n_prueba"),
    hueco: numero(c, "n_hueco"),
    fuera,
    corte: texto(c, "corte"),
    sello: texto(c, "sello"),
  };
}

/**
 * Vuelve a partir y a sellar la tabla cargada con esas mismas respuestas. Todo sale de la tabla,
 * también el sello: nada de lo registrado se copia (la demo en rojo copia aquí el sello registrado y
 * la prueba de forjado tiene que caer).
 */
function recalcular(
  datos: DatosEtapa,
  previas: Previas,
  tabla: CsvTable,
  huella: string | null = null,
): DatosEtapa {
  const hoy = datosEtapa6(
    tabla,
    entradaDesdeRespuestas(datos.respuestas),
    previas,
    huella,
  );
  return hoy;
}

export const ETAPA_6: EtapaConstruida = {
  id: 6,
  construida: true,
  dependeDeDatos: true,
  terminos: [
    "conjunto-de-prueba",
    "particion-por-tiempo",
    "particion-por-grupo",
    "horizonte",
    "prueba-sellada",
  ],
  preguntas: ["unidades", "esquema", "tamano", "horizonte"],
  chequeos: ["particion", "solape", "sello"],
  leer,
  criterio,
  recalcular,
  trampas,
};

/** Para la pantalla: los esquemas en el orden en que se ofrecen. */
export { ESQUEMAS };
