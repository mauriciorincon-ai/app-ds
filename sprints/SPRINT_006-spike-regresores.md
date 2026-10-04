---
sprint: 006
fase: F0
tipo: spike de regresores EN EL NAVEGADOR (no en Node)
fecha: 2026-10-04
runtime: Pyodide 314.0.2 · scikit-learn 1.8.0 · xgboost 2.1.4 · lightgbm 4.6.0
navegadores: Chromium 153 (referencia) · WebKit 26.6 (segunda lectura)
arnes: scripts/spike-regresion/ (datos.mjs · payloads.spike.ts · spike.py · tabla.mjs) + scripts/spike-liga/correr.mjs (SPIKE_PY)
---

# Spike de regresores — S6 F0

El S5 midió la liga de clasificación. Este spike mide **la liga de regresión donde la usará el
producto**: un module worker en el navegador, con el runtime self-hosteado de `/pyodide/`, el
`pipeline.py` real (imputación + escala + one-hot con `min_frequency`) y payloads armados con la regla
real de features de la app.

## Cómo se midió

1. **Payloads** (`payloads.spike.ts`, vitest en Node). El camino es
   CSV → `parseCsvWithLimits` → `sanitizeTable` → `selectFeatures`, la regla real que ahora se
   exporta.
   - **Límite declarado:** la rama numérica de `prepareRun` todavía no existe, así que el **split**
     lo arma el arnés con la regla propuesta P4: 5 bandas por cuantiles del objetivo + el
     `stratifiedSplit` real sobre la banda. En los 9 datasets dio 75 % / 25 % exacto.
   - **Datasets:**
     - los tres nuevos del kit: `consumo-energia` (200), `consumo-energia-mediano` (5.000) y
       `precio-fuga-plantada` (200);
     - el mismo precio **sin** la columna plantada;
     - `rotacion-empleados` con objetivo `edad` (R19: deja de ser «no entrenable»; en ese generador la
       edad es ruido puro);
     - sintéticos de regresión (`datos.mjs`, misma forma que los del S5: ancho 33 tras one-hot) de
       2.000, 5.000 y 20.000 filas, más uno **ancho** de 2.000 filas (ancho 112).
2. **Navegador** (`correr.mjs` con `SPIKE_PY`, Playwright sobre `pnpm start`, es decir, el build de
   producción). Cada contexto es nuevo, con la caché HTTP en frío.
   - Se corrió en Chromium (referencia) y en WebKit.
   - **La primera corrida de Chromium se descartó:** coincidió con corridas de vitest en la misma
     máquina, y `consumo-5000` tardó 26,9 s, frente a 19,1 s con la máquina quieta. Las tablas usan
     la corrida repetida sin otra carga.
3. **Por modelo** (`spike.py`):
   - CV `KFold(5, shuffle, seed)` del `Pipeline` completo dentro de train, con scoring
     `neg_mean_absolute_error`, signo invertido: **MAE en unidades, menor es mejor**. En 20.000 filas
     también se midió k = 3.
   - Fit en train completo + predicción en test: MAE · RMSE · R² · MedAE.
   - Aviso de no-convergencia e iteraciones del MLP.
   - El TIPO de error si algo falla, jamás el mensaje.
4. **Por dataset:**
   - baselines media, mediana y lineal, en CV y en test;
   - forma del objetivo en train;
   - |Spearman| (numéricas) y η² (categóricas, también con soporte ≥ 5 por categoría) de cada
     columna con el objetivo, en train;
   - costo de la explicabilidad del ganador (permutation importance con MAE, 10 repeticiones).

## Límites (declarados)

- **Localhost y un solo equipo** (el Mac del usuario, Apple Silicon). Un móvil de gama media puede ir
  2 a 4 veces más lento. Por eso el Nivel 2 se **calibra** con lo que tardó el Nivel 1 (S5).
- **Una corrida por punto.** Entre corridas de Chromium hubo una variación de hasta ±15 % en los
  grandes. WebKit/Chromium dio entre 0,86× y 1,28×.
- **Los datasets del kit son sintéticos con señal diseñada.** El ranking de modelos sobre ellos no
  generaliza; los **costos** y los **umbrales de los guardarraíles** sí, porque dependen de filas ×
  ancho y de la forma de los datos.
- **No hay columnas legítimas casi deterministas** (por ejemplo «precio con IVA» frente a «precio»).
  El umbral de fuga se fija contra la columna legítima más fuerte medida (0,839) y la plantada (1,000).

## Hallazgos

1. **La liga completa de regresión cabe en el Nivel 1 a 200 filas: 2,5–3,0 s** de CV + fit + test,
   con techo de 5 s, en los 4 datasets de 200 filas. Con 5.000 filas entran 8 de 11 en el Nivel 1;
   quedan `extra_trees`, `forest` y `mlp`, y el Nivel 2 sí cambia el ganador en `consumo-5000`, donde
   el MLP es el mínimo de CV.
2. **Bosques de regresión ≈ 5× más caros que los de clasificación.** Con 15.000 filas de train, el
   CV k = 5 de `forest` tarda 94 s; el de clasificación del S5 estimaba unos 18 s. La causa es que
   `RandomForestRegressor` y `ExtraTreesRegressor` usan por defecto `max_features=1.0` (todas las
   columnas en cada corte), mientras que el clasificador usa `sqrt`. Se mantienen los valores por
   defecto de sklearn (documentados) y el costo queda en sus coeficientes. Son los últimos en
   prioridad y caen en el Nivel 2 desde unas 2.000 filas.
3. **Lasso y MLP necesitan el objetivo estandarizado** (`TransformedTargetRegressor` con
   `StandardScaler`). La penalización L1 y el paso de adam se miden en unidades de y. Así quedan sin
   escalar:

   | Modelo sin escalar | Dataset | MAE sin escalar | MAE escalado | Qué pasa                                  |
   | ------------------ | ------- | --------------- | ------------ | ----------------------------------------- |
   | MLP                | consumo | 290,8           | 32,4         | ⚠ no converge                             |
   | MLP                | precio  | 179.727         | 26.357       | predice ≈ 0                               |
   | Lasso              | precio  | —               | —            | ⚠ 5.000 iteraciones, sin regularizar nada |

   Ridge es invariante a la escala del objetivo y no lo necesita.

4. **MLP con parada temprana + objetivo escalado converge en los 9 datasets** (26 a 352
   iteraciones, ningún aviso). Sin parada temprana: 4 avisos de no-convergencia y el doble de costo
   en 20.000 filas (36 s frente a 17 s). Se confirma la configuración del S5.
5. **La regla de un error estándar con MAE (menor es mejor) se comporta como en clasificación.**
   - `precio-sin-fuga`: elige `linear` en lugar de `lightgbm` (5,1 % peor en CV, EE/MAE = 5,5 %).
     Como `linear` también es baseline, el veredicto es «empata»: el análogo exacto de la logística
     del S5.
   - `ancho-2000` y `sintetico-20000`: elige `hgb` frente a `lightgbm`, con 0,1 % de diferencia.
   - **EE/MAE es de 5,5 % con 150 filas de train y de 0,6–1,8 % con ≥ 1.500.**
6. **Con E2 (MLP fuera por debajo de `MLP_MIN_ROWS` = 500), `consumo-energia` lo gana
   `extra_trees`:** MAE de prueba 33,5 kWh frente a 43,8 kWh de la lineal (supera por 23,5 %). Sin
   la regla, lo ganaría el MLP (29,2). Se mantiene `MLP_MIN_ROWS` = 500 en regresión: a 200 filas el
   MLP gana en `consumo` pero pierde en `precio` (varianza alta), y sigue siendo forzable en el
   Nivel 2.
7. **Media frente a mediana como baseline:** la **mediana tiene MAE de prueba ≤ la media en los 9
   datasets**. La diferencia va de 0 a 1,9 %, y es mayor en `precio`, el objetivo sesgado. En estos
   datos **ningún veredicto cambia**, porque donde hay señal la lineal es el baseline más fuerte por
   20–45 %. Donde no hay señal (`edad`) es donde se nota: frente a media+lineal la mejora del elegido
   es −0,1 %; frente a mediana+lineal, −1,0 %, justo en el borde de la tolerancia de 1 %.
8. **La tolerancia del veredicto no cambia ningún resultado entre 1 %, 2 % y 5 %.** Las mejoras son
   de 20 a 45 % o de alrededor de 0 %. La tolerancia es un **margen de equivalencia práctica** (como
   los 0,01 de AUC de la binaria), no una prueba estadística: el ruido del MAE de prueba a 200 filas
   es mayor. La nota «muestra pequeña» del S5 acompaña.
9. **Fuga continua:**
   - columnas legítimas: |Spearman| en 72 numéricas con mediana 0,036 · p95 0,720 · **máximo 0,839**
     (`superficie_m2` frente a `precio_usd`);
   - η² en 22 categóricas: **máximo 0,092**;
   - **la plantada da 1,000.**

   Un umbral de 0,98 deja 0,14 de margen a cada lado. Un detalle: la heurística categórica binaria
   (`categoryPurity`) **no** tiene soporte mínimo. Un η² con categorías de una sola fila vale 1 por
   construcción, así que la regresión necesita su propio soporte mínimo. El plan decía «la misma
   regla que la binaria», pero esa regla no existe.

10. **Forma del objetivo:**
    - sesgo de 0,90–1,01 en `consumo` y `precio` (log-normal por diseño), y alrededor de 0 en los
      sintéticos y en `edad`;
    - fuera de 3·IQR: como máximo 0,3 %;
    - |z robusto| > 3,5: como máximo 1,3 %;
    - ningún objetivo tiene ceros, así que MAPE se puede calcular en todos.
11. **Modelo de costos:**
    - por modelo, error ≤ 9 % en los sintéticos, salvo `knn` (24 %);
    - **sobre la liga entera, −3 % a +4 % desde 2.000 filas** y +6 a +28 % (sobreestima) a 200 filas,
      donde todo cabe igual;
    - el MLP individual se equivoca más en `consumo-5000` (2,5 s medidos frente a 0,9 s estimados:
      sus iteraciones dependen de la señal, no de la forma). La calibración del S5 lo absorbe en el
      total.

## Lo que el STOP decide (respuesta sugerida por la medición)

| #   | Pregunta                   | Respuesta sugerida                                                                                                                                                               | Por qué (medido)                                                                                                                                                                                            |
| --- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Métrica primaria           | **MAE**, en las unidades del objetivo. R², RMSE y MedAE se muestran, no deciden. MAPE solo si el objetivo no tiene ceros                                                         | Se lee en unidades («se equivoca ±33,5 kWh»). Es el scorer de la CV y es robusto a atípicos                                                                                                                 |
| 2   | Tolerancia de empate       | **1 % relativo al MAE del mejor baseline**                                                                                                                                       | Ningún veredicto cambia entre 1 y 5 %. Es equivalencia práctica, en paridad con los 0,01 de AUC de la binaria. Con ruido puro (`edad`), 1 % lee «empata», que es lo honesto                                 |
| 3a  | Umbral de fuga continua    | **0,98** en \|Spearman\| (numéricas) y en η² (categóricas, con **soporte mínimo de 5 filas por categoría**: las más raras se agrupan, como el `min_frequency` del preprocesador) | Legítima más fuerte: 0,839. Plantada: 1,000. η² legítimo máximo: 0,092                                                                                                                                      |
| 3b  | Avisos de EDA del objetivo | `target-skewed` si **\|sesgo\| ≥ 1** (Bulmer: «muy sesgado»). `target-outliers` si **≥ 1 % de filas fuera de 3·IQR** (Tukey: «lejanos»). Ambos solo informan                     | `precio` (1,01) avisa y `consumo` (0,90–0,97) no. Ningún dataset medido pasa del 0,3 % fuera de 3·IQR: el aviso queda para datos de verdad extremos                                                         |
| 4   | Baselines                  | **Mediana + lineal** (no media + lineal). La media se muestra como estadística del objetivo                                                                                      | Con MAE, la constante óptima es la mediana: su MAE fue ≤ el de la media en 9 de 9 (hasta −1,9 % con objetivo sesgado). Usar la media le daría al modelo un rival más débil. La lineal es baseline Y miembro |

**Decisiones técnicas que el spike fija (no son umbrales; viajan en el ADR 013):**

- **Roster y orden:** `linear` · `ridge` · `lasso` · `decision_tree` · `knn` · `hgb` · `lightgbm` ·
  `xgboost` · `extra_trees` · `forest` · `mlp`, del más simple al más caro, con `mlp` al final como en
  el S5.
- **Lasso** con α = 0,01 sobre el objetivo estandarizado.
- **MLP** con parada temprana sobre el objetivo estandarizado.
- **Bosques** con los valores por defecto de sklearn.
- **`MLP_MIN_ROWS` = 500** también en regresión.
- **Coeficientes de costo:** los del bloque JSON de abajo.

## Reproducir

```bash
pnpm build && pnpm start &   # build de producción
SPIKE_OUT=<dir> pnpm exec vitest run --config scripts/spike-regresion/vitest.spike.config.ts
SPIKE_PY=scripts/spike-regresion/spike.py SPIKE_OUT=<dir> node scripts/spike-liga/correr.mjs chromium   # y webkit
SPIKE_PY=scripts/spike-regresion/spike.py SPIKE_VARIANTS=1 SPIKE_OUT=<dir> node scripts/spike-liga/correr.mjs chromium
SPIKE_OUT=<dir> node scripts/spike-regresion/tabla.mjs > tablas.md
```

## Tablas completas (salida de `tabla.mjs`)

### chromium 153.0.8010.12 — carga del runtime en frío (localhost, 2026-10-04)

| Paquetes     | Runtime (ms) | Paquetes (ms) | Total (ms) |
| ------------ | -----------: | ------------: | ---------: |
| sin boosters |         1318 |          1834 |       3153 |
| con boosters |         1347 |          1542 |       2889 |

### chromium — la liga de regresión por dataset (11 modelos + 3 baselines; CV k=5 + fit + test de todos + explicabilidad del ganador)

| Dataset             | Filas | Train | Ancho tras one-hot | Corrida completa (s) | Σ CV k=5 de la liga (s) | Σ fit+test (s) | Explicabilidad (s) | Heap (MB) |
| ------------------- | ----: | ----: | -----------------: | -------------------: | ----------------------: | -------------: | -----------------: | --------: |
| consumo-200         |   200 |   150 |                 10 |                  3.4 |                     2.5 |            0.5 |         0.14 (mlp) |       224 |
| precio-fuga-200     |   200 |   150 |                 10 |                  2.9 |                     2.2 |            0.4 |      0.13 (linear) |       224 |
| precio-sin-fuga-200 |   200 |   150 |                  9 |                  2.9 |                     2.1 |            0.5 |    0.17 (lightgbm) |       224 |
| rotacion-edad-200   |   200 |   150 |                 10 |                  2.7 |                     2.1 |            0.4 |         0.14 (knn) |       224 |
| consumo-5000        |  5000 |  3750 |                 10 |                 19.1 |                    14.4 |            3.5 |         0.22 (mlp) |       387 |
| sintetico-2000      |  2000 |  1500 |                 33 |                 20.5 |                    15.4 |            3.9 |         0.70 (hgb) |       387 |
| ancho-2000          |  2000 |  1500 |                112 |                 64.9 |                    44.3 |           10.0 |    9.55 (lightgbm) |       387 |
| sintetico-5000      |  5000 |  3750 |                 33 |                 48.1 |                    35.6 |           10.0 |         1.60 (hgb) |       387 |
| sintetico-20000     | 20000 | 15000 |                 33 |                327.1 |                   177.2 |           50.2 |   16.28 (lightgbm) |       944 |

### chromium — costo por modelo: CV k=5 (s) · ⚠ = aviso de no-convergencia · ✗ = error

| Modelo        | consumo-200 | precio-fuga-200 | precio-sin-fuga-200 | rotacion-edad-200 | consumo-5000 | sintetico-2000 | ancho-2000 | sintetico-5000 |   sintetico-20000 |
| ------------- | ----------: | --------------: | ------------------: | ----------------: | -----------: | -------------: | ---------: | -------------: | ----------------: |
| linear        |        0.04 |            0.03 |                0.03 |              0.03 |         0.06 |           0.07 |       0.12 |           0.13 |   0.35 (k=3: 0.2) |
| ridge         |        0.04 |            0.03 |                0.04 |              0.03 |         0.06 |           0.07 |       0.15 |           0.14 |   0.43 (k=3: 0.2) |
| lasso         |        0.04 |            0.04 |                0.04 |              0.04 |         0.07 |           0.07 |       0.08 |           0.12 |   0.36 (k=3: 0.2) |
| decision_tree |        0.04 |            0.03 |                0.03 |              0.04 |         0.08 |           0.09 |       0.15 |           0.18 |   0.78 (k=3: 0.4) |
| knn           |        0.04 |            0.03 |                0.03 |              0.04 |         0.10 |           0.10 |       0.11 |           0.22 |   2.22 (k=3: 1.6) |
| hgb           |        0.13 |            0.11 |                0.11 |              0.12 |         0.56 |           0.86 |       1.54 |           1.33 |   2.54 (k=3: 1.5) |
| lightgbm      |        0.16 |            0.11 |                0.11 |              0.11 |         0.65 |           0.97 |       1.68 |           1.33 |   2.16 (k=3: 1.4) |
| xgboost       |        0.26 |            0.16 |                0.17 |              0.19 |         0.47 |           1.29 |       5.15 |           1.87 |   2.59 (k=3: 1.2) |
| extra_trees   |        0.64 |            0.58 |                0.54 |              0.56 |         4.44 |           5.07 |      16.27 |          12.46 | 54.36 (k=3: 29.1) |
| forest        |        0.79 |            0.75 |                0.72 |              0.75 |         5.37 |           5.61 |      14.61 |          14.55 | 94.26 (k=3: 35.2) |
| mlp           |        0.32 |            0.27 |                0.30 |              0.15 |         2.51 |           1.20 |       4.48 |           3.25 | 17.12 (k=3: 10.3) |

### webkit 26.6 — carga del runtime en frío (localhost, 2026-10-04)

| Paquetes     | Runtime (ms) | Paquetes (ms) | Total (ms) |
| ------------ | -----------: | ------------: | ---------: |
| sin boosters |         1722 |          1264 |       2986 |
| con boosters |         1096 |          1083 |       2179 |

### webkit — la liga de regresión por dataset (11 modelos + 3 baselines; CV k=5 + fit + test de todos + explicabilidad del ganador)

| Dataset             | Filas | Train | Ancho tras one-hot | Corrida completa (s) | Σ CV k=5 de la liga (s) | Σ fit+test (s) | Explicabilidad (s) | Heap (MB) |
| ------------------- | ----: | ----: | -----------------: | -------------------: | ----------------------: | -------------: | -----------------: | --------: |
| consumo-200         |   200 |   150 |                 10 |                  4.3 |                     3.2 |            0.7 |         0.14 (mlp) |       224 |
| precio-fuga-200     |   200 |   150 |                 10 |                  3.0 |                     2.2 |            0.5 |      0.16 (linear) |       224 |
| precio-sin-fuga-200 |   200 |   150 |                  9 |                  3.3 |                     2.3 |            0.5 |    0.24 (lightgbm) |       224 |
| rotacion-edad-200   |   200 |   150 |                 10 |                  2.4 |                     1.8 |            0.4 |         0.12 (knn) |       224 |
| consumo-5000        |  5000 |  3750 |                 10 |                 20.5 |                    16.0 |            3.6 |         0.16 (mlp) |       387 |
| sintetico-2000      |  2000 |  1500 |                 33 |                 21.3 |                    15.8 |            4.4 |         0.62 (hgb) |       387 |
| ancho-2000          |  2000 |  1500 |                112 |                 67.9 |                    40.5 |            9.2 |   17.12 (lightgbm) |       387 |
| sintetico-5000      |  5000 |  3750 |                 33 |                 41.3 |                    32.0 |            7.8 |         0.82 (hgb) |       387 |
| sintetico-20000     | 20000 | 15000 |                 33 |                337.0 |                   173.9 |           40.0 |   34.50 (lightgbm) |       944 |

### webkit — costo por modelo: CV k=5 (s) · ⚠ = aviso de no-convergencia · ✗ = error

| Modelo        | consumo-200 | precio-fuga-200 | precio-sin-fuga-200 | rotacion-edad-200 | consumo-5000 | sintetico-2000 | ancho-2000 | sintetico-5000 |   sintetico-20000 |
| ------------- | ----------: | --------------: | ------------------: | ----------------: | -----------: | -------------: | ---------: | -------------: | ----------------: |
| linear        |        0.04 |            0.03 |                0.04 |              0.03 |         0.06 |           0.06 |       0.14 |           0.08 |   0.29 (k=3: 0.2) |
| ridge         |        0.04 |            0.03 |                0.04 |              0.03 |         0.06 |           0.10 |       0.20 |           0.09 |   0.37 (k=3: 0.2) |
| lasso         |        0.04 |            0.04 |                0.04 |              0.03 |         0.07 |           0.06 |       0.09 |           0.08 |   0.40 (k=3: 0.2) |
| decision_tree |        0.04 |            0.03 |                0.04 |              0.03 |         0.09 |           0.07 |       0.20 |           0.14 |   1.07 (k=3: 0.4) |
| knn           |        0.04 |            0.03 |                0.04 |              0.03 |         0.13 |           0.09 |       0.14 |           0.15 |   2.58 (k=3: 2.6) |
| hgb           |        0.12 |            0.11 |                0.14 |              0.10 |         0.90 |           0.88 |       1.71 |           0.91 |   2.24 (k=3: 1.4) |
| lightgbm      |        0.23 |            0.20 |                0.26 |              0.18 |         1.75 |           1.78 |       4.19 |           1.98 |   4.15 (k=3: 3.7) |
| xgboost       |        0.26 |            0.15 |                0.19 |              0.16 |         0.42 |           0.92 |       4.06 |           1.33 |   2.80 (k=3: 1.3) |
| extra_trees   |        0.77 |            0.53 |                0.51 |              0.47 |         4.43 |           5.07 |      13.05 |          11.68 | 55.15 (k=3: 34.0) |
| forest        |        1.19 |            0.69 |                0.66 |              0.62 |         5.84 |           5.61 |      14.12 |          13.64 | 86.17 (k=3: 34.1) |
| mlp           |        0.49 |            0.34 |                0.34 |              0.14 |         2.26 |           1.19 |       2.61 |           1.97 |  18.64 (k=3: 8.9) |

### MAE por modelo: CV k=5 media (MAE de prueba entre paréntesis — «no sirve para elegir») · ★ mínimo de CV · ◆ elegido por la regla de 1 EE

| Modelo        |      consumo-200 | precio-fuga-200 | precio-sin-fuga-200 | rotacion-edad-200 |     consumo-5000 | sintetico-2000 |    ancho-2000 | sintetico-5000 | sintetico-20000 |
| ------------- | ---------------: | --------------: | ------------------: | ----------------: | ---------------: | -------------: | ------------: | -------------: | --------------: |
| linear        |    37.31 (43.77) |  ★◆ 0.00 (0.00) |     ◆ 25223 (25244) |   ◆ 10.43 (10.18) |    41.66 (39.75) |    6.32 (6.53) |   6.82 (6.43) |    6.47 (6.48) |     6.40 (6.43) |
| ridge         |    37.02 (43.14) |     1378 (1093) |       25138 (24864) |     10.42 (10.18) |    41.66 (39.74) |    6.32 (6.53) |   6.80 (6.42) |    6.47 (6.48) |     6.40 (6.43) |
| lasso         |    36.71 (41.08) | 672.66 (743.34) |       24923 (24994) |     10.41 (10.18) |    41.08 (39.13) |    6.25 (6.42) |   6.60 (6.25) |    6.46 (6.40) |     6.40 (6.43) |
| decision_tree |    51.14 (43.13) |     6557 (6620) |       34395 (28882) |     12.40 (12.61) |    31.98 (29.79) |    7.61 (7.45) |   8.53 (8.24) |    7.55 (7.37) |     6.86 (6.88) |
| knn           |    47.78 (40.18) |   20022 (18190) |       32129 (27192) |   ★ 10.39 (10.60) |    29.30 (28.35) |    6.97 (7.01) |   9.73 (9.28) |    6.80 (6.64) |     6.36 (6.37) |
| hgb           |    38.26 (30.19) |   11684 (14974) |       24875 (24031) |     10.76 (11.03) |    23.15 (21.99) | ★◆ 4.53 (4.22) | ◆ 5.26 (5.14) | ★◆ 4.09 (3.85) |   ◆ 3.56 (3.60) |
| lightgbm      |    37.71 (28.29) |   12752 (15621) |     ★ 23995 (23925) |     11.14 (11.40) |    23.67 (22.48) |    4.60 (4.28) | ★ 5.26 (5.12) |    4.14 (3.87) |   ★ 3.56 (3.58) |
| xgboost       |    41.58 (32.92) |     3230 (4139) |       27528 (25317) |     11.62 (11.61) |    24.20 (23.27) |    4.84 (4.55) |   5.78 (5.27) |    4.33 (4.05) |     3.61 (3.63) |
| extra_trees   |    35.02 (33.50) |     2446 (3365) |       26265 (23860) |     11.40 (11.01) |    24.44 (23.23) |    6.33 (6.55) |   6.74 (6.15) |    6.34 (6.18) |     5.71 (5.75) |
| forest        |    40.48 (32.59) |     2610 (3536) |       26534 (24811) |     10.99 (11.04) |    25.39 (24.12) |    6.03 (6.20) |   6.69 (6.26) |    5.90 (5.75) |     5.36 (5.35) |
| mlp           | ★◆ 32.42 (29.19) |   11516 (10741) |       26357 (21145) |     10.43 (10.46) | ★◆ 22.16 (21.80) |    5.72 (5.87) |   7.24 (6.81) |    5.75 (5.43) |     4.13 (4.12) |

### Regla de un error estándar con MAE (menor es mejor)

| Dataset             | Mínimo de CV |   MAE CV | EE (σ/√5) |  EE / MAE | Elegido por 1 EE | MAE CV del elegido | Diferencia CV | MAE de prueba: mínimo → elegido |
| ------------------- | ------------ | -------: | --------: | --------: | ---------------- | -----------------: | ------------: | ------------------------------- |
| consumo-200         | mlp          |    32.42 |      1.77 |     5.5 % | mlp              |              32.42 |         0.0 % | 29.19 → 29.19                   |
| precio-fuga-200     | linear       |     0.00 |      0.00 | — (MAE 0) | linear           |               0.00 |     — (MAE 0) | 0.00 → 0.00                     |
| precio-sin-fuga-200 | lightgbm     | 23994.73 |   1308.48 |     5.5 % | linear           |           25222.90 |         5.1 % | 23925.42 → 25244.42             |
| rotacion-edad-200   | knn          |    10.39 |      0.58 |     5.6 % | linear           |              10.43 |         0.3 % | 10.60 → 10.18                   |
| consumo-5000        | mlp          |    22.16 |      0.22 |     1.0 % | mlp              |              22.16 |         0.0 % | 21.80 → 21.80                   |
| sintetico-2000      | hgb          |     4.53 |      0.08 |     1.8 % | hgb              |               4.53 |         0.0 % | 4.22 → 4.22                     |
| ancho-2000          | lightgbm     |     5.26 |      0.07 |     1.3 % | hgb              |               5.26 |         0.1 % | 5.12 → 5.14                     |
| sintetico-5000      | hgb          |     4.09 |      0.03 |     0.8 % | hgb              |               4.09 |         0.0 % | 3.85 → 3.85                     |
| sintetico-20000     | lightgbm     |     3.56 |      0.02 |     0.6 % | hgb              |               3.56 |         0.1 % | 3.58 → 3.60                     |

### Baselines en prueba (MAE; R² entre paréntesis) y la pregunta media frente a mediana

| Dataset             |             Media |           Mediana |           Lineal | Mediana vs media | Elegido (1 EE)    | R² del elegido |
| ------------------- | ----------------: | ----------------: | ---------------: | ---------------: | ----------------- | -------------: |
| consumo-200         |    81.05 (-0.023) |    80.88 (-0.003) |    43.77 (0.730) |           -0.2 % | mlp · 29.19       |          0.877 |
| precio-fuga-200     | 74334.48 (-0.005) | 72918.00 (-0.085) |     0.00 (1.000) |           -1.9 % | linear · 0.00     |          1.000 |
| precio-sin-fuga-200 | 74334.48 (-0.005) | 72918.00 (-0.085) | 25244.42 (0.840) |           -1.9 % | linear · 25244.42 |          0.840 |
| rotacion-edad-200   |     10.16 (0.000) |    10.08 (-0.007) |   10.18 (-0.031) |           -0.8 % | linear · 10.18    |         -0.031 |
| consumo-5000        |    97.38 (-0.000) |    96.47 (-0.005) |    39.75 (0.801) |           -0.9 % | mlp · 21.80       |          0.952 |
| sintetico-2000      |    12.15 (-0.000) |    12.14 (-0.002) |     6.53 (0.700) |           -0.1 % | hgb · 4.22        |          0.853 |
| ancho-2000          |     11.97 (0.000) |    11.96 (-0.000) |     6.43 (0.680) |           -0.1 % | hgb · 5.14        |          0.783 |
| sintetico-5000      |     12.08 (0.000) |    12.08 (-0.000) |     6.48 (0.710) |           -0.0 % | hgb · 3.85        |          0.883 |
| sintetico-20000     |    12.24 (-0.000) |     12.24 (0.000) |     6.43 (0.722) |            0.0 % | hgb · 3.60        |          0.897 |

### Sensibilidad del veredicto a la tolerancia relativa (elegido por 1 EE contra el mejor baseline, MAE de prueba)

| Dataset             | Mejora relativa vs media+lineal | tol 1 % | tol 2 % | tol 5 % | Mejora relativa vs mediana+lineal | ¿cambia el veredicto (1 %)? |
| ------------------- | ------------------------------: | ------- | ------- | ------- | --------------------------------: | --------------------------- |
| consumo-200         |                          33.3 % | supera  | supera  | supera  |                            33.3 % | no                          |
| precio-fuga-200     |                       — (MAE 0) | empata  | empata  | empata  |                         — (MAE 0) | no                          |
| precio-sin-fuga-200 |                           0.0 % | empata  | empata  | empata  |                             0.0 % | no                          |
| rotacion-edad-200   |                          -0.1 % | empata  | empata  | empata  |                            -1.0 % | no                          |
| consumo-5000        |                          45.2 % | supera  | supera  | supera  |                            45.2 % | no                          |
| sintetico-2000      |                          35.4 % | supera  | supera  | supera  |                            35.4 % | no                          |
| ancho-2000          |                          20.1 % | supera  | supera  | supera  |                            20.1 % | no                          |
| sintetico-5000      |                          40.6 % | supera  | supera  | supera  |                            40.6 % | no                          |
| sintetico-20000     |                          44.0 % | supera  | supera  | supera  |                            44.0 % | no                          |

### MLP con parada temprana y objetivo estandarizado: convergencia

| Dataset             | Iteraciones (máx. 500) | Aviso de no-convergencia |   MAE CV | MAE CV del mínimo |
| ------------------- | ---------------------: | ------------------------ | -------: | ----------------: |
| consumo-200         |                    147 | no                       |    32.42 |             32.42 |
| precio-fuga-200     |                    136 | no                       | 11516.21 |              0.00 |
| precio-sin-fuga-200 |                    352 | no                       | 26357.46 |          23994.73 |
| rotacion-edad-200   |                     26 | no                       |    10.43 |             10.39 |
| consumo-5000        |                    108 | no                       |    22.16 |             22.16 |
| sintetico-2000      |                     93 | no                       |     5.72 |              4.53 |
| ancho-2000          |                     38 | no                       |     7.24 |              5.26 |
| sintetico-5000      |                     50 | no                       |     5.75 |              4.09 |
| sintetico-20000     |                     72 | no                       |     4.13 |              3.56 |

### Variantes (evidencia de por qué Lasso y MLP estandarizan el objetivo)

| Variante          |                consumo-200 |            precio-fuga-200 |           precio-sin-fuga-200 |         rotacion-edad-200 |               consumo-5000 |           sintetico-2000 |              ancho-2000 |            sintetico-5000 |         sintetico-20000 |
| ----------------- | -------------------------: | -------------------------: | ----------------------------: | ------------------------: | -------------------------: | -----------------------: | ----------------------: | ------------------------: | ----------------------: |
| lasso_sin_escalar |    37.30 · 245 it · 0.05 s |     18.43 · 55 it · 0.04 s | 25222.90 ⚠ · 5000 it · 0.09 s |     10.42 · 7 it · 0.04 s |    41.66 · 213 it · 0.15 s |    6.31 · 31 it · 0.13 s |   6.73 · 22 it · 0.13 s |     6.46 · 30 it · 0.10 s |   6.40 · 29 it · 0.32 s |
| mlp_sin_escalar   | 290.84 ⚠ · 500 it · 0.95 s | 179727.23 · 12 it · 0.06 s |    179728.12 · 12 it · 0.06 s | 10.50 ⚠ · 434 it · 0.88 s | 30.95 ⚠ · 500 it · 10.41 s | 6.10 ⚠ · 483 it · 5.89 s | 6.73 · 341 it · 11.02 s |   5.71 · 485 it · 10.24 s | 4.01 · 291 it · 55.20 s |
| mlp_sin_parada    |    29.15 · 230 it · 0.32 s | 11484.57 · 134 it · 0.20 s |    23137.69 · 215 it · 0.28 s | 11.29 ⚠ · 300 it · 0.40 s |     22.06 · 86 it · 2.89 s | 6.23 ⚠ · 300 it · 6.09 s |  7.46 · 154 it · 8.96 s | 5.23 ⚠ · 300 it · 15.44 s | 4.09 · 148 it · 36.35 s |
| lasso (roster)    |      36.71 · 7 it · 0.04 s |    672.66 · 20 it · 0.04 s |     24922.82 · 12 it · 0.04 s |     10.41 · 6 it · 0.04 s |      41.08 · 8 it · 0.07 s |     6.25 · 7 it · 0.07 s |    6.60 · 4 it · 0.08 s |      6.46 · 7 it · 0.12 s |    6.40 · 7 it · 0.36 s |
| mlp (roster)      |    32.42 · 147 it · 0.32 s | 11516.21 · 136 it · 0.27 s |    26357.46 · 352 it · 0.30 s |    10.43 · 26 it · 0.15 s |    22.16 · 108 it · 2.51 s |    5.72 · 93 it · 1.20 s |   7.24 · 38 it · 4.48 s |     5.75 · 50 it · 3.25 s |  4.13 · 72 it · 17.12 s |

### Fuga continua: |Spearman| (numéricas) y η² (categóricas) de cada columna con el objetivo, en train

| Dataset | Columna | Tipo | Distintos | |Spearman| | η² | η² (soporte ≥ 5) | ¿Plantada? |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| consumo-200 | ocupantes | num | 6 | 0.677 | — | — | |
| consumo-200 | superficie_m2 | num | 92 | 0.385 | — | — | |
| consumo-200 | temp_media_c | num | 111 | 0.263 | — | — | |
| consumo-200 | anio_construccion | num | 57 | 0.078 | — | — | |
| consumo-200 | calefaccion | cat | 3 | — | 0.042 | 0.042 | |
| consumo-200 | aislamiento | cat | 3 | — | 0.016 | 0.016 | |
| precio-fuga-200 | impuesto_transferencia_usd | num | 148 | 1.000 | — | — | **sí** |
| precio-fuga-200 | superficie_m2 | num | 96 | 0.839 | — | — | |
| precio-fuga-200 | habitaciones | num | 6 | 0.774 | — | — | |
| precio-fuga-200 | antiguedad_anios | num | 56 | 0.145 | — | — | |
| precio-fuga-200 | barrio | cat | 4 | — | 0.091 | 0.091 | |
| precio-fuga-200 | estacionamiento | cat | 2 | — | 0.001 | 0.001 | |
| precio-sin-fuga-200 | superficie_m2 | num | 96 | 0.839 | — | — | |
| precio-sin-fuga-200 | habitaciones | num | 6 | 0.774 | — | — | |
| precio-sin-fuga-200 | antiguedad_anios | num | 56 | 0.145 | — | — | |
| precio-sin-fuga-200 | barrio | cat | 4 | — | 0.091 | 0.091 | |
| precio-sin-fuga-200 | estacionamiento | cat | 2 | — | 0.001 | 0.001 | |
| rotacion-edad-200 | horas_mensuales | num | 80 | 0.085 | — | — | |
| rotacion-edad-200 | antiguedad_anios | num | 91 | 0.042 | — | — | |
| rotacion-edad-200 | satisfaccion | num | 77 | 0.035 | — | — | |
| rotacion-edad-200 | departamento | cat | 4 | — | 0.018 | 0.018 | |
| rotacion-edad-200 | renuncio | num | 2 | 0.002 | — | — | |
| rotacion-edad-200 | horas_extra | cat | 2 | — | 0.001 | 0.001 | |
| consumo-5000 | ocupantes | num | 6 | 0.673 | — | — | |
| consumo-5000 | superficie_m2 | num | 181 | 0.478 | — | — | |
| consumo-5000 | temp_media_c | num | 221 | 0.263 | — | — | |
| consumo-5000 | calefaccion | cat | 3 | — | 0.092 | 0.092 | |
| consumo-5000 | aislamiento | cat | 3 | — | 0.015 | 0.015 | |
| consumo-5000 | anio_construccion | num | 63 | 0.008 | — | — | |
| sintetico-2000 | x1 | num | 1217 | 0.694 | — | — | |
| sintetico-2000 | x2 | num | 1206 | 0.439 | — | — | |
| ancho-2000 | x1 | num | 1202 | 0.720 | — | — | |
| ancho-2000 | x2 | num | 1206 | 0.437 | — | — | |
| sintetico-5000 | x1 | num | 2335 | 0.674 | — | — | |
| sintetico-5000 | x2 | num | 2352 | 0.420 | — | — | |
| sintetico-20000 | x1 | num | 3866 | 0.686 | — | — | |
| sintetico-20000 | x2 | num | 3872 | 0.440 | — | — | |

**Columnas legítimas:** |Spearman| en 72 numéricas → mediana 0.036 · p95 0.720 · máximo 0.839 (precio-fuga-200·superficie_m2). η² en 22 categóricas → máximo 0.092 (consumo-5000·calefaccion; con soporte ≥ 5: 0.092).
**Plantada:** precio-fuga-200·impuesto_transferencia_usd → |Spearman| 1.0000.

### Forma del objetivo en train (para los avisos de EDA)

| Dataset | Media | Mediana | Desv. | Sesgo | Fuera de 1,5·IQR | Fuera de 3·IQR | |z robusto| > 3,5 | Ceros |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| consumo-200 | 374.7 | 365.4 | 114.2 | 0.90 | 3.3 % | 0.0 % | 1.3 % | 0 |
| precio-fuga-200 | 179728.0 | 158900.0 | 84168.5 | 1.01 | 1.3 % | 0.0 % | 1.3 % | 0 |
| precio-sin-fuga-200 | 179728.0 | 158900.0 | 84168.5 | 1.01 | 1.3 % | 0.0 % | 1.3 % | 0 |
| rotacion-edad-200 | 41.5 | 40.5 | 11.4 | 0.01 | 0.0 % | 0.0 % | 0.0 % | 0 |
| consumo-5000 | 366.9 | 355.1 | 127.3 | 0.97 | 2.7 % | 0.3 % | 1.3 % | 0 |
| sintetico-2000 | 50.7 | 51.0 | 15.1 | -0.05 | 0.0 % | 0.0 % | 0.0 % | 0 |
| ancho-2000 | 49.6 | 49.3 | 14.8 | 0.03 | 0.1 % | 0.0 % | 0.0 % | 0 |
| sintetico-5000 | 50.6 | 50.5 | 15.0 | 0.00 | 0.1 % | 0.0 % | 0.0 % | 0 |
| sintetico-20000 | 50.9 | 50.9 | 15.2 | -0.01 | 0.2 % | 0.0 % | 0.0 % | 0 |

### Modelo de costos propuesto (regresión): t_cv5 ≈ t0 + a · (n_train/1000)^b · (ancho/33)^c

| Modelo        | t0 (s) |  a (s) | b (filas) | c (ancho) | error máx. en los sintéticos | consumo-5000: medido → estimado (s) |
| ------------- | -----: | -----: | --------: | --------: | ---------------------------: | ----------------------------------- |
| linear        |  0.033 | 0.0298 |      0.88 |      0.56 |                          1 % | 0.06 → 0.08                         |
| ridge         |  0.033 | 0.0264 |      1.00 |      0.92 |                          2 % | 0.06 → 0.07                         |
| lasso         |  0.036 | 0.0232 |      0.97 |      0.15 |                          2 % | 0.07 → 0.11                         |
| decision_tree |  0.033 | 0.0366 |      1.11 |      0.55 |                          4 % | 0.08 → 0.12                         |
| knn           |  0.033 | 0.0309 |      1.54 |      0.09 |                         24 % | 0.10 → 0.24                         |
| hgb           |  0.107 | 0.6148 |      0.51 |      0.53 |                          1 % | 0.56 → 0.75                         |
| lightgbm      |  0.107 | 0.7469 |      0.37 |      0.49 |                          0 % | 0.65 → 0.79                         |
| xgboost       |  0.156 | 1.0420 |      0.32 |      1.21 |                          6 % | 0.47 → 0.53                         |
| extra_trees   |  0.539 | 2.9095 |      1.08 |      1.02 |                          1 % | 4.44 → 4.11                         |
| forest        |  0.718 | 2.7491 |      1.29 |      0.85 |                          9 % | 5.37 → 6.17                         |
| mlp           |  0.153 | 0.6372 |      1.21 |      1.16 |                          2 % | 2.51 → 0.94                         |

```json
{
  "linear": {
    "t0": 0.033,
    "a": 0.0298,
    "b": 0.879,
    "c": 0.557
  },
  "ridge": {
    "t0": 0.033,
    "a": 0.0264,
    "b": 1.004,
    "c": 0.92
  },
  "lasso": {
    "t0": 0.036,
    "a": 0.0232,
    "b": 0.966,
    "c": 0.149
  },
  "decision_tree": {
    "t0": 0.033,
    "a": 0.0366,
    "b": 1.108,
    "c": 0.546
  },
  "knn": {
    "t0": 0.033,
    "a": 0.0309,
    "b": 1.537,
    "c": 0.092
  },
  "hgb": {
    "t0": 0.107,
    "a": 0.6148,
    "b": 0.509,
    "c": 0.528
  },
  "lightgbm": {
    "t0": 0.107,
    "a": 0.7469,
    "b": 0.373,
    "c": 0.485
  },
  "xgboost": {
    "t0": 0.156,
    "a": 1.042,
    "b": 0.324,
    "c": 1.211
  },
  "extra_trees": {
    "t0": 0.539,
    "a": 2.9095,
    "b": 1.076,
    "c": 1.018
  },
  "forest": {
    "t0": 0.718,
    "a": 2.7491,
    "b": 1.289,
    "c": 0.854
  },
  "mlp": {
    "t0": 0.153,
    "a": 0.6372,
    "b": 1.21,
    "c": 1.158
  }
}
```

### Simulación: ¿quién entra al Nivel 1 según el techo? (costos medidos en chromium)

| Dataset             | Techo | Nivel 1 (modelos · s) | Queda para el Nivel 2                                 | Liga completa (s) |
| ------------------- | ----: | --------------------- | ----------------------------------------------------- | ----------------: |
| consumo-200         |   5 s | 11 · 3.0              | — (la liga completa cabe)                             |               3.0 |
| consumo-200         |  10 s | 11 · 3.0              | — (la liga completa cabe)                             |               3.0 |
| precio-fuga-200     |   5 s | 11 · 2.6              | — (la liga completa cabe)                             |               2.6 |
| precio-fuga-200     |  10 s | 11 · 2.6              | — (la liga completa cabe)                             |               2.6 |
| precio-sin-fuga-200 |   5 s | 11 · 2.6              | — (la liga completa cabe)                             |               2.6 |
| precio-sin-fuga-200 |  10 s | 11 · 2.6              | — (la liga completa cabe)                             |               2.6 |
| rotacion-edad-200   |   5 s | 11 · 2.5              | — (la liga completa cabe)                             |               2.5 |
| rotacion-edad-200   |  10 s | 11 · 2.5              | — (la liga completa cabe)                             |               2.5 |
| consumo-5000        |   5 s | 8 · 2.5               | extra_trees, forest, mlp                              |              17.9 |
| consumo-5000        |  10 s | 9 · 8.1               | forest, mlp                                           |              17.9 |
| sintetico-2000      |   5 s | 8 · 4.3               | extra_trees, forest, mlp                              |              19.3 |
| sintetico-2000      |  10 s | 9 · 5.9               | extra_trees, forest                                   |              19.3 |
| ancho-2000          |   5 s | 7 · 4.8               | xgboost, extra_trees, forest, mlp                     |              54.4 |
| ancho-2000          |  10 s | 8 · 9.8               | xgboost, extra_trees, forest                          |              54.4 |
| sintetico-5000      |   5 s | 7 · 4.2               | xgboost, extra_trees, forest, mlp                     |              45.6 |
| sintetico-5000      |  10 s | 8 · 6.5               | extra_trees, forest, mlp                              |              45.6 |
| sintetico-20000     |   5 s | 4 · 2.4               | knn, hgb, lightgbm, xgboost, extra_trees, forest, mlp |             227.4 |
| sintetico-20000     |  10 s | 6 · 8.6               | lightgbm, xgboost, extra_trees, forest, mlp           |             227.4 |
