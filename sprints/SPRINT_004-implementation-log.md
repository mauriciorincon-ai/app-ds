# Sprint 004 — Bitácora de implementación (Sobrevive datos reales + CIERRE DE CICLO H1)

Branch: `sprint-004/sobrevive-datos-reales` · Orden: `portafolio/ds/ordenes/SPRINT_004-orden.md` ·
Plan aprobado por el usuario el 2026-07-19 (plan mode) · Modelo/esfuerzo fijados por el usuario
(`/model` → opus[1m]) antes del «construye».

Último sprint del ciclo H1. La app deja de asumir datasets de laboratorio: saneamiento
transparente (parte estadística DENTRO del pipeline retenido — extensión del ADR-002), EDA mínima
con alertas honestas, boosting (`HistGradientBoosting`) compitiendo con el mismo veredicto, y los
cierres de ciclo (BLUEPRINT.html + design system publicado + guía v1 acumulativa S1–S4).

## Verificación de supuestos del kit (Fase 0)

2026-07-19 — Verificado contra el repo real y el runtime real:

- ✅ **`HistGradientBoostingClassifier` y `HistGradientBoostingRegressor` importan** en el Pyodide
  vigente (sklearn 1.8.0 / Pyodide 314.0.2 / Python 3.14.2). Boosting va sin fallback — se
  descarta la ruta "GradientBoosting clásico" de la orden.
- ✅ **Hook gitleaks VIVO** (verificado 2026-07-19): binario `gitleaks 8.30.1`,
  `core.hooksPath=githooks`, `githooks/pre-commit` en modo 100755. K12 (pagada en S3) sigue en
  pie. La carnada canónica PARTIDA se arma SOLO en el test del hook.
- ✅ Deuda ConfigScreen pendiente: `src/components/ConfigScreen.tsx` tiene la región scrolleable
  sin foco de teclado (hallazgo axe del S3) — se paga en F3 con el patrón de ScoreScreen.
- ✅ Los 3 CSV de ejemplo (`marketing-campania.csv`, `rotacion-empleados.csv`,
  `credito-fuga-plantada.csv`) están LIMPIOS (200 filas c/u, sin duplicados ni celdas basura) ⇒
  el saneamiento es no-op sobre ellos y las aserciones de conteo exacto de los e2e/integración
  del S3 sobreviven.

## Desviación del plan

- **`docs/kit-de-prueba/` NO existía** al iniciar el sprint. La orden (§ Inputs 2) lo lista entre
  "los datasets de `docs/kit-de-prueba/`" como si ya existiera; en este repo los datasets de
  ejemplo viven en `public/datasets/` y el directorio `docs/kit-de-prueba/` nunca se creó (la
  guía acumulativa —que lo enlaza— es entregable NUEVO de este sprint). Se CREA en F6 como parte
  del cierre, con un README y los CSV de prueba (los 3 de scoring del S3 + el nuevo
  `clientes-sucio.csv`). Sin impacto en el alcance; avisado al usuario.

## Deltas del kit aplicados (v1.2.x → v1.7.3)

2026-07-19 — Aplicados en F0 (repo estampado en v1.2.0; el kit va en v1.7.3):

- **v1.6.2 — gate de arranque** → `.claude/commands/plan-sprint.md` (paso 7 dividido en 7+8) +
  `CLAUDE.md` § Workflow/Apertura (regla espejo). Aprobar el plan ≠ arrancar; espera «construye».
- **v1.6.3/v1.7.3 — carnada canónica PARTIDA** → `CLAUDE.md` regla 7 (viaja partida:
  `AWS_ACCESS_KEY_ID=` + `AKIAQ7RTZ4PX` + `KM2WNB3S`, se arma SOLO en el test del hook).
- **v1.6.4 — testing-patterns § e2e-BD-real** → `.claude/skills/testing-patterns.md` (documental;
  ds no tiene BD, se conserva por paridad).
- **v1.7.1 — bloque "Cierre de CICLO"** → `CLAUDE.md` § Workflow (BLUEPRINT.html + `/design-sync`
  - guía v1 acumulativa; este sprint LO EJECUTA).
- **v1.7.2/v1.7.3 — testing-patterns reglas 6–9 + anti-"comportamiento sin experiencia" +
  lighthouse-públicas + plan-sprint § riesgos de integración** →
  `.claude/skills/testing-patterns.md` + `.claude/commands/plan-sprint.md` paso 4.

## Fase por fase (progreso, decisiones, bugs)

### F0 — Setup + deltas + supuestos — HECHA

Deltas del kit aplicados y commiteados; hook gitleaks ejercitado en un commit real (vivo);
supuestos HGB + min_frequency verdes en el Pyodide real.

### F1 — Motores TS — HECHA

- `src/engine/sanitize.ts` (puro): dedup de filas exactas (pre-split ⇒ previene fuga por
  duplicación), exclusión de ID exacta (solo NO-numéricas — una feature numérica de valores
  distintos NUNCA se descarta en silencio) y de constantes, coerción de numéricas mixtas
  (≥90% parsean ⇒ basura→nulo, contado). Reporte con conteos + `usable` para el caso
  irrecuperable.
- `src/engine/eda.ts` (puro): alertas honestas — posible fuga (heurística de leakage sobre TODO
  el dataset, etiquetada aviso exploratorio pre-split), id-like (casi-única; excluida del escaneo
  de fuga), desbalance. `EdaAlert` tipo separado de `LeakageFinding`.
- `experiment.ts`: `primary_metric` en el payload (regla simétrica, vive SOLO en verdict.ts) +
  `modelName`/`candidates`/`rareCategories` en el resultado.
- `protocol.ts`: tipos `ModelCandidate`, `csv-unusable`, campos multi-candidato + rare_categories.
- Tests: `sanitize.test.ts` (9) + `eda.test.ts` (7) + experiment (primary_metric por balance,
  candidatos). Fixtures de UI/narración actualizados a los tipos nuevos (ganador por defecto
  `forest`). 199/199 unit verdes; engine 96.6% agregado (>80%).

**Nota de diseño (ID numérica):** el rule de exclusión de ID se restringió a columnas NO
numéricas — una columna numérica (o casi, que se coacciona) con todos los valores distintos es una
feature continua legítima, no un identificador; descartarla sería deshonesto. La casi-ID numérica
la señala la EDA como aviso `id-like`, no la excluye sanitize.

### F2 — pipeline.py multi-candidato + integración — HECHA

- `pipeline.py`: `OneHotEncoder(min_frequency=2, handle_unknown="infrequent_if_exist",
sparse_output=False)` — agrupa categorías raras aprendiendo SOLO de train (fit train-only ⇒
  fuga imposible; `sparse_output=False` porque HGB no acepta matrices dispersas). Multi-candidato:
  forest + `HistGradientBoostingClassifier` con el MISMO preprocesador clonado; ganador = argmax
  de `primary_metric` (empate → forest); `_MODEL` = pipe del ganador; retorno gana `model_name` +
  `candidates` + `preprocessing.rare_categories`.
- Test nuevo `sanitation-pipeline.test.ts`: **anti-fuga del saneamiento** (categoría rara agrupada
  con la frecuencia de TRAIN, no de todo el dataset — FALLA si se rompe la garantía) + HGB compite
  - ganador = argmax.
- **Bug cazado (regla 9):** el sanity S3 "x alto → si" asumía forest. En el dataset de novedad de
  10 filas, HGB (min_samples_leaf=20) no puede entrenar y aun así ganaba por AUC sobre un test de
  2 filas (AUC no discrimina con 2 muestras). Reescrito con dataset propio separable (60 filas)
  donde AMBOS candidatos aprenden el patrón — la intención (scoring correcto) queda intacta y
  robusta al ganador. Los conteos de novedad y el export→import siguen sobre el dataset original.
- Suites pipeline.test.ts + scoring.test.ts + los 2 nuevos: 24/24 integración verdes
  (incl. export→import con HGB retenido — pickle proto5 OK).

### F3 — UI + i18n + generador — HECHA

- `useExperiment`: saneamiento en `loadCsv` (fija `sanitation` una vez; `csv-unusable` si no queda
  estructura), acción `selectTarget` (alertas EDA por objetivo), `sanitationRef` para el export.
- `ConfigScreen` EXTENDIDA (sin fase nueva — los e2e existentes la atraviesan): bloque de informe
  de saneamiento (limpio ⇒ "nada que sanear" VISIBLE; sucio ⇒ acciones con conteos), alertas EDA
  con `role="status"` (no `alert` — regla 7), fix axe de la preview (`role="region"` + `tabIndex`).
- `StartScreen`: 4º ejemplo `clientes-sucio.csv`; `ResultsScreen`: bloque de candidatos con ganador
  marcado (símbolo + texto, sin selector); `ModelCardView`/`modelcard.ts`: sección de saneamiento +
  nombre del modelo parametrizado (ya no hardcodea "Random Forest") + categorías raras.
- `model-file.ts`: campos aditivos OPCIONALES `model_name` + `sanitation` (D7 — sin bump; el
  resumen de importación muestra el modelo ganador).
- Generador: `messyCustomers()` → `clientes-sucio.csv` (200 filas: 10 duplicadas, id_cliente único,
  pais constante, edad con 6 "error" + 18 nulos, canal con "fax" raro, contrato 13.5% ⇒ desbalance).
- i18n ES/EN (paridad verde) para todo lo nuevo; `Card` gana `role` opcional.
- Tests: `dirty-dataset.test.ts` (el CSV sucio demuestra el saneamiento) + 6 tests de componentes
  nuevos (informe limpio/sucio, alertas, región enfocable, candidatos, csv-unusable). 207/207 unit
  verdes; typecheck + lint + build limpios; ConfigScreen 92.6%.

**Diseño (id-like solo NO numérica):** la alerta EDA `id-like` se limitó a columnas no numéricas —
una feature continua tiene alta cardinalidad natural y marcarla "identificador" sería ruido
(coherente con la exclusión de sanitize). Evita un falso positivo sobre `ingreso` en el CSV sucio.

### F4 — Narración extendida — HECHA

- `schemas.ts`: bloque `eda` OPCIONAL (unión discriminada strict) en el payload; el contrato
  cerrado ahora admite alertas agregadas (tipo + columna/tasa; jamás valor de celda).
- `payload.ts`: `buildNarrationPayload` incluye `eda` solo si hay alertas; **si está limpio OMITE
  la clave ⇒ payload byte-idéntico al de S3** (no-regresión de privacidad; el e2e why-modelcard
  usa marketing, limpio).
- `templates.ts`: extensión determinista al informe EDA (frases de id-like + desbalance con cifras
  del payload, NUNCA del LLM); la posible-fuga la cubre ya la frase de fuga.
- `useNarration` + `ResultsScreen` + `page.tsx`: threading de `edaAlerts` (referencia estable de
  `state.edaAlerts` ⇒ no re-dispara el fetch, R7). El prompt real ya incluía el payload completo
  vía `JSON.stringify` ⇒ el LLM ve el contexto EDA sin cambiar el prompt; `verify.ts` sin cambios.
- Tests: `narration-payload` (limpio SIN clave `eda`, igualdad estricta; sucio solo agregados +
  valida schema + cero valores de celda) + `narration-templates` (frases EDA deterministas).
  210/210 unit; zod sigue server-side (R8: bloque eda a mano, cero zod en el cliente).

### F5 — e2e — EN CURSO
