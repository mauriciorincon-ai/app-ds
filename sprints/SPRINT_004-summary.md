---
sprint: 004
app: ds
status: closed
opened: 2026-07-19
closed: 2026-07-19
branch: sprint-004/sobrevive-datos-reales
pr: https://github.com/mauriciorincon-ai/app-ds/pull/7
---

# Sprint 004 Summary — Probeta DS

## Outcome

**Sí** — Probeta DS deja de asumir datasets de laboratorio: sanea CSVs reales de frente, avisa de
señales de riesgo antes de entrenar y suma boosting compitiendo con el mismo veredicto honesto.
Con este sprint (y el gate ⭐ del usuario) **el ciclo H1 queda completo**.

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

1. `pnpm test` (215) · `pnpm test:integration` (24) · `pnpm test:e2e` (12 ×2 devices) · `pnpm
typecheck` · `pnpm lint` — todo verde.
2. Manual con la guía (`docs/GUIA-DE-PRUEBA.html`, filtro ⭐): cargar `clientes-sucio.csv` → informe
   de saneamiento → alerta de desbalance en `contrato` → entrenar → veredicto con candidatos →
   exportar → recargar → importar → puntuar. Cargar marketing → "nada que sanear" y flujo idéntico.
3. `node scripts/make-example-datasets.mjs` regenera los CSV de forma determinista.
