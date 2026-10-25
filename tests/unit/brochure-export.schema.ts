// COPIA LITERAL de `app-hoja-de-vida/src/lib/vitrina/schemas.ts`, el lector del contrato `brochure-export.json`
// v1.0.0 (la vitrina del portafolio), tomada el 2026-10-21 (S16). Vive aquí porque la CI de esta app no tiene el otro
// repo: así `tests/unit/brochure-export.test.ts` valida el export con el MISMO esquema que lo va a leer. No se
// edita a mano: si la vitrina lo cambia, se vuelve a copiar entero (el test lo compara con el original cuando
// ese repo está en el Mac). Todo lo que sigue a esta cabecera es el archivo original, sin tocar.

import { z } from "zod";

/**
 * Contrato `brochure-export.json` — schema v1.0.0 (S5, ADR-013).
 *
 * Los exports son LA VOZ DE CADA APP y **no se editan aquí** (regla dura 4 de la
 * orden): si uno está mal, se reporta a la planeadora y su app lo corrige. Este
 * schema valida FORMA, no vigencia — no puede saber si un valor sigue siendo
 * cierto; eso lo garantiza cada app midiendo al generar su export.
 *
 * Fuente canónica del formato: `portafolio/_template/contrato-brochure-export-v1.0.0.md`
 * (planeadora, RO), definido por app-dash-agent-ai el 2026-08-19.
 *
 * Las tres reglas duras que este schema hace mecánicas:
 *  1. `enlaces.produccion` y `enlaces.repositorio` SIEMPRE `null` — cero enlaces:
 *     la producción se MUESTRA, jamás se ENTREGA. La `razon` es lo que la vitrina
 *     pinta en su lugar (es contenido, no vacío).
 *  2. Toda métrica lleva su `fuente` — la honestidad del contrato llega al pixel.
 *  3. Los grupos suman exactamente `funcionalidades.total` (validación cruzada).
 */

const slug = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9-]+$/, "debe ser un slug kebab-case");

const fechaISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "debe ser una fecha AAAA-MM-DD");

/** Estado del brochure: "inicial" mientras describe la construcción cerrada;
 *  "sellado" cuando el gate de pruebas del usuario terminó. */
export const estadosApp = ["inicial", "sellado"] as const;

/** Las cuatro procedencias del contrato. Una cifra sin fuente no entra. */
export const fuentesMetrica = [
  "medido",
  "calculada",
  "declarado",
  "estimacion",
] as const;

const appSchema = z
  .object({
    slug,
    nombre: z.string().min(1),
    ciclo: z.string().min(1),
    estado: z.enum(estadosApp),
    // null hasta que el gate de pruebas del usuario termina.
    sellado_en: fechaISO.nullable(),
    sprints_cerrados: z.number().int().nonnegative(),
    version_repo: z.string().min(1),
  })
  .strict();

const promesaSchema = z
  .object({
    tagline: z.string().min(1),
    intro: z.string().min(1),
    para_quien: z.string().min(1),
    diferencial: z.string().min(1),
  })
  .strict();

const featureSchema = z
  .object({
    id: z.string().min(1),
    nombre: z.string().min(1),
    que_hace: z.string().min(1),
    // Contra qué sección del manual de su app se cuadró.
    seccion_manual: z.string().min(1),
  })
  .strict();

const grupoSchema = z
  .object({
    orden: z.number().int().positive(),
    // El grupo "estrella" es el diferencial de la app: la vitrina lo destaca.
    estrella: z.boolean(),
    nombre: z.string().min(1),
    linea: z.string().min(1),
    features: z.array(featureSchema).min(1),
  })
  .strict();

/** Las que se construyeron o planearon y NO existen. Se muestran para que nadie
 *  las cuente como pendientes ni como entregadas. */
const descartadaSchema = z
  .object({
    id: z.string().min(1),
    nombre: z.string().min(1),
    fecha: fechaISO,
    razon: z.string().min(1),
  })
  .strict();

const funcionalidadesSchema = z
  .object({
    total: z.number().int().nonnegative(),
    fuente_del_conteo: z.string().min(1),
    descartadas: z.array(descartadaSchema).default([]),
    grupos: z.array(grupoSchema).min(1),
  })
  .strict()
  // REGLA DURA: el total declarado es una afirmación hasta que cuadra con los
  // grupos. Un total desincronizado es un export que miente sobre sí mismo.
  .superRefine((f, ctx) => {
    const suma = f.grupos.reduce((acc, g) => acc + g.features.length, 0);
    if (suma !== f.total) {
      ctx.addIssue({
        code: "custom",
        path: ["total"],
        message: `total declarado ${f.total} ≠ ${suma} features en los grupos`,
      });
    }
  });

const metricaSchema = z
  .object({
    clave: z.string().min(1),
    etiqueta: z.string().min(1),
    valor: z.number(),
    unidad: z.string(),
    // REGLA DURA: sin `fuente` la cifra no entra (y la vitrina la pinta al lado).
    fuente: z.enum(fuentesMetrica),
    detalle: z.string().min(1),
  })
  .strict();

const stackItemSchema = z
  .object({ nombre: z.string().min(1), papel: z.string().min(1) })
  .strict();

/** `privacidad` es un MENÚ, no un molde: cada app declara solo los booleanos que
 *  puede AFIRMAR con verdad (los 6 exports usan 11 claves distintas entre sí).
 *  Por eso: `detalle` obligatorio + cualquier otra clave debe ser booleana. */
const privacidadSchema = z
  .object({ detalle: z.string().min(1) })
  .catchall(z.boolean());

const enlacesSchema = z
  .object({
    // REGLA DURA (cero enlaces): jamás una URL. `razon` es lo que se muestra.
    produccion: z.null(),
    razon: z.string().min(1),
    repositorio: z.null(),
    razon_repositorio: z.string().min(1),
    brochure_archivo: z.string().min(1),
    brochure_ruta_local: z.string().min(1),
  })
  .strict();

export const brochureExportSchema = z
  .object({
    // Bloque de documentación que viaja con el archivo: se conserva tal cual y
    // no es dato de la app, así que se acepta con forma libre.
    _schema: z.record(z.string(), z.unknown()).optional(),
    schema_version: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/, "debe ser semver del FORMATO"),
    actualizado: fechaISO,
    app: appSchema,
    promesa: promesaSchema,
    funcionalidades: funcionalidadesSchema,
    metricas: z.array(metricaSchema).min(1),
    stack: z.array(stackItemSchema).min(1),
    privacidad: privacidadSchema,
    enlaces: enlacesSchema,
  })
  .strict();

export type BrochureExport = z.infer<typeof brochureExportSchema>;
export type MetricaExport = z.infer<typeof metricaSchema>;
export type GrupoExport = z.infer<typeof grupoSchema>;
export type FuenteMetrica = (typeof fuentesMetrica)[number];

/** Mayor del formato que esta vitrina sabe renderizar. Un export con mayor
 *  distinto trae campos con OTRO significado: se rechaza en vez de adivinar. */
export const SCHEMA_MAYOR_SOPORTADO = 1;

export function versionCompatible(schemaVersion: string): boolean {
  const mayor = Number(schemaVersion.split(".")[0]);
  return mayor === SCHEMA_MAYOR_SOPORTADO;
}
