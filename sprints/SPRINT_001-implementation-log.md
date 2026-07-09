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

- _(pendiente: spike Pyodide → engines puros → pipeline anti-fuga → csv/perfilado → datasets)_
