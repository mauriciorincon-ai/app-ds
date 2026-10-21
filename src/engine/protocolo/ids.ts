// Protocolo DS (S8, ADR 020): los ids de las diez etapas y de los términos del glosario,
// sin nada más. Vive aparte para que la portada pueda contar las etapas (la puerta dice
// cuántas son) sin arrastrar el motor de la compuerta ni el contenido del modo a su chunk
// (tests/unit/portada-liviana.test.ts).

export const ETAPA_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export type EtapaId = (typeof ETAPA_IDS)[number];

/** Las etapas que abren hoy, seguidas desde la 1 (la compuerta no deja huecos). La portada y el
 *  encabezado lo dicen con estas cifras; `tests/unit/protocolo-contenido.test.ts` fija que
 *  coincide con las etapas construidas de `PROTOCOLO_DS`. */
export const ETAPAS_CONSTRUIDAS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
/** Los parámetros `{from}` y `{to}` de los textos que lo dicen. */
export const ETAPAS_ABIERTAS = {
  from: ETAPAS_CONSTRUIDAS[0],
  to: ETAPAS_CONSTRUIDAS[ETAPAS_CONSTRUIDAS.length - 1]!,
} as const;

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
  // S9 (etapa 4)
  "existe-al-decidir",
  "procedencia",
  "columna-identificador",
  "duplicado",
  "deriva",
  // S10 (etapa 5)
  "regla-de-hoy",
  "costo-esperado",
  // S11 (etapa 6)
  "particion-por-tiempo",
  "particion-por-grupo",
  "horizonte",
  "prueba-sellada",
  // S12 (etapa 7)
  "pliegue",
  "regla-un-error-estandar",
  "medida-de-seleccion",
  "prueba-de-permutacion",
  // S13 (etapa 8)
  "optimismo-de-la-seleccion",
  "segmento-con-soporte",
  "calibracion",
  "brier",
  // S14 (etapa 9)
  "beneficio-neto",
  "falsas-alarmas",
  "capacidad-de-atencion",
  // S15 (etapa 10)
  "ficha-del-modelo",
  "plan-de-vigilancia",
] as const;
export type TerminoId = (typeof TERMINO_IDS)[number];
