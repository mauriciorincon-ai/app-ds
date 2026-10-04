// E3 — fichas de lectura de la liga (S5, ADR-009): una por modelo base + el
// baseline de clase mayoritaria. Contenido largo como DATO {es, en} (regla 20 del
// kit): cada idioma redactado en su idioma, no traducido. Las variantes
// balanceadas comparten la ficha de su base y suman un párrafo propio (D4).
// Se carga con import() dinámico junto con FichaModelo (budget de script).
// Paridad (ids = roster, ambos idiomas completos): tests/unit/modelos.test.ts.
import { MLP_MIN_ROWS } from "@/engine/encarrilador";
import type { MemberId } from "@/engine/roster";

export type Bilingual = { es: string; en: string };

export type Ficha = {
  /** Qué es, en una o dos frases sin jerga. */
  what: Bilingual;
  /** Cuándo suele servir. */
  goodFor: Bilingual;
  /** Cuándo no. */
  notFor: Bilingual;
  /** Qué mirar en la tabla de esta app. */
  watch: Bilingual;
  /** Cuánto cuesta entrenarlo en el navegador. */
  cost: Bilingual;
};

/** Variantes con `class_weight="balanced"`: comparten la ficha de su base. */
export type BalancedId = "logistic_balanced" | "forest_balanced";
export type BaseId = Exclude<MemberId, BalancedId>;
export type FichaId = BaseId | "majority";

export const FICHAS: Record<FichaId, Ficha> = {
  logistic: {
    what: {
      es: "Una suma ponderada de tus columnas que se convierte en probabilidad. Cada columna empuja hacia «sí» o hacia «no» con un peso fijo.",
      en: "A weighted sum of your columns squeezed into a probability. Every column nudges the answer towards «yes» or «no» with one fixed weight.",
    },
    goodFor: {
      es: "Relaciones del tipo «a más de esto, más probable»; pocos datos; cuando tienes que explicarle el modelo a otra persona.",
      en: "Relationships of the «the more of this, the likelier» kind; small datasets; any time you have to explain the model to someone else.",
    },
    notFor: {
      es: "Cuando lo que importa son combinaciones («esto y además aquello») o umbrales: no los ve si nadie se los construye.",
      en: "Problems driven by combinations («this, but only together with that») or thresholds: it cannot see them unless someone builds them in.",
    },
    watch: {
      es: "También es el baseline del veredicto. Si gana la liga, ningún modelo más complejo aportó algo: eso es un resultado, no un fracaso.",
      en: "It is also the verdict's baseline. If it wins the league, no fancier model added anything — that is a finding, not a failure.",
    },
    cost: {
      es: "Casi nada: milisegundos, incluso con miles de filas.",
      en: "Next to nothing: milliseconds, even with thousands of rows.",
    },
  },
  ridge: {
    what: {
      es: "Un modelo lineal, pariente de la logística, que traza una frontera recta y le pone freno a los pesos demasiado grandes.",
      en: "A linear model, a close relative of logistic regression, that draws a straight boundary and keeps any single weight from growing too large.",
    },
    goodFor: {
      es: "Muchas columnas parecidas entre sí; resultados estables y rápidos.",
      en: "Many columns that say similar things; fast, stable results.",
    },
    notFor: {
      es: "Cuando necesitas una probabilidad: decide la clase, pero no dice qué tan seguro está. Si lo usas para puntuar, el archivo sale sin columna de probabilidad.",
      en: "Anything that needs a probability: it picks a class but never says how sure it is. Score a file with it and the probability column is left out.",
    },
    watch: {
      es: "Su AUC se calcula con su puntaje de decisión, no con una probabilidad: sirve para ordenar filas, no para leerlo como porcentaje.",
      en: "Its AUC comes from a decision score rather than a probability: good for ranking rows, meaningless as a percentage.",
    },
    cost: {
      es: "Casi nada.",
      en: "Next to nothing.",
    },
  },
  naive_bayes: {
    what: {
      es: "Calcula la probabilidad de cada clase suponiendo que tus columnas no se influyen entre sí (de ahí lo de «ingenuo»).",
      en: "Works out each class's probability assuming your columns have nothing to do with each other — hence «naive».",
    },
    goodFor: {
      es: "Pocos datos y muchas columnas; como punto de comparación rápido.",
      en: "Little data and many columns; a quick yardstick for the others.",
    },
    notFor: {
      es: "Columnas muy relacionadas entre sí (cuenta dos veces la misma evidencia) o categóricas que se abren en muchas columnas de 0 y 1.",
      en: "Columns that echo each other (it counts the same evidence twice) or categories exploded into many 0/1 columns.",
    },
    watch: {
      es: "Sus probabilidades suelen ser extremas, muy cerca de 0 o de 1, aunque acierte en el orden: no las leas como certeza.",
      en: "Its probabilities tend to sit right at 0 or 1 even when its ranking is sound — do not read them as certainty.",
    },
    cost: {
      es: "Casi nada.",
      en: "Next to nothing.",
    },
  },
  linear_svc: {
    what: {
      es: "Busca la frontera recta que separa las dos clases dejando el mayor margen posible entre ellas.",
      en: "Looks for the straight boundary that splits the two classes with the widest possible gap on either side.",
    },
    goodFor: {
      es: "Muchas columnas; clases que una frontera recta separa bien.",
      en: "Wide datasets; classes a straight line already separates well.",
    },
    notFor: {
      es: "Cuando necesitas probabilidad (como Ridge, solo decide la clase) o la frontera real es curva.",
      en: "Anything that needs a probability (like Ridge, it only picks a class) or a boundary that really bends.",
    },
    watch: {
      es: "Es sensible a la escala de las columnas numéricas. La app las estandariza dentro del pipeline, aprendiendo solo de entrenamiento: no tienes que hacerlo tú.",
      en: "It is sensitive to the scale of numeric columns. The app standardises them inside the pipeline, learning from training data only — nothing for you to do.",
    },
    cost: {
      es: "Bajo.",
      en: "Low.",
    },
  },
  decision_tree: {
    what: {
      es: "Una serie de preguntas de sí o no sobre tus columnas («¿edad mayor que 40?») que termina en una predicción.",
      en: "A chain of yes/no questions about your columns («is age above 40?») that ends in a prediction.",
    },
    goodFor: {
      es: "Cuando quieres reglas legibles; relaciones con umbrales y combinaciones.",
      en: "Readable rules; relationships built on thresholds and combinations.",
    },
    notFor: {
      es: "Solo, cambia mucho con pequeños cambios en los datos y tiende a memorizarlos; por eso los bosques suelen ganarle.",
      en: "On its own it shifts a lot with small changes in the data and tends to memorise it — which is why forests usually beat it.",
    },
    watch: {
      es: "Aquí cada hoja necesita al menos 5 ejemplos para que no memorice. Aun así, mira el ± de su puntaje: si es grande, su lugar en la tabla es frágil.",
      en: "Here every leaf needs at least 5 examples so it cannot memorise. Even so, check the ± on its score: a large one means its place in the table is shaky.",
    },
    cost: {
      es: "Bajo.",
      en: "Low.",
    },
  },
  knn: {
    what: {
      es: "Para predecir una fila nueva, busca las 5 filas de entrenamiento más parecidas y las pone a votar.",
      en: "To predict a new row it finds the 5 most similar training rows and lets them vote.",
    },
    goodFor: {
      es: "Cuando casos parecidos se comportan parecido y no hay una regla simple que lo resuma.",
      en: "Situations where similar cases behave alike and no simple rule sums it up.",
    },
    notFor: {
      es: "Muchas columnas (todo termina «lejos» de todo) o muchas filas: predecir es lento porque compara contra todo el entrenamiento.",
      en: "Lots of columns (everything ends up «far» from everything) or lots of rows: prediction is slow because it compares against the whole training set.",
    },
    watch: {
      es: "«Parecido» depende de la escala: la app estandariza las columnas numéricas para que ninguna pese más solo por sus unidades.",
      en: "«Similar» depends on scale: the app standardises numeric columns so none counts for more just because of its units.",
    },
    cost: {
      es: "Entrenar es instantáneo; predecir crece con el tamaño de tus datos.",
      en: "Training is instant; prediction grows with the size of your data.",
    },
  },
  hgb: {
    what: {
      es: "Muchos árboles pequeños en fila: cada uno corrige los errores de los anteriores. Es la versión de scikit-learn, que agrupa los valores en intervalos para ir rápido.",
      en: "A queue of small trees, each one fixing the mistakes of those before it. This is scikit-learn's version, which buckets values into bins to stay fast.",
    },
    goodFor: {
      es: "Datos tabulares medianos y grandes; suele quedar entre los mejores.",
      en: "Medium and large tabular data; usually near the top.",
    },
    notFor: {
      es: "Muy pocas filas: puede aprender ruido, y un modelo simple suele empatarle.",
      en: "Very few rows: it can learn noise, and a simple model often ties it.",
    },
    watch: {
      es: "Si queda «≈ empata con el mejor» junto a uno más simple, gana el simple: no aportó lo suficiente para justificar su complejidad.",
      en: "If it is marked «≈ tied with the best» alongside a simpler model, the simpler one wins: it did not add enough to earn its complexity.",
    },
    cost: {
      es: "Medio: segundos con miles de filas.",
      en: "Moderate: seconds with thousands of rows.",
    },
  },
  lightgbm: {
    what: {
      es: "Boosting de árboles, como HistGradientBoosting, creado por Microsoft: hace crecer cada árbol por la hoja que más mejora.",
      en: "Tree boosting in the same family as HistGradientBoosting, built by Microsoft: each tree grows from whichever leaf helps most.",
    },
    goodFor: {
      es: "Datos tabulares grandes; muy rápido para lo que rinde.",
      en: "Large tabular data; very fast for what it delivers.",
    },
    notFor: {
      es: "Pocas filas: con su configuración por defecto puede aprender ruido.",
      en: "Small datasets: on its default settings it can pick up noise.",
    },
    watch: {
      es: "El archivo exportado necesita LightGBM para volver a abrirse. La app lo carga siempre y el manifiesto anota su versión.",
      en: "An exported file needs LightGBM to open again. The app always loads it, and the manifest records its version.",
    },
    cost: {
      es: "Medio.",
      en: "Moderate.",
    },
  },
  xgboost: {
    what: {
      es: "Boosting de árboles con un freno que castiga los árboles demasiado complejos; muy usado en competencias de datos tabulares.",
      en: "Tree boosting with a brake that penalises trees for getting too complex; a staple of tabular data competitions.",
    },
    goodFor: {
      es: "Datos tabulares de casi cualquier tamaño, con relaciones complejas.",
      en: "Tabular data of almost any size with tangled relationships.",
    },
    notFor: {
      es: "Muy pocas filas, o cuando un modelo simple empata con él.",
      en: "Very small datasets, or whenever a simple model ties it.",
    },
    watch: {
      es: "Como LightGBM: el archivo exportado anota su versión, y la app avisa si al importarlo no coincide con la instalada.",
      en: "As with LightGBM, the exported file records its version, and the app warns you if it does not match the one installed.",
    },
    cost: {
      es: "Medio a alto: crece con el número de columnas.",
      en: "Moderate to high: it grows with the number of columns.",
    },
  },
  extra_trees: {
    what: {
      es: "Un bosque de 200 árboles cuyos cortes se eligen en parte al azar. El promedio de muchos árboles «torpes» resulta estable.",
      en: "A forest of 200 trees whose splits are partly chosen at random. Averaging many «clumsy» trees gives a steady answer.",
    },
    goodFor: {
      es: "Datos con ruido; suele ser rápido para ser un bosque.",
      en: "Noisy data; quick, by forest standards.",
    },
    notFor: {
      es: "Cuando necesitas el modelo más liviano posible: guarda todos sus árboles.",
      en: "When you need the smallest possible model: it keeps every one of its trees.",
    },
    watch: {
      es: "Es de la misma familia que Random Forest. Si los dos empatan, la diferencia entre ellos es suerte.",
      en: "Same family as Random Forest. If the two tie, whatever separates them is luck.",
    },
    cost: {
      es: "Alto con datos grandes: son muchos árboles.",
      en: "High on large data: that is a lot of trees.",
    },
  },
  forest: {
    what: {
      es: "200 árboles, cada uno entrenado con una muestra distinta de filas y columnas; predice por votación.",
      en: "200 trees, each trained on a different sample of rows and columns; the prediction is their vote.",
    },
    goodFor: {
      es: "Casi cualquier dataset tabular; aguanta bien el ruido y las columnas que no aportan.",
      en: "Nearly any tabular dataset; it shrugs off noise and useless columns.",
    },
    notFor: {
      es: "Datos muy grandes en el navegador: es de los más lentos de la liga.",
      en: "Very large data in the browser: it is one of the slowest in the league.",
    },
    watch: {
      es: "Era el modelo principal de las primeras versiones de Probeta. Ahora compite como uno más y gana solo si la validación cruzada lo elige.",
      en: "It was the main model in Probeta's early versions. Now it competes like any other and wins only if cross-validation picks it.",
    },
    cost: {
      es: "Alto: crece con las filas.",
      en: "High: it grows with the number of rows.",
    },
  },
  mlp: {
    what: {
      es: "Una red neuronal pequeña (una capa de 64 neuronas) que aprende combinaciones de tus columnas. Corre en el procesador: no es aprendizaje profundo.",
      en: "A small neural network (one layer of 64 neurons) that learns combinations of your columns. It runs on the CPU — this is not deep learning.",
    },
    goodFor: {
      es: "Relaciones suaves y no lineales, con suficientes filas.",
      en: "Smooth, non-linear relationships, given enough rows.",
    },
    notFor: {
      es: `Menos de ${MLP_MIN_ROWS} filas: no aprende nada estable (por eso queda fuera, aunque puedes incluirla en el Nivel 2). En datos tabulares, los árboles suelen ganarle.`,
      en: `Fewer than ${MLP_MIN_ROWS} rows: it learns nothing stable (that is why it sits out, though you can add it in Level 2). On tabular data, trees usually beat it.`,
    },
    watch: {
      es: "Si aparece «no convergió», su puntaje puede cambiar de una corrida a otra: no la elijas por un puntaje alto aislado.",
      en: "If it shows «did not converge», its score may move from run to run — do not pick it for one lucky number.",
    },
    cost: {
      es: "Medio a alto.",
      en: "Moderate to high.",
    },
  },
  majority: {
    what: {
      es: "Predice siempre la clase más frecuente. No aprende nada de tus columnas.",
      en: "Always predicts the most common class. It learns nothing from your columns.",
    },
    goodFor: {
      es: "Como vara mínima: cualquier modelo que valga la pena tiene que superarla.",
      en: "As the floor: any model worth keeping has to clear it.",
    },
    notFor: {
      es: "Usarlo como modelo: nunca detecta la clase menos frecuente.",
      en: "Actual use: it never catches the rarer class.",
    },
    watch: {
      es: "Con clases desequilibradas su exactitud parece alta (si el 90 % es «no», acierta el 90 %). Por eso el veredicto se mide con AUC o F1.",
      en: "With imbalanced classes its accuracy looks impressive (if 90 % are «no», it is right 90 % of the time). That is why the verdict uses AUC or F1.",
    },
    cost: {
      es: "Ninguno.",
      en: "None.",
    },
  },
};

/** El párrafo propio de cada variante balanceada (D4). */
export const BALANCED_NOTES: Record<BalancedId, Bilingual> = {
  logistic_balanced: {
    es: "Variante balanceada: al aprender, da más peso a los ejemplos de la clase menos frecuente. Suele encontrar más casos de esa clase a cambio de más falsas alarmas. Compite solo cuando tus clases están desequilibradas.",
    en: "Balanced variant: while learning it gives extra weight to the rarer class. It tends to catch more of those cases at the price of more false alarms. It only competes when your classes are imbalanced.",
  },
  forest_balanced: {
    es: "Variante balanceada: cada árbol pesa más los ejemplos de la clase menos frecuente. Compite solo cuando tus clases están desequilibradas; con clases parejas repetiría al bosque normal.",
    en: "Balanced variant: every tree weighs the rarer class more heavily. It only competes when your classes are imbalanced; with even classes it would just repeat the regular forest.",
  },
};
