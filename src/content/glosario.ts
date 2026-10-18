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
      es: "La probabilidad a partir de la cual actúas. Con tus costos sale una cifra concreta; usar 0.5 por costumbre supone que los dos errores cuestan igual.",
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
      es: "Cuánto habría que achicar las predicciones de un modelo para que no sean demasiado extremas en datos nuevos. Pedir que valga al menos 0.9 es pedir poco sobreajuste.",
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
  // S10 (etapa 5)
  "regla-de-hoy": {
    termino: { es: "Regla de hoy", en: "Today's rule" },
    definicion: {
      es: "Lo que la gente que decide ya hace, escrito como una o dos condiciones sobre tus columnas («si el ingreso es menor que 3000, se actúa»). No se entrena: se mide en tus datos para saber qué logra hoy y qué tendría que superar un modelo.",
      en: "What the people who decide already do, written as one or two conditions on your columns («if income is below 3000, act»). It isn't trained: it's measured on your data to learn what it achieves today and what a model would have to beat.",
    },
  },
  "costo-esperado": {
    termino: { es: "Costo esperado", en: "Expected cost" },
    definicion: {
      es: "Cuánto cuestan, en promedio, los errores de una forma de decidir, con los costos que escribiste en la etapa 1. Se lee por cada 100 decisiones y en tu unidad: es la moneda que compara el modelo con no hacer nada y con tu regla de hoy.",
      en: "How much the mistakes of a way of deciding cost on average, using the costs you wrote in stage 1. It is read per 100 decisions and in your unit: it's the currency that compares the model with doing nothing and with today's rule.",
    },
  },
  // S11 (etapa 6)
  "particion-por-tiempo": {
    termino: { es: "Partición por tiempo", en: "Time-based split" },
    definicion: {
      es: "Separar entrenamiento y prueba por fecha: la prueba son las filas más recientes y el modelo aprende solo con las anteriores. Es como se usará: con el pasado, para decidir sobre lo que viene.",
      en: "Splitting training and test by date: the test set is the most recent rows and the model learns only from earlier ones. That's how it will be used: with the past, to decide about what comes next.",
    },
  },
  "particion-por-grupo": {
    termino: { es: "Partición por grupo", en: "Group split" },
    definicion: {
      es: "Separar por unidad (cliente, tienda, paciente) en vez de por fila: todas las filas de una unidad caen del mismo lado. Si no, el modelo se evalúa con unidades que ya vio y parece mejor de lo que es con unidades nuevas.",
      en: "Splitting by unit (customer, store, patient) instead of by row: all of a unit's rows land on the same side. Otherwise the model is evaluated on units it has already seen and looks better than it is with new ones.",
    },
  },
  horizonte: {
    termino: { es: "Horizonte", en: "Horizon" },
    definicion: {
      es: "Cuánto tiempo pasa entre que decides y conoces el resultado (un mes para saber si un cliente se fue). En una partición por tiempo, ese tiempo queda como hueco entre entrenamiento y prueba, para que el entrenamiento no use resultados que se conocen dentro de la prueba.",
      en: "How long it takes from deciding to knowing the outcome (a month to know whether a customer left). In a time-based split, that time is left as a gap between training and test, so training doesn't use outcomes that become known inside the test period.",
    },
  },
  "prueba-sellada": {
    termino: { es: "Prueba sellada", en: "Sealed test set" },
    definicion: {
      es: "La parte de tus datos que se aparta antes de entrenar y se marca con un sello: un código que sale de qué filas son. Si la prueba cambia, el sello no cuadra. Es higiene y trazabilidad, no una promesa: dice que la prueba es la misma, no que nadie la haya mirado.",
      en: "The part of your data set aside before training and marked with a seal: a code computed from which rows it holds. If the test set changes, the seal doesn't match. It's hygiene and traceability, not a promise: it says the test set is the same, not that nobody looked at it.",
    },
  },
  // S9 (etapa 4)
  "existe-al-decidir": {
    termino: { es: "Existe al decidir", en: "Exists when you decide" },
    definicion: {
      es: "Una columna existe al decidir si, en el momento en que el modelo tiene que dar su respuesta, ya está llena y se conoce. Si se llena después del resultado, el modelo la vería al entrenar y no la tendría en la vida real.",
      en: "A column exists when you decide if, at the moment the model has to give its answer, it is already filled in and known. If it is filled in after the outcome, the model would see it while training and wouldn't have it in real life.",
    },
  },
  procedencia: {
    termino: { es: "Procedencia", en: "Provenance" },
    definicion: {
      es: "Quién o qué produce el valor de una columna: una persona al registrar, un sensor, otro sistema, una fórmula. De ahí sale cuándo se llena y cuánto se puede confiar en ella.",
      en: "Who or what produces the value of a column: a person entering it, a sensor, another system, a formula. From it you learn when it gets filled in and how far you can trust it.",
    },
  },
  "columna-identificador": {
    termino: { es: "Columna identificador", en: "Identifier column" },
    definicion: {
      es: "Una columna cuyos valores casi nunca se repiten (un folio, un correo, un id). Sirve para reconocer filas, no para predecir: el modelo la memoriza y no aprende nada que sirva con casos nuevos.",
      en: "A column whose values almost never repeat (an order number, an email, an id). It is for recognizing rows, not for predicting: the model memorizes it and learns nothing useful for new cases.",
    },
  },
  duplicado: {
    termino: { es: "Fila duplicada", en: "Duplicate row" },
    definicion: {
      es: "Una fila idéntica a otra, o la misma unidad registrada dos veces en el mismo momento. Si una copia cae en entrenar y otra en probar, el puntaje parece mejor de lo que es.",
      en: "A row identical to another, or the same unit recorded twice at the same moment. If one copy lands in training and another in testing, the score looks better than it is.",
    },
  },
  deriva: {
    termino: { es: "Deriva", en: "Drift" },
    definicion: {
      es: "Que los datos de ahora ya no se parecen a los de antes. Aquí se mide con el PSI, que compara cómo se reparten los valores entre dos periodos: menos de 0.10 es estable, de 0.10 a 0.25 moderado y desde 0.25 alerta. Esos umbrales son una convención, no una prueba estadística.",
      en: "When today's data no longer looks like the past. Here it is measured with the PSI, which compares how values are spread across two periods: below 0.10 is stable, 0.10 to 0.25 moderate and from 0.25 an alert. Those thresholds are a convention, not a statistical test.",
    },
  },
};
