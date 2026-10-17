// Protocolo DS (S8, regla 20): el contenido del modo nace `{es, en}` con paridad. Cada etapa
// tiene título y criterio en los dos idiomas (las construidas, además, tarea y porqué); cada
// término del glosario, término y definición; cada estado, motivo y rechazo que la UI puede
// mostrar, su texto en los dos diccionarios.
import { describe, expect, it } from "vitest";
import { CONTENIDO_ETAPAS } from "@/content/protocolo";
import { GLOSARIO } from "@/content/glosario";
import type {
  EstadoEtapa,
  MotivoReverificar,
  RechazoRegistro,
} from "@/engine/protocolo/compuerta";
import { ETAPA_IDS, TERMINO_IDS } from "@/engine/protocolo/ids";
import { PROTOCOLO_DS } from "@/engine/protocolo/protocolo-ds";
import { translate } from "@/i18n/translate";
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
});
