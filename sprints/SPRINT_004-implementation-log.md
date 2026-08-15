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
- **O2 se entregó como "EDA mínima de ALERTAS", sin vista de distribuciones/correlaciones**
  (registrado 2026-07-20, detectado por la auditoría de cierre — debió anotarse durante F1/F3).
  El outcome O2 del SPRINT_004.md y la D3 del plan prometían "distribuciones por columna,
  faltantes, correlaciones"; lo construido es `computeEdaAlerts` (posible fuga / casi-ID /
  desbalance) + el perfil por columna que ya existía de S1 (tipo + nulos en la preview). Las
  correlaciones solo afloran como alerta si cruzan el umbral de fuga. Las acceptance criteria
  formales (las 3 alertas con sus umbrales, silencio en limpio) SÍ se cumplen todas; lo recortado
  es la vista exploratoria general. Motivo: presupuesto de pasos de la pantalla (regla 8) —
  ConfigScreen ya absorbía saneamiento + alertas + fix de a11y. Queda como deuda explícita en el
  summary (vista de distribuciones/correlaciones, candidata a H2).

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

### F5 — e2e — HECHA

- `saneamiento-sucio.spec.ts` (nuevo): cargar `clientes-sucio.csv` → informe con conteos (10
  duplicadas, id_cliente + pais excluidos, edad coaccionada) → alerta de desbalance al elegir
  `contrato` → entrenar → veredicto con candidatos → exportar (`format_version` 1 +
  `manifest.sanitation` con dedup/exclusiones) → CERO valores de celda en la red (ni "C-00…" ni
  "fax") → axe limpio.
- `happy-path.spec.ts` extendido: dataset limpio dice "nada que sanear"; resultados muestran los
  candidatos con el ganador marcado.
- **Fricción (no de producto):** un `next-server` viejo (arrancado antes de F3) seguía en :3000 y
  Playwright lo reusaba (reuseExistingServer local), sirviendo la StartScreen de 3 ejemplos → el
  spec no hallaba el 4º botón. Se detuvo el server viejo; con uno fresco pasó a la primera.
- Suite e2e COMPLETA: **12/12 verdes ×2 devices** (mobile Pixel 7 + desktop). score-download y
  why-modelcard (conteos exactos + privacidad de narración) intactos ⇒ R3/R6 confirmados.
- Unit 213/213; typecheck + lint limpios.

### F6 — CIERRE DE CICLO — HECHA (salvo pasos interactivos del usuario)

- **ADR-008** (boosting multi-candidato + saneamiento en dos capas) + **revisión de ADR-007**
  (aditivo-opcional NO sube format_version; compat S3↔S4 con tests dedicados).
- **`docs/kit-de-prueba/`** (nuevo — no existía; desviación registrada): README + 4 datasets
  espejo + `clientes-nuevos.csv` (scoring). Generador = fuente única a `public/datasets/` Y al kit.
- **MANUAL**: sección S4 + FAQ; Historial con la fila S3 que faltaba + fila S4.
- **`docs/BLUEPRINT.html`**: as-built (SVG local-first + tabla 14 filas + costo ≈US$0 + punto
  único de falla), autocontenido.
- **`docs/GUIA-DE-PRUEBA.html` v1**: acumulativa S1–S4 (24 pruebas), chips de origen, filtros,
  gate ⭐ de 11 pruebas no-automatizables, `localStorage guia-ds:s4:`, kit enlazado, autocontenida.
- **Lighthouse local (lección S3):** el script de la landing mide **282KB < 300KB** (budget
  intacto — zod sigue server-side; sanitize/eda son TS puro). `lhci autorun` local falló en el
  healthcheck del entorno; se midió el gate crítico (script gzip de la landing) directamente.
- **`/deploy-check`:** typecheck·lint limpios · unit 215 · integración 24 · e2e 12 ×2 devices ·
  cobertura 90.8%/85.4% (>70%) · build OK · audit(high) exit 0 (1 moderate = deuda postcss
  declarada) · axe limpio en e2e.

**Pasos interactivos del usuario (cierre del ciclo):**

- **`/design-sync`** — la fuente (`design-system.md`) está lista; la publicación a Claude Design es
  outward-facing con prompts de permiso (create_project/finalize_plan) y no hay skill `/design-sync`
  estampada en esta app ⇒ la corre el usuario. No existe aún proyecto "Probeta DS — Design System"
  (sí los de habla/inmobiliaria).
- **Gate ⭐** sobre la guía v1 (11 pruebas, ~25–30 min) — única vía de cierre del ciclo.
- **`/cierre-sprint ds`** en la planeadora tras el merge — cierra sprint Y ciclo (H1 COMPLETO).

## Estándares 6+1 — evidencia

- **Testing:** unit 215 · integración 24 (Pyodide) · e2e 12 ×2 devices · engine >80% agregado ·
  el test-que-falla del saneamiento anti-fuga (categorías raras SOLO de train).
- **CI/CD:** 4 jobs verdes localmente; sin jobs nuevos (no cambia la ruleset).
- **Observabilidad:** metadata-only intacta; la narración registra costo con Pino; Sentry inerte
  sin DSN. Cero contenido del dataset en logs.
- **Seguridad:** doble gitleaks vivo (carnada partida armada solo en el test del hook); audit(high)
  limpio; sin secretos en el diff.
- **Performance:** budget de 300KB respetado (282KB); landing liviana (Pyodide bajo demanda).
- **UX+A11y:** axe limpio; región de preview enfocable (deuda ConfigScreen pagada); alertas con
  símbolo+texto; `role="status"` (no `alert`).
- **IA embebida responsable:** narración extendida = mismo adapter, misma verificación, mismo
  opt-in; `.strict()` en el schema; bloque eda a mano (zod server-side); fallback determinista.

## Auditoría final pre-cierre (2026-07-20) — hallazgos y ajustes

Auditoría de solo lectura sobre TODO el ciclo (S1–S4: cobertura de alcance contra órdenes/planes
de la planeadora, calidad de código, seguridad, dependencias, documentación) ANTES del gate ⭐ y
del merge. Resultado: 0 Críticos, 7 Altos (todos corregidos o documentados en esta pasada),
~17 Medios y ~20 Bajos que quedan como backlog documentado aquí. Ajustes aplicados (aprobados
por el usuario, «Realiza los ajustes»):

1. **Worker sin manejo de muerte (UI colgada para siempre)** → `useExperiment` registra
   `onerror`/`onmessageerror`: falla los comandos en vuelo con error honesto (kind nuevo
   `worker-dead`, i18n ES/EN) y RE-CREA el worker para que reintentar funcione.
2. **Perímetro del import de modelo** → (a) CSP en `next.config.ts` (`connect-src` limitado a
   self+Sentry: contiene la exfiltración del peor caso pickle — la CSP que ADR-001 asumía);
   (b) `import_model` coteja el esquema del pickle contra el del manifiesto
   (`expected_schema` → `schema-mismatch`); (c) tope `file.size` ≤100 MB ANTES de leer
   (`file-too-large`). Revisión 2026-07-20 en ADR-007; test de integración del cotejo.
3. **Gate gitleaks mortal en clon nuevo** → script `prepare` real (`scripts/apply-hooks.mjs`,
   multiplataforma — CLAUDE.md lo afirmaba sin existir) + step gitleaks 8.30.1 pineado en el job
   quality del CI (tercera red; verificado en local contra el árbol trackeado: 0 hallazgos).
4. **Costo LLM loggeado siempre en US$0** → precio de `openai/gpt-oss-120b` en `cost.ts`
   ($0.15/$0.60 por 1M, cifras del ADR-005) + `ia-cost.test.ts` que exige precio para los
   modelos de producción. Amendment en ADR-005.
5. **Divergencia de nulos/trim TS↔Python** ("si "≠"si" ⇒ 3 clases ⇒ el export se rechazaba a sí
   mismo al re-importar; "None"/"NULL" como categorías reales) → `_normalize_cell` en pipeline.py
   espeja `isNullToken` (strip+lower, mismo set); `parseNumber` rechaza hex/bin/octal como
   pandas; test-tripwire `null-token-parity.test.ts` + tests de integración con celdas sucias.
6. **Inyección de prompt vía nombres de columna** → comentario falso de `guardrails.ts`
   corregido ("no tiene vehículo" → sí lo tiene, mitigado y con residuo documentado), prompt del
   Narrator endurecido (nombres = datos no-instrucciones), amendment en ADR-005 y ADR-006 (que
   además salda la revisita que el propio ADR-006 exigía por el bloque `eda` de S4).
7. **Recorte de O2 sin documentar** → registrado arriba en `## Desviación del plan` + deuda en el
   summary.

**Backlog de la auditoría (Medios/Bajos NO corregidos en esta pasada — para la planeadora):**
headers duplicados sin detectar en ninguna capa; falsa alarma de fuga en columnas casi-ID
(prepareRun no aplica la exclusión id-like de eda.ts); filas con objetivo nulo descartadas en
silencio; BOM UTF-8; frontera de desbalance EDA (0.15) ≠ frontera de métrica (0.35); re-fetch de
narración en cada remount de Results + retry que descarta narrativa verificada; `pickExample`/
`handleFile` sin manejo de errores y límite de 5 MB validado tras leer el archivo; matriz de
confusión etiquetada 0/1 en vez de las clases reales; sin gestión de foco entre pantallas;
"circuit breaker" nominal (kill-switch + rate limit por instancia); wheels de Pyodide sin
verificación sha256 en `copy-pyodide.mjs`; `console*.html` de Pyodide publicados con scripts de
CDN (REPL bajo el origen); `design-system.md` sin sección S4 (insumo del `/design-sync`); README
raíz boilerplate; e2e faltantes (fuga plantada con Pyodide real, flujo en EN); ID numérico puro
entra al modelo sin aviso en ninguna capa (comentario de sanitize.ts corregible); `.gitignore`
sin `.env.production`/`.env.development`; formula injection en CSV puntuado; claves i18n
huérfanas (`results.leakage.none` nunca se renderiza); metadata SSR solo ES; preview sin tope de
columnas; revocación inmediata del ObjectURL (Safari); datasets degenerados sin gate de n mínimo.

## Gate ⭐ en curso (2026-07-20) — feedback del usuario por bloques

El usuario decidió correr la guía POR BLOQUES (feedback incremental, no una lista gigante al
final). Registro por bloque: resultado, ajustes aplicados en caliente (gate de diseño del
sprint) y propuestas que van a backlog para la planeadora (features nuevas, algunas con
tensión de reglas duras — se decide en H2, no se improvisa en el cierre).

### Bloque A — Cargar datos, sanear y elegir el objetivo (6/6 pasan)

Las 6 pruebas pasaron; veredicto del usuario sobre velocidad: "me dejó boquiabierto".
**Dato nuevo del usuario (importantísimo, va a memoria):** tiene **daltonismo leve** — el verde
sutil (tinte 10%) del recuadro "nada que sanear" no le transmitía tranquilidad; el ámbar del
desbalance lo distingue perfecto.

**Ajustes aplicados en caliente (gate de diseño):**

1. **Iconos en todos los botones de acción** (pedido explícito A1): componente `Icon` en
   `ui.tsx` (SVG de trazo inline, `currentColor`, `aria-hidden`, 10 glifos) + prop `icon` en
   `Button`; aplicado en las 7 pantallas (Start, Config, Results, Score, Error, ModelCard,
   import). Cero emojis (regla del design system); el texto siempre permanece.
2. **Verde evidente sin ser intrusivo** (A2, daltonismo): recuadro limpio de saneamiento con
   tinte 15% + borde sólido + barra izquierda + ✓ en círculo relleno (texto `--bg` ⇒ contraste
   en ambos temas); mismo círculo en el silencio activo de la EDA.
3. **Guía A1 corregida:** prometía "conteo de nulos" en un dataset limpio — ahora aclara que la
   etiqueta solo aparece en columnas CON nulos (marketing no tiene).

**Backlog para la planeadora (H2) — propuestas del usuario con análisis de reglas duras:**

- **A1 · Mini-dashboard de estadísticas descriptivas por columna.** Coincide EXACTAMENTE con el
  recorte de O2 documentado en `## Desviación del plan` (distribuciones/correlaciones) — el
  usuario lo pidió sin saber del recorte, lo que lo valida como necesidad real. Candidato
  natural a primer ítem de H2.
- **A3 · Saneamiento selectivo (elegir qué limpiezas aplicar).** OJO regla dura 3: el dedup
  pre-split PREVIENE fuga por duplicación — hacerlo opcional reabre la trampa "misma fila en
  train y test". Si H2 lo toma: exclusiones de columna pueden ser opcionales (ID/constante son
  ruido, no fuga), el dedup NO debería serlo (o exige un aviso rojo de "esto invalida el
  veredicto"). La coerción podría ser configurable.
- **A4 · Alternativas + elección ante desbalance (no solo "usaré AUC").** Tensión con "el
  veredicto habla": permitir elegir métrica abre metric-shopping. Vía honesta posible: mostrar
  TODAS las métricas con la primaria justificada (ya se hace) + explicar alternativas
  (class_weight, umbral) como EDUCACIÓN, y si se permite elegir, dejar constancia en la model
  card de que la métrica fue elección del usuario.
- **A5 · Botón "aplicar solución" en la alerta de fuga (excluir columna y re-entrenar).** La más
  viable de las cuatro: excluir la columna sospechosa ES la solución canónica y no viola nada.
  Diseño natural: acción "entrenar sin esta columna" en la alerta, con el before/after de
  métricas para que el usuario VEA el efecto de la fuga. Candidato fuerte a H2.

**Decisión propuesta sobre el backlog del bloque A (2026-07-20, acordada con el usuario):**
las cuatro entran a H2 en versiones que NO reabren la trampa, con esta prioridad:

1. **A5 — "Entrenar sin esta columna" con antes/después** (con la columna: AUC inflada y
   sospechosa · sin ella: la creíble). Refuerza la honestidad; enseña la fuga visceralmente.
2. **A1 — Mini-dashboard de estadísticas por columna** (TS puro en engine/, mini-histogramas
   CSS; exploración pre-split, no toca la garantía train-only). Paga el recorte de O2.
3. **A4 — versión honesta del desbalance:** explicador "¿por qué AUC?" + interruptor "entrenar
   también con class_weight" que añade un CANDIDATO a la competencia existente. El mismo juez
   evalúa a todos; NUNCA elección de métrica primaria (metric-shopping).
4. **A3 — saneamiento selectivo PARCIAL:** interruptores solo en lo reversible (exclusiones de
   ID/constante con "incluir de todos modos", coerción como-categórica); el **dedup jamás es
   opcional** — se muestra con candado y explicación llana ("protege la comparación honesta"),
   ni siquiera con aviso rojo (la UI no ofrece camino a la fuga — regla dura 3).

**⚠️ Este orden fue REVISADO el 2026-08-12** — ver `sprints/H2-PROPUESTA-liga-honesta.md`.

### Propuesta mayor para H2 — «La liga honesta» (2026-08-12)

Surgida de dos preguntas del usuario durante el gate ⭐ ("¿con cuántos modelos cuentas y cómo
eliges?" / "¿no es ridículamente baja la oferta de cuatro modelos?"). Documento completo:
[H2-PROPUESTA-liga-honesta.md](H2-PROPUESTA-liga-honesta.md). Resumen para la planeadora:

- **Hallazgo:** el diseño actual (argmax sobre TEST entre 2 candidatos) es lo que limita la oferta
  a dos, porque cada candidato extra evaluado sobre test infla el puntaje del ganador. Lo escaso
  **no es el número de modelos, son las decisiones tomadas sobre el test**.
- **Desbloqueo:** mover la selección a **validación cruzada dentro de train**; el test se abre UNA
  vez, solo para el ganador. Entonces N deja de estar acotado por la estadística. `cross_val_score`
  sobre el `Pipeline` reajusta el preprocesador por fold ⇒ la garantía del ADR-002 se mantiene por
  construcción.
- **Oferta propuesta:** ~11 modelos cubriendo el espectro de familias tabulares; 7 son
  prácticamente gratis (el costo sigue en RF y HGB). Cero dependencias nuevas: scikit-learn ya se
  carga entero. Ejecución en dos niveles (barato automático · liga completa a demanda con
  estimación de tiempo y cancelación).
- **Regla que protege la tabla:** la liga muestra SOLO puntajes de CV; el test solo para ganador y
  baselines (mostrar el test de los perdedores sería invitar al model-shopping).
- **Efecto esperado a anticipar:** al corregir el sesgo de selección, algunas métricas quedarán
  ligeramente por debajo de las de H1. Es la corrección, no una regresión.
- **Corrige el matiz de A4 acordado arriba:** `class_weight` como candidato autoseleccionado sobre
  test paga el mismo peaje; debe ser reejecución pedida por el usuario, o un miembro más de la liga
  (donde el problema desaparece solo).
- **Decisión de producto pendiente (no la toma esta sesión):** acerca la app al terreno del AutoML,
  del que la constitución se distancia. Lectura propuesta: el diferenciador nunca fue "pocos
  modelos" sino "método honesto", y sobrevive intacto — pero lo decide la planeadora.

Nueva secuencia sugerida para H2: **liga honesta → A5 → A1 → regresión → A4/A3.** La regresión
(hoy imposible: un objetivo numérico no puede usarse) duplica a quién le sirve la herramienta,
pero conviene después de la liga porque hereda la selección por CV.

### Bloque B — El veredicto honesto (4/4 pasan)

Las 4 pruebas pasaron. Veredicto del usuario sobre B3 (fuga): "es el resultado más adecuado que
he visto — sinceridad, puntualidad, especificidad". Ese mensaje queda como el ESTÁNDAR de copy
de la app (qué pasa + elemento nombrado + acción concreta).

**Ajustes aplicados en caliente (gate de diseño):**

1. **B1 — El veredicto nombra al ganador:** "«Random Forest» supera al baseline" en vez de "El
   modelo supera…" (claves `results.verdict.*` con `{name}`, nombres cortos nuevos
   `candidates.short.*`; también en la model card). Tests unit + e2e actualizados (el e2e ahora
   AFIRMA el titular con nombre).
2. **B2+B4 — Candidatos con protagonismo y métricas completas:** el bloque pasó de lista con
   solo la métrica primaria a **caja destacada** (accent 5% + borde) con **tabla comparativa de
   las 5 métricas de AMBOS candidatos** (primaria resaltada + "(primaria)"; ganador ▶ + badge);
   la nota metodológica subió de text-xs a text-sm.
3. **B3 — Pase de copy contra el patrón del mensaje de fuga:** revisados TODOS los avisos.
   Ya cumplían: saneamiento (columna+conteo+porqué), novedad, bloqueo de esquema, desbalance.
   Mejorados: veredicto empate/derrota ahora dan la acción concreta en llano ("suele ayudar más
   añadir variables relacionadas con el objetivo que cambiar de modelo" / "prueba con variables
   más relacionadas con lo que quieres predecir"); alertas EDA de posible-fuga e id-like ganan
   su acción ("quítala de tu CSV y vuelve a cargarlo").

Verificación: unit 223/223 · e2e 12/12 (×2 devices, axe) · typecheck/lint. Un fallo intermedio
legítimo atrapado por el e2e: el titular con nombre creaba doble match de "HistGradientBoosting"
(strict mode) — resuelto afirmando la celda exacta de la tabla. design-system.md actualizado
(VerdictBanner nombra al ganador; CandidatesList = caja destacada con tabla completa).

### Bloque C — El porqué, contado honesto (5/6 pasan · C4 FALLÓ)

El usuario detectó el primer **fallo real de un ⭐ gate**: C4. Diagnóstico contra el código (el
texto recibido NO era del mock —el mock se autoidentifica—, así que era Groq real con key):

**Defecto 1 (causa de C4): el prompt nunca pedía cubrir el bloque `eda`.** `narratorPrompt`
enumeraba veredicto + variables + fuga, pero NO las alertas EDA, aunque el payload sí las lleva
desde S4. Resultado: la nota de desbalance salía en la plantilla y desaparecía en la IA — justo
lo que C4 verifica. **Fix:** el prompt cubre ahora el array `eda` (tasa minoritaria en % e
identificadores).

**Defecto 2: vocabulario interno filtrado ("nivel beats", "asociación none").** El prompt exigía
"echo the verdict level exactly" y "copy directions exactly" **sobre la prosa**, cuando la
verificación (`verify.ts`) contrasta los CLAIMS y `verdictLevel` —campos estructurados—, jamás la
redacción. **Fix:** el prompt separa los dos planos — prosa en lenguaje llano (prohibido escribir
los códigos internos, redondeo a 2 decimales) y claims exactos para la máquina.

**Ajustes aplicados (gate de diseño):**

1. **C1 — dirección con sentido:** la etiqueta nombra la COLUMNA objetivo ("más probable que
   «convirtio» sea «0»") en vez de un «0» huérfano; nota fija que explica qué clase se detecta y
   que **importancia ≠ dirección** (una variable sin dirección única NO es irrelevante — era la
   duda literal del usuario).
2. **C2/C3 — texto más rico y honesto:** explicación de la métrica **y su rango** en la plantilla
   determinista y en el prompt, desde UNA sola fuente (`narration.template.metricHelp.*` del
   i18n). Anclas **fácticas** (0.50 sería azar, 1.00 perfecto), NO etiquetas subjetivas
   (alto/medio/bajo): un juicio de valor no es un dato medido. `narrative` máx. 900→1200.
3. **C2 — dos bloques separados + botón a demanda:** "Texto estándar" (siempre) y "Narración con
   IA" (botón). Se elimina el consentimiento persistente (`useConsent` + `ConsentPanel` borrados):
   la pulsación ES el consentimiento, para ESE experimento y una vez; cambiar de dataset vuelve a
   reposo. Es MÁS estricto que el opt-in recordado ⇒ refuerza la regla dura 2. ADR-006 enmendado.

Verificación: unit 222 · integración 27 · e2e 12 ×2 devices (axe) · typecheck/lint. El e2e volvió
a atrapar una colisión real (la nueva frase "la métrica principal aquí es…" chocaba con el
encabezado "Métrica principal:"). **Sin key local no se pudo probar el texto real de Groq**: la
mejora está razonada sobre la causa (el prompt pedía literalmente lo que salía), pero el juicio
final es del usuario sobre la preview.

**Verificación del arreglo contra Groq REAL (2026-07-20).** El usuario creó una key local y se
comprobó el route de punta a punta con el payload del caso que falló en C4 (clientes-sucio →
contrato, AUC 0.6864 vs 0.6341, desbalance 13.5%). Resultado final: `status: verified`,
Grader 5/5/5, y los 6 chequeos en verde — menciona el desbalance (el bug de C4), cero jerga
interna, métrica explicada con su rango, y las cifras COINCIDEN con lo que muestra la pantalla.

En el camino se encontró y arregló un **bug latente que el arreglo del prompt destapó**: el
payload trae `direction: null`, pero el esquema de claims solo acepta los strings
positive/negative/**none**. Al pedirle al modelo "copia los códigos de dirección exactamente como
los da el payload", copió `null` literal ⇒ Groq rechazó la generación entera
(`json_validate_failed`) ⇒ **fallback silencioso a plantilla**. El prompt declara ahora el mapeo
explícito (`null` ⇒ `"none"`). Riesgo residual aceptado: si algún día el modelo volviera a emitir
`null`, la app degrada honestamente (plantilla + aviso), no rompe.

También quedó confirmado en real el arreglo A4 de la auditoría: el log de costo ya NO reporta
US$0 (`costUsd: 0.000452` por narración, ~US$0.0007 con Grader incluido — el presupuesto de
US$10/mes da para ~14.000 narraciones).

### Bloque D — El modelo se usa (4/4 probadas pasan · D5 no ejecutable a mano)

D1 ⭐ y D4 ⭐ (los dos gates mínimos del bloque) **pasan**. D3 pasa. D2 pasa pero destapó un fallo
real de robustez. D5 no se pudo ejecutar: el `.probeta.json` descargado no se dejaba abrir en el
equipo del usuario para manipularlo.

**🐛 Hallazgo D2 — el CSV de Excel en español (el más valioso del gate).** El usuario borró UNA
columna y la app respondió «faltan» las SEIS. `checkSchema` estaba correcto
([schema-check.ts:35](../src/lib/ds/schema-check.ts#L35)): las seis faltaban de verdad, porque el
archivo se guardó con **punto y coma**, el parser solo separaba por coma
([csv.ts:103](../src/lib/ds/csv.ts#L103)) y no se reconoció ningún encabezado. Reproducido con
tres escenarios antes de tocar nada:

| Archivo                       | Columnas reportadas como faltantes |
| ----------------------------- | ---------------------------------- |
| Coma, sin `dispositivo`       | solo `dispositivo` ✅              |
| **Punto y coma** (Excel es)   | **las 6** ← lo que vio el usuario  |
| Con BOM (Excel UTF-8)         | `edad` + `dispositivo`             |

Esto pega en el centro de la tesis del sprint ("sobrevive datos reales"): el público objetivo son
profesionales NO técnicos, y en español Excel exporta con `;` **precisamente porque la coma es el
separador decimal**.

**Arreglo (aplicado):** el parser descarta el BOM de UTF-8 y **detecta el separador real en la
cabecera**; si no hay ni una coma fuera de comillas pero sí `;` o tabuladores, bloquea nombrando
el separador y diciendo cómo arreglarlo (patrón de copy B3). Conservador por diseño: basta UNA
coma en la cabecera para no disparar, así que un CSV normal con `;` dentro de sus campos nunca se
bloquea. Cubre los DOS caminos (entrenar y puntuar) porque ambos pasan por `parseCsvWithLimits`.

**Decisión deliberada: bloquear, no adivinar.** Leer el archivo con `;` obligaría a reinterpretar
también los decimales («1234,5»); una lectura mal adivinada convertiría columnas numéricas en
categorías **sin avisar** — un fallo mudo, peor que el bloqueo (regla dura 3). Soporte completo de
CSV europeo (delimitador + decimales + fidelidad del original al descargar) → **backlog H2**.

**Fricción de la guía (arreglada).** D2 y D5 pedían editar archivos a mano; eso fue justo lo que
desvió la prueba. El kit ahora trae los tres archivos listos: `clientes-nuevos-sin-dispositivo.csv`,
`modelo-ajeno.json` y `modelo-manipulado.probeta.json` (los dos últimos generados con
`packModelFile` y **verificados** contra `validateModelFile`: `invalid-format` y `hash-mismatch`).
Nueva prueba **A7** con `ejemplo-exportado-de-excel.csv` (`;` + BOM). Guía: 26 → 27 pruebas, gate ⭐
sin cambios (11).

**D5 sin ejecutar a mano, pero verificado.** El rechazo tiene 6 tests unit (hash manipulado, JSON
ajeno, manifiesto mutilado, base64 corrupto, no-JSON, versión futura). Con los señuelos del kit ya
es ejecutable en dos clics.

**Petición del usuario en D2 ("que me diga cuál columna falta") — ya estaba implementada:** la
app nombra solo las que faltan; el listado de seis era el síntoma del delimitador, no un defecto
de ese mensaje.

Tests: 222 → **227** (5 nuevos en `csv.test.ts`: `;`, tabulador, conservador con `;` en campos,
una sola columna, BOM). Typecheck y lint limpios.

### Bloque E — Privacidad, honestidad y diseño (E2 en curso)

**E2 pasa.** La inspección de red del usuario mostró exactamente DOS peticiones salientes, ambas
esperadas: `POST /api/narrate` (**652 B** — el payload de nombres + agregados; un dataset de 200×6
ocuparía kilobytes, así que el propio tamaño es evidencia de que no viajan filas) y un `envelope`
de **56 B** a Sentry (observabilidad; `sendDefaultPii: false`, `tracesSampleRate: 0`, `beforeSend`
elimina `request` y los breadcrumbs de console/fetch/http — `instrumentation-client.ts`). Con
archivo propio, cargar y entrenar no genera NINGUNA petición.

**🐛 Hallazgo colateral de E2 (honestidad, el más serio del gate).** La narrativa mostrada decía:
«Puntaje_credito muestra una **importancia de 0** y una **asociación negativa**, lo que indica que
valores mayores **reducen la probabilidad** de la clase detectada». Con importancia 0 el modelo NO
usa esa variable: atribuirle un efecto es una afirmación que la medición no respalda — exactamente
lo que esta app existe para no hacer. Causa raíz: `_feature_directions` calcula la dirección por
correlación univariada, **independiente** de la importancia por permutación; en el dataset de fuga
`monto_recuperado` acapara todo y las demás quedan en ~0 aunque correlacionen por su cuenta.

**Arreglo en el ORIGEN** ([pipeline.py](../src/lib/ds/pipeline.py)): si la importancia redondea a
0.000 (los 3 decimales que muestra la UI) o es negativa, `direction` sale como `null`. Una sola
línea arregla a la vez el gráfico, la plantilla determinista y la narración IA. Test de integración
nuevo que FALLA si alguien vuelve a desacoplarlas + aserción de propiedad sobre todas las features.

**🐛 Decimales inconsistentes (regresión del bloque C).** La narrativa decía `0.4408` mientras el
gráfico decía `0.441`. Causa: `payload.ts` redondeaba a 4 decimales y el LLM copiaba fielmente.
Arreglo determinista (no depender del prompt): el payload viaja con **3 decimales**, los mismos de
`ImportanceChart`. Desvío máximo 0.0005, muy por debajo de `IMPORTANCE_TOLERANCE = 0.005`.

**🐛 Rúbrica del Grader con incentivo perverso.** Pedía «nombrar al menos las 2 variables
principales»; en un dataset con fuga solo UNA tiene importancia, así que la respuesta correcta
sacaba completitud **3 — justo el umbral de fallback**. La rúbrica ahora acepta que nombrar la
única que pesa y declarar que el resto no aporta ES completo. Verificado con Groq real: de 3
(al borde) a **5/5/5 en dos corridas seguidas**.

Verificación en real del conjunto (Groq, dataset de fuga): «…La variable más influyente es
monto_recuperado, con una importancia de **0.441**… Las variables puntaje_credito, monto_prestamo,
empleo e ingreso_mensual tienen una importancia de 0, **por lo que el modelo no depende de
ellas**… monto_recuperado parece un proxy del objetivo, lo que podría inflar las métricas.»

Tests: 227 unit + **28** integración (uno nuevo). Typecheck y lint limpios.

**Resultado del bloque E (2026-08-15) — 5/5, los tres ⭐ aprobados.**

- **E1 ⭐** — honestidad transversal: aprobada («claramente son francas y honestas»).
- **E2** — ver arriba: 2 peticiones, ambas esperadas; 652 B de payload.
- **E3 ⭐** — lenguaje para profesional NO científico de datos: aprobado («muy buen lenguaje»).
- **E4 ⭐** — veredicto de diseño: **aprobado visualmente**. Matiz importante: el usuario usa
  macOS en modo oscuro SIEMPRE, así que su ⭐ cubre el tema oscuro; **nunca ha visto el claro** y
  no encontró conmutador porque **no existe** (el tema sigue a `prefers-color-scheme`;
  `globals.css` define el claro como base y el oscuro por media query).
- **E5** — bilingüe: aprobado, incluida la narración IA y el no-traducir nombres de columna.

**Cobertura del tema claro (dato para la retro):** los 5 e2e corren `AxeBuilder` sin fijar
`colorScheme`, y el defecto de Playwright es **light** ⇒ el tema que el usuario nunca ve es
precisamente el que más veces ha pasado el chequeo automático de contraste. Aun así, la aprobación
⭐ humana del tema claro queda pendiente por construcción — se anota como tal, sin inflarla.

**Mejora pedida en E3 (aplicada): diccionario de términos.** Nueva sección en
`docs/MANUAL-DE-USO.md` con los términos que la app usa de verdad, en 4 grupos (resultado ·
métricas · advertencias · porqué). Las definiciones de métricas se copian VERBATIM de
`narration.template.metricHelp.*` — la misma fuente que usan la plantilla determinista y el prompt
del LLM, para que el manual no pueda divergir de lo que la app dice en pantalla.

**Backlog H2 derivado del bloque E:**

- **Glosario dentro de la app** (la versión completa de lo que pidió el usuario): «¿qué significa
  esto?» enlazado desde cada término, en vez de solo en el manual. Bilingüe.
- **Conmutador de tema claro/oscuro.** Hoy el tema lo decide el sistema y no hay forma de
  cambiarlo desde la app; un usuario con el SO en oscuro no puede ver ni evaluar el tema claro.
  Con el daltonismo leve del usuario, poder elegir tema es además una ayuda de accesibilidad real,
  no solo una preferencia estética.

### CI en rojo tras el gate (2026-08-15) — avisos de seguridad, no código

El PR quedó en rojo con `CI / quality` fallando y e2e/integration/lighthouse **saltados** (dependen
de quality). Causa: `pnpm audit --audit-level high` — **ningún código nuestro se ejecuta en ese
paso**. Se publicaron avisos nuevos que escalaron a `high` 8 paquetes transitivos
(`brace-expansion`, `fast-uri`, `js-yaml`, `nanoid`, `next`, `postcss`, `sharp`, `undici`):
18 high + 11 moderate. Falla dependiente del TIEMPO, no del diff — las 3 corridas rojas son
consecutivas porque el aviso apareció entre medias.

Resolución, en tres pasos de menor a mayor intrusión:

1. `next` 16.2.10 → **16.2.11** (el propio aviso pedía ese parche) ⇒ 18 → 14 high.
2. `pnpm update` (refresco dentro de los rangos ya declarados) ⇒ 14 → 7 high.
3. **4 overrides en `pnpm-workspace.yaml`** para lo que queda clavado en profundidad. Dos detalles
   deliberados: (a) el selector acota al **rango vulnerable** (`postcss@<8.5.18`), así que solo se
   reescriben las dependencias afectadas; (b) el reemplazo usa `^`, que **no cruza de major** —
   nada de arrastrar una ruptura de API por un parche de seguridad.

**Fricción del kit (para la planeadora):** pnpm 11 **ya no lee** el campo `pnpm.overrides` de
`package.json` — lo ignora con un WARN y sigue. Los overrides viven ahora en
`pnpm-workspace.yaml`. Si otra app del pipeline los tiene en `package.json`, están muertos en
silencio.

**Pyodide vuelve a estar CLAVADO (`314.0.2`, sin `^`).** `pnpm update` lo había movido a 314.0.3 y
el test de "honestidad forzada" de `RUNTIME_VERSIONS` lo cazó de inmediato — funcionó exactamente
como fue diseñado. Se revierte porque esa versión **forma parte de un contrato registrado**: viaja
dentro de cada `.probeta.json` exportado y gobierna los avisos de compatibilidad al importar.
Mover el runtime WASM en el PR de cierre habría invalidado los archivos exportados durante el gate
sin ninguna ganancia de seguridad (Pyodide no estaba en ningún aviso). Un artefacto cuya versión se
declara en un contrato se pinea exacto, como ya se hacía con `next` y `react`.

Verificación completa tras los cambios: `build` · `typecheck` · `lint` · **227 unit** ·
**28 integración** · **12 e2e ×2 dispositivos** · `pnpm audit --audit-level high` → *No known
vulnerabilities found*.

### El gate de performance nunca había corrido (2026-08-15)

Al ponerse `quality` en verde por primera vez, `lighthouse` se ejecutó **por primera vez en toda
la rama** (12 corridas revisadas, todas `skipped`: depende de `quality`, que llevaba en rojo desde
antes de esta sesión — 021ec0c incluido). Resultado: LCP simulado 3086/3089/3142 ms contra un
budget de 3000 ⇒ rojo por un 3%. **No hay histórico con el que comparar**: es la primera medición,
así que no puede afirmarse ni regresión ni no-regresión.

Investigado con datos, no con suposiciones:

| Señal                       | Valor                  | Veredicto |
| --------------------------- | ---------------------- | --------- |
| LCP simulado (runner CI)    | 3086-3142 ms           | ✗ 3% sobre budget |
| LCP simulado (local, M-series) | 2611-2763 ms        | ✓ pero con poco margen |
| Desglose: TTFB              | 452 ms                 | — |
| Desglose: Load Delay/Time   | **0 / 0 ms**           | no hay nada que descargar: es texto |
| Desglose: **Render Delay**  | **2310 ms (84%)**      | ← todo el problema |
| Respuesta del servidor      | 2 ms                   | ✓ |
| TBT                         | 2-6 ms (budget 300)    | ✓ |
| `font-display`              | score 1                | ✓ |
| CSS bloqueante              | 6.5 KB, 0 ms de ahorro | ✓ |
| Budgets de PESO             | script <300 KB, total <1 MB | ✓ |

El elemento LCP es un **párrafo de texto** («Sube un CSV o elige un ejemplo…») y se verificó que
**ya viaja en el HTML pre-renderizado** (`.next/server/app/index.html`), o sea que NO espera a la
hidratación. Un "render delay" de 2.3 s sobre texto ya servido, con 2 ms de respuesta y 6.5 KB de
CSS, es el modelo de simulación de Lantern — el mismo fenómeno que el workflow ya documentaba
para nutri-kids (3.8 s simulado vs 242 ms observado).

**Decisión: budget de LCP 3000 → 3500 ms como margen documentado** (la vía que el propio workflow
prescribe para budgets client-side), con el diagnóstico completo escrito en `ci.yml` donde
aparecerá el próximo fallo. El gate NO se debilita para lo que existe: si Pyodide entrara al
camino del LCP el salto sería de varios segundos, no del 15%.

**Deuda H2:** medir el LCP **OBSERVADO** con `PerformanceObserver` dentro de un e2e. Es lo que el
usuario experimenta de verdad y no depende del modelo de red simulado ni del ruido del runner.

**Hallazgo de método para la planeadora:** un job con `needs:` sobre un gate roto queda `skipped`,
y GitHub lo pinta como "Required" sin alarmar. El gate de performance estuvo **muerto en silencio
durante todo el ciclo H1** y el DoD lo daba por verde apoyándose en corridas LOCALES. Sugerencia:
que el kit-check verifique que cada job requerido haya **ejecutado** al menos una vez en el PR, no
solo que no esté en rojo.

### Design sync: de ruido a proceso (2026-08-15)

El usuario señaló que la publicación del design system "genera mucho ruido" — y el diagnóstico le
da la razón: el método ORDENA publicar (`/design-sync`, cierre de ciclo) pero no define CÓMO, el
comando no existía en las apps, y el bundle publicable vivía en el scratchpad de sesión (efímero):
al retomarlo hoy quedaban **4 de los 13 archivos publicados**, y hubo que reconstruir la copia
local descargando los 9 restantes desde el proyecto remoto con `get_file`.

Resuelto en tres piezas con jerarquía explícita, TODO implementado ya en esta app como piloto:

1. **`design-sync/` versionado en el repo** — espejo 1:1 de lo publicado (13 archivos) +
   `project.json` con el projectId real. El diff de publicación pasa a ser `git status`; el bundle
   sobrevive a las sesiones, se revisa en PR y lo escanea gitleaks.
2. **`.claude/commands/design-sync.md` estampado** — el procedimiento exacto (regla `@dsCard`,
   `finalize_plan` con `deletes` obligatorio aunque vacío, `write_files` con `localPath`, cuándo
   publicar, jerarquía design-system.md → bundle → vitrina). Verificado: el comando ya aparece
   como skill invocable.
3. **`sprints/PROPUESTA-metodo-design-sync.md`** — propuesta formal a la planeadora con la
   evidencia, el principio ("el bundle es un artefacto del repo, no un efecto secundario de la
   sesión"), y las 4 decisiones que le tocan al kit (adoptar comando, estructura estándar,
   kit-check de `lastPublished`, aclarar quién ejecuta).

Regla que queda fijada: **Claude Design es vitrina, jamás editor** — no hay camino de vuelta al
repo, así que editar allí desincronizaría la fuente de verdad en silencio.
