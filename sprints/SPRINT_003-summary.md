---
sprint: 003
app: ds
status: closed
opened: 2026-07-11
closed: 2026-07-11
branch: sprint-003/modelo-se-usa
pr: https://github.com/mauriciorincon-ai/app-ds/pull/6
---

# Sprint 003 Summary — Probeta DS

## Outcome

**Sí (los 2).** Outcome 1: tras entrenar (o importar), el usuario sube un CSV nuevo sin el
objetivo y recibe predicciones con la etiqueta original + probabilidad por fila, precedidas del
chequeo honesto de esquema y del panel de novedad, con descarga del CSV puntuado. Outcome 2: el
modelo se exporta como `.probeta.json` con manifiesto honesto (hash validado ANTES de
deserializar) y se re-importa en sesión nueva —incluso tras recargar la página— quedando listo
para puntuar sin re-entrenar. Todo client-side; los e2e vigilan que ninguna petición lleve datos.

## Qué se construyó

- **Pantalla "Usar el modelo"** (`ScoreScreen`, fase `scoring` de la máquina de estados): estados
  vacío (dropzone + columnas requeridas) · bloqueo por esquema (faltantes nombradas EXACTAS) ·
  avisos (extra/objetivo ignorados) · **panel de novedad** (conteos por columna de categorías
  nunca vistas y numéricos fuera del rango de TRAIN + "adivinando en N% de tus filas", símbolo +
  texto) · resultados (distribución, preview, descarga) · error. Encabezado LCP estático.
- **Export en Resultados**: botón con estados listo/exportando/error + microcopy honesto de
  contenido; archivo único `modelo-<slug>-<fecha>.probeta.json` = manifiesto (esquema,
  training_profile, métricas test, veredicto, fugas, versiones, SHA-256) + payload
  pickle(5)+zlib+base64.
- **Import en la pantalla inicial**: validación TS pura (forma → versión de formato → hash) SIN
  tocar el payload; resumen honesto del manifiesto; advertencia franca de versión; rechazo claro
  por kind; luego restaura en el worker y va directo a puntuar.
- **Motores**: `pipeline.py` retiene `_MODEL` (pipe + schema + training_profile solo-train) y suma
  `score_new_data`/`export_model`/`import_model`; TS puros `schema-check`, `model-file`
  (manifiesto+hash, validación estructural), `scored-csv` (RFC-4180, sufijo determinista),
  `files` (slug + descarga Blob compartida). Worker protocol con union discriminado
  (`train|score|export-model|import-model`) y mapa de pendientes por id; runner cachea la promesa
  del runtime (sin doble carga de Pyodide).
- i18n ES/EN completo en el mismo paso; manual de uso; design-system.md con los componentes S3.

## DoD — checklist

- ✅ **Testing** — unit **179/179** (motores S3 con umbral 80% por archivo en vitest.config) ·
  integración Pyodide **15/15** en `scoring.test.ts` nuevo (novedad plantada contada · perfil
  SOLO-train · etiquetas originales string · export→import→**predicciones idénticas** ·
  `RUNTIME_VERSIONS` contra el runtime real · no-model) con `pipeline.test.ts` S1/S2 **sin
  modificar** · e2e **10/10** ×2 devices (2 specs nuevos + los 3 previos intactos). Todo en CI.
- ✅ **CI/CD** — jobs quality/integration/e2e/lighthouse verdes en el PR (verificar en GitHub);
  preview Vercel **pendiente de prueba manual del usuario** (gate del merge, no del código).
- ✅ **Observabilidad** — `reportScoringError` (kind + filas/columnas), `reportExportError`,
  `reportImportError` (kind del rechazo) — metadata-only, jamás nombres de columnas ni valores.
- ✅ **Seguridad** — `pnpm audit --audit-level high` exit 0 (queda 1 moderate preexistente) ·
  gitleaks sin hallazgos en los commits del branch · **manifiesto + SHA-256 validados ANTES de
  deserializar** (y defensa Python detrás) · microcopy "solo archivos de Probeta" · riesgo pickle
  explícito en ADR-007.
- ✅ **Performance** — Lighthouse local contra `perf-budget.json` **verde tras corrección**:
  zod en el bundle cliente rompía el budget de script (315KB > 300KB) y el LCP simulado; se
  reemplazó por validación estructural TS pura. Budget sin renegociar; `lighthouse-urls.json` sin
  cambios (no hay ruta nueva: la pantalla vive en `/` por estado).
- ✅ **UX/A11y** — axe limpio ×2 devices en las pantallas nuevas (fix real: región scrolleable de
  la preview con foco de teclado) · dropzone e import operables por teclado · avisos con símbolo +
  texto · táctil ≥44px · paridad ES/EN (test).
- ✅ **IA embebida** — N/A este sprint (cero superficie LLM nueva; `fallback-sin-consentimiento` y
  `why-modelcard` siguen verdes sin tocarse).
- ✅ **Manual de uso** — sección "El modelo se usa": puntuar, leer la novedad, export/import, qué
  contiene el archivo (y qué no), límites honestos.
- ⚠️ **Revisión de diseño** — construido fiel a `design-system.md` (componentes S3 documentados);
  **checklist `diseno-ui` + aprobación visual del usuario sobre la preview: PENDIENTE** (bloquea
  el merge, es el paso manual del usuario).

## Métricas técnicas

- Export→import→predicciones y probabilidades **idénticas** (integración, floats exactos). ✅
- Novedad plantada: conteos por columna exactos + filas afectadas (integración y e2e). ✅
- Cero peticiones de red con contenido del CSV nuevo o del payload del modelo (e2e, patrón S2). ✅
- Bloqueo por faltantes sin postear al worker (unit del hook: el mensaje nunca sale). ✅
- Lighthouse dentro de `perf-budget.json` sin renegociar. ✅

## Decisiones no anticipadas

- **ADR-007 — Model export/import format**: skl2onnx NO carga en Pyodide (sin wheel emscripten
  para onnx; error literal en la bitácora) → pickle protocolo 5 + zlib + base64 en un
  `.probeta.json` con manifiesto y hash validados antes de deserializar; ONNX se re-evalúa en H2.
- (implementación) El payload picklea `{pipe, schema, training_profile}` completo → `import_model`
  solo necesita `payload_b64` y el scoring no depende de campos del manifiesto (que queda como
  cara humana + integridad). `PipelineResult` solo ganó `classes`; `pipeline.test.ts` intacto.
- (implementación) Validación del manifiesto **a mano en TS puro**, no zod: zod en el bundle
  cliente rompía el budget de 300KB (lección S2 reafirmada: zod vive del lado servidor).

## Bugs + resoluciones

- axe `scrollable-region-focusable` en la preview del CSV puntuado → contenedor con
  `role="region"` + `tabIndex=0` + aria-label. (Ojo: `ConfigScreen` tiene el mismo patrón sin
  foco y nunca pasó por axe — candidato a pagar en S4.)
- Strict mode de Playwright: el route announcer de Next expone `role="alert"` → los selectores de
  alertas filtran por texto.
- Budget de performance roto por zod (ver arriba) — detectado corriendo Lighthouse local ANTES del
  PR, no en CI.

## Qué salió bien / qué generó fricción

**Bien:** spike primero (45 min, respuesta definitiva); motores TS puros con tests antes de la UI
(la integración Pyodide pasó a la primera); el mapa de pendientes por id simplificó el hook;
correr Lighthouse local antes del PR atrapó el budget roto sin quemar ciclos de CI.

**Fricción:** (1) la clase positiva de `marketing-campania.csv` es «0» (85 vs 115) — la lección D1
volvió a pagar: verificar contra el CSV real, no asumir; (2) jsdom sin `crypto.subtle` (polyfill
guardado en `tests/setup.ts`); (3) Playwright sin navegadores instalados en esta máquina
(`playwright install chromium`) y lhci local necesita `CHROME_PATH` apuntando al Chromium de
Playwright.

**Fricciones de kit v1.2.0: 1** — **K12: `githooks/pre-commit` estampado sin bit de ejecución
(100644) y `core.hooksPath` sin aplicar en el clon ⇒ el gate local de gitleaks nunca corrió
(S1–S3), silenciosamente.** Corregido aquí (`chmod +x` commiteado + config local + scan manual
limpio del branch). Propuesta al kit: estampar 100755 y aplicar `core.hooksPath` en el setup.

## Sugerencias de mejora al método

- La lección S2 "zod fuera del bundle cliente" merece promoverse a patrón wiki (2ª ocurrencia de
  presión sobre el budget por validación client-side).
- El patrón `lcp-nace-estatico` podría ampliarse con "toda región scrolleable nace enfocable"
  (axe `scrollable-region-focusable`) — apareció aquí y el patrón previo de ConfigScreen lo tenía
  latente.

## Deuda técnica aceptada

- `ConfigScreen` tiene una región scrolleable sin foco de teclado (mismo hallazgo axe de esta
  pantalla, nunca escaneada por e2e). Pago propuesto: S4 (una línea + spec).
- El archivo exportado no está cifrado ni firmado (integridad sí, autenticidad no) — aceptado para
  H1 (archivo local del usuario); re-evaluar con el deploy público H2 (ADR-007).

## Archivos clave (máx. 10)

1. `src/lib/ds/pipeline.py` — `_MODEL` + score/export/import + training_profile solo-train
2. `src/lib/model-file.ts` — manifiesto: pack/validate/hash ANTES de deserializar
3. `src/lib/ds/schema-check.ts` — bloqueo honesto de esquema (TS puro, pre-worker)
4. `src/lib/scored-csv.ts` — CSV puntuado RFC-4180 + sufijo determinista
5. `src/lib/useExperiment.ts` — fase `scoring`, mapa de pendientes, acciones S3
6. `src/components/ScoreScreen.tsx` — pantalla "Usar el modelo" (4 estados + preparación)
7. `src/workers/protocol.ts` + `public/pyodide-runner.js` — union de comandos + promesa cacheada
8. `src/components/StartScreen.tsx` — import con resumen del manifiesto
9. `tests/integration/scoring.test.ts` — garantías del sprint en Pyodide real
10. `tests/e2e/export-import-rescore.spec.ts` — sobrevive a la pestaña, sin payload en la red

## Cómo probar

1. `pnpm dev` → entrenar `marketing-campania.csv` (objetivo `convirtio`) → "Usar el modelo" →
   subir un CSV con las 6 columnas (sin `convirtio`); plantar una categoría nueva en
   `dispositivo` para ver el panel de novedad → descargar el CSV puntuado.
2. En Resultados → "Exportar modelo" → **recargar la página** → "Cargar modelo guardado" con el
   archivo → revisar el resumen → "Usar este modelo" → puntuar sin re-entrenar.
3. DevTools/Network durante todo el flujo: cero peticiones con contenido (solo assets same-origin).
4. Suites: `pnpm test` · `pnpm test:integration` · `pnpm test:e2e`.
