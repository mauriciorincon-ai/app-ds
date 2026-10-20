// Protocolo DS (S8, regla 20): el contenido del modo nace `{es, en}` con paridad. Cada etapa
// tiene título y criterio en los dos idiomas (las construidas, además, tarea y porqué); cada
// término del glosario, término y definición; cada estado, motivo y rechazo que la UI puede
// mostrar, su texto en los dos diccionarios.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTENIDO_ETAPAS } from "@/content/protocolo";
import { GLOSARIO } from "@/content/glosario";
import type {
  EstadoEtapa,
  MotivoReverificar,
  RechazoRegistro,
} from "@/engine/protocolo/compuerta";
import { CLAVES_1 } from "@/engine/protocolo/etapa1";
import { CLAVES_2 } from "@/engine/protocolo/etapa2";
import { CLAVES_3 } from "@/engine/protocolo/etapa3";
import { CLAVES_4, TRAMPAS_4 } from "@/engine/protocolo/etapa4";
import { CLAVES_5, TRAMPAS_5 } from "@/engine/protocolo/etapa5";
import { CLAVES_6, TRAMPAS_6 } from "@/engine/protocolo/etapa6";
import { CLAVES_7, FALTAS_7, TRAMPAS_7 } from "@/engine/protocolo/etapa7";
import { CLAVES_8, FALTAS_8, TRAMPAS_8 } from "@/engine/protocolo/etapa8";
import { CLAVES_9, FALTAS_9, TRAMPAS_9 } from "@/engine/protocolo/etapa9";
import {
  ETAPA_IDS,
  ETAPAS_ABIERTAS,
  ETAPAS_CONSTRUIDAS,
  TERMINO_IDS,
} from "@/engine/protocolo/ids";
import { PROTOCOLO_DS } from "@/engine/protocolo/protocolo-ds";
import { TEXTOS_ETAPA_4 } from "@/components/protocolo/textos/etapa4";
import { TEXTOS_ETAPA_5 } from "@/components/protocolo/textos/etapa5";
import { TEXTOS_ETAPA_6 } from "@/components/protocolo/textos/etapa6";
import { TEXTOS_ETAPA_7 } from "@/components/protocolo/textos/etapa7";
import { TEXTOS_ETAPA_8 } from "@/components/protocolo/textos/etapa8";
import { TEXTOS_ETAPA_9 } from "@/components/protocolo/textos/etapa9";
import { resolve, translate } from "@/i18n/translate";
import type { RechazoArchivo } from "@/lib/protocolo/archivo";
import { avisoDeRechazoArchivo } from "@/lib/protocolo/useProtocolo";

const IDIOMAS = ["es", "en"] as const;

/** Anclas del glosario de Google verificadas contra la página el 2026-10-17. */
const ANCLAS_GOOGLE = new Set([
  "false-positive-fp",
  "false-negative-fn",
  "classification-threshold",
  "quantile",
  "label",
  "class-imbalanced-dataset",
  "r-squared",
  "baseline",
  "test-set",
  "cross-validation",
]);

const ESTADOS: EstadoEtapa["tipo"][] = [
  "cerrada",
  "abierta",
  "cumplida",
  "por-verificar",
  "detenida",
  "no-construida",
];
const MOTIVOS: MotivoReverificar[] = [
  "sin-datos",
  "datos-distintos",
  "anterior-cambio",
  "no-cuadra",
];
const RECHAZOS: RechazoRegistro["tipo"][] = [
  "etapa-desconocida",
  "no-construida",
  "etapa-cerrada",
  "sin-datos",
  "datos-invalidos",
  "criterio-no-cumplido",
];
const ARCHIVO: RechazoArchivo[] = [
  { tipo: "file-too-large", bytes: 1 },
  { tipo: "invalid-json" },
  { tipo: "invalid-format", campo: "x" },
  { tipo: "unsupported-version", version: "2" },
];

describe("contenido del Protocolo {es, en}", () => {
  it("las etapas que la portada y el encabezado dicen que abren son las que PROTOCOLO_DS construye", () => {
    const construidas = PROTOCOLO_DS.filter((e) => e.construida).map(
      (e) => e.id,
    );
    expect([...ETAPAS_CONSTRUIDAS]).toEqual(construidas);
    // seguidas desde la 1: el rango «de la {from} a la {to}» no esconde un hueco
    expect(construidas).toEqual(
      ETAPA_IDS.filter((id) => id <= ETAPAS_ABIERTAS.to),
    );
    for (const lang of ["es", "en"] as const)
      for (const clave of ["start.protocol.desc", "protocol.subtitle"])
        expect(
          translate(lang, clave, { count: 10, ...ETAPAS_ABIERTAS }),
        ).toMatch(new RegExp(`${ETAPAS_ABIERTAS.from}.*${ETAPAS_ABIERTAS.to}`));
  });

  it("cada etapa tiene título y criterio en los dos idiomas; las construidas, tarea y porqué", () => {
    for (const id of ETAPA_IDS) {
      const c = CONTENIDO_ETAPAS[id];
      for (const l of IDIOMAS) {
        expect(c.titulo[l].trim(), `etapa ${id} título ${l}`).not.toBe("");
        expect(c.criterio[l].trim(), `etapa ${id} criterio ${l}`).not.toBe("");
      }
      const etapa = PROTOCOLO_DS.find((e) => e.id === id)!;
      if (etapa.construida)
        for (const l of IDIOMAS) {
          expect(c.tarea?.[l].trim(), `etapa ${id} tarea ${l}`).toBeTruthy();
          expect(c.porque?.[l].trim(), `etapa ${id} porqué ${l}`).toBeTruthy();
        }
    }
  });

  it("cada término tiene entrada en los dos idiomas, y su ancla de Google fue verificada", () => {
    for (const id of TERMINO_IDS) {
      const entrada = GLOSARIO[id];
      for (const l of IDIOMAS) {
        expect(entrada.termino[l].trim(), `${id} ${l}`).not.toBe("");
        expect(entrada.definicion[l].trim(), `${id} ${l}`).not.toBe("");
      }
      if (entrada.google)
        expect(ANCLAS_GOOGLE.has(entrada.google), id).toBe(true);
    }
  });

  it("los términos que usan las etapas existen en el glosario", () => {
    for (const etapa of PROTOCOLO_DS)
      for (const id of etapa.terminos)
        expect(TERMINO_IDS, `etapa ${etapa.id}`).toContain(id);
  });

  it("cada estado, motivo y rechazo que la UI muestra tiene su texto", () => {
    const claves = [
      ...ESTADOS.map((e) => `protocol.status.${e}`),
      ...MOTIVOS.map((m) => `protocol.stage.reverify.${m}`),
      ...RECHAZOS.map((r) => `protocol.stage.rejected.${r}`),
      ...ARCHIVO.map((r) => avisoDeRechazoArchivo(r).clave),
    ];
    for (const l of IDIOMAS)
      for (const clave of claves)
        expect(translate(l, clave), `${l} ${clave}`).not.toBe(clave);
  });

  it("cada campo que una etapa puede registrar tiene su etiqueta en el cuaderno, en los dos idiomas", () => {
    const etapas = {
      1: CLAVES_1,
      2: CLAVES_2,
      3: CLAVES_3,
      4: CLAVES_4,
      5: CLAVES_5,
      6: CLAVES_6,
      7: CLAVES_7,
      8: CLAVES_8,
      9: CLAVES_9,
    } as const;
    // S13: desde la etapa 4 las etiquetas viajan con la forma (messages/etapas/), no con la página
    const DE_LA_FORMA: Record<string, typeof TEXTOS_ETAPA_4> = {
      4: TEXTOS_ETAPA_4,
      5: TEXTOS_ETAPA_5,
      6: TEXTOS_ETAPA_6,
      7: TEXTOS_ETAPA_7,
      8: TEXTOS_ETAPA_8,
      9: TEXTOS_ETAPA_9,
    };
    const etiquetaFalta = (l: "es" | "en", n: string, clave: string) => {
      const propio = DE_LA_FORMA[n];
      return propio
        ? resolve(propio[l], clave) === clave
        : translate(l, clave) === clave;
    };
    const faltan: string[] = [];
    for (const [n, claves] of Object.entries(etapas))
      for (const l of IDIOMAS) {
        for (const id of claves.respuestas)
          if (etiquetaFalta(l, n, `protocol.stage.${n}.field.${id}`))
            faltan.push(`${l} etapa ${n} respuesta ${id}`);
        for (const id of claves.chequeos)
          if (etiquetaFalta(l, n, `protocol.stage.${n}.check.${id}`))
            faltan.push(`${l} etapa ${n} chequeo ${id}`);
      }
    expect(faltan, "campos sin etiqueta").toEqual([]);
  });

  it("cada motivo de falta y de parada de las etapas construidas tiene su texto", () => {
    const faltas = {
      1: ["decision", "decisor", "forma", "unidad", "costos", "chequeos"],
      2: [
        "objetivo",
        "tarea",
        "positivo",
        "costos",
        "unidad",
        "momento",
        "fecha",
        "etapa1",
      ],
      3: [
        "poblacion",
        "exclusiones",
        "periodo",
        "parametros",
        "r2",
        "muestra",
        "chequeos",
        "etapas-previas",
      ],
      4: [
        "etapas-previas",
        "nombres-columnas",
        "apuesta",
        "estado",
        "despues-excluir",
        "nose-usar",
        "usar-sin-antes",
        "procedencia",
        "bloque",
      ],
      5: [
        "etapas-previas",
        "referencias",
        "regla",
        "regla-condicion",
        "regla-union",
        "regla-columna",
        "regla-operador",
        "regla-valor",
        "regla-salida",
        "regla-salida-numero",
        "regla-medida",
      ],
      6: [
        "etapas-previas",
        "unidades",
        "esquema",
        "razon",
        "tamano",
        "horizonte",
        "lado-vacio",
        "sin-nuevas",
        "clases-lado",
        "solape",
      ],
      7: FALTAS_7,
      8: FALTAS_8,
      9: FALTAS_9,
    } as const;
    const paradas = { 2: ["sin-objetivo"], 3: ["causal"] } as const;
    const sin: string[] = [];
    for (const l of IDIOMAS) {
      for (const [n, ids] of Object.entries(faltas))
        for (const id of ids)
          if (
            translate(l, `protocol.stage.${n}.missing.${id}`) ===
            `protocol.stage.${n}.missing.${id}`
          )
            sin.push(`${l} ${n} falta ${id}`);
      for (const [n, ids] of Object.entries(paradas))
        for (const id of ids)
          if (
            translate(l, `protocol.stage.${n}.stop.${id}`) ===
            `protocol.stage.${n}.stop.${id}`
          )
            sin.push(`${l} ${n} parada ${id}`);
    }
    expect(sin).toEqual([]);
  });

  it("cada trampa que una etapa puede mostrar tiene su frase, y el porcentaje en español lleva espacio no separable", () => {
    const trampas = {
      1: [
        "umbral",
        "umbral-alto",
        "umbral-igual",
        "costos",
        "costos-iguales",
        "cuantil",
        "cuantil-bajo",
        "cuantil-igual",
      ],
      2: [
        "unidad-fila",
        "unidad-repetida",
        "unidad-unica",
        "tasa-base",
        "mayoria",
        "costo-binaria",
        "costo-mayoria",
        "costo-constante",
      ],
      3: ["causal", "muestra-alcanza", "muestra-corta", "periodo"],
      4: TRAMPAS_4,
      5: TRAMPAS_5,
      6: TRAMPAS_6,
      7: TRAMPAS_7,
      8: TRAMPAS_8,
      9: TRAMPAS_9,
    } as const;
    const sin: string[] = [];
    for (const l of IDIOMAS)
      for (const [n, ids] of Object.entries(trampas))
        for (const id of ids) {
          const clave = `protocol.stage.${n}.trap.${id}`;
          const texto = translate(l, clave);
          if (texto === clave) sin.push(`${l} ${clave}`);
          if (l === "es" && /\d\}? ?%|\} %/.test(texto.replace(/\u00a0%/g, "")))
            sin.push(`${l} ${clave}: el % va tras un espacio no separable`);
        }
    expect(sin).toEqual([]);
    for (const criterio of [
      "contraccion",
      "optimismo",
      "riesgo-medio",
      "varianza",
      "media",
    ])
      for (const l of IDIOMAS)
        expect(translate(l, `protocol.criterion.${criterio}`)).not.toBe(
          `protocol.criterion.${criterio}`,
        );
  });

  it("ningún texto del Protocolo escribe una cifra con coma decimal (R9: punto decimal en los dos idiomas)", () => {
    const planos = (valor: unknown): string[] =>
      typeof valor === "string"
        ? [valor]
        : valor && typeof valor === "object"
          ? Object.values(valor).flatMap(planos)
          : [];
    const textos = [
      ...planos(CONTENIDO_ETAPAS),
      ...planos(GLOSARIO),
      ...[
        TEXTOS_ETAPA_4,
        TEXTOS_ETAPA_5,
        TEXTOS_ETAPA_6,
        TEXTOS_ETAPA_7,
        TEXTOS_ETAPA_8,
        TEXTOS_ETAPA_9,
      ].flatMap((t) => IDIOMAS.flatMap((l) => planos(t[l]))),
      ...IDIOMAS.flatMap((l) =>
        planos(
          (
            JSON.parse(readFileSync(`messages/${l}.json`, "utf8")) as {
              protocol: unknown;
            }
          ).protocol,
        ),
      ),
    ];
    expect(textos.filter((texto) => /\d,\d/.test(texto))).toEqual([]);
  });
});
