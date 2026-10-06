// E3 — fichas de lectura de la liga (S5, ADR-009): una por modelo base + el
// baseline de clase mayoritaria. Contenido largo como DATO {es, en} (regla 20 del
// kit): cada idioma redactado en su idioma, no traducido. Las variantes
// balanceadas comparten la ficha de su base y suman un párrafo propio (D4).
// Se carga con import() dinámico junto con FichaModelo (budget de script).
// Paridad (ids = roster, ambos idiomas completos): tests/unit/modelos.test.ts.
import { MLP_MIN_ROWS } from "@/engine/encarrilador";
import {
  AGGLO_MAX_ROWS,
  HDBSCAN_MIN_CLUSTER_SIZE,
  HDBSCAN_ROWS_PER_MIN_CLUSTER,
} from "@/engine/verdict";
import type {
  BinaryMemberId,
  MemberId,
  RegressionMemberId,
} from "@/engine/roster";
import { thousands } from "@/lib/quantity";

const HDBSCAN_MIN_SHARE_PCT = 100 / HDBSCAN_ROWS_PER_MIN_CLUSTER;

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
/** Los baselines que tienen ficha y no compiten: uno por tarea que no es miembro (S6). */
export type BaselineFichaId = "majority" | "median";
export type FichaId = BaseId | BaselineFichaId;

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
  // S6 (ADR-013): solo estima cantidades. También es baseline del veredicto de regresión.
  linear: {
    what: {
      es: "Una suma ponderada de tus columnas que da directamente la cantidad estimada: cada columna suma o resta con un peso fijo.",
      en: "A weighted sum of your columns that gives the estimate directly: each column adds or subtracts with one fixed weight.",
    },
    goodFor: {
      es: "Relaciones del tipo «a más de esto, más cantidad»; pocos datos; cuando tienes que poder explicar de dónde sale cada número.",
      en: "Relationships of the «more of this, more of that» kind; small datasets; any time you need to explain where each number comes from.",
    },
    notFor: {
      es: "Combinaciones («esto pesa solo si además pasa aquello») y curvas: si nadie se las construye, no las ve.",
      en: "Combinations («this matters only when that happens too») and curves: it cannot see them unless someone builds them in.",
    },
    watch: {
      es: "También es baseline del veredicto. Si gana la liga, ningún modelo más complejo aportó algo: eso es un resultado, no un fracaso.",
      en: "It is also one of the verdict's baselines. If it wins the league, no fancier model added anything — that is a finding, not a failure.",
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
  // S6 (ADR-013): solo estima cantidades.
  lasso: {
    what: {
      es: "Una regresión lineal que castiga sus pesos y puede dejar en cero los de las columnas que no aportan: elige columnas mientras ajusta.",
      en: "A linear regression that penalises its weights and can push the useless ones all the way to zero — it picks columns as it fits.",
    },
    goodFor: {
      es: "Muchas columnas de las que sospechas que solo unas pocas importan.",
      en: "Lots of columns when you suspect only a handful really matter.",
    },
    notFor: {
      es: "Lo mismo que la lineal: no ve combinaciones ni curvas. Con columnas casi iguales entre sí, se queda con una casi al azar.",
      en: "Same blind spots as plain linear regression: no combinations, no curves. Given near-duplicate columns, it keeps one of them almost arbitrarily.",
    },
    watch: {
      es: "Si empata con la lineal, la penalización no tuvo nada que podar: todas tus columnas aportan un poco.",
      en: "If it ties with linear regression, the penalty found nothing to prune: every column pulls a little weight.",
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
  // S7 (ADR 016): los agrupadores. Agrupar no tiene objetivo: estas fichas no
  // hablan de clases ni de aciertos, sino de qué forma de grupo encuentra cada uno.
  kmeans: {
    what: {
      es: "Reparte las filas en k grupos alrededor de k centros: cada fila va al centro más cercano y cada centro se mueve al medio de su grupo, hasta que nada cambia.",
      en: "Splits the rows into k groups around k centres: each row joins the nearest centre and each centre moves to the middle of its group, until nothing changes.",
    },
    goodFor: {
      es: "Grupos redondeados y de tamaño parecido en columnas numéricas; tablas grandes, porque es rápido.",
      en: "Roundish groups of similar size in numeric columns; big tables, because it is fast.",
    },
    notFor: {
      es: "Grupos alargados, anidados o de densidades muy distintas: igual los corta en pedazos redondos. Y siempre encuentra k grupos, aunque no haya ninguno.",
      en: "Elongated, nested or very uneven groups: it still slices them into round pieces. And it always finds k groups, even when there are none.",
    },
    watch: {
      es: "Por eso la lectura lo compara con lo que él mismo encuentra en datos sin estructura: si no lo supera, sus grupos son un reparto, no un hallazgo.",
      en: "That is why the reading compares it with what it finds in data with no structure at all: if it doesn't beat that, its groups are a split, not a finding.",
    },
    cost: {
      es: "Bajo: con unos pocos miles de filas, una fracción de segundo por cada k que prueba.",
      en: "Low: with a few thousand rows, a fraction of a second for each k it tries.",
    },
  },
  agglomerative: {
    what: {
      es: "Empieza con cada fila sola y une, paso a paso, los dos grupos que menos aumentan la dispersión (el método de Ward). Cortar ese árbol a distintas alturas da distintos k.",
      en: "Starts with every row on its own and, step by step, merges the two groups that add the least spread (Ward's method). Cutting that tree at different heights gives different k.",
    },
    goodFor: {
      es: "Ver cómo se anidan unos grupos dentro de otros; tablas medianas; un resultado que no depende del azar.",
      en: "Seeing how some groups nest inside others; medium-sized tables; a result that doesn't depend on chance.",
    },
    notFor: {
      es: `Tablas grandes: la memoria que pide crece con el cuadrado de las filas. Con más de ${thousands(AGGLO_MAX_ROWS)} filas se ajusta sobre una muestra de ${thousands(AGGLO_MAX_ROWS)} y las demás van al grupo más cercano, para que la pestaña no se cierre en un teléfono. La app lo dice junto al resultado.`,
      en: `Big tables: the memory it needs grows with the square of the rows. With more than ${thousands(AGGLO_MAX_ROWS)} rows it is fitted on a sample of ${thousands(AGGLO_MAX_ROWS)} and the rest go to the nearest group, so the tab doesn't crash on a phone. The app says so next to the result.`,
    },
    watch: {
      es: "Si dice «ajustado sobre una muestra», su estabilidad se midió dentro de esa muestra.",
      en: "If it says «fitted on a sample», its stability was measured within that sample.",
    },
    cost: {
      es: "Bajo con pocas filas; con miles, unos segundos (por eso la muestra).",
      en: "Low with few rows; with thousands, a few seconds (hence the sample).",
    },
  },
  gmm: {
    what: {
      es: "Supone que los datos son una mezcla de nubes con forma de campana —elípticas, de tamaños y orientaciones distintas— y estima cuántas hay y dónde está cada una.",
      en: "Assumes the data are a mix of bell-shaped clouds —elliptical, of different sizes and orientations— and estimates how many there are and where each one sits.",
    },
    goodFor: {
      es: "Grupos elípticos o que se solapan; cuando te sirve una probabilidad de pertenencia para cada fila.",
      en: "Elliptical or overlapping groups; when a membership probability for each row is useful.",
    },
    notFor: {
      es: "Formas que no son nubes (anillos, cadenas) y pocas filas para muchas columnas: no le alcanzan los datos para estimar cada nube.",
      en: "Shapes that aren't clouds (rings, chains) and few rows for many columns: there isn't enough data to estimate every cloud.",
    },
    watch: {
      es: "Elige su k con el BIC (premia ajustar bien y castiga sumar nubes), no con la silueta: puede discrepar de los demás, y el consenso lo deja a la vista.",
      en: "It picks its k with BIC (rewards a good fit, penalises extra clouds), not with the silhouette: it may disagree with the others, and the consensus shows it.",
    },
    cost: {
      es: "Medio: varias veces K-Means, porque ajusta una mezcla para cada k.",
      en: "Medium: several times K-Means, because it fits a mixture for every k.",
    },
  },
  hdbscan: {
    what: {
      es: "Busca las zonas donde las filas están apretadas y las separa de las zonas ralas. No pide k: los grupos salen de la densidad, y lo que no cae en ninguna zona densa queda «fuera de todo grupo».",
      en: "Looks for regions where rows are packed together and separates them from sparse regions. It doesn't ask for k: groups come from the density, and whatever falls in no dense region is left «outside every group».",
    },
    goodFor: {
      es: "Grupos de formas raras o de tamaños muy distintos; datos con filas sueltas que no pertenecen a ningún grupo.",
      en: "Oddly shaped groups or groups of very different sizes; data with stray rows that belong to no group.",
    },
    notFor: {
      es: `Pocas filas o densidad pareja: puede dejar casi todo fuera de los grupos. Un grupo necesita al menos ${HDBSCAN_MIN_CLUSTER_SIZE} filas, o el ${HDBSCAN_MIN_SHARE_PCT} % de la tabla si es más.`,
      en: `Few rows or even density: it may leave almost everything outside the groups. A group needs at least ${HDBSCAN_MIN_CLUSTER_SIZE} rows, or ${HDBSCAN_MIN_SHARE_PCT}% of the table if that is more.`,
    },
    watch: {
      es: "Mira cuántas filas quedan «fuera de todo grupo»: su puntaje las descuenta (silueta × parte agrupada), así que no gana dejando fuera las filas difíciles.",
      en: "Watch how many rows end up «outside every group»: its score discounts them (silhouette × grouped share), so it can't win by leaving the hard rows out.",
    },
    cost: {
      es: "Bajo con pocas filas; con decenas de miles, el más caro de los cuatro, sobre todo al medir su estabilidad.",
      en: "Low with few rows; with tens of thousands, the most expensive of the four, especially when its stability is measured.",
    },
  },
  // S6: el baseline constante de estimar una cantidad (decidido en el STOP de la F0).
  median: {
    what: {
      es: "Predice siempre el mismo número: la mediana del objetivo en el entrenamiento, el valor que queda en el medio. No aprende nada de tus columnas.",
      en: "Always predicts the same number: the target's median in training, the value right in the middle. It learns nothing from your columns.",
    },
    goodFor: {
      es: "Como vara mínima: si la liga no se equivoca menos que adivinar siempre la mediana, tus columnas no aportan señal sobre el objetivo.",
      en: "As the floor: if the league is not off by less than always guessing the median, your columns carry no signal about the target.",
    },
    notFor: {
      es: "Usarla como modelo: da la misma respuesta para cada fila.",
      en: "Actual use: it gives every row the same answer.",
    },
    watch: {
      es: "Es la constante que menos se equivoca en promedio. Por eso se usa en vez del promedio: con un objetivo sesgado, adivinar el promedio se equivoca más y le regalaría al modelo una victoria fácil.",
      en: "It is the constant with the smallest average error. That is why it is used instead of the mean: with a skewed target, guessing the mean is off by more and would hand the model an easy win.",
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

/**
 * S6: los modelos que compiten en las DOS tareas comparten id y ficha; al estimar
 * una cantidad, la ficha suma este párrafo (cómo estima, qué cambia). Las fichas
 * de `linear` y `lasso` ya hablan de estimar: solo compiten ahí.
 */
export type SharedId = Extract<BinaryMemberId, RegressionMemberId>;

export const REGRESSION_NOTES: Record<SharedId, Bilingual> = {
  ridge: {
    es: "Al estimar, Ridge compite con su versión sin freno (la regresión lineal) y con Lasso, que además puede dejar columnas en cero.",
    en: "When estimating, Ridge competes with its unbraked version (linear regression) and with Lasso, which can also switch columns off entirely.",
  },
  decision_tree: {
    es: "Al estimar, cada hoja del árbol predice el promedio de las filas de entrenamiento que caen en ella: la estimación sube en escalones, nunca en curva suave. Con hojas de al menos 5 filas no memoriza cada caso.",
    en: "When estimating, each leaf predicts the average of the training rows that land in it: estimates move in steps, never along a smooth curve. Leaves of at least 5 rows keep it from memorising every case.",
  },
  knn: {
    es: "Al estimar, promedia el valor del objetivo de las 5 filas de entrenamiento más parecidas. Nunca estima por fuera del rango que vio: si los datos nuevos son más extremos, se queda corto.",
    en: "When estimating, it averages the target of the 5 most similar training rows. It never estimates outside the range it saw: with more extreme new data, it falls short.",
  },
  hgb: {
    es: "Al estimar, suma árboles pequeños que corrigen, uno tras otro, el error de los anteriores. Suele estar entre los más precisos en tablas medianas y grandes.",
    en: "When estimating, it adds up small trees that each correct the error left by the ones before. It is often among the most accurate on medium and large tables.",
  },
  lightgbm: {
    es: "Al estimar funciona igual que al clasificar: 200 árboles que se corrigen entre sí, ahora achicando el error en las unidades del objetivo.",
    en: "When estimating it works as it does when classifying: 200 trees correcting one another, now shrinking the error in the target's units.",
  },
  xgboost: {
    es: "Al estimar, sus 200 árboles se ajustan uno tras otro para achicar el error de la suma, con una penalización que frena a los árboles demasiado detallados.",
    en: "When estimating, its 200 trees are fitted one after another to shrink the error of the sum, with a penalty that holds back overly detailed trees.",
  },
  extra_trees: {
    es: "Al estimar, promedia lo que estiman sus 200 árboles, cada uno con cortes elegidos al azar. Ese azar suaviza la estimación y suele resistir bien el ruido.",
    en: "When estimating, it averages what its 200 trees estimate, each built with randomly chosen splits. That randomness smooths the estimate and usually copes well with noise.",
  },
  forest: {
    es: "Al estimar, promedia lo que estiman sus 200 árboles, cada uno entrenado con una muestra distinta de filas. Como todo árbol, no estima por fuera del rango que vio en el entrenamiento.",
    en: "When estimating, it averages the estimates of its 200 trees, each trained on a different sample of rows. Like any tree, it never estimates outside the range it saw in training.",
  },
  mlp: {
    es: "Al estimar, la red aprende con el objetivo estandarizado (restada la media y dividido por la desviación) y la app devuelve la estimación a las unidades originales. Se detiene sola cuando deja de mejorar en una parte reservada del entrenamiento.",
    en: "When estimating, the network learns from a standardised target (mean removed, divided by the spread) and the app converts the estimate back to the original units. It stops on its own once it no longer improves on a held-out slice of training.",
  },
};

/**
 * S6: los apartados de una ficha compartida que hablan SOLO de clasificar
 * (probabilidad, AUC, «decide la clase») se reemplazan al estimar — si no, la ficha
 * diría dos cosas que se contradicen. Hoy los tienen Ridge, kNN y Random Forest
 * (los que «votan» al clasificar promedian al estimar); un test vigila que ninguna
 * ficha compartida hable de clases, votos ni probabilidad al estimar (AU-S6-19).
 */
export const REGRESSION_FICHA_FIELDS: Partial<
  Record<SharedId, Partial<Ficha>>
> = {
  ridge: {
    what: {
      es: "Una regresión lineal con freno: ajusta una recta (un plano, con varias columnas) y no deja que ningún peso crezca demasiado.",
      en: "A linear regression with a brake: it fits a straight line (a plane, with several columns) and keeps any single weight from growing too large.",
    },
    notFor: {
      es: "Cuando la relación con el objetivo es curva o depende de combinaciones de columnas: una recta no la sigue.",
      en: "When the link to the target is curved or depends on combinations of columns: a straight line cannot follow it.",
    },
    watch: {
      es: "Compárala con la regresión lineal: si quedan casi iguales, el freno no hacía falta; si Ridge gana, había columnas que se pisaban entre sí.",
      en: "Compare it with plain linear regression: if they come out nearly equal, the brake was not needed; if Ridge wins, some columns were stepping on each other.",
    },
  },
  knn: {
    what: {
      es: "Para estimar una fila nueva, busca las 5 filas de entrenamiento más parecidas y promedia su valor del objetivo.",
      en: "To estimate a new row it finds the 5 most similar training rows and averages their target values.",
    },
  },
  forest: {
    what: {
      es: "200 árboles, cada uno entrenado con una muestra distinta de filas y columnas; la estimación es el promedio de lo que estiman.",
      en: "200 trees, each trained on a different sample of rows and columns; the estimate is the average of theirs.",
    },
  },
};

/**
 * S7 (ADR 015): con VARIAS categorías, los apartados que solo hablan de dos clases
 * («sí» o «no», «las dos clases», el AUC binario) se reemplazan — si no, la ficha
 * describiría un modelo que no es el que compite. Un test vigila que ninguna ficha
 * de la liga multiclase hable de «sí/no», de dos clases ni del AUC binario.
 */
export const MULTICLASS_FICHA_FIELDS: Partial<
  Record<BinaryMemberId, Partial<Ficha>>
> = {
  logistic: {
    what: {
      es: "Una suma ponderada de tus columnas para cada categoría, convertida en una probabilidad por categoría (entre todas suman 1). Cada columna acerca a unas categorías y aleja de otras con pesos fijos.",
      en: "A weighted sum of your columns for each category, turned into one probability per category (together they add up to 1). Each column pulls towards some categories and away from others with fixed weights.",
    },
  },
  ridge: {
    watch: {
      es: "Con varias categorías no da probabilidades, así que su pérdida logarítmica y su AUC quedan en «—». Compite, como todos, por la exactitud balanceada.",
      en: "With several categories it gives no probabilities, so its log loss and AUC show as «—». Like everyone else, it competes on balanced accuracy.",
    },
  },
  linear_svc: {
    what: {
      es: "Traza una frontera recta por cada categoría, que la separa de todas las demás con el mayor margen posible; gana la categoría cuya frontera queda más lejos de la fila.",
      en: "Draws one straight boundary per category, splitting it from all the others with the widest possible gap; the category whose boundary sits furthest from the row wins.",
    },
  },
};
