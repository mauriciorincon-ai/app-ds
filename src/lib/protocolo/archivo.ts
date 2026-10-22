// Protocolo DS (S8, ADR 020): el cuaderno como archivo `.protocolo.json`, versionado. Es el
// respaldo del usuario (y la salida para la ventana privada, donde el navegador no guarda) y
// lo que se importa en otra máquina. Lo escribe `empaquetar` y lo lee `leerArchivo`; el mismo
// lector valida lo que vuelve de IndexedDB (`leerCuaderno`), porque también eso es un dato que
// cruza el tiempo.
//
// Rechazo NOMBRADO (patrón del manifiesto `.probeta.json`): un archivo que no es JSON, que no
// es un cuaderno, de otra versión o con un campo que no cuadra se rechaza diciendo cuál. La
// forma la valida zod; la coherencia (orden de las evidencias, a qué previas apuntan, la forma
// de lo que registró cada etapa) la valida este archivo con la definición del protocolo.
// `zod/mini`, no `zod`: la API funcional se desarma por módulos y la ruta /protocolo pesa ~85 KB
// menos (presupuesto de script de perf-budget.json; el zod completo traía todos los esquemas).
import * as z from "zod/mini";
import {
  APERTURAS_MAX,
  CUADERNO_VERSION,
  type Cuaderno,
} from "@/engine/protocolo/cuaderno";
import {
  ETAPA_IDS,
  type DefinicionProtocolo,
  type EtapaId,
} from "@/engine/protocolo/etapas";

export const PROTOCOL_FILE_FORMAT = "protocolo-ds";
export const PROTOCOL_FILE_VERSION = 1;
export const PROTOCOL_FILE_EXTENSION = ".protocolo.json";
/** Un cuaderno son respuestas y conteos: 2 MB es holgado y corta un archivo equivocado. */
export const MAX_PROTOCOL_FILE_BYTES = 2 * 1024 * 1024;

const HEX64 = /^[0-9a-f]{64}$/;
/** La clave de una etapa en `base`: el id de una etapa que existe, escrito sin ceros ni signos (S16, S8 B6: antes un regex cableado a 10). */
export const claveDeEtapa = (s: string) =>
  (ETAPA_IDS as readonly number[]).includes(Number(s)) && String(Number(s)) === s;

const hex64 = () => z.string().check(z.regex(HEX64));
const entero = () => z.int();

const valor = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string()),
  z.record(z.string(), z.number()),
]);

const datosEtapa = z.strictObject({
  respuestas: z.record(z.string(), valor),
  chequeos: z.record(z.string(), valor),
});

const evidencia = z.strictObject({
  seq: entero().check(z.positive()),
  etapa: entero().check(
    z.refine((n) => (ETAPA_IDS as readonly number[]).includes(n)),
  ),
  fecha: z.iso.datetime(),
  huella: z.nullable(hex64()),
  base: z.record(
    z.string().check(z.refine(claveDeEtapa)),
    entero().check(z.positive()),
  ),
  datos: datosEtapa,
});

const carga = z.strictObject({
  fecha: z.iso.datetime(),
  sha256: hex64(),
  nombre: z.string().check(z.maxLength(260)),
  filas: entero().check(z.nonnegative()),
  columnas: entero().check(z.nonnegative()),
});

// S13: las aperturas de la prueba sellada. Opcional: un cuaderno de antes no las trae y se sigue leyendo.
const apertura = z.strictObject({
  fecha: z.iso.datetime(),
  huella: hex64(),
  clave: hex64(),
});

const cuadernoSchema = z.strictObject({
  version: z.literal(CUADERNO_VERSION),
  creado: z.iso.datetime(),
  cargas: z.array(carga),
  evidencias: z.array(evidencia),
  aperturas: z.optional(z.array(apertura).check(z.maxLength(APERTURAS_MAX))),
});

const archivoSchema = z.strictObject({
  formato: z.literal(PROTOCOL_FILE_FORMAT),
  version: z.literal(PROTOCOL_FILE_VERSION),
  exportado: z.iso.datetime(),
  cuaderno: cuadernoSchema,
});

export type RechazoArchivo =
  | { readonly tipo: "file-too-large"; readonly bytes: number }
  | { readonly tipo: "invalid-json" }
  | { readonly tipo: "invalid-format"; readonly campo: string }
  | { readonly tipo: "unsupported-version"; readonly version: string };

export type LecturaArchivo =
  | { readonly ok: true; readonly cuaderno: Cuaderno }
  | { readonly ok: false; readonly rechazo: RechazoArchivo };

/** `["cuaderno","evidencias",2,"fecha"]` → `cuaderno.evidencias[2].fecha`. */
function ruta(partes: readonly PropertyKey[]): string {
  // S16 (S8 B3): una clave inventada no se repite entera en el mensaje (un archivo editado puede traerla de megas)
  const nombre = (p: PropertyKey) => {
    const s = String(p);
    return s.length > 60 ? `${s.slice(0, 60)}…` : s;
  };
  return partes.reduce<string>((acc, parte) => {
    if (typeof parte === "number") return `${acc}[${parte}]`;
    return acc ? `${acc}.${nombre(parte)}` : nombre(parte);
  }, "");
}

function primerCampo(
  error: { readonly issues: readonly z.core.$ZodIssue[] },
  prefijo: readonly PropertyKey[],
): string {
  const issue = error.issues[0]!;
  const extra = issue.code === "unrecognized_keys" ? [issue.keys[0] ?? ""] : [];
  return ruta([...prefijo, ...issue.path, ...extra]);
}

/** Lo que zod no ve: el orden, las referencias y la forma de cada etapa. */
function coherencia(
  cuaderno: Cuaderno,
  protocolo: DefinicionProtocolo,
  prefijo: string,
): string | null {
  const vistas = new Map<number, EtapaId>();
  for (const [i, ev] of cuaderno.evidencias.entries()) {
    const campo = (c: string) => `${prefijo}evidencias[${i}].${c}`;
    if (ev.seq !== i + 1) return campo("seq");
    const etapa = protocolo.find((e) => e.id === ev.etapa);
    if (!etapa || !etapa.construida) return campo("etapa");
    if (etapa.dependeDeDatos !== (ev.huella !== null)) return campo("huella");
    for (const [clave, seq] of Object.entries(ev.base)) {
      const previa = Number(clave) as EtapaId;
      if (previa >= ev.etapa || seq >= ev.seq || vistas.get(seq) !== previa)
        return campo("base");
    }
    const lectura = etapa.leer(ev.datos);
    if (!lectura.ok) return campo(`datos.${lectura.campo}`);
    vistas.set(ev.seq, ev.etapa);
  }
  return null;
}

/** Valida un cuaderno ya parseado (lo que devuelve IndexedDB, o el de un archivo). */
export function leerCuaderno(
  valor: unknown,
  protocolo: DefinicionProtocolo,
): LecturaArchivo {
  const forma = cuadernoSchema.safeParse(valor);
  if (!forma.success)
    return {
      ok: false,
      rechazo: { tipo: "invalid-format", campo: primerCampo(forma.error, []) },
    };
  const cuaderno = forma.data as Cuaderno;
  const campo = coherencia(cuaderno, protocolo, "");
  if (campo) return { ok: false, rechazo: { tipo: "invalid-format", campo } };
  return { ok: true, cuaderno };
}

/** Lee un `.protocolo.json`. `bytes` es el tamaño del archivo (se mide antes de leerlo). */
export function leerArchivo(
  texto: string,
  protocolo: DefinicionProtocolo,
  bytes: number = new TextEncoder().encode(texto).length,
): LecturaArchivo {
  if (bytes > MAX_PROTOCOL_FILE_BYTES)
    return { ok: false, rechazo: { tipo: "file-too-large", bytes } };
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return { ok: false, rechazo: { tipo: "invalid-json" } };
  }
  if (typeof crudo !== "object" || crudo === null || Array.isArray(crudo))
    return { ok: false, rechazo: { tipo: "invalid-format", campo: "formato" } };
  const registro = crudo as Record<string, unknown>;
  if (registro.formato !== PROTOCOL_FILE_FORMAT)
    return { ok: false, rechazo: { tipo: "invalid-format", campo: "formato" } };
  if (registro.version !== PROTOCOL_FILE_VERSION)
    return {
      ok: false,
      rechazo: {
        tipo: "unsupported-version",
        version: String(registro.version).slice(0, 20),
      },
    };
  const forma = archivoSchema.safeParse(crudo);
  if (!forma.success)
    return {
      ok: false,
      rechazo: { tipo: "invalid-format", campo: primerCampo(forma.error, []) },
    };
  const cuaderno = forma.data.cuaderno as Cuaderno;
  const campo = coherencia(cuaderno, protocolo, "cuaderno.");
  if (campo) return { ok: false, rechazo: { tipo: "invalid-format", campo } };
  return { ok: true, cuaderno };
}

/** El archivo que baja el usuario (JSON legible, con fecha de exportación). */
export function empaquetar(cuaderno: Cuaderno, ahora: Date): string {
  return `${JSON.stringify(
    {
      formato: PROTOCOL_FILE_FORMAT,
      version: PROTOCOL_FILE_VERSION,
      exportado: ahora.toISOString(),
      cuaderno,
    },
    null,
    2,
  )}\n`;
}
