# Bitácora de implementación — Sprint 002: El porqué, contado honesto

> App: **Probeta DS** (ds) · Branch: `sprint-002/porque-honesto` · Abierta: 2026-07-09
> Documento **vivo** (escritor único: este repo). La planeadora lo lee para la retrospectiva.
> Español en la bitácora; inglés en código/commits/ADRs.

## Estado por fase

- [ ] **Fase 0 — Setup** (branch · bitácora · `.env.example` · verificación de supuestos del kit)
- [x] Fase 1a — Spike explicabilidad (¿`shap` en Pyodide?) → ADR + `pipeline.py` + integración
- [ ] Fase 1b — Motores TS (payload de narración · verificador · plantillas · model card)
- [ ] Fase 1c — Adapter IA (`lib/ia/`) + route `/api/narrate` + ADRs proveedor/privacidad
- [ ] Fase 2 — UI ("¿Por qué?" · consentimiento · model card) + i18n + tests de componentes
- [ ] Fase 3 — e2e (happy + fallback) + observabilidad server-side + manual
- [ ] Fase 4 — Calidad / cierre (`/deploy-check` + summary + PR)

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
