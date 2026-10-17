// Protocolo DS (S8, ADR 020): los ids de las diez etapas y de los términos del glosario,
// sin nada más. Vive aparte para que la portada pueda contar las etapas (la puerta dice
// cuántas son) sin arrastrar el motor de la compuerta ni el contenido del modo a su chunk
// (tests/unit/portada-liviana.test.ts).

export const ETAPA_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export type EtapaId = (typeof ETAPA_IDS)[number];

/** Los términos que las compuertas enlazan; cada uno tiene su entrada en
 *  src/content/glosario.ts (la paridad la exige el tipo y tests/unit/protocolo-contenido). */
export const TERMINO_IDS = [
  "decision",
  "costo-de-error",
  "falso-positivo",
  "falso-negativo",
  "umbral",
  "cuantil",
  "objetivo",
  "unidad-de-analisis",
  "momento-de-prediccion",
  "tasa-base",
  "desbalance",
  "fuga-de-datos",
  "predecir-o-explicar",
  "poblacion",
  "tamano-de-muestra",
  "contraccion",
  "r2",
  "linea-base",
  "conjunto-de-prueba",
  "validacion-cruzada",
  "compuerta",
  "cuaderno",
  "huella",
] as const;
export type TerminoId = (typeof TERMINO_IDS)[number];
