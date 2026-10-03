---
sprint: 005
fase: F0
tipo: spike de costos EN EL NAVEGADOR (no en Node)
fecha: 2026-10-02
runtime: Pyodide 314.0.2 · Python 3.14.2 · scikit-learn 1.8.0 · xgboost 2.1.4 · lightgbm 4.6.0
arnes: scripts/spike-liga/ (datos.mjs · payloads.spike.ts · spike.py · correr.mjs · tabla.mjs)
---

# Spike de costos de la liga — S5 F0

> Punto de partida: el spike de la planeadora (`portafolio/ds/investigacion/2026-10-02-spike-roster-pyodide.md`),
> corrido en Node con `make_classification` (solo numéricas, sin nulos, sin el preprocesador). Este
> repite la medición **donde la usa el producto**: un module worker en el navegador, con el runtime
> self-hosteado de `/pyodide/` cargado EXACTAMENTE como el runner, el `pipeline.py` real (one-hot +
> imputación + `min_frequency`) y payloads armados por el `prepareRun` real de la app.

## Cómo se midió

1. **Payloads** (`payloads.spike.ts`, vitest en Node): CSV → `parseCsvWithLimits` → `sanitizeTable`
   → `prepareRun(table, objetivo, 42)` — el mismo camino que `useExperiment.run`. Datasets: los 4 del
   kit de prueba (200 filas, objetivos reales) + sintéticos con categóricas y ~5 % de nulos
   (`datos.mjs`, semilla fija): 2.000 · 5.000 · 20.000 filas con 8 numéricas + 3 categóricas
   (ancho 33 tras one-hot) y uno ANCHO de 2.000 filas (30 numéricas + categóricas de 30 y 40
   valores → ancho 112) para ver cómo escala con las columnas.
2. **Navegador** (`correr.mjs`, Playwright sobre `pnpm start` = build de producción): contexto nuevo
   = caché HTTP en frío. La app sirve CSP `worker-src 'self'`; el arnés NO la toca — intercepta una
   página y un script de worker del mismo origen (nunca llegan al servidor ni existen en `public/`).
3. **Por modelo** (`spike.py`): `cross_validate` estratificada k=5 (y k=3 en 20.000 filas) del
   `Pipeline([preprocesador clonado, modelo])` dentro de train · fit en train completo + predicción en
   test (lo que cuesta mostrar el test de los perdedores) · aviso de no-convergencia · el TIPO de
   error si falla (jamás el mensaje). **Por dataset:** ancho tras one-hot, explicabilidad del
   ganador (permutation importance sobre test, como hoy), heap de Pyodide y el antes/después
   H1 → S5.

## Límites (declarados)

- **Localhost:** la carga del runtime no paga red. Los +1,40 MiB de los boosters cuestan en red
  móvil lo que pesan (el gate `verificar-peso-pyodide` los vigila); aquí solo se mide el costo de
  CPU de cargarlos.
- **Un equipo** (Mac del usuario, Apple Silicon). Un móvil de gama media puede ser 2–4× más lento:
  por eso la estimación del Nivel 2 se **calibra** con lo que el Nivel 1 tardó en el equipo de
  quien lo usa (`calibrar(medido, estimado)`, F1).
- **Datos sintéticos** para los tamaños grandes: la señal es mayormente lineal con una interacción;
  el ranking de modelos en ellos no generaliza, el COSTO sí (depende de filas × ancho, no de la
  señal).
- Una corrida por punto (no mediana): los costos de 200 filas están dominados por el overhead fijo
  (~0,05 s por modelo); los de 20.000 son estables al ±10 % entre los dos navegadores.

## Reproducir

```bash
pnpm build && pnpm start &   # build de producción
SPIKE_OUT=<dir> pnpm exec vitest run --config scripts/spike-liga/vitest.spike.config.ts
SPIKE_OUT=<dir> node scripts/spike-liga/correr.mjs chromium     # y webkit
SPIKE_OUT=<dir> node scripts/spike-liga/tabla.mjs > tablas.md
```

## Hallazgos (lo que el spike de la planeadora no podía ver)

1. **La liga completa cabe holgada en los datasets del kit.** Con 200 filas, los 14 modelos (CV k=5,
   fit y test de todos, y la explicabilidad del ganador) tardan **3,4–4,5 s en Chromium y 3,5–5,9 s
   en WebKit**. El costo crece con filas × ancho: 2.000 filas ≈ 15–20 s · 5.000 ≈ 33–46 s · 20.000 ≈
   140–170 s (k=5). Los que mandan el costo son **mlp** (60 s de CV en 20.000 filas), **forest** y
   **forest_balanced** (16–18 s) y **extra_trees** (10 s); los tres boosters cuestan 1,5–2,2 s.
2. **KNN NO es caro.** Con 20.000 filas su CV k=5 cuesta **1,5 s** (sklearn usa un árbol KD, no la
   búsqueda cuadrática que el spike de Node asumió y por eso lo saltó). Excluirlo «por 20.000 filas»
   no tiene respaldo de costo.
3. **Naive Bayes con categóricas no se comporta como dice la regla del plan.** Gana la CV en
   rotación (0,720, con 60 % de columnas one-hot) y se hunde en el dataset ancho (0,511, 73 %). Con
   selección por CV, un modelo que no encaja simplemente puntúa bajo y queda etiquetado.
4. **El MLP del plan (`max_iter=300`) no converge en NINGÚN dataset** (aviso de convergencia en los 8) y es el más caro (60 s de CV con 20.000 filas). Con la regla «no convergió = no concluyó» nunca
   podría ganar. **Variante medida — `early_stopping=True`, `max_iter=500`, `n_iter_no_change=10`:**
   converge en los 8, cuesta **~8× menos** (7,1 s de CV con 20.000 filas) y puntúa MEJOR: con 20.000
   filas queda **primera de toda la liga** (CV 0,827 frente a 0,824 de hgb) y con 5.000 empata con la
   mejor. Con 200 filas puntúa mal en los 4 datasets (0,43–0,74: su validación interna se queda con
   ~15 filas) → `MLP_MIN_ROWS = 500` tiene respaldo medido.
5. **⚠ Con muestras chicas, «gana el máximo de la CV» elige MAL.** Con 150 filas de train y folds de
   30, la CV de cada modelo es ruidosa (error estándar 0,03–0,08) y el máximo entre 14 premia la
   suerte — la maldición del ganador, ahora dentro de la CV. En 2 de los 4 datasets del kit S5 elige
   peor que H1: rotación (Naive Bayes, test 0,641 → «NO supera») y clientes-sucio (KNN, test 0,535 →
   «NO supera»), donde H1 decía «supera». El veredicto sigue siendo honesto (el test no participó),
   pero la elección es mala justo donde los usuarios llegan con pocos datos.
   **Remedio medido — la regla de un error estándar** (Hastie, Tibshirani y Friedman, ESL §7.10):
   entre los modelos a menos de 1 EE del mejor puntaje de CV, gana el más simple (orden del roster,
   que es el de costo). Sobre los mismos 8 datasets: rotación → logística (empata con el baseline: «la
   liga no encontró nada mejor que la regresión de referencia»), clientes-sucio → logística (empata),
   marketing → hgb (test 0,732 frente a 0,684), y en los grandes elige igual que el máximo. **Nunca
   peor que el máximo en esta muestra.** Salvedad honesta: la regla se juzgó con resultados de test de
   8 datasets de prueba (no del usuario); es la regla de libro, no un ajuste a estos datos.
6. **Determinismo entre motores:** Chromium y WebKit dan **puntajes idénticos** en los 8 datasets
   (semillas fijas, `n_jobs=1`) — la tabla, la elección manual y el export serán reproducibles en
   cualquier navegador. Los TIEMPOS sí varían (WebKit ~1,4× más lento en 2.000–5.000 filas, ~0,9× en
   20.000): por eso la estimación del Nivel 2 se calibra con el Nivel 1 del propio equipo.
7. **Memoria:** el heap de Pyodide crece hasta **557 MB** con 20.000 filas (ambos navegadores lo
   resistieron en escritorio). WASM no devuelve memoria; en un móvil con el máximo de la app (50.000
   filas) es un riesgo real → k=3 por encima de 20.000 filas y el Nivel 2 avisa del tamaño.
8. **Cargar los boosters cuesta ~0 s de CPU** (1,94 → 1,99 s en frío en Chromium; 1,93 → 1,93 s en
   WebKit, localhost). Su costo real es la red: +1,40 MiB (gate de peso).
9. **Contaminación descartada midiendo:** la suite unit corrió en paralelo mientras Chromium medía
   `ancho-2000` y `sintetico-5000`. Repetidos SOLOS: 39,5 s (antes 37,5) y 35,3 s (antes 33,0) — la
   sospecha no se confirmó; es la variación natural entre corridas (±5–7 %), con puntajes idénticos.
   Se conservan las cifras de la corrida completa.
10. **Mostrar el test de los perdedores (eager) cuesta poco:** Σ(fit + test) es el 13–20 % de la CV
    (0,6–0,9 s con 200 filas). Calcularlo en la misma corrida evita un segundo viaje al worker y un
    estado de «cargando» dentro del desplegable.

## Decisiones para el STOP de la Fase 0

| #        | Decisión                            | Opciones                                                                                                                                                                                                                                               | Recomendación                                                                                                                                         | Por qué (medido)                                                                                                                                                                                                                       |
| -------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F0-1** | **Techo del Nivel 1** (lo fijas tú) | 5 s · 10 s · 20 s (en el equipo de referencia)                                                                                                                                                                                                         | **5 s**                                                                                                                                               | La liga completa (14) cabe en los 4 datasets del kit (3,3–4,4 s). Con 2.000 filas entran 11; con 20.000, 7 (los baratos + hgb). Un móvil tardará 2–4× más: 5 s de referencia ≈ 10–20 s reales.                                         |
| **F0-2** | **Regla de selección**              | (a) máximo de la CV, empate → el más barato (plan) · (b) **un error estándar**: entre los que quedan a < 1 EE del mejor, el más simple                                                                                                                 | **(b)** — desviación D8                                                                                                                               | Con muestras chicas el máximo elige mal (rotación y clientes-sucio pasan de «supera» a «NO supera» con Naive Bayes y KNN). La regla de 1 EE las corrige (logística, empata con el baseline) y en los grandes elige igual.              |
| **F0-3** | **Reglas «fuera» de E2**            | (a) las del plan (KNN > 10.000 filas, NB con ≥ 50 % categóricas, MLP < 500 filas) · (b) **solo las que el spike respalda**: MLP < 500 filas y variantes balanceadas con clases equilibradas (minoritaria ≥ 40 %: serían idénticas a su versión normal) | **(b)** — desviación D9 (cambia la aceptación 4: «KNN fuera con 20.000 filas» → «MLP fuera con 100 filas · balanceada fuera con clases equilibradas») | KNN con 20.000 filas cuesta 1,5 s de CV; NB con categóricas gana en rotación. Con selección por CV, «no encaja» se ve en el puntaje, etiquetado. Excluir sin razón medida es impedir. KNN y NB llevan su advertencia en la ficha (E3). |
| F0-4     | **MLP**                             | `max_iter=300` (plan) · **`early_stopping=True`, `max_iter=500`, `n_iter_no_change=10`**                                                                                                                                                               | **early stopping**                                                                                                                                    | Converge siempre, ~8× más barato, mejor puntaje con ≥ 2.000 filas.                                                                                                                                                                     |
| F0-5     | **Test de los perdedores**          | eager (misma corrida) · lazy (a demanda)                                                                                                                                                                                                               | **eager**                                                                                                                                             | Cuesta el 13–20 % de la CV; sin segundo viaje al worker ni «cargando» en el desplegable.                                                                                                                                               |
| F0-6     | **k de la CV**                      | 5 hasta 20.000 filas, 3 por encima (plan)                                                                                                                                                                                                              | **como el plan**                                                                                                                                      | Con 20.000 filas k=3 cuesta la mitad y el puntaje cambia ≤ 0,004.                                                                                                                                                                      |

**Constantes propuestas para `engine/encarrilador.ts` / `engine/costos.ts`** (si apruebas F0-1…F0-6):
`LEVEL1_CEILING_S = 5` · `MLP_MIN_ROWS = 500` · `BALANCED_MIN_MINORITY = 0.40` · `CV_K = 5` ·
`CV_K_LARGE = 3` desde `CV_LARGE_FROM_ROWS = 20_001` · `SMALL_SAMPLE_ROWS = 200` (aviso «muestra
pequeña») · coeficientes del modelo de costos de la tabla «Modelo de costos propuesto».

## Tablas (generadas por `scripts/spike-liga/tabla.mjs`)

### chromium 151.0.7922.34 — carga del runtime en frío (localhost, 2026-10-03)

| Paquetes     | Runtime (ms) | Paquetes (ms) | Total (ms) |
| ------------ | -----------: | ------------: | ---------: |
| sin boosters |          875 |          1065 |       1940 |
| con boosters |          884 |          1101 |       1985 |

### chromium — la liga completa por dataset (14 modelos, CV k=5 + fit en train + test de todos + explicabilidad del ganador)

| Dataset            | Filas | Train | Ancho tras one-hot | Métrica | Liga completa (s) | Σ CV k=5 (s) | Σ fit+test (s) | Explicabilidad (s) | Heap (MB) |
| ------------------ | ----: | ----: | -----------------: | ------- | ----------------: | -----------: | -------------: | -----------------: | --------: |
| marketing-200      |   200 |   150 |                 10 | f1      |               4.5 |          3.1 |            0.7 |               0.59 |       187 |
| rotacion-200       |   200 |   150 |                 10 | auc     |               3.7 |          2.9 |            0.7 |               0.15 |       187 |
| credito-fuga-200   |   200 |   149 |                  7 | f1      |               3.4 |          2.7 |            0.6 |               0.13 |       187 |
| clientes-sucio-200 |   190 |   142 |                  6 | auc     |               3.4 |          2.7 |            0.6 |               0.08 |       224 |
| sintetico-2000     |  2000 |  1499 |                 33 | auc     |              14.7 |         11.4 |            2.8 |               0.31 |       224 |
| ancho-2000         |  2000 |  1500 |                112 | auc     |              37.5 |         24.6 |            6.0 |               6.26 |       269 |
| sintetico-5000     |  5000 |  3750 |                 33 | auc     |              33.0 |         26.1 |            6.5 |               0.36 |       322 |
| sintetico-20000    | 20000 | 15000 |                 33 | auc     |             197.7 |        113.8 |           28.0 |               1.62 |       557 |

### chromium — costo por modelo: CV k=5 (s) · ⚠ = aviso de no-convergencia · ✗ = error

| Modelo            | marketing-200 | rotacion-200 | credito-fuga-200 | clientes-sucio-200 | sintetico-2000 | ancho-2000 | sintetico-5000 |     sintetico-20000 |
| ----------------- | ------------: | -----------: | ---------------: | -----------------: | -------------: | ---------: | -------------: | ------------------: |
| logistic          |          0.05 |         0.04 |             0.04 |               0.04 |           0.07 |       0.10 |           0.12 |     0.26 (k=3: 0.1) |
| logistic_balanced |          0.05 |         0.04 |             0.04 |               0.04 |           0.07 |       0.09 |           0.10 |     0.28 (k=3: 0.1) |
| ridge             |          0.04 |         0.04 |             0.04 |               0.04 |           0.06 |       0.14 |           0.10 |     0.29 (k=3: 0.2) |
| naive_bayes       |          0.04 |         0.04 |             0.03 |               0.03 |           0.05 |       0.07 |           0.09 |     0.23 (k=3: 0.1) |
| knn               |          0.04 |         0.04 |             0.04 |               0.03 |           0.08 |       0.11 |           0.16 |     1.53 (k=3: 1.3) |
| linear_svc        |          0.04 |         0.04 |             0.04 |               0.03 |           0.06 |       0.08 |           0.09 |     0.24 (k=3: 0.1) |
| decision_tree     |          0.04 |         0.04 |             0.04 |               0.03 |           0.08 |       0.15 |           0.15 |     0.58 (k=3: 0.3) |
| extra_trees       |          0.54 |         0.52 |             0.49 |               0.50 |           1.19 |       1.56 |           2.33 |    10.34 (k=3: 4.9) |
| forest            |          0.74 |         0.71 |             0.68 |               0.68 |           1.46 |       2.21 |           3.07 |    18.40 (k=3: 7.7) |
| forest_balanced   |          0.71 |         0.70 |             0.68 |               0.68 |           1.48 |       2.19 |           3.32 |    16.09 (k=3: 7.5) |
| hgb               |          0.12 |         0.11 |             0.08 |               0.10 |           0.68 |       1.47 |           0.92 |     1.54 (k=3: 1.2) |
| xgboost           |          0.15 |         0.12 |             0.09 |               0.10 |           0.67 |       1.96 |           1.07 |     2.19 (k=3: 1.2) |
| lightgbm          |          0.17 |         0.11 |             0.08 |               0.10 |           0.77 |       1.62 |           0.98 |     1.92 (k=3: 1.2) |
| mlp               |        0.35 ⚠ |       0.33 ⚠ |           0.30 ⚠ |             0.29 ⚠ |         4.71 ⚠ |      12.79 |        13.60 ⚠ | 59.90 (k=3: 27.7) ⚠ |

### chromium — puntaje por modelo: CV k=5 media (test entre paréntesis — «no sirve para elegir»)

| Modelo            |   marketing-200 |    rotacion-200 | credito-fuga-200 | clientes-sucio-200 |  sintetico-2000 |      ancho-2000 |  sintetico-5000 | sintetico-20000 |
| ----------------- | --------------: | --------------: | ---------------: | -----------------: | --------------: | --------------: | --------------: | --------------: |
| logistic          |   0.587 (0.524) |   0.707 (0.755) |    0.969 (1.000) |      0.637 (0.634) |   0.788 (0.790) |   0.785 (0.795) |   0.819 (0.822) |   0.820 (0.815) |
| logistic_balanced |   0.629 (0.596) |   0.699 (0.761) |    0.977 (1.000) |      0.629 (0.645) | ★ 0.788 (0.790) |   0.786 (0.792) |   0.819 (0.822) |   0.820 (0.815) |
| ridge             |   0.573 (0.524) |   0.703 (0.750) |    0.901 (0.905) |      0.632 (0.634) |   0.788 (0.794) |   0.780 (0.794) | ★ 0.819 (0.821) |   0.820 (0.814) |
| naive_bayes       |   0.595 (0.571) | ★ 0.720 (0.641) |  ★ 1.000 (1.000) |      0.602 (0.585) |   0.668 (0.695) |   0.511 (0.622) |   0.742 (0.778) |   0.786 (0.784) |
| knn               |   0.663 (0.632) |   0.650 (0.661) |    0.827 (0.884) |    ★ 0.692 (0.535) |   0.665 (0.691) |   0.669 (0.608) |   0.730 (0.736) |   0.741 (0.738) |
| linear_svc        |   0.573 (0.524) |   0.703 (0.752) |    0.993 (1.000) |      0.629 (0.631) |   0.788 (0.791) |   0.777 (0.794) |   0.819 (0.822) |   0.820 (0.814) |
| decision_tree     |   0.672 (0.500) |   0.678 (0.653) |    0.993 (1.000) |      0.501 (0.496) |   0.671 (0.691) |   0.679 (0.704) |   0.704 (0.714) |   0.708 (0.695) |
| extra_trees       |   0.734 (0.579) |   0.636 (0.732) |    0.985 (1.000) |      0.628 (0.409) |   0.739 (0.738) |   0.780 (0.787) |   0.795 (0.801) |   0.804 (0.799) |
| forest            |   0.743 (0.684) |   0.701 (0.766) |    0.993 (1.000) |      0.601 (0.599) |   0.772 (0.764) |   0.785 (0.766) |   0.811 (0.816) |   0.818 (0.811) |
| forest_balanced   | ★ 0.757 (0.684) |   0.693 (0.764) |    0.993 (1.000) |      0.618 (0.549) |   0.771 (0.776) | ★ 0.796 (0.768) |   0.812 (0.817) |   0.819 (0.812) |
| hgb               |   0.741 (0.732) |   0.674 (0.741) |    0.993 (1.000) |      0.535 (0.686) |   0.762 (0.762) |   0.788 (0.784) |   0.808 (0.812) | ★ 0.824 (0.821) |
| xgboost           |   0.717 (0.684) |   0.701 (0.734) |    0.993 (1.000) |      0.571 (0.589) |   0.751 (0.763) |   0.790 (0.781) |   0.807 (0.814) |   0.821 (0.818) |
| lightgbm          |   0.690 (0.667) |   0.673 (0.745) |    0.993 (1.000) |      0.510 (0.561) |   0.749 (0.763) |   0.782 (0.781) |   0.804 (0.812) |   0.822 (0.820) |
| mlp               |   0.673 (0.600) |   0.682 (0.743) |    0.969 (1.000) |      0.656 (0.634) |   0.757 (0.751) |   0.760 (0.731) |   0.778 (0.776) |   0.793 (0.796) |

### webkit 26.6 — carga del runtime en frío (localhost, 2026-10-03)

| Paquetes     | Runtime (ms) | Paquetes (ms) | Total (ms) |
| ------------ | -----------: | ------------: | ---------: |
| sin boosters |         1051 |           875 |       1926 |
| con boosters |          977 |           954 |       1931 |

### webkit — la liga completa por dataset (14 modelos, CV k=5 + fit en train + test de todos + explicabilidad del ganador)

| Dataset            | Filas | Train | Ancho tras one-hot | Métrica | Liga completa (s) | Σ CV k=5 (s) | Σ fit+test (s) | Explicabilidad (s) | Heap (MB) |
| ------------------ | ----: | ----: | -----------------: | ------- | ----------------: | -----------: | -------------: | -----------------: | --------: |
| marketing-200      |   200 |   150 |                 10 | f1      |               5.9 |          3.9 |            0.9 |               0.87 |       187 |
| rotacion-200       |   200 |   150 |                 10 | auc     |               3.9 |          3.0 |            0.7 |               0.18 |       187 |
| credito-fuga-200   |   200 |   149 |                  7 | f1      |               3.5 |          2.7 |            0.6 |               0.13 |       187 |
| clientes-sucio-200 |   190 |   142 |                  6 | auc     |               4.1 |          3.1 |            0.8 |               0.15 |       224 |
| sintetico-2000     |  2000 |  1499 |                 33 | auc     |              20.1 |         15.9 |            3.8 |               0.35 |       224 |
| ancho-2000         |  2000 |  1500 |                112 | auc     |              47.4 |         30.7 |            8.2 |               7.49 |       269 |
| sintetico-5000     |  5000 |  3750 |                 33 | auc     |              46.2 |         37.4 |            8.2 |               0.45 |       322 |
| sintetico-20000    | 20000 | 15000 |                 33 | auc     |             172.0 |         95.2 |           24.7 |               1.28 |       557 |

### webkit — costo por modelo: CV k=5 (s) · ⚠ = aviso de no-convergencia · ✗ = error

| Modelo            | marketing-200 | rotacion-200 | credito-fuga-200 | clientes-sucio-200 | sintetico-2000 | ancho-2000 | sintetico-5000 |     sintetico-20000 |
| ----------------- | ------------: | -----------: | ---------------: | -----------------: | -------------: | ---------: | -------------: | ------------------: |
| logistic          |          0.07 |         0.05 |             0.04 |               0.04 |           0.08 |       0.10 |           0.10 |     0.29 (k=3: 0.2) |
| logistic_balanced |          0.06 |         0.04 |             0.04 |               0.04 |           0.07 |       0.10 |           0.10 |     0.32 (k=3: 0.2) |
| ridge             |          0.06 |         0.04 |             0.04 |               0.04 |           0.07 |       0.17 |           0.11 |     0.36 (k=3: 0.2) |
| naive_bayes       |          0.05 |         0.03 |             0.04 |               0.04 |           0.07 |       0.07 |           0.12 |     0.27 (k=3: 0.2) |
| knn               |          0.06 |         0.04 |             0.04 |               0.04 |           0.09 |       0.11 |           0.18 |     1.81 (k=3: 1.4) |
| linear_svc        |          0.05 |         0.03 |             0.04 |               0.04 |           0.07 |       0.09 |           0.10 |     0.31 (k=3: 0.2) |
| decision_tree     |          0.05 |         0.04 |             0.04 |               0.04 |           0.09 |       0.18 |           0.19 |     0.94 (k=3: 0.5) |
| extra_trees       |          0.64 |         0.51 |             0.51 |               0.51 |           1.43 |       1.90 |           2.98 |    11.26 (k=3: 4.5) |
| forest            |          0.83 |         0.68 |             0.63 |               0.65 |           1.88 |       2.56 |           4.95 |    13.83 (k=3: 6.8) |
| forest_balanced   |          0.82 |         0.66 |             0.63 |               0.72 |           1.97 |       2.74 |           3.74 |    12.45 (k=3: 7.6) |
| hgb               |          0.15 |         0.12 |             0.09 |               0.14 |           0.86 |       1.77 |           1.05 |     1.27 (k=3: 0.9) |
| xgboost           |          0.23 |         0.13 |             0.09 |               0.13 |           0.89 |       2.21 |           1.04 |     1.67 (k=3: 1.0) |
| lightgbm          |          0.32 |         0.23 |             0.12 |               0.26 |           2.02 |       3.36 |           2.77 |     3.38 (k=3: 3.2) |
| mlp               |        0.45 ⚠ |       0.40 ⚠ |           0.33 ⚠ |             0.46 ⚠ |         6.33 ⚠ |      15.31 |        19.99 ⚠ | 47.05 (k=3: 23.3) ⚠ |

### webkit — puntaje por modelo: CV k=5 media (test entre paréntesis — «no sirve para elegir»)

| Modelo            |   marketing-200 |    rotacion-200 | credito-fuga-200 | clientes-sucio-200 |  sintetico-2000 |      ancho-2000 |  sintetico-5000 | sintetico-20000 |
| ----------------- | --------------: | --------------: | ---------------: | -----------------: | --------------: | --------------: | --------------: | --------------: |
| logistic          |   0.587 (0.524) |   0.707 (0.755) |    0.969 (1.000) |      0.637 (0.634) |   0.788 (0.790) |   0.785 (0.795) |   0.819 (0.822) |   0.820 (0.815) |
| logistic_balanced |   0.629 (0.596) |   0.699 (0.761) |    0.977 (1.000) |      0.629 (0.645) | ★ 0.788 (0.790) |   0.786 (0.792) |   0.819 (0.822) |   0.820 (0.815) |
| ridge             |   0.573 (0.524) |   0.703 (0.750) |    0.901 (0.905) |      0.632 (0.634) |   0.788 (0.794) |   0.780 (0.794) | ★ 0.819 (0.821) |   0.820 (0.814) |
| naive_bayes       |   0.595 (0.571) | ★ 0.720 (0.641) |  ★ 1.000 (1.000) |      0.602 (0.585) |   0.668 (0.695) |   0.511 (0.622) |   0.742 (0.778) |   0.786 (0.784) |
| knn               |   0.663 (0.632) |   0.650 (0.661) |    0.827 (0.884) |    ★ 0.692 (0.535) |   0.665 (0.691) |   0.669 (0.608) |   0.730 (0.736) |   0.741 (0.738) |
| linear_svc        |   0.573 (0.524) |   0.703 (0.752) |    0.993 (1.000) |      0.629 (0.631) |   0.788 (0.791) |   0.777 (0.794) |   0.819 (0.822) |   0.820 (0.814) |
| decision_tree     |   0.672 (0.500) |   0.678 (0.653) |    0.993 (1.000) |      0.501 (0.496) |   0.671 (0.691) |   0.679 (0.704) |   0.704 (0.714) |   0.708 (0.695) |
| extra_trees       |   0.734 (0.579) |   0.636 (0.732) |    0.985 (1.000) |      0.628 (0.409) |   0.739 (0.738) |   0.780 (0.787) |   0.795 (0.801) |   0.804 (0.799) |
| forest            |   0.743 (0.684) |   0.701 (0.766) |    0.993 (1.000) |      0.601 (0.599) |   0.772 (0.764) |   0.785 (0.766) |   0.811 (0.816) |   0.818 (0.811) |
| forest_balanced   | ★ 0.757 (0.684) |   0.693 (0.764) |    0.993 (1.000) |      0.618 (0.549) |   0.771 (0.776) | ★ 0.796 (0.768) |   0.812 (0.817) |   0.819 (0.812) |
| hgb               |   0.741 (0.732) |   0.674 (0.741) |    0.993 (1.000) |      0.535 (0.686) |   0.762 (0.762) |   0.788 (0.784) |   0.808 (0.812) | ★ 0.824 (0.821) |
| xgboost           |   0.717 (0.684) |   0.701 (0.734) |    0.993 (1.000) |      0.571 (0.589) |   0.751 (0.763) |   0.790 (0.781) |   0.807 (0.814) |   0.821 (0.818) |
| lightgbm          |   0.690 (0.667) |   0.673 (0.745) |    0.993 (1.000) |      0.510 (0.561) |   0.749 (0.763) |   0.782 (0.781) |   0.804 (0.812) |   0.822 (0.820) |
| mlp               |   0.673 (0.600) |   0.682 (0.743) |    0.969 (1.000) |      0.656 (0.634) |   0.757 (0.751) |   0.760 (0.731) |   0.778 (0.776) |   0.793 (0.796) |

### Antes / después — H1 (argmax sobre TEST entre forest y hgb) frente a S5 (argmax sobre CV entre 14)

| Dataset            | Mejor baseline (test) | H1: ganador · test · veredicto | S5 máximo de CV: ganador · CV · test · veredicto | S5 PROPUESTO (1 EE + MLP early stopping): ganador · test · veredicto |
| ------------------ | --------------------: | ------------------------------ | ------------------------------------------------ | -------------------------------------------------------------------- |
| marketing-200      |                 0.524 | hgb · 0.732 · beats            | forest_balanced · 0.757 · 0.684 · beats          | hgb · 0.732 · beats (EE 0.030)                                       |
| rotacion-200       |                 0.756 | forest · 0.766 · beats         | naive_bayes · 0.720 · 0.641 · loses              | logistic · 0.755 · ties (EE 0.040)                                   |
| credito-fuga-200   |                 1.000 | forest · 1.000 · ties          | naive_bayes · 1.000 · 1.000 · ties               | naive_bayes · 1.000 · ties (EE 0.000)                                |
| clientes-sucio-200 |                 0.634 | hgb · 0.686 · beats            | knn · 0.692 · 0.535 · loses                      | logistic · 0.634 · ties (EE 0.075)                                   |
| sintetico-2000     |                 0.790 | forest · 0.764 · loses         | logistic_balanced · 0.788 · 0.790 · ties         | logistic · 0.790 · ties (EE 0.008)                                   |
| ancho-2000         |                 0.795 | hgb · 0.784 · loses            | forest_balanced · 0.796 · 0.768 · loses          | forest_balanced · 0.768 · loses (EE 0.004)                           |
| sintetico-5000     |                 0.822 | forest · 0.816 · ties          | ridge · 0.819 · 0.821 · ties                     | logistic · 0.822 · ties (EE 0.003)                                   |
| sintetico-20000    |                 0.814 | hgb · 0.821 · ties             | hgb · 0.824 · 0.821 · ties                       | hgb · 0.821 · ties (EE 0.003)                                        |

### Modelo de costos propuesto (para `engine/costos.ts`, roster propuesto): t_cv5 ≈ t0 + a · (n_train/1000)^b · (ancho/33)^c

| Modelo            | t0 (s) |  a (s) | b (filas) | c (ancho) | error máx. en los sintéticos |
| ----------------- | -----: | -----: | --------: | --------: | ---------------------------: |
| logistic          |  0.037 | 0.0243 |      0.83 |      0.59 |                         10 % |
| logistic_balanced |  0.038 | 0.0179 |      0.95 |      0.60 |                          3 % |
| ridge             |  0.035 | 0.0181 |      0.97 |      1.14 |                          1 % |
| naive_bayes       |  0.033 | 0.0144 |      0.97 |      0.49 |                          1 % |
| knn               |  0.034 | 0.0198 |      1.57 |      0.45 |                         17 % |
| linear_svc        |  0.034 | 0.0154 |      0.96 |      0.57 |                          1 % |
| decision_tree     |  0.034 | 0.0269 |      1.11 |      0.84 |                          0 % |
| extra_trees       |  0.495 | 0.4198 |      1.16 |      0.35 |                          4 % |
| forest            |  0.676 | 0.4323 |      1.36 |      0.55 |                          7 % |
| forest_balanced   |  0.675 | 0.4834 |      1.28 |      0.51 |                          1 % |
| hgb               |  0.084 | 0.5077 |      0.39 |      0.69 |                          1 % |
| xgboost           |  0.088 | 0.4652 |      0.56 |      0.96 |                          1 % |
| lightgbm          |  0.081 | 0.5529 |      0.43 |      0.65 |                          8 % |
| mlp               |  0.100 | 0.8409 |      0.74 |      0.24 |                         28 % |

```json
{
  "logistic": {
    "t0": 0.037,
    "a": 0.0243,
    "b": 0.833,
    "c": 0.593
  },
  "logistic_balanced": {
    "t0": 0.038,
    "a": 0.0179,
    "b": 0.951,
    "c": 0.597
  },
  "ridge": {
    "t0": 0.035,
    "a": 0.0181,
    "b": 0.974,
    "c": 1.142
  },
  "naive_bayes": {
    "t0": 0.033,
    "a": 0.0144,
    "b": 0.97,
    "c": 0.485
  },
  "knn": {
    "t0": 0.034,
    "a": 0.0198,
    "b": 1.569,
    "c": 0.452
  },
  "linear_svc": {
    "t0": 0.034,
    "a": 0.0154,
    "b": 0.964,
    "c": 0.567
  },
  "decision_tree": {
    "t0": 0.034,
    "a": 0.0269,
    "b": 1.11,
    "c": 0.838
  },
  "extra_trees": {
    "t0": 0.495,
    "a": 0.4198,
    "b": 1.157,
    "c": 0.353
  },
  "forest": {
    "t0": 0.676,
    "a": 0.4323,
    "b": 1.359,
    "c": 0.548
  },
  "forest_balanced": {
    "t0": 0.675,
    "a": 0.4834,
    "b": 1.28,
    "c": 0.513
  },
  "hgb": {
    "t0": 0.084,
    "a": 0.5077,
    "b": 0.387,
    "c": 0.69
  },
  "xgboost": {
    "t0": 0.088,
    "a": 0.4652,
    "b": 0.558,
    "c": 0.955
  },
  "lightgbm": {
    "t0": 0.081,
    "a": 0.5529,
    "b": 0.431,
    "c": 0.651
  },
  "mlp": {
    "t0": 0.1,
    "a": 0.8409,
    "b": 0.744,
    "c": 0.24
  }
}
```

### Simulación: ¿quién entra al Nivel 1 según el techo? (roster propuesto, costos medidos en chromium)

| Dataset            | Techo | Nivel 1 (modelos · s) | Queda para el Nivel 2                                             | Nivel 2 = unión (s) | Explicabilidad del ganador S5 (s) |
| ------------------ | ----: | --------------------- | ----------------------------------------------------------------- | ------------------: | --------------------------------: |
| marketing-200      |   5 s | 14 · 3.5              | — (la liga completa cabe)                                         |                   — |            0.59 (forest_balanced) |
| marketing-200      |  10 s | 14 · 3.5              | — (la liga completa cabe)                                         |                   — |            0.59 (forest_balanced) |
| marketing-200      |  20 s | 14 · 3.5              | — (la liga completa cabe)                                         |                   — |            0.59 (forest_balanced) |
| rotacion-200       |   5 s | 14 · 3.3              | — (la liga completa cabe)                                         |                   — |                0.15 (naive_bayes) |
| rotacion-200       |  10 s | 14 · 3.3              | — (la liga completa cabe)                                         |                   — |                0.15 (naive_bayes) |
| rotacion-200       |  20 s | 14 · 3.3              | — (la liga completa cabe)                                         |                   — |                0.15 (naive_bayes) |
| credito-fuga-200   |   5 s | 14 · 3.0              | — (la liga completa cabe)                                         |                   — |                0.13 (naive_bayes) |
| credito-fuga-200   |  10 s | 14 · 3.0              | — (la liga completa cabe)                                         |                   — |                0.13 (naive_bayes) |
| credito-fuga-200   |  20 s | 14 · 3.0              | — (la liga completa cabe)                                         |                   — |                0.13 (naive_bayes) |
| clientes-sucio-200 |   5 s | 14 · 3.1              | — (la liga completa cabe)                                         |                   — |                        0.08 (knn) |
| clientes-sucio-200 |  10 s | 14 · 3.1              | — (la liga completa cabe)                                         |                   — |                        0.08 (knn) |
| clientes-sucio-200 |  20 s | 14 · 3.1              | — (la liga completa cabe)                                         |                   — |                        0.08 (knn) |
| sintetico-2000     |   5 s | 11 · 4.7              | forest, forest_balanced, mlp                                      |                10.1 |          0.31 (logistic_balanced) |
| sintetico-2000     |  10 s | 13 · 8.4              | mlp                                                               |                10.1 |          0.31 (logistic_balanced) |
| sintetico-2000     |  20 s | 14 · 10.1             | — (la liga completa cabe)                                         |                   — |          0.31 (logistic_balanced) |
| ancho-2000         |   5 s | 9 · 4.7               | xgboost, extra_trees, forest, forest_balanced, mlp                |                16.9 |            6.26 (forest_balanced) |
| ancho-2000         |  10 s | 11 · 9.1              | forest, forest_balanced, mlp                                      |                16.9 |            6.26 (forest_balanced) |
| ancho-2000         |  20 s | 14 · 16.9             | — (la liga completa cabe)                                         |                   — |            6.26 (forest_balanced) |
| sintetico-5000     |   5 s | 10 · 4.8              | extra_trees, forest, forest_balanced, mlp                         |                18.0 |                      0.36 (ridge) |
| sintetico-5000     |  10 s | 12 · 9.9              | forest, forest_balanced                                           |                18.0 |                      0.36 (ridge) |
| sintetico-5000     |  20 s | 14 · 18.0             | — (la liga completa cabe)                                         |                   — |                      0.36 (ridge) |
| sintetico-20000    |   5 s | 7 · 4.3               | knn, lightgbm, xgboost, extra_trees, forest, forest_balanced, mlp |                76.6 |                        1.62 (hgb) |
| sintetico-20000    |  10 s | 9 · 9.5               | xgboost, extra_trees, forest, forest_balanced, mlp                |                76.6 |                        1.62 (hgb) |
| sintetico-20000    |  20 s | 10 · 12.2             | extra_trees, forest, forest_balanced, mlp                         |                76.6 |                        1.62 (hgb) |
