---
sprint: 007
fase: 0
tipo: spike de costos y umbrales (molde docs/SPIKE-DE-COSTOS.plantilla.md, kit v1.38.0)
fecha: 2026-10-04
runtime: Pyodide 314.0.2 (pin) y 314.0.7 (candidato), build de producción en localhost
navegadores: Chromium 153.0.8010.12 (referencia) y WebKit 26.6 (segunda lectura)
arnes: scripts/spike-multiclase/ · scripts/spike-agrupar/ · scripts/spike-liga/{correr,elegir-intento,comparar-corridas}.mjs
---

# Spike del catálogo — S7 F0 (clasificar en varias categorías · agrupar sin objetivo · Pyodide)

> La orden no fija umbrales: los fija esta medición en el STOP de la Fase 0 (método v1.37.0).
> Cada cifra de este informe se escribió **después** de la corrida que la produce (regla 22 de la
> constitución, kit v1.38.0). Las tablas completas, tal como las imprimen los scripts, van en los
> anexos A, B y C; las secciones 0–3 citan de ellas.

## 0. Condiciones

| Condición                        | Cómo se cumplió                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Máquina quieta**               | Antes de cada lote, el envoltorio espera a que el load average de 1 min quede ≤ 5 (núcleos / 2, con 10 núcleos) durante 60 s seguidos. Cada lote arrancó así (la carga de arranque está en la tabla de lotes). Mientras corría no hubo builds, pruebas, `next dev` ni otra corrida del arnés                                                     |
| **Carga registrada**             | `uptime` al empezar y terminar cada lote; `os.loadavg()` antes y después de cada dataset (en cada JSON y en los anexos); el swap, en el tercer intento                                                                                                                                                                                           |
| **Repetir si hubo carga**        | Un lote con algún dataset sobre el umbral se repitió entero una vez (multiclase y agrupar en Chromium, multiclase con 314.0.7). Después, un **tercer intento declarado** corrió solo los 8 datasets de Chromium sin ninguna corrida bajo el umbral. Ningún intento se promedia con otro: cada dataset toma UNA corrida con la regla de abajo     |
| **Mismo runtime que el usuario** | `pnpm build && pnpm start`. El arnés carga Pyodide en un module worker como el runner del producto (mismos paquetes, xgboost por URL) y ejecuta `pipeline.py` real antes del `spike.py`. La versión **cargada** se lee en el navegador: 314.0.2 con numpy 2.4.3 y scikit-learn 1.8.0; el candidato, 314.0.7 con numpy 2.4.6 y scikit-learn 1.8.0 |
| **Semilla y repeticiones**       | Semilla 42. Chromium: 3 corridas por celda y la mediana. **Excepciones declaradas:** el sintético de 20.000 filas, las nubes de 20.000, las sondas de Agglomerative y las cuatro particiones extra de `planes-200` con 1 corrida; WebKit con 1 corrida por celda (segunda lectura)                                                               |

### Los lotes, con su carga

| Lote (datasets)                                   | Intento       | Hora (quieta → fin) | Carga al arrancar | Datasets sobre el umbral                                                                |
| ------------------------------------------------- | ------------- | ------------------- | ----------------: | --------------------------------------------------------------------------------------- |
| Multiclase · Chromium (17)                        | 1             | 15:40:58 → 16:00:17 |              2,99 | 10 de 17 (hasta 13,18)                                                                  |
| Multiclase · Chromium (17)                        | 2             | 16:01:17 → 16:20:10 |              4,87 | 10 de 17 (hasta 10,43)                                                                  |
| Agrupar · Chromium (13)                           | 1             | 16:21:00 → 16:28:17 |              2,79 | 5 de 13: nubes de 5.000 y 20.000, las tres sondas                                       |
| Agrupar · Chromium (13)                           | 2             | 16:30:37 → 16:37:26 |              3,19 | 6 de 13: las tres nubes y las tres sondas                                               |
| Multiclase · 314.0.2 (3)                          | 1             | 16:38:46 → 16:41:44 |              4,60 | 0                                                                                       |
| Multiclase · 314.0.7 (3)                          | 1             | 16:42:34 → 16:45:35 |              3,35 | 2 de 3 (repetido)                                                                       |
| Multiclase · 314.0.7 (3)                          | 2             | 16:46:25 → 16:49:26 |              2,92 | 0                                                                                       |
| Agrupar · 314.0.2 (2)                             | 1             | 16:50:16 → 16:51:16 |              3,76 | 0                                                                                       |
| Agrupar · 314.0.7 (2)                             | 1             | 16:52:06 → 16:53:05 |              3,04 | 0                                                                                       |
| Multiclase · WebKit (17)                          | 1             | 16:53:55 → 17:01:12 |              2,45 | 0                                                                                       |
| Agrupar · WebKit (13)                             | 1             | 17:03:22 → 17:06:01 |              3,20 | 0                                                                                       |
| Multiclase · Chromium (k=10, k=20, s43)           | 3 (declarado) | 17:07:13 → 17:11:25 |              2,26 | 0 de 3                                                                                  |
| Agrupar · Chromium (nubes 5.000 y 20.000, sondas) | 3 (declarado) | 17:12:15 → 17:15:32 |              3,13 | 2 de 5: nubes de 5.000 (3,2 → 7,45) y nubes de 20.000 (7,45 → 2,58), marcados con carga |

**Qué cargó la máquina (y no se tocó).** Hasta las ~16:05, el proceso principal de Safari usaba un
núcleo entero (98 % de CPU) sin una pestaña que lo explicara; el usuario lo cerró. La máquina tiene
16 GB de RAM y trabajaba con 18.406–20.070 M de swap en uso (`sysctl vm.swapusage`; el total creció
de 19.456 M a 21.504 M durante el lote de agrupar), con otras ventanas de VS Code del usuario trabajando en paralelo: ese trabajo
es legítimo y no se pidió cerrarlo. **Patrón observado, sin atribuirlo:** en Chromium, los datasets
más pesados subieron la carga durante su propia corrida (k=10: 2,05 → 10,05 en el intento 2; nubes
de 5.000: 3,2 → 7,45 en el intento 3); en WebKit no (k=10: 2,88 → 2,84; nubes de 5.000: 3,34 → 3,22).

**La carga cambia los tiempos, no los resultados** (`scripts/spike-liga/comparar-corridas.mjs`,
corrido sobre los cuatro archivos de cada spike, sin los campos de tiempo, memoria y carga):

- Multiclase: **17 de 17** datasets con el mismo resultado en todas sus corridas (106 corridas: los
  tres intentos de Chromium y WebKit).
- Agrupar: **13 de 13** (82 corridas).

Las métricas, la fuga por clase, los ganadores, los k y las lecturas de este informe no dependen
de la carga; los tiempos sí, y por eso se elige la corrida.

**La regla para elegir la corrida de cada dataset** (`scripts/spike-liga/elegir-intento.mjs`,
fijada antes de mirar los tiempos): el intento **más reciente** con la carga de antes y de después
≤ el umbral; si ninguno quedó bajo el umbral, el de menor carga máxima, marcado «con carga». Nunca
el más rápido. Resultado:

| Origen                                | Datasets                                                                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Multiclase, intento 1                 | planes-200, planes-fuga-200, planes-sin-fuga-200, ocupantes-200, departamento-200, planes-5000, sintetico-2000-k5                             |
| Multiclase, intento 2                 | ancho-2000-k5, sintetico-5000-k5, sintetico-20000-k5, sintetico-2000-k3, planes-200-s44, -s45, -s46                                           |
| Multiclase, intento 3                 | sintetico-2000-k10, sintetico-2000-k20, planes-200-s43                                                                                        |
| Agrupar, intento 1                    | nubes-2000-k4                                                                                                                                 |
| Agrupar, intento 2                    | segmentos-300, sin-grupos-300, consumo-200, planes-200, uniforme-500-1d, uniforme-500-2d, uniforme-2000-4d                                    |
| Agrupar, intento 3                    | agglo-8000, agglo-12000, agglo-16000                                                                                                          |
| **Con carga** (ningún intento limpio) | nubes-5000-k4 (intento 1: 4,5 → 6,76) y nubes-20000-k4 (intento 3: 7,45 → 2,58). Su lectura limpia de tiempo es la de WebKit: 23,4 s y 87,3 s |

## 1. Qué se midió

| Celda                               | Entrada                                                                                                                                                                                                                | Qué se mide                                                                                                                                                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multiclase: la liga                 | 14 miembros nativos + mayoritaria + logística, CV k=5 dentro de train; 5 datasets del kit (200 filas, K = 4–6), 1 de 5.000, sintéticos de 2.000/5.000/20.000 con K = 5, de 2.000 con K = 3/10/20 y uno de 112 columnas | Tiempo por miembro, F1 macro y exactitud balanceada en CV y en prueba, la regla de un error estándar con cada una, el veredicto contra el mejor baseline con tolerancia 0,01/0,02/0,05, la convergencia del MLP               |
| Multiclase: estabilidad del ganador | `planes-200` con 5 particiones (semillas 42–46)                                                                                                                                                                        | Cuántos ganadores distintos da cada métrica                                                                                                                                                                                   |
| Fuga por clase                      | Uno contra el resto, en train, en las columnas legítimas de todos los datasets y en la plantada (`cargo_corporativo_usd`)                                                                                              | AUC de rango (numéricas); pureza cruda, pureza normalizada y AUC de la tasa por categoría (categóricas); el soporte de cada lado                                                                                              |
| Falsa alarma por azar               | Matemática (sin navegador): la distribución exacta de Mann-Whitney; una simulación para las categóricas                                                                                                                | La probabilidad de \|AUC − ½\| ≥ 0,48 por azar según el soporte; la fracción de sorteos ≥ 0,98 de cada medida categórica                                                                                                      |
| D8 en la binaria                    | `prepareRun` real sobre los 11 objetivos binarios del kit                                                                                                                                                              | Qué columnas marca hoy y cuáles marcaría la regla por clase con soporte S = 1, 3, 5, 10                                                                                                                                       |
| Agrupar                             | K-Means, Agglomerative (ward), GMM y HDBSCAN, k = 2..12, dos preprocesamientos («completo» = numéricas + one-hot; «numericas»); 4 datasets del kit, 3 uniformes, 3 de nubes plantadas                                  | Silueta (muestra sembrada de 2.000), BIC, ruido, la **referencia nula** (el mismo agrupador sobre datos uniformes en la caja rotada por PCA, 3 sorteos) y su gap, la estabilidad (R = 10 submuestras del 80 %, ARI), el costo |
| Agglomerative: memoria              | 8.000, 12.000 y 16.000 filas                                                                                                                                                                                           | El `linkage` y la memoria del navegador                                                                                                                                                                                       |
| Pyodide                             | 314.0.2 frente a 314.0.7 en 3 datasets de multiclase y 2 de agrupar                                                                                                                                                    | Versiones cargadas, resultados, tiempos y peso de las wheels                                                                                                                                                                  |

## 2. Resultados

### 2.1 Clasificar en varias categorías

**Costo total del spike por dataset** (las 14 + los baselines con CV k=5, prueba y fuga; no es el
Nivel 1 del producto) **y quién entra al Nivel 1** con el techo de 5 s, con la prioridad de
`ALL_MEMBER_IDS`, el MLP fuera con < 500 filas y las balanceadas fuera si minoritaria × K ≥ 0,8:

| Dataset             |  Filas |   K | Ancho | Chromium (s, mediana · intento) | WebKit (s) |      Entran al Nivel 1 | Σ Nivel 1 (s) |
| ------------------- | -----: | --: | ----: | ------------------------------: | ---------: | ---------------------: | ------------: |
| planes-200 ¹        |    200 |   5 |    10 |                        14,7 · 1 |       12,7 |                     13 |           4,5 |
| planes-fuga-200     |    200 |   5 |    11 |                         5,1 · 1 |        4,3 |                     13 |           4,6 |
| planes-sin-fuga-200 |    200 |   5 |    10 |                         4,9 · 1 |        4,2 |                     13 |           4,7 |
| ocupantes-200       |    200 |   6 |    10 |                         5,1 · 1 |        4,9 |                     13 |           4,8 |
| departamento-200    |    200 |   4 |     7 |                         4,7 · 1 |        4,1 | 11 (balanceadas fuera) |           3,3 |
| planes-5000         |  5.000 |   5 |    10 |                        27,5 · 1 |       26,4 |                      8 |           4,8 |
| sintetico-2000-k5   |  2.000 |   5 |    33 |                        23,6 · 1 |       23,1 |                      8 |           4,6 |
| ancho-2000-k5       |  2.000 |   5 |   112 |                        35,8 · 2 |       35,6 |                      8 |           3,3 |
| sintetico-5000-k5   |  5.000 |   5 |    33 |                        36,9 · 2 |       36,9 |                      8 |           3,6 |
| sintetico-20000-k5  | 20.000 |   5 |    33 |           136,6 · 2 (1 corrida) |      134,2 |                      6 |           4,2 |
| sintetico-2000-k3   |  2.000 |   3 |    33 |                        14,8 · 2 |       17,2 |                      9 |           4,8 |
| sintetico-2000-k10  |  2.000 |  10 |    33 |                        31,0 · 3 |       40,7 |                      9 |           4,2 |
| sintetico-2000-k20  |  2.000 |  20 |    33 |                        48,1 · 3 |       64,9 |                      8 |           3,6 |

¹ `planes-200` incluye la explicabilidad (0,153 s en Chromium, 0,138 s en WebKit, ganador
`logistic_balanced`) y la simulación de azar de las categóricas.

**El techo de 5 s alcanza:** con 200 filas entran las 13 que la regla deja (el MLP queda fuera por
filas) en 3,3–4,8 s; con 2.000–5.000 filas, 8–9; con 20.000, 6. El costo crece con K: el exponente
`d` de `(K/5)^d` es ~1 en la logística (1,00) y HGB (0,98), 0,86 en XGBoost, 0,76 en LightGBM,
~0,3 en los bosques y ~0 en Ridge, Naive Bayes, el árbol y KNN (anexo A, «Modelo de costos»).

**El MLP con parada temprana** convergió en los 17 datasets (12–70 iteraciones de 500). Con 200
filas su F1 en CV fue 0,115–0,293 (la logística, 0,180–0,652 en los mismos nueve datasets): la regla
«MLP con ≥ 500 filas» se sostiene.

**Las dos métricas candidatas, con la misma vara** (regla de un error estándar dentro de train,
veredicto en prueba contra el mejor baseline en esa métrica):

| Lectura                                                        | F1 macro                                    | Exactitud balanceada                     |
| -------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------- |
| Lo que da adivinar (la mayoritaria en prueba, K = 5)           | 0,11–0,12 (depende de las cuotas)           | **0,200 exacto (1/K)**                   |
| Ganadores distintos en 5 particiones de `planes-200`           | 3: logistic ×3, lightgbm ×1, naive_bayes ×1 | **2**: logistic ×3, logistic_balanced ×2 |
| El elegido ES la logística del baseline (empata consigo misma) | 10 de 17                                    | 7 de 17                                  |
| Veredicto a tolerancia 0,01: supera · empata · NO supera       | 4 · 12 · 1                                  | 9 · 7 · 1                                |
| ¿El mismo elegido con las dos métricas?                        | 7 de 17                                     |                                          |
| ¿El mismo veredicto con las dos métricas (tol 0,01)?           | 8 de 17                                     |                                          |

Con la exactitud balanceada, los miembros con pesos por clase (`logistic_balanced`) ganan más a
menudo y superan a la logística simple por 0,012–0,166; con F1 macro, el elegido suele ser la propia
logística. El único «NO supera» es el mismo con las dos: `departamento-200` (el árbol, −0,036 y −0,034).

**Tolerancia del empate:** con F1 macro, 0,01 y 0,02 dan el mismo veredicto en 17 de 17; 0,05
cambia 3 (ancho, departamento, s43 pasan a «empata»). Con la exactitud balanceada, 0,01 y 0,02
difieren en 1 (s43, Δ = 0,012); 0,05 cambia 6.

**Fuga por clase, en train** (anexo A):

| Medida                                        | Máximo en columnas legítimas (soporte 10–19 · ≥ 20) | Legítimas ≥ 0,98 | La plantada                    |
| --------------------------------------------- | --------------------------------------------------- | ---------------- | ------------------------------ |
| Numérica · AUC uno contra el resto            | 0,966 · 0,955                                       | **0 de 738**     | `cargo_corporativo_usd`: 1,000 |
| Categórica · pureza cruda (la fórmula de hoy) | 0,990 · 0,985                                       | **21 de 255** ²  | —                              |
| Categórica · pureza normalizada               | 0,000 · 0,605                                       | **0 de 255**     | —                              |
| Categórica · AUC de la tasa por categoría     | 0,832 · 0,934                                       | 0 de 255         | —                              |

² Las 21 son de `sintetico-2000-k20`: clases de 15–28 filas, donde «el resto» es el 95 % y la
pureza cruda sale alta sin mirar la columna.

**Falsa alarma por azar de las categóricas** (simulación, categoría y clase sin relación, 300 sorteos
por celda): con una clase del 2 %, la pureza cruda supera 0,98 en el 56,0–62,3 % de los sorteos (150 y
600 filas, 3–30 categorías); con una del 5 % y 150 filas, en el 4,3–6,7 %. La pureza normalizada:
**0,0 % en todas las celdas**. El AUC de la tasa: 5,7 % con 2 % y 30 categorías.

**Falsa alarma EXACTA de una numérica** (\|AUC − ½\| ≥ 0,48 sin empates, peor caso sobre el tamaño
del otro lado): soporte 3 → 3,571 %; 4 → 1,587 %; **5 → 0,794 %**; 6 → 0,050 %; 10 → 0,004 %.

**D8 en la binaria** (anexo C): con la regla por clase (soporte S = 5 y pureza normalizada), **0 de
los 11 objetivos binarios del kit cambian de veredicto**, y la columna plantada de
`credito-fuga-plantada.csv` (`monto_recuperado`) sigue marcada con S = 1, 3, 5 y 10. El kit no tiene
objetivos binarios con una clase de menos de 19 filas en train: el borde (soporte < S no marca, ≥ S
marca) lo cubre la prueba unitaria de la F1, no este dataset.

### 2.2 Agrupar sin objetivo

**Lo que separa «hay estructura» de «no hay»** (anexo B, sobre el ganador de cada dataset):

| Regla de lectura                                | Preprocesamiento | Aciertos contra la verdad (4 con grupos plantados · 4 sin estructura) |
| ----------------------------------------------- | ---------------- | --------------------------------------------------------------------: |
| silueta ≥ 0,25 y ARI ≥ 0,8, sin referencia nula | los dos          |           6 de 8: llama «grupos» a los uniformes de 1 y 2 dimensiones |
| gap ≥ 0,05–0,15 y ARI ≥ 0,6–0,7                 | los dos          |                                    **8 de 8** en las 12 combinaciones |
| gap ≥ 0,05–0,15 y ARI ≥ 0,8                     | solo numéricas   |          7 de 8: el ganador por gap de nubes-2000 (HDBSCAN, ARI 0,79) |

El gap es «puntaje del agrupador − el mismo agrupador sobre datos uniformes en la misma caja». El
margen medido: **sin estructura, el gap del ganador no pasa de 0,045; con grupos plantados, no baja
de 0,209**. K-Means sobre datos uniformes de 1 dimensión da silueta 0,62 y ARI 0,98 («estable»): sin
la referencia nula, la lectura se equivoca justo ahí.

**Elegir el ganador entre los cuatro** (k en 2..10; K-Means y Agglomerative eligen k por silueta,
GMM por BIC, HDBSCAN con `min_cluster_size = max(5, n/50)`):

| Dataset (verdad)          | Prepro.   | k por agrupador (KM · AG · GMM · HDB) | Por puntaje (P11) | Por gap               | Por consenso                   |
| ------------------------- | --------- | ------------------------------------- | ----------------- | --------------------- | ------------------------------ |
| segmentos-300 (k = 3)     | numericas | 5 · 3 · 3 · 3                         | K-Means k = 5     | HDBSCAN k = 3 ★       | Agglomerative k = 3 ★ (3 de 4) |
| nubes-2000-k4 (k = 4)     | numericas | 4 · 4 · 4 · 3                         | K-Means k = 4 ★   | HDBSCAN k = 3         | K-Means k = 4 ★ (3 de 4)       |
| nubes-5000-k4 (k = 4)     | numericas | 4 · 4 · 4 · 2                         | K-Means k = 4 ★   | HDBSCAN k = 2         | K-Means k = 4 ★ (3 de 4)       |
| nubes-20000-k4 (ver nota) | numericas | 2 · — · 5 · 2                         | K-Means k = 2     | HDBSCAN k = 2         | K-Means k = 2 (2 de 3)         |
| segmentos-300 (k = 3)     | completo  | 3 · 3 · 7 · 9                         | K-Means k = 3 ★   | Agglomerative k = 3 ★ | K-Means k = 3 ★ (2 de 4)       |
| nubes-2000-k4 (k = 4)     | completo  | 4 · 4 · 8 · 4                         | K-Means k = 4 ★   | HDBSCAN k = 4 ★       | K-Means k = 4 ★ (3 de 4)       |

«Por consenso» = el k en el que coinciden más agrupadores (empate → el k cuyo mejor miembro tiene
más puntaje) y, entre ellos, el de mayor puntaje. No agrega ningún parámetro. Con solo numéricas
recupera el k plantado en 3 de 3; «por puntaje», en 2 de 3; «por gap», en 1 de 3. Con solo
numéricas, la lectura (gap ≥ 0,10 y ARI ≥ 0,7) dice «existen» sobre el ganador de las tres reglas en
los cuatro plantados y «no hay estructura» en los cuatro sin estructura. Con el one-hot, en
`segmentos` el k de K-Means cambia al poner el tope en 10 y su estabilidad para ese k no se midió
(«ARI no medido» en el anexo B).

**Nota sobre `nubes-20000-k4`:** sus cuatro centros salieron al azar con la semilla 806 y quedaron
como un grupo lejos y tres cerca (distancias 4,46–7,95 entre los tres; 10,47–14,88 al cuarto). Una
silueta que ve 2 grupos ahí no es un error del agrupador; ese dataset no cuenta para el k.

**El preprocesamiento.** Con el one-hot de las categóricas, en k = 2..12, K-Means y Agglomerative
eligen 12 y 11 grupos en `segmentos` (con el tope en 10, 3), y GMM por BIC no acierta el k plantado
en ninguno (12 en `segmentos`; 8, 12 y 10 en las nubes): las categorías fabrican grupos. Con solo
numéricas, GMM por BIC da 3 ★, 4 ★ y 4 ★ (5 en las nubes de 20.000). A favor
del one-hot: en las nubes, la categórica correlacionada ayuda a HDBSCAN a ver 4.

**HDBSCAN según `min_cluster_size`:** en `segmentos`, 5 → 9 grupos; 6 (= n/50) → 3 sin ruido. En los
datos sin estructura, la regla deja mucho ruido (`sin-grupos` 67 %, uniforme de 2 dimensiones 39 %,
de 4 dimensiones 100 %; el de 1 dimensión, 10 %), y el puntaje silueta × (1 − ruido) lo castiga: en
ninguno de ellos HDBSCAN gana por puntaje descartando filas.

**Estabilidad, R = 5 frente a R = 10:** la media del ARI con las 5 primeras submuestras queda a
≤ 0,05 de la de 10 en 62 de 66 celdas. Las cuatro que no: HDBSCAN y Agglomerative en `consumo-200`
con one-hot (0,48 frente a 0,35; 0,52 frente a 0,67), Agglomerative en el uniforme de 2 dimensiones
(0,58 frente a 0,66) y GMM en las nubes de 20.000 (0,71 frente a 0,80).

**Agglomerative y la memoria:** el `linkage` tardó 1,00 / 2,25 / 4,53 s con 8.000 / 12.000 / 16.000
filas en Chromium (el dataset entero, 0,9 / 2,0 / 3,8 s en WebKit), con la memoria del navegador en 809 / 1.292 / 2.146 MB.
**Ninguna sonda abortó hasta 16.000 filas**; el tamaño que aborta no se encontró.

**Costo por agrupador** (Chromium, solo numéricas; ajuste sumado sobre k = 2..12 + estabilidad
R = 10): con ≤ 2.000 filas, cada agrupador ≤ 0,29 s de ajuste y ≤ 0,51 s de estabilidad; con 5.000,
≤ 0,36 s y ≤ 1,77 s; con 20.000, K-Means 0,46 + 0,10 s, GMM 1,20 + 0,64 s y HDBSCAN 2,60 + 18,22 s
(con carga en Chromium; WebKit dio el dataset entero en 87,3 s).

### 2.3 Pyodide 314.0.7 frente a 314.0.2

| Qué                                                               | 314.0.2 (el pin)                                                                | 314.0.7                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------- |
| Versiones cargadas en el navegador                                | numpy 2.4.3 · scikit-learn 1.8.0                                                | numpy **2.4.6** · scikit-learn 1.8.0      |
| scipy · pandas · xgboost · lightgbm (lockfile)                    | 1.18.0 · 3.0.2 · 2.1.4 · 4.6.0                                                  | las mismas                                |
| Python (según el lockfile)                                        | 3.14.0                                                                          | **3.14.2**                                |
| Peso (núcleo + 11 wheels)                                         | 41.497.725 bytes                                                                | 41.563.579 bytes (**+64,3 KiB**, +0,16 %) |
| Resultados                                                        | **idénticos en 5 de 5 datasets** (39 corridas: 27 de multiclase, 12 de agrupar) |                                           |
| Tiempo, mediana (s): planes-200 · planes-5000 · sintetico-2000-k5 | 13,9 · 21,3 · 20,9                                                              | 13,9 · 21,6 · 21,0                        |
| Tiempo, mediana (s): segmentos-300 · nubes-2000-k4                | 1,9 · 14,6                                                                      | 1,9 · 14,4                                |

## 3. Umbrales que esta tabla permite fijar

Cada propuesta, con la celda que la sostiene y la constante exportada con su test (se escriben en la
F1 y la F2, después de tu decisión):

| #   | Umbral                      | Propuesta                                                                                                                                                      | Celda que la sostiene                                                                                 | Constante · test                                                                                       |
| --- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | Métrica primaria multiclase | **Exactitud balanceada**, con F1 macro a la vista                                                                                                              | 2.1: 2 ganadores distintos en 5 particiones (F1 macro: 3); adivinar = 1/K exacto                      | `METRIC_RULES` / `SCORER` · `verdict.test.ts`, paridad con `pipeline.py`                               |
| 2   | Empate contra el baseline   | **0,01 absoluto** (el de la binaria)                                                                                                                           | 2.1: 0,01 y 0,02 coinciden en 16–17 de 17                                                             | `METRIC_RULES` · `verdict.test.ts`                                                                     |
| 3   | Fuga por clase              | Umbral **0,98**; **soporte mínimo S = 5** de cada lado; categóricas con **pureza normalizada**; la binaria adopta la misma regla (D8)                          | 2.1: S = 5 → 0,794 %; normalizada 0 de 255 y 0,0 % por azar; 0 de 11 binarios cambian                 | `LEAKAGE_CLASS_MIN_SUPPORT` · `leakage.test.ts` (borde S − 1 / S)                                      |
| 4   | k y criterio                | k en **2..10**; silueta (K-Means, Agglomerative), BIC (GMM), HDBSCAN con `max(5, n/50)`; distancia con **solo numéricas** si hay ≥ 2; ganador **por consenso** | 2.2: consenso 3 de 3; one-hot fabrica grupos                                                          | `CLUSTER_K_RANGE`, `HDBSCAN_MIN_CLUSTER_SHARE`, `CLUSTER_MIN_NUMERIC` · `verdict.test.ts` (P11)        |
| 5   | Cuándo «los grupos existen» | **gap ≥ 0,10** con la referencia nula (3 sorteos) **y ARI ≥ 0,7** con R = 10, f = 0,8; gap ≥ 0,10 y ARI < 0,7 → «frágiles»; gap < 0,10 → «no hay estructura»   | 2.2: 8 de 8; margen 0,045 / 0,209                                                                     | `CLUSTER_GAP_MIN`, `CLUSTER_STABILITY_MIN`, `STABILITY_RUNS`, `STABILITY_FRACTION` · `verdict.test.ts` |
| 6   | Pyodide                     | **Se queda en 314.0.2**: la regla aprobada pide peso ≤ y pesa 64,3 KiB más                                                                                     | 2.3                                                                                                   | `runtime-pin.test.ts` sin cambios; sin ADR 018                                                         |
| —   | Agglomerative en muestra    | `AGGLO_MAX_ROWS = 8.000`                                                                                                                                       | 2.2: con 8.000 filas la memoria no pasó del pico previo (809 MB); 16.000 llegó a 2.146 MB sin abortar | `AGGLO_MAX_ROWS` · prueba de integración del modo muestra                                              |
| —   | Roster y costos multiclase  | Los 14 ids en el orden de `ALL_MEMBER_IDS`; balanceadas fuera con minoritaria × K ≥ 0,8; MLP con ≥ 500 filas; coeficientes del anexo A                         | 2.1                                                                                                   | `ROSTER_BY_TASK`, `COST_COEFFICIENTS_BY_TASK` · `roster.test.ts`, `costos.test.ts`                     |

## 4. Lo que el spike NO midió (y se declara)

- **Los payloads los arma el arnés**, no `prepareRun`: la rama multiclase y la entrada de agrupar
  llegan en la F1 y la F2. Se usan las funciones reales que existen (`parseCsvWithLimits`,
  `sanitizeTable`, `selectFeatures`, `stratifiedSplit`). En agrupar, la exclusión del identificador
  de `segmentos` la declara el arnés a mano; en la F2 la decide la regla de id-like de la app.
- **La falsa alarma exacta de una numérica** supone valores sin empates (Mann-Whitney continuo).
  Con columnas discretas (muchos empates), la distribución nula cambia; lo que mide el spike en
  columnas legítimas es el control empírico.
- **La simulación de azar de las categóricas** usa categorías equiprobables; una categoría
  dominante cambia las cifras.
- **El costo del flujo de agrupar del producto no se midió como flujo:** el spike corre los dos
  preprocesamientos, k hasta 12, la referencia nula en cada k y la estabilidad de los cuatro. El
  producto hará una sola variante, la referencia nula solo en el k elegido y la estabilidad del
  ganador y del elegido. Las celdas por agrupador (2.2) alcanzan para ajustar el modelo de costos de
  agrupar en la F2; el techo de 5 s para agrupar se verifica ahí con el flujo real.
- **El tamaño en que Agglomerative aborta** no se encontró (16.000 filas cupieron). La propuesta de
  8.000 es prudente, no «la mitad del que aborta» como decía el plan.
- **Otras formas de mezclar categóricas en la distancia** (one-hot con peso reducido, Gower) no se
  midieron: la propuesta 4 compara solo «completo» contra «solo numéricas».
- **D8 con clases chicas en la binaria:** el kit no tiene un objetivo binario con menos de 19 filas
  en la clase chica; el borde lo prueba la unitaria de la F1.
- **Las nubes de 20.000 filas** tienen una geometría que no es «cuatro grupos parejos» (nota de 2.2).
- **WebKit** no corre en la CI; aquí es una segunda lectura, como en el S5 y el S6.
- **La carga de Chromium** subió durante las nubes de 5.000 y 20.000 en los tres intentos; esos dos
  tiempos quedan marcados «con carga» y su lectura limpia es la de WebKit.

## Anexo A — Multiclase: tablas completas

Salida literal de `SPIKE_OUT=<dir> node scripts/spike-multiclase/tabla.mjs chromium-limpio,webkit` (Chromium: la corrida que eligió `elegir-intento.mjs` por dataset; los títulos «### chromium» se refieren a ella).

#### chromium 153.0.8010.12 · Pyodide public/pyodide — condiciones (2026-10-04T22:07)

Carga del lote (load average de 1 min; umbral 5): antes 2.99 → después 5.03.

| Paquetes     | Runtime (ms) | Paquetes (ms) | Total (ms) |
| ------------ | -----------: | ------------: | ---------: |
| sin boosters |         1201 |          1129 |       2330 |
| con boosters |         1083 |          1159 |       2242 |

| Dataset             | Filas |   K | Train | Ancho | Corridas (s)       | Mediana (s) | Carga antes → después |
| ------------------- | ----: | --: | ----: | ----: | ------------------ | ----------: | --------------------- |
| planes-200          |   200 |   5 |   150 |    10 | 17.4 / 14.0 / 14.7 |        14.7 | 3.09 → 3.13           |
| planes-fuga-200     |   200 |   5 |   148 |    11 | 4.6 / 5.1 / 5.3    |         5.1 | 3.13 → 3.03           |
| planes-sin-fuga-200 |   200 |   5 |   148 |    10 | 4.6 / 5.7 / 4.9    |         4.9 | 3.03 → 3.39           |
| ocupantes-200       |   200 |   6 |   150 |    10 | 5.5 / 5.1 / 5.0    |         5.1 | 3.39 → 3.56           |
| departamento-200    |   200 |   4 |   150 |     7 | 5.3 / 4.7 / 4.7    |         4.7 | 3.56 → 3.42           |
| planes-5000         |  5000 |   5 |  3749 |    10 | 27.0 / 27.5 / 35.1 |        27.5 | 3.42 → 3.69           |
| sintetico-2000-k5   |  2000 |   5 |  1499 |    33 | 23.1 / 23.6 / 24.9 |        23.6 | 3.69 → 4.88           |
| ancho-2000-k5       |  2000 |   5 |  1499 |   112 | 37.6 / 34.9 / 35.8 |        35.8 | 3.42 → 2.42           |
| sintetico-5000-k5   |  5000 |   5 |  3749 |    33 | 36.9 / 35.5 / 39.5 |        36.9 | 2.42 → 2.1            |
| sintetico-20000-k5  | 20000 |   5 | 15000 |    33 | 136.6              |       136.6 | 2.1 → 2.2             |
| sintetico-2000-k3   |  2000 |   3 |  1500 |    33 | 15.7 / 14.8 / 14.0 |        14.8 | 2.2 → 2.05            |
| sintetico-2000-k10  |  2000 |  10 |  1497 |    33 | 31.0 / 31.0 / 29.8 |        31.0 | 2.37 → 3.1            |
| sintetico-2000-k20  |  2000 |  20 |  1499 |    33 | 47.0 / 50.3 / 48.1 |        48.1 | 3.1 → 3.11            |
| planes-200-s43      |   200 |   5 |   150 |    10 | 4.8                |         4.8 | 3.11 → 3.1            |
| planes-200-s44      |   200 |   5 |   150 |    10 | 4.7                |         4.7 | 4.97 → 4.65           |
| planes-200-s45      |   200 |   5 |   150 |    10 | 4.8                |         4.8 | 4.65 → 4.36           |
| planes-200-s46      |   200 |   5 |   150 |    10 | 4.9                |         4.9 | 4.36 → 4.25           |

#### webkit 26.6 · Pyodide public/pyodide — condiciones (2026-10-04T21:53)

Carga del lote (load average de 1 min; umbral 5): antes 2.45 → después 4.09.

| Paquetes     | Runtime (ms) | Paquetes (ms) | Total (ms) |
| ------------ | -----------: | ------------: | ---------: |
| sin boosters |          898 |           775 |       1673 |
| con boosters |          826 |           849 |       1675 |

| Dataset             | Filas |   K | Train | Ancho | Corridas (s) | Mediana (s) | Carga antes → después |
| ------------------- | ----: | --: | ----: | ----: | ------------ | ----------: | --------------------- |
| planes-200          |   200 |   5 |   150 |    10 | 12.7         |        12.7 | 4.44 → 3.88           |
| planes-fuga-200     |   200 |   5 |   148 |    11 | 4.3          |         4.3 | 3.88 → 3.88           |
| planes-sin-fuga-200 |   200 |   5 |   148 |    10 | 4.2          |         4.2 | 3.88 → 3.73           |
| ocupantes-200       |   200 |   6 |   150 |    10 | 4.9          |         4.9 | 3.73 → 3.67           |
| departamento-200    |   200 |   4 |   150 |     7 | 4.1          |         4.1 | 3.67 → 3.62           |
| planes-5000         |  5000 |   5 |  3749 |    10 | 26.4         |        26.4 | 3.62 → 3.37           |
| sintetico-2000-k5   |  2000 |   5 |  1499 |    33 | 23.1         |        23.1 | 3.37 → 3.04           |
| ancho-2000-k5       |  2000 |   5 |  1499 |   112 | 35.6         |        35.6 | 3.04 → 2.71           |
| sintetico-5000-k5   |  5000 |   5 |  3749 |    33 | 36.9         |        36.9 | 2.71 → 2.4            |
| sintetico-20000-k5  | 20000 |   5 | 15000 |    33 | 134.2        |       134.2 | 2.4 → 2.38            |
| sintetico-2000-k3   |  2000 |   3 |  1500 |    33 | 17.2         |        17.2 | 2.38 → 2.88           |
| sintetico-2000-k10  |  2000 |  10 |  1497 |    33 | 40.7         |        40.7 | 2.88 → 2.84           |
| sintetico-2000-k20  |  2000 |  20 |  1499 |    33 | 64.9         |        64.9 | 2.84 → 2.71           |
| planes-200-s43      |   200 |   5 |   150 |    10 | 4.5          |         4.5 | 2.71 → 2.66           |
| planes-200-s44      |   200 |   5 |   150 |    10 | 4.8          |         4.8 | 2.66 → 4.36           |
| planes-200-s45      |   200 |   5 |   150 |    10 | 4.6          |         4.6 | 4.36 → 4.09           |
| planes-200-s46      |   200 |   5 |   150 |    10 | 4.4          |         4.4 | 4.09 → 4.09           |

#### chromium — costo por miembro: CV k=5 (s, mediana) · ⚠ no-convergencia · ✗ error

| Miembro           | planes-200 | planes-fuga-200 | planes-sin-fuga-200 | ocupantes-200 | departamento-200 | planes-5000 | sintetico-2000-k5 | ancho-2000-k5 | sintetico-5000-k5 | sintetico-20000-k5 | sintetico-2000-k3 | sintetico-2000-k10 | sintetico-2000-k20 | planes-200-s43 | planes-200-s44 | planes-200-s45 | planes-200-s46 |
| ----------------- | ---------: | --------------: | ------------------: | ------------: | ---------------: | ----------: | ----------------: | ------------: | ----------------: | -----------------: | ----------------: | -----------------: | -----------------: | -------------: | -------------: | -------------: | -------------: |
| logistic          |       0.05 |            0.05 |                0.05 |          0.05 |             0.05 |        0.23 |              0.14 |          0.21 |              0.30 |   0.64 (k=3: 0.34) |              0.09 |               0.20 |               0.36 |           0.04 |           0.04 |           0.04 |           0.05 |
| logistic_balanced |       0.05 |            0.05 |                0.05 |          0.06 |             0.05 |        0.23 |              0.16 |          0.23 |              0.23 |   0.70 (k=3: 0.37) |              0.09 |               0.20 |               0.34 |           0.05 |           0.05 |           0.05 |           0.06 |
| ridge             |       0.05 |            0.05 |                0.04 |          0.05 |             0.05 |        0.10 |              0.08 |          0.15 |              0.11 |   0.33 (k=3: 0.19) |              0.07 |               0.07 |               0.07 |           0.04 |           0.04 |           0.04 |           0.05 |
| naive_bayes       |       0.05 |            0.04 |                0.04 |          0.04 |             0.04 |        0.08 |              0.07 |          0.08 |              0.09 |   0.29 (k=3: 0.18) |              0.06 |               0.06 |               0.06 |           0.04 |           0.04 |           0.04 |           0.05 |
| linear_svc        |       0.05 |            0.04 |                0.04 |          0.04 |             0.04 |        0.10 |              0.09 |          0.13 |              0.12 |   0.46 (k=3: 0.25) |              0.07 |               0.09 |               0.11 |           0.04 |           0.04 |           0.04 |           0.05 |
| decision_tree     |       0.04 |            0.04 |                0.04 |          0.05 |             0.04 |        0.10 |              0.09 |          0.16 |              0.18 |   0.86 (k=3: 0.43) |              0.08 |               0.09 |               0.09 |           0.05 |           0.04 |           0.04 |           0.05 |
| knn               |       0.05 |            0.04 |                0.04 |          0.04 |             0.04 |        0.15 |              0.09 |          0.10 |              0.18 |   1.95 (k=3: 1.25) |              0.07 |               0.07 |               0.08 |           0.05 |           0.04 |           0.04 |           0.04 |
| hgb               |       0.43 |            0.39 |                0.41 |          0.49 |             0.33 |        2.79 |              3.95 |          6.89 |              4.70 |   4.32 (k=3: 4.49) |              1.93 |               5.95 |              11.20 |           0.41 |           0.37 |           0.38 |           0.40 |
| lightgbm          |       0.47 |            0.42 |                0.44 |          0.51 |             0.33 |        4.72 |              4.75 |          5.67 |              7.25 |   9.54 (k=3: 7.15) |              2.80 |               6.91 |              10.98 |           0.50 |           0.39 |           0.41 |           0.46 |
| xgboost           |       0.28 |            0.25 |                0.28 |          0.36 |             0.31 |        1.86 |              2.96 |          6.12 |              4.76 |   8.39 (k=3: 5.63) |              1.40 |               4.14 |               6.59 |           0.32 |           0.28 |           0.25 |           0.26 |
| extra_trees       |       0.61 |            0.73 |                0.63 |          0.61 |             0.63 |        3.30 |              1.50 |          1.53 |              2.92 |  11.78 (k=3: 4.93) |              1.15 |               1.46 |               1.74 |           0.65 |           0.63 |           0.68 |           0.63 |
| forest            |       0.78 |            0.83 |                0.88 |          0.80 |             0.85 |        2.56 |              1.79 |          2.33 |              3.60 |  14.76 (k=3: 7.21) |              1.43 |               1.85 |               1.99 |           0.74 |           0.81 |           0.89 |           0.81 |
| forest_balanced   |       0.76 |            0.82 |                0.87 |          0.80 |             0.83 |        2.51 |              1.82 |          2.35 |              3.38 |  15.22 (k=3: 6.76) |              1.42 |               1.79 |               2.03 |           0.75 |           0.77 |           0.82 |           0.81 |
| mlp               |       0.08 |            0.10 |                0.09 |          0.07 |             0.09 |        1.83 |              1.04 |          2.25 |              1.61 |   4.45 (k=3: 2.25) |              0.69 |               1.17 |               1.51 |           0.10 |           0.09 |           0.07 |           0.10 |

#### La regla de un error estándar con f1_macro y con exactitud balanceada (CV k=5 dentro de train)

| Dataset             |   K | ★ máx f1          | ◆ 1 EE f1         | ◆ 1 EE exact. bal. | ¿mismo? | f1 prueba ◆ | mayoritaria | logística | Δ vs mejor baseline | tol 0,01  | tol 0,02  | tol 0,05 |
| ------------------- | --: | ----------------- | ----------------- | ------------------ | :-----: | ----------: | ----------: | --------: | ------------------: | --------- | --------- | -------- |
| planes-200          |   5 | logistic_balanced | logistic          | logistic_balanced  |    ✗    |       0.543 |       0.110 |     0.543 |               0.000 | empata    | empata    | empata   |
| planes-fuga-200     |   5 | xgboost           | logistic_balanced | logistic_balanced  |    ✓    |       0.687 |       0.119 |     0.636 |               0.051 | supera    | supera    | supera   |
| planes-sin-fuga-200 |   5 | logistic_balanced | logistic          | logistic_balanced  |    ✗    |       0.571 |       0.119 |     0.571 |               0.000 | empata    | empata    | empata   |
| ocupantes-200       |   6 | hgb               | hgb               | logistic           |    ✗    |       0.404 |       0.065 |     0.305 |               0.099 | supera    | supera    | supera   |
| departamento-200    |   4 | hgb               | decision_tree     | decision_tree      |    ✓    |       0.221 |       0.115 |     0.257 |              -0.036 | NO supera | NO supera | empata   |
| planes-5000         |   5 | logistic_balanced | logistic_balanced | logistic_balanced  |    ✓    |       0.653 |       0.113 |     0.649 |               0.004 | empata    | empata    | empata   |
| sintetico-2000-k5   |   5 | lightgbm          | logistic          | logistic_balanced  |    ✗    |       0.751 |       0.120 |     0.751 |               0.000 | empata    | empata    | empata   |
| ancho-2000-k5       |   5 | lightgbm          | hgb               | logistic           |    ✗    |       0.815 |       0.118 |     0.767 |               0.048 | supera    | supera    | empata   |
| sintetico-5000-k5   |   5 | logistic          | logistic          | logistic_balanced  |    ✗    |       0.749 |       0.121 |     0.749 |               0.000 | empata    | empata    | empata   |
| sintetico-20000-k5  |   5 | logistic          | logistic          | logistic_balanced  |    ✗    |       0.766 |       0.121 |     0.766 |               0.000 | empata    | empata    | empata   |
| sintetico-2000-k3   |   3 | linear_svc        | logistic          | logistic           |    ✓    |       0.908 |       0.233 |     0.908 |               0.000 | empata    | empata    | empata   |
| sintetico-2000-k10  |  10 | logistic          | logistic          | logistic           |    ✓    |       0.573 |       0.052 |     0.573 |               0.000 | empata    | empata    | empata   |
| sintetico-2000-k20  |  20 | logistic          | logistic          | logistic_balanced  |    ✗    |       0.390 |       0.022 |     0.390 |               0.000 | empata    | empata    | empata   |
| planes-200-s43      |   5 | lightgbm          | lightgbm          | logistic_balanced  |    ✗    |       0.746 |       0.110 |     0.718 |               0.028 | supera    | supera    | empata   |
| planes-200-s44      |   5 | logistic          | logistic          | logistic           |    ✓    |       0.446 |       0.110 |     0.446 |               0.000 | empata    | empata    | empata   |
| planes-200-s45      |   5 | logistic          | logistic          | logistic           |    ✓    |       0.407 |       0.110 |     0.407 |               0.000 | empata    | empata    | empata   |
| planes-200-s46      |   5 | naive_bayes       | naive_bayes       | logistic           |    ✗    |       0.565 |       0.110 |     0.556 |               0.009 | empata    | empata    | empata   |

**Con la exactitud balanceada como primaria** (el elegido por 1 EE con esa métrica, su prueba y el veredicto contra el mejor baseline en esa métrica; «¿mismo veredicto?» lo compara con el de f1_macro a tolerancia 0,01):

| Dataset             | ◆ 1 EE exact. bal. | exact. bal. prueba ◆ | mayoritaria (= 1/K) | logística |      Δ | tol 0,01  | tol 0,02  | tol 0,05 | ¿mismo veredicto? |
| ------------------- | ------------------ | -------------------: | ------------------: | --------: | -----: | --------- | --------- | -------- | :---------------: |
| planes-200          | logistic_balanced  |                0.598 |               0.200 |     0.538 |  0.061 | supera    | supera    | supera   |         ✗         |
| planes-fuga-200     | logistic_balanced  |                0.785 |               0.200 |     0.633 |  0.152 | supera    | supera    | supera   |         ✓         |
| planes-sin-fuga-200 | logistic_balanced  |                0.751 |               0.200 |     0.586 |  0.166 | supera    | supera    | supera   |         ✗         |
| ocupantes-200       | logistic           |                0.300 |               0.167 |     0.300 |  0.000 | empata    | empata    | empata   |         ✗         |
| departamento-200    | decision_tree      |                0.226 |               0.250 |     0.260 | -0.034 | NO supera | NO supera | empata   |         ✓         |
| planes-5000         | logistic_balanced  |                0.696 |               0.200 |     0.641 |  0.055 | supera    | supera    | supera   |         ✗         |
| sintetico-2000-k5   | logistic_balanced  |                0.776 |               0.200 |     0.729 |  0.048 | supera    | supera    | empata   |         ✗         |
| ancho-2000-k5       | logistic           |                0.772 |               0.200 |     0.772 |  0.000 | empata    | empata    | empata   |         ✗         |
| sintetico-5000-k5   | logistic_balanced  |                0.777 |               0.200 |     0.739 |  0.037 | supera    | supera    | empata   |         ✗         |
| sintetico-20000-k5  | logistic_balanced  |                0.784 |               0.200 |     0.752 |  0.032 | supera    | supera    | empata   |         ✗         |
| sintetico-2000-k3   | logistic           |                0.904 |               0.333 |     0.904 |  0.000 | empata    | empata    | empata   |         ✓         |
| sintetico-2000-k10  | logistic           |                0.564 |               0.100 |     0.564 |  0.000 | empata    | empata    | empata   |         ✓         |
| sintetico-2000-k20  | logistic_balanced  |                0.410 |               0.050 |     0.386 |  0.025 | supera    | supera    | empata   |         ✗         |
| planes-200-s43      | logistic_balanced  |                0.738 |               0.200 |     0.725 |  0.012 | supera    | empata    | empata   |         ✓         |
| planes-200-s44      | logistic           |                0.481 |               0.200 |     0.481 |  0.000 | empata    | empata    | empata   |         ✓         |
| planes-200-s45      | logistic           |                0.431 |               0.200 |     0.431 |  0.000 | empata    | empata    | empata   |         ✓         |
| planes-200-s46      | logistic           |                0.553 |               0.200 |     0.553 |  0.000 | empata    | empata    | empata   |         ✓         |

**Estabilidad del ganador entre 5 particiones de `planes-200` (semillas 42, 43, 44, 45, 46):** con f1_macro → logistic ×3, lightgbm ×1, naive_bayes ×1; con exactitud balanceada → logistic_balanced ×2, logistic ×3.

#### MLP con parada temprana: convergencia

| Dataset             | Filas | iteraciones / máx | aviso | f1 CV | f1 prueba |
| ------------------- | ----: | ----------------- | :---: | ----: | --------: |
| planes-200          |   200 | 34 / 500          |   —   | 0.168 |     0.322 |
| planes-fuga-200     |   200 | 22 / 500          |   —   | 0.293 |     0.296 |
| planes-sin-fuga-200 |   200 | 12 / 500          |   —   | 0.149 |     0.060 |
| ocupantes-200       |   200 | 16 / 500          |   —   | 0.119 |     0.082 |
| departamento-200    |   200 | 17 / 500          |   —   | 0.115 |     0.152 |
| planes-5000         |  5000 | 49 / 500          |   —   | 0.618 |     0.643 |
| sintetico-2000-k5   |  2000 | 41 / 500          |   —   | 0.695 |     0.712 |
| ancho-2000-k5       |  2000 | 34 / 500          |   —   | 0.749 |     0.752 |
| sintetico-5000-k5   |  5000 | 31 / 500          |   —   | 0.764 |     0.736 |
| sintetico-20000-k5  | 20000 | 17 / 500          |   —   | 0.746 |     0.765 |
| sintetico-2000-k3   |  2000 | 44 / 500          |   —   | 0.876 |     0.910 |
| sintetico-2000-k10  |  2000 | 38 / 500          |   —   | 0.532 |     0.447 |
| sintetico-2000-k20  |  2000 | 70 / 500          |   —   | 0.322 |     0.407 |
| planes-200-s43      |   200 | 34 / 500          |   —   | 0.185 |     0.355 |
| planes-200-s44      |   200 | 40 / 500          |   —   | 0.195 |     0.324 |
| planes-200-s45      |   200 | 34 / 500          |   —   | 0.124 |     0.387 |
| planes-200-s46      |   200 | 49 / 500          |   —   | 0.154 |     0.378 |

#### Fuga por clase sobre train: el máximo de cada medida en columnas LEGÍTIMAS, por soporte mín(clase, resto)

| Medida                                                | soporte < 5 | 5–9 | 10–19 |  ≥ 20 | ≥ 0,98 en legítimas | plantada (cargo_corporativo_usd) |
| ----------------------------------------------------- | ----------: | --: | ----: | ----: | ------------------: | -------------------------------: |
| numérica · AUC uno-contra-resto                       |           — |   — | 0.966 | 0.955 |            0 de 738 |                            1.000 |
| categórica · pureza cruda (la fórmula binaria de hoy) |           — |   — | 0.990 | 0.985 |           21 de 255 |                                — |
| categórica · pureza normalizada                       |           — |   — | 0.000 | 0.605 |            0 de 255 |                                — |
| categórica · AUC de la tasa por categoría             |           — |   — | 0.832 | 0.934 |            0 de 255 |                                — |

**Falsas alarmas en columnas legítimas (≥ 0,98):**

- sintetico-2000-k20 · c1 → clase_13 (purity 0.9833, soporte 25)
- sintetico-2000-k20 · c1 → clase_14 (purity 0.984, soporte 24)
- sintetico-2000-k20 · c1 → clase_15 (purity 0.9813, soporte 28)
- sintetico-2000-k20 · c1 → clase_17 (purity 0.9833, soporte 25)
- sintetico-2000-k20 · c1 → clase_18 (purity 0.984, soporte 24)
- sintetico-2000-k20 · c1 → clase_19 (purity 0.9873, soporte 19)
- sintetico-2000-k20 · c1 → clase_20 (purity 0.9893, soporte 16)
- sintetico-2000-k20 · c2 → clase_13 (purity 0.9853, soporte 21)
- sintetico-2000-k20 · c2 → clase_14 (purity 0.9839, soporte 23)
- sintetico-2000-k20 · c2 → clase_15 (purity 0.9811, soporte 27)
- sintetico-2000-k20 · c2 → clase_17 (purity 0.9825, soporte 25)
- sintetico-2000-k20 · c2 → clase_18 (purity 0.9839, soporte 23)
- sintetico-2000-k20 · c2 → clase_19 (purity 0.9881, soporte 17)
- sintetico-2000-k20 · c2 → clase_20 (purity 0.9895, soporte 15)
- sintetico-2000-k20 · c3 → clase_13 (purity 0.9833, soporte 25)
- sintetico-2000-k20 · c3 → clase_14 (purity 0.984, soporte 24)
- sintetico-2000-k20 · c3 → clase_15 (purity 0.9813, soporte 28)
- sintetico-2000-k20 · c3 → clase_17 (purity 0.9833, soporte 25)
- sintetico-2000-k20 · c3 → clase_18 (purity 0.984, soporte 24)
- sintetico-2000-k20 · c3 → clase_19 (purity 0.9873, soporte 19)
- sintetico-2000-k20 · c3 → clase_20 (purity 0.9893, soporte 16)

#### Falsas alarmas POR AZAR de cada medida categórica (simulación: categoría y clase sorteadas sin relación; fracción de sorteos ≥ 0,98)

| Filas de train | Cuota de la clase | Categorías | Sorteos | Pureza cruda | Pureza normalizada | AUC de la tasa |
| -------------: | ----------------: | ---------: | ------: | -----------: | -----------------: | -------------: |
|            150 |               2 % |          3 |     300 |       60.0 % |              0.0 % |          0.0 % |
|            150 |               2 % |         10 |     300 |       62.3 % |              0.0 % |          0.0 % |
|            150 |               2 % |         30 |     300 |       58.7 % |              0.0 % |          5.7 % |
|            150 |               5 % |          3 |     300 |        6.7 % |              0.0 % |          0.0 % |
|            150 |               5 % |         10 |     300 |        4.3 % |              0.0 % |          0.0 % |
|            150 |               5 % |         30 |     300 |        5.7 % |              0.0 % |          0.3 % |
|            150 |              10 % |          3 |     300 |        0.0 % |              0.0 % |          0.0 % |
|            150 |              10 % |         10 |     300 |        0.0 % |              0.0 % |          0.0 % |
|            150 |              10 % |         30 |     300 |        0.0 % |              0.0 % |          0.0 % |
|            150 |              30 % |          3 |     300 |        0.0 % |              0.0 % |          0.0 % |
|            150 |              30 % |         10 |     300 |        0.0 % |              0.0 % |          0.0 % |
|            150 |              30 % |         30 |     300 |        0.0 % |              0.0 % |          0.0 % |
|            600 |               2 % |          3 |     300 |       56.0 % |              0.0 % |          0.0 % |
|            600 |               2 % |         10 |     300 |       60.3 % |              0.0 % |          0.0 % |
|            600 |               2 % |         30 |     300 |       58.7 % |              0.0 % |          0.0 % |
|            600 |               5 % |          3 |     300 |        0.0 % |              0.0 % |          0.0 % |
|            600 |               5 % |         10 |     300 |        0.0 % |              0.0 % |          0.0 % |
|            600 |               5 % |         30 |     300 |        0.0 % |              0.0 % |          0.0 % |
|            600 |              10 % |          3 |     300 |        0.0 % |              0.0 % |          0.0 % |
|            600 |              10 % |         10 |     300 |        0.0 % |              0.0 % |          0.0 % |
|            600 |              10 % |         30 |     300 |        0.0 % |              0.0 % |          0.0 % |
|            600 |              30 % |          3 |     300 |        0.0 % |              0.0 % |          0.0 % |
|            600 |              30 % |         10 |     300 |        0.0 % |              0.0 % |          0.0 % |
|            600 |              30 % |         30 |     300 |        0.0 % |              0.0 % |          0.0 % |

#### Falsa alarma EXACTA por azar de una numérica (|AUC − ½| ≥ 0,48), según el soporte de la clase más chica — el peor caso sobre el tamaño del otro lado

| Soporte m | otro lado 5 | otro lado 10 | otro lado 20 | otro lado 50 | otro lado 100 | otro lado 200 | otro lado 400 | peor caso |
| --------: | ----------: | -----------: | -----------: | -----------: | ------------: | ------------: | ------------: | --------: |
|         1 |    33.333 % |     18.182 % |      9.524 % |      7.843 % |       5.941 % |       4.975 % |       4.489 % |  33.333 % |
|         2 |     9.524 % |      3.030 % |      0.866 % |      0.603 % |       0.349 % |       0.246 % |       0.201 % |   9.524 % |
|         3 |     3.571 % |      0.699 % |      0.226 % |      0.060 % |       0.026 % |       0.015 % |       0.011 % |   3.571 % |
|         4 |     1.587 % |      0.200 % |      0.038 % |      0.008 % |       0.002 % |       0.001 % |       0.001 % |   1.587 % |
|         5 |     0.794 % |      0.133 % |      0.015 % |      0.001 % |       0.000 % |       0.000 % |       0.000 % |   0.794 % |
|         6 |           — |      0.050 % |      0.003 % |      0.000 % |       0.000 % |       0.000 % |       0.000 % |   0.050 % |
|         7 |           — |      0.021 % |      0.001 % |      0.000 % |       0.000 % |       0.000 % |       0.000 % |   0.021 % |
|         8 |           — |      0.009 % |      0.000 % |      0.000 % |       0.000 % |       0.000 % |       0.000 % |   0.009 % |
|         9 |           — |      0.004 % |      0.000 % |      0.000 % |       0.000 % |       0.000 % |       0.000 % |   0.004 % |
|        10 |           — |      0.004 % |      0.000 % |      0.000 % |       0.000 % |       0.000 % |       0.000 % |   0.004 % |
|        11 |           — |            — |      0.000 % |      0.000 % |       0.000 % |       0.000 % |       0.000 % |   0.000 % |
|        12 |           — |            — |      0.000 % |      0.000 % |       0.000 % |       0.000 % |       0.000 % |   0.000 % |

#### Modelo de costos multiclase: t_cv5 ≈ t0 + a·(n_train/1000)^b·(ancho/33)^c·(K/5)^d (segundos, en chromium)

| Miembro           |    t0 |      a |     b |     c |  d (K) |
| ----------------- | ----: | -----: | ----: | ----: | -----: |
| logistic          | 0.046 | 0.0736 | 0.794 | 0.495 |  1.002 |
| logistic_balanced |  0.05 | 0.0722 | 0.796 | 0.421 |  0.942 |
| ridge             | 0.046 | 0.0207 | 0.956 | 0.965 | -0.029 |
| naive_bayes       |  0.04 | 0.0177 | 0.964 | 0.267 |  0.039 |
| linear_svc        | 0.043 | 0.0248 | 1.012 | 0.572 |  0.457 |
| decision_tree     | 0.043 | 0.0291 | 1.218 | 0.682 |  0.072 |
| knn               | 0.043 | 0.0204 | 1.641 | 0.247 |  0.108 |
| hgb               | 0.421 |  3.696 | 0.034 | 0.496 |  0.982 |
| lightgbm          | 0.458 | 4.0262 | 0.316 | 0.158 |  0.763 |
| xgboost           | 0.296 | 2.2642 | 0.478 | 0.638 |  0.859 |
| extra_trees       | 0.619 | 0.5509 | 1.106 | 0.034 |  0.336 |
| forest            | 0.826 | 0.6017 |  1.16 | 0.362 |  0.305 |
| forest_balanced   | 0.819 | 0.5979 | 1.163 | 0.341 |  0.312 |
| mlp               | 0.083 |  0.694 | 0.666 | 0.667 |  0.415 |

```json
{
  "logistic": { "t0": 0.046, "a": 0.0736, "b": 0.794, "c": 0.495, "d": 1.002 },
  "logistic_balanced": {
    "t0": 0.05,
    "a": 0.0722,
    "b": 0.796,
    "c": 0.421,
    "d": 0.942
  },
  "ridge": { "t0": 0.046, "a": 0.0207, "b": 0.956, "c": 0.965, "d": -0.029 },
  "naive_bayes": {
    "t0": 0.04,
    "a": 0.0177,
    "b": 0.964,
    "c": 0.267,
    "d": 0.039
  },
  "linear_svc": {
    "t0": 0.043,
    "a": 0.0248,
    "b": 1.012,
    "c": 0.572,
    "d": 0.457
  },
  "decision_tree": {
    "t0": 0.043,
    "a": 0.0291,
    "b": 1.218,
    "c": 0.682,
    "d": 0.072
  },
  "knn": { "t0": 0.043, "a": 0.0204, "b": 1.641, "c": 0.247, "d": 0.108 },
  "hgb": { "t0": 0.421, "a": 3.696, "b": 0.034, "c": 0.496, "d": 0.982 },
  "lightgbm": { "t0": 0.458, "a": 4.0262, "b": 0.316, "c": 0.158, "d": 0.763 },
  "xgboost": { "t0": 0.296, "a": 2.2642, "b": 0.478, "c": 0.638, "d": 0.859 },
  "extra_trees": {
    "t0": 0.619,
    "a": 0.5509,
    "b": 1.106,
    "c": 0.034,
    "d": 0.336
  },
  "forest": { "t0": 0.826, "a": 0.6017, "b": 1.16, "c": 0.362, "d": 0.305 },
  "forest_balanced": {
    "t0": 0.819,
    "a": 0.5979,
    "b": 1.163,
    "c": 0.341,
    "d": 0.312
  },
  "mlp": { "t0": 0.083, "a": 0.694, "b": 0.666, "c": 0.667, "d": 0.415 }
}
```

#### ¿Quién entra al Nivel 1 con el techo de 5 s? (tiempos medidos, en orden de prioridad; MLP fuera con < 500 filas; balanceadas fuera si minoritaria × K ≥ 0,8)

| Dataset             | Entran                                                                                                                                            | Quedan para el Nivel 2                                                 | Σ Nivel 1 (s) |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------: |
| planes-200          | 13: logistic, logistic_balanced, ridge, naive_bayes, linear_svc, decision_tree, knn, hgb, lightgbm, xgboost, extra_trees, forest, forest_balanced | —                                                                      |           4.5 |
| planes-fuga-200     | 13: logistic, logistic_balanced, ridge, naive_bayes, linear_svc, decision_tree, knn, hgb, lightgbm, xgboost, extra_trees, forest, forest_balanced | —                                                                      |           4.6 |
| planes-sin-fuga-200 | 13: logistic, logistic_balanced, ridge, naive_bayes, linear_svc, decision_tree, knn, hgb, lightgbm, xgboost, extra_trees, forest, forest_balanced | —                                                                      |           4.7 |
| ocupantes-200       | 13: logistic, logistic_balanced, ridge, naive_bayes, linear_svc, decision_tree, knn, hgb, lightgbm, xgboost, extra_trees, forest, forest_balanced | —                                                                      |           4.8 |
| departamento-200    | 11: logistic, ridge, naive_bayes, linear_svc, decision_tree, knn, hgb, lightgbm, xgboost, extra_trees, forest                                     | —                                                                      |           3.3 |
| planes-5000         | 8: logistic, logistic_balanced, ridge, naive_bayes, linear_svc, decision_tree, knn, hgb                                                           | lightgbm, xgboost, extra_trees, forest, forest_balanced, mlp           |           4.8 |
| sintetico-2000-k5   | 8: logistic, logistic_balanced, ridge, naive_bayes, linear_svc, decision_tree, knn, xgboost                                                       | hgb, lightgbm, extra_trees, forest, forest_balanced, mlp               |           4.6 |
| ancho-2000-k5       | 8: logistic, logistic_balanced, ridge, naive_bayes, linear_svc, decision_tree, knn, extra_trees                                                   | hgb, lightgbm, xgboost, forest, forest_balanced, mlp                   |           3.3 |
| sintetico-5000-k5   | 8: logistic, logistic_balanced, ridge, naive_bayes, linear_svc, decision_tree, knn, mlp                                                           | hgb, lightgbm, xgboost, extra_trees, forest, forest_balanced           |           3.6 |
| sintetico-20000-k5  | 6: logistic, logistic_balanced, ridge, naive_bayes, linear_svc, decision_tree                                                                     | knn, hgb, lightgbm, xgboost, extra_trees, forest, forest_balanced, mlp |           4.2 |
| sintetico-2000-k3   | 9: logistic, logistic_balanced, ridge, naive_bayes, linear_svc, decision_tree, knn, hgb, xgboost                                                  | lightgbm, extra_trees, forest, forest_balanced, mlp                    |           4.8 |
| sintetico-2000-k10  | 9: logistic, logistic_balanced, ridge, naive_bayes, linear_svc, decision_tree, knn, extra_trees, mlp                                              | hgb, lightgbm, xgboost, forest, forest_balanced                        |           4.2 |
| sintetico-2000-k20  | 8: logistic, logistic_balanced, ridge, naive_bayes, linear_svc, decision_tree, knn, extra_trees                                                   | hgb, lightgbm, xgboost, forest, forest_balanced, mlp                   |           3.6 |

## Anexo B — Agrupar: tablas completas

Salida literal de `SPIKE_OUT=<dir> node scripts/spike-agrupar/tabla.mjs chromium-limpio,webkit`.

#### chromium 153.0.8010.12 · Pyodide public/pyodide — condiciones (2026-10-04T22:12)

Carga del lote (load average de 1 min; umbral 5): antes 2.79 → después 10.07.

| Dataset          | Filas | Corridas (s)       | Mediana (s) | Carga antes → después         |
| ---------------- | ----: | ------------------ | ----------: | ----------------------------- |
| segmentos-300    |   300 | 2.1 / 2.5 / 2.1    |         2.1 | 3.45 → 3.5                    |
| sin-grupos-300   |   300 | 2.1 / 2.0 / 2.0    |         2.0 | 3.5 → 3.3                     |
| consumo-200      |   200 | 1.8 / 1.8 / 1.8    |         1.8 | 3.3 → 3.19                    |
| planes-200       |   200 | 1.9 / 1.8 / 1.9    |         1.9 | 3.19 → 3.1                    |
| uniforme-500-1d  |   488 | 0.7 / 0.8 / 0.9    |         0.8 | 3.1 → 3.09                    |
| uniforme-500-2d  |   500 | 1.2 / 1.2 / 1.2    |         1.2 | 3.09 → 3.16                   |
| uniforme-2000-4d |  2000 | 6.7 / 6.6 / 6.5    |         6.6 | 3.16 → 2.97                   |
| nubes-2000-k4    |  2000 | 19.3 / 22.5 / 18.9 |        19.3 | 2.66 → 4.5                    |
| nubes-5000-k4    |  5000 | 32.3 / 28.3 / 33.7 |        32.3 | 4.5 → 6.76 ⚠ sobre el umbral  |
| nubes-20000-k4   | 20000 | 95.0               |        95.0 | 7.45 → 2.58 ⚠ sobre el umbral |
| agglo-8000       |  8000 | 1.0                |         1.0 | 2.58 → 2.58                   |
| agglo-12000      | 12000 | 2.3                |         2.3 | 2.58 → 2.46                   |
| agglo-16000      | 16000 | 4.6                |         4.6 | 2.46 → 2.34                   |

#### webkit 26.6 · Pyodide public/pyodide — condiciones (2026-10-04T22:03)

Carga del lote (load average de 1 min; umbral 5): antes 3.18 → después 2.41.

| Dataset          | Filas | Corridas (s) | Mediana (s) | Carga antes → después |
| ---------------- | ----: | ------------ | ----------: | --------------------- |
| segmentos-300    |   300 | 1.8          |         1.8 | 3.09 → 2.92           |
| sin-grupos-300   |   300 | 1.8          |         1.8 | 2.92 → 2.92           |
| consumo-200      |   200 | 1.5          |         1.5 | 2.92 → 2.92           |
| planes-200       |   200 | 1.5          |         1.5 | 2.92 → 3.01           |
| uniforme-500-1d  |   488 | 0.6          |         0.6 | 3.01 → 3.01           |
| uniforme-500-2d  |   500 | 0.9          |         0.9 | 3.01 → 3.01           |
| uniforme-2000-4d |  2000 | 5.6          |         5.6 | 3.01 → 3.01           |
| nubes-2000-k4    |  2000 | 13.7         |        13.7 | 3.01 → 3.34           |
| nubes-5000-k4    |  5000 | 23.4         |        23.4 | 3.34 → 3.22           |
| nubes-20000-k4   | 20000 | 87.3         |        87.3 | 3.22 → 2.66           |
| agglo-8000       |  8000 | 0.9          |         0.9 | 2.66 → 2.53           |
| agglo-12000      | 12000 | 2.0          |         2.0 | 2.53 → 2.53           |
| agglo-16000      | 16000 | 3.8          |         3.8 | 2.53 → 2.41           |

#### chromium — agrupadores por dataset y preprocesamiento («completo» = numéricas + one-hot; «numericas» = solo numéricas)

| Dataset          | Prepro.   | Agrupador     | k (criterio) | silueta | ruido | puntaje |  nulo |    gap | ARI media / mín (R=10) | ARI media / mín (R=5) | ajuste total (s) | estabilidad (s) |
| ---------------- | --------- | ------------- | -----------: | ------: | ----: | ------: | ----: | -----: | ---------------------- | --------------------- | ---------------: | --------------: |
| segmentos-300    | completo  | kmeans        | 12 (silueta) |   0.413 |     — |   0.413 | 0.196 |  0.217 | 0.8254 / 0.7211        | 0.801 / 0.7712        |             0.06 |            0.04 |
| segmentos-300    | completo  | agglomerative | 11 (silueta) |   0.399 |     — |   0.399 | 0.161 |  0.238 | 0.8441 / 0.7478        | 0.8779 / 0.7478       |             0.00 |            0.01 |
| segmentos-300    | completo  | gmm           |     12 (BIC) |   0.260 |     — |   0.260 | 0.133 |  0.127 | 0.7631 / 0.6082        | 0.7779 / 0.7057       |             0.08 |            0.11 |
| segmentos-300    | completo  | hdbscan       |    9 (mcs 6) |   0.303 | 0.037 |   0.292 | 0.077 |  0.215 | 0.9239 / 0.8488        | 0.914 / 0.8488        |             0.00 |            0.03 |
| segmentos-300    | numericas | kmeans        |  5 (silueta) |   0.507 |     — |   0.507 | 0.285 |  0.222 | 0.9813 / 0.9591        | 0.9834 / 0.9591       |             0.03 |            0.02 |
| segmentos-300    | numericas | agglomerative |  3 (silueta) |   0.481 |     — |   0.481 | 0.231 |  0.251 | 0.8765 / 0.5336        | 0.9067 / 0.5336       |             0.00 |            0.01 |
| segmentos-300    | numericas | gmm           |      3 (BIC) |   0.481 |     — |   0.481 | 0.260 |  0.221 | 0.8304 / 0.337         | 0.8697 / 0.3484       |             0.06 |            0.03 |
| segmentos-300    | numericas | hdbscan       |    3 (mcs 6) |   0.481 | 0.000 |   0.481 | 0.135 |  0.347 | 0.9844 / 0.8723        | 0.9972 / 0.9929       |             0.00 |            0.02 |
| sin-grupos-300   | completo  | kmeans        | 11 (silueta) |   0.158 |     — |   0.158 | 0.213 | -0.055 | 0.4123 / 0.335         | 0.4024 / 0.335        |             0.04 |            0.04 |
| sin-grupos-300   | completo  | agglomerative |  2 (silueta) |   0.127 |     — |   0.127 | 0.164 | -0.036 | 0.1152 / -0.0348       | 0.1127 / 0.0686       |             0.00 |            0.01 |
| sin-grupos-300   | completo  | gmm           |      5 (BIC) |   0.053 |     — |   0.053 | 0.166 | -0.113 | 0.5787 / 0.3852        | 0.5422 / 0.3872       |             0.11 |            0.08 |
| sin-grupos-300   | completo  | hdbscan       |    3 (mcs 6) |   0.170 | 0.357 |   0.110 | 0.071 |  0.038 | 0.779 / 0.7176         | 0.785 / 0.7176        |             0.00 |            0.02 |
| sin-grupos-300   | numericas | kmeans        | 10 (silueta) |   0.198 |     — |   0.198 | 0.227 | -0.029 | 0.4956 / 0.3496        | 0.4731 / 0.3496       |             0.03 |            0.04 |
| sin-grupos-300   | numericas | agglomerative | 11 (silueta) |   0.158 |     — |   0.158 | 0.194 | -0.035 | 0.4072 / 0.315         | 0.404 / 0.315         |             0.00 |            0.01 |
| sin-grupos-300   | numericas | gmm           |      2 (BIC) |   0.163 |     — |   0.163 | 0.200 | -0.038 | 0.0868 / -0.0033       | 0.0646 / -0.0033      |             0.16 |            0.03 |
| sin-grupos-300   | numericas | hdbscan       |    2 (mcs 6) |   0.210 | 0.670 |   0.069 | 0.081 | -0.011 | 0.3541 / 0.2181        | 0.3065 / 0.2181       |             0.00 |            0.02 |
| consumo-200      | completo  | kmeans        |  2 (silueta) |   0.181 |     — |   0.181 | 0.238 | -0.057 | 0.907 / 0.8079         | 0.9071 / 0.8081       |             0.03 |            0.02 |
| consumo-200      | completo  | agglomerative |  2 (silueta) |   0.161 |     — |   0.161 | 0.221 | -0.060 | 0.5173 / -0.0469       | 0.6654 / 0.3558       |             0.00 |            0.01 |
| consumo-200      | completo  | gmm           |      7 (BIC) |  -0.033 |     — |  -0.033 | 0.119 | -0.152 | 0.1172 / 0.007         | 0.1093 / 0.0158       |             0.14 |            0.12 |
| consumo-200      | completo  | hdbscan       |    5 (mcs 5) |   0.252 | 0.705 |   0.074 | 0.053 |  0.021 | 0.4839 / 0.0161        | 0.3507 / 0.0161       |             0.00 |            0.02 |
| consumo-200      | numericas | kmeans        | 11 (silueta) |   0.256 |     — |   0.256 | 0.205 |  0.050 | 0.6679 / 0.5792        | 0.696 / 0.6301        |             0.03 |            0.03 |
| consumo-200      | numericas | agglomerative | 10 (silueta) |   0.225 |     — |   0.225 | 0.166 |  0.059 | 0.5716 / 0.4305        | 0.5532 / 0.4305       |             0.00 |            0.01 |
| consumo-200      | numericas | gmm           |      7 (BIC) |   0.084 |     — |   0.084 | 0.140 | -0.056 | 0.3795 / 0.3052        | 0.3783 / 0.3052       |             0.11 |            0.11 |
| consumo-200      | numericas | hdbscan       |    6 (mcs 5) |   0.331 | 0.630 |   0.122 | 0.080 |  0.042 | 0.2706 / -0.1573       | 0.295 / -0.1573       |             0.00 |            0.02 |
| planes-200       | completo  | kmeans        |  2 (silueta) |   0.341 |     — |   0.341 | 0.198 |  0.144 | 0.9027 / 0.7689        | 0.9302 / 0.8933       |             0.03 |            0.02 |
| planes-200       | completo  | agglomerative |  2 (silueta) |   0.346 |     — |   0.346 | 0.154 |  0.192 | 0.63 / 0.4511          | 0.6698 / 0.6375       |             0.00 |            0.01 |
| planes-200       | completo  | gmm           |      8 (BIC) |   0.011 |     — |   0.011 | 0.117 | -0.106 | 0.3659 / 0.1107        | 0.3461 / 0.1107       |             0.17 |            0.12 |
| planes-200       | completo  | hdbscan       |    8 (mcs 5) |   0.242 | 0.415 |   0.141 | 0.044 |  0.097 | 0.7704 / 0.6791        | 0.7825 / 0.6791       |             0.00 |            0.02 |
| planes-200       | numericas | kmeans        |  2 (silueta) |   0.425 |     — |   0.425 | 0.237 |  0.187 | 0.9664 / 0.7955        | 1 / 1                 |             0.03 |            0.02 |
| planes-200       | numericas | agglomerative |  2 (silueta) |   0.417 |     — |   0.417 | 0.210 |  0.207 | 0.6848 / 0.4291        | 0.7141 / 0.5725       |             0.00 |            0.01 |
| planes-200       | numericas | gmm           |     10 (BIC) |   0.076 |     — |   0.076 | 0.189 | -0.114 | 0.4018 / 0.2564        | 0.4225 / 0.2564       |             0.12 |            0.13 |
| planes-200       | numericas | hdbscan       |    3 (mcs 5) |   0.188 | 0.455 |   0.103 | 0.119 | -0.017 | 0.9229 / 0.8761        | 0.9086 / 0.8761       |             0.00 |            0.02 |
| uniforme-500-1d  | completo  | kmeans        |  2 (silueta) |   0.624 |     — |   0.624 | 0.620 |  0.004 | 0.9849 / 0.9194        | 0.9839 / 0.9194       |             0.03 |            0.02 |
| uniforme-500-1d  | completo  | agglomerative |  2 (silueta) |   0.572 |     — |   0.572 | 0.604 | -0.032 | 0.409 / 0.0524         | 0.3772 / 0.3582       |             0.00 |            0.02 |
| uniforme-500-1d  | completo  | gmm           |      4 (BIC) |   0.573 |     — |   0.573 | 0.565 |  0.009 | 0.8343 / 0.769         | 0.8283 / 0.769        |             0.04 |            0.03 |
| uniforme-500-1d  | completo  | hdbscan       |   15 (mcs 9) |   0.598 | 0.104 |   0.535 | 0.490 |  0.045 | 0.6616 / 0.5076        | 0.6299 / 0.5076       |             0.00 |            0.03 |
| uniforme-500-2d  | completo  | kmeans        |  4 (silueta) |   0.409 |     — |   0.409 | 0.408 |  0.002 | 0.936 / 0.8698         | 0.9155 / 0.8698       |             0.04 |            0.03 |
| uniforme-500-2d  | completo  | agglomerative |  4 (silueta) |   0.374 |     — |   0.374 | 0.371 |  0.003 | 0.5813 / 0.2859        | 0.6597 / 0.401        |             0.00 |            0.02 |
| uniforme-500-2d  | completo  | gmm           |      8 (BIC) |   0.282 |     — |   0.282 | 0.347 | -0.066 | 0.6279 / 0.4469        | 0.6336 / 0.4552       |             0.12 |            0.14 |
| uniforme-500-2d  | completo  | hdbscan       |   6 (mcs 10) |   0.407 | 0.394 |   0.246 | 0.202 |  0.045 | 0.3379 / 0.0792        | 0.365 / 0.0792        |             0.00 |            0.03 |
| uniforme-2000-4d | completo  | kmeans        |  8 (silueta) |   0.234 |     — |   0.234 | 0.227 |  0.007 | 0.922 / 0.8688         | 0.9157 / 0.8688       |             0.11 |            0.10 |
| uniforme-2000-4d | completo  | agglomerative | 11 (silueta) |   0.155 |     — |   0.155 | 0.156 | -0.001 | 0.3925 / 0.2996        | 0.3636 / 0.2996       |             0.04 |            0.26 |
| uniforme-2000-4d | completo  | gmm           |      6 (BIC) |   0.182 |     — |   0.182 | 0.181 |  0.001 | 0.3503 / 0.2159        | 0.3692 / 0.2159       |             0.29 |            0.17 |
| uniforme-2000-4d | completo  | hdbscan       |   0 (mcs 40) |       — | 1.000 |       — | 0.009 |      — | 1 / 1                  | 1 / 1                 |             0.03 |            0.22 |
| nubes-2000-k4    | completo  | kmeans        |  4 (silueta) |   0.367 |     — |   0.367 | 0.157 |  0.210 | 0.9986 / 0.9982        | 0.9986 / 0.9982       |             0.10 |            0.04 |
| nubes-2000-k4    | completo  | agglomerative |  4 (silueta) |   0.366 |     — |   0.366 | 0.110 |  0.256 | 0.9861 / 0.9778        | 0.9873 / 0.9782       |             0.06 |            0.40 |
| nubes-2000-k4    | completo  | gmm           |      8 (BIC) |   0.148 |     — |   0.148 | 0.124 |  0.024 | 0.7204 / 0.4736        | 0.6734 / 0.4736       |             0.70 |            0.63 |
| nubes-2000-k4    | completo  | hdbscan       |   4 (mcs 40) |   0.467 | 0.337 |   0.310 | 0.000 |  0.310 | 0.9357 / 0.9178        | 0.9362 / 0.9291       |             0.05 |            0.33 |
| nubes-2000-k4    | numericas | kmeans        |  4 (silueta) |   0.395 |     — |   0.395 | 0.186 |  0.209 | 0.9995 / 0.9982        | 0.999 / 0.9982        |             0.09 |            0.04 |
| nubes-2000-k4    | numericas | agglomerative |  4 (silueta) |   0.393 |     — |   0.393 | 0.131 |  0.263 | 0.9822 / 0.9649        | 0.9811 / 0.9649       |             0.12 |            0.42 |
| nubes-2000-k4    | numericas | gmm           |      4 (BIC) |   0.395 |     — |   0.395 | 0.172 |  0.224 | 0.9998 / 0.9983        | 0.9997 / 0.9983       |             0.17 |            0.06 |
| nubes-2000-k4    | numericas | hdbscan       |   3 (mcs 40) |   0.444 | 0.322 |   0.301 | 0.000 |  0.301 | 0.7937 / 0.7415        | 0.8155 / 0.7415       |             0.04 |            0.51 |
| nubes-5000-k4    | completo  | kmeans        |  4 (silueta) |   0.422 |     — |   0.422 | 0.160 |  0.262 | 1 / 1                  | 1 / 1                 |             0.19 |            0.07 |
| nubes-5000-k4    | completo  | agglomerative |  4 (silueta) |   0.422 |     — |   0.422 | 0.120 |  0.302 | 0.9971 / 0.994         | 0.9971 / 0.996        |             0.40 |            2.39 |
| nubes-5000-k4    | completo  | gmm           |     12 (BIC) |   0.174 |     — |   0.174 | 0.102 |  0.071 | 0.8229 / 0.6635        | 0.8581 / 0.7832       |             1.95 |            1.81 |
| nubes-5000-k4    | completo  | hdbscan       |  4 (mcs 100) |   0.503 | 0.249 |   0.377 | 0.000 |  0.377 | 0.9426 / 0.9267        | 0.9421 / 0.9267       |             0.45 |            1.67 |
| nubes-5000-k4    | numericas | kmeans        |  4 (silueta) |   0.466 |     — |   0.466 | 0.200 |  0.265 | 0.9999 / 0.9993        | 0.9997 / 0.9993       |             0.16 |            0.09 |
| nubes-5000-k4    | numericas | agglomerative |  4 (silueta) |   0.466 |     — |   0.466 | 0.158 |  0.307 | 0.9985 / 0.9973        | 0.9985 / 0.9973       |             0.35 |            1.77 |
| nubes-5000-k4    | numericas | gmm           |      4 (BIC) |   0.466 |     — |   0.466 | 0.198 |  0.268 | 0.9999 / 0.9993        | 1 / 1                 |             0.36 |            0.09 |
| nubes-5000-k4    | numericas | hdbscan       |  2 (mcs 100) |   0.389 | 0.003 |   0.387 | 0.000 |  0.387 | 0.9945 / 0.993         | 0.9937 / 0.993        |             0.17 |            1.64 |
| nubes-20000-k4   | completo  | kmeans        |  2 (silueta) |   0.427 |     — |   0.427 | 0.210 |  0.217 | 1 / 1                  | 1 / 1                 |             0.63 |            0.13 |
| nubes-20000-k4   | completo  | gmm           |     10 (BIC) |   0.190 |     — |   0.190 | 0.122 |  0.068 | 0.8657 / 0.8117        | 0.8659 / 0.8117       |             4.95 |            7.53 |
| nubes-20000-k4   | completo  | hdbscan       |  4 (mcs 400) |   0.413 | 0.206 |   0.328 | 0.000 |  0.328 | 0.9206 / 0.9057        | 0.9204 / 0.9104       |             3.40 |           23.70 |
| nubes-20000-k4   | numericas | kmeans        |  2 (silueta) |   0.474 |     — |   0.474 | 0.262 |  0.212 | 1 / 1                  | 1 / 1                 |             0.46 |            0.10 |
| nubes-20000-k4   | numericas | gmm           |      5 (BIC) |   0.267 |     — |   0.267 | 0.218 |  0.049 | 0.713 / 0.559          | 0.802 / 0.5603        |             1.20 |            0.64 |
| nubes-20000-k4   | numericas | hdbscan       |  2 (mcs 400) |   0.482 | 0.020 |   0.472 | 0.000 |  0.472 | 0.9804 / 0.9726        | 0.9865 / 0.9754       |             2.60 |           18.22 |

#### El k que elige cada criterio (★ = coincide con los grupos plantados)

| Dataset          | Prepro.   | K-Means silueta | K-Means gap | Agglom. silueta | Agglom. gap | GMM BIC | GMM silueta | GMM gap | HDBSCAN |
| ---------------- | --------- | --------------: | ----------: | --------------: | ----------: | ------: | ----------: | ------: | ------: |
| segmentos-300    | completo  |              12 |          12 |              11 |          11 |      12 |         3 ★ |     3 ★ |       9 |
| segmentos-300    | numericas |               5 |           5 |             3 ★ |         3 ★ |     3 ★ |           5 |       5 |     3 ★ |
| sin-grupos-300   | completo  |              11 |           3 |               2 |           2 |       5 |           2 |       2 |       3 |
| sin-grupos-300   | numericas |              10 |           6 |              11 |           6 |       2 |           2 |       7 |       2 |
| consumo-200      | completo  |               2 |          11 |               2 |           3 |       7 |          12 |      12 |       5 |
| consumo-200      | numericas |              11 |          11 |              10 |          10 |       7 |           2 |      12 |       6 |
| planes-200       | completo  |               2 |           2 |               2 |           2 |       8 |           2 |      10 |       8 |
| planes-200       | numericas |               2 |           2 |               2 |           2 |      10 |           2 |       3 |       3 |
| uniforme-500-1d  | completo  |               2 |           6 |               2 |           9 |       4 |           2 |       6 |      15 |
| uniforme-500-2d  | completo  |               4 |           9 |               4 |           7 |       8 |           4 |       5 |       6 |
| uniforme-2000-4d | completo  |               8 |           8 |              11 |           5 |       6 |           9 |       9 |       0 |
| nubes-2000-k4    | completo  |             4 ★ |         4 ★ |             4 ★ |         4 ★ |       8 |         4 ★ |     4 ★ |     4 ★ |
| nubes-2000-k4    | numericas |             4 ★ |         4 ★ |             4 ★ |         4 ★ |     4 ★ |         4 ★ |     4 ★ |       3 |
| nubes-5000-k4    | completo  |             4 ★ |         4 ★ |             4 ★ |         4 ★ |      12 |         4 ★ |     4 ★ |     4 ★ |
| nubes-5000-k4    | numericas |             4 ★ |         4 ★ |             4 ★ |         4 ★ |     4 ★ |         4 ★ |     4 ★ |       2 |
| nubes-20000-k4   | completo  |               2 |           2 |               — |           — |      10 |           2 |       2 |     4 ★ |
| nubes-20000-k4   | numericas |               2 |           2 |               — |           — |       5 |           2 |       2 |       2 |

#### Reglas de lectura candidatas contra la verdad («existen» con grupos plantados; «no hay estructura» con ruido y uniformes)

| Regla                                            | Prepro.   | segmentos-300 | nubes-2000-k4 | nubes-5000-k4 | nubes-20000-k4 | sin-grupos-300 | uniforme-500-1d | uniforme-500-2d | uniforme-2000-4d | aciertos |
| ------------------------------------------------ | --------- | :-----------: | :-----------: | :-----------: | :------------: | :------------: | :-------------: | :-------------: | :--------------: | -------: |
| silueta ≥ 0,25 y ARI ≥ 0,8 (sin referencia nula) | completo  |   existen ✓   |   existen ✓   |   existen ✓   |   existen ✓    |    no hay ✓    |    existen ✗    |    existen ✗    |     no hay ✓     |   6 de 8 |
| gap ≥ 0.05 y ARI ≥ 0.6                           | completo  |   existen ✓   |   existen ✓   |   existen ✓   |   existen ✓    |    no hay ✓    |    no hay ✓     |    no hay ✓     |     no hay ✓     |   8 de 8 |
| gap ≥ 0.05 y ARI ≥ 0.7                           | completo  |   existen ✓   |   existen ✓   |   existen ✓   |   existen ✓    |    no hay ✓    |    no hay ✓     |    no hay ✓     |     no hay ✓     |   8 de 8 |
| gap ≥ 0.05 y ARI ≥ 0.8                           | completo  |   existen ✓   |   existen ✓   |   existen ✓   |   existen ✓    |    no hay ✓    |    no hay ✓     |    no hay ✓     |     no hay ✓     |   8 de 8 |
| gap ≥ 0.1 y ARI ≥ 0.6                            | completo  |   existen ✓   |   existen ✓   |   existen ✓   |   existen ✓    |    no hay ✓    |    no hay ✓     |    no hay ✓     |     no hay ✓     |   8 de 8 |
| gap ≥ 0.1 y ARI ≥ 0.7                            | completo  |   existen ✓   |   existen ✓   |   existen ✓   |   existen ✓    |    no hay ✓    |    no hay ✓     |    no hay ✓     |     no hay ✓     |   8 de 8 |
| gap ≥ 0.1 y ARI ≥ 0.8                            | completo  |   existen ✓   |   existen ✓   |   existen ✓   |   existen ✓    |    no hay ✓    |    no hay ✓     |    no hay ✓     |     no hay ✓     |   8 de 8 |
| gap ≥ 0.15 y ARI ≥ 0.6                           | completo  |   existen ✓   |   existen ✓   |   existen ✓   |   existen ✓    |    no hay ✓    |    no hay ✓     |    no hay ✓     |     no hay ✓     |   8 de 8 |
| gap ≥ 0.15 y ARI ≥ 0.7                           | completo  |   existen ✓   |   existen ✓   |   existen ✓   |   existen ✓    |    no hay ✓    |    no hay ✓     |    no hay ✓     |     no hay ✓     |   8 de 8 |
| gap ≥ 0.15 y ARI ≥ 0.8                           | completo  |   existen ✓   |   existen ✓   |   existen ✓   |   existen ✓    |    no hay ✓    |    no hay ✓     |    no hay ✓     |     no hay ✓     |   8 de 8 |
| silueta ≥ 0,25 y ARI ≥ 0,8 (sin referencia nula) | numericas |   existen ✓   |   existen ✓   |   existen ✓   |   existen ✓    |    no hay ✓    |    existen ✗    |    existen ✗    |     no hay ✓     |   6 de 8 |
| gap ≥ 0.05 y ARI ≥ 0.6                           | numericas |   existen ✓   |   existen ✓   |   existen ✓   |   existen ✓    |    no hay ✓    |    no hay ✓     |    no hay ✓     |     no hay ✓     |   8 de 8 |
| gap ≥ 0.05 y ARI ≥ 0.7                           | numericas |   existen ✓   |   existen ✓   |   existen ✓   |   existen ✓    |    no hay ✓    |    no hay ✓     |    no hay ✓     |     no hay ✓     |   8 de 8 |
| gap ≥ 0.05 y ARI ≥ 0.8                           | numericas |   existen ✓   |   no hay ✗    |   existen ✓   |   existen ✓    |    no hay ✓    |    no hay ✓     |    no hay ✓     |     no hay ✓     |   7 de 8 |
| gap ≥ 0.1 y ARI ≥ 0.6                            | numericas |   existen ✓   |   existen ✓   |   existen ✓   |   existen ✓    |    no hay ✓    |    no hay ✓     |    no hay ✓     |     no hay ✓     |   8 de 8 |
| gap ≥ 0.1 y ARI ≥ 0.7                            | numericas |   existen ✓   |   existen ✓   |   existen ✓   |   existen ✓    |    no hay ✓    |    no hay ✓     |    no hay ✓     |     no hay ✓     |   8 de 8 |
| gap ≥ 0.1 y ARI ≥ 0.8                            | numericas |   existen ✓   |   no hay ✗    |   existen ✓   |   existen ✓    |    no hay ✓    |    no hay ✓     |    no hay ✓     |     no hay ✓     |   7 de 8 |
| gap ≥ 0.15 y ARI ≥ 0.6                           | numericas |   existen ✓   |   existen ✓   |   existen ✓   |   existen ✓    |    no hay ✓    |    no hay ✓     |    no hay ✓     |     no hay ✓     |   8 de 8 |
| gap ≥ 0.15 y ARI ≥ 0.7                           | numericas |   existen ✓   |   existen ✓   |   existen ✓   |   existen ✓    |    no hay ✓    |    no hay ✓     |    no hay ✓     |     no hay ✓     |   8 de 8 |
| gap ≥ 0.15 y ARI ≥ 0.8                           | numericas |   existen ✓   |   no hay ✗    |   existen ✓   |   existen ✓    |    no hay ✓    |    no hay ✓     |    no hay ✓     |     no hay ✓     |   7 de 8 |

#### El ganador entre agrupadores: por puntaje y por gap

| Dataset          | Prepro.   | Por puntaje               | Por gap                        |
| ---------------- | --------- | ------------------------- | ------------------------------ |
| segmentos-300    | completo  | kmeans k=12 (0.413)       | agglomerative k=11 (gap 0.238) |
| segmentos-300    | numericas | kmeans k=5 (0.507)        | hdbscan k=3 (gap 0.347)        |
| sin-grupos-300   | completo  | kmeans k=11 (0.158)       | hdbscan k=3 (gap 0.038)        |
| sin-grupos-300   | numericas | kmeans k=10 (0.198)       | hdbscan k=2 (gap -0.011)       |
| consumo-200      | completo  | kmeans k=2 (0.181)        | hdbscan k=5 (gap 0.021)        |
| consumo-200      | numericas | kmeans k=11 (0.256)       | agglomerative k=10 (gap 0.059) |
| planes-200       | completo  | agglomerative k=2 (0.346) | agglomerative k=2 (gap 0.192)  |
| planes-200       | numericas | kmeans k=2 (0.425)        | agglomerative k=2 (gap 0.207)  |
| uniforme-500-1d  | completo  | kmeans k=2 (0.624)        | hdbscan k=15 (gap 0.045)       |
| uniforme-500-2d  | completo  | kmeans k=4 (0.409)        | hdbscan k=6 (gap 0.045)        |
| uniforme-2000-4d | completo  | kmeans k=8 (0.234)        | kmeans k=8 (gap 0.007)         |
| nubes-2000-k4    | completo  | kmeans k=4 (0.367)        | hdbscan k=4 (gap 0.310)        |
| nubes-2000-k4    | numericas | kmeans k=4 (0.395)        | hdbscan k=3 (gap 0.301)        |
| nubes-5000-k4    | completo  | kmeans k=4 (0.422)        | hdbscan k=4 (gap 0.377)        |
| nubes-5000-k4    | numericas | kmeans k=4 (0.466)        | hdbscan k=2 (gap 0.387)        |
| nubes-20000-k4   | completo  | kmeans k=2 (0.427)        | hdbscan k=4 (gap 0.328)        |
| nubes-20000-k4   | numericas | kmeans k=2 (0.474)        | hdbscan k=2 (gap 0.472)        |

#### Agglomerative: el linkage (O(n²)) y las sondas de tamaño

| Dataset          | Filas | linkage (s) | resultado             |
| ---------------- | ----: | ----------: | --------------------- |
| segmentos-300    |   300 |        0.00 | cabe                  |
| sin-grupos-300   |   300 |        0.00 | cabe                  |
| consumo-200      |   200 |        0.00 | cabe                  |
| planes-200       |   200 |        0.00 | cabe                  |
| uniforme-500-1d  |   488 |        0.00 | cabe                  |
| uniforme-500-2d  |   500 |        0.00 | cabe                  |
| uniforme-2000-4d |  2000 |        0.04 | cabe                  |
| nubes-2000-k4    |  2000 |        0.06 | cabe                  |
| nubes-5000-k4    |  5000 |        0.40 | cabe                  |
| nubes-20000-k4   | 20000 |           — | n > agglo_max (12000) |
| agglo-8000       |  8000 |        1.00 | cabe                  |
| agglo-12000      | 12000 |        2.25 | cabe                  |
| agglo-16000      | 16000 |        4.53 | cabe                  |

#### HDBSCAN según min_cluster_size (prepro. «numericas» si existe)

| Dataset          |  mcs |   k | ruido | silueta sin ruido | puntaje | ajuste (s) |
| ---------------- | ---: | --: | ----: | ----------------: | ------: | ---------: |
| segmentos-300    |    5 |   9 | 0.060 |             0.400 |   0.376 |      0.003 |
| segmentos-300    |    6 |   3 | 0.000 |             0.481 |   0.481 |      0.002 |
| segmentos-300    |   10 |   3 | 0.017 |             0.481 |   0.473 |      0.002 |
| segmentos-300    |   15 |   3 | 0.040 |             0.489 |   0.469 |      0.002 |
| sin-grupos-300   |    5 |   6 | 0.823 |             0.347 |   0.061 |      0.002 |
| sin-grupos-300   |    6 |   2 | 0.670 |             0.210 |   0.069 |      0.002 |
| sin-grupos-300   |   10 |   0 | 1.000 |                 — |       — |      0.002 |
| sin-grupos-300   |   15 |   0 | 1.000 |                 — |       — |      0.002 |
| consumo-200      |    5 |   6 | 0.630 |             0.331 |   0.122 |      0.002 |
| consumo-200      |   10 |   0 | 1.000 |                 — |       — |      0.002 |
| planes-200       |    5 |   3 | 0.455 |             0.188 |   0.103 |      0.002 |
| planes-200       |   10 |   2 | 0.685 |             0.359 |   0.113 |      0.002 |
| uniforme-500-1d  |    5 |  36 | 0.160 |             0.640 |   0.538 |      0.004 |
| uniforme-500-1d  |    9 |  15 | 0.104 |             0.598 |   0.535 |      0.003 |
| uniforme-500-1d  |   10 |  15 | 0.145 |             0.621 |   0.530 |      0.003 |
| uniforme-500-1d  |   24 |   5 | 0.191 |             0.657 |   0.532 |      0.003 |
| uniforme-500-2d  |    5 |  21 | 0.360 |             0.399 |   0.256 |      0.003 |
| uniforme-500-2d  |   10 |   6 | 0.394 |             0.407 |   0.246 |      0.003 |
| uniforme-500-2d  |   25 |   2 | 0.310 |             0.354 |   0.244 |      0.003 |
| uniforme-2000-4d |    5 |   2 | 0.169 |             0.159 |   0.132 |      0.031 |
| uniforme-2000-4d |   10 |   2 | 0.691 |             0.094 |   0.029 |      0.024 |
| uniforme-2000-4d |   40 |   0 | 1.000 |                 — |       — |      0.031 |
| uniforme-2000-4d |  100 |   0 | 1.000 |                 — |       — |      0.054 |
| nubes-2000-k4    |    5 |   3 | 0.124 |             0.406 |   0.356 |      0.058 |
| nubes-2000-k4    |   10 |   3 | 0.144 |             0.411 |   0.352 |      0.039 |
| nubes-2000-k4    |   40 |   3 | 0.322 |             0.444 |   0.301 |      0.042 |
| nubes-2000-k4    |  100 |   3 | 0.485 |             0.480 |   0.247 |      0.057 |
| nubes-5000-k4    |    5 |   2 | 0.000 |             0.388 |   0.388 |      0.141 |
| nubes-5000-k4    |   10 |   2 | 0.000 |             0.388 |   0.388 |      0.124 |
| nubes-5000-k4    |  100 |   2 | 0.003 |             0.389 |   0.387 |      0.175 |
| nubes-5000-k4    |  250 |   2 | 0.032 |             0.396 |   0.383 |      0.258 |
| nubes-20000-k4   |    5 |   2 | 0.000 |             0.474 |   0.474 |      1.576 |
| nubes-20000-k4   |   10 |   2 | 0.000 |             0.474 |   0.474 |      1.584 |
| nubes-20000-k4   |  400 |   2 | 0.020 |             0.482 |   0.472 |      2.601 |
| nubes-20000-k4   | 1000 |   2 | 0.080 |             0.498 |   0.459 |      3.990 |

#### k en 2..10: el ganador por puntaje, por gap y por consenso, y la lectura «gap ≥ 0,10 y ARI ≥ 0,7» sobre cada uno

| Dataset          | Prepro.   | k por agrupador (KM · AG · GMM · HDB) | Por puntaje                  | Por gap                           | Por consenso                          | Verdad         |
| ---------------- | --------- | ------------------------------------- | ---------------------------- | --------------------------------- | ------------------------------------- | -------------- |
| segmentos-300    | completo  | 3 · 3 · 7 · 9                         | kmeans k=3 · ARI no medido   | agglomerative k=3 · ARI no medido | kmeans k=3 · ARI no medido (2 de 4)   | k=3            |
| segmentos-300    | numericas | 5 · 3 · 3 · 3                         | kmeans k=5 · existen         | hdbscan k=3 · existen             | agglomerative k=3 · existen (3 de 4)  | k=3            |
| sin-grupos-300   | completo  | 8 · 2 · 5 · 3                         | kmeans k=8 · no hay          | hdbscan k=3 · no hay              | kmeans k=8 · no hay (1 de 4)          | sin estructura |
| sin-grupos-300   | numericas | 10 · 10 · 2 · 2                       | kmeans k=10 · no hay         | hdbscan k=2 · no hay              | kmeans k=10 · no hay (2 de 4)         | sin estructura |
| consumo-200      | completo  | 2 · 2 · 7 · 5                         | kmeans k=2 · no hay          | hdbscan k=5 · no hay              | kmeans k=2 · no hay (2 de 4)          | —              |
| consumo-200      | numericas | 10 · 10 · 7 · 6                       | kmeans k=10 · no hay         | agglomerative k=10 · no hay       | kmeans k=10 · no hay (2 de 4)         | —              |
| planes-200       | completo  | 2 · 2 · 8 · 8                         | agglomerative k=2 · frágiles | agglomerative k=2 · frágiles      | agglomerative k=2 · frágiles (2 de 4) | —              |
| planes-200       | numericas | 2 · 2 · 10 · 3                        | kmeans k=2 · existen         | agglomerative k=2 · frágiles      | kmeans k=2 · existen (2 de 4)         | —              |
| uniforme-500-1d  | completo  | 2 · 2 · 4 · 15                        | kmeans k=2 · no hay          | hdbscan k=15 · no hay             | kmeans k=2 · no hay (2 de 4)          | sin estructura |
| uniforme-500-2d  | completo  | 4 · 4 · 8 · 6                         | kmeans k=4 · no hay          | hdbscan k=6 · no hay              | kmeans k=4 · no hay (2 de 4)          | sin estructura |
| uniforme-2000-4d | completo  | 8 · 9 · 6 · —                         | kmeans k=8 · no hay          | kmeans k=8 · no hay               | kmeans k=8 · no hay (1 de 3)          | sin estructura |
| nubes-2000-k4    | completo  | 4 · 4 · 8 · 4                         | kmeans k=4 · existen         | hdbscan k=4 · existen             | kmeans k=4 · existen (3 de 4)         | k=4            |
| nubes-2000-k4    | numericas | 4 · 4 · 4 · 3                         | kmeans k=4 · existen         | hdbscan k=3 · existen             | kmeans k=4 · existen (3 de 4)         | k=4            |
| nubes-5000-k4    | completo  | 4 · 4 · 10 · 4                        | kmeans k=4 · existen         | hdbscan k=4 · existen             | kmeans k=4 · existen (3 de 4)         | k=4            |
| nubes-5000-k4    | numericas | 4 · 4 · 4 · 2                         | kmeans k=4 · existen         | hdbscan k=2 · existen             | kmeans k=4 · existen (3 de 4)         | k=4            |
| nubes-20000-k4   | completo  | 2 · — · 10 · 4                        | kmeans k=2 · existen         | hdbscan k=4 · existen             | kmeans k=2 · existen (1 de 3)         | k=4            |
| nubes-20000-k4   | numericas | 2 · — · 5 · 2                         | kmeans k=2 · existen         | hdbscan k=2 · existen             | kmeans k=2 · existen (2 de 3)         | k=4            |

## Anexo C — D8 en la binaria

Salida literal de `SPIKE_OUT=<dir> pnpm exec vitest run --config scripts/spike-multiclase/vitest.spike.config.ts d8-binaria` (motor real de la app, sin navegador).

| Dataset                        | Objetivo        | Minoritaria (train) | Columnas | Marca HOY        | S=1 normalizada  | S=3 normalizada  | S=5 solo soporte (pureza cruda) | **S=5 normalizada (propuesta)** | S=10 normalizada | ¿cambia con la propuesta? |
| ------------------------------ | --------------- | ------------------: | -------: | ---------------- | ---------------- | ---------------- | ------------------------------- | ------------------------------- | ---------------- | :-----------------------: |
| clientes-sucio.csv             | contrato        |                  19 |        3 | —                | —                | —                | —                               | —                               | —                |            no             |
| credito-fuga-plantada.csv      | incumplio       |                  67 |        5 | monto_recuperado | monto_recuperado | monto_recuperado | monto_recuperado                | monto_recuperado                | monto_recuperado |            no             |
| liga-mediana.csv               | objetivo        |                1247 |       11 | —                | —                | —                | —                               | —                               | —                |            no             |
| marketing-campania.csv         | dispositivo     |                  73 |        6 | —                | —                | —                | —                               | —                               | —                |            no             |
| marketing-campania.csv         | convirtio       |                  64 |        6 | —                | —                | —                | —                               | —                               | —                |            no             |
| planes-fuga-plantada.csv       | pago            |                  58 |        7 | —                | —                | —                | —                               | —                               | —                |            no             |
| planes-suscripcion-mediano.csv | pago            |                1470 |        6 | —                | —                | —                | —                               | —                               | —                |            no             |
| planes-suscripcion.csv         | pago            |                  61 |        6 | —                | —                | —                | —                               | —                               | —                |            no             |
| precio-fuga-plantada.csv       | estacionamiento |                  72 |        6 | —                | —                | —                | —                               | —                               | —                |            no             |
| rotacion-empleados.csv         | horas_extra     |                  70 |        6 | —                | —                | —                | —                               | —                               | —                |            no             |
| rotacion-empleados.csv         | renuncio        |                  48 |        6 | —                | —                | —                | —                               | —                               | —                |            no             |

Objetivos binarios: 11 · cambian de veredicto con la propuesta: 0.
