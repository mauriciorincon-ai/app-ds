// Protocolo DS (S8): el glosario que enlazan las compuertas. Definiciones PROPIAS, breves,
// redactadas en cada idioma (regla 20: no traducidas). Donde el glosario de aprendizaje
// automático de Google tiene la entrada, «leer más» lleva a ella con su atribución (contenido
// CC BY 4.0); su texto no se copia. Las anclas se verificaron contra la página el 2026-10-17.
// Paridad (todos los términos, los dos idiomas): tests/unit/protocolo-contenido.test.ts.
import type { TerminoId } from "@/engine/protocolo/ids";
import type { Bilingual } from "@/content/modelos";

export type EntradaGlosario = {
  readonly termino: Bilingual;
  readonly definicion: Bilingual;
  /** Ancla en el glosario de Google (`#…`), si la entrada existe allí. */
  readonly google?: string;
};

export const GOOGLE_GLOSARIO = {
  es: "https://developers.google.com/machine-learning/glossary?hl=es",
  en: "https://developers.google.com/machine-learning/glossary",
} as const;

export const GLOSARIO: Readonly<Record<TerminoId, EntradaGlosario>> = {
  decision: {
    termino: { es: "Decisión", en: "Decision" },
    definicion: {
      es: "Lo que alguien hará distinto según lo que diga el modelo: aprobar un crédito, llamar a un cliente, pedir más inventario. Sin una decisión que cambie, un modelo no tiene para qué existir.",
      en: "What someone will do differently depending on what the model says: approve a loan, call a customer, order more stock. If no decision changes, a model has no reason to exist.",
    },
  },
  "costo-de-error": {
    termino: { es: "Costo de un error", en: "Cost of an error" },
    definicion: {
      es: "Lo que pierdes cada vez que el modelo se equivoca en una dirección, medido en algo tuyo (dinero, horas, clientes). Los dos errores casi nunca cuestan lo mismo.",
      en: "What you lose each time the model is wrong in one direction, measured in something of yours (money, hours, customers). The two kinds of error almost never cost the same.",
    },
  },
  "falso-positivo": {
    termino: { es: "Falso positivo", en: "False positive" },
    definicion: {
      es: "El modelo dice «sí, actúa» y no hacía falta: una alarma que no era.",
      en: "The model says «yes, act» and it wasn't needed: an alarm that wasn't real.",
    },
    google: "false-positive-fp",
  },
  "falso-negativo": {
    termino: { es: "Falso negativo", en: "False negative" },
    definicion: {
      es: "El modelo dice «no hace falta» y sí hacía falta: el caso que se escapó.",
      en: "The model says «no need» and there was a need: the case that slipped through.",
    },
    google: "false-negative-fn",
  },
  umbral: {
    termino: { es: "Umbral", en: "Threshold" },
    definicion: {
      es: "La probabilidad a partir de la cual actúas. Con tus costos sale una cifra concreta; usar 0,5 por costumbre supone que los dos errores cuestan igual.",
      en: "The probability above which you act. Your costs give a specific number; using 0.5 out of habit assumes both errors cost the same.",
    },
    google: "classification-threshold",
  },
  cuantil: {
    termino: { es: "Cuantil", en: "Quantile" },
    definicion: {
      es: "El valor que deja por debajo una proporción dada de los casos. Si quedarte corto cuesta más que pasarte, conviene estimar un cuantil alto, no el promedio.",
      en: "The value below which a given share of cases falls. If falling short costs more than overshooting, you should estimate a high quantile, not the average.",
    },
    google: "quantile",
  },
  objetivo: {
    termino: { es: "Objetivo", en: "Target" },
    definicion: {
      es: "La columna con lo que quieres predecir, tal como se conoce después del hecho.",
      en: "The column with what you want to predict, as it is known after the fact.",
    },
    google: "label",
  },
  "unidad-de-analisis": {
    termino: { es: "Unidad de análisis", en: "Unit of analysis" },
    definicion: {
      es: "Qué es una fila: un cliente, una visita, un mes de una tienda. Si la misma unidad aparece en varias filas, no se puede repartir al azar entre entrenar y probar.",
      en: "What one row is: a customer, a visit, a month of one store. If the same unit appears in several rows, it can't be split at random between training and testing.",
    },
  },
  "momento-de-prediccion": {
    termino: { es: "Momento de la predicción", en: "Prediction moment" },
    definicion: {
      es: "El instante en que se toma la decisión. Solo vale como variable lo que ya se sabía en ese instante.",
      en: "The moment the decision is made. Only what was already known at that moment can be used as a variable.",
    },
  },
  "tasa-base": {
    termino: { es: "Tasa base", en: "Base rate" },
    definicion: {
      es: "Con qué frecuencia ocurre el caso en tus datos, sin modelo. Es la vara contra la que se mide todo lo demás.",
      en: "How often the case happens in your data, without a model. It is the yardstick everything else is measured against.",
    },
  },
  desbalance: {
    termino: { es: "Desbalance", en: "Imbalance" },
    definicion: {
      es: "Cuando una clase es mucho más rara que las otras. Una exactitud alta puede no decir nada: basta con adivinar siempre la clase común.",
      en: "When one class is much rarer than the others. A high accuracy can mean nothing: always guessing the common class is enough.",
    },
    google: "class-imbalanced-dataset",
  },
  "fuga-de-datos": {
    termino: { es: "Fuga de datos", en: "Data leakage" },
    definicion: {
      es: "Información que el modelo ve al entrenar y no tendría al decidir: una columna que se llena después del resultado, o casos de prueba que se cuelan en el entrenamiento. Da puntajes que no se repiten en la vida real.",
      en: "Information the model sees while training and wouldn't have when deciding: a column filled in after the outcome, or test cases leaking into training. It gives scores that don't hold up in real life.",
    },
  },
  "predecir-o-explicar": {
    termino: { es: "Predecir o explicar", en: "Predict or explain" },
    definicion: {
      es: "Predecir es anticipar qué pasará; explicar es saber qué lo causa. Un modelo predictivo no dice qué pasaría si cambias algo: para eso hace falta un experimento.",
      en: "Predicting is anticipating what will happen; explaining is knowing what causes it. A predictive model doesn't tell you what would happen if you changed something: that takes an experiment.",
    },
  },
  poblacion: {
    termino: { es: "Población", en: "Population" },
    definicion: {
      es: "Los casos a los que se aplicará el modelo. Si tus datos son de otra población, el resultado no se traslada.",
      en: "The cases the model will be applied to. If your data come from another population, the result doesn't carry over.",
    },
  },
  "tamano-de-muestra": {
    termino: { es: "Tamaño de muestra", en: "Sample size" },
    definicion: {
      es: "Cuántas filas hacen falta para que el modelo no aprenda ruido, según cuántas variables candidatas tienes y qué tan frecuente es el caso.",
      en: "How many rows you need so the model doesn't learn noise, given how many candidate variables you have and how common the case is.",
    },
  },
  contraccion: {
    termino: { es: "Contracción", en: "Shrinkage" },
    definicion: {
      es: "Cuánto habría que achicar las predicciones de un modelo para que no sean demasiado extremas en datos nuevos. Pedir que valga al menos 0,9 es pedir poco sobreajuste.",
      en: "How much a model's predictions would have to be pulled in so they aren't too extreme on new data. Asking for at least 0.9 is asking for little overfitting.",
    },
  },
  r2: {
    termino: { es: "R²", en: "R²" },
    definicion: {
      es: "Qué parte de la variación del resultado explican las variables, entre 0 y 1. El tamaño de muestra necesita una estimación anticipada: cuanto más baja, más filas pide.",
      en: "What share of the outcome's variation the variables explain, between 0 and 1. The sample size needs an anticipated estimate: the lower it is, the more rows it asks for.",
    },
    google: "r-squared",
  },
  "linea-base": {
    termino: { es: "Línea base", en: "Baseline" },
    definicion: {
      es: "Lo que se logra sin modelo, o con la regla que se usa hoy. Un modelo que no la supera no sirve, aunque su número parezca bueno.",
      en: "What you get without a model, or with the rule used today. A model that doesn't beat it is useless, however good its number looks.",
    },
    google: "baseline",
  },
  "conjunto-de-prueba": {
    termino: { es: "Conjunto de prueba", en: "Test set" },
    definicion: {
      es: "Filas apartadas que el modelo nunca ve al entrenar ni al elegir. Se abren una vez, al final: es lo único que sirve para creerle.",
      en: "Rows set aside that the model never sees while training or choosing. They're opened once, at the end: it's the only thing that earns belief.",
    },
    google: "test-set",
  },
  "validacion-cruzada": {
    termino: { es: "Validación cruzada", en: "Cross-validation" },
    definicion: {
      es: "Entrenar y medir varias veces sobre partes distintas del entrenamiento para elegir el modelo sin tocar la prueba.",
      en: "Training and measuring several times on different parts of the training data to choose the model without touching the test set.",
    },
    google: "cross-validation",
  },
  compuerta: {
    termino: { es: "Compuerta", en: "Gate" },
    definicion: {
      es: "El criterio que una etapa del Protocolo debe cumplir para abrir la siguiente. No se salta: se cumple o se corrige.",
      en: "The criterion a Protocol stage must meet to open the next one. It isn't skipped: it's met or corrected.",
    },
  },
  cuaderno: {
    termino: { es: "Cuaderno", en: "Notebook" },
    definicion: {
      es: "La lista de lo que cada etapa verificó, con fecha y números. Solo crece: corregir añade una entrada nueva. Al final es el documento que defiende el modelo.",
      en: "The list of what each stage verified, with dates and numbers. It only grows: correcting adds a new entry. In the end it's the document that defends the model.",
    },
  },
  huella: {
    termino: { es: "Huella", en: "Fingerprint" },
    definicion: {
      es: "Un código que sale del contenido exacto del archivo (SHA-256). Si cambia un solo byte, cambia la huella: así se sabe si vuelves con los mismos datos.",
      en: "A code computed from the file's exact content (SHA-256). If a single byte changes, the fingerprint changes: that's how the app knows you're back with the same data.",
    },
  },
};
