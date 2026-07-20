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

### F0 — Setup + deltas + supuestos — EN CURSO
