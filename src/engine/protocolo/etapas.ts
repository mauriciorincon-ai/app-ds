// Protocolo DS (S8, ADR 020): las etapas como DATO. Cada etapa declara si su criterio
// depende de los datos cargados (si la huella cambia, se re-verifica), qué pregunta, qué
// calcula el código, qué términos del glosario usa y —si está construida— cómo se lee lo que
// registra y cuál es su criterio de salida. El texto (título, tarea, criterio en palabras,
// porqué) vive en src/content/protocolo.ts como `{es, en}`; aquí solo hay ids y reglas.
//
// El criterio se RECALCULA siempre desde lo registrado (nunca se guarda un «cumple»): un
// cuaderno importado no puede declarar cumplida una etapa que no cumple.
import type { CsvTable } from "@/lib/ds/csv";
import type { EtapaId, TerminoId } from "./ids";

export { ETAPA_IDS, TERMINO_IDS } from "./ids";
export type { EtapaId, TerminoId } from "./ids";

/** Lo que una respuesta o un chequeo puede valer en el cuaderno (y en el archivo). */
export type Valor =
  | string
  | number
  | boolean
  | null
  | readonly string[]
  | Readonly<Record<string, number>>;

/** Lo que una etapa registra: lo que el usuario respondió y lo que el código calculó. */
export type DatosEtapa = {
  readonly respuestas: Readonly<Record<string, Valor>>;
  readonly chequeos: Readonly<Record<string, Valor>>;
};

/** El resultado del criterio de salida de una etapa. `faltan` y `razon` son ids que la UI
 *  traduce (`protocol.stage.<n>.missing.<id>` / `protocol.stage.<n>.stop.<id>`). */
export type Veredicto =
  | { readonly tipo: "cumple" }
  | { readonly tipo: "falta"; readonly faltan: readonly string[] }
  | { readonly tipo: "detenida"; readonly razon: string };

/** Lo que registraron las etapas anteriores ya cumplidas (por etapa). */
export type Previas = Readonly<Partial<Record<EtapaId, DatosEtapa>>>;

/** Una frase de «la trampa» que la etapa evitó, en los datos del usuario: una clave del
 *  diccionario (`protocol.stage.<n>.trap.<clave>`) y sus parámetros. El motor no escribe texto. */
export type Trampa = {
  readonly clave: string;
  readonly params: Readonly<Record<string, string | number>>;
};

/** Lectura de la forma de lo registrado: nombra el campo que no cuadra. */
export type Lectura =
  { readonly ok: true } | { readonly ok: false; readonly campo: string };

type Comun = {
  readonly id: EtapaId;
  /** El criterio usa los datos cargados: con otra huella, la etapa vuelve a «por verificar». */
  readonly dependeDeDatos: boolean;
  readonly terminos: readonly TerminoId[];
};

export type EtapaConstruida = Comun & {
  readonly construida: true;
  /** Ids de lo que la etapa pregunta (lo que el código no puede saber). */
  readonly preguntas: readonly string[];
  /** Ids de lo que el código calcula sobre los datos. */
  readonly chequeos: readonly string[];
  /** La forma de lo registrado (también al importar un cuaderno). */
  leer(datos: DatosEtapa): Lectura;
  /** El criterio de salida, recalculado desde lo registrado y las etapas previas. */
  criterio(datos: DatosEtapa, previas: Previas): Veredicto;
  /**
   * Solo las etapas cuyos chequeos salen de la TABLA cargada (y no de las respuestas): vuelve a
   * armar lo que esa etapa registraría hoy con esas mismas respuestas. La compuerta lo compara
   * con lo registrado, así que un cuaderno editado a mano —con la huella correcta pero
   * chequeos inventados— no pasa. Una etapa que lo declara tiene que depender de los datos.
   */
  recalcular?(
    datos: DatosEtapa,
    previas: Previas,
    tabla: CsvTable,
    /** La huella de esa tabla: la etapa 6 sella la prueba con ella (S11). */
    huella?: string | null,
  ): DatosEtapa;
  /**
   * Lo que la etapa evitó, calculado en los datos del usuario («en tus datos…»). `historia` son las
   * evidencias anteriores de esta misma etapa en el cuaderno (la etapa 6 cuenta los sellos, S11).
   */
  trampas(
    datos: DatosEtapa,
    previas: Previas,
    historia?: readonly DatosEtapa[],
  ): readonly Trampa[];
};

/** Una etapa sin construir se ve con su criterio, pero no abre ni registra. */
export type EtapaSinConstruir = Comun & { readonly construida: false };

export type DefinicionEtapa = EtapaConstruida | EtapaSinConstruir;

/** Las etapas en orden; la compuerta abre cada una solo con la anterior cumplida. */
export type DefinicionProtocolo = readonly DefinicionEtapa[];

/** Una etapa todavía sin construir, con sus términos. */
function sinConstruir(
  id: EtapaId,
  dependeDeDatos: boolean,
  terminos: readonly TerminoId[],
): EtapaSinConstruir {
  return { id, construida: false, dependeDeDatos, terminos };
}

/** Las diez etapas de la VISION v2.0.0 § 8. Las construidas reemplazan a su entrada. */
export const ETAPAS_BASE: Readonly<Record<EtapaId, DefinicionEtapa>> = {
  1: sinConstruir(1, false, ["decision", "costo-de-error", "umbral"]),
  2: sinConstruir(2, true, [
    "objetivo",
    "unidad-de-analisis",
    "momento-de-prediccion",
  ]),
  3: sinConstruir(3, true, [
    "predecir-o-explicar",
    "poblacion",
    "tamano-de-muestra",
  ]),
  4: sinConstruir(4, true, ["fuga-de-datos"]),
  5: sinConstruir(5, true, ["linea-base"]),
  6: sinConstruir(6, true, ["conjunto-de-prueba", "unidad-de-analisis"]),
  7: sinConstruir(7, true, ["validacion-cruzada", "linea-base"]),
  8: sinConstruir(8, true, ["conjunto-de-prueba"]),
  9: sinConstruir(9, true, ["umbral", "costo-de-error"]),
  10: sinConstruir(10, true, ["cuaderno"]),
};
