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
    tarea: {
      es: "Escribe qué decisión cambia con el modelo, quién la toma y cuándo; cómo es (sí o no, elegir entre varias opciones, o cuánto) y cuánto cuesta cada error, en tu unidad.",
      en: "Write down which decision the model changes, who makes it and when; what shape it has (yes or no, choosing among options, or how much) and what each kind of error costs, in your unit.",
    },
    porque: {
      es: "Un modelo sin decisión no tiene para qué existir: lo que vale es lo que cambia en la decisión.\nLos dos errores casi nunca cuestan lo mismo, y la métrica de siempre supone que sí.\nCon tus costos salen el umbral o el cuantil que de verdad te convienen.",
      en: "A model with no decision has no reason to exist: what matters is what changes in the decision.\nThe two errors almost never cost the same, and the usual metric assumes they do.\nYour costs give the threshold or quantile that actually suits you.",
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
    tarea: {
      es: "Elige la columna que quieres predecir, qué es una fila (cada fila, o una columna que identifica la unidad) y en qué momento se hace la predicción (una columna de fecha, o escríbelo).",
      en: "Pick the column you want to predict, what one row is (each row, or a column that identifies the unit) and when the prediction is made (a date column, or write it).",
    },
    porque: {
      es: "Si la misma unidad aparece en varias filas, repartirlas al azar entre entrenar y probar filtra información.\nQuien predice tiene que saber en qué momento decide: lo que ocurre después no puede entrar al modelo.\nSin saber cuánto cuesta no hacer nada, no se sabe si el modelo aporta algo.",
      en: "If the same unit appears in several rows, splitting them at random between training and testing leaks information.\nWhoever predicts has to know when they decide: what happens later can't enter the model.\nWithout knowing what doing nothing costs, you can't tell whether the model adds anything.",
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
    tarea: {
      es: "Dinos si buscas predecir o explicar una causa. Si es predecir, escribe la población, el periodo y las exclusiones, y mira si tus filas alcanzan para el número de variables candidatas.",
      en: "Tell us whether you want to predict or to explain a cause. If it's predicting, write the population, the period and the exclusions, and see whether your rows are enough for the number of candidate variables.",
    },
    porque: {
      es: "Un modelo que predice bien no dice qué pasaría si cambias algo: eso exige un experimento.\nLa población y el periodo dicen a quién se puede aplicar el modelo y a quién no.\nCon pocas filas y muchas variables, el modelo aprende ruido y falla en datos nuevos.",
      en: "A model that predicts well doesn't say what would happen if you changed something: that takes an experiment.\nThe population and the period say who the model can be applied to and who it can't.\nWith few rows and many variables, the model learns noise and fails on new data.",
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
    tarea: {
      es: "Apuesta qué columnas crees que filtran el resultado. Luego mira lo que encontró la app (fuga, identificadores, filas repetidas, cambios entre periodos) y, columna por columna, di quién la produce, si existe cuando se decide y si la usas.",
      en: "Bet which columns you think leak the outcome. Then see what the app found (leakage, identifiers, repeated rows, changes between periods) and, column by column, say who produces it, whether it exists when you decide, and whether you use it.",
    },
    porque: {
      es: "Una columna que se llena después del resultado hace que el modelo se vea genial en tus datos y falle en la vida real.\nApostar antes de ver te enseña dónde se te escapa la fuga: la comparación queda en tu cuaderno.\nLo que no sabes cuándo se llena no entrena: «no sé» nunca entra al modelo.",
      en: "A column filled in after the outcome makes the model look great on your data and fail in real life.\nBetting before you look shows you where leakage slips past you: the comparison is kept in your notebook.\nWhat you don't know when it's filled in doesn't train: «don't know» never enters the model.",
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
    tarea: {
      es: "Mira lo que ya se logra sin modelo, en la moneda de tu decisión. Luego escribe la regla que tu gente aplica hoy (hasta dos condiciones sobre las columnas que dejaste en «usar») o di que no hay ninguna, y la app la mide en tus filas.",
      en: "See what you already get without a model, in the currency of your decision. Then write the rule your people apply today (up to two conditions on the columns you left in «use») or say there is none, and the app measures it on your rows.",
    },
    porque: {
      es: "Sin saber qué se logra sin modelo, cualquier número de un modelo parece bueno.\nLa regla de hoy es el rival real: si el modelo no la supera, no hay para qué cambiarla.\nEs una referencia sobre todas tus filas; la etapa 8 la vuelve a medir sobre la prueba.",
      en: "Without knowing what you get with no model, any model number looks good.\nToday's rule is the real rival: if the model doesn't beat it, there is no reason to replace it.\nIt is a reference over all your rows; stage 8 measures it again on the test set.",
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
