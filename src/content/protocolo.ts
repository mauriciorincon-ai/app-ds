// Protocolo DS (S8, VISION v2.0.0 § 8): el texto de cada etapa como DATO `{es, en}`,
// redactado en cada idioma. Las diez llevan título y criterio de salida (las que no están
// construidas se ven con él); las construidas suman su tarea y su porqué de tres líneas.
// Los huecos `{…}` del porqué se llenan con la trampa calculada en los datos del usuario.
// Paridad: tests/unit/protocolo-contenido.test.ts.
import type { Bilingual } from "@/content/modelos";
import type { EtapaId } from "@/engine/protocolo/ids";

export type ContenidoEtapa = {
  readonly titulo: Bilingual;
  /** Qué hace falta para que abra la siguiente, en palabras del usuario. */
  readonly criterio: Bilingual;
  /** Lo que la etapa te pide (solo las construidas). */
  readonly tarea?: Bilingual;
  /** Por qué existe la compuerta, en tres líneas (solo las construidas). */
  readonly porque?: Bilingual;
};

export const CONTENIDO_ETAPAS: Readonly<Record<EtapaId, ContenidoEtapa>> = {
  1: {
    titulo: {
      es: "La decisión y lo que cuesta equivocarse",
      en: "The decision and the cost of being wrong",
    },
    criterio: {
      es: "Una decisión escrita, quién la toma y el costo de cada error, mayor que cero.",
      en: "A written decision, who makes it, and the cost of each error, above zero.",
    },
  },
  2: {
    titulo: {
      es: "El objetivo y la unidad, con su momento",
      en: "The target and the unit, with its moment",
    },
    criterio: {
      es: "La columna objetivo coherente con tu decisión, qué es una fila y en qué momento se predice.",
      en: "A target column consistent with your decision, what one row is, and when the prediction is made.",
    },
  },
  3: {
    titulo: {
      es: "¿Predecir o explicar? Y el diseño",
      en: "Predict or explain? And the design",
    },
    criterio: {
      es: "La pregunta es predictiva, la ficha de diseño está escrita y la muestra alcanza, o escribiste el aviso.",
      en: "The question is predictive, the design sheet is written and the sample is enough, or you wrote the warning.",
    },
  },
  4: {
    titulo: {
      es: "¿Existe al decidir? Columna por columna",
      en: "Does it exist when you decide? Column by column",
    },
    criterio: {
      es: "Cada columna en «usar», «excluir» o «no sé»; las «no sé» no entrenan.",
      en: "Every column marked «use», «exclude» or «don't know»; the «don't know» ones don't train.",
    },
  },
  5: {
    titulo: {
      es: "La línea base sin modelo y la regla de hoy",
      en: "The baseline without a model and today's rule",
    },
    criterio: {
      es: "La línea base medida y registrada antes de abrir cualquier modelo.",
      en: "The baseline measured and recorded before any model is opened.",
    },
  },
  6: {
    titulo: {
      es: "La partición según tu caso, con la prueba sellada",
      en: "The split that fits your case, with the test set sealed",
    },
    criterio: {
      es: "Un esquema de partición justificado y la prueba intacta.",
      en: "A justified split scheme and the test set untouched.",
    },
  },
  7: {
    titulo: { es: "Probeta como instrumento", en: "Probeta as the instrument" },
    criterio: {
      es: "Un ganador comparado con la línea base, con la prueba todavía cerrada.",
      en: "A winner compared with the baseline, with the test set still closed.",
    },
  },
  8: {
    titulo: {
      es: "El error por segmento y la calibración",
      en: "Error by segment and calibration",
    },
    criterio: {
      es: "El peor segmento y la calibración, reportados.",
      en: "The worst segment and the calibration, reported.",
    },
  },
  9: {
    titulo: {
      es: "¿Sirve para la decisión?",
      en: "Does it serve the decision?",
    },
    criterio: {
      es: "Una decisión con números: usarlo, iterar o no usarlo.",
      en: "A decision with numbers: use it, iterate, or don't use it.",
    },
  },
  10: {
    titulo: {
      es: "La ficha del modelo y su vigilancia",
      en: "The model card and its monitoring",
    },
    criterio: {
      es: "La ficha completa y una persona responsable con nombre.",
      en: "The complete card and a named person in charge.",
    },
  },
};
