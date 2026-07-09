# Bitácora de implementación — Sprint 001: El veredicto honesto

> App: **Probeta DS** (ds) · Branch: `sprint-001/veredicto-honesto` · Abierta: 2026-07-08
> Documento **vivo** (escritor único: este repo). La planeadora lo lee para la retrospectiva.
> Español en la bitácora; inglés en código/commits/ADRs.

## Estado por fase

- [x] **Fase 0 — Setup**
- [ ] Fase 1 — Motor/núcleo (spike Pyodide + engines puros + pipeline anti-fuga)
- [ ] Fase 2 — UI (design-system.md + 5 pantallas)
- [ ] Fase 3 — Integración + e2e + observabilidad (Sentry)
- [ ] Fase 4 — Calidad / cierre (/deploy-check + summary)

## Verificación de supuestos del kit v1.2.0 (fricciones K#)

| #   | Hallazgo                                                                                    | Estado                                        |
| --- | ------------------------------------------------------------------------------------------- | --------------------------------------------- |
| K1  | `layout.tsx`/`page.tsx` con boilerplate "Create Next App" (metadata genérica, `lang="en"`)  | ✅ resuelto en Fase 0                         |
| K2  | shadcn/ui NO instalado pese a estar en el stack                                             | ⏳ diferido a Fase 2 (con `design-system.md`) |
| K3  | i18n NO cableado pese a "bilingüe día 1"                                                    | ✅ resuelto en Fase 0 (diccionario ligero)    |
| K4  | Sentry NO instalado pese a la DoD de observabilidad                                         | ⏳ Fase 3 (DSN ya provisto por el usuario)    |
| K5  | `lighthouse-urls.json` solo mide `/` — correcto: Pyodide no debe estar en el LCP            | ✅ mantenido a propósito                      |
| K6  | coverage 70% global; el CLAUDE.md exige **>80%** en `engine/`                               | ⏳ Fase 1 (al escribir los primeros tests)    |
| K7  | el script `test` no pasa `--coverage` → los umbrales de `vitest.config` no se aplican en CI | ⏳ Fase 1                                     |

## Desviación del plan

- **D1** — La orden y `SPRINT_001.md` dicen "Next.js 15"; el kit estampó **Next 16.2.10**. Sin acción; solo registro. (Avisado al usuario.)
- **D2** — La orden nombra 2 ADRs (Pyodide · anti-fuga). El CLAUDE.md además pide **ADR de i18n** → serán **3 ADRs**. Aprobado por el usuario al elegir el enfoque de i18n (diccionario ligero propio).
- **Ajuste de secuencia (no cambia alcance):** el `pnpm add pyodide` se movió al spike de Fase 1 y el init de shadcn/ui a Fase 2, para mantener Fase 0 como scaffolding determinista sin dependencias de red. Todas las tareas del `SPRINT_001.md` se cumplen íntegras.

## Log

### Fase 0 — Setup (2026-07-08) ✅

- Branch `sprint-001/veredicto-honesto` creado. DSN de Sentry en `.env.local` (gitignored) + `.env.example` commiteado.
- **i18n ligero ES/EN**: `messages/{es,en}.json` + `src/i18n/{config,dictionaries,provider,use-translation}` con `useSyncExternalStore` (SSR-safe, sin hidratación inconsistente).
- Boilerplate limpio (metadata Probeta DS); **landing placeholder estática** (candidato LCP) con toggle de idioma accesible (`aria-pressed`, táctil ≥44px).
- Estructura `src/{engine,lib/ds,workers,components}`, `decisions/`, `public/datasets/` con `.gitkeep` autodocumentados.
- `scripts/copy-pyodide.mjs` (self-host de Pyodide) + hooks `prebuild`/`predev` — **no-op guardado** hasta instalar `pyodide` en Fase 1.
- `.gitignore`: `public/pyodide/` (assets generados en build).
- **Bug resuelto:** el provider i18n disparaba la regla `react-hooks/set-state-in-effect` (leer localStorage con `setState` en `useEffect`) → migrado a `useSyncExternalStore`.
- Gates verdes: `typecheck` · `lint` · `build` (`/` estático) · `test`.
- Commit: `7ea2454`.

### Fase 1 — Motor/núcleo (en curso)

**Spike Pyodide (riesgo #1 de la orden) — ✅ de-riskeado.** `pyodide@314.0.2` instalado (devDep).
En Node: pyodide cargó en ~1.3 s; `pandas`+`scikit-learn` en ~4.2 s; humo de `RandomForest` OK.
Versiones WASM confirmadas: python=3.14.2 · numpy=2.4.3 · scipy=1.18.0 · pandas=3.0.2 · sklearn=1.8.0.
El paquete npm trae **solo el runtime core** (sin wheels) → self-hostear exige que `copy-pyodide.mjs`
**descargue** las wheels (pandas, numpy, scipy, scikit_learn, joblib, threadpoolctl, python_dateutil,
pytz, six) además de copiar el core. Se refina en el ADR del motor de cómputo.

**Motores puros (TS) + tests — ✅ completos.**

- `engine/split.ts` — split estratificado, seeded (mulberry32), determinista. Devuelve índices; el
  preprocesamiento se ajustará SOLO sobre `trainIdx`. Cobertura 100/100/100.
- `engine/verdict.ts` — veredicto estructurado (beats/ties/loses) con margen de empate honesto
  (`TIE_EPSILON`); selección de métrica primaria (AUC si desbalanceado, F1 si balanceado) y mejor
  baseline. El texto franco bilingüe lo arma la UI vía i18n. Cobertura 100/90/100.
- `engine/leakage.ts` — heurística de fuga: AUC univariada por rangos (numéricas) + pureza de
  categoría (categóricas), agnóstica a la dirección, ignora nulos. Cobertura 98.6/97/87.5.
- `tests/unit/i18n-parity.test.ts` — paridad de claves es/en.
- **35 tests verdes**; umbral engine >80% cumplido (todos ≥87.5%).

**Bugs propios encontrados y resueltos (en los tests, no en los motores):**

- Test de veredicto frágil a punto flotante (`0.5 + TIE_EPSILON` ≠ `0.01` exacto) → reescrito con
  un delta claramente dentro del margen.
- Fixture de leakage "limpio" era en realidad un separador inverso perfecto → reemplazado por uno
  con relación débil real.

**Fricción de config (K8):** la cobertura v8 intentaba parsear los `.gitkeep` como JS (el `include`
del kit era `src/lib/**`, no `*.ts`) → `PARSE_ERROR`. Corregido a `src/lib/**/*.ts` +
`src/engine/**/*.ts`. Además K7 resuelto: el script `test` ahora pasa `--coverage`.

_(pendiente: pipeline anti-fuga `.py` → csv/perfilado + worker → datasets → test de integración fit-solo-en-train)_
