# Bitácora de implementación — Sprint 002: El porqué, contado honesto

> App: **Probeta DS** (ds) · Branch: `sprint-002/porque-honesto` · Abierta: 2026-07-09
> Documento **vivo** (escritor único: este repo). La planeadora lo lee para la retrospectiva.
> Español en la bitácora; inglés en código/commits/ADRs.

## Estado por fase

- [ ] **Fase 0 — Setup** (branch · bitácora · `.env.example` · verificación de supuestos del kit)
- [x] Fase 1a — Spike explicabilidad (¿`shap` en Pyodide?) → ADR + `pipeline.py` + integración
- [x] Fase 1b — Motores TS (payload de narración · verificador · plantillas · model card)
- [x] Fase 1c — Adapter IA (`lib/ia/`) + route `/api/narrate` + ADRs proveedor/privacidad
- [x] Fase 2 — UI ("¿Por qué?" · consentimiento · model card) + i18n + tests de componentes
- [x] Fase 3 — e2e (happy + fallback) + observabilidad server-side + manual
- [x] Fase 4 — Calidad / cierre (`/deploy-check` + summary + PR)

## Verificación de supuestos del kit (fricciones K#)

Auditoría completa del repo hecha justo antes de abrir el sprint (2026-07-09, post-merge del S1):
typecheck · lint · 62 unit (cobertura 82.7%, engine ~100%) · 2 integración · 2 e2e · audit — todo
verde sobre `main`. Los supuestos de la orden existen de verdad: configs de test (unit/integration/
playwright), Sentry client-only con scrubber, `copy-pyodide.mjs` en predev/prebuild, i18n con test
de paridad. **Sin fricciones nuevas de kit al arrancar** (numeración continúa en K13 si aparecen).

| #   | Hallazgo                                   | Estado |
| --- | ------------------------------------------ | ------ |
| —   | (sin fricciones nuevas al abrir el sprint) | —      |

## Desviación del plan

- **D1 (aclaración, no cambio de alcance):** el acceptance criteria de la orden dice que en
  `marketing-campania` deben quedar arriba "`canal`/`dispositivo`" — pero el dataset real no tiene
  columna `canal` (el término venía del texto de la bitácora S1 "interacción canal×dispositivo").
  La señal real del generador es **`dispositivo` × (`visitas_web` | `correos_abiertos`)**. El
  sanity empírico afirma esas columnas reales. Avisado al usuario.

## Deuda S1 que este sprint paga (declarada en SPRINT_001-summary.md)

- **Pino sin usar** → entra en `lib/ia/cost.ts` (log estructurado de costo en el route, primera
  superficie server-side).
- **Cobertura unit de la capa UI** → tests de componentes con Testing Library en Fase 2.

## Log

### Fase 0 — Setup (2026-07-09)

- PR #2 (ajustes post-cierre S1) mergeado; branch `sprint-002/porque-honesto` creado desde `main`
  actualizado (`a8053fb`).
- Bitácora creada. `.env.example` ampliado con las env vars de narración (`NARRATION_PROVIDER`,
  `NARRATION_ENABLED`, `GROQ_API_KEY` — server-only, sin `NEXT_PUBLIC_`).
- Verificación de supuestos del kit: ver tabla arriba (todo verde, sin fricciones nuevas).
- Commit: `64b6812`. **Fase 0 CERRADA.**

### Fase 1a — Spike explicabilidad + pipeline (2026-07-09) ✅

- **Spike (riesgo #1): `shap` NO carga en Pyodide.** No está en el repo oficial
  (`loadPackage("shap")` → "No known package") y micropip no resuelve su cierre de dependencias
  (numba/llvmlite sin wheels emscripten). Decisión: **`permutation_importance` sobre test**
  (sklearn ya presente, modelo-agnóstica, defendible) → **ADR-004**.
- `pipeline.py`: AÑADIDO (sin refactor del núcleo anti-fuga) `_explainability` — permutation
  importance sobre test (scoring `roc_auc`, `n_repeats=10`, seeded) + `_feature_directions`
  (dirección = signo de la asociación punto-biserial sobre test; solo numéricas — las categóricas
  no tienen dirección única y se dice honestamente). Nuevo campo `explainability` en el JSON.
- **Integración: 5/5 verdes a la primera** — los 2 tests anti-fuga del S1 intactos + 3 nuevos:
  forma/orden descendente, sanity de marketing (señal real arriba: `dispositivo` +
  `visitas_web`/`correos_abiertos`; ruido nunca primero) y sanity de fuga (`monto_recuperado`
  domina con >2× la segunda). Los tests reusan la orquestación de producción
  (`parseCsvWithLimits` + `prepareRun`) sobre los CSV reales empaquetados.

### Fase 1b — Motores puros TS (2026-07-09) ✅

- `lib/ia/schemas.ts` — contratos Zod de TODO el flujo (payload cerrado, claims del Narrator,
  Grader, request/response del route). El payload lleva SOLO metadatos agregados — ni filas ni la
  etiqueta de clase positiva (es un valor de celda).
- `lib/narration/payload.ts` — ensamblador; **test-garantía: cero valores de filas** en el payload
  serializado. `verify.ts` — verificación determinista estilo Explingo (variable inexistente,
  dirección falsa, cifra fuera de ε, mención sin claim ⇒ rechazo). `templates.ts` — plantilla
  determinista ES/EN (fallback universal). `lib/modelcard.ts` — model card markdown determinista.
- i18n: `translate()` puro extraído del provider React (los motores comparten diccionarios; la
  paridad sigue cubriendo TODO el copy). 86 unit verdes.

### Fase 1c — Adapter IA + route (2026-07-09) ✅

- **`ai` 7.0.18 + `@ai-sdk/groq` 4.0.6** instalados (decisión ADR-005, aprobada en el plan).
- `lib/ia/client.ts` — único punto de llamada LLM: `generateObject` + schema Zod, maxOutputTokens
  400/150, timeout 10 s, **cero retries**; Narrator `llama-3.3-70b-versatile`, Grader
  `llama-3.1-8b-instant`; proveedor por env. `mock.ts` — proveedor de CI (éxito · mentiroso ·
  caído). `guardrails.ts` — Zod **`.strict()`** (clave desconocida ⇒ rechazo total, no strip),
  kill-switch, rate limit ventana deslizante (10/min/IP), umbral del Grader. `cost.ts` — log Pino
  por request (modelo/tokens/USD, sin nombres de columnas) — **paga la deuda S1 "Pino sin usar"**.
- `app/api/narrate/route.ts` — primera superficie server-side: kill-switch → proveedor → rate
  limit → Zod → Narrator → **verificación determinista** → Grader → verified/fallback. Nada se
  persiste; cualquier fallo ⇒ plantilla.
- **ADR-005** (Groq + precios verificados 2026-07-09: 70B $0.59/$0.79, 8B $0.05/$0.08 por M
  tokens, free tier sin tarjeta) y **ADR-006** (privacidad: qué viaja con opt-in, qué jamás, tres
  capas de garantía).
- **Hallazgo de diseño:** Zod por defecto _ignora_ claves desconocidas — para vocabulario cerrado
  se necesita `.strict()` explícito (un payload con `rows` colado ahora RECHAZA la petición).
  Detectado por el propio test del guardrail.
- **101 unit verdes** (route completo con mock: los 3 escenarios + rate limit + kill-switch).

### Fase 2 — UI (2026-07-09)

- **3 superficies nuevas** sobre el design-system existente (extensión documentada en
  `design-system.md § Añadidos Sprint 002`, mismos tokens): `WhySection` (barras CSS puras con
  dirección símbolo+texto, badge "✓ verificada" vs "Texto estándar", `aria-live` en el estado),
  `ConsentPanel` (opt-in honesto, default OFF, localStorage) y `ModelCardView` (descarga .md por
  Blob + vista previa plegable). `ResultsScreen` las integra bajo el fold; landing intacta.
- `useConsent` (useSyncExternalStore) + `useNarration` (sin consentimiento ⇒ plantilla local con
  CERO red; con consentimiento ⇒ route con fallback SIEMPRE). `useExperiment` expone `runMeta`.
- Microcopy ES/EN completo en el mismo paso (paridad verde).
- **Deuda S1 pagada:** componentes y hooks medidos con Testing Library — componentes 72%
  (regla UI >50% ✓), `useExperiment` 88% (Worker stub), global 92%. **120 unit verdes.**
- **Bug propio (fricción de RTL):** sin `globals: true`, Testing Library no registra su
  auto-cleanup y los renders se acumulan entre tests → cleanup manual en `tests/setup.ts`.
- **Bug propio (e2e estricto):** la vista previa de la model card (el `<pre>` con TODO el
  markdown) vivía en el DOM aunque el `<details>` estuviera cerrado → duplicaba títulos de la
  pantalla y rompía el modo estricto de Playwright (incluido el spec S1). Arreglo: el contenido
  se monta solo al abrir.
- Gate visual: PENDIENTE de aprobación del usuario (galería sobre la app real al cierre).

## Fase 3 — Integración + e2e + observabilidad (en curso)

- **2 e2e nuevos** (×2 dispositivos): `why-modelcard.spec` — entrenar → porqué → opt-in →
  narración VERIFICADA (route real con mock) → descarga real de la model card + **inspección de
  la request**: sin `"rows"`, sin valores de celdas (`6089`, `escritorio`), CON nombres de
  columnas (lo consentido) + axe de la pantalla completa. `fallback-sin-consentimiento.spec` —
  plantilla visible + **cero peticiones** a `/api/narrate`.
- `playwright.config`: el webServer corre con `NARRATION_ENABLED=true` + `NARRATION_PROVIDER=mock`.
- **Sentry server-side** (`instrumentation.ts` + `sentry.server.config.ts`): mismo contrato de
  privacidad que el cliente — `beforeSend` elimina la request entera (el body del route contiene
  nombres de columnas), sin PII, sin tracing; no inicializa sin DSN (CI limpio).
- **Manual de uso** actualizado (el porqué, el badge de verificación, privacidad de la narración,
  la model card, limitaciones S2) + 2 FAQs nuevas.
- **Bugs de e2e encontrados y resueltos:** (1) la vista previa de la model card duplicaba títulos
  en el DOM (modo estricto de Playwright) → el `<pre>` se monta solo al abrir; (2) `getByText` de
  Playwright es case-insensitive → "Texto estándar" chocaba con la nota del consentimiento →
  match exacto. **6/6 e2e verdes** (~51 s la suite completa).

**Fase 3 CERRADA.**

## Gate de diseño (2026-07-09) — ✅ APROBADO

**La auto-auditoría sobre la app real encontró y corrigió un bug de honestidad** (el valor del
gate): la dirección del efecto decía "asociación positiva con el objetivo" — ambiguo/invertido
cuando la clase positiva es la minoritaria (en marketing es «0» = no convirtió). Correcciones:

1. El microcopy nombra la clase real: "▲ a mayor valor, más probable «0»" (la etiqueta de clase
   NUNCA entra al payload de narración — solo en UI local; las plantillas dicen "la clase
   positiva" genérico).
2. El ruido ya no lleva flecha: umbral estadístico `max(0.05, 2/√n)` (banda nula ~95%) ⇒
   "sin dirección clara" (con 50 filas de test, r nulo fluctúa hasta ~0.28 — un 0.05 fijo vestía
   ruido de señal). ADR-004 actualizado.
3. Fricción de infraestructura detectada de paso: el runner sirve `public/pyodide/pipeline.py`
   (copiado en predev) — editar `src/lib/ds/pipeline.py` con el dev server corriendo NO se
   refleja hasta re-correr `copy-pyodide.mjs`.

**Gate FINAL: APROBADO por el usuario** (2026-07-09) sobre galería de capturas de la app real
(Artifact: desktop/móvil × claro/oscuro × verificada/plantilla/fuga), respuesta "Aprobado —
cierra el sprint", sin ajustes.

## Fase 4 — Calidad / cierre

- `/deploy-check`: **10/10 pasa** (detalle en el summary), decisión **MERGE OK**. Checklist
  `ia-embebida` completo: Zod en toda salida LLM ✓ · guardrails input/output (`strict()`,
  vocabulario cerrado, rate limit, kill-switch) ✓ · circuit breaker → plantilla ✓ · mock en CI ✓
  · ≤2 llamadas + tokens acotados ✓ · nada del LLM persistido ✓ · costo loggeado (Pino) ✓.
- `sprints/SPRINT_002-summary.md` generado. PR abierto; checklist de aprovisionamiento re-emitido
  (GROQ_API_KEY → .env.local + Vercel).

**Fase 4 CERRADA. Sprint 002 listo para merge.**

> **Nota de secuencia:** el usuario mergeó el PR #3 minutos antes de que aterrizara el commit de
> esta validación → el fix va en el **PR #4** (follow-up de 1 commit, misma rama). Producción
> entre ambos merges no se rompe: sin el fix, la narración cae a plantilla (fallback honesto).

### Post-PR — Validación con Groq REAL (la key del usuario) — 5 hallazgos, todos resueltos

El usuario aprovisionó la key y el primer request real devolvió `provider-error`. La validación
end-to-end (curl al route con payload realista) destapó una cadena de 5 problemas que el mock,
por diseño, no podía ver — todos corregidos y documentados en el **amendment del ADR-005**:

1. **Groq no soporta `json_schema` en los llama-3.x** (solo `json_object`); `generateObject` lo
   exige ⇒ modelos cambiados a `openai/gpt-oss-120b` (soporta structured outputs y es más barato).
2. **gpt-oss razona antes de responder:** 400 tokens de salida se iban en razonamiento ⇒
   `reasoningEffort: "low"` + presupuestos 1500/600 (siguen acotados).
3. **Acentos del español vs matching literal:** "la región" no respaldaba el claim `region` ⇒
   `mentions()` insensible a diacríticos (+ test unit).
4. **Honestidad semántica de la dirección:** el modelo escribió "reduce la probabilidad de
   conversión" sin poder saber cuál es la clase positiva (no se la enviamos, ADR-006) ⇒ el prompt
   prohíbe frasear direcciones como desenlaces reales; solo "asociación positiva/negativa".
5. **Varianza del Grader:** el 20b puntuaba 3/4/5 la misma narrativa buena (fallbacks arbitrarios)
   ⇒ 120b para ambos roles (estable 5/5/5) + rúbrica explícita en el prompt del Grader + el
   Narrator ahora exige cobertura completa (veredicto + cifras + top variables + aviso de fuga).

**Resultado final: 5/5 narraciones reales verificadas** contra el route local con la key del
usuario (~1.5K tokens ≈ US$0.0005 por narración). Lección de método: el mock prueba el circuito,
pero **el contrato del proveedor real solo se valida contra el proveedor real** — hacerlo ANTES
del merge evitó descubrirlo en producción.

### Post-PR — Hallazgo de UX del usuario probando la preview real (resuelto)

El usuario activó "Narrar con IA" en una preview sin el fix del proveedor y reportó: _"lo activo y
no pasa nada"_. Tenía razón dos veces:

1. **El fallback era mudo:** la app intentaba narrar, fallaba y caía a la plantilla sin decir POR
   QUÉ — el toggle parecía muerto. Ahora la plantilla lleva un aviso ⚠ honesto con el motivo en 3
   cubetas: no configurado en este despliegue · el proveedor no respondió · la narración no pasó
   la verificación (ES/EN).
2. **No había reintento:** la respuesta quedaba memorizada por payload y re-activar el toggle no
   volvía a intentar. Ahora `useNarration` expone `retryNarration()` y re-activar el consentimiento
   reintenta (iniciado por el usuario, protegido por el rate limit — sigue sin haber retries
   automáticos).

- Test unit del reintento + 2 tests del aviso (con fallo ⇒ visible; sin consentimiento ⇒ no hay
  aviso porque no hubo intento). Manual actualizado. **124 unit · 6 e2e verdes.**
- Lección de método: "nunca sección vacía" no basta — el fallback debe **contar que lo es y por
  qué**, o la feature parece rota justo cuando está siendo honesta.

### Post-PR — Lighthouse rojo por 48 bytes (resuelto)

El primer CI del PR #3 falló SOLO en lighthouse: presupuesto de script de la landing 300 KB,
medido 307 248 (48 bytes de exceso, determinista en las 3 corridas). Causa: `useNarration`
importaba el schema Zod en runtime ⇒ **zod entró al bundle del cliente** (hasta S2 era solo
server). Fix honesto (no renegociar el budget): type-guard defensivo sin zod en el cliente —
el guardián Zod sigue siendo el route. Lección para el patrón ia-embebida: en el cliente,
importar de `schemas.ts` SOLO con `import type`.
