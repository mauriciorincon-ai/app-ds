---
sprint: 004
app: ds
status: closed
opened: 2026-07-19
closed: 2026-08-15
branch: sprint-004/sobrevive-datos-reales
pr: https://github.com/mauriciorincon-ai/app-ds/pull/7
---

# Sprint 004 Summary — Probeta DS

## Outcome

**Sí** — Probeta DS deja de asumir datasets de laboratorio: sanea CSVs reales de frente, avisa de
señales de riesgo antes de entrenar y suma boosting compitiendo con el mismo veredicto honesto.
Con este sprint (y el gate ⭐ del usuario) **el ciclo H1 queda completo**.

**Matiz honesto (auditoría de cierre 2026-07-20):** O2 se entregó como EDA de ALERTAS; la vista
de distribuciones/correlaciones que el outcome enunciaba se recortó (todas las acceptance
criteria formales sí pasan). Desviación registrada en la bitácora; la vista queda como deuda.

## Qué se construyó

- **Saneamiento en dos capas** (ADR-008): estructural pre-split en TS (`engine/sanitize.ts` — dedup
  de filas exactas que _previene_ fuga por duplicación, exclusión de ID exacta [solo no-numéricas]
  y constantes, coerción de numéricas mixtas, todo con conteos) + estadístico DENTRO del pipeline
  retenido (`OneHotEncoder(min_frequency=2)` aprendido SOLO de train — extensión literal del
  ADR-002, con su test-que-falla).
- **EDA mínima con alertas honestas** (`engine/eda.ts`): posible fuga (aviso exploratorio
  pre-split), casi-identificador (id-like), desbalance — tipo separado de la heurística de fuga.
- **Boosting multi-candidato**: `HistGradientBoosting` compite con Random Forest bajo el MISMO
  preprocesador y el MISMO veredicto; gana el mejor en la métrica primaria (regla simétrica que
  vive solo en `verdict.ts`); ResultsScreen muestra a ambos y marca al ganador, sin selector.
- **UI**: ConfigScreen extendida (informe de saneamiento + alertas EDA `role="status"` + fix axe de
  la preview), StartScreen con 4º ejemplo (`clientes-sucio.csv`), ResultsScreen con candidatos,
  model card con sección de saneamiento + modelo parametrizado. Bilingüe ES/EN.
- **Narración extendida al informe EDA** (única IA): bloque `eda` opcional en el payload — omitido
  si el dataset está limpio ⇒ payload byte-idéntico al de S3 (privacidad no-regresión); frases EDA
  deterministas en la plantilla; `verify.ts` sin cambios; zod sigue server-side.
- **Export/import**: campos aditivos opcionales `model_name` + `sanitation` en el manifiesto — sin
  bump de `format_version` (revisión de ADR-007), compat S3↔S4 con tests.
- **Cierre de ciclo**: `docs/BLUEPRINT.html` (as-built), `docs/GUIA-DE-PRUEBA.html` v1 acumulativa
  S1–S4, `docs/kit-de-prueba/`, MANUAL al día, deltas del kit v1.6.2→v1.7.3 aplicados al repo.

## DoD — checklist (los 6+1)

- **Testing ✅** — unit 215 · integración 24 (Pyodide) · e2e 12 ×2 devices · engine >80% agregado
  (96.6%); el test-que-falla del saneamiento anti-fuga verde.
- **CI/CD ✅** — typecheck·lint·build·audit locales verdes; sin jobs nuevos (ruleset intacta).
- **Observabilidad ✅** — metadata-only; costo de narración con Pino; Sentry inerte sin DSN; cero
  contenido del dataset en logs.
- **Seguridad ✅** — doble gitleaks vivo (carnada partida armada solo en su test); `audit --audit-level
high` exit 0; sin secretos en el diff.
- **Performance ✅** — script de la landing 282KB < 300KB (zod server-side; sanitize/eda TS puro);
  Pyodide bajo demanda, fuera del LCP.
- **UX+A11y ✅** — axe limpio en e2e (3 flujos); región de preview enfocable (deuda ConfigScreen
  pagada); alertas con símbolo+texto; `role="status"`. Aprobación visual = **gate ⭐ del usuario**.
- **IA embebida responsable ✅** — mismo adapter/verificación/opt-in; `.strict()` en el schema;
  bloque eda a mano; fallback determinista anunciado.

## Métricas técnicas

- `HistGradientBoosting{Classifier,Regressor}` disponible en el runtime real (verificado) ⇒
  boosting sin fallback.
- CSV sucio (`clientes-sucio.csv`) entrena sin romper, con reporte de acciones y conteos (10
  duplicadas, 2 columnas excluidas, coerción de `edad`); dataset limpio = "nada que sanear".
- Alerta de posible fuga detecta el caso plantado (`credito-fuga-plantada.csv`) y calla en los
  limpios.
- `export→import→rescore` idéntico con HGB retenido; `format_version` sigue en 1.
- Cobertura total 90.8% stmts / 85.4% branch.

## Decisiones no anticipadas

- **ADR-008** — boosting multi-candidato + saneamiento en dos capas (estructural pre-split en TS +
  estadístico in-pipeline train-only); HGB sin modo NaN-nativo en H1 (un solo camino de
  preprocesamiento); scoring NO re-sanea (columnas excluidas = extras ignorados por el schema).
- **ADR-007 (revisión)** — campos de manifiesto aditivo-opcionales NO suben `format_version`; solo
  un cambio de claves del payload o del manifiesto lo haría.

## Bugs + resoluciones

- **ID numérica mal excluida** — el rule de exclusión de ID atrapaba columnas numéricas de baja
  cardinalidad (feature continua ≠ identificador). Fix: exclusión de ID solo para columnas NO
  numéricas; la casi-ID numérica la señala la EDA como `id-like`, no la excluye sanitize.
- **id-like sobre feature numérica** — la alerta EDA `id-like` marcaba `ingreso` (alta cardinalidad
  natural). Fix: `id-like` limitado a columnas no numéricas (coherente con sanitize).
- **Sanity S3 asumía forest (regla 9)** — con multi-candidato + un test de 2 filas, HGB
  (min_samples_leaf=20) ganaba por AUC degenerada y predecía distinto. Fix: dataset propio separable
  (60 filas) donde ambos candidatos aprenden; la intención (scoring correcto) queda robusta al
  ganador.
- **Fricción de entorno (no de producto)** — un `next-server` viejo (pre-F3) en :3000 hacía que
  Playwright reusara código estancado; se detuvo y con server fresco pasó. `lhci autorun` local
  falló en el healthcheck del entorno; se midió el gate crítico (script gzip) a mano.
- **Auditoría final pre-cierre (2026-07-20)** — 0 Críticos, 7 Altos, todos corregidos o
  documentados antes del gate ⭐: worker sin manejo de muerte (UI colgada) → `worker-dead` +
  re-spawn; perímetro del import (CSP + cotejo esquema pickle↔manifiesto + tope 100 MB); gate
  gitleaks mortal en clon nuevo → script `prepare` real + gitleaks en CI; costo LLM loggeado en
  US$0 → precio del modelo real + test; divergencia de nulos/trim TS↔Python ("si "≠"si" ⇒ el
  export se rechazaba a sí mismo) → paridad espejada + tripwire; inyección de prompt vía nombres
  de columna → prompt endurecido + residuo documentado (ADR-005/006); recorte de O2 registrado.
  Detalle y backlog de Medios/Bajos: bitácora § "Auditoría final pre-cierre".

## Gate ⭐ del usuario — cierre del ciclo H1 (2026-07-20 → 2026-08-15)

Ejecutado **bloque a bloque** por decisión del usuario ("para no tener un listado largo de ajustes
acumulados"), con corrección en caliente entre bloques. **Los 11 ⭐ aprobados**; 27 pruebas en la
guía (26 + A7 creada durante el propio gate). Modalidad recomendada para futuros cierres: el ciclo
corto encontrar → arreglar → re-verificar detectó defectos que un pase único habría enterrado.

Lo que el gate cambió en el producto (detalle en la bitácora § "Gate ⭐"):

- **A** — iconos en todos los botones de acción y **verde evidente** en los estados limpios
  (daltonismo leve del usuario: el verde sutil no comunicaba "todo bien"). Restricción de diseño
  permanente, no un ajuste puntual.
- **B** — el veredicto **nombra al ganador** y los candidatos pasaron de lista a **tabla
  comparativa completa** de las 5 métricas de ambos.
- **C** — la narración IA pasó de consentimiento recordado a **acción por petición** (más estricta
  que el opt-in anterior; `ConsentPanel` y `useConsent` eliminados), prompt reescrito separando
  prosa y claims, y **un bug real solo visible contra Groq**: `direction: null` en el payload vs.
  el esquema de claims ⇒ Groq rechazaba la generación entera ⇒ **fallback silencioso**.
- **D** — 🐛 **el CSV exportado de Excel en español**: separado por `;`, ninguna columna se
  reconocía y la app respondía "faltan las 6". Ahora nombra el separador real. Es el hallazgo más
  alineado con la tesis del sprint: el público objetivo NO es técnico y su hoja de cálculo produce
  exactamente eso.
- **E** — 🐛 **honestidad**: la narrativa afirmaba "importancia de 0 y asociación negativa ⇒
  valores mayores reducen la probabilidad". Con importancia 0 el modelo no usa la variable;
  atribuirle un efecto es justo lo que esta app existe para no hacer. Arreglado en el origen
  (una línea en `pipeline.py` cubre gráfico, plantilla y narración). Además, la rúbrica del Grader
  penalizaba la respuesta correcta en datasets con fuga hasta el umbral de fallback.

**Matiz honesto sobre E4 (veredicto de diseño):** el usuario trabaja SIEMPRE en modo oscuro, así
que su ⭐ cubre el tema oscuro. **Nunca ha visto el claro** y no hay conmutador (el tema sigue a
`prefers-color-scheme`). El tema claro sí está cubierto por máquina —los 5 e2e corren `AxeBuilder`
y Playwright usa `light` por defecto—, pero la aprobación humana del tema claro **queda pendiente
por construcción** y se declara como tal en vez de darla por hecha.

## Qué salió bien / qué generó fricción

- **Bien:** la simetría de `pickPrimaryMetric` evitó duplicar la regla de métrica en Python; el
  "limpio ⇒ byte-idéntico" mantuvo intactos los e2e de privacidad/conteos de S1–S3; el CSV sucio
  como generador determinista dio una regresión sólida del saneamiento.
- **Fricción:** `docs/kit-de-prueba/` no existía pese a que la orden lo asumía (desviación
  registrada); el healthcheck de `lhci` en este entorno no levantó (se midió el budget a mano).

## Sugerencias de mejora al método

- La orden asumió `docs/kit-de-prueba/` "ya existe" para todas las apps; para ds era la primera vez.
  Sugerencia: el kit-check de la plantilla de orden podría verificar la EXISTENCIA de
  `docs/kit-de-prueba/` (no solo su contenido) antes de referenciarlo como input.
- `/design-sync` no está estampada como skill/comando en las apps ds; el tool DesignSync sí existe.
  Sugerencia: estampar el comando `/design-sync` (o documentar que la publicación del cierre la
  ejecuta el usuario) para que el builder no lo confunda con un paso automatizable.

## Deuda técnica aceptada

- **postcss moderate transitiva** — `audit` reporta 1 moderate; no bloquea `--audit-level high`. Se
  paga con el bump aguas arriba (declarada desde antes).
- **`sanitation` en el manifiesto sin validación estructural estricta** — se lee de forma tolerante
  (aditivo-opcional); si algún día se consume críticamente, añadir su type-guard. Sprint de pago: al
  usar el campo más allá del resumen de importación.
- **Publicación del design system + gate ⭐** — pasos interactivos del usuario (no diferidos a otro
  sprint: son el cierre de ESTE ciclo; el momento lo elige el usuario — enmienda F0 #6).
- **Vista EDA de distribuciones/correlaciones (recorte de O2)** — solo alertas en H1; la vista
  exploratoria general es candidata a H2 (desviación en bitácora, auditoría de cierre).
- **Residuo de inyección de prompt** — verify.ts no acota frases que no citan features; mitigado
  (prompt endurecido, nombres = datos) y documentado en ADR-005; regla de verificación extra si
  el escenario "dataset de terceros" se vuelve real (H2).
- **Backlog de la auditoría de cierre (Medios/Bajos)** — listado completo en la bitácora
  § "Auditoría final pre-cierre"; los de producto (headers duplicados, casi-ID como falsa fuga,
  objetivo nulo silencioso, matriz 0/1, foco entre pantallas) son insumo del plan H2.
- **Soporte completo de CSV europeo** — S4 detecta y BLOQUEA el `;` nombrándolo; leerlo de verdad
  exige además reinterpretar los decimales por coma y preservar la fidelidad del original al
  descargar. Se prefirió el bloqueo honesto a una lectura adivinada que convertiría columnas
  numéricas en categorías **sin avisar** (regla dura 3). Sprint de pago: H2.
- **Conmutador de tema claro/oscuro** — hoy lo decide el sistema y no hay override; un usuario con
  el SO en oscuro no puede ver ni juzgar el tema claro. Con el daltonismo leve del usuario, elegir
  tema es ayuda de accesibilidad real, no preferencia estética. H2.
- **Glosario dentro de la app** — pedido en E3 y entregado en `docs/MANUAL-DE-USO.md`; la versión
  in-app ("¿qué significa esto?" enlazado desde cada término, bilingüe) queda para H2.

## Propuesta mayor para H2 (surgida del gate)

`sprints/H2-PROPUESTA-liga-honesta.md` — ampliar de 4 a ~11 modelos **sin perder la garantía**.
Hallazgo: lo escaso no es el número de modelos sino **las decisiones tomadas sobre el test**;
moviendo la selección a validación cruzada dentro de train, N deja de estar acotado por la
estadística. Incluye la corrección del matiz de A4 ya acordado y deja explícita una **decisión de
producto para la planeadora**: acerca la app al terreno del AutoML del que la constitución se
distancia. Recomendación de secuencia H2: liga honesta → A5 → A1 → regresión → A4/A3.

## Archivos clave (máx. 10)

1. `src/engine/sanitize.ts` — saneamiento estructural pre-split.
2. `src/engine/eda.ts` — alertas EDA honestas.
3. `src/lib/ds/pipeline.py` — multi-candidato + `min_frequency` in-pipeline.
4. `src/lib/experiment.ts` — `primary_metric` simétrica + candidatos.
5. `src/lib/model-file.ts` — campos aditivos opcionales (ADR-007 rev).
6. `src/components/ConfigScreen.tsx` — informe de saneamiento + alertas + fix axe.
7. `src/lib/narration/payload.ts` — bloque `eda` opcional (byte-idéntico si limpio).
8. `scripts/make-example-datasets.mjs` — generador del CSV sucio (fuente única).
9. `decisions/008-boosting-and-two-layer-sanitization.md` — ADR del sprint.
10. `docs/GUIA-DE-PRUEBA.html` — guía v1 acumulativa (gate ⭐).

## Cómo probar

1. `pnpm test` (**227**) · `pnpm test:integration` (**28**) · `pnpm test:e2e` (12 ×2 devices) ·
   `pnpm typecheck` · `pnpm lint` — todo verde (re-corrido tras el gate ⭐, 2026-08-15).
2. Manual con la guía (`docs/GUIA-DE-PRUEBA.html`, filtro ⭐): cargar `clientes-sucio.csv` → informe
   de saneamiento → alerta de desbalance en `contrato` → entrenar → veredicto con candidatos →
   exportar → recargar → importar → puntuar. Cargar marketing → "nada que sanear" y flujo idéntico.
3. `node scripts/make-example-datasets.mjs` regenera los CSV de forma determinista.
