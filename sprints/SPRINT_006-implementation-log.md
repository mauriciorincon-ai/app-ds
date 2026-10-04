# Sprint 006 — Bitácora de implementación («Estimar» · ciclo H2, sprint 2 de 3)

Branch: `sprint-006/estimar` · Orden: `portafolio/ds/ordenes/SPRINT_006-orden.md` · Plan:
`portafolio/ds/sprints/SPRINT_006.md`. El usuario aprobó el plan de ejecución el 2026-10-03
(plan mode) y dio el «construye» ese mismo día, con Opus 5.5 y el modelo ya fijado.

La app aprende la **segunda tarea: estimar una cantidad**. Hasta ahora, un objetivo numérico mostraba
«predicción de una cantidad: llega en una próxima versión». Al cerrar el sprint, ese objetivo entrena
la liga de regresión con la mecánica del S5:

- validación cruzada dentro de train;
- regla de un error estándar;
- la prueba se abre una sola vez;
- encarriladores por costo;
- honestidad que etiqueta.

El veredicto se lee en las unidades del objetivo. Cero IA nueva. **Condición dura: la liga binaria
no se rompe.**

## Desviación del plan

Quedaron registradas al aprobarse el plan (2026-10-03). La planeadora las lee aquí; no se escribe en
ella.

- **D1 · Numeración de ADRs.** El plan de la planeadora numeraba 012 y 013 para los dos ADRs de
  regresión. Pero la excepción de `braces` (kit v1.34.0) también necesita su ADR, y ese ocupa el 012.
  Quedan así: **012** = excepción de `braces` · **013** = regresión como segunda tarea · **014** =
  manifiesto por tarea.
- **D2 · «Ambigua → clases» en el S6.** La aceptación 3 dice que «las dos respuestas llevan a
  entrenar la tarea correcta», pero multiclase llega en el S7.
  - «Cantidad» entrena la regresión.
  - «Clases» lleva a la tarjeta de multiclase, que dice con franqueza que esa tarea llega en una
    próxima versión.

  Las dos respuestas enrutan a su tarea correcta; hoy solo entrena una.

- **D3 · El PR del sprint se mergeó al empezar la Fase 0 (2026-10-04, 05:20 UTC).** El usuario
  mergeó el #14 de dependabot y, 38 s después, el #16 (el PR del sprint).
  - El #16 entró como merge commit `6bf5e08`, no con squash. Llevaba el delta del kit v1.35.0, las
    categorías de Lighthouse con el arreglo de los inputs y el pin de Pyodide.
  - Su última CI (`5942408`) había terminado antes del merge con los cuatro jobs en `success`:
    `quality` · `integration` · `lighthouse` · `e2e`. A `main` no entró nada rojo.
  - **Consecuencia:** el sprint sigue en la misma rama `sprint-006/estimar`, con el PR de
    continuación **#17** (borrador). El summary va en el #17, que es el que se mergea con squash al
    cierre.
  - No se reescribe `main`, por la regla de jamás hacer push directo a `main`.
- **D4 · Habilitar la regresión en la UI pasa a la F2 (Fase 1, 2026-10-04).** El plan ponía el
  cambio de `TRAINABLE_TASKS` en la F1. Queda así:
  - En la F1 el **motor** entrena regresión de punta a punta: Python, contrato, `prepareRun` y
    manifiesto, probado por unit y por la integración con Pyodide real.
  - La **UI** sigue ofreciendo solo binaria hasta la F2, donde la habilita junto con sus pantallas.
    Así la preview de la F1 nunca muestra un resultado de regresión en una pantalla binaria.
  - **Regla nueva y permanente:** `validateModelFile` solo acepta archivos de tareas que la UI sabe
    usar (`TRAINABLE_TASKS`). Un archivo íntegro de otra tarea se rechaza nombrándola
    (`unsupported-task`). Hoy rechaza los de regresión; el día del S7, uno multiclase abierto en una
    versión vieja.
- **D5 · Las fichas de `linear` y `lasso` llegan en la F1.** `FICHAS` está tipado sobre todos los
  miembros, así que sumar los ids obliga a escribirlas. Se redactaron en ES y EN en el mismo paso.
  El párrafo de regresión de las fichas compartidas y la ficha de la mediana siguen en la F2.
- **D6 · El soporte mínimo de η² es una regla nueva, no «la misma que la binaria».** El plan
  decía que la fuga continua usaría la regla de soporte mínimo de la binaria, pero esa regla no
  existe (`categoryPurity` no tiene soporte). Se agregó `ETA_MIN_SUPPORT = 5`: las categorías con
  menos filas se agrupan, igual que el `min_frequency` del preprocesador. El usuario lo aprobó en el
  STOP de la F0 con los umbrales.

- **D7 · El brochure y su export entran en el S6 (Fase 2, 2026-10-04).** El plan no los listaba
  entre los documentos de la F2. Pero la regla 12 de la constitución dice que todo sprint que cambie
  features ajusta el brochure y su export en el mismo PR, y el brochure afirmaba «Ni tres, ni un
  número continuo, todavía» y el export, «exactamente dos categorías».
  - Se siguió el criterio del S5: cambios de texto y de conteo, sin tocar el storyboard ni las
    escenas.
  - Suman dos funcionalidades (33 → 35), con su tabla de mapeo en el summary.

## Fase 0 — delta del kit + deuda del S5 + spike de regresores

### Delta del kit v1.33.0 → v1.35.0 (por nombre)

| Ítem del kit                                         | Qué se hizo                                                                                                                                                                                                                                                                                                                                                                                                                        | Rojo demostrado (siempre con `scripts/demo-rojo.sh`)                                                                                                                                                            |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1.34.0 · excepción de auditoría con ADR             | `braces` sigue **sin parche** (`first_patched_version: null`; 3.0.3 es la última en npm; verificado el 2026-10-03). Se escribió el **ADR 012**: id, razón, fecha y condición de retiro. El comentario de `pnpm-workspace.yaml` ahora apunta al ADR. **Gate nuevo** (no estaba en el plan, se suma): `tests/unit/audit-exceptions.test.ts` falla si un id de `ignoreGhsas` no tiene un ADR que lo nombre con su condición de retiro | Mutación en `pnpm-workspace.yaml`: `GHSA-vfj7-8cjw-p6xm` → `GHSA-2222-3333-4444`. Resultado: «advisories ignoradas sin ADR: GHSA-2222-3333-4444», 1 de 2 en rojo. Al restaurar, 2 de 2 en verde                 |
| v1.35.0 · `scripts/demo-rojo.sh`                     | Estampado en 100755. `.demo-rojo/` agregado a `.gitignore`                                                                                                                                                                                                                                                                                                                                                                         | Su propia demo: una mutación en un comentario de `verificar-dependencias.mjs`, que el gate no ve. Resultado: «✗ EL GATE PASÓ CON LA MUTACIÓN — no es una demo en rojo», exit 1. Restaurado (0 rastros)          |
| v1.35.0 · `verificar-dependencias.mjs` falla cerrado | Reemplazado por el del kit. Antes solo fallaba cerrado en CI; en local, una base ilegible «se omitía» en verde                                                                                                                                                                                                                                                                                                                     | Mutación del default `origin/main` → `origin/rama-que-no-existe`. Resultado: «✗ no puedo leer la rama base…», exit 1. Al restaurar: «675 paquetes, ninguno por debajo de origin/main»                           |
| v1.35.0 · PreToolUse de gitleaks avisa               | `.claude/settings.json` del kit. Test nuevo en `tests/integration/gitleaks-hook.test.ts`: con un PATH sin gitleaks (`/usr/bin:/bin`), el hook sale con 0 y escribe «AVISO kit B-8» en stderr                                                                                                                                                                                                                                       | Mutación: quitar el bloque del aviso (el hook de v1.32.1). Resultado: «expected '' to match /AVISO kit B-8/». Al restaurar, 8 de 8                                                                              |
| v1.35.0 · comandos                                   | Re-estampados `audita-sprint.md` (copy por la casilla 4, orden de pago, casilla 7) y `deploy-check.md` (§9 repara el homepage). `README.md` de comandos nuevo, con `/release-check` marcado «no se estampa: perfil WEB». Cabecera de `dependabot.yml` al día                                                                                                                                                                       | Son comandos, no gates                                                                                                                                                                                          |
| Deuda del S5 · `lighthouse-categorias.json`          | Estampado. Segundo paso del job `lighthouse`: `lhci assert --config=./lighthouse-categorias.json --aggregationMethod=median-run` sobre la misma colección. El job no cambia de nombre                                                                                                                                                                                                                                              | Mutación: `categories:accessibility` con `minScore` 0.9 → 1.01. Resultado: «categories.accessibility failure for minScore assertion · expected ≥1.01 · found 1», exit 1. Al restaurar: «All results processed!» |

### Lighthouse por categorías: la primera medición pagó un defecto real

Build de producción, `lhci collect` × 3 sobre `/`:

| Momento          | Rendimiento        | Accesibilidad | Buenas prácticas | SEO | LCP (3 corridas)         |
| ---------------- | ------------------ | ------------- | ---------------- | --- | ------------------------ |
| Antes del pago   | 0,99 · 0,99 · 0,94 | **0,95**      | 1                | 1   | 1.582 · 1.594 · 2.841 ms |
| Después del pago | 0,97 × 3           | **1**         | 1                | 1   | 2.638 · 2.617 · 2.651 ms |

Las cuatro categorías ya pasaban 0,9, pero la auditoría `label` de accesibilidad estaba en 0.

**El defecto:** había tres `<input type="file" class="sr-only">` sin nombre accesible: dos en
`StartScreen` y uno en `ScoreScreen`. Se podían alcanzar con Tab, así que eran una parada «muda» del
teclado, duplicada con el botón visible.

**El pago:** `tabIndex={-1}` + `aria-hidden` en los tres. El control real es el botón visible; el
input queda solo como mecanismo del navegador. Los e2e usan `setInputFiles` con selector de
atributo, así que no cambian.

**Por qué se escapó:** ningún e2e pasaba axe por **Inicio vacío**. El primer escaneo de cada spec
ocurre después de cargar datos.

**Gate nuevo:** `happy-path.spec.ts` › «Inicio vacío pasa axe en ambos temas».

- **Rojo** (`demo-rojo.sh --puerto 3000`): se quitó `tabIndex={-1}` + `aria-hidden` del input CSV
  de `StartScreen`. Resultado: violación **`label`**, 1 en rojo (desktop-chromium). Al restaurar, 1
  en verde.
- **Hallazgo al nacer:** en tema oscuro, axe informaba `color-contrast` sobre `text-ink-muted` dentro
  de los contenedores con `transition-colors`. Era **transitorio**: axe medía a mitad del fundido de
  150 ms que dispara el cambio de tema, con el texto del tema nuevo sobre el fondo del viejo.
  `axeBothThemes` (`tests/e2e/axe-temas.ts`) ahora espera a que `document.getAnimations()` no tenga
  nada corriendo antes de medir. Con eso, 2 de 2 en verde, en móvil y en escritorio.

### Dependabot #15: Pyodide se retiene (decisión del usuario, 2026-10-04)

El lote `todo-npm` (#15: react 19.2.4 → 19.3.0, react-dom igual, **pyodide 314.0.2 → 314.0.7**)
quedó en rojo en `integration`:

> «RUNTIME_VERSIONS (TS) coincide con el runtime real — expected '314.0.7' to be '314.0.2'»

Es el gate funcionando.

- El build copia Pyodide desde `node_modules`, así que el navegador habría corrido 314.0.7.
- Cada modelo exportado habría seguido declarando 314.0.2.
- Esa versión gobierna el aviso de versiones al importar. Por eso el S4 la fijó con pin exacto: se
  mueve por decisión.

El usuario eligió **retener Pyodide** (opción recomendada):

- El #15 se cerró con un comentario que explica el motivo.
- `.github/dependabot.yml` ahora ignora `pyodide` en todos los tipos de actualización (toma efecto
  cuando este PR llegue a `main`). React 19.3 vuelve sola en el próximo lote.
- Pyodide se sube a propósito en el cierre del ciclo H2, con el runtime re-medido.
- El #14 (GitHub Actions) estaba en verde, 6 de 6: lo mergea el usuario.

**Gate nuevo:** `tests/unit/runtime-pin.test.ts` corre en `quality` y no necesita runtime. Vigila tres
cosas: pin exacto en `package.json` · `RUNTIME_VERSIONS.pyodide` igual al pin · `ignore` de Pyodide
en dependabot. Dos rojos, ambos con `demo-rojo.sh`:

| Mutación                                                      | Qué dijo el fallo                                                                                   |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `package.json`: `"pyodide": "314.0.2"` → `"314.0.7"` (el #15) | «package.json pide pyodide 314.0.7 pero los modelos exportados declararían 314.0.2», 1 de 3 en rojo |
| `dependabot.yml`: quitar `- dependency-name: "pyodide"`       | «falta el ignore de pyodide en .github/dependabot.yml», 1 de 3 en rojo                              |

En los dos casos, al restaurar volvió a 3 de 3 en verde. Antes, este cruce solo lo atrapaba
`integration`, con Pyodide real y minutos después.

### Datasets de regresión (P9)

Los genera `scripts/make-example-datasets.mjs`, con semilla. Los cuatro datasets heredados salieron
**idénticos**: el generador sigue siendo determinista.

| Archivo                       | Filas | Objetivo      | Dónde                                      | Qué demuestra                                                                                                     |
| ----------------------------- | ----: | ------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `consumo-energia.csv`         |   200 | `consumo_kwh` | `public/datasets/` + kit                   | Señal con interacción calefacción × frío × aislamiento. `ocupantes` (1 a 6) es la columna ambigua de M2           |
| `consumo-energia-mediano.csv` | 5.000 | `consumo_kwh` | **solo kit**, igual que `liga-mediana.csv` | Nivel 2 de regresión. Con el techo de 5 s entran 8 de 11; el Nivel 2 cambia el ganador                            |
| `precio-fuga-plantada.csv`    |   200 | `precio_usd`  | `public/datasets/` + kit                   | Precio log-normal (sesgo 1,01). `impuesto_transferencia_usd` = 3 % del precio de venta: fuga con \|Spearman\| = 1 |

El botón de ejemplo en Inicio llega con la UI, en la F2. Hoy el objetivo numérico todavía muestra
«próxima versión». El README del kit de prueba está al día.

### Spike de regresores EN EL NAVEGADOR (informe completo en `sprints/SPRINT_006-spike-regresores.md`)

Arnés `scripts/spike-regresion/`, que reusa `scripts/spike-liga/correr.mjs` mediante `SPIKE_PY`.
Corrió en Chromium 153 y WebKit 26.6 sobre el build de producción, con 9 datasets.

- **La primera corrida de Chromium se descartó:** coincidió con corridas de vitest.
  `consumo-5000` dio 26,9 s, frente a 19,1 s con la máquina quieta. Se repitió y se registra
  (K-S6-3).
- **Un error del arnés, no del modelo:** `Ridge.n_iter_` es `None` con el solver por defecto, y el
  `np.max(None)` del arnés marcó `TypeError` en `ridge`. Se cortó la corrida, se corrigió y se
  repitió.

Lo que decide el STOP queda en el informe y en el resumen de la fase.

### CI de la Fase 0

| Push                                   | PR  | Checks                                                                                                                                                       |
| -------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `34c39d6` (delta del kit + Lighthouse) | #16 | `quality` · `integration` · `lighthouse` · `e2e` · Vercel en `success`. El paso de categorías de Lighthouse corrió por **primera vez**, con `success` propio |
| `5942408` (pin de Pyodide)             | #16 | los 4 jobs + Vercel en `success` (05:20:17); el usuario mergeó el #16 a las 05:20:39 (D3)                                                                    |
| `eda6230` (datasets + arnés)           | #17 | 6 de 6 en `success`: primera corrida del PR #17                                                                                                              |

## Fase 1 — motor y guardarraíles

### Umbrales fijados por el usuario en el STOP de la Fase 0 (2026-10-04)

El usuario respondió las cuatro preguntas eligiendo en cada una la respuesta sugerida por la
medición:

| #   | Pregunta             | Decisión                                                                                                                                          | Dónde vive                                                                                                                   |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | Métrica primaria     | **MAE** en unidades. R², RMSE y MedAE se muestran, no deciden. MAPE solo sin ceros                                                                | `METRIC_RULES.mae` · `SCORER.mae` · `METRIC_DIRECTION` (Python)                                                              |
| 2   | Tolerancia de empate | **1 % relativo** al MAE del mejor baseline                                                                                                        | `REGRESSION_TIE_TOLERANCE`                                                                                                   |
| 3   | Guardarraíles        | Fuga **0,98** en \|Spearman\| y η², con **soporte ≥ 5**. Aviso de sesgo con **\|sesgo\| ≥ 1**. Aviso de atípicos con **≥ 1 %** fuera de **3·IQR** | `CONTINUOUS_LEAKAGE_THRESHOLD` · `ETA_MIN_SUPPORT` · `TARGET_SKEW_THRESHOLD` · `TARGET_OUTLIER_SHARE` · `TARGET_OUTLIER_IQR` |
| 4   | Baselines            | **Mediana + lineal**                                                                                                                              | `REGRESSION_BASELINE_IDS` · `run_experiment` (Python)                                                                        |

### Qué se construyó

**Python (`pipeline.py`):**

- `task` obligatoria en el payload.
- `_REGRESSORS`, con 11 regresores e hiperparámetros del spike: Lasso y el MLP con el objetivo
  estandarizado. `_FACTORIES` sigue siendo el roster binario, y un test heredado lo parchea por
  nombre.
- `KFold` en regresión, con folds en MAE de signo invertido.
- `select_one_se` con dirección.
- Baselines mediana + lineal.
- Métricas MAE · RMSE · R² · MedAE · MAPE.
- Direcciones por Spearman.
- `pred_vs_real` (muestra determinista, tope 200) y residuos sobre TODO el test.
- `target_stats` de train, con los decimales del usuario.
- `score_new_data` numérico.
- `task` en el esquema exportado.
- `roster_ids(task)` y `metric_directions()` para la paridad.

**TypeScript:**

- `METRIC_RULES`: dirección + tolerancia en UN sitio. Gobierna `selectOneSe`, `pickBestBaseline` y
  `computeVerdict`; `Verdict<M>` es genérico por métrica.
- Un roster por tarea sobre un solo espacio de ids: `ALL_MEMBER_IDS` fija la prioridad global y cada
  roster es una subsecuencia suya.
- Costos de regresión medidos; E2 por tarea; `quantileSplit` (P4).
- `detectLeakageContinuous`: |Spearman| y η² con soporte.
- EDA por tarea, con el bloque de id-like compartido y `target-skewed` / `target-outliers`.
- `prepareRun` por tarea: `target-ambiguous` (D2), `assembleRegressionResult`,
  `applyRegressionMemberFit`, `inferUnit` (tabla cerrada de sufijos).
- Tipos discriminados por `task`.
- `contract.ts` con validadores por tarea y cruces propios: `target_stats` ordenado, largo de
  `pred_vs_real`, residuos ordenados, selección recalculada con la dirección.
- Manifiesto por tarea (P8), con `unsupported-task` (D4).
- `formatEstimates`.
- El cerrojo de la narración del lado del servidor, ahora con su test.

**Archivo del S5 real:** antes de tocar `pipeline.py`, el código del S5 emitió con su propio
serializador `tests/fixtures/modelos/modelo-s5.probeta.json` (5,5 KB, liga solo `logistic`) y sus
predicciones sobre `clientes-nuevos.csv`. El pipeline del S6 lo valida, lo restaura y puntúa
**exactamente igual**: predicciones, probabilidades y novedad.

### Cambios esperados en tests heredados (R1/R4/R18): solo forma, ninguna lógica

| Archivo                                                                                           | Cambio                                                                                                                                                    | Por qué                                               |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `tests/fixtures/contrato/*.json` (binarios)                                                       | Regenerados con `CONTRATO_ACTUALIZAR=1`: + `task` (payload, train, fit, score, schema del export), tiempos y bytes del pickle. **Ninguna métrica cambió** | P1/R18                                                |
| `tests/integration/runtime.ts` (`withLeague`)                                                     | + `task: "binaria"`                                                                                                                                       | La tarea es obligatoria; lo que H1 asumía era binaria |
| `tests/integration/scoring.test.ts`                                                               | El esquema exportado esperado + `task: "binaria"`; un tipo pasa a `BinaryScoreResult`                                                                     | P8 (aditivo)                                          |
| `tests/integration/liga.test.ts`                                                                  | `validateTrainResult(…, {...payload, task: "binaria"})` en un cruce                                                                                       | Estrechar el tipo de la unión                         |
| `tests/unit/{modelos,roster}.test.ts`                                                             | `MEMBER_IDS` → `ALL_MEMBER_IDS` en dos invariantes de fichas y nombres                                                                                    | Un solo espacio de ids (P2, R4)                       |
| `tests/unit/use-hooks.test.tsx`                                                                   | Los literales que emulan al worker + `task: "binaria"`                                                                                                    | Imitan al emisor actual                               |
| `tests/unit/{factories,experiment,components,ficha-level2,league-ui,modelcard,narration-payload}` | `ExperimentResult` → `BinaryResult` (solo anotaciones) y `task` en dos fábricas                                                                           | La unión discriminada                                 |

Todo lo demás de la liga binaria quedó verde **sin tocarse**: anti-fuga de la CV, selección sin
mirar el test, los 14 miembros, export/import con boosters y las 49 carnadas Python → TS.

### Carnadas: «detectó k de n»

| Dirección                                                  | Resultado                                                                                                                                                      |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TS → Python, `_validate_payload` (regresión, Pyodide real) | **8 de 8**: `task` (ausente · desconocida · tipo · en fit) · `roster` con `logistic` · `primary_metric` = `auc` · `cv_k` > n_train · `member` fuera del roster |
| Python → TS, liga de regresión                             | **30 de 30**                                                                                                                                                   |
| Python → TS, elección manual                               | **5 de 5**                                                                                                                                                     |
| Python → TS, export                                        | **4 de 4**                                                                                                                                                     |
| Python → TS, puntuación                                    | **4 de 4**                                                                                                                                                     |
| Manifiesto de regresión                                    | **12 de 12**                                                                                                                                                   |
| Binarias heredadas                                         | 27 + 6 + 5 + 6 + 5 = 49 de 49, y 16 de 16 del manifiesto: intactas                                                                                             |

### Gates nuevos, cada uno visto en ROJO (siempre con `scripts/demo-rojo.sh`)

| #   | Gate                                              | Mutación                                  | Qué dijo el fallo                                                    |
| --- | ------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------- |
| 1   | El lector recalcula la selección CON la dirección | `contract.ts`: dirección → `"higher"`     | El fixture real de regresión deja de validar, y las carnadas fallan  |
| 2   | Paridad de dirección TS ↔ Python                  | `pipeline.py`: `"mae": "higher"`          | `roster.test.ts`: METRIC_DIRECTION ≠ METRIC_RULES                    |
| 3   | Split por bandas                                  | `quantileSplit` estratifica por valor     | «expected [] to have a length of 50»: la prueba quedaba vacía (R2)   |
| 4   | Soporte mínimo de η²                              | `ETA_MIN_SUPPORT` = 1                     | «expected 1 to be less than 0.05»: un identificador «explicaba» todo |
| 5   | Tolerancia relativa del MAE                       | Tolerancia → absoluta                     | La regla cambia y el caso de `edad` pasa de «empata» a «NO supera»   |
| 6   | Un archivo del S5 importa                         | El manifiesto binario exige `task`        | El archivo REAL del S5 deja de validar                               |
| 7   | `unsupported-task`                                | Se apaga el chequeo de tarea usable       | Un archivo de regresión valida en una UI que no lo usa               |
| 8   | Anti-fuga de la CV de regresión (espía)           | CV sobre train + test                     | «expected true to be false»: un ajuste vio filas de test             |
| 9   | La selección no mira el test                      | CV sobre el test                          | Permutar el test cambió el ganador (`lasso` ≠ `linear`)              |
| 10  | `fit_member` reproduce su fila                    | `fit_member` con OTRA semilla que la liga | `extra_trees` con MAE distinto (33,29 frente a 33,50)                |
| 11  | Lector TS → Python: `task` obligatoria            | `task` ausente ⇒ binaria                  | «detectó 7 de 8»: la carnada `task` ausente no se detectó            |
| 12  | Cerrojo de la narración en el servidor (P7)       | El esquema acepta cualquier `problem`     | «expected 200 to be 400»: llegaba al proveedor                       |
| 13  | Aviso «objetivo muy sesgado» (\|sesgo\| ≥ 1)      | Umbral × 10 en la comparación             | `precio`: falta `target-skewed` en la lista de alertas               |
| 14  | Aviso «atípicos extremos» (≥ 1 % fuera de 3·IQR)  | Umbral × 10 en la comparación             | «atípicos simétricos»: falta `target-outliers`                       |

**La #14 no podía fallar hasta que existió su test.** Antes del cierre de la fase, ningún test hacía
disparar el aviso de atípicos: los datasets del kit no lo activan, y la prueba de `farOutShare`
cubría el cálculo, no la comparación. Se agregó un objetivo con atípicos simétricos (sesgo ≈ 0,
4 % lejos), así que el test nombra solo ese aviso.

**Dos demos no se pusieron rojas a la primera, y `demo-rojo.sh` las atrapó** (salió con 1):

- La #10 cambiaba la semilla en la fábrica, que comparten la liga y `fit_member`. Las dos
  coincidían igual, así que la mutación no podía romper nada; es la tercera pregunta del kit. Se
  rehízo con la mutación del S5 (K-S5-8).
- La #11 tenía un `-t` que no coincidía con el nombre del test, así que corrieron 0 tests y el gate
  «pasó» en vacío (K-S6-4).

## Fase 2 — UI, lectura y documentos

El usuario dio el «continúa» de la Fase 1 el 2026-10-04.

### Plan de miradas (aprobado con el plan; sin cambios de número, agrupación ni orden)

Una sola parada de **FORMA**, con dos filas. Las miradas de **TEXTO** (la línea «cuál mirar», la
FAQ de R² negativo) no paran: quedan «maquetadas, no vistas» y viajan al gate ⭐ del ciclo.

| #   | Archivo / lugar                                                                        | Botón / estado                                                     | Qué mirar                                                                                                                                                        | Respuesta esperada              | Registro                            |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------- |
| M1  | Preview del PR #17 → Inicio → «Consumo de energía» → objetivo `consumo_kwh` → Entrenar | Resultados: veredicto en unidades · tabla de la liga · gráfico     | ¿Se entiende cuánto se equivoca y contra qué se compara? ¿El gráfico se lee sin color?                                                                           | «lo abrí y apruebo» o el ajuste | **aprobada** 2026-10-04 (ver abajo) |
| M2  | Preview del PR #17 → Inicio → «Consumo de energía» → objetivo `ocupantes`              | La pregunta «¿categorías o una cantidad?», con la sugerida marcada | ¿Se entiende la pregunta y qué pasa con cada respuesta? (la sugerida es «Categorías»: la regla de E1 del S5 sugiere clases cuando todos los valores son enteros) | «lo abrí y apruebo» o el ajuste | **aprobada** 2026-10-04 (ver abajo) |

**Veredicto del usuario (2026-10-04), textual:** «M1 Esta grafica esta espectacular Estimado frente
a real, claro que es evidente cuánto se equivoca y contra qué se compara muy bien. M2 Muy bien se
entiende claramente y muy oportuno mensaje. ambos los abrí y apruebo». Es un «lo abrí y apruebo» con
comentario del artefacto (el gráfico y el mensaje de la pregunta). Pasan M1 y M2 sin ajustes; la
sugerida «Categorías» de la regla de E1 queda como está.

### Qué se construyó antes de la parada

- **Hook (`useExperiment`):** las dos tareas de punta a punta.
  - `TargetPlan` gana `choice`, `resolved` y `unit`.
  - `answerTask` responde la ambigua; un objetivo nuevo vuelve a preguntar.
  - La liga, la elección manual, el Nivel 2, puntuar, exportar e importar van por tarea, y el lector
    del contrato exige la forma de la tarea en cada costura.
  - El breadcrumb `probeta.league` lleva `task`: un nombre de la app, nunca un valor ni una columna.
- **Configuración:**
  - `TaskCard` dice «Vas a estimar una cantidad, en kWh», o franqueza si no hay unidad reconocible.
  - Con una ambigua, pregunta con dos botones con icono (regla y etiqueta). La sugerida va marcada con
    ★ + «Sugerida», y todo se maneja con teclado.
  - Una vez respondida, dice la respuesta y deja cambiarla.
- **Resultados de regresión:**
  - `RegressionVerdict`, en unidades. La lineal tiene su titular de empate solo cuando empata (R10).
  - Métricas MAE · RMSE · R² · MedAE con la línea «cuál mirar».
  - `PredichoVsReal.tsx`: SVG sin librería, con la diagonal, la franja ±MAE de bordes punteados, y
    disco dentro de la franja contra anillo fuera (forma, no solo color).
  - Los cuantiles del error sobre todo el test, en texto y en tabla.
  - Los baselines mediana y lineal con su ficha.
  - `VerdictCard` es compartida con la binaria; la lógica binaria no cambió.
- **La liga:** `LeagueTable` ordena según la dirección de la métrica, la banda del error estándar
  suma con el MAE, las cifras van en unidades y dice «menor es mejor». `Level2Card` acepta las dos
  tareas.
- **P7, cerrojo del cliente:** con un resultado de estimar, `useNarration` no arma payload y jamás
  llama al route. `WhySection` reemplaza el bloque de IA por una línea franca. La plantilla
  determinista de regresión (`buildRegressionTemplate`) sale de los mismos números.
- **Formato (R9):** `src/lib/quantity.ts` usa punto decimal y miles con coma, como el resto de la
  app, con 3 cifras significativas del valor más chico del grupo. Entre el número y la unidad va un
  espacio no separable: la primera pasada de capturas mostró «±33.5 / kWh» partido en dos líneas a
  360 px.
- **Adelantado de la lista «después de la mirada»** (no toca el plan de miradas):
  - `ScoreScreen` con `<objetivo>_estimado` (decimales del objetivo) y resumen mín · mediana · máx.
  - El resumen del import por tarea.
  - La ficha de la mediana; `memberNameKey` («Regresión Ridge» al estimar).
  - El botón de ejemplo «Consumo de energía».
  - La razón: sin ellos la preview se rompía o mentía. Una regresión importada decía «clase
    positiva: «»», y puntuar con un modelo de regresión no compilaba.
- **Sigue pendiente:** la model card de regresión (Resultados de regresión todavía no la muestra),
  los párrafos de regresión de las fichas compartidas, los documentos, `regresion-score.spec`,
  reduced-motion y las capturas.

### Cambios esperados en tests heredados (R19 y la habilitación)

| Archivo                                      | Cambio                                                                                                                           |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `tests/e2e/liga.spec.ts`                     | El caso «todavía no se entrena» pasa de `edad` (ahora estima una cantidad) a `departamento` (4 categorías → multiclase)          |
| `tests/unit/league-ui.test.tsx`              | El TaskCard de «otras tareas» usa varias categorías; se suman la cantidad con y sin unidad y la ambigua con pregunta y respuesta |
| `tests/unit/{tarea,regresion-motor}.test.ts` | `TRAINABLE_TASKS` = binaria + numérica                                                                                           |
| `tests/unit/model-file.test.ts`              | `unsupported-task` se prueba con la lista explícita `["binaria"]`; por defecto el archivo de regresión ya se acepta (D4)         |
| `tests/unit/observability.test.ts`           | El breadcrumb de la liga suma `task`, y es el único texto, de una lista cerrada                                                  |
| `tests/unit/modelos.test.ts`                 | Las fichas = bases + `majority` + `median`                                                                                       |

`scripts/capturas-s5.mjs` (no es gate de CI) sigue fotografiando `edad` como evidencia del S5; la
pasada del S6 será `capturas-s6.mjs`.

### Gates nuevos de la F2, cada uno visto en ROJO (`scripts/demo-rojo.sh`)

| #   | Gate                                                  | Mutación                                                     | Qué dijo el fallo                                                         |
| --- | ----------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| 15  | La lineal empata consigo misma SOLO si empata (R10)   | `verdict.level === "ties"` → `true`                          | «la lineal gana pero la mediana rinde mejor»: el «NO supera» quedó tapado |
| 16  | Cerrojo del cliente de la narración (P7)              | Sin `if (!payload) return` en el efecto                      | «sin ninguna petición» y «cerrojo del cliente»: el fetch se llamó         |
| 17  | El gráfico no comunica solo con color                 | Todo punto es disco                                          | «dentro = disco; fuera = anillo»: 0 anillos                               |
| 18  | La liga ordena según la dirección (menor es mejor)    | Orden invertido                                              | «ordena del menor MAE al mayor»                                           |
| 19  | Las estimaciones salen con los decimales del objetivo | 6 decimales fijos                                            | «columna nueva con los decimales del objetivo»                            |
| 20  | El lector exige la forma de la tarea al puntuar       | Se valida como binaria                                       | Se rechaza la puntuación de regresión, y se acepta la de forma binaria    |
| 21  | La respuesta de la ambigua llega a `prepareRun`       | `planTarget` sin `ambiguousChoice`                           | «ambigua: … «cantidad» planea la regresión»                               |
| 22  | e2e: al estimar no hay botón de IA (`regresion.spec`) | `WhySection` ignora `aiAvailable`                            | `toHaveCount(0)` del botón «Narrar con IA», en el build de producción     |
| 23  | e2e: la ambigua pregunta (`tarea-ambigua.spec`)       | La pregunta nunca se muestra (con una condición que compila) | `getByRole('group', …)`: element(s) not found                             |

**La #23 se puso «roja» a la primera por la razón equivocada.** La mutación `if (false)` no
compilaba: el server del e2e no arrancó y el gate «falló» sin que la prueba corriera.
`demo-rojo.sh` lo aceptó como rojo (K-S6-5). Se rehízo con una mutación que compila, y el fallo
nombró el grupo de la pregunta.

### Después de la mirada (construido encima de M1 y M2, ya registradas)

- **Model card por tarea.**
  - `buildModelCard` acepta las dos tareas. Al estimar trae la sección **«Estimación»**: la tarea,
    la unidad, el objetivo en train con sus decimales, cómo se reparten los errores y «Narración con
    IA: no aplica».
  - Las métricas van en unidades contra la mediana y la lineal, con MAPE «—» si hay ceros, y el
    veredicto es el mismo de la pantalla.
  - El texto del veredicto vive en `src/lib/regression-text.ts`, que comparten la pantalla y la
    model card; la demo #15 se rehízo ahí.
  - La línea de límites binaria («Solo clasificación binaria») se reemplazó por `limits.tasks`.
  - El resumen de métodos separa los baselines por tarea, y la salida binaria queda idéntica.
- **Fichas al estimar.**
  - Un párrafo de regresión por cada modelo compartido (`REGRESSION_NOTES`), como dato `{es, en}`
    con paridad.
  - **Hallazgo de la pasada de capturas:** la ficha de Ridge al estimar seguía diciendo «decide la
    clase… sin columna de probabilidad» y «Su AUC se calcula…», y contradecía el párrafo de abajo.
    Se agregaron reemplazos por tarea de los apartados que solo hablan de clasificar
    (`REGRESSION_FICHA_FIELDS`); hoy solo Ridge los tiene, y se revisaron las nueve fichas
    compartidas.
- **Documentos:**
  - el manual, con «Estimar una cantidad · desde Sprint 006», su diccionario, tres preguntas
    frecuentes (R² negativo, por qué pregunta, por qué la mediana) y el historial; las líneas «solo
    dos categorías» quedaron anotadas;
  - el ADR 013 (regresión como segunda tarea, con la entrada del gráfico en el design system) y el
    ADR 014 (el manifiesto por tarea);
  - `design-system.md`, con «Añadidos Sprint 006»;
  - el bundle `design-sync/`, con dos tarjetas S6 (`estimar.html`, `tarea-ambigua.html`) y su
    README;
  - la guía v3 acumulativa:
    - 49 pruebas: las 38 heredadas, F1 y E4 «Mejoradas en S6» y el bloque G con 11;
    - ⭐ de H2: 8 (4 del S5 + 4 del S6: G2, G4, G5, G10);
    - el chip `.o-s6`, los filtros «Nuevo del S6», «Mejorado en S6» y «Regresión S5», y
      `CLAVE = "guia-ds:s6:"`;
    - las cifras de la guía salieron de la pasada de capturas, no a ojo;
  - el kit gana `casas-nuevas.csv`, para puntuar con novedad plantada (2 de 8 filas).
- **Brochure y su export (regla 12 de la constitución):** ver D7.
  - Suman dos funcionalidades: «Estimar una cantidad, con el error en sus unidades» y «¿Categorías o
    una cantidad? Te lo pregunta». Pasan de 33 a 35 en el pie, el export y el e2e del brochure.
  - V1 dice «o una cantidad», y «tres ejemplos» pasa a «cinco».
  - El límite «ni un número continuo» se corrige.
  - El historial suma las etapas 5 y 6.
- **e2e:**
  - `regresion-score.spec` (exportar → recargar → importar → puntuar con `consumo_kwh_estimado` y
    un decimal, sin payload ni CSV en la red, y axe);
  - `reduced-motion` ampliado a estimar (la respuesta de la ambigua sin transición, y el veredicto
    y el gráfico de verdad visibles).
- **Pagado al pasar (era del S3):** «1 valores fuera del rango» → `score.novelty.*_one`, en los
  dos idiomas, con sus dos pruebas.

**Pasada de capturas del S6** (`scripts/capturas-s6.mjs`, build de producción, 2026-10-04):

- 360 y 1280 px, en claro y en oscuro; 32 encuadres con `scrollWidth ≤ clientWidth` medido (28 de la app + 4 de la guía), todos
  OK y sin `pageerror`.
- La ficha de Ridge cabe en la ventana en los cuatro (663 ≤ 780 y 650 ≤ 900).
- Se leyeron como imagen:
  - Resultados completos 1280 claro y 360 oscuro;
  - el veredicto, el gráfico (los dos temas), la liga con la prueba en 360, la ficha de Ridge
    oscura, la model card, puntuar, la fuga de precio, Inicio y la guía v3.
- Hallazgos pagados:
  - la ficha de Ridge al estimar;
  - las marcas del eje: con `niceTicks(…, 4)` salían 2 por eje en el consumo y ahora son 4;
  - el número partido de su unidad a 360 px (espacio no separable, antes de la mirada).

| Cifra que cita la guía | Medida                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------- |
| Quién compite, consumo | Nivel 1 · ahora · 10 modelos · unos 3 s                                               |
| Veredicto, consumo     | ▲ «Extra Trees» supera · ±33.5 kWh frente a ±43.8 kWh de la lineal · 23 % menos error |
| Errores, consumo       | 9 de cada 10 se equivocan por menos de ±62.7 kWh                                      |
| Novedad, casas nuevas  | 2 de 8 filas (25 %)                                                                   |
| Consumo mediano        | Nivel 1 · 9 modelos · unos 5 s · Nivel 2 · 2 modelos más                              |

| #   | Gate                                                              | Mutación                                       | Qué dijo el fallo                                                   |
| --- | ----------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------- |
| 15  | (rehecha en `regression-text.ts`) La lineal empata solo si empata | `verdict.level === "ties"` → `true`            | El «NO supera» de la lineal quedó tapado, y la model card lo heredó |
| 24  | La model card al estimar trae «Estimación»                        | Sin `...blocks.estimate`                       | «tarea, unidad, el objetivo en train…»                              |
| 25  | La ficha al estimar suma su párrafo de regresión                  | `false && id in REGRESSION_NOTES`              | «un modelo compartido suma su párrafo de regresión…»                |
| 26  | e2e: puntuar al estimar escribe `<objetivo>_estimado`             | Nombre de columna de clasificación             | `getByText('consumo_kwh_estimado')`: element(s) not found           |
| 27  | e2e: reduced-motion al estimar                                    | La respuesta de la ambigua sin `motion-reduce` | `transitionOff` → «Expected: true, Received: false»                 |
| 28  | La ficha de Ridge al estimar no habla de clasificar               | Sin los reemplazos por tarea                   | El diálogo contenía «AUC / probabilidad / la clase»                 |

### CI de las Fases 1 y 2 (`gh pr checks 17` tras cada push)

Cada push del PR #17 tuvo los 6 checks con conclusión propia `success`: `quality`, `integration`,
`e2e`, `lighthouse`, Vercel y Vercel Preview Comments. Ningún job corrió por primera vez en estas
fases (el paso de categorías de Lighthouse ya había corrido en el #16).

| Push      | Fase                      | Checks       |
| --------- | ------------------------- | ------------ |
| `07ef62a` | 0 (informe del spike)     | 6 de 6 verde |
| `79d7ef4` | 1 (motor y bitácora)      | 6 de 6 verde |
| `11cf65e` | 1 (bordes de la EDA)      | 6 de 6 verde |
| `7021ff4` | 2 (UI antes de la mirada) | 6 de 6 verde |
| `fdac870` | 2 (después de la mirada)  | 6 de 6 verde |

## Fricciones del kit (SEPARADAS del producto)

- **K-S6-1 · `README.md` dentro de `.claude/commands/` se carga como un comando `/README`.** El kit
  v1.35.0 lo estampa ahí, y Claude Code lo lista como skill invocable («README: Slash Commands — Kit
  General»). No rompe nada, pero ensucia la lista de comandos. Propuesta: moverlo a
  `.claude/COMMANDS.md`, o documentarlo en el README del kit.
- **K-S6-2 · `demo-rojo.sh` con `--buscar` de varias líneas.** El `grep -F` de la verificación
  interpreta cada línea como un patrón aparte (OR). La comprobación «la mutación ya no está» se
  debilita; la que sostiene la garantía es el `cmp`. Usado aquí con tres líneas en `StartScreen.tsx`
  sin daño. Propuesta: verificar la ausencia con Python (`in`), igual que la mutación.
- **K-S6-3 · Ninguna regla del kit pide «máquina quieta» durante un spike de costos.** En la primera
  corrida de Chromium, las demos en rojo (vitest) que corrí en paralelo inflaron `consumo-5000` un
  40 % (26,9 s frente a 19,1 s). Se notó solo porque había una corrida abortada para comparar.
  Propuesta: el molde del spike de costos dice explícitamente «nada más corriendo; si hubo carga, se
  repite», y registra la carga del sistema al empezar y al terminar.
- **K-S6-4 · Un `vitest run -t` que no coincide con ningún test sale con 0 («15 skipped»).** Una
  demo en rojo con un filtro mal escrito «pasa» en vacío. `demo-rojo.sh` lo atrapó porque esperaba
  un fallo, pero en `--esperar-verde` el mismo error daría un verde falso. Regla adoptada: el gate de
  toda demo filtra con `grep "Tests "` y el resumen debe mostrar al menos 1 test que corrió.
  Propuesta para el kit: que `demo-rojo.sh` acepte `--minimo-tests N` y lo verifique en las dos
  corridas.
- **K-S6-5 · `demo-rojo.sh` cuenta como rojo un gate que no llegó a correr.** En un e2e, una
  mutación que rompe la compilación tumba el `webServer` («Process from config.webServer was not
  able to start») y el gate sale con error. El script lo acepta: «✓ el gate falló con la
  mutación». Es la hermana de K-S6-4: un rojo que no viene de la aserción. Aquí se notó leyendo la
  salida. Propuesta: que el script exija en la salida del gate una marca de que la aserción corrió
  (p. ej. `--debe-nombrar '<texto>'`), y que la guía de demos diga «la mutación tiene que
  compilar».
